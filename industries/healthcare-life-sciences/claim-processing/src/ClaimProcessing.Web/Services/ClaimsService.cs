using ClaimProcessing.Core.Interfaces;
using ClaimProcessing.Core.Models;

namespace ClaimProcessing.Web.Services;

/// <summary>
/// Orchestrates claim submission: persists, evaluates via PolicyEngine,
/// enriches with Foundry recommendation, and returns the final decision.
/// </summary>
public class ClaimsService(
    IClaimsRepository repository,
    IPolicyEngine policyEngine,
    IFoundryClaimAgent foundryAgent)
{
    public Task<IEnumerable<Claim>> GetAllClaimsAsync() =>
        repository.GetAllClaimsAsync();

    public Task<Claim?> GetClaimByIdAsync(Guid id) =>
        repository.GetClaimByIdAsync(id);

    public Task<IEnumerable<Policy>> GetAllPoliciesAsync() =>
        repository.GetAllPoliciesAsync();

    public Task<Policy?> GetPolicyByNumberAsync(string policyNumber) =>
        repository.GetPolicyByNumberAsync(policyNumber);

    public async Task<(Claim Claim, ClaimDecision Decision)> SubmitClaimAsync(
        string policyNumber,
        string claimantName,
        decimal claimAmount,
        DateTime incidentDate,
        string description,
        string? documentFileName,
        byte[]? documentContent,
        string? documentContentType)
    {
        var claim = new Claim
        {
            PolicyNumber        = policyNumber,
            ClaimantName        = claimantName,
            ClaimAmount         = claimAmount,
            IncidentDate        = incidentDate,
            Description         = description,
            DocumentFileName    = documentFileName,
            DocumentContent     = documentContent,
            DocumentContentType = documentContentType,
        };

        await repository.AddClaimAsync(claim);

        var policy = await repository.GetPolicyByNumberAsync(policyNumber);
        if (policy is null)
        {
            var notFoundDecision = new ClaimDecision
            {
                ClaimId = claim.Id,
                Outcome = DecisionOutcome.Rejected,
                Reason  = $"Policy number '{policyNumber}' not found in the system.",
            };
            claim.Status   = ClaimStatus.Rejected;
            claim.Decision = notFoundDecision;
            await repository.UpdateClaimAsync(claim);
            return (claim, notFoundDecision);
        }

        // Foundry recommendation (informational — policy engine is authoritative)
        var foundryRec = await foundryAgent.RecommendDecisionAsync(claim, policy);

        var decision = await policyEngine.EvaluateAsync(claim, policy);
        decision.FoundryRecommendation =
            $"{foundryRec.Recommendation} (confidence: {foundryRec.ConfidenceScore:P0}) — {foundryRec.Rationale}";

        claim.Status   = decision.Outcome == DecisionOutcome.Approved ? ClaimStatus.Approved : ClaimStatus.Rejected;
        claim.Decision = decision;
        await repository.UpdateClaimAsync(claim);

        return (claim, decision);
    }
}
