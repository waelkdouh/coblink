using System;
using System.Linq;
using System.Net;
using System.Threading.Tasks;
using CobLink.Models;
using Newtonsoft.Json.Linq;
using Xunit;

namespace CobLink.Api.Tests
{
    /// <summary>Pins the JSON wire format the Angular client (and a future REST rewrite) depends on.</summary>
    public class SerializationTests : ApiTestBase
    {
        [Fact]
        public async Task An_activity_uses_camel_case_numeric_enums_and_the_documented_date_formats()
        {
            Activity seeded = World.SeedActivity(a => a.DueDate = new DateTime(2025, 3, 19));

            ApiResult result = await GetAsync("/api/Activity/GetById?id=" + seeded.ActivityId);

            var activity = (JObject)result.Data;
            Assert.All(activity.Properties(), p => Assert.True(char.IsLower(p.Name[0]), p.Name));
            Assert.Equal(JTokenType.Integer, activity["status"].Type);
            Assert.Equal(1, (int)activity["status"]);
            Assert.Equal(JTokenType.Integer, activity["activityType"].Type);
            Assert.Equal(2, (int)activity["priority"]);
            Assert.Equal("2025-03-19T00:00:00", (string)activity["dueDate"]);
            Assert.Equal("2025-03-14T15:30:00Z", (string)activity["createdDate"]);
            Assert.True(activity.ContainsKey("completedDate"));
            Assert.Equal(JTokenType.Null, activity["completedDate"].Type);
            Assert.Equal(8, Convert.FromBase64String((string)activity["rowVersion"]).Length);
            Assert.Equal(JTokenType.Array, activity["notes"].Type);
            Assert.Equal(JTokenType.Array, activity["availableActions"].Type);
            Assert.Equal(JTokenType.Boolean, activity["isOverdue"].Type);
        }

        [Fact]
        public async Task A_takeback_serializes_money_as_numbers_and_includes_the_calculated_members()
        {
            Takeback seeded = World.SeedTakeback(TakebackStatus.PartiallyRecovered);

            ApiResult result = await GetAsync("/api/Takeback/GetById?id=" + seeded.TakebackId);

            var takeback = (JObject)result.Data;
            Assert.All(takeback.Properties(), p => Assert.True(char.IsLower(p.Name[0]), p.Name));
            Assert.Equal(1200m, (decimal)takeback["takebackAmount"]);
            Assert.Equal(400m, (decimal)takeback["recoveredAmount"]);
            Assert.Equal(800m, (decimal)takeback["outstandingAmount"]);
            Assert.Equal(JTokenType.Float, takeback["takebackAmount"].Type);
            Assert.Equal((int)TakebackStatus.PartiallyRecovered, (int)takeback["status"]);
            Assert.Equal("2025-03-04T00:00:00", (string)takeback["noticeDate"]);
            Assert.Equal("2025-04-03T00:00:00", (string)takeback["dueDate"]);
            Assert.Equal(JTokenType.Array, takeback["recoveries"].Type);
            Assert.Equal(JTokenType.Array, takeback["history"].Type);
            Assert.Equal(JTokenType.Array, takeback["linkedActivities"].Type);
            Assert.Equal("Johnson, Ava", (string)takeback["memberName"]);
        }

        [Fact]
        public async Task A_page_has_items_and_paging_members()
        {
            World.SeedActivity();
            World.SeedActivity();
            World.SeedActivity();

            ApiResult result = await PostAsync("/api/Activity/Search", new { pageNumber = 2, pageSize = 2 });

            Assert.Equal(
                new[] { "items", "pageNumber", "pageSize", "totalCount", "totalPages" },
                ((JObject)result.Data).Properties().Select(p => p.Name).OrderBy(n => n).ToArray());
            Assert.Equal(3, (int)result.Data["totalCount"]);
            Assert.Equal(2, (int)result.Data["totalPages"]);
            Assert.Single((JArray)result.Data["items"]);
        }

        [Fact]
        public async Task Date_only_input_is_accepted_as_yyyy_MM_dd_and_returned_with_a_zero_time()
        {
            ApiResult result = await PostAsync(
                "/api/Activity/Save",
                new { memberId = 1, activityType = 1, priority = 2, subject = "Date check", dueDate = "2025-03-20" });

            Assert.True(result.Success, result.Raw);
            Assert.Equal("2025-03-20T00:00:00", (string)result.Data["dueDate"]);
        }

        [Fact]
        public async Task The_row_version_round_trips_as_a_base64_string()
        {
            Activity seeded = World.SeedActivity();
            string rowVersion = Convert.ToBase64String(seeded.RowVersion);

            ApiResult result = await PostAsync(
                "/api/Activity/Complete",
                new { activityId = seeded.ActivityId, rowVersion, comment = "Done." });

            Assert.True(result.Success, result.Raw);
            Assert.NotEqual(rowVersion, (string)result.Data["rowVersion"]);
        }

        [Fact]
        public async Task A_row_version_that_is_not_base64_is_a_bad_request()
        {
            Activity seeded = World.SeedActivity();

            ApiResult result = await PostAsync(
                "/api/Activity/Complete",
                "{ \"activityId\": " + seeded.ActivityId + ", \"rowVersion\": \"%%%\", \"comment\": \"x\" }");

            Assert.Equal(HttpStatusCode.BadRequest, result.Status);
            Assert.Equal("BAD_REQUEST", result.ErrorCode);
        }

        [Fact]
        public async Task Enums_are_accepted_as_numbers_and_unknown_numbers_are_validated_by_the_business_layer()
        {
            ApiResult result = await PostAsync(
                "/api/Activity/Save",
                new { memberId = 1, activityType = 99, priority = 2, subject = "Bad type" });

            Assert.Equal("VALIDATION", result.ErrorCode);
            Assert.Contains(result.Errors, e => (string)e["field"] == "activityType");
        }
    }
}
