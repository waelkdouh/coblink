using System.IO;
using System.Linq;
using System.Net;
using System.Threading.Tasks;
using CobLink.Data.Repositories;
using CobLink.Models;
using Microsoft.Extensions.DependencyInjection;
using Newtonsoft.Json.Linq;
using Xunit;

namespace CobLink.Api.Tests
{
    public class EnvelopeTests : ApiTestBase
    {
        [Fact]
        public async Task A_successful_response_has_the_documented_envelope()
        {
            ApiResult result = await GetAsync("/api/Lookup/GetAll");

            Assert.Equal(HttpStatusCode.OK, result.Status);
            Assert.Equal(
                new[] { "data", "errorCode", "errors", "message", "success" },
                result.Json.Properties().Select(p => p.Name).OrderBy(n => n).ToArray());
            Assert.True(result.Success);
            Assert.Equal(JTokenType.Null, result.Json["errorCode"].Type);
            Assert.Equal(JTokenType.Null, result.Json["message"].Type);
            Assert.Empty(result.Errors);
            Assert.Equal(JTokenType.Object, result.Data.Type);
        }

        [Fact]
        public async Task A_validation_failure_is_http_200_with_field_errors()
        {
            ApiResult result = await PostAsync("/api/Activity/Save", new { subject = "", activityType = 1, priority = 2 });

            Assert.Equal(HttpStatusCode.OK, result.Status);
            Assert.False(result.Success);
            Assert.Equal("VALIDATION", result.ErrorCode);
            Assert.Equal(JTokenType.Null, result.Data.Type);
            Assert.Contains(result.Errors, e => (string)e["field"] == "subject" && ((string)e["message"]).Contains("required"));
        }

        [Fact]
        public async Task A_missing_record_is_http_200_with_not_found()
        {
            ApiResult result = await GetAsync("/api/Takeback/GetById?id=999");

            Assert.Equal(HttpStatusCode.OK, result.Status);
            Assert.Equal("NOT_FOUND", result.ErrorCode);
            Assert.Equal("Takeback 999 was not found.", result.Message);
        }

        [Fact]
        public async Task A_broken_business_rule_is_http_200_with_a_readable_message()
        {
            Takeback approved = World.SeedTakeback(TakebackStatus.Approved);

            ApiResult result = await PostAsync(
                "/api/Takeback/Submit",
                new { takebackId = approved.TakebackId, rowVersion = System.Convert.ToBase64String(approved.RowVersion) });

            Assert.Equal(HttpStatusCode.OK, result.Status);
            Assert.Equal("BUSINESS_RULE", result.ErrorCode);
            Assert.False(string.IsNullOrWhiteSpace(result.Message));
        }

        [Fact]
        public async Task A_stale_row_version_is_http_200_with_concurrency()
        {
            Activity activity = World.SeedActivity();
            string stale = System.Convert.ToBase64String(activity.RowVersion);

            ApiResult first = await PostAsync("/api/Activity/Save", Edit(activity.ActivityId, stale, "First edit"));
            ApiResult second = await PostAsync("/api/Activity/Save", Edit(activity.ActivityId, stale, "Second edit"));

            Assert.True(first.Success);
            Assert.Equal(HttpStatusCode.OK, second.Status);
            Assert.Equal("CONCURRENCY", second.ErrorCode);
        }

        [Fact]
        public async Task A_role_violation_is_http_403_with_forbidden()
        {
            Takeback pending = World.SeedTakeback(TakebackStatus.PendingApproval);

            ApiResult result = await PostAsync(
                "/api/Takeback/Approve",
                new { takebackId = pending.TakebackId, rowVersion = System.Convert.ToBase64String(pending.RowVersion) },
                Personas.Jamie);

            Assert.Equal(HttpStatusCode.Forbidden, result.Status);
            Assert.Equal("FORBIDDEN", result.ErrorCode);
        }

        [Fact]
        public async Task A_body_that_is_not_json_is_http_400_with_bad_request()
        {
            ApiResult result = await PostAsync("/api/Activity/Search", "{ \"pageNumber\": ");

            Assert.Equal(HttpStatusCode.BadRequest, result.Status);
            Assert.False(result.Success);
            Assert.Equal("BAD_REQUEST", result.ErrorCode);
        }

        [Fact]
        public async Task A_value_of_the_wrong_type_is_http_400_and_names_the_field_without_parser_details()
        {
            ApiResult result = await PostAsync("/api/Activity/Search", "{ \"pageNumber\": \"abc\" }");

            Assert.Equal(HttpStatusCode.BadRequest, result.Status);
            Assert.Equal("BAD_REQUEST", result.ErrorCode);
            JToken error = Assert.Single(result.Errors);
            Assert.Equal("pageNumber", (string)error["field"]);
            Assert.DoesNotContain("Newtonsoft", result.Raw);
            Assert.DoesNotContain("line 1", result.Raw);
        }

        [Fact]
        public async Task A_missing_body_is_http_400()
        {
            ApiResult result = await PostAsync("/api/Activity/Search", "");

            Assert.Equal(HttpStatusCode.BadRequest, result.Status);
            Assert.Equal("BAD_REQUEST", result.ErrorCode);
        }

        [Fact]
        public async Task An_empty_search_body_uses_the_defaults()
        {
            World.SeedActivity();

            ApiResult result = await PostAsync("/api/Activity/Search", new { });

            Assert.True(result.Success);
            Assert.Equal(1, (int)result.Data["totalCount"]);
            Assert.Equal(20, (int)result.Data["pageSize"]);
        }

        [Fact]
        public async Task Unknown_properties_are_ignored()
        {
            ApiResult result = await PostAsync("/api/Activity/Search", new { somethingElse = 5 });

            Assert.True(result.Success);
        }

        [Fact]
        public async Task A_route_that_does_not_exist_is_a_plain_404()
        {
            ApiResult result = await GetAsync("/api/Activity/Delete?id=1");

            Assert.Equal(HttpStatusCode.NotFound, result.Status);
        }

        [Fact]
        public async Task The_wrong_http_method_is_a_405()
        {
            ApiResult result = await GetAsync("/api/Activity/Save");

            Assert.Equal(HttpStatusCode.MethodNotAllowed, result.Status);
        }

        private static object Edit(int activityId, string rowVersion, string subject)
        {
            return new
            {
                activityId,
                rowVersion,
                memberId = 1,
                activityType = 1,
                priority = 2,
                status = 1,
                subject,
                assignedToUserId = 1
            };
        }
    }

    public class ServerErrorTests : ApiTestBase
    {
        public ServerErrorTests()
            : base(CreateFactory())
        {
        }

        private static ApiFactory CreateFactory()
        {
            var factory = new ApiFactory();
            factory.Customize = services => services.AddSingleton<IDashboardRepository>(new ExplodingDashboardRepository());
            return factory;
        }

        private class ExplodingDashboardRepository : IDashboardRepository
        {
            public DashboardSummary GetSummary(int userId)
            {
                throw new IOException("secret connection detail");
            }
        }

        [Fact]
        public async Task An_unexpected_error_is_http_500_with_a_trace_id_and_no_internals()
        {
            ApiResult result = await GetAsync("/api/Dashboard/GetSummary");

            Assert.Equal(HttpStatusCode.InternalServerError, result.Status);
            Assert.False(result.Success);
            Assert.Equal("SERVER_ERROR", result.ErrorCode);
            Assert.Contains("reference", result.Message);
            Assert.DoesNotContain("secret connection detail", result.Raw);
            Assert.DoesNotContain("IOException", result.Raw);
        }

        [Fact]
        public async Task Other_endpoints_keep_working()
        {
            Assert.True((await GetAsync("/api/Lookup/GetAll")).Success);
        }
    }
}
