using ClaimProcessing.Core.Models;
using ClaimProcessing.Web.Services;

namespace ClaimProcessing.Web.Endpoints;

/// <summary>Request DTO for JSON-body claim submission.</summary>
public record SubmitClaimJsonRequest(
    string PolicyNumber,
    string ClaimantName,
    decimal ClaimAmount,
    DateTime IncidentDate,
    string Description,
    string? DocumentFileName = null,
    /// <summary>Optional Base64-encoded document content.</summary>
    string? DocumentContentBase64 = null,
    string? DocumentContentType = null);

/// <summary>Typed response envelope returned by claim submission endpoints.</summary>
public record SubmitClaimResponse(Claim Claim, ClaimDecision Decision);

public static class ClaimsEndpoints
{
    public static IEndpointRouteBuilder MapClaimsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/claims").WithTags("Claims");

        // GET /api/claims — list all claims (with embedded decisions)
        group.MapGet("/", async (ClaimsService svc) =>
        {
            var claims = await svc.GetAllClaimsAsync();
            return Results.Ok(claims);
        })
        .WithName("GetAllClaims")
        .WithSummary("Returns all submitted claims with their evaluation decisions.");

        // GET /api/claims/{id} — get a single claim by id
        group.MapGet("/{id:guid}", async (Guid id, ClaimsService svc) =>
        {
            var claim = await svc.GetClaimByIdAsync(id);
            return claim is null ? Results.NotFound() : Results.Ok(claim);
        })
        .WithName("GetClaimById")
        .WithSummary("Returns a single claim by its GUID.");

        // POST /api/claims — submit a new claim
        //   • application/json     → SubmitClaimJsonRequest (optional Base64 document)
        //   • multipart/form-data  → form fields + optional file upload
        group.MapPost("/", async (HttpContext ctx, ClaimsService svc) =>
        {
            if (ctx.Request.HasFormContentType)
                return await HandleFormSubmitAsync(ctx.Request, svc);

            if (ctx.Request.ContentType?.Contains("application/json", StringComparison.OrdinalIgnoreCase) == true)
                return await HandleJsonSubmitAsync(ctx.Request, svc);

            return Results.BadRequest("Content-Type must be 'multipart/form-data' or 'application/json'.");
        })
        .WithName("SubmitClaim")
        .WithSummary("Submits a new claim via JSON body or multipart form upload.")
        .DisableAntiforgery();

        return app;
    }

    // ─── private helpers ──────────────────────────────────────────────────────

    private static async Task<IResult> HandleFormSubmitAsync(HttpRequest request, ClaimsService svc)
    {
        var form = await request.ReadFormAsync();

        var policyNumber = form["policyNumber"].ToString();
        var claimantName = form["claimantName"].ToString();
        var description  = form["description"].ToString();

        if (!decimal.TryParse(form["claimAmount"], System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var claimAmount))
            return Results.BadRequest("Invalid claim amount.");

        if (!DateTime.TryParse(form["incidentDate"], System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None, out var incidentDate))
            return Results.BadRequest("Invalid incident date. Expected ISO 8601 format (yyyy-MM-dd).");

        byte[]? docContent     = null;
        string? docFileName    = null;
        string? docContentType = null;

        var file = form.Files.GetFile("document");
        if (file is not null)
        {
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            docContent     = ms.ToArray();
            docFileName    = file.FileName;
            docContentType = file.ContentType;
        }

        var (claim, decision) = await svc.SubmitClaimAsync(
            policyNumber, claimantName, claimAmount, incidentDate, description,
            docFileName, docContent, docContentType);

        return Results.Created($"/api/claims/{claim.Id}", new SubmitClaimResponse(claim, decision));
    }

    private static async Task<IResult> HandleJsonSubmitAsync(HttpRequest request, ClaimsService svc)
    {
        SubmitClaimJsonRequest? dto;
        try
        {
            dto = await request.ReadFromJsonAsync<SubmitClaimJsonRequest>();
        }
        catch (Exception ex)
        {
            return Results.BadRequest($"Invalid JSON body: {ex.Message}");
        }

        if (dto is null)
            return Results.BadRequest("Request body is required.");

        byte[]? docContent     = null;
        string? docFileName    = dto.DocumentFileName;
        string? docContentType = dto.DocumentContentType;

        if (!string.IsNullOrWhiteSpace(dto.DocumentContentBase64))
        {
            try
            {
                docContent = Convert.FromBase64String(dto.DocumentContentBase64);
            }
            catch (FormatException)
            {
                return Results.BadRequest("DocumentContentBase64 is not valid Base64.");
            }
        }

        var (claim, decision) = await svc.SubmitClaimAsync(
            dto.PolicyNumber, dto.ClaimantName, dto.ClaimAmount, dto.IncidentDate,
            dto.Description, docFileName, docContent, docContentType);

        return Results.Created($"/api/claims/{claim.Id}", new SubmitClaimResponse(claim, decision));
    }
}
