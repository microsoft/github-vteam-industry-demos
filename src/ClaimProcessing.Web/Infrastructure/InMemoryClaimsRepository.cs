using ClaimProcessing.Core.Interfaces;
using ClaimProcessing.Core.Models;

namespace ClaimProcessing.Web.Infrastructure;

/// <summary>
/// In-memory claims and policy store. Thread-safe singleton.
/// Replace with EF Core / Azure SQL implementation for production.
/// </summary>
public class InMemoryClaimsRepository : IClaimsRepository
{
    private readonly Dictionary<Guid, Claim> _claims = [];
    private readonly Dictionary<string, Policy> _policies = [];
    private readonly Lock _lock = new();

    public Task<IEnumerable<Claim>> GetAllClaimsAsync()
    {
        lock (_lock)
            return Task.FromResult<IEnumerable<Claim>>(_claims.Values.OrderByDescending(c => c.SubmittedAt).ToList());
    }

    public Task<Claim?> GetClaimByIdAsync(Guid id)
    {
        lock (_lock)
            return Task.FromResult(_claims.TryGetValue(id, out var c) ? c : null);
    }

    public Task AddClaimAsync(Claim claim)
    {
        lock (_lock) _claims[claim.Id] = claim;
        return Task.CompletedTask;
    }

    public Task UpdateClaimAsync(Claim claim)
    {
        lock (_lock) _claims[claim.Id] = claim;
        return Task.CompletedTask;
    }

    public Task<Policy?> GetPolicyByNumberAsync(string policyNumber)
    {
        lock (_lock)
            return Task.FromResult(_policies.TryGetValue(policyNumber, out var p) ? p : null);
    }

    public Task<IEnumerable<Policy>> GetAllPoliciesAsync()
    {
        lock (_lock)
            return Task.FromResult<IEnumerable<Policy>>(_policies.Values.OrderBy(p => p.PolicyNumber).ToList());
    }

    public Task AddPolicyAsync(Policy policy)
    {
        lock (_lock) _policies[policy.PolicyNumber] = policy;
        return Task.CompletedTask;
    }

    public async Task SeedPoliciesAsync()
    {
        var today = DateTime.UtcNow;
        var policies = new[]
        {
            new Policy
            {
                PolicyNumber  = "POL-001",
                HolderName    = "Alice Johnson",
                MaxCoverageAmount = 50_000m,
                ValidFrom     = today.AddYears(-1),
                ValidTo       = today.AddYears(1),
                IsActive      = true,
                DeductibleAmount = 500m,
                CoverageType  = "Comprehensive"
            },
            new Policy
            {
                PolicyNumber  = "POL-002",
                HolderName    = "Bob Smith",
                MaxCoverageAmount = 25_000m,
                ValidFrom     = today.AddYears(-3),
                ValidTo       = today.AddDays(-30),   // expired — for demo rejection scenario
                IsActive      = false,
                DeductibleAmount = 250m,
                CoverageType  = "Basic"
            },
            new Policy
            {
                PolicyNumber  = "POL-003",
                HolderName    = "Carol Williams",
                MaxCoverageAmount = 100_000m,
                ValidFrom     = today.AddMonths(-6),
                ValidTo       = today.AddYears(2),
                IsActive      = true,
                DeductibleAmount = 1_000m,
                CoverageType  = "Premium"
            },
        };
        foreach (var p in policies)
            await AddPolicyAsync(p);
    }
}
