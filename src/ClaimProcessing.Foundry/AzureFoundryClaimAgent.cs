using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Azure.Core;
using ClaimProcessing.Core.Interfaces;
using ClaimProcessing.Core.Models;
using Microsoft.Extensions.Logging;

namespace ClaimProcessing.Foundry;

/// <summary>
/// Production implementation of <see cref="IFoundryClaimAgent"/> backed by a live
/// Microsoft AI Foundry agent (the <c>claim-assessor</c> assistant).
///
/// It talks to the Foundry Agents data-plane REST API directly (thread → message →
/// run → poll → read reply), authenticating with <see cref="TokenCredential"/>
/// (managed identity in Azure, <c>az login</c> locally) — no account keys.
///
/// The agent is <b>advisory only</b>: the deterministic PolicyEngine remains the
/// authoritative decision-maker, so any Foundry failure degrades to a low-confidence
/// "Review" rather than dropping the claim.
/// </summary>
public sealed class AzureFoundryClaimAgent : IFoundryClaimAgent
{
    // Entra ID scope for the Foundry data plane.
    private static readonly string[] TokenScopes = ["https://ai.azure.com/.default"];

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly HttpClient _http;
    private readonly TokenCredential _credential;
    private readonly FoundryOptions _options;
    private readonly ILogger<AzureFoundryClaimAgent> _logger;
    private readonly string _baseUrl;

    public AzureFoundryClaimAgent(
        HttpClient http,
        TokenCredential credential,
        FoundryOptions options,
        ILogger<AzureFoundryClaimAgent> logger)
    {
        _http = http;
        _credential = credential;
        _options = options;
        _logger = logger;

        if (string.IsNullOrWhiteSpace(_options.Endpoint))
            throw new InvalidOperationException("Foundry:Endpoint is not configured.");
        if (string.IsNullOrWhiteSpace(_options.AgentId))
            throw new InvalidOperationException("Foundry:AgentId is not configured.");

        _baseUrl = _options.Endpoint.TrimEnd('/');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ExtractClaimFieldsAsync
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<ExtractedClaimFields> ExtractClaimFieldsAsync(byte[] documentContent, string contentType)
    {
        // The claim-assessor agent is text-based, so decode the document to text.
        // Binary formats (e.g. PDF) can't be extracted without the file-search tool,
        // so we degrade gracefully with a warning rather than fail the upload.
        string documentText;
        try
        {
            documentText = Encoding.UTF8.GetString(documentContent);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to decode claim document as text.");
            return new ExtractedClaimFields(null, null, null, null,
            [
                $"Content-Type '{contentType}' could not be decoded as text. " +
                "Please enter the claim fields manually."
            ]);
        }

        var prompt =
            "Extract the following fields from this insurance claim document and return ONLY a JSON object " +
            "with exactly these keys: claimantName (string), amount (number), incidentDate (ISO-8601 date string), " +
            "description (string). Use null for any field you cannot determine. Do not include any prose.\n\n" +
            "CLAIM DOCUMENT:\n" + documentText;

        try
        {
            var reply = await RunAgentAsync(prompt);
            var json = ExtractJsonObject(reply);
            if (json is null)
                return new ExtractedClaimFields(null, null, null, null,
                    ["Foundry agent did not return structured JSON; please verify fields manually."]);

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            var warnings = new List<string>();
            string? name = GetString(root, "claimantName");
            decimal? amount = GetDecimal(root, "amount");
            DateTime? incidentDate = GetDate(root, "incidentDate");
            string? description = GetString(root, "description");

            if (name is null) warnings.Add("Foundry could not determine the claimant name — please verify.");
            if (amount is null) warnings.Add("Foundry could not determine the claim amount — please verify.");
            if (incidentDate is null) warnings.Add("Foundry could not determine the incident date — please verify.");

            return new ExtractedClaimFields(name, amount, incidentDate, description, warnings);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Foundry extraction call failed.");
            return new ExtractedClaimFields(null, null, null, null,
            [
                "Foundry agent call failed while extracting fields. " +
                "Please enter the claim fields manually."
            ]);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RecommendDecisionAsync
    // ─────────────────────────────────────────────────────────────────────────
    public async Task<FoundryRecommendation> RecommendDecisionAsync(Claim claim, Policy policy)
    {
        var claimJson = JsonSerializer.Serialize(new
        {
            claim.PolicyNumber,
            claim.ClaimantName,
            claim.ClaimAmount,
            IncidentDate = claim.IncidentDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            claim.Description,
            SubmittedAt = claim.SubmittedAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        });
        var policyJson = JsonSerializer.Serialize(new
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

        var prompt =
            "You are an insurance claim assessment assistant. Assess the CLAIM against the POLICY and return " +
            "ONLY a JSON object with exactly these keys: recommendation (one of \"Approve\", \"Reject\", \"Review\"), " +
            "confidenceScore (number between 0 and 1), rationale (a short human-readable explanation). " +
            "Your output is advisory only. Do not include any prose outside the JSON.\n\n" +
            "POLICY:\n" + policyJson + "\n\nCLAIM:\n" + claimJson;

        try
        {
            var reply = await RunAgentAsync(prompt);
            var json = ExtractJsonObject(reply);
            if (json is null)
            {
                _logger.LogWarning("Foundry recommendation did not contain JSON. Raw: {Reply}", reply);
                return new FoundryRecommendation("Review", 0.30m,
                    "[Foundry] Agent response could not be parsed as JSON — routing to manual review.");
            }

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            string recommendation = GetString(root, "recommendation") ?? "Review";
            recommendation = NormalizeRecommendation(recommendation);
            decimal confidence = Math.Clamp(GetDecimal(root, "confidenceScore") ?? 0.5m, 0m, 1m);
            string rationale = GetString(root, "rationale") ?? "No rationale provided.";

            return new FoundryRecommendation(recommendation, confidence, "[Foundry] " + rationale);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Foundry recommendation call failed.");
            // Never silently drop the claim — surface a low-confidence Review.
            return new FoundryRecommendation("Review", 0.20m,
                "[Foundry] Agent call failed; claim routed to manual review. " +
                "The deterministic PolicyEngine decision is authoritative.");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Agents REST flow: thread → message → run → poll → read reply
    // ─────────────────────────────────────────────────────────────────────────
    private async Task<string> RunAgentAsync(string userMessage)
    {
        var token = await _credential.GetTokenAsync(new TokenRequestContext(TokenScopes), default);

        // 1. Create a thread.
        using var threadResp = await SendAsync(HttpMethod.Post, "threads", token.Token, content: null);
        var threadId = (await ReadJsonAsync(threadResp)).GetProperty("id").GetString()
            ?? throw new InvalidOperationException("Foundry did not return a thread id.");

        try
        {
            // 2. Post the user message.
            using var _ = await SendAsync(HttpMethod.Post, $"threads/{threadId}/messages", token.Token,
                new { role = "user", content = userMessage });

            // 3. Start a run against the configured agent.
            using var runResp = await SendAsync(HttpMethod.Post, $"threads/{threadId}/runs", token.Token,
                new { assistant_id = _options.AgentId });
            var runId = (await ReadJsonAsync(runResp)).GetProperty("id").GetString()
                ?? throw new InvalidOperationException("Foundry did not return a run id.");

            // 4. Poll the run until it reaches a terminal state.
            string status = await PollRunAsync(threadId, runId, token.Token);
            if (status != "completed")
                throw new InvalidOperationException($"Foundry run ended with status '{status}'.");

            // 5. Read the latest assistant message.
            using var msgResp = await SendAsync(HttpMethod.Get, $"threads/{threadId}/messages", token.Token, content: null);
            var messages = await ReadJsonAsync(msgResp);
            return ReadAssistantText(messages);
        }
        finally
        {
            // 6. Best-effort cleanup so threads don't accumulate.
            try
            {
                using var __ = await SendAsync(HttpMethod.Delete, $"threads/{threadId}", token.Token, content: null);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to delete Foundry thread {ThreadId}.", threadId);
            }
        }
    }

    private async Task<string> PollRunAsync(string threadId, string runId, string token)
    {
        // Terminal states per the Agents API.
        var terminal = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { "completed", "failed", "cancelled", "expired", "requires_action" };

        for (var attempt = 0; attempt < 60; attempt++)
        {
            using var resp = await SendAsync(HttpMethod.Get, $"threads/{threadId}/runs/{runId}", token, content: null);
            var status = (await ReadJsonAsync(resp)).GetProperty("status").GetString() ?? "unknown";
            if (terminal.Contains(status))
                return status.ToLowerInvariant();

            await Task.Delay(TimeSpan.FromSeconds(1));
        }

        return "timeout";
    }

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, string token, object? content)
    {
        var url = $"{_baseUrl}/{path}?api-version={_options.ApiVersion}";
        using var request = new HttpRequestMessage(method, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (content is not null)
            request.Content = JsonContent.Create(content);

        var response = await _http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            response.Dispose();
            throw new HttpRequestException(
                $"Foundry API {method} {path} returned {(int)response.StatusCode}: {body}");
        }
        return response;
    }

    private static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response)
    {
        var stream = await response.Content.ReadAsStreamAsync();
        using var doc = await JsonDocument.ParseAsync(stream);
        return doc.RootElement.Clone();
    }

    // Reads the newest assistant message's text from a /messages list response.
    private static string ReadAssistantText(JsonElement messages)
    {
        if (!messages.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
            return string.Empty;

        // The list is newest-first; find the first assistant text block.
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

    // ─────────────────────────────────────────────────────────────────────────
    // Parsing helpers
    // ─────────────────────────────────────────────────────────────────────────

    // Models sometimes wrap JSON in ``` fences or add prose; grab the outermost {...}.
    private static string? ExtractJsonObject(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        int start = text.IndexOf('{');
        int end = text.LastIndexOf('}');
        return start >= 0 && end > start ? text.Substring(start, end - start + 1) : null;
    }

    private static string NormalizeRecommendation(string value) =>
        value.Trim().ToLowerInvariant() switch
        {
            "approve" or "approved" => "Approve",
            "reject" or "rejected" or "deny" or "denied" => "Reject",
            _ => "Review",
        };

    private static string? GetString(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.String
            ? el.GetString()
            : null;

    private static decimal? GetDecimal(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var el)) return null;
        if (el.ValueKind == JsonValueKind.Number && el.TryGetDecimal(out var d)) return d;
        if (el.ValueKind == JsonValueKind.String &&
            decimal.TryParse(el.GetString(), NumberStyles.Any, CultureInfo.InvariantCulture, out var ds)) return ds;
        return null;
    }

    private static DateTime? GetDate(JsonElement obj, string name)
    {
        if (obj.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.String &&
            DateTime.TryParse(el.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt))
            return dt;
        return null;
    }
}
