using System;
using System.Linq;
using System.Net;
using System.Threading.Tasks;
using CobLink.Models;
using Newtonsoft.Json.Linq;
using Xunit;

namespace CobLink.Api.Tests
{
    public class ReferenceEndpointTests : ApiTestBase
    {
        [Fact]
        public async Task The_user_list_has_the_active_users_only()
        {
            ApiResult result = await GetAsync("/api/User/GetAll");

            Assert.True(result.Success);
            Assert.Equal(
                new[] { "CORP\\admin", "CORP\\asmith", "CORP\\bwilson", "CORP\\jdoe", "CORP\\mlee" },
                result.Data.Select(u => (string)u["userName"]).OrderBy(n => n, StringComparer.Ordinal).ToArray());
            Assert.All(result.Data, u => Assert.True((bool)u["isActive"]));
        }

        [Fact]
        public async Task The_lookups_carry_every_enum_with_its_numeric_value_as_the_id()
        {
            ApiResult result = await GetAsync("/api/Lookup/GetAll");

            AssertLookup<UserRole>(result.Data["userRoles"]);
            AssertLookup<ActivityType>(result.Data["activityTypes"]);
            AssertLookup<ActivityStatus>(result.Data["activityStatuses"]);
            AssertLookup<ActivityPriority>(result.Data["activityPriorities"]);
            AssertLookup<TakebackReason>(result.Data["takebackReasons"]);
            AssertLookup<TakebackStatus>(result.Data["takebackStatuses"]);
            AssertLookup<RecoveryMethod>(result.Data["recoveryMethods"]);
        }

        [Fact]
        public async Task Members_are_found_by_name_or_number()
        {
            ApiResult byName = await GetAsync("/api/Lookup/SearchMembers?term=john");
            Assert.Equal(new[] { "Johnson, Ava" }, byName.Data.Select(m => (string)m["fullName"]).ToArray());

            ApiResult byNumber = await GetAsync("/api/Lookup/SearchMembers?term=M-10000");
            Assert.Equal(3, ((JArray)byNumber.Data).Count);
        }

        [Fact]
        public async Task A_term_shorter_than_two_characters_returns_an_empty_list()
        {
            ApiResult result = await GetAsync("/api/Lookup/SearchMembers?term=j");

            Assert.True(result.Success);
            Assert.Empty((JArray)result.Data);
        }

        [Fact]
        public async Task The_max_parameter_limits_the_result()
        {
            ApiResult result = await GetAsync("/api/Lookup/SearchMembers?term=M-1&max=2");

            Assert.Equal(2, ((JArray)result.Data).Count);
        }

        [Fact]
        public async Task Providers_are_found_by_name_or_npi()
        {
            ApiResult byName = await GetAsync("/api/Lookup/SearchProviders?term=river");
            Assert.Equal("Riverside Medical Group", (string)byName.Data[0]["name"]);

            ApiResult byNpi = await GetAsync("/api/Lookup/SearchProviders?term=1098765432");
            Assert.Equal("P-5002", (string)byNpi.Data[0]["providerNumber"]);
        }

        [Fact]
        public async Task The_dashboard_summarises_activities_and_takebacks_for_the_signed_in_user()
        {
            DateTime today = World.Clock.Today;
            World.SeedActivity(a => a.DueDate = today.AddDays(2));
            World.SeedActivity(a => { a.AssignedToUserId = 2; a.DueDate = today.AddDays(-3); });
            World.SeedActivity(a => a.DueDate = null);
            World.SeedActivity(a => a.Status = ActivityStatus.Completed);
            World.SeedTakeback(TakebackStatus.Draft);
            World.SeedTakeback(TakebackStatus.PendingApproval);
            World.SeedTakeback(TakebackStatus.NoticeSent);
            World.SeedTakeback(TakebackStatus.PartiallyRecovered);

            ApiResult result = await GetAsync("/api/Dashboard/GetSummary", Personas.Jamie);

            Assert.True(result.Success, result.Raw);
            JToken summary = result.Data;
            Assert.Equal(2, (int)summary["myOpenActivities"]);
            Assert.Equal(0, (int)summary["myOverdueActivities"]);
            Assert.Equal(3, (int)summary["openActivities"]);
            Assert.Equal(1, (int)summary["overdueActivities"]);
            Assert.Equal(1, (int)summary["activitiesDueThisWeek"]);
            Assert.Equal(new[] { 1, 3 }, summary["myUpcomingActivities"].Select(a => (int)a["activityId"]).ToArray());
            Assert.Equal(
                new[] { (int)ActivityStatus.Open, (int)ActivityStatus.Completed },
                summary["activitiesByStatus"].Select(s => (int)s["statusId"]).OrderBy(s => s).ToArray());

            Assert.Equal(1, (int)summary["takebacksPendingApproval"]);
            Assert.Equal(2, (int)summary["activeTakebacks"]);
            Assert.Equal(0, (int)summary["overdueTakebacks"]);
            Assert.Equal(2400m, (decimal)summary["totalTakebackAmount"]);
            Assert.Equal(400m, (decimal)summary["totalRecoveredAmount"]);
            Assert.Equal(2000m, (decimal)summary["totalOutstandingAmount"]);
            Assert.Equal(4, ((JArray)summary["takebacksByStatus"]).Count);
            Assert.Equal(4, ((JArray)summary["recentTakebacks"]).Count);
        }

        [Fact]
        public async Task A_provider_search_without_a_match_is_an_empty_list()
        {
            ApiResult result = await GetAsync("/api/Lookup/SearchProviders?term=zzzz");

            Assert.True(result.Success);
            Assert.Empty((JArray)result.Data);
        }

        private static void AssertLookup<TEnum>(JToken items) where TEnum : struct
        {
            int[] expectedIds = Enum.GetValues(typeof(TEnum)).Cast<int>().OrderBy(i => i).ToArray();
            string[] expectedCodes = expectedIds.Select(i => Enum.GetName(typeof(TEnum), i)).ToArray();

            Assert.Equal(expectedIds, items.Select(i => (int)i["id"]).OrderBy(i => i).ToArray());
            Assert.Equal(expectedCodes, items.OrderBy(i => (int)i["id"]).Select(i => (string)i["code"]).ToArray());
            Assert.All(items, i => Assert.False(string.IsNullOrWhiteSpace((string)i["name"])));
        }
    }

    public class HealthApiTests : ApiTestBase
    {
        [Fact]
        public async Task The_probe_needs_no_credentials_and_reports_a_healthy_database()
        {
            Http.DefaultRequestHeaders.Clear();

            ApiResult result = await GetAsync("/health");

            Assert.Equal(HttpStatusCode.OK, result.Status);
            Assert.Equal("Healthy", (string)result.Json["status"]);
            Assert.Equal("Up", (string)result.Json["database"]);
            Assert.Equal("Testing", (string)result.Json["environment"]);
            Assert.Matches(@"^\d+\.\d+\.\d+$", (string)result.Json["version"]);
            Assert.False(result.Json.ContainsKey("success"));
        }

        [Fact]
        public async Task A_database_outage_is_a_503_that_does_not_leak_the_reason()
        {
            World.DatabaseStatus.IsUp = false;

            ApiResult result = await GetAsync("/health");

            Assert.Equal(HttpStatusCode.ServiceUnavailable, result.Status);
            Assert.Equal("Unhealthy", (string)result.Json["status"]);
            Assert.Equal("Down", (string)result.Json["database"]);
            Assert.DoesNotContain("fake database", result.Raw);
        }
    }
}
