using System;
using CobLink.Data.Repositories;
using CobLink.Data.Sql;
using Xunit;

namespace CobLink.Data.Tests.Infrastructure
{
    /// <summary>
    /// Builds the repositories under test. The tests only use the interfaces from CobLink.Data.Repositories, so this
    /// is the single place that names the ADO.NET implementation: point it at a new implementation (for example an
    /// EF Core one) and the whole suite becomes the behavioural contract that the new implementation has to meet.
    /// </summary>
    public sealed class RepositorySet
    {
        public RepositorySet(string connectionString)
        {
            Users = new SqlUserRepository(connectionString);
            Lookups = new SqlLookupRepository(connectionString);
            Activities = new SqlActivityRepository(connectionString);
            Takebacks = new SqlTakebackRepository(connectionString);
            Dashboard = new SqlDashboardRepository(connectionString);
            Status = new SqlDatabaseStatus(connectionString);
        }

        public IUserRepository Users { get; private set; }
        public ILookupRepository Lookups { get; private set; }
        public IActivityRepository Activities { get; private set; }
        public ITakebackRepository Takebacks { get; private set; }
        public IDashboardRepository Dashboard { get; private set; }
        public IDatabaseStatus Status { get; private set; }
    }

    /// <summary>Shared by the fixtures: a scratch database plus repositories that point at it.</summary>
    public abstract class DatabaseFixture : IDisposable
    {
        protected DatabaseFixture()
        {
            // The fixture is also created when every test of its collection is skipped; without a server it stays empty.
            if (!TestEnvironment.HasSqlServer)
            {
                return;
            }

            Database = TestDatabase.Create(true);
            Repos = new RepositorySet(Database.ConnectionString);
        }

        public TestDatabase Database { get; private set; }

        public RepositorySet Repos { get; private set; }

        public IUserRepository Users { get { return Repos.Users; } }
        public ILookupRepository Lookups { get { return Repos.Lookups; } }
        public IActivityRepository Activities { get { return Repos.Activities; } }
        public ITakebackRepository Takebacks { get { return Repos.Takebacks; } }
        public IDashboardRepository Dashboard { get { return Repos.Dashboard; } }
        public IDatabaseStatus Status { get { return Repos.Status; } }

        public void Dispose()
        {
            if (Database != null)
            {
                Database.Dispose();
            }
        }
    }

    /// <summary>
    /// A database with the demo data exactly as the sample-data script leaves it. Tests that use it only read, so the
    /// expected counts (27 activities, 18 takebacks, ...) stay valid for every test of the collection.
    /// </summary>
    public sealed class SeededDatabaseFixture : DatabaseFixture
    {
    }

    /// <summary>
    /// A database with the demo data for tests that write. Each test creates its own rows (unique claim numbers) and
    /// must not rely on the totals of the demo data.
    /// </summary>
    public sealed class WorkingDatabaseFixture : DatabaseFixture
    {
    }

    [CollectionDefinition(Name)]
    public sealed class SeededDatabaseCollection : ICollectionFixture<SeededDatabaseFixture>
    {
        public const string Name = "Seeded database (read only)";
    }

    [CollectionDefinition(Name)]
    public sealed class WorkingDatabaseCollection : ICollectionFixture<WorkingDatabaseFixture>
    {
        public const string Name = "Working database (read and write)";
    }

    /// <summary>
    /// The people of database/sample-data/900_SampleData.sql. On a fresh database they get these ids because the
    /// script inserts them in this order (UserRepositoryTests checks the mapping).
    /// </summary>
    public static class SampleUsers
    {
        public const int Jamie = 1;   // CORP\jdoe, Analyst
        public const int Alex = 2;    // CORP\asmith, Analyst
        public const int Blake = 3;   // CORP\bwilson, Supervisor
        public const int Morgan = 4;  // CORP\mlee, Supervisor
        public const int Casey = 5;   // CORP\admin, Admin
        public const int Robin = 6;   // CORP\retired, Analyst, inactive
    }
}
