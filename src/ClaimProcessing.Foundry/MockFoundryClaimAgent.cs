using System.Text;
using System.Text.Json;
using ClaimProcessing.Core.Interfaces;
using ClaimProcessing.Core.Models;

namespace ClaimProcessing.Foundry;

/// <summary>
/// LOCAL MOCK — no Azure credentials required. Deterministic, no network calls.
///
/// Behaviour:
///   ExtractClaimFieldsAsync — parses JSON documents (application/json or JSON-shaped bytes)
///     and extracts claimant name, amount, incident date and description. Emits structured
///     warnings for missing or ambiguous fields. Returns a graceful stub with a warning for
///     PDF or unknown content types, indicating real extraction requires Azure AI Foundry.
///
///   RecommendDecisionAsync — applies multi-factor heuristics (policy active status, incident
///     date validity, deductible, coverage ratio, late-submission gap) to produce an
///     Approve / Reject / Review recommendation with a 0-1 confidence score and a human-
///     readable rationale. Always prefixed "[MOCK AI]" to make it clear this is an advisory
///     signal; the PolicyEngine remains the authoritative decision-maker.
///
/// Swap path → see README.md in this project folder.
/// </summary>
public class MockFoundryClaimAgent : IFoundryClaimAgent
{
    // JSON property names accepted in uploaded claim documents (case-insensitive).
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
    };

    // -------------------------------------------------------------------------
    // ExtractClaimFieldsAsync
    // -------------------------------------------------------------------------

    public Task<ExtractedClaimFields> ExtractClaimFieldsAsync(byte[] documentContent, string contentType)
    {
        bool looksLikeJson = IsJsonContentType(contentType) || LooksLikeJsonBytes(documentContent);

        if (looksLikeJson)
            return Task.FromResult(ParseJsonDocument(documentContent));

        // PDF or other binary — real extraction would require Foundry OCR/multimodal.
        return Task.FromResult(new ExtractedClaimFields(
            SuggestedClaimantName: null,
            SuggestedAmount: null,
            SuggestedIncidentDate: null,
            SuggestedDescription: null,
            Warnings:
            [
                $"[MOCK] Content-Type '{contentType}' is not parseable locally. " +
                "Real field extraction from PDF/binary documents requires Azure AI Foundry. " +
                "Please fill in claim fields manually or swap to AzureFoundryClaimAgent."
            ]
        ));
    }

    private static bool IsJsonContentType(string contentType) =>
        !string.IsNullOrWhiteSpace(contentType) &&
        (contentType.Contains("application/json", StringComparison.OrdinalIgnoreCase) ||
         contentType.Contains("text/json", StringComparison.OrdinalIgnoreCase));

    private static bool LooksLikeJsonBytes(byte[] bytes)
    {
        if (bytes is not { Length: > 0 }) return false;
        // Skip BOM and leading whitespace, then check for { or [
        int i = 0;
        if (bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF) i = 3; // UTF-8 BOM
        while (i < bytes.Length && bytes[i] is (byte)' ' or (byte)'\t' or (byte)'\r' or (byte)'\n') i++;
        return i < bytes.Length && (bytes[i] == (byte)'{' || bytes[i] == (byte)'[');
    }

    private static ExtractedClaimFields ParseJsonDocument(byte[] documentContent)
    {
        var warnings = new List<string>();
        string? name = null;
        decimal? amount = null;
        DateTime? incidentDate = null;
        string? description = null;

        try
        {
            string json = Encoding.UTF8.GetString(documentContent);
            using var doc = JsonDocument.Parse(json, new JsonDocumentOptions
            {
                AllowTrailingCommas = true,
                CommentHandling = JsonCommentHandling.Skip,
            });
            var root = doc.RootElement;

            // Support both top-level claim objects and a "claim" wrapper.
            JsonElement obj = root.ValueKind == JsonValueKind.Object &&
                              root.TryGetProperty("claim", out var nested) &&
                              nested.ValueKind == JsonValueKind.Object
                ? nested : root;

            if (obj.ValueKind != JsonValueKind.Object)
            {
                warnings.Add("[MOCK] JSON root is not an object — cannot extract claim fields.");
                return new ExtractedClaimFields(null, null, null, null, warnings);
            }

            // Claimant name
            name = TryGetString(obj, "claimantName", "claimant_name", "name", "holderName", "holder_name");
            if (name is null)
                warnings.Add("[MOCK] Could not find claimant name (tried: claimantName, name, holderName). Please verify.");

            // Amount
            amount = TryGetDecimal(obj, "amount", "claimAmount", "claim_amount", "requestedAmount", "requested_amount");
            if (amount is null)
                warnings.Add("[MOCK] Could not find claim amount (tried: amount, claimAmount, requestedAmount). Please verify.");
            else if (amount <= 0)
                warnings.Add($"[MOCK] Extracted amount {amount} is zero or negative — please verify the document.");

            // Incident date
            incidentDate = TryGetDate(obj, "incidentDate", "incident_date", "date", "eventDate", "event_date", "lossDate", "loss_date");
            if (incidentDate is null)
                warnings.Add("[MOCK] Could not find incident date (tried: incidentDate, date, eventDate, lossDate). Please verify.");
            else if (incidentDate > DateTime.UtcNow)
                warnings.Add($"[MOCK] Incident date {incidentDate:yyyy-MM-dd} is in the future — please verify the document.");

            // Description
            description = TryGetString(obj, "description", "summary", "details", "notes", "narrative");
            if (description is null)
                warnings.Add("[MOCK] No description field found (tried: description, summary, details, notes). Field left blank.");
        }
        catch (JsonException ex)
        {
            warnings.Add($"[MOCK] JSON parse error: {ex.Message}. Fields could not be extracted automatically.");
            return new ExtractedClaimFields(null, null, null, null, warnings);
        }

        return new ExtractedClaimFields(name, amount, incidentDate, description, warnings);
    }

    private static string? TryGetString(JsonElement obj, params string[] candidates)
    {
        foreach (var key in candidates)
            if (obj.TryGetProperty(key, out var el) && el.ValueKind == JsonValueKind.String)
            {
                var v = el.GetString();
                if (!string.IsNullOrWhiteSpace(v)) return v;
            }
        return null;
    }

    private static decimal? TryGetDecimal(JsonElement obj, params string[] candidates)
    {
        foreach (var key in candidates)
        {
            if (!obj.TryGetProperty(key, out var el)) continue;
            if (el.ValueKind is JsonValueKind.Number && el.TryGetDecimal(out var d)) return d;
            if (el.ValueKind == JsonValueKind.String && decimal.TryParse(el.GetString(), out var ds)) return ds;
        }
        return null;
    }

    private static DateTime? TryGetDate(JsonElement obj, params string[] candidates)
    {
        foreach (var key in candidates)
        {
            if (!obj.TryGetProperty(key, out var el)) continue;
            if (el.ValueKind == JsonValueKind.String &&
                DateTime.TryParse(el.GetString(), out var dt))
                return dt;
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // RecommendDecisionAsync
    // -------------------------------------------------------------------------

    public Task<FoundryRecommendation> RecommendDecisionAsync(Claim claim, Policy policy)
    {
        var factors = new List<string>();
        string recommendation;
        decimal confidence;

        // ── Factor 1: Policy active status ──────────────────────────────────
        if (!policy.IsActive)
        {
            factors.Add("Policy is marked inactive.");
            return Task.FromResult(MakeRecommendation("Reject", 0.97m,
                "[MOCK AI] Policy is not active. Claim cannot be covered under an inactive policy.", factors));
        }
        factors.Add("Policy is active.");

        // ── Factor 2: Incident date within policy validity window ────────────
        var incident = claim.IncidentDate.Date;
        if (incident < policy.ValidFrom.Date || incident > policy.ValidTo.Date)
        {
            factors.Add($"Incident date {incident:yyyy-MM-dd} is outside policy validity " +
                        $"({policy.ValidFrom:yyyy-MM-dd} – {policy.ValidTo:yyyy-MM-dd}).");
            return Task.FromResult(MakeRecommendation("Reject", 0.95m,
                "[MOCK AI] Incident date falls outside the policy's validity window. Claim is not eligible.", factors));
        }
        factors.Add($"Incident date {incident:yyyy-MM-dd} is within the policy validity window.");

        // ── Factor 3: Claim amount sanity ────────────────────────────────────
        if (claim.ClaimAmount <= 0)
        {
            factors.Add($"Claim amount is {claim.ClaimAmount:C} — invalid.");
            return Task.FromResult(MakeRecommendation("Review", 0.55m,
                "[MOCK AI] Claim amount is zero or negative. Data quality issue — manual review required.", factors));
        }

        // ── Factor 4: Amount vs. maximum coverage ───────────────────────────
        if (policy.MaxCoverageAmount > 0 && claim.ClaimAmount > policy.MaxCoverageAmount)
        {
            factors.Add($"Claim amount {claim.ClaimAmount:C} exceeds maximum coverage {policy.MaxCoverageAmount:C}.");
            return Task.FromResult(MakeRecommendation("Reject", 0.90m,
                "[MOCK AI] Requested amount exceeds the policy's maximum coverage limit.", factors));
        }

        // ── Factor 5: Net amount after deductible ────────────────────────────
        decimal netAmount = claim.ClaimAmount - policy.DeductibleAmount;
        if (netAmount <= 0)
        {
            factors.Add($"Net amount after deductible ({policy.DeductibleAmount:C}) is {netAmount:C} — below or at deductible.");
            return Task.FromResult(MakeRecommendation("Reject", 0.85m,
                $"[MOCK AI] Claim amount {claim.ClaimAmount:C} does not exceed the policy deductible of {policy.DeductibleAmount:C}. No payable benefit.", factors));
        }
        factors.Add($"Net payable amount after deductible: {netAmount:C}.");

        // ── Factor 6: Coverage ratio (net / max coverage) ───────────────────
        decimal ratio = policy.MaxCoverageAmount > 0 ? netAmount / policy.MaxCoverageAmount : 0m;
        factors.Add($"Coverage utilisation ratio: {ratio:P0}.");

        // ── Factor 7: Late-submission gap ───────────────────────────────────
        bool lateSubmission = (claim.SubmittedAt.Date - incident).TotalDays > 365;
        if (lateSubmission)
            factors.Add($"Warning: claim submitted {(claim.SubmittedAt.Date - incident).Days} days after incident — unusually late.");

        // ── Derive recommendation from ratio + late-submission flag ──────────
        (recommendation, confidence) = (ratio, lateSubmission) switch
        {
            (<= 0.30m, false) => ("Approve", 0.90m),
            (<= 0.30m, true)  => ("Review",  0.72m),
            (<= 0.60m, false) => ("Approve", 0.80m),
            (<= 0.60m, true)  => ("Review",  0.65m),
            (<= 0.85m, _)     => ("Review",  0.62m),
            _                 => ("Review",  0.50m),
        };

        string rationale = BuildRationale(recommendation, claim, policy, netAmount, ratio, lateSubmission);
        return Task.FromResult(MakeRecommendation(recommendation, confidence, rationale, factors));
    }

    private static string BuildRationale(
        string rec, Claim claim, Policy policy, decimal netAmount, decimal ratio, bool late)
    {
        var sb = new StringBuilder("[MOCK AI] ");

        sb.Append(rec switch
        {
            "Approve" => $"Claim appears eligible for approval. ",
            "Reject"  => $"Claim does not meet policy criteria. ",
            _         => $"Claim warrants manual review. ",
        });

        sb.Append($"Net payable amount {netAmount:C} represents {ratio:P0} of the " +
                  $"{policy.MaxCoverageAmount:C} coverage limit. ");

        if (late)
            sb.Append("Submission gap exceeds 365 days — verify timeliness clause. ");

        if (!string.IsNullOrWhiteSpace(policy.CoverageType))
            sb.Append($"Policy coverage type: {policy.CoverageType}. ");

        sb.Append("Note: this is an AI-style advisory signal only. " +
                  "The deterministic PolicyEngine is the authoritative decision-maker.");

        return sb.ToString();
    }

    private static FoundryRecommendation MakeRecommendation(
        string rec, decimal confidence, string rationale, List<string> factors)
    {
        string fullRationale = rationale + " Factors considered: " + string.Join(" | ", factors);
        return new FoundryRecommendation(rec, confidence, fullRationale);
    }
}
