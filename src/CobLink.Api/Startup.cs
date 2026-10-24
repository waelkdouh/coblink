using System;
using System.Collections.Generic;
using CobLink.Api.Infrastructure;
using CobLink.Business;
using CobLink.Data;
using CobLink.Models;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.OpenApi.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace CobLink.Api
{
    /// <summary>
    /// Composition root in the classic Startup style (ConfigureServices + Configure). The target stack replaces it
    /// with minimal hosting in Program.cs.
    /// </summary>
    public class Startup
    {
        public const string ConnectionStringName = "CobLink";

        public Startup(IConfiguration configuration, IWebHostEnvironment environment)
        {
            Configuration = configuration;
            Environment = environment;
        }

        public IConfiguration Configuration { get; private set; }

        public IWebHostEnvironment Environment { get; private set; }

        private bool SwaggerEnabled
        {
            get { return Environment.IsDevelopment() || Environment.IsEnvironment("Demo") || Environment.IsEnvironment("Testing"); }
        }

        public void ConfigureServices(IServiceCollection services)
        {
            var authentication = new AuthenticationSettings();
            Configuration.GetSection(AuthenticationSettings.SectionName).Bind(authentication);
            services.AddSingleton(authentication);

            string connectionString = Configuration.GetConnectionString(ConnectionStringName);
            if (string.IsNullOrWhiteSpace(connectionString))
            {
                throw new InvalidOperationException("ConnectionStrings:" + ConnectionStringName + " is not configured.");
            }

            AddAuthentication(services, authentication);

            services.AddHttpContextAccessor();
            services.AddScoped<ICurrentUser, HttpCurrentUser>();
            services.AddCobLinkData(connectionString);
            services.AddCobLinkBusiness(options => Configuration.GetSection(TakebackOptions.SectionName).Bind(options));

            services
                .AddControllers(options => options.Filters.Add<ApiExceptionFilter>())
                .AddNewtonsoftJson(options =>
                {
                    options.SerializerSettings.ContractResolver = new CamelCasePropertyNamesContractResolver();
                    options.SerializerSettings.DateTimeZoneHandling = DateTimeZoneHandling.RoundtripKind;

                    // Newtonsoft parser messages quote JSON paths and positions; CreateBadRequest answers generically.
                    options.AllowInputFormatterExceptionMessages = false;
                })
                .ConfigureApiBehaviorOptions(options => options.InvalidModelStateResponseFactory = CreateBadRequest);

            if (SwaggerEnabled)
            {
                AddSwagger(services, authentication);
            }
        }

        public void Configure(IApplicationBuilder app)
        {
            if (SwaggerEnabled)
            {
                app.UseSwagger();
                app.UseSwaggerUI(options =>
                {
                    options.DocumentTitle = "COBLink API";
                    options.SwaggerEndpoint("/swagger/v1/swagger.json", "COBLink API v1");
                });
            }

            app.UseRouting();
            app.UseAuthentication();
            app.UseAuthorization();
            app.UseEndpoints(endpoints => endpoints.MapControllers());
        }

        private void AddAuthentication(IServiceCollection services, AuthenticationSettings settings)
        {
            if (settings.IsDevelopmentMode)
            {
                if (!AuthenticationSettings.DevelopmentModeAllowed(Environment))
                {
                    throw new InvalidOperationException(
                        "Authentication:Mode 'Development' has no credentials and is only allowed in the Development, "
                        + "Testing and Demo environments. Current environment: " + Environment.EnvironmentName + ".");
                }

                services
                    .AddAuthentication(DevelopmentAuthenticationHandler.SchemeName)
                    .AddScheme<DevelopmentAuthenticationOptions, DevelopmentAuthenticationHandler>(
                        DevelopmentAuthenticationHandler.SchemeName,
                        options => options.DefaultUser = settings.DevelopmentUser);
            }
            else if (settings.IsWindowsMode)
            {
                services.AddAuthentication(NegotiateDefaults.AuthenticationScheme).AddNegotiate();
            }
            else
            {
                throw new InvalidOperationException(
                    "Authentication:Mode must be '" + AuthenticationSettings.WindowsMode + "' or '"
                    + AuthenticationSettings.DevelopmentMode + "' but was '" + settings.Mode + "'.");
            }

            // Everything except endpoints marked [AllowAnonymous] (/health) needs a signed-in identity.
            services.AddAuthorization(options =>
                options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
        }

        private static void AddSwagger(IServiceCollection services, AuthenticationSettings authentication)
        {
            services.AddSwaggerGen(options =>
            {
                options.SwaggerDoc(
                    "v1",
                    new OpenApiInfo
                    {
                        Title = "COBLink API",
                        Version = AppVersion.Current,
                        Description = "Baseline (legacy) RPC-style API. Every response uses the ServiceResponse envelope."
                    });

                if (authentication.IsDevelopmentMode)
                {
                    var persona = new OpenApiSecurityScheme
                    {
                        Type = SecuritySchemeType.ApiKey,
                        In = ParameterLocation.Header,
                        Name = DevelopmentAuthenticationHandler.HeaderName,
                        Description = "Development persona, for example CORP\\jdoe or CORP\\bwilson."
                    };
                    options.AddSecurityDefinition("Persona", persona);
                    options.AddSecurityRequirement(new OpenApiSecurityRequirement
                    {
                        {
                            new OpenApiSecurityScheme
                            {
                                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Persona" }
                            },
                            new string[0]
                        }
                    });
                }
            });
            services.AddSwaggerGenNewtonsoftSupport();
        }

        private static IActionResult CreateBadRequest(ActionContext context)
        {
            var errors = new List<ValidationError>();
            foreach (KeyValuePair<string, ModelStateEntry> entry in context.ModelState)
            {
                string field = string.IsNullOrEmpty(entry.Key)
                    ? null
                    : char.ToLowerInvariant(entry.Key[0]) + entry.Key.Substring(1);

                foreach (ModelError error in entry.Value.Errors)
                {
                    // Parser exception text stays out of the response; only framework messages are shown.
                    string message = string.IsNullOrWhiteSpace(error.ErrorMessage) ? "The value is not valid." : error.ErrorMessage;
                    errors.Add(new ValidationError(field, message));
                }
            }

            var response = ServiceResponse<object>.Fail(ErrorCodes.BadRequest, "The request is not valid.", errors);
            return new ObjectResult(response) { StatusCode = 400 };
        }
    }
}
