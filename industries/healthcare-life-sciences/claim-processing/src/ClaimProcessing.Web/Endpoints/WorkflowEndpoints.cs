using ClaimProcessing.Core.Interfaces;
using ClaimProcessing.Core.Models;
using ClaimProcessing.Web.Services;

namespace ClaimProcessing.Web.Endpoints;

public record RunWorkflowRequest(
    string PolicyNumber,
    string ClaimantName,
    decimal ClaimAmount,
    DateTime IncidentDate,
    string Description);

public static class WorkflowEndpoints
{
    public static IEndpointRouteBuilder MapWorkflowEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/workflow", async (
            RunWorkflowRequest request,
            ClaimsService claimsService,
            IClaimWorkflowOrchestrator orchestrator,
            CancellationToken cancellationToken) =>
        {
            var policy = await claimsService.GetPolicyByNumberAsync(request.PolicyNumber);
            var claim = new Claim
            {
                PolicyNumber = request.PolicyNumber,
                ClaimantName = request.ClaimantName,
                ClaimAmount = request.ClaimAmount,
                IncidentDate = request.IncidentDate,
                Description = request.Description,
            };

            var result = await orchestrator.RunAsync(claim, policy, cancellationToken);
            return result.Success
                ? Results.Ok(result)
                : Results.Problem(
                    detail: result.Error ?? "The orchestration did not complete.",
                    statusCode: StatusCodes.Status502BadGateway,
                    title: "Foundry orchestration failed");
        })
        .WithName("RunClaimWorkflow")
        .WithSummary("Runs the Foundry claim orchestrator and returns its connected-agent and MCP trace.")
        .DisableAntiforgery();

        return app;
    }
}
