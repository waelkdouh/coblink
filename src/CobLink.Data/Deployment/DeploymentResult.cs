using System.Collections.Generic;

namespace CobLink.Data.Deployment
{
    public class DeploymentResult
    {
        /// <summary>True when the database did not exist and was created by this run.</summary>
        public bool DatabaseCreated { get; set; }

        /// <summary>Scripts applied in order, relative to the database folder with forward slashes (scripts/010_Schema.sql).</summary>
        public IList<string> ScriptsApplied { get; set; } = new List<string>();

        /// <summary>Number of GO-separated batches executed across all scripts.</summary>
        public int BatchesExecuted { get; set; }
    }
}
