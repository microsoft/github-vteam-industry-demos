using ClaimProcessing.Core.Models;

namespace ClaimProcessing.Core.Interfaces;

public interface IClaimsRepository
{
    Task<IEnumerable<Claim>> GetAllClaimsAsync();
    Task<Claim?> GetClaimByIdAsync(Guid id);
    Task AddClaimAsync(Claim claim);
    Task UpdateClaimAsync(Claim claim);
    Task<Policy?> GetPolicyByNumberAsync(string policyNumber);
    Task<IEnumerable<Policy>> GetAllPoliciesAsync();
    Task AddPolicyAsync(Policy policy);
    Task SeedPoliciesAsync();
}
