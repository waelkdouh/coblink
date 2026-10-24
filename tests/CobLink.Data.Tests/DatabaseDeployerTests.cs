// System.Data.SqlClient is deliberately the legacy provider; moving to Microsoft.Data.SqlClient is a modernization task.
#pragma warning disable CS0618
using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Diagnostics;
using System.IO;
using System.Linq;
using CobLink.Data.Deployment;
using CobLink.Data.Tests.Infrastructure;
using CobLink.Models;
using Xunit;

namespace CobLink.Data.Tests
{
    /// <summary>
    /// Tests of the deployer that builds the database from database/scripts (and database/sample-data). The first
    /// half needs no server: batch splitting, folder discovery, argument checks and the behaviour against a server
    /// that is not there. The second half deploys into scratch databases, first with tiny scripts written by the
    /// test, then with the real ones.
    /// </summary>
    public class DatabaseDeployerTests
    {
        // Nothing listens on port 1 of the loopback interface, so the connection is refused at once.
        private const string UnreachableServer =
            "Server=127.0.0.1,1;Database=CobLinkNoServer;Integrated Security=True;Connect Timeout=2";

        private const string ExpectedTables =
            "Activity,ActivityNote,AppUser,LkpActivityPriority,LkpActivityStatus,LkpActivityType,LkpRecoveryMethod," +
            "LkpTakebackReason,LkpTakebackStatus,LkpUserRole,Member,Provider,Takeback,TakebackHistory,TakebackRecovery";

        // ---- SplitBatches ---------------------------------------------------------------------------------------

        [Fact]
        public void SplitBatches_cuts_the_script_at_lines_that_only_contain_GO()
        {
            IList<string> batches = DatabaseDeployer.SplitBatches("SELECT 1;\nGO\nSELECT 2;\nGO\n");

            Assert.Equal(new[] { "SELECT 1;", "SELECT 2;" }, batches);
        }

        [Fact]
        public void SplitBatches_keeps_the_last_batch_when_the_script_does_not_end_with_GO()
        {
            IList<string> batches = DatabaseDeployer.SplitBatches("SELECT 1;\nGO\nSELECT 2;");

            Assert.Equal(new[] { "SELECT 1;", "SELECT 2;" }, batches);
        }

        [Fact]
        public void SplitBatches_keeps_the_line_breaks_inside_a_batch_and_understands_windows_line_endings()
        {
            IList<string> batches = DatabaseDeployer.SplitBatches(
                "CREATE VIEW dbo.V AS\r\nSELECT 1 AS X;\r\nGO\r\nSELECT 2;\r\nGO\r\n");

            Assert.Equal(new[] { "CREATE VIEW dbo.V AS\r\nSELECT 1 AS X;", "SELECT 2;" }, batches);
        }

        [Theory]
        [InlineData("go")]
        [InlineData("Go")]
        [InlineData("  GO")]
        [InlineData("GO  ")]
        [InlineData("\tgO\t")]
        public void SplitBatches_recognises_GO_in_any_case_with_surrounding_whitespace(string separator)
        {
            IList<string> batches = DatabaseDeployer.SplitBatches("SELECT 1;\n" + separator + "\nSELECT 2;");

            Assert.Equal(new[] { "SELECT 1;", "SELECT 2;" }, batches);
        }

        [Theory]
        [InlineData("GO 2")]
        [InlineData("GOTO done")]
        [InlineData("GO;")]
        [InlineData("GOO")]
        [InlineData("-- GO")]
        [InlineData("SELECT 'GO'")]
        public void SplitBatches_does_not_split_at_a_line_that_merely_contains_GO(string line)
        {
            string script = "SELECT 1;\n" + line + "\nSELECT 2;";

            IList<string> batches = DatabaseDeployer.SplitBatches(script);

            Assert.Equal(new[] { script }, batches);
        }

        [Fact]
        public void SplitBatches_skips_empty_batches()
        {
            IList<string> batches = DatabaseDeployer.SplitBatches("GO\n\nGO\nSELECT 1;\nGO\n   \nGO\n");

            Assert.Equal(new[] { "SELECT 1;" }, batches);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("  \r\n\t\n")]
        [InlineData("GO")]
        [InlineData("GO\nGO\n")]
        public void SplitBatches_returns_nothing_for_a_script_without_statements(string script)
        {
            Assert.Empty(DatabaseDeployer.SplitBatches(script));
        }

        [Fact]
        public void SplitBatches_is_line_based_and_does_not_parse_sql_so_a_GO_line_in_a_comment_still_splits()
        {
            // Characterization of a known limitation, documented on the method: keep GO out of comments and literals.
            IList<string> batches = DatabaseDeployer.SplitBatches("/*\nGO\n*/\nSELECT 1;");

            Assert.Equal(new[] { "/*", "*/\nSELECT 1;" }, batches);
        }

        // ---- FindDatabaseFolder ---------------------------------------------------------------------------------

        [Fact]
        public void FindDatabaseFolder_looks_in_the_start_directory_and_in_every_parent_directory()
        {
            using (TempDatabaseFolder temp = new TempDatabaseFolder())
            {
                string deep = temp.CreateDirectory("src", "CobLink.Api", "bin", "Debug");

                Assert.Equal(temp.DatabaseFolder, DatabaseDeployer.FindDatabaseFolder(deep));
                Assert.Equal(temp.DatabaseFolder, DatabaseDeployer.FindDatabaseFolder(temp.Root));
            }
        }

        [Fact]
        public void FindDatabaseFolder_accepts_the_database_folder_itself()
        {
            using (TempDatabaseFolder temp = new TempDatabaseFolder())
            {
                Assert.Equal(temp.DatabaseFolder, DatabaseDeployer.FindDatabaseFolder(temp.DatabaseFolder));
            }
        }

        [Fact]
        public void FindDatabaseFolder_prefers_the_nearest_database_folder()
        {
            using (TempDatabaseFolder temp = new TempDatabaseFolder())
            {
                string nearest = temp.CreateDirectory("module", "database", "scripts");
                string start = temp.CreateDirectory("module", "deeper");

                Assert.Equal(Directory.GetParent(nearest).FullName, DatabaseDeployer.FindDatabaseFolder(start));
            }
        }

        [Fact]
        public void FindDatabaseFolder_ignores_a_database_folder_without_scripts()
        {
            using (TempDatabaseFolder temp = new TempDatabaseFolder(false, false))
            {
                Assert.Null(DatabaseDeployer.FindDatabaseFolder(temp.DatabaseFolder));
                Assert.Null(DatabaseDeployer.FindDatabaseFolder(temp.Root));
            }
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        public void FindDatabaseFolder_returns_null_without_a_start_directory(string start)
        {
            Assert.Null(DatabaseDeployer.FindDatabaseFolder(start));
        }

        [Fact]
        public void FindDatabaseFolder_finds_the_repository_scripts_from_the_test_output_directory()
        {
            string folder = DatabaseDeployer.FindDatabaseFolder(AppContext.BaseDirectory);

            Assert.NotNull(folder);
            Assert.True(File.Exists(Path.Combine(folder, "scripts", "010_Schema.sql")));
            Assert.True(File.Exists(Path.Combine(folder, "sample-data", "900_SampleData.sql")));
        }

        // ---- arguments and a server that is not there -----------------------------------------------------------

        [Fact]
        public void Deploy_requires_options()
        {
            ArgumentNullException ex = Assert.Throws<ArgumentNullException>(() => DatabaseDeployer.Deploy(null));

            Assert.Equal("options", ex.ParamName);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        public void Deploy_requires_a_connection_string(string connectionString)
        {
            ArgumentException ex = Assert.Throws<ArgumentException>(() => DatabaseDeployer.Deploy(
                new DeploymentOptions { ConnectionString = connectionString, DatabaseFolder = "database" }));

            Assert.Contains("connection string is required", ex.Message);
        }

        [Fact]
        public void Deploy_requires_the_connection_string_to_name_a_database()
        {
            InvalidOperationException ex = Assert.Throws<InvalidOperationException>(() => DatabaseDeployer.Deploy(
                new DeploymentOptions { ConnectionString = "Server=127.0.0.1,1;Integrated Security=True", DatabaseFolder = "database" }));

            Assert.Contains("does not name a database", ex.Message);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        public void Deploy_requires_a_database_folder(string databaseFolder)
        {
            ArgumentException ex = Assert.Throws<ArgumentException>(() => DatabaseDeployer.Deploy(
                new DeploymentOptions { ConnectionString = UnreachableServer, DatabaseFolder = databaseFolder }));

            Assert.Contains("The database folder is required.", ex.Message);
        }

        [Fact]
        public void Deploy_reports_a_missing_scripts_folder_before_it_contacts_the_server()
        {
            using (TempDatabaseFolder temp = new TempDatabaseFolder(false, false))
            {
                DirectoryNotFoundException ex = Assert.Throws<DirectoryNotFoundException>(
                    () => DatabaseDeployer.Deploy(UnreachableOptions(temp.DatabaseFolder, false)));

                Assert.Contains("The 'scripts' folder was not found", ex.Message);
                Assert.Contains(temp.ScriptsFolder, ex.Message);
            }
        }

        [Fact]
        public void Deploy_needs_the_sample_data_folder_only_when_sample_data_is_requested()
        {
            using (TempDatabaseFolder temp = new TempDatabaseFolder(true, false))
            {
                temp.AddScript("010_a.sql", "SELECT 1;");

                DirectoryNotFoundException missing = Assert.Throws<DirectoryNotFoundException>(
                    () => DatabaseDeployer.Deploy(UnreachableOptions(temp.DatabaseFolder, true)));
                Assert.Contains("The 'sample-data' folder was not found", missing.Message);

                // Without sample data the folders are fine and the deployer goes on to the server, which is not there.
                InvalidOperationException unreachable = Assert.Throws<InvalidOperationException>(
                    () => DatabaseDeployer.Deploy(UnreachableOptions(temp.DatabaseFolder, false)));
                Assert.Contains("did not accept connections", unreachable.Message);
            }
        }

        [Fact]
        public void Deploy_gives_up_when_the_server_does_not_answer_within_the_wait_time()
        {
            using (TempDatabaseFolder temp = new TempDatabaseFolder())
            {
                temp.AddScript("010_a.sql", "SELECT 1;");

                InvalidOperationException ex = Assert.Throws<InvalidOperationException>(
                    () => DatabaseDeployer.Deploy(UnreachableOptions(temp.DatabaseFolder, false)));

                Assert.Contains("SQL Server '127.0.0.1,1' did not accept connections within 0 seconds. Last error: ", ex.Message);
                Assert.IsType<SqlException>(ex.InnerException);
            }
        }

        [Fact]
        public void Deploy_keeps_retrying_and_logging_until_the_wait_time_is_over()
        {
            using (TempDatabaseFolder temp = new TempDatabaseFolder())
            {
                temp.AddScript("010_a.sql", "SELECT 1;");
                List<string> log = new List<string>();
                DeploymentOptions options = Options(UnreachableServer, temp.DatabaseFolder, false, log);
                options.ServerWaitTimeout = TimeSpan.FromSeconds(1);
                Stopwatch watch = Stopwatch.StartNew();

                InvalidOperationException ex = Assert.Throws<InvalidOperationException>(() => DatabaseDeployer.Deploy(options));

                Assert.Contains("within 1 seconds", ex.Message);
                Assert.True(watch.Elapsed >= TimeSpan.FromSeconds(1), "the deployer tries for the whole wait time");
                Assert.All(log, line =>
                {
                    Assert.Contains("is not ready (attempt ", line);
                    Assert.Contains("Retrying in 2 s.", line);
                });
            }
        }

        [Fact]
        public void DropDatabase_checks_its_options()
        {
            Assert.Throws<ArgumentNullException>(() => DatabaseDeployer.DropDatabase(null));
            Assert.Throws<ArgumentException>(() => DatabaseDeployer.DropDatabase(new DeploymentOptions { ConnectionString = " " }));
            Assert.Throws<InvalidOperationException>(() => DatabaseDeployer.DropDatabase(
                new DeploymentOptions { ConnectionString = "Server=127.0.0.1,1;Integrated Security=True" }));
        }

        [Fact]
        public void DropDatabase_gives_up_when_the_server_does_not_answer()
        {
            InvalidOperationException ex = Assert.Throws<InvalidOperationException>(
                () => DatabaseDeployer.DropDatabase(UnreachableOptions(null, false)));

            Assert.Contains("did not accept connections", ex.Message);
        }

        // ---- deployment with small scripts ----------------------------------------------------------------------

        [SqlFact]
        public void Deploy_creates_the_database_and_applies_the_scripts_in_file_name_order()
        {
            using (TestDatabase db = TestDatabase.CreateUndeployed())
            using (TempDatabaseFolder temp = new TempDatabaseFolder())
            {
                // Written in reverse order on purpose: 020 needs the table that 010 creates.
                temp.AddScript("030_third.sql", "INSERT INTO dbo.Trace (Step) VALUES (N'third');");
                temp.AddScript("020_second.sql",
                    "INSERT INTO dbo.Trace (Step) VALUES (N'second');\nGO\nINSERT INTO dbo.Trace (Step) VALUES (N'second again');");
                temp.AddScript("010_first.sql",
                    "CREATE TABLE dbo.Trace (Id int IDENTITY(1, 1) PRIMARY KEY, Step nvarchar(20) NOT NULL);");
                temp.AddScript("notes.txt", "Not a script: it would fail if it were run.");
                temp.AddScript("040_backup.sql.bak", "SELECT * FROM dbo.DoesNotExist;");
                List<string> log = new List<string>();

                DeploymentResult result = DatabaseDeployer.Deploy(Options(db.ConnectionString, temp.DatabaseFolder, false, log));

                Assert.True(result.DatabaseCreated);
                Assert.Equal(new[] { "scripts/010_first.sql", "scripts/020_second.sql", "scripts/030_third.sql" }, result.ScriptsApplied);
                Assert.Equal(4, result.BatchesExecuted);
                Assert.Equal("second|second again|third",
                    db.Scalar<string>("SELECT STRING_AGG(Step, N'|') WITHIN GROUP (ORDER BY Id) FROM dbo.Trace"));
                Assert.Equal(
                    new[]
                    {
                        "Created database [" + db.Name + "].",
                        "Applied scripts/010_first.sql (1 batch)",
                        "Applied scripts/020_second.sql (2 batches)",
                        "Applied scripts/030_third.sql (1 batch)"
                    },
                    log);
            }
        }

        [SqlFact]
        public void Deploy_orders_script_names_ordinally()
        {
            using (TestDatabase db = TestDatabase.CreateUndeployed())
            using (TempDatabaseFolder temp = new TempDatabaseFolder())
            {
                temp.AddScript("a.sql", "SELECT 1;");
                temp.AddScript("C.sql", "SELECT 1;");
                temp.AddScript("B.sql", "SELECT 1;");

                DeploymentResult result = DatabaseDeployer.Deploy(Options(db.ConnectionString, temp.DatabaseFolder, false, null));

                // Ordinal order puts every upper case letter before every lower case one; plain numeric prefixes avoid surprises.
                Assert.Equal(new[] { "scripts/B.sql", "scripts/C.sql", "scripts/a.sql" }, result.ScriptsApplied);
            }
        }

        [SqlFact]
        public void Deploy_can_run_again_and_then_finds_the_database_it_created()
        {
            using (TestDatabase db = TestDatabase.CreateUndeployed())
            using (TempDatabaseFolder temp = new TempDatabaseFolder())
            {
                temp.AddScript("010_item.sql",
                    "IF OBJECT_ID(N'dbo.Item', N'U') IS NULL\n    CREATE TABLE dbo.Item (Id int NOT NULL);\nGO\n" +
                    "IF NOT EXISTS (SELECT 1 FROM dbo.Item) INSERT INTO dbo.Item (Id) VALUES (1);");
                List<string> log = new List<string>();

                DeploymentResult first = DatabaseDeployer.Deploy(Options(db.ConnectionString, temp.DatabaseFolder, false, log));
                DeploymentResult second = DatabaseDeployer.Deploy(Options(db.ConnectionString, temp.DatabaseFolder, false, log));

                Assert.True(first.DatabaseCreated);
                Assert.False(second.DatabaseCreated);
                Assert.Equal(1, db.Scalar<int>("SELECT COUNT(*) FROM dbo.Item"));
                Assert.Contains("Database [" + db.Name + "] already exists.", log);
            }
        }

        [SqlFact]
        public void Deploy_applies_the_sample_data_after_the_scripts_and_only_when_asked()
        {
            using (TestDatabase db = TestDatabase.CreateUndeployed())
            using (TempDatabaseFolder temp = new TempDatabaseFolder())
            {
                temp.AddScript("010_person.sql", "IF OBJECT_ID(N'dbo.Person', N'U') IS NULL CREATE TABLE dbo.Person (Name nvarchar(50) NOT NULL);");
                temp.AddSampleData("900_people.sql", "INSERT INTO dbo.Person (Name) VALUES (N'Ada');");

                DeploymentResult schemaOnly = DatabaseDeployer.Deploy(Options(db.ConnectionString, temp.DatabaseFolder, false, null));
                Assert.Equal(new[] { "scripts/010_person.sql" }, schemaOnly.ScriptsApplied);
                Assert.Equal(0, db.Scalar<int>("SELECT COUNT(*) FROM dbo.Person"));

                DeploymentResult withSampleData = DatabaseDeployer.Deploy(Options(db.ConnectionString, temp.DatabaseFolder, true, null));
                Assert.Equal(new[] { "scripts/010_person.sql", "sample-data/900_people.sql" }, withSampleData.ScriptsApplied);
                Assert.Equal(1, db.Scalar<int>("SELECT COUNT(*) FROM dbo.Person"));
            }
        }

        [SqlFact]
        public void A_failing_batch_stops_the_deployment_and_names_the_script_and_the_batch()
        {
            using (TestDatabase db = TestDatabase.CreateUndeployed())
            using (TempDatabaseFolder temp = new TempDatabaseFolder())
            {
                temp.AddScript("010_good.sql", "CREATE TABLE dbo.Done (Id int NOT NULL);");
                temp.AddScript("020_bad.sql", "SELECT 1;\nGO\nSELECT 1 / 0;");
                temp.AddScript("030_never.sql", "CREATE TABLE dbo.Never (Id int NOT NULL);");
                List<string> log = new List<string>();

                InvalidOperationException ex = Assert.Throws<InvalidOperationException>(
                    () => DatabaseDeployer.Deploy(Options(db.ConnectionString, temp.DatabaseFolder, false, log)));

                Assert.Contains("Script 'scripts/020_bad.sql', batch 2 of 2 failed: ", ex.Message);
                Assert.Contains("(SQL error 8134, line 1 of the batch)", ex.Message);
                SqlException inner = Assert.IsType<SqlException>(ex.InnerException);
                Assert.Equal(8134, inner.Number);

                // Scripts are not wrapped in one transaction: what ran before the failure stays, nothing runs after it.
                Assert.Equal(1, db.Scalar<int>("SELECT COUNT(*) FROM sys.tables WHERE name = N'Done'"));
                Assert.Equal(0, db.Scalar<int>("SELECT COUNT(*) FROM sys.tables WHERE name = N'Never'"));
                Assert.Contains("Applied scripts/010_good.sql (1 batch)", log);
                Assert.DoesNotContain(log, line => line.Contains("020_bad"));
            }
        }

        [SqlFact]
        public void Scripts_are_read_as_utf8_with_or_without_a_byte_order_mark()
        {
            using (TestDatabase db = TestDatabase.CreateUndeployed())
            using (TempDatabaseFolder temp = new TempDatabaseFolder())
            {
                temp.AddScript("010_word.sql", "CREATE TABLE dbo.Word (Id int IDENTITY(1, 1) PRIMARY KEY, Text nvarchar(50) NOT NULL);");
                temp.AddScript("020_with_bom.sql", "INSERT INTO dbo.Word (Text) VALUES (N'Zo\u00eb \u2013 caf\u00e9');", true);
                temp.AddScript("030_without_bom.sql", "INSERT INTO dbo.Word (Text) VALUES (N'\u65e5\u672c\u8a9e');", false);

                DatabaseDeployer.Deploy(Options(db.ConnectionString, temp.DatabaseFolder, false, null));

                Assert.Equal("Zo\u00eb \u2013 caf\u00e9|\u65e5\u672c\u8a9e",
                    db.Scalar<string>("SELECT STRING_AGG(Text, N'|') WITHIN GROUP (ORDER BY Id) FROM dbo.Word"));
            }
        }

        [SqlFact]
        public void A_database_name_with_a_closing_bracket_is_quoted()
        {
            using (TempDatabaseFolder temp = new TempDatabaseFolder())
            {
                temp.AddScript("010_a.sql", "CREATE TABLE dbo.A (Id int NOT NULL);");
                SqlConnectionStringBuilder builder = new SqlConnectionStringBuilder(TestEnvironment.ServerConnectionString);
                builder.InitialCatalog = "CobLinkTest_" + Guid.NewGuid().ToString("N").Substring(0, 8) + "]x";
                DeploymentOptions options = Options(builder.ConnectionString, temp.DatabaseFolder, false, null);

                try
                {
                    Assert.True(DatabaseDeployer.Deploy(options).DatabaseCreated);
                    Assert.True(DatabaseExists(builder.ConnectionString));
                }
                finally
                {
                    Assert.True(DatabaseDeployer.DropDatabase(options));
                }

                Assert.False(DatabaseExists(builder.ConnectionString));
            }
        }

        [SqlFact]
        public void DropDatabase_removes_the_database_even_while_a_session_is_open_and_reports_when_nothing_is_left()
        {
            using (TestDatabase db = TestDatabase.CreateUndeployed())
            using (TempDatabaseFolder temp = new TempDatabaseFolder())
            {
                temp.AddScript("010_a.sql", "CREATE TABLE dbo.A (Id int NOT NULL);");
                List<string> log = new List<string>();
                DeploymentOptions options = Options(db.ConnectionString, temp.DatabaseFolder, false, log);
                DatabaseDeployer.Deploy(options);
                SqlConnectionStringBuilder session = new SqlConnectionStringBuilder(db.ConnectionString);
                session.Pooling = false;

                using (SqlConnection open = new SqlConnection(session.ConnectionString))
                {
                    open.Open();
                    Assert.True(DatabaseDeployer.DropDatabase(options));
                }

                Assert.False(DatabaseExists(db.ConnectionString));
                Assert.False(DatabaseDeployer.DropDatabase(options));
                Assert.Contains("Dropped database [" + db.Name + "].", log);
                Assert.Contains("Database [" + db.Name + "] does not exist; nothing to drop.", log);
            }
        }

        // ---- deployment of the real scripts ---------------------------------------------------------------------

        [SqlFact]
        public void The_real_scripts_create_the_schema_and_the_lookups_but_no_people_or_work()
        {
            using (TestDatabase db = TestDatabase.CreateUndeployed())
            {
                DeploymentResult result = db.Deploy(false);

                Assert.True(result.DatabaseCreated);
                Assert.Equal(RealScriptNames(db.DatabaseFolder, "scripts"), result.ScriptsApplied);
                Assert.Equal("scripts/010_Schema.sql", result.ScriptsApplied[0]);
                Assert.True(result.BatchesExecuted >= result.ScriptsApplied.Count);

                Assert.Equal(ExpectedTables, db.Scalar<string>("SELECT STRING_AGG(name, N',') WITHIN GROUP (ORDER BY name) FROM sys.tables"));
                Assert.Equal("vActivityList,vTakebackList", db.Scalar<string>("SELECT STRING_AGG(name, N',') WITHIN GROUP (ORDER BY name) FROM sys.views"));
                Assert.True(db.Scalar<int>("SELECT COUNT(*) FROM sys.procedures WHERE name LIKE N'usp[_]%'") > 0);

                // One lookup row per enum member: the C# enums, the TypeScript enums and these rows are kept in step by hand.
                Assert.Equal(Enum.GetValues(typeof(UserRole)).Length, db.Scalar<int>("SELECT COUNT(*) FROM dbo.LkpUserRole"));
                Assert.Equal(Enum.GetValues(typeof(ActivityType)).Length, db.Scalar<int>("SELECT COUNT(*) FROM dbo.LkpActivityType"));
                Assert.Equal(Enum.GetValues(typeof(ActivityStatus)).Length, db.Scalar<int>("SELECT COUNT(*) FROM dbo.LkpActivityStatus"));
                Assert.Equal(Enum.GetValues(typeof(ActivityPriority)).Length, db.Scalar<int>("SELECT COUNT(*) FROM dbo.LkpActivityPriority"));
                Assert.Equal(Enum.GetValues(typeof(TakebackReason)).Length, db.Scalar<int>("SELECT COUNT(*) FROM dbo.LkpTakebackReason"));
                Assert.Equal(Enum.GetValues(typeof(TakebackStatus)).Length, db.Scalar<int>("SELECT COUNT(*) FROM dbo.LkpTakebackStatus"));
                Assert.Equal(Enum.GetValues(typeof(RecoveryMethod)).Length, db.Scalar<int>("SELECT COUNT(*) FROM dbo.LkpRecoveryMethod"));

                // Without the sample data nobody can sign in yet: the first user is added by an administrator (see database/README.md).
                Assert.All(
                    new[] { "AppUser", "Member", "Provider", "Takeback", "TakebackHistory", "TakebackRecovery", "Activity", "ActivityNote" },
                    table => Assert.Equal(0, db.Scalar<int>("SELECT COUNT(*) FROM dbo." + table)));
            }
        }

        [SqlFact]
        public void Running_the_real_scripts_and_the_sample_data_again_changes_nothing_and_keeps_added_rows()
        {
            using (TestDatabase db = TestDatabase.CreateUndeployed())
            {
                DeploymentResult first = db.Deploy(true);
                int[] seeded = RowCounts(db);
                db.Execute("INSERT INTO dbo.AppUser (UserName, DisplayName, RoleId) VALUES (N'CORP\\added', N'Added Later', 1);");

                DeploymentResult second = db.Deploy(true);
                DeploymentResult schemaOnly = db.Deploy(false);

                Assert.True(first.DatabaseCreated);
                Assert.False(second.DatabaseCreated);
                Assert.Equal(first.ScriptsApplied, second.ScriptsApplied);
                Assert.Equal(first.BatchesExecuted, second.BatchesExecuted);
                Assert.Equal("sample-data/900_SampleData.sql", second.ScriptsApplied.Last());
                Assert.DoesNotContain(schemaOnly.ScriptsApplied, name => name.StartsWith("sample-data/", StringComparison.Ordinal));

                int[] expected = (int[])seeded.Clone();
                expected[0]++; // the user added in between; every other table is unchanged
                Assert.Equal(expected, RowCounts(db));
                Assert.Equal(1, db.Scalar<int>("SELECT COUNT(*) FROM dbo.AppUser WHERE UserName = N'CORP\\added'"));
            }
        }

        // ---- helpers --------------------------------------------------------------------------------------------

        private static DeploymentOptions Options(string connectionString, string databaseFolder, bool includeSampleData, List<string> log)
        {
            return new DeploymentOptions
            {
                ConnectionString = connectionString,
                DatabaseFolder = databaseFolder,
                IncludeSampleData = includeSampleData,
                ServerWaitTimeout = TimeSpan.FromSeconds(60),
                Log = log == null ? (Action<string>)null : log.Add
            };
        }

        // A zero wait time makes the deployer give up after the first refused connection instead of retrying.
        private static DeploymentOptions UnreachableOptions(string databaseFolder, bool includeSampleData)
        {
            DeploymentOptions options = Options(UnreachableServer, databaseFolder, includeSampleData, null);
            options.ServerWaitTimeout = TimeSpan.Zero;
            return options;
        }

        private static List<string> RealScriptNames(string databaseFolder, string subFolder)
        {
            return Directory.GetFiles(Path.Combine(databaseFolder, subFolder), "*.sql")
                .Select(path => subFolder + "/" + Path.GetFileName(path))
                .OrderBy(name => name, StringComparer.Ordinal)
                .ToList();
        }

        // AppUser first: the test above adds one user and expects exactly that one to be new.
        private static int[] RowCounts(TestDatabase db)
        {
            return new[] { "AppUser", "Member", "Provider", "Takeback", "TakebackHistory", "TakebackRecovery", "Activity", "ActivityNote" }
                .Select(table => db.Scalar<int>("SELECT COUNT(*) FROM dbo." + table))
                .ToArray();
        }

        private static bool DatabaseExists(string databaseConnectionString)
        {
            SqlConnectionStringBuilder target = new SqlConnectionStringBuilder(databaseConnectionString);
            string name = target.InitialCatalog;
            target.InitialCatalog = "master";
            target.Pooling = false;

            using (SqlConnection connection = new SqlConnection(target.ConnectionString))
            using (SqlCommand command = new SqlCommand("SELECT DB_ID(@name)", connection))
            {
                command.Parameters.AddWithValue("@name", name);
                connection.Open();
                object id = command.ExecuteScalar();
                return id != null && id != DBNull.Value;
            }
        }
    }
}
