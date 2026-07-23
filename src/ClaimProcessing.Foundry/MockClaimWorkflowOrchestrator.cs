using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using ClaimProcessing.Core.Interfaces;
using ClaimProcessing.Core.Models;

namespace ClaimProcessing.Foundry;

/// <summary>
/// LOCAL MOCK — no Azure credentials required. Simulates the Foundry multi-agent
/// orchestration (orchestrator → intake + fraud-risk + claim-assessor + Microsoft
/// Learn MCP) with deterministic heuristics and a small artificial delay per step,
/// so the Agentic Workflow page is fully demoable offline.
///
/// Advisory only — mirrors the shape of the live orchestrator's output.
/// </summary>
public sealed class MockClaimWorkflowOrchestrator : IClaimWorkflowOrchestrator
{
    public bool IsLive => false;

    public async Task<WorkflowRunResult> RunAsync(Claim claim, Policy? policy, CancellationToken cancellationToken = default)
    {
        var sw = Stopwatch.StartNew();
        var steps = new List<WorkflowStep>();

        // Step 1: intake
        await Task.Delay(500, cancellationToken);
        bool complete = !string.IsNullOrWhiteSpace(claim.ClaimantName) && claim.ClaimAmount > 0 && claim.IncidentDate != default;
        steps.Add(new WorkflowStep("intake", "connected_agent",
            complete ? "Extracted and validated all claim fields." : "Extracted claim fields; some values need verification."));

        // Step 2: fraud & risk
        await Task.Delay(500, cancellationToken);
        var (riskLevel, riskScore, flags) = AssessRisk(claim, policy);
        steps.Add(new WorkflowStep("fraud_risk", "connected_agent",
            $"Risk assessed as {riskLevel} (score {riskScore})."));

        // Step 3: Microsoft Learn MCP (documentation lookup)
        await Task.Delay(400, cancellationToken);
        steps.Add(new WorkflowStep("microsoft_learn", "mcp",
            "Consulted Microsoft Learn documentation for insurance-domain guidance."));

        // Step 4: policy assessor
        await Task.Delay(500, cancellationToken);
        var (recommendation, confidence, assessment) = Assess(claim, policy, riskLevel);
        steps.Add(new WorkflowStep("claim_assessor", "connected_agent",
            $"Recommended '{recommendation}' at {confidence:P0} confidence."));

        var final = new
        {
            recommendation,
            confidence,
            riskLevel,
            reasons = BuildReasons(claim, policy, riskLevel, flags, recommendation),
            subAgentSummary = new
            {
                intake = complete ? "All required fields present and valid." : "Fields extracted; verify flagged values.",
                fraud = $"{riskLevel} risk (score {riskScore}). {(flags.Count > 0 ? string.Join("; ", flags) : "No significant flags.")}",
                assessment,
            }
        };

        var json = JsonSerializer.Serialize(final, new JsonSerializerOptions { WriteIndented = true });
        sw.Stop();
        return new WorkflowRunResult(true, json, json, steps, null, sw.Elapsed);
    }

    private static (string level, int score, List<string> flags) AssessRisk(Claim claim, Policy? policy)
    {
        var flags = new List<string>();
        int score = 5;

        if (policy is not null && policy.MaxCoverageAmount > 0 && claim.ClaimAmount >= policy.MaxCoverageAmount * 0.9m)
        {
            score += 45;
            flags.Add("Claim amount is near the coverage limit.");
        }
        if (claim.ClaimAmount > 0 && claim.ClaimAmount % 1000 == 0)
        {
            score += 15;
            flags.Add("Claim amount is a suspiciously round number.");
        }
        if ((claim.SubmittedAt.Date - claim.IncidentDate.Date).TotalDays > 365)
        {
            score += 30;
            flags.Add("Claim submitted more than a year after the incident.");
        }
        if (claim.IncidentDate.Date > DateTime.UtcNow.Date)
        {
            score += 40;
            flags.Add("Incident date is in the future.");
        }

        score = Math.Clamp(score, 0, 100);
        var level = score >= 60 ? "High" : score >= 30 ? "Medium" : "Low";
        return (level, score, flags);
    }

    private static (string rec, decimal confidence, string summary) Assess(Claim claim, Policy? policy, string riskLevel)
    {
        if (policy is null)
            return ("Review", 0.50m, "No matching policy found — manual review required.");
        if (!policy.IsActive)
            return ("Reject", 0.95m, "Policy is inactive; claim not covered.");

        var incident = claim.IncidentDate.Date;
        if (incident < policy.ValidFrom.Date || incident > policy.ValidTo.Date)
            return ("Reject", 0.93m, "Incident date falls outside the policy validity window.");
        if (policy.MaxCoverageAmount > 0 && claim.ClaimAmount > policy.MaxCoverageAmount)
            return ("Reject", 0.90m, "Claim amount exceeds the policy's maximum coverage.");
        if (claim.ClaimAmount - policy.DeductibleAmount <= 0)
            return ("Reject", 0.85m, "Claim amount does not exceed the deductible.");

        return riskLevel == "High"
            ? ("Review", 0.68m, "Claim is within coverage but carries elevated fraud/risk signals.")
            : ("Approve", 0.88m, "Claim is within coverage and passes policy checks.");
    }

    private static string[] BuildReasons(Claim claim, Policy? policy, string riskLevel, List<string> flags, string rec)
    {
        var reasons = new List<string>();
        if (policy is not null)
            reasons.Add($"Policy {policy.PolicyNumber} is {(policy.IsActive ? "active" : "inactive")}, coverage {policy.MaxCoverageAmount.ToString("C0", CultureInfo.CurrentCulture)}.");
        reasons.Add($"Fraud/risk level assessed as {riskLevel}.");
        reasons.AddRange(flags);
        reasons.Add($"Advisory recommendation: {rec}. Deterministic PolicyEngine remains authoritative.");
        return reasons.ToArray();
    }
}
