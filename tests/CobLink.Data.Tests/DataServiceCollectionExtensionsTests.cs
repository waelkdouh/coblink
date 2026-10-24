using System;
using System.Collections.Generic;
using CobLink.Data.Repositories;
using CobLink.Data.Sql;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace CobLink.Data.Tests
{
    /// <summary>
    /// The composition root calls AddCobLinkData once. These tests pin what it registers, so that a new data layer
    /// (for example an EF Core one with scoped contexts) is a deliberate change of this contract and not an accident.
    /// </summary>
    public class DataServiceCollectionExtensionsTests
    {
        // Nothing listens on port 1: registering must not open a connection, so this server is never contacted.
        private const string ConnectionString =
            "Server=127.0.0.1,1;Database=CobLinkNoServer;Integrated Security=True;Connect Timeout=2";

        [Fact]
        public void AddCobLinkData_registers_each_repository_and_the_database_status_as_a_singleton()
        {
            TestServiceCollection services = new TestServiceCollection();

            IServiceCollection returned = services.AddCobLinkData(ConnectionString);

            Assert.Same(services, returned);
            Assert.Equal(6, services.Count);
            Assert.All(services, descriptor =>
            {
                Assert.Equal(ServiceLifetime.Singleton, descriptor.Lifetime);
                Assert.NotNull(descriptor.ImplementationInstance);
            });
            AssertRegistered<IUserRepository, SqlUserRepository>(services);
            AssertRegistered<ILookupRepository, SqlLookupRepository>(services);
            AssertRegistered<IActivityRepository, SqlActivityRepository>(services);
            AssertRegistered<ITakebackRepository, SqlTakebackRepository>(services);
            AssertRegistered<IDashboardRepository, SqlDashboardRepository>(services);
            AssertRegistered<IDatabaseStatus, SqlDatabaseStatus>(services);
        }

        [Fact]
        public void AddCobLinkData_rejects_a_missing_service_collection()
        {
            IServiceCollection services = null;

            ArgumentNullException ex = Assert.Throws<ArgumentNullException>(() => services.AddCobLinkData(ConnectionString));

            Assert.Equal("services", ex.ParamName);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        public void AddCobLinkData_rejects_a_blank_connection_string_and_registers_nothing(string connectionString)
        {
            TestServiceCollection services = new TestServiceCollection();

            ArgumentException ex = Assert.Throws<ArgumentException>(() => services.AddCobLinkData(connectionString));

            Assert.Equal("connectionString", ex.ParamName);
            Assert.Empty(services);
        }

        [Fact]
        public void Every_repository_requires_a_connection_string()
        {
            Func<string, object>[] constructors =
            {
                connectionString => new SqlUserRepository(connectionString),
                connectionString => new SqlLookupRepository(connectionString),
                connectionString => new SqlActivityRepository(connectionString),
                connectionString => new SqlTakebackRepository(connectionString),
                connectionString => new SqlDashboardRepository(connectionString),
                connectionString => new SqlDatabaseStatus(connectionString)
            };

            foreach (Func<string, object> create in constructors)
            {
                foreach (string blank in new[] { null, "", "   " })
                {
                    string value = blank;
                    ArgumentException ex = Assert.Throws<ArgumentException>(() => create(value));
                    Assert.Equal("connectionString", ex.ParamName);
                }
            }
        }

        private static void AssertRegistered<TService, TImplementation>(IEnumerable<ServiceDescriptor> services)
        {
            ServiceDescriptor descriptor = Assert.Single(services, candidate => candidate.ServiceType == typeof(TService));

            Assert.IsType<TImplementation>(descriptor.ImplementationInstance);
        }

        // CobLink.Data.Tests references the abstractions package only; this is all of IServiceCollection that is needed.
        private sealed class TestServiceCollection : List<ServiceDescriptor>, IServiceCollection
        {
        }
    }
}
