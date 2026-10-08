# ClaimProcessing.Foundry

> **Switch owns this module.** AI / Microsoft AI Foundry integration for claim extraction and decision recommendation.

## What lives here

| File | Purpose |
|---|---|
| `MockFoundryClaimAgent.cs` | Local mock — no credentials, deterministic, runs everywhere |
| `AzureFoundryClaimAgent.cs` | **Live** Azure AI Foundry agent (REST: thread → message → run → poll → reply) |
| `FoundryOptions.cs` | Config POCO bound from `appsettings.json` section `"Foundry"` |

> **Status: LIVE.** `AzureFoundryClaimAgent` is fully implemented and wired.
> `Program.cs` auto-selects it whenever `Foundry:Endpoint` **and** `Foundry:AgentId`
> are configured (they are injected into the Container App), otherwise it falls
> back to the mock so local dev needs no Azure credentials.

---

## MockFoundryClaimAgent behaviour

### `ExtractClaimFieldsAsync`

- **JSON documents** (`application/json` or bytes that begin with `{`/`[`): deserialised with
  `System.Text.Json`. Extracts `claimantName`, `amount`, `incidentDate`, `description` from
  common field name variants (case-insensitive). Supports a top-level `claim` wrapper object.
  Emits `Warnings` for each missing or ambiguous field, and for future dates.
- **PDF / binary / unknown** content types: returns all fields as `null` with a `[MOCK]` warning
  explaining that real extraction requires Azure AI Foundry.

Accepted JSON shape (flexible — any of the aliases work):

```json
{
  "claimantName": "Jane Smith",
  "amount": 4500.00,
  "incidentDate": "2026-03-15",
  "description": "Water damage to kitchen ceiling"
}
```

### `RecommendDecisionAsync`

Multi-factor heuristic (no network calls):

| Factor | Outcome |
|---|---|
| Policy inactive | `Reject` (0.97) |
| Incident outside policy validity | `Reject` (0.95) |
| Claim amount ≤ 0 | `Review` (0.55) |
| Amount > MaxCoverageAmount | `Reject` (0.90) |
| Net amount (after deductible) ≤ 0 | `Reject` (0.85) |
| Coverage ratio ≤ 30 % | `Approve` (0.90) |
| Coverage ratio ≤ 60 % | `Approve` (0.80) |
| Coverage ratio ≤ 85 % | `Review` (0.62) |
| Coverage ratio > 85 % | `Review` (0.50) |
| Late submission (> 365 days) | confidence −0.08 / escalates to `Review` |

Rationale is always prefixed `[MOCK AI]` and ends with:
> "Note: this is an AI-style advisory signal only. The deterministic PolicyEngine is the authoritative decision-maker."

---

## Mock ↔ Azure AI Foundry selection (implemented)

`AzureFoundryClaimAgent` is **already implemented** and registered. `Program.cs`
selects it automatically:

```csharp
var foundryOptions = builder.Configuration
    .GetSection(FoundryOptions.SectionName).Get<FoundryOptions>() ?? new FoundryOptions();
builder.Services.AddSingleton(foundryOptions);

if (!string.IsNullOrWhiteSpace(foundryOptions.Endpoint) &&
    !string.IsNullOrWhiteSpace(foundryOptions.AgentId))
{
    builder.Services.AddSingleton<TokenCredential>(new DefaultAzureCredential());
    builder.Services.AddHttpClient<IFoundryClaimAgent, AzureFoundryClaimAgent>();
}
else
{
    builder.Services.AddScoped<IFoundryClaimAgent, MockFoundryClaimAgent>();
}
```

### How the live agent works

It calls the Foundry Agents data-plane REST API directly (no preview SDK needed):

1. `POST {endpoint}/threads` — create a thread
2. `POST {endpoint}/threads/{id}/messages` — post the prompt (`role: user`)
3. `POST {endpoint}/threads/{id}/runs` — run the configured agent (`assistant_id`)
4. poll `GET {endpoint}/threads/{id}/runs/{runId}` until a terminal status
5. `GET {endpoint}/threads/{id}/messages` — read the assistant reply
   (`.content[0].text.value`)
6. `DELETE {endpoint}/threads/{id}` — best-effort cleanup

All calls carry a bearer token from `DefaultAzureCredential` (scope
`https://ai.azure.com/.default`) and the `api-version` query param from
`FoundryOptions.ApiVersion` (`2025-05-01`). Responses are advisory only — any
failure degrades to a low-confidence `Review`, never dropping the claim.

### Config (injected into the Container App by IaC)

| Key | Description | Default |
|---|---|---|
| `Foundry:Endpoint` | Project endpoint URI (`.../api/projects/<project>`) | *(required)* |
| `Foundry:AgentId` | Agent/assistant ID (e.g. `asst_...`) | *(required)* |
| `Foundry:ModelName` | Model deployment name | `gpt-5-mini` |
| `Foundry:ApiVersion` | Agents data-plane API version | `2025-05-01` |
| `Foundry:GatewayEndpoint` | Optional APIM API URL ending at the imported Foundry API base path | *(empty)* |
| `Foundry:GatewayTokenScope` | Entra audience or `/.default` scope exposed for the APIM API | *(required with gateway)* |

### Credentials

| Environment | Credential used |
|---|---|
| Azure (Container Apps) | User-assigned managed identity (via `AZURE_CLIENT_ID`) — needs **Azure AI Developer** + **Cognitive Services User** on the Foundry account |
| Local / CI | `az login` or VS/VS Code credential |

No secrets in config or source code.

### APIM AI gateway mode

When `GatewayEndpoint` is configured, the agent client changes its request root from
the Foundry project endpoint to:

```text
{GatewayEndpoint}/openai
```

It requests a token for `GatewayTokenScope` instead of the Foundry data-plane scope.
The APIM API should validate the Container App managed identity and app role, while
the APIM backend uses its own managed identity to authenticate to Foundry.
