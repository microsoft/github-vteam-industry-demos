namespace ClaimProcessing.Core.Models;

public enum DecisionOutcome { Approved, Rejected }

public class ClaimDecision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ClaimId { get; set; }
    public DecisionOutcome Outcome { get; set; }
    public string Reason { get; set; } = string.Empty;
    public DateTime DecidedAt { get; set; } = DateTime.UtcNow;
    public string? PolicyEvaluationNotes { get; set; }
    public string? FoundryRecommendation { get; set; }
}
