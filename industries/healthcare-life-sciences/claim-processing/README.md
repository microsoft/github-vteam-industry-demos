# ClaimPortal — Claim Processing Web Portal

A runnable local MVP of a claim-processing web portal built with .NET 9 Blazor Server.
**No Azure credentials required** to run locally.

---

## 🚀 Run Locally

```bash
dotnet run --project src/ClaimProcessing.Web
```

**URL:** http://localhost:5010

That's it. A single command, no cloud credentials, no Docker required.

---

## What You'll See

| Page | URL | Description |
|---|---|---|
| Home | `/` | Portal overview and quick links |
| Submit Claim | `/upload` | Upload form with file attachment support |
| Decision Audit | `/decisions` | All processed claims with approve/reject outcomes |

### Sample Policies (seeded at startup)

| Policy | Holder | Coverage | Status |
|---|---|---|---|
| POL-001 | Alice Johnson | $50,000 Comprehensive | ✅ Active |
| POL-002 | Bob Smith | $25,000 Basic | ❌ Inactive + Expired (rejection demo) |
| POL-003 | Carol Williams | $100,000 Premium | ✅ Active |

---

## Solution Structure

```
ClaimProcessing.sln
├── src/
│   ├── ClaimProcessing.Core/           # Domain models + interfaces
│   ├── ClaimProcessing.PolicyEngine/   # Deterministic policy evaluation
│   ├── ClaimProcessing.Foundry/        # AI Foundry interface + local mock
│   └── ClaimProcessing.Web/            # Blazor portal + Minimal API
└── tests/
    └── ClaimProcessing.Tests/          # xUnit policy engine tests
```

---

## Build

```bash
dotnet build
```

## Test

```bash
dotnet test
```

---

## APIM AI Gateway Demo

The claim form demonstrates this request path:

```text
Browser → POST /api/claims → ClaimProcessing backend
        → APIM AI gateway → Microsoft Foundry claim-assessor
        → deterministic PolicyEngine → browser response
```

The browser submits the claim through the public JSON API, making the UI request
visible in browser developer tools. The backend acquires a Microsoft Entra token
with its managed identity and sends the Foundry Threads/Runs calls through APIM.
APIM validates the application identity, then uses its own managed identity to
authenticate to Foundry.

Configure these settings in addition to the existing Foundry agent settings:

| Setting | Example |
|---|---|
| `Foundry__GatewayEndpoint` | `https://apim-erydrnupdated.azure-api.net/aif-4c5kuzbpd4uw6` |
| `Foundry__GatewayTokenScope` | `api://<apim-api-application-id>/.default` |

When `Foundry__GatewayEndpoint` is empty, the backend continues calling the Foundry
project endpoint directly.

## AI Foundry Swap-in

The `IFoundryClaimAgent` interface is implemented by `MockFoundryClaimAgent` locally.
To connect to Azure AI Foundry:

1. Fill in `appsettings.json` → `Foundry` section (or use Key Vault).
2. Implement `AzureFoundryClaimAgent : IFoundryClaimAgent` in `ClaimProcessing.Foundry/`.
3. In `Program.cs`, change:
   ```csharp
   builder.Services.AddScoped<IFoundryClaimAgent, MockFoundryClaimAgent>();
   // → 
   builder.Services.AddScoped<IFoundryClaimAgent, AzureFoundryClaimAgent>();
   ```

---

## Team

| Agent | Domain |
|---|---|
| **Dozer** | Policy engine rules + API endpoints |
| **Switch** | Azure AI Foundry integration |
| **Mouse** | Portal UI / UX polish |
| **Tank** | Azure IaC (Bicep/AZD) |
| **Ghost** | Tests + QA |
| **Seraph** | Security hardening |
| **Trinity** | Architecture + domain model |
