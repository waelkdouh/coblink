// System.Data.SqlClient is deliberately the legacy provider; moving to Microsoft.Data.SqlClient is a modernization task.
#pragma warning disable CS0618
using System;
using System.Diagnostics;
using CobLink.Data.Repositories;
using CobLink.Data.Sql;
using CobLink.Data.Tests.Infrastructure;
using Xunit;

namespace CobLink.Data.Tests
{
    /// <summary>The probe behind the /health endpoint: it must answer, never throw, and say why when it cannot connect.</summary>
    [Collection(SeededDatabaseCollection.Name)]
    public class SqlDatabaseStatusTests
    {
        // Nothing listens on port 1 of the loopback interface, so the connection is refused at once.
        private const string UnreachableServer =
            "Server=127.0.0.1,1;Database=CobLinkNoServer;Integrated Security=True;Connect Timeout=2";

        private readonly SeededDatabaseFixture _db;

        public SqlDatabaseStatusTests(SeededDatabaseFixture db)
        {
            _db = db;
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        public void The_probe_requires_a_connection_string(string connectionString)
        {
            ArgumentException ex = Assert.Throws<ArgumentException>(() => new SqlDatabaseStatus(connectionString));

            Assert.Equal("connectionString", ex.ParamName);
        }

        [Fact]
        public void An_unreachable_server_is_reported_not_thrown()
        {
            IDatabaseStatus status = new SqlDatabaseStatus(UnreachableServer);
            string error;

            bool canConnect = status.CanConnect(out error);

            Assert.False(canConnect);
            Assert.False(string.IsNullOrWhiteSpace(error));
        }

        [Fact]
        public void A_malformed_connection_string_is_reported_not_thrown()
        {
            IDatabaseStatus status = new SqlDatabaseStatus("this is not a connection string");
            string error;

            bool canConnect = status.CanConnect(out error);

            Assert.False(canConnect);
            Assert.False(string.IsNullOrWhiteSpace(error));
        }

        [Fact]
        public void The_probe_answers_quickly_even_when_the_connection_string_allows_a_long_connect_timeout()
        {
            // The default connect timeout is 15 s; the probe caps it so that /health stays responsive.
            IDatabaseStatus status = new SqlDatabaseStatus(UnreachableServer.Replace("Connect Timeout=2", "Connect Timeout=120"));
            Stopwatch watch = Stopwatch.StartNew();
            string error;

            status.CanConnect(out error);

            Assert.True(watch.Elapsed < TimeSpan.FromSeconds(30), "a refused connection is reported long before 120 s");
        }

        [SqlFact]
        public void A_deployed_database_can_be_connected_to()
        {
            string error;

            bool canConnect = _db.Status.CanConnect(out error);

            Assert.True(canConnect, error);
            Assert.Null(error);
        }

        [SqlFact]
        public void A_missing_database_is_reported_with_the_reason()
        {
            using (TestDatabase missing = TestDatabase.CreateUndeployed())
            {
                IDatabaseStatus status = new SqlDatabaseStatus(missing.ConnectionString);
                string error;

                bool canConnect = status.CanConnect(out error);

                Assert.False(canConnect);
                Assert.Contains(missing.Name, error);
            }
        }
    }
}
