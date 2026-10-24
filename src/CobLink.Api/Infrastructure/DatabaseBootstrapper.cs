using System;
using CobLink.Data.Deployment;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CobLink.Api.Infrastructure
{
    /// <summary>
    /// Applies the database scripts when the API starts and Database:AutoDeploy is true (Development and Demo; off by
    /// default). Production databases are deployed with tools/CobLink.DbDeploy or your own release pipeline.
    /// </summary>
    public static class DatabaseBootstrapper
    {
        public static void Run(IServiceProvider services)
        {
            IConfiguration configuration = services.GetRequiredService<IConfiguration>();
            if (!configuration.GetValue<bool>("Database:AutoDeploy"))
            {
                return;
            }

            IHostEnvironment environment = services.GetRequiredService<IHostEnvironment>();
            ILogger logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("CobLink.Database");

            bool seedSampleData = configuration.GetValue<bool>("Database:SeedSampleData");
            if (seedSampleData && !AllowsSampleData(environment))
            {
                throw new InvalidOperationException(
                    "Database:SeedSampleData loads fictional demo data and is only allowed in the Development, Demo and Testing environments (current: "
                    + environment.EnvironmentName + ").");
            }

            string connectionString = configuration.GetConnectionString("CobLink");
            if (string.IsNullOrWhiteSpace(connectionString))
            {
                throw new InvalidOperationException("ConnectionStrings:CobLink is not configured.");
            }

            string databaseFolder = DatabaseDeployer.FindDatabaseFolder(AppContext.BaseDirectory);
            if (databaseFolder == null)
            {
                throw new InvalidOperationException(
                    "The database scripts were not found next to the application (looked for a 'database' folder from "
                    + AppContext.BaseDirectory + " upwards).");
            }

            DeploymentOptions options = new DeploymentOptions
            {
                ConnectionString = connectionString,
                DatabaseFolder = databaseFolder,
                IncludeSampleData = seedSampleData,
                Log = message => logger.LogInformation("{Message}", message)
            };

            logger.LogInformation("Deploying the database from {Folder} (sample data: {SampleData}).", databaseFolder, seedSampleData);
            DeploymentResult result = DatabaseDeployer.Deploy(options);
            logger.LogInformation(
                "Database ready: {Scripts} scripts, {Batches} batches{Created}.",
                result.ScriptsApplied.Count,
                result.BatchesExecuted,
                result.DatabaseCreated ? ", database created" : string.Empty);
        }

        private static bool AllowsSampleData(IHostEnvironment environment)
        {
            return environment.IsDevelopment()
                || environment.IsEnvironment("Demo")
                || environment.IsEnvironment("Testing");
        }
    }
}
