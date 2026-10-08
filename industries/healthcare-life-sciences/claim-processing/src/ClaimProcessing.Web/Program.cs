using Azure.Core;
using Azure.Identity;
using ClaimProcessing.Core.Interfaces;
using ClaimProcessing.Foundry;
using ClaimProcessing.PolicyEngine;
using ClaimProcessing.Web.Components;
using ClaimProcessing.Web.Endpoints;
using ClaimProcessing.Web.Infrastructure;
using ClaimProcessing.Web.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

// Domain repositories & services
builder.Services.AddSingleton<IClaimsRepository, InMemoryClaimsRepository>();
builder.Services.AddScoped<IPolicyEngine, PolicyEvaluator>();
builder.Services.AddScoped<ClaimsService>();

// Foundry agent — uses the LIVE Microsoft AI Foundry agent when a direct Foundry
// endpoint or APIM gateway endpoint and Foundry:AgentId are configured; otherwise
// it falls back to the local deterministic mock (no Azure creds required).
var foundryOptions = builder.Configuration
    .GetSection(FoundryOptions.SectionName).Get<FoundryOptions>() ?? new FoundryOptions();
builder.Services.AddSingleton(foundryOptions);

if ((!string.IsNullOrWhiteSpace(foundryOptions.Endpoint) ||
     !string.IsNullOrWhiteSpace(foundryOptions.GatewayEndpoint)) &&
    !string.IsNullOrWhiteSpace(foundryOptions.AgentId))
{
    // DefaultAzureCredential picks the user-assigned managed identity via AZURE_CLIENT_ID
    // in Azure, or `az login` locally. No secrets.
    builder.Services.AddSingleton<TokenCredential>(new DefaultAzureCredential());
    builder.Services.AddHttpClient<IFoundryClaimAgent, AzureFoundryClaimAgent>();
}
else
{
    builder.Services.AddScoped<IFoundryClaimAgent, MockFoundryClaimAgent>();
}

// Multi-agent orchestrator (Agentic Workflow page). Uses the LIVE Foundry
// claim-orchestrator (connected agents + Microsoft Learn MCP) when
// Foundry:OrchestratorAgentId is configured, otherwise a local simulation.
if (!string.IsNullOrWhiteSpace(foundryOptions.Endpoint) &&
    !string.IsNullOrWhiteSpace(foundryOptions.OrchestratorAgentId))
{
    builder.Services.AddSingleton<TokenCredential>(new DefaultAzureCredential());
    builder.Services.AddHttpClient<IClaimWorkflowOrchestrator, FoundryClaimWorkflowOrchestrator>();
}
else
{
    builder.Services.AddScoped<IClaimWorkflowOrchestrator, MockClaimWorkflowOrchestrator>();
}

var app = builder.Build();

if (!app.Environment.IsDevelopment())
    app.UseExceptionHandler("/Error", createScopeForErrors: true);

app.UseAntiforgery();

// Seed sample policies into the in-memory store
using (var scope = app.Services.CreateScope())
{
    var repo = scope.ServiceProvider.GetRequiredService<IClaimsRepository>();
    await repo.SeedPoliciesAsync();
}

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

// Minimal API endpoints
app.MapClaimsEndpoints();
app.MapPoliciesEndpoints();
app.MapWorkflowEndpoints();

app.Run();
