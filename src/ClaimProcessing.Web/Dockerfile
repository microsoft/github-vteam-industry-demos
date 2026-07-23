# Multi-stage build for the ClaimProcessing Blazor portal (.NET 9).
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Restore against the solution's project graph.
COPY ClaimProcessing.sln ./
COPY src/ClaimProcessing.Core/ClaimProcessing.Core.csproj src/ClaimProcessing.Core/
COPY src/ClaimProcessing.PolicyEngine/ClaimProcessing.PolicyEngine.csproj src/ClaimProcessing.PolicyEngine/
COPY src/ClaimProcessing.Foundry/ClaimProcessing.Foundry.csproj src/ClaimProcessing.Foundry/
COPY src/ClaimProcessing.Web/ClaimProcessing.Web.csproj src/ClaimProcessing.Web/
RUN dotnet restore src/ClaimProcessing.Web/ClaimProcessing.Web.csproj

# Build + publish the web app.
COPY . .
RUN dotnet publish src/ClaimProcessing.Web/ClaimProcessing.Web.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

# Container Apps routes to this port.
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
ENTRYPOINT ["dotnet", "ClaimProcessing.Web.dll"]
