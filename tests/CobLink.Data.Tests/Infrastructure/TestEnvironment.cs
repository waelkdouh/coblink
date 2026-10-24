using System;
using Xunit;

namespace CobLink.Data.Tests.Infrastructure
{
    /// <summary>
    /// The database tests need a SQL Server whose login may create and drop databases. Point the
    /// COBLINK_TEST_CONNECTION environment variable at it, for example
    /// Server=localhost,1433;User Id=sa;Password=your-password;TrustServerCertificate=True
    /// A Database= entry is ignored: every test class works in its own scratch database.
    /// </summary>
    internal static class TestEnvironment
    {
        public const string ConnectionVariable = "COBLINK_TEST_CONNECTION";

        public const string SkipReason =
            "Needs a SQL Server: set " + ConnectionVariable + " to a connection string of a server where the login can " +
            "create and drop databases (see tests/CobLink.Data.Tests/README.md).";

        public static string ServerConnectionString
        {
            get { return Environment.GetEnvironmentVariable(ConnectionVariable); }
        }

        public static bool HasSqlServer
        {
            get { return !string.IsNullOrWhiteSpace(ServerConnectionString); }
        }
    }

    /// <summary>
    /// A test that needs SQL Server. xUnit 2 cannot skip at run time, so the attribute sets Skip when the
    /// connection variable is missing; without a server the suite still runs the tests that need none.
    /// </summary>
    public sealed class SqlFactAttribute : FactAttribute
    {
        public SqlFactAttribute()
        {
            if (!TestEnvironment.HasSqlServer)
            {
                Skip = TestEnvironment.SkipReason;
            }
        }
    }

    /// <summary>The theory flavour of <see cref="SqlFactAttribute"/>.</summary>
    public sealed class SqlTheoryAttribute : TheoryAttribute
    {
        public SqlTheoryAttribute()
        {
            if (!TestEnvironment.HasSqlServer)
            {
                Skip = TestEnvironment.SkipReason;
            }
        }
    }
}
