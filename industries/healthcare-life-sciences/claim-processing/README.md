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
