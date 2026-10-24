using System;
using System.Net;
using System.Threading.Tasks;
using Xunit;

namespace CobLink.Api.Tests
{
    public class DevelopmentAuthenticationTests : ApiTestBase
    {
        [Fact]
        public async Task The_header_selects_the_persona()
        {
            ApiResult result = await GetAsync("/api/User/GetCurrent", Personas.Blake);

            Assert.Equal(HttpStatusCode.OK, result.Status);
            Assert.True(result.Success);
            Assert.Equal("CORP\\bwilson", (string)result.Data["user"]["userName"]);
            Assert.Equal("Blake Wilson", (string)result.Data["user"]["displayName"]);
            Assert.Equal(2, (int)result.Data["user"]["role"]);
            Assert.Equal("Development", (string)result.Data["authenticationMode"]);
            Assert.Equal("Testing", (string)result.Data["environmentName"]);
            Assert.Matches(@"^\d+\.\d+\.\d+$", (string)result.Data["version"]);
        }

        [Fact]
        public async Task Without_a_header_the_configured_development_user_is_used()
        {
            ApiResult result = await GetAsync("/api/User/GetCurrent");

            Assert.Equal("CORP\\jdoe", (string)result.Data["user"]["userName"]);
        }

        [Theory]
        [InlineData("")]
        [InlineData("   ")]
        public async Task A_blank_header_falls_back_to_the_configured_user(string header)
        {
            ApiResult result = await GetAsync("/api/User/GetCurrent", header);

            Assert.Equal("CORP\\jdoe", (string)result.Data["user"]["userName"]);
        }

        [Fact]
        public async Task User_names_are_matched_without_regard_to_case()
        {
            ApiResult result = await GetAsync("/api/User/GetCurrent", "corp\\BWILSON");

            Assert.True(result.Success);
            Assert.Equal("CORP\\bwilson", (string)result.Data["user"]["userName"]);
        }

        [Fact]
        public async Task An_identity_without_an_app_user_row_is_forbidden()
        {
            ApiResult result = await GetAsync("/api/User/GetCurrent", "CORP\\nobody");

            Assert.Equal(HttpStatusCode.Forbidden, result.Status);
            Assert.False(result.Success);
            Assert.Equal("FORBIDDEN", result.ErrorCode);
            Assert.Equal("You are not registered in COBLink.", result.Message);
        }

        [Fact]
        public async Task An_inactive_user_is_forbidden()
        {
            ApiResult result = await GetAsync("/api/User/GetCurrent", "CORP\\retired");

            Assert.Equal(HttpStatusCode.Forbidden, result.Status);
            Assert.Equal("FORBIDDEN", result.ErrorCode);
        }

        [Theory]
        [InlineData("GET", "/api/User/GetAll")]
        [InlineData("GET", "/api/Lookup/GetAll")]
        [InlineData("GET", "/api/Lookup/SearchMembers?term=john")]
        [InlineData("GET", "/api/Dashboard/GetSummary")]
        [InlineData("GET", "/api/Activity/GetById?id=1")]
        [InlineData("POST", "/api/Activity/Search")]
        [InlineData("GET", "/api/Takeback/GetById?id=1")]
        [InlineData("POST", "/api/Takeback/Search")]
        public async Task Every_endpoint_refuses_an_unregistered_user(string method, string url)
        {
            ApiResult result = method == "GET"
                ? await GetAsync(url, "CORP\\nobody")
                : await PostAsync(url, new { }, "CORP\\nobody");

            Assert.Equal(HttpStatusCode.Forbidden, result.Status);
            Assert.Equal("FORBIDDEN", result.ErrorCode);
        }

        [Fact]
        public async Task The_user_is_resolved_again_for_every_request()
        {
            Assert.Equal("CORP\\asmith", (string)(await GetAsync("/api/User/GetCurrent", Personas.Alex)).Data["user"]["userName"]);
            Assert.Equal("CORP\\admin", (string)(await GetAsync("/api/User/GetCurrent", Personas.Casey)).Data["user"]["userName"]);
        }
    }

    public class NoDefaultUserAuthenticationTests : ApiTestBase
    {
        public NoDefaultUserAuthenticationTests()
            : base(new ApiFactory(defaultUser: ""))
        {
        }

        [Fact]
        public async Task Without_a_header_and_without_a_default_user_the_caller_is_not_authenticated()
        {
            ApiResult result = await GetAsync("/api/User/GetCurrent");

            Assert.Equal(HttpStatusCode.Unauthorized, result.Status);
        }

        [Fact]
        public async Task The_header_still_signs_the_caller_in()
        {
            ApiResult result = await GetAsync("/api/User/GetCurrent", Personas.Alex);

            Assert.True(result.Success);
        }
    }

    public class WindowsAuthenticationTests : ApiTestBase
    {
        public WindowsAuthenticationTests()
            : base(new ApiFactory(environment: "Production", authenticationMode: "Windows"))
        {
        }

        [Fact]
        public async Task Anonymous_callers_get_a_negotiate_challenge()
        {
            ApiResult result = await GetAsync("/api/User/GetCurrent");

            Assert.Equal(HttpStatusCode.Unauthorized, result.Status);
            Assert.Contains(result.Headers.WwwAuthenticate, h => h.Scheme == "Negotiate");
        }

        [Fact]
        public async Task The_development_header_is_ignored()
        {
            ApiResult result = await GetAsync("/api/User/GetCurrent", Personas.Casey);

            Assert.Equal(HttpStatusCode.Unauthorized, result.Status);
        }

        [Fact]
        public async Task Every_api_endpoint_needs_a_signed_in_caller()
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await GetAsync("/api/Dashboard/GetSummary")).Status);
            Assert.Equal(HttpStatusCode.Unauthorized, (await PostAsync("/api/Activity/Search", new { })).Status);
            Assert.Equal(HttpStatusCode.Unauthorized, (await PostAsync("/api/Takeback/Approve", new { })).Status);
        }

        [Fact]
        public async Task The_health_probe_stays_anonymous()
        {
            ApiResult result = await GetAsync("/health");

            Assert.Equal(HttpStatusCode.OK, result.Status);
            Assert.Equal("Healthy", (string)result.Json["status"]);
            Assert.Equal("Production", (string)result.Json["environment"]);
        }

        [Fact]
        public async Task Swagger_is_not_published()
        {
            ApiResult result = await GetAsync("/swagger/v1/swagger.json");

            Assert.NotEqual(HttpStatusCode.OK, result.Status);
        }
    }

    public class AuthenticationConfigurationTests
    {
        [Theory]
        [InlineData("Production")]
        [InlineData("Staging")]
        public void Development_mode_is_refused_outside_development_testing_and_demo(string environment)
        {
            using (var factory = new ApiFactory(environment: environment, authenticationMode: "Development"))
            {
                Exception exception = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

                Assert.Contains("only allowed in the Development, Testing and Demo environments", exception.ToString());
            }
        }

        [Theory]
        [InlineData("Development")]
        [InlineData("Testing")]
        [InlineData("Demo")]
        public void Development_mode_starts_in_development_testing_and_demo(string environment)
        {
            using (var factory = new ApiFactory(environment: environment, authenticationMode: "Development"))
            {
                Assert.NotNull(factory.CreateClient());
            }
        }

        [Fact]
        public void An_unknown_authentication_mode_is_refused()
        {
            using (var factory = new ApiFactory(authenticationMode: "Basic"))
            {
                Exception exception = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

                Assert.Contains("Authentication:Mode must be 'Windows' or 'Development'", exception.ToString());
            }
        }
    }
}
