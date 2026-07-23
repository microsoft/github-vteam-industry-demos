namespace ClaimProcessing.Foundry;

/// <summary>
/// Configuration options for Azure AI Foundry integration.
/// Bind from appsettings.json / environment variables / Key Vault under the "Foundry" section.
///
/// Example appsettings.Production.json:
/// <code>
/// {
///   "Foundry": {
///     "Endpoint":    "https://&lt;your-project&gt;.services.ai.azure.com/",
///     "AgentId":     "&lt;your-agent-id&gt;",
///     "ModelName":   "gpt-4o",
///     "MaxTokens":   2048,
///     "Temperature": 0.2
///   }
/// }
/// </code>
///
/// Credentials are resolved via DefaultAzureCredential (managed identity in Azure,
/// az login / VS / VS Code credential locally). No API key is stored in config.
/// </summary>
public sealed class FoundryOptions
{
    public const string SectionName = "Foundry";

    /// <summary>Azure AI Foundry project endpoint URI.</summary>
    public string Endpoint { get; set; } = string.Empty;

    /// <summary>Deployed agent or assistant ID created in AI Foundry Studio.</summary>
    public string AgentId { get; set; } = string.Empty;

    /// <summary>Model deployment name (e.g. "gpt-5-mini").</summary>
    public string ModelName { get; set; } = "gpt-5-mini";

    /// <summary>Foundry Agents data-plane API version.</summary>
    public string ApiVersion { get; set; } = "2025-05-01";

    /// <summary>
    /// Multi-agent orchestrator assistant ID (the <c>claim-orchestrator</c> that
    /// delegates to intake / fraud-risk / claim-assessor and the Microsoft Learn MCP).
    /// When empty, the Agentic Workflow page falls back to a local simulation.
    /// </summary>
    public string OrchestratorAgentId { get; set; } = string.Empty;

    /// <summary>
    /// API version used for orchestrator runs. Connected-agent tooling requires
    /// the preview surface (<c>2025-05-15-preview</c>).
    /// </summary>
    public string OrchestratorApiVersion { get; set; } = "2025-05-15-preview";

    /// <summary>MCP server label attached to the orchestrator (for run-time approval config).</summary>
    public string McpServerLabel { get; set; } = "microsoft_learn";

    /// <summary>MCP server URL attached to the orchestrator.</summary>
    public string McpServerUrl { get; set; } = "https://learn.microsoft.com/api/mcp";

    /// <summary>Max completion tokens per request.</summary>
    public int MaxTokens { get; set; } = 2048;

    /// <summary>Sampling temperature (lower = more deterministic).</summary>
    public double Temperature { get; set; } = 0.2;
}
