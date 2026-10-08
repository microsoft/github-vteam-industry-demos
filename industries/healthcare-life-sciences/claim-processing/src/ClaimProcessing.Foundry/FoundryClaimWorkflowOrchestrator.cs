using System.Diagnostics;
using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Azure.Core;
using ClaimProcessing.Core.Interfaces;
using ClaimProcessing.Core.Models;
using Microsoft.Extensions.Logging;

namespace ClaimProcessing.Foundry;

/// <summary>
/// Live implementation of <see cref="IClaimWorkflowOrchestrator"/> that runs the
/// Microsoft AI Foundry <c>claim-orchestrator</c> assistant. The orchestrator
/// delegates to three connected specialist agents (intake, fraud-risk,
/// claim-assessor) and can consult the Microsoft Learn MCP server, then returns
/// a single synthesized JSON recommendation.
///
/// This talks to the classic Assistants data-plane (thread → message → run →
/// poll → steps → reply) using the preview API version required for
/// connected-agent tooling, and passes <c>tool_resources.mcp</c> with
/// <c>require_approval=never</c> so MCP calls don't pause the run.
///
/// Advisory only — the deterministic PolicyEngine remains authoritative.
/// </summary>
public sealed class FoundryClaimWorkflowOrchestrator : IClaimWorkflowOrchestrator
{
    private readonly HttpClient _http;
    private readonly TokenCredential _credential;
    private readonly FoundryOptions _options;
    private readonly ILogger<FoundryClaimWorkflowOrchestrator> _logger;
    private readonly string _baseUrl;
    private readonly string[] _tokenScopes;

    public FoundryClaimWorkflowOrchestrator(
        HttpClient http,
        TokenCredential credential,
        FoundryOptions options,
        ILogger<FoundryClaimWorkflowOrchestrator> logger)
    {
        _http = http;
        _credential = credential;
        _options = options;
        _logger = logger;
        _baseUrl = _options.GetAgentApiBaseUrl();
        _tokenScopes = [_options.GetTokenScope()];
    }

    public bool IsLive =>
        (!string.IsNullOrWhiteSpace(_options.Endpoint) ||
         !string.IsNullOrWhiteSpace(_options.GatewayEndpoint)) &&
        !string.IsNullOrWhiteSpace(_options.OrchestratorAgentId);

    public async Task<WorkflowRunResult> RunAsync(Claim claim, Policy? policy, CancellationToken cancellationToken = default)
    {
        var sw = Stopwatch.StartNew();
        var steps = new List<WorkflowStep>();

        var claimJson = JsonSerializer.Serialize(new
        {
            claim.PolicyNumber,
            claim.ClaimantName,
            claim.ClaimAmount,
            IncidentDate = claim.IncidentDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            claim.Description,
            SubmittedAt = claim.SubmittedAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        });
        var policyJson = policy is null
            ? "null"
            : JsonSerializer.Serialize(new
            {
                policy.PolicyNumber,
                policy.HolderName,
                policy.MaxCoverageAmount,
                policy.DeductibleAmount,
                policy.CoverageType,
                policy.IsActive,
                ValidFrom = policy.ValidFrom.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                ValidTo = policy.ValidTo.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            });

        var userMessage =
            "Process this insurance claim end-to-end using your specialist agents, then return the final JSON.\n\n" +
            "CLAIM:\n" + claimJson + "\n\nPOLICY:\n" + policyJson;

        var token = await _credential.GetTokenAsync(new TokenRequestContext(_tokenScopes), cancellationToken);
        string? threadId = null;

        try
        {
            using var threadResp = await SendAsync(HttpMethod.Post, "threads", token.Token, null, cancellationToken);
            threadId = (await ReadJsonAsync(threadResp)).GetProperty("id").GetString()
                ?? throw new InvalidOperationException("Foundry did not return a thread id.");

            using (await SendAsync(HttpMethod.Post, $"threads/{threadId}/messages", token.Token,
                new { role = "user", content = userMessage }, cancellationToken)) { }
            // Start the run. tool_resources.mcp disables MCP approval prompts so the run
            // doesn't pause in requires_action for the public Microsoft Learn server.
            var runBody = new
            {
                assistant_id = _options.OrchestratorAgentId,
                tool_resources = new
                {
                    mcp = new[]
                    {
                        new { server_label = _options.McpServerLabel, require_approval = "never" }
                    }
                }
            };
            using var runResp = await SendAsync(HttpMethod.Post, $"threads/{threadId}/runs", token.Token, runBody, cancellationToken);
            var runId = (await ReadJsonAsync(runResp)).GetProperty("id").GetString()
                ?? throw new InvalidOperationException("Foundry did not return a run id.");

            var status = await PollRunAsync(threadId, runId, token.Token, cancellationToken);
            if (status != "completed")
            {
                sw.Stop();
                return new WorkflowRunResult(false, string.Empty, null, steps,
                    $"Orchestrator run ended with status '{status}'.", sw.Elapsed);
            }

            // Read the run steps to learn which connected agents / tools were called.
            steps.AddRange(await ReadStepsAsync(threadId, runId, token.Token, cancellationToken));

            using var msgResp = await SendAsync(HttpMethod.Get, $"threads/{threadId}/messages", token.Token, null, cancellationToken);
            var reply = ReadAssistantText(await ReadJsonAsync(msgResp));
            var finalJson = ExtractJsonObject(reply);

            sw.Stop();
            return new WorkflowRunResult(true, reply, finalJson, steps, null, sw.Elapsed);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Foundry orchestrator run failed.");
            sw.Stop();
            return new WorkflowRunResult(false, string.Empty, null, steps, ex.Message, sw.Elapsed);
        }
        finally
        {
            if (threadId is not null)
            {
                try
                {
                    using (await SendAsync(HttpMethod.Delete, $"threads/{threadId}", token.Token, null, cancellationToken)) { }
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Failed to delete Foundry thread {ThreadId}.", threadId);
                }
            }
        }
    }

    private async Task<string> PollRunAsync(string threadId, string runId, string token, CancellationToken ct)
    {
        var terminal = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { "completed", "failed", "cancelled", "expired", "requires_action" };

        for (var attempt = 0; attempt < 120; attempt++)
        {
            ct.ThrowIfCancellationRequested();
            using var resp = await SendAsync(HttpMethod.Get, $"threads/{threadId}/runs/{runId}", token, null, ct);
            var status = (await ReadJsonAsync(resp)).GetProperty("status").GetString() ?? "unknown";
            if (terminal.Contains(status))
                return status.ToLowerInvariant();

            await Task.Delay(TimeSpan.FromSeconds(1), ct);
        }
        return "timeout";
    }

    // Reads /steps and maps each tool_call to a WorkflowStep for visualization.
    private async Task<List<WorkflowStep>> ReadStepsAsync(string threadId, string runId, string token, CancellationToken ct)
    {
        var result = new List<WorkflowStep>();
        try
        {
            using var resp = await SendAsync(HttpMethod.Get, $"threads/{threadId}/runs/{runId}/steps", token, null, ct);
            var root = await ReadJsonAsync(resp);
            if (!root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
                return result;

            // Steps are newest-first; reverse for chronological order.
            var ordered = data.EnumerateArray().Reverse();
            foreach (var step in ordered)
            {
                if (!step.TryGetProperty("step_details", out var details)) continue;
                if (!details.TryGetProperty("tool_calls", out var calls) || calls.ValueKind != JsonValueKind.Array) continue;

                foreach (var call in calls.EnumerateArray())
                {
                    var type = call.TryGetProperty("type", out var t) ? t.GetString() : null;

                    if (type == "connected_agent" && call.TryGetProperty("connected_agent", out var ca))
                    {
                        var name = ca.TryGetProperty("name", out var n) ? n.GetString() : "agent";
                        result.Add(new WorkflowStep(name ?? "agent", "connected_agent",
                            $"Delegated to the {Prettify(name)} specialist agent."));
                    }
                    else if (type == "mcp")
                    {
                        var label = call.TryGetProperty("mcp", out var m) && m.TryGetProperty("server_label", out var sl)
                            ? sl.GetString()
                            : _options.McpServerLabel;
                        result.Add(new WorkflowStep(label ?? "mcp", "mcp",
                            "Consulted the Microsoft Learn documentation (MCP)."));
                    }
                    else if (type is not null)
                    {
                        result.Add(new WorkflowStep(type, "tool", $"Invoked the {type} tool."));
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to read run steps for run {RunId}.", runId);
        }
        return result;
    }

    private static string Prettify(string? name) => name switch
    {
        "intake" => "intake",
        "fraud_risk" => "fraud & risk",
        "claim_assessor" => "policy assessor",
        null => "specialist",
        _ => name.Replace('_', ' '),
    };

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, string token, object? content, CancellationToken ct)
    {
        var url = $"{_baseUrl}/{path}?api-version={_options.OrchestratorApiVersion}";
        using var request = new HttpRequestMessage(method, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (content is not null)
            request.Content = JsonContent.Create(content);

        var response = await _http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            response.Dispose();
            throw new HttpRequestException($"Foundry API {method} {path} returned {(int)response.StatusCode}: {body}");
        }
        return response;
    }

    private static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response)
    {
        var stream = await response.Content.ReadAsStreamAsync();
        using var doc = await JsonDocument.ParseAsync(stream);
        return doc.RootElement.Clone();
    }

    private static string ReadAssistantText(JsonElement messages)
    {
        if (!messages.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
            return string.Empty;

        foreach (var msg in data.EnumerateArray())
        {
            if (msg.TryGetProperty("role", out var role) &&
                string.Equals(role.GetString(), "assistant", StringComparison.OrdinalIgnoreCase) &&
                msg.TryGetProperty("content", out var content) &&
                content.ValueKind == JsonValueKind.Array)
            {
                foreach (var block in content.EnumerateArray())
                {
                    if (block.TryGetProperty("text", out var text) &&
                        text.TryGetProperty("value", out var value) &&
                        value.ValueKind == JsonValueKind.String)
                    {
                        return value.GetString() ?? string.Empty;
                    }
                }
            }
        }
        return string.Empty;
    }

    private static string? ExtractJsonObject(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        int start = text.IndexOf('{');
        int end = text.LastIndexOf('}');
        return start >= 0 && end > start ? text.Substring(start, end - start + 1) : null;
    }
}
