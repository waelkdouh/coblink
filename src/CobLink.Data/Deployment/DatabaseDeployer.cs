// System.Data.SqlClient is deliberately the legacy provider; moving to Microsoft.Data.SqlClient is a modernization task.
#pragma warning disable CS0618
using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;

namespace CobLink.Data.Deployment
{
    /// <summary>
    /// Creates the database when it is missing and applies the idempotent scripts of the database folder:
    /// scripts/*.sql and, on request, sample-data/*.sql, each folder in ordinal file-name order. A line that consists
    /// only of GO separates batches. Running Deploy repeatedly is safe because the scripts are idempotent.
    /// </summary>
    public static class DatabaseDeployer
    {
        private const string DatabaseFolderName = "database";
        private const string ScriptsFolderName = "scripts";
        private const string SampleDataFolderName = "sample-data";
        private const int RetryDelayMilliseconds = 2000;
        private const int MaxProbeConnectTimeoutSeconds = 5;
        private const int CommandTimeoutSeconds = 120;

        public static DeploymentResult Deploy(DeploymentOptions options)
        {
            SqlConnectionStringBuilder target = ParseTarget(options);
            if (string.IsNullOrWhiteSpace(options.DatabaseFolder))
            {
                throw new ArgumentException("The database folder is required.", "options");
            }

            // Fail on a wrong folder before waiting for the server.
            List<ScriptFile> scripts = FindScripts(options);

            DeploymentResult result = new DeploymentResult();
            WaitForServer(target, options);
            result.DatabaseCreated = EnsureDatabase(target, options);

            foreach (ScriptFile script in scripts)
            {
                int batches = RunScript(target, script);
                result.ScriptsApplied.Add(script.Name);
                result.BatchesExecuted += batches;
                Log(options, "Applied " + script.Name + " (" + batches + (batches == 1 ? " batch)" : " batches)"));
            }

            return result;
        }

        /// <summary>
        /// Drops the target database if it exists. Open sessions are rolled back (SINGLE_USER WITH ROLLBACK IMMEDIATE).
        /// Returns false when there was nothing to drop.
        /// </summary>
        public static bool DropDatabase(DeploymentOptions options)
        {
            SqlConnectionStringBuilder target = ParseTarget(options);
            WaitForServer(target, options);

            using (SqlConnection connection = new SqlConnection(MasterOf(target).ConnectionString))
            {
                connection.Open();
                if (!DatabaseExists(connection, target.InitialCatalog))
                {
                    Log(options, "Database " + QuoteName(target.InitialCatalog) + " does not exist; nothing to drop.");
                    return false;
                }

                string name = QuoteName(target.InitialCatalog);
                ExecuteText(connection, "ALTER DATABASE " + name + " SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE " + name + ";");
                Log(options, "Dropped database " + name + ".");
                return true;
            }
        }

        /// <summary>
        /// Returns the full path of the first "database" directory that contains a "scripts" sub-directory, looking at
        /// startDirectory itself, then startDirectory/database, then the same two places in each parent directory.
        /// Null when none is found.
        /// </summary>
        public static string FindDatabaseFolder(string startDirectory)
        {
            if (string.IsNullOrWhiteSpace(startDirectory))
            {
                return null;
            }

            DirectoryInfo directory = new DirectoryInfo(Path.GetFullPath(startDirectory));
            if (string.Equals(directory.Name, DatabaseFolderName, StringComparison.OrdinalIgnoreCase)
                && Directory.Exists(Path.Combine(directory.FullName, ScriptsFolderName)))
            {
                return directory.FullName;
            }

            while (directory != null)
            {
                string candidate = Path.Combine(directory.FullName, DatabaseFolderName);
                if (Directory.Exists(Path.Combine(candidate, ScriptsFolderName)))
                {
                    return candidate;
                }

                directory = directory.Parent;
            }

            return null;
        }

        /// <summary>
        /// Splits a script into batches at every line that consists only of GO (any case, surrounding whitespace
        /// allowed). The GO lines are not part of the batches and empty batches are skipped. Lines end with \r\n or \n.
        /// The splitter is purely line based and does not parse SQL: a GO line inside a multi-line string literal or a
        /// block comment is not recognised as such and still ends the batch.
        /// </summary>
        public static IList<string> SplitBatches(string script)
        {
            List<string> batches = new List<string>();
            if (string.IsNullOrEmpty(script))
            {
                return batches;
            }

            StringBuilder batch = new StringBuilder();
            int position = 0;
            while (position < script.Length)
            {
                int newLine = script.IndexOf('\n', position);
                int next = newLine < 0 ? script.Length : newLine + 1;
                string line = script.Substring(position, next - position);

                if (string.Equals(line.Trim(), "GO", StringComparison.OrdinalIgnoreCase))
                {
                    AddBatch(batches, batch);
                }
                else
                {
                    batch.Append(line);
                }

                position = next;
            }

            AddBatch(batches, batch);
            return batches;
        }

        private static SqlConnectionStringBuilder ParseTarget(DeploymentOptions options)
        {
            if (options == null)
            {
                throw new ArgumentNullException("options");
            }

            if (string.IsNullOrWhiteSpace(options.ConnectionString))
            {
                throw new ArgumentException("The connection string is required.", "options");
            }

            SqlConnectionStringBuilder target = new SqlConnectionStringBuilder(options.ConnectionString);
            if (string.IsNullOrWhiteSpace(target.InitialCatalog))
            {
                throw new InvalidOperationException(
                    "The connection string does not name a database. Add 'Database=<name>' (or 'Initial Catalog=<name>'); " +
                    "the deployer creates the database when it is missing.");
            }

            // Deployment connections are short lived; pooling would keep sessions open on the database afterwards.
            target.Pooling = false;
            return target;
        }

        private static SqlConnectionStringBuilder MasterOf(SqlConnectionStringBuilder target)
        {
            SqlConnectionStringBuilder master = new SqlConnectionStringBuilder(target.ConnectionString);
            master.InitialCatalog = "master";

            // Keeps every retry short when the server is not reachable (the default timeout is 15 s).
            if (master.ConnectTimeout == 0 || master.ConnectTimeout > MaxProbeConnectTimeoutSeconds)
            {
                master.ConnectTimeout = MaxProbeConnectTimeoutSeconds;
            }

            return master;
        }

        private static void WaitForServer(SqlConnectionStringBuilder target, DeploymentOptions options)
        {
            string connectionString = MasterOf(target).ConnectionString;
            Stopwatch watch = Stopwatch.StartNew();
            int attempt = 0;

            while (true)
            {
                attempt++;
                try
                {
                    using (SqlConnection connection = new SqlConnection(connectionString))
                    {
                        connection.Open();
                    }

                    return;
                }
                catch (SqlException ex)
                {
                    if (watch.Elapsed >= options.ServerWaitTimeout)
                    {
                        throw new InvalidOperationException(
                            "SQL Server '" + target.DataSource + "' did not accept connections within " +
                            (int)options.ServerWaitTimeout.TotalSeconds + " seconds. Last error: " + ex.Message,
                            ex);
                    }

                    Log(
                        options,
                        "SQL Server '" + target.DataSource + "' is not ready (attempt " + attempt + "): " + ex.Message +
                        " Retrying in " + (RetryDelayMilliseconds / 1000) + " s.");
                    Thread.Sleep(RetryDelayMilliseconds);
                }
            }
        }

        private static bool EnsureDatabase(SqlConnectionStringBuilder target, DeploymentOptions options)
        {
            string name = QuoteName(target.InitialCatalog);
            using (SqlConnection connection = new SqlConnection(MasterOf(target).ConnectionString))
            {
                connection.Open();
                if (DatabaseExists(connection, target.InitialCatalog))
                {
                    Log(options, "Database " + name + " already exists.");
                    return false;
                }

                ExecuteText(connection, "CREATE DATABASE " + name + " COLLATE SQL_Latin1_General_CP1_CI_AS");
                Log(options, "Created database " + name + ".");
                return true;
            }
        }

        private static bool DatabaseExists(SqlConnection connection, string databaseName)
        {
            using (SqlCommand command = new SqlCommand("SELECT DB_ID(@name)", connection))
            {
                command.Parameters.Add("@name", SqlDbType.NVarChar, 128).Value = databaseName;
                object id = command.ExecuteScalar();
                return id != null && id != DBNull.Value;
            }
        }

        private static void ExecuteText(SqlConnection connection, string commandText)
        {
            using (SqlCommand command = new SqlCommand(commandText, connection))
            {
                command.CommandTimeout = CommandTimeoutSeconds;
                command.ExecuteNonQuery();
            }
        }

        // The name is escaped, never concatenated as is.
        private static string QuoteName(string name)
        {
            return "[" + name.Replace("]", "]]") + "]";
        }

        private static List<ScriptFile> FindScripts(DeploymentOptions options)
        {
            List<ScriptFile> scripts = new List<ScriptFile>();
            AddScripts(scripts, options.DatabaseFolder, ScriptsFolderName);
            if (options.IncludeSampleData)
            {
                AddScripts(scripts, options.DatabaseFolder, SampleDataFolderName);
            }

            return scripts;
        }

        private static void AddScripts(List<ScriptFile> scripts, string databaseFolder, string subFolderName)
        {
            string folder = Path.Combine(databaseFolder, subFolderName);
            if (!Directory.Exists(folder))
            {
                throw new DirectoryNotFoundException("The '" + subFolderName + "' folder was not found: " + folder);
            }

            List<string> fileNames = new List<string>();
            foreach (string path in Directory.GetFiles(folder))
            {
                if (string.Equals(Path.GetExtension(path), ".sql", StringComparison.OrdinalIgnoreCase))
                {
                    fileNames.Add(Path.GetFileName(path));
                }
            }

            fileNames.Sort(StringComparer.Ordinal);
            foreach (string fileName in fileNames)
            {
                scripts.Add(new ScriptFile(subFolderName + "/" + fileName, Path.Combine(folder, fileName)));
            }
        }

        private static int RunScript(SqlConnectionStringBuilder target, ScriptFile script)
        {
            IList<string> batches = SplitBatches(File.ReadAllText(script.FullPath, Encoding.UTF8));

            // A connection per script keeps SET options of one script from leaking into the next; the connection
            // keeps the ADO.NET defaults (QUOTED_IDENTIFIER ON), which the persisted computed columns need.
            using (SqlConnection connection = new SqlConnection(target.ConnectionString))
            {
                connection.Open();
                for (int index = 0; index < batches.Count; index++)
                {
                    try
                    {
                        ExecuteText(connection, batches[index]);
                    }
                    catch (SqlException ex)
                    {
                        throw new InvalidOperationException(
                            "Script '" + script.Name + "', batch " + (index + 1) + " of " + batches.Count + " failed: " +
                            ex.Message + " (SQL error " + ex.Number + ", line " + ex.LineNumber + " of the batch)",
                            ex);
                    }
                }
            }

            return batches.Count;
        }

        private static void AddBatch(List<string> batches, StringBuilder batch)
        {
            string text = batch.ToString().Trim();
            if (text.Length > 0)
            {
                batches.Add(text);
            }

            batch.Clear();
        }

        private static void Log(DeploymentOptions options, string message)
        {
            if (options.Log != null)
            {
                options.Log(message);
            }
        }

        private sealed class ScriptFile
        {
            public ScriptFile(string name, string fullPath)
            {
                Name = name;
                FullPath = fullPath;
            }

            /// <summary>Path relative to the database folder, with forward slashes (scripts/010_Schema.sql).</summary>
            public string Name { get; private set; }

            public string FullPath { get; private set; }
        }
    }
}
