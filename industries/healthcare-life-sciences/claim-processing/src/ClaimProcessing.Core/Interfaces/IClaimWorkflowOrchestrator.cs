using ClaimProcessing.Core.Models;

namespace ClaimProcessing.Core.Interfaces;

/// <summary>
/// A single step observed while the orchestrator ran — typically one delegated
/// call to a connected specialist agent, or an MCP tool invocation.
/// </summary>
public record WorkflowStep(
    string Agent,     // logical agent/tool name, e.g. "intake", "fraud_risk", "claim_assessor", "microsoft_learn"
    string Kind,      // "connected_agent" | "mcp" | "message"
    string Detail     // short human-readable description of what happened
);

/// <summary>
/// The result of running the multi-agent <c>claim-orchestrator</c> workflow in
/// Microsoft AI Foundry: the ordered steps it took (which specialist agents /
/// tools it invoked), the final synthesized JSON answer, and the raw reply text.
///
/// Advisory only — the deterministic PolicyEngine and the human adjuster remain
/// the authoritative decision-makers.
/// </summary>
public record WorkflowRunResult(
    bool Success,
    string RawReply,
    string? FinalJson,
    IReadOnlyList<WorkflowStep> Steps,
    string? Error,
    TimeSpan Duration
);

/// <summary>
/// Runs the Foundry multi-agent orchestration (orchestrator → intake +
/// fraud-risk + claim-assessor connected agents + Microsoft Learn MCP tool)
/// for a claim, surfacing the individual steps for visualization.
/// </summary>
public interface IClaimWorkflowOrchestrator
{
    /// <summary>True when a real Foundry orchestrator is configured (vs. the local mock).</summary>
    bool IsLive { get; }

    /// <summary>Run the orchestrator workflow for a claim and return its steps + final answer.</summary>
    Task<WorkflowRunResult> RunAsync(Claim claim, Policy? policy, CancellationToken cancellationToken = default);
}
