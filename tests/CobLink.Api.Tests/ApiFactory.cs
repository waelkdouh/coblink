using System;
using System.Collections.Generic;
using CobLink.TestSupport;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Connections;
using Microsoft.AspNetCore.Connections.Features;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace CobLink.Api.Tests
{
    /// <summary>
    /// Boots the real Startup (routing, filters, JSON, authentication) on an in-memory test server. The SQL Server data
    /// layer is replaced by the in-memory repositories of the shared TestWorld, so these tests need no database.
    /// </summary>
    public class ApiFactory : WebApplicationFactory<Startup>
    {
        private readonly string _environment;
        private readonly string _authenticationMode;
        private readonly string _defaultUser;

        public ApiFactory(
            string environment = "Testing",
            string authenticationMode = "Development",
            string defaultUser = "CORP\\jdoe")
        {
            _environment = environment;
            _authenticationMode = authenticationMode;
            _defaultUser = defaultUser;
            World = new TestWorld();
        }

        public TestWorld World { get; private set; }

        /// <summary>Optional last-word registrations, for example a repository that throws.</summary>
        public Action<IServiceCollection> Customize { get; set; }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(_environment);
            builder.ConfigureAppConfiguration((context, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string>
                {
                    { "ConnectionStrings:CobLink", "Server=not-used;Database=not-used" },
                    { "Authentication:Mode", _authenticationMode },
                    { "Authentication:DevelopmentUser", _defaultUser }
                }));
            builder.ConfigureTestServices(services =>
            {
                services.AddTransient<IStartupFilter, ConnectionItemsStartupFilter>();
                World.ReplaceServices(services);
                if (Customize != null)
                {
                    Customize(services);
                }
            });
        }

        /// <summary>
        /// The Negotiate handler keeps per-connection state and insists on a server with connection items (Kestrel).
        /// The in-memory test server has none, so every request gets a fresh set (DefaultConnectionContext's items
        /// answer null for missing keys, like Kestrel's).
        /// </summary>
        private class ConnectionItemsStartupFilter : IStartupFilter
        {
            public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
            {
                return app =>
                {
                    app.Use((context, pipeline) =>
                    {
                        context.Features.Set<IConnectionItemsFeature>(new DefaultConnectionContext());
                        return pipeline();
                    });
                    next(app);
                };
            }
        }
    }
}
