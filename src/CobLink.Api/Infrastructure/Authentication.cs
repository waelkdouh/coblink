using System;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CobLink.Api.Infrastructure
{
    /// <summary>Bound to the "Authentication" configuration section.</summary>
    public class AuthenticationSettings
    {
        public const string SectionName = "Authentication";
        public const string WindowsMode = "Windows";
        public const string DevelopmentMode = "Development";

        /// <summary>"Windows" (Negotiate, the production default) or "Development" (X-CobLink-User header).</summary>
        public string Mode { get; set; } = WindowsMode;

        /// <summary>Identity used in Development mode when the request carries no X-CobLink-User header.</summary>
        public string DevelopmentUser { get; set; }

        public bool IsDevelopmentMode
        {
            get { return string.Equals(Mode, DevelopmentMode, StringComparison.OrdinalIgnoreCase); }
        }

        public bool IsWindowsMode
        {
            get { return string.Equals(Mode, WindowsMode, StringComparison.OrdinalIgnoreCase); }
        }

        /// <summary>Header-based sign-in has no credentials, so it is refused outside demo-style environments.</summary>
        public static bool DevelopmentModeAllowed(IHostEnvironment environment)
        {
            return environment.IsDevelopment()
                || environment.IsEnvironment("Testing")
                || environment.IsEnvironment("Demo");
        }
    }

    public class DevelopmentAuthenticationOptions : AuthenticationSchemeOptions
    {
        public string DefaultUser { get; set; }
    }

    /// <summary>
    /// Development, Testing and Demo only: trusts the X-CobLink-User header so the SPA can switch personas without
    /// Active Directory. Never registered in the Windows (production) mode.
    /// </summary>
    public class DevelopmentAuthenticationHandler : AuthenticationHandler<DevelopmentAuthenticationOptions>
    {
        public const string SchemeName = "CobLinkDevelopment";
        public const string HeaderName = "X-CobLink-User";

        public DevelopmentAuthenticationHandler(
            IOptionsMonitor<DevelopmentAuthenticationOptions> options,
            ILoggerFactory logger,
            UrlEncoder encoder)
            : base(options, logger, encoder)
        {
        }

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            string userName = Request.Headers[HeaderName];
            if (string.IsNullOrWhiteSpace(userName))
            {
                userName = Options.DefaultUser;
            }

            if (string.IsNullOrWhiteSpace(userName))
            {
                return Task.FromResult(AuthenticateResult.NoResult());
            }

            var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.Name, userName.Trim()) }, SchemeName);
            var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName);
            return Task.FromResult(AuthenticateResult.Success(ticket));
        }
    }
}
