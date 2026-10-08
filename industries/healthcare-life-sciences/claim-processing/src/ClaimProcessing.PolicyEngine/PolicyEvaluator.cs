using System.Globalization;
using ClaimProcessing.Core.Interfaces;
using ClaimProcessing.Core.Models;

namespace ClaimProcessing.PolicyEngine;

/// <summary>
/// Deterministic policy evaluation engine. Dozer owns this module.
///
/// Rule set (all rules are always evaluated; all failures are accumulated):
///   R01 PolicyActive            — policy.IsActive must be true
///   R02 PolicyValidityWindow    — today must be within [ValidFrom, ValidTo]
///   R03 IncidentDateNotFuture   — incident date must not be after today (UTC)
///   R04 IncidentWithinWindow    — incident date must fall inside [ValidFrom, ValidTo]
///                                 (suppressed when R02 already failed to avoid duplication)
///   R05 ClaimAmountPositive     — claim amount > 0
///   R06 ExceedsDeductible       — claim amount > deductible (only checked when R05 passes)
///   R07 WithinCoverageLimit     — claim amount ≤ maxCoverage (only checked when R05 passes)
///   R08a RequiredField:Name     — claimantName must not be blank
///   R08b RequiredField:Desc     — description must not be blank
/// </summary>
public class PolicyEvaluator : IPolicyEngine
{
    public Task<ClaimDecision> EvaluateAsync(Claim claim, Policy policy)
    {
        ArgumentNullException.ThrowIfNull(claim);
        ArgumentNullException.ThrowIfNull(policy);

        var failures = new List<string>();
        var ruleNotes = new List<string>(9);

        // R01: Policy must be active
        if (!policy.IsActive)
        {
            failures.Add("Policy is inactive.");
            ruleNotes.Add("R01[FAIL] PolicyActive");
        }
        else
        {
            ruleNotes.Add("R01[PASS] PolicyActive");
        }

        // R02: Policy validity window must contain today (UTC)
        var today = DateTime.UtcNow.Date;
        bool policyWindowFailed = false;
        if (today < policy.ValidFrom.Date)
        {
            failures.Add($"Policy not yet active (starts {policy.ValidFrom:yyyy-MM-dd}).");
            ruleNotes.Add("R02[FAIL] PolicyValidityWindow:NotYetActive");
            policyWindowFailed = true;
        }
        else if (today > policy.ValidTo.Date)
        {
            failures.Add($"Policy expired on {policy.ValidTo:yyyy-MM-dd}.");
            ruleNotes.Add("R02[FAIL] PolicyValidityWindow:Expired");
            policyWindowFailed = true;
        }
        else
        {
            ruleNotes.Add("R02[PASS] PolicyValidityWindow");
        }

        // R03: Incident date must not be in the future
        if (claim.IncidentDate.Date > today)
        {
            failures.Add("Incident date cannot be in the future.");
            ruleNotes.Add("R03[FAIL] IncidentDateNotFuture");
        }
        else
        {
            ruleNotes.Add("R03[PASS] IncidentDateNotFuture");
        }

        // R04: Incident date must fall within the policy validity window.
        // Suppressed when R02 already flagged the window as invalid to avoid redundant messaging.
        bool incidentOutsideWindow = claim.IncidentDate.Date < policy.ValidFrom.Date ||
                                     claim.IncidentDate.Date > policy.ValidTo.Date;
        if (incidentOutsideWindow && !policyWindowFailed)
        {
            failures.Add(
                $"Incident date {claim.IncidentDate:yyyy-MM-dd} falls outside the policy validity window " +
                $"({policy.ValidFrom:yyyy-MM-dd} – {policy.ValidTo:yyyy-MM-dd}).");
            ruleNotes.Add("R04[FAIL] IncidentWithinPolicyWindow");
        }
        else
        {
            ruleNotes.Add(incidentOutsideWindow
                ? "R04[SKIP] IncidentWithinPolicyWindow (covered by R02)"
                : "R04[PASS] IncidentWithinPolicyWindow");
        }

        // R05: Claim amount must be positive
        if (claim.ClaimAmount <= 0m)
        {
            failures.Add("Claim amount must be greater than zero.");
            ruleNotes.Add("R05[FAIL] ClaimAmountPositive");
        }
        else
        {
            ruleNotes.Add("R05[PASS] ClaimAmountPositive");

            // R06: Claim amount must exceed the deductible
            if (claim.ClaimAmount <= policy.DeductibleAmount)
            {
                failures.Add(
                    $"Claim amount {Fmt(claim.ClaimAmount)} does not exceed the deductible {Fmt(policy.DeductibleAmount)}.");
                ruleNotes.Add("R06[FAIL] ExceedsDeductible");
            }
            else
            {
                ruleNotes.Add("R06[PASS] ExceedsDeductible");
            }

            // R07: Claim amount must not exceed the coverage limit
            if (claim.ClaimAmount > policy.MaxCoverageAmount)
            {
                failures.Add(
                    $"Claim amount {Fmt(claim.ClaimAmount)} exceeds policy maximum coverage {Fmt(policy.MaxCoverageAmount)}.");
                ruleNotes.Add("R07[FAIL] WithinCoverageLimit");
            }
            else
            {
                ruleNotes.Add("R07[PASS] WithinCoverageLimit");
            }
        }

        // R08: Required fields (claimant name + description)
        if (string.IsNullOrWhiteSpace(claim.ClaimantName))
        {
            failures.Add("Claimant name is required.");
            ruleNotes.Add("R08a[FAIL] RequiredField:ClaimantName");
        }
        else
        {
            ruleNotes.Add("R08a[PASS] RequiredField:ClaimantName");
        }

        if (string.IsNullOrWhiteSpace(claim.Description))
        {
            failures.Add("Incident description is required.");
            ruleNotes.Add("R08b[FAIL] RequiredField:Description");
        }
        else
        {
            ruleNotes.Add("R08b[PASS] RequiredField:Description");
        }

        var outcome = failures.Count == 0 ? DecisionOutcome.Approved : DecisionOutcome.Rejected;
        var reason = failures.Count == 0
            ? $"All policy checks passed. Claim approved for {Fmt(claim.ClaimAmount)} under policy " +
              $"{policy.PolicyNumber} (max coverage: {Fmt(policy.MaxCoverageAmount)})."
            : string.Join(" ", failures);

        int passCount = ruleNotes.Count(n => n.Contains("[PASS]"));
        var decision = new ClaimDecision
        {
            ClaimId = claim.Id,
            Outcome = outcome,
            Reason  = reason,
            PolicyEvaluationNotes =
                $"Policy:{policy.PolicyNumber} | Checks:9 | Passed:{passCount} | Failed:{failures.Count} | " +
                $"Coverage:{Fmt(policy.MaxCoverageAmount)} | Deductible:{Fmt(policy.DeductibleAmount)} || " +
                string.Join("; ", ruleNotes),
        };

        return Task.FromResult(decision);
    }

    /// <summary>
    /// Formats a monetary amount as a plain dollar string using InvariantCulture,
    /// ensuring deterministic output regardless of the host machine's locale.
    /// </summary>
    private static string Fmt(decimal amount) =>
        "$" + amount.ToString("N2", CultureInfo.InvariantCulture);
}
