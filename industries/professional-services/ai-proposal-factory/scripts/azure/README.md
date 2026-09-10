# Azure deployment

The deployment uses one `azd` service (`app`), subscription-scoped Bicep, and
idempotent lifecycle hooks.

```powershell
az login
az account set --subscription "<subscription-id>"
azd auth login
azd env new <short-environment-name>
azd env set AZURE_SUBSCRIPTION_ID "<subscription-id>"
azd env set AZURE_LOCATION swedencentral
azd up
```

`preprovision.py` resolves the active user or service principal, configures the
deployment RBAC inputs, enforces Sweden Central, and checks model availability
and quota. `postprovision.py` seeds Storage/Search, creates or updates exactly
three agents, stores their IDs in the azd environment, and applies them to the
Container App before the application image is deployed.

The generated `deployment-output.json` file is local environment state and is
ignored by Git.

Optional inputs must be set before `azd up`:

- `AZURE_AI_SEARCH_SKU`: `basic` by default; `free` or `standard` supported.
- `AZURE_AI_MODEL_NAME`, `AZURE_AI_MODEL_VERSION`,
  `AZURE_AI_MODEL_DEPLOYMENT_SKU`, and `AZURE_AI_MODEL_CAPACITY`.
- `AIPF_STORAGE_SECURITY_CONTROL_IGNORE=true` only for an explicitly approved
  subscription policy that recognizes that exclusion tag.

All scripts authenticate with Microsoft Entra ID and use no resource keys.
