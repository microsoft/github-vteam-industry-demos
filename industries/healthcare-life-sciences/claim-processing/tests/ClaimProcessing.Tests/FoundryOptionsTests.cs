using ClaimProcessing.Foundry;

namespace ClaimProcessing.Tests;

public class FoundryOptionsTests
{
    [Fact]
    public void DirectFoundryConfiguration_UsesProjectEndpointAndFoundryScope()
    {
        var options = new FoundryOptions
        {
            Endpoint = "https://example.services.ai.azure.com/api/projects/claims/",
        };

        Assert.Equal(
            "https://example.services.ai.azure.com/api/projects/claims",
            options.GetAgentApiBaseUrl());
        Assert.Equal("https://ai.azure.com/.default", options.GetTokenScope());
    }

    [Fact]
    public void GatewayConfiguration_AddsOpenAiPathAndDefaultScope()
    {
        var options = new FoundryOptions
        {
            GatewayEndpoint = "https://gateway.azure-api.net/foundry/",
            GatewayTokenScope = "api://claim-processing-apim",
        };

        Assert.Equal(
            "https://gateway.azure-api.net/foundry/openai",
            options.GetAgentApiBaseUrl());
        Assert.Equal("api://claim-processing-apim/.default", options.GetTokenScope());
    }

    [Fact]
    public void GatewayConfiguration_RequiresTokenScope()
    {
        var options = new FoundryOptions
        {
            GatewayEndpoint = "https://gateway.azure-api.net/foundry",
        };

        var error = Assert.Throws<InvalidOperationException>(options.GetTokenScope);
        Assert.Contains("GatewayTokenScope", error.Message);
    }
}
