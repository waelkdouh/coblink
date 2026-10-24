using System;
using CobLink.Data.Repositories;
using CobLink.Data.Sql;
using Microsoft.Extensions.DependencyInjection;

namespace CobLink.Data
{
    public static class DataServiceCollectionExtensions
    {
        /// <summary>
        /// Registers the SQL Server repositories (stored procedures over ADO.NET). The repositories are stateless: each
        /// call opens its own pooled connection, so a single instance can be shared by every request.
        /// </summary>
        public static IServiceCollection AddCobLinkData(this IServiceCollection services, string connectionString)
        {
            if (services == null)
            {
                throw new ArgumentNullException("services");
            }

            SqlHelper.RequireConnectionString(connectionString);

            services.AddSingleton<IUserRepository>(new SqlUserRepository(connectionString));
            services.AddSingleton<ILookupRepository>(new SqlLookupRepository(connectionString));
            services.AddSingleton<IActivityRepository>(new SqlActivityRepository(connectionString));
            services.AddSingleton<ITakebackRepository>(new SqlTakebackRepository(connectionString));
            services.AddSingleton<IDashboardRepository>(new SqlDashboardRepository(connectionString));
            services.AddSingleton<IDatabaseStatus>(new SqlDatabaseStatus(connectionString));
            return services;
        }
    }
}
