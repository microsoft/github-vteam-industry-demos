using ClaimProcessing.Core.Models;

namespace ClaimProcessing.Core.Interfaces;

public interface IPolicyEngine
{
    Task<ClaimDecision> EvaluateAsync(Claim claim, Policy policy);
}
