namespace ClaimProcessing.Core.Models;

public enum ClaimStatus { Pending, Approved, Rejected }

public class Claim
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string PolicyNumber { get; set; } = string.Empty;
    public string ClaimantName { get; set; } = string.Empty;
    public decimal ClaimAmount { get; set; }
    public DateTime IncidentDate { get; set; }
    public string Description { get; set; } = string.Empty;
    public string? DocumentFileName { get; set; }
    public byte[]? DocumentContent { get; set; }
    public string? DocumentContentType { get; set; }
    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;
    public ClaimStatus Status { get; set; } = ClaimStatus.Pending;
    public ClaimDecision? Decision { get; set; }
}
