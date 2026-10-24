# Build context is the repository root:  docker build -f src/CobLink.Api/Dockerfile -t coblink-api .
# Baseline stack: .NET 8 (out of support from 2026-11-10; the modernization exercise moves this to .NET 10).

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Restore first so the package layer is cached until a project file changes.
COPY global.json Directory.Build.props ./
COPY src/CobLink.Models/CobLink.Models.csproj src/CobLink.Models/
COPY src/CobLink.Data/CobLink.Data.csproj src/CobLink.Data/
COPY src/CobLink.Business/CobLink.Business.csproj src/CobLink.Business/
COPY src/CobLink.Api/CobLink.Api.csproj src/CobLink.Api/
RUN dotnet restore src/CobLink.Api/CobLink.Api.csproj

COPY src/ src/
# The SQL scripts are published next to the binaries (Database:AutoDeploy reads them at start-up).
COPY database/ database/
RUN dotnet publish src/CobLink.Api/CobLink.Api.csproj -c Release --no-restore -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

# Windows authentication is not available in a Linux container; Demo uses the X-CobLink-User header instead
# (see README, "Authentication"). Never expose a Demo container to an untrusted network.
# The .NET 8 base image already listens on port 8080 (ASPNETCORE_HTTP_PORTS) as a non-root user.
ENV ASPNETCORE_ENVIRONMENT=Demo
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "CobLink.Api.dll"]
