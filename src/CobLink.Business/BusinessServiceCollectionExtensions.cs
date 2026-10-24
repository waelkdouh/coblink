using System;
using CobLink.Business.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CobLink.Business
{
    public static class BusinessServiceCollectionExtensions
    {
        /// <summary>
        /// Registers the business services. The host must also register ICurrentUser and the repositories
        /// (see CobLink.Data.AddCobLinkData).
        /// </summary>
        public static IServiceCollection AddCobLinkBusiness(
            this IServiceCollection services,
            Action<TakebackOptions> configureTakebacks = null)
        {
            services.AddOptions<TakebackOptions>();
            if (configureTakebacks != null)
            {
                services.Configure(configureTakebacks);
            }

            services.TryAddSingleton<IClock, SystemClock>();
            services.AddScoped<IUserService, UserService>();
            services.AddScoped<ILookupService, LookupService>();
            services.AddScoped<IDashboardService, DashboardService>();
            services.AddScoped<IActivityService, ActivityService>();
            services.AddScoped<ITakebackService, TakebackService>();
            return services;
        }
    }
}
