namespace ClaimProcessing.Core.Models;

public class Policy
{
    public string PolicyNumber { get; set; } = string.Empty;
    public string HolderName { get; set; } = string.Empty;
    public decimal MaxCoverageAmount { get; set; }
    public DateTime ValidFrom { get; set; }
    public DateTime ValidTo { get; set; }
    public bool IsActive { get; set; } = true;
    public decimal DeductibleAmount { get; set; }
    public string CoverageType { get; set; } = string.Empty;
}
