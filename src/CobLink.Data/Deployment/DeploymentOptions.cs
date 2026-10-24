using System;

namespace CobLink.Data.Deployment
{
    public class DeploymentOptions
    {
        /// <summary>Connection string of the target database; Database / Initial Catalog is required.</summary>
        public string ConnectionString { get; set; }

        /// <summary>The folder that contains the "scripts" (and optionally "sample-data") sub-folders.</summary>
        public string DatabaseFolder { get; set; }

        /// <summary>Also applies sample-data/*.sql after the schema scripts.</summary>
        public bool IncludeSampleData { get; set; }

        /// <summary>How long to keep retrying while SQL Server is still starting (for example in docker compose).</summary>
        public TimeSpan ServerWaitTimeout { get; set; } = TimeSpan.FromSeconds(90);

        /// <summary>Receives one line per significant step. Null = no logging.</summary>
        public Action<string> Log { get; set; }
    }
}
