using ClaimProcessing.Core.Interfaces;
using ClaimProcessing.Core.Models;
using ClaimProcessing.PolicyEngine;

namespace ClaimProcessing.Tests;

/// <summary>
/// Policy engine unit tests. Ghost owns this file — expand with full boundary coverage.
/// </summary>
public class PolicyEngineTests
{
    private readonly IPolicyEngine _engine = new PolicyEvaluator();

    private static Policy ValidPolicy() => new()
    {
        PolicyNumber      = "TEST-001",
        HolderName        = "Test Holder",
        MaxCoverageAmount = 10_000m,
        ValidFrom         = DateTime.UtcNow.AddYears(-1),
        ValidTo           = DateTime.UtcNow.AddYears(1),
        IsActive          = true,
        DeductibleAmount  = 100m,
        CoverageType      = "Test"
    };

    private static Claim ValidClaim() => new()
    {
        PolicyNumber = "TEST-001",
        ClaimantName = "Test User",
        ClaimAmount  = 500m,
        IncidentDate = DateTime.UtcNow.AddDays(-10),
        Description  = "Test incident description"
    };

    [Fact]
    public async Task ValidClaim_ShouldBeApproved()
    {
        var decision = await _engine.EvaluateAsync(ValidClaim(), ValidPolicy());
        Assert.Equal(DecisionOutcome.Approved, decision.Outcome);
    }

    [Fact]
    public async Task ClaimExceedingCoverage_ShouldBeRejected()
    {
        var claim = ValidClaim();
        claim.ClaimAmount = 50_000m;
        var decision = await _engine.EvaluateAsync(claim, ValidPolicy());
        Assert.Equal(DecisionOutcome.Rejected, decision.Outcome);
        Assert.Contains("exceeds policy maximum coverage", decision.Reason);
    }

    [Fact]
    public async Task ExpiredPolicy_ShouldBeRejected()
    {
        var policy = ValidPolicy();
        policy.ValidTo = DateTime.UtcNow.AddDays(-1);
        var decision = await _engine.EvaluateAsync(ValidClaim(), policy);
        Assert.Equal(DecisionOutcome.Rejected, decision.Outcome);
        Assert.Contains("expired", decision.Reason);
    }

    [Fact]
    public async Task InactivePolicy_ShouldBeRejected()
    {
        var policy = ValidPolicy();
        policy.IsActive = false;
        var decision = await _engine.EvaluateAsync(ValidClaim(), policy);
        Assert.Equal(DecisionOutcome.Rejected, decision.Outcome);
        Assert.Contains("inactive", decision.Reason, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task FutureIncidentDate_ShouldBeRejected()
    {
        var claim = ValidClaim();
        claim.IncidentDate = DateTime.UtcNow.AddDays(5);
        var decision = await _engine.EvaluateAsync(claim, ValidPolicy());
        Assert.Equal(DecisionOutcome.Rejected, decision.Outcome);
        Assert.Contains("future", decision.Reason, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AmountBelowDeductible_ShouldBeRejected()
    {
        var claim = ValidClaim();
        claim.ClaimAmount = 50m; // below $100 deductible
        var decision = await _engine.EvaluateAsync(claim, ValidPolicy());
        Assert.Equal(DecisionOutcome.Rejected, decision.Outcome);
        Assert.Contains("deductible", decision.Reason, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task MissingClaimantName_ShouldBeRejected()
    {
        var claim = ValidClaim();
        claim.ClaimantName = "";
        var decision = await _engine.EvaluateAsync(claim, ValidPolicy());
        Assert.Equal(DecisionOutcome.Rejected, decision.Outcome);
        Assert.Contains("Claimant name", decision.Reason);
    }

    [Fact]
    public async Task MissingDescription_ShouldBeRejected()
    {
        var claim = ValidClaim();
        claim.Description = "   ";
        var decision = await _engine.EvaluateAsync(claim, ValidPolicy());
        Assert.Equal(DecisionOutcome.Rejected, decision.Outcome);
        Assert.Contains("description", decision.Reason, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ZeroClaimAmount_ShouldBeRejected()
    {
        var claim = ValidClaim();
        claim.ClaimAmount = 0;
        var decision = await _engine.EvaluateAsync(claim, ValidPolicy());
        Assert.Equal(DecisionOutcome.Rejected, decision.Outcome);
        Assert.Contains("greater than zero", decision.Reason);
    }

    [Fact]
    public async Task PolicyNotYetActive_ShouldBeRejected()
    {
        var policy = ValidPolicy();
        policy.ValidFrom = DateTime.UtcNow.AddYears(1);
        policy.ValidTo   = DateTime.UtcNow.AddYears(2);
        var decision = await _engine.EvaluateAsync(ValidClaim(), policy);
        Assert.Equal(DecisionOutcome.Rejected, decision.Outcome);
        Assert.Contains("not yet active", decision.Reason);
    }

    [Fact]
    public async Task ApprovedDecision_ContainsClaimId()
    {
        var claim = ValidClaim();
        var decision = await _engine.EvaluateAsync(claim, ValidPolicy());
        Assert.Equal(claim.Id, decision.ClaimId);
        Assert.NotEqual(Guid.Empty, decision.Id);
    }
}
