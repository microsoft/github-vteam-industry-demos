using ClaimProcessing.Core.Models;

namespace ClaimProcessing.Core.Interfaces;

/// <summary>
/// Structured fields extracted from a raw claim document by the AI agent.
/// </summary>
public record ExtractedClaimFields(
    string? SuggestedClaimantName,
    decimal? SuggestedAmount,
    DateTime? SuggestedIncidentDate,
    string? SuggestedDescription,
    IReadOnlyList<string> Warnings
);

/// <summary>
/// AI-assisted decision recommendation. Non-binding — the deterministic
/// PolicyEngine is always the authoritative decision-maker.
/// </summary>
public record FoundryRecommendation(
    string Recommendation,    // "Approve" | "Reject" | "Review"
    decimal ConfidenceScore,  // 0.0 – 1.0
    string Rationale
);

/// <summary>
/// Foundry agentic interface. Local mock: MockFoundryClaimAgent.
/// Azure production: implement AzureFoundryClaimAgent and swap the DI
/// registration in Program.cs.
/// </summary>
public interface IFoundryClaimAgent
{
    /// <summary>Extract structured fields from a raw PDF/JSON claim document.</summary>
    Task<ExtractedClaimFields> ExtractClaimFieldsAsync(byte[] documentContent, string contentType);

    /// <summary>Return an AI-assisted recommendation for the claim decision.</summary>
    Task<FoundryRecommendation> RecommendDecisionAsync(Claim claim, Policy policy);
}
