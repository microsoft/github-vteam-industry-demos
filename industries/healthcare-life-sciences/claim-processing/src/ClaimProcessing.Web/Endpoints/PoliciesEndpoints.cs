using ClaimProcessing.Core.Interfaces;

namespace ClaimProcessing.Web.Endpoints;

/// <summary>Policy DTO returned by the list-policies endpoint.</summary>
public record PolicySummaryResponse(
    string PolicyNumber,
    string HolderName,
    decimal MaxCoverageAmount,
    decimal DeductibleAmount,
    string CoverageType,
    bool IsActive,
    string ValidFrom,
    string ValidTo);

public static class PoliciesEndpoints
{
    public static IEndpointRouteBuilder MapPoliciesEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/policies — list all policies (summary view, no sensitive internals)
        app.MapGet("/api/policies", async (IClaimsRepository repo) =>
        {
            var policies = await repo.GetAllPoliciesAsync();
            var response = policies.Select(p => new PolicySummaryResponse(
                p.PolicyNumber,
                p.HolderName,
                p.MaxCoverageAmount,
                p.DeductibleAmount,
                p.CoverageType,
                p.IsActive,
                p.ValidFrom.ToString("yyyy-MM-dd"),
                p.ValidTo.ToString("yyyy-MM-dd")));

            return Results.Ok(response);
        })
        .WithTags("Policies")
        .WithName("GetAllPolicies")
        .WithSummary("Returns all available policies (summary view).");

        return app;
    }
}
