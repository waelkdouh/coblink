// System.Data.SqlClient is deliberately the legacy provider; moving to Microsoft.Data.SqlClient is a modernization task.
#pragma warning disable CS0618
using System;
using System.Data.SqlClient;
using System.Globalization;
using CobLink.Data.Deployment;

namespace CobLink.Data.Tests.Infrastructure
{
    /// <summary>
    /// A uniquely named scratch database on the server named by COBLINK_TEST_CONNECTION. It is built by the real
    /// deployer from the real scripts (database/scripts, optionally database/sample-data) and dropped on Dispose.
    /// </summary>
    public sealed class TestDatabase : IDisposable
    {
        private readonly DeploymentOptions _options;

        private TestDatabase(string name, string connectionString, string databaseFolder)
        {
            Name = name;
            ConnectionString = connectionString;
            DatabaseFolder = databaseFolder;
            _options = new DeploymentOptions
            {
                ConnectionString = connectionString,
                DatabaseFolder = databaseFolder,
                ServerWaitTimeout = TimeSpan.FromSeconds(60)
            };
        }

        public string Name { get; private set; }

        /// <summary>Connection string of the scratch database (never the server's master database).</summary>
        public string ConnectionString { get; private set; }

        /// <summary>The repository's database folder (scripts and sample data).</summary>
        public string DatabaseFolder { get; private set; }

        /// <summary>Creates the scratch database and deploys the schema, plus the demo data when asked.</summary>
        public static TestDatabase Create(bool includeSampleData)
        {
            TestDatabase database = CreateUndeployed();
            try
            {
                database.Deploy(includeSampleData);
                return database;
            }
            catch
            {
                database.Dispose();
                throw;
            }
        }

        /// <summary>Reserves a unique name only; nothing exists on the server until Deploy is called.</summary>
        public static TestDatabase CreateUndeployed()
        {
            if (!TestEnvironment.HasSqlServer)
            {
                throw new InvalidOperationException(TestEnvironment.SkipReason);
            }

            string databaseFolder = DatabaseDeployer.FindDatabaseFolder(AppContext.BaseDirectory);
            if (databaseFolder == null)
            {
                throw new InvalidOperationException(
                    "The repository's database folder was not found above " + AppContext.BaseDirectory + ".");
            }

            SqlConnectionStringBuilder builder = new SqlConnectionStringBuilder(TestEnvironment.ServerConnectionString);
            string name = "CobLinkTest_" + Guid.NewGuid().ToString("N").Substring(0, 12);
            builder.InitialCatalog = name;
            return new TestDatabase(name, builder.ConnectionString, databaseFolder);
        }

        public DeploymentResult Deploy(bool includeSampleData)
        {
            _options.IncludeSampleData = includeSampleData;
            return DatabaseDeployer.Deploy(_options);
        }

        public bool Drop()
        {
            // Pooled sessions of this database are rolled back by the drop; forget them so no one reuses a dead one.
            using (SqlConnection connection = new SqlConnection(ConnectionString))
            {
                SqlConnection.ClearPool(connection);
            }

            return DatabaseDeployer.DropDatabase(_options);
        }

        public void Dispose()
        {
            try
            {
                Drop();
            }
            catch (Exception)
            {
                // A scratch database that cannot be dropped must not hide the result of the test that used it.
            }
        }

        // ---- plain SQL for arranging and checking what the repositories did --------------------------------------

        public int Execute(string sql)
        {
            using (SqlConnection connection = new SqlConnection(ConnectionString))
            using (SqlCommand command = new SqlCommand(sql, connection))
            {
                connection.Open();
                return command.ExecuteNonQuery();
            }
        }

        public T Scalar<T>(string sql)
        {
            using (SqlConnection connection = new SqlConnection(ConnectionString))
            using (SqlCommand command = new SqlCommand(sql, connection))
            {
                connection.Open();
                object value = command.ExecuteScalar();
                if (value == null || value == DBNull.Value)
                {
                    return default(T);
                }

                return (T)Convert.ChangeType(value, typeof(T), CultureInfo.InvariantCulture);
            }
        }

        /// <summary>The database's idea of "today" (GETDATE), which drives IsOverdue and the dashboard.</summary>
        public DateTime ServerToday()
        {
            return Scalar<DateTime>("SELECT CAST(GETDATE() AS date)").Date;
        }

        public DateTime ServerUtcNow()
        {
            return DateTime.SpecifyKind(Scalar<DateTime>("SELECT SYSUTCDATETIME()"), DateTimeKind.Utc);
        }
    }
}
