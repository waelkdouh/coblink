using System;
using System.Linq;
using System.Net;
using System.Threading.Tasks;
using CobLink.Models;
using Newtonsoft.Json.Linq;
using Xunit;

namespace CobLink.Api.Tests
{
    /// <summary>End-to-end stories over HTTP: request JSON in, envelope JSON out, several personas.</summary>
    public class ActivityWorkflowApiTests : ApiTestBase
    {
        [Fact]
        public async Task An_activity_is_created_noted_completed_reopened_and_found_by_search()
        {
            ApiResult created = await PostAsync(
                "/api/Activity/Save",
                new
                {
                    memberId = 1,
                    activityType = (int)ActivityType.PhoneCall,
                    priority = (int)ActivityPriority.High,
                    subject = "Call Ava about other coverage",
                    description = "Confirm whether the member has other insurance.",
                    dueDate = "2025-03-20"
                },
                Personas.Jamie);

            Assert.True(created.Success, created.Raw);
            int id = (int)created.Data["activityId"];
            Assert.Equal("ACT-000001", (string)created.Data["activityNumber"]);
            Assert.Equal((int)ActivityStatus.Open, (int)created.Data["status"]);
            Assert.Equal("Jamie Doe", (string)created.Data["assignedToName"]);
            Assert.Equal("Johnson, Ava", (string)created.Data["memberName"]);
            Assert.Equal(new[] { "Edit", "Complete", "Cancel", "AddNote" }, Strings(created.Data["availableActions"]));

            ApiResult noted = await PostAsync(
                "/api/Activity/AddNote", new { activityId = id, noteText = "Left a voicemail." }, Personas.Alex);
            Assert.True(noted.Success, noted.Raw);
            JArray notes = (JArray)noted.Data["notes"];
            Assert.Equal("Left a voicemail.", (string)notes.Last["noteText"]);
            Assert.Equal("Alex Smith", (string)notes.Last["createdByName"]);
            Assert.False((bool)notes.Last["isSystem"]);

            ApiResult completed = await PostAsync(
                "/api/Activity/Complete",
                new { activityId = id, comment = "Member confirmed no other coverage.", rowVersion = (string)noted.Data["rowVersion"] },
                Personas.Jamie);
            Assert.True(completed.Success, completed.Raw);
            Assert.Equal((int)ActivityStatus.Completed, (int)completed.Data["status"]);
            Assert.Equal("Member confirmed no other coverage.", (string)completed.Data["outcome"]);
            Assert.NotEqual(JTokenType.Null, completed.Data["completedDate"].Type);
            Assert.Equal(new[] { "Reopen", "AddNote" }, Strings(completed.Data["availableActions"]));

            ApiResult editWhileCompleted = await PostAsync(
                "/api/Activity/Save",
                new
                {
                    activityId = id,
                    memberId = 1,
                    activityType = 1,
                    priority = 2,
                    status = 1,
                    subject = "Changed",
                    rowVersion = (string)completed.Data["rowVersion"]
                },
                Personas.Jamie);
            Assert.Equal("BUSINESS_RULE", editWhileCompleted.ErrorCode);

            ApiResult reopened = await PostAsync(
                "/api/Activity/Reopen",
                new { activityId = id, rowVersion = (string)completed.Data["rowVersion"] },
                Personas.Jamie);
            Assert.True(reopened.Success, reopened.Raw);
            Assert.Equal((int)ActivityStatus.Open, (int)reopened.Data["status"]);
            Assert.Equal(JTokenType.Null, reopened.Data["completedDate"].Type);
            Assert.Equal(JTokenType.Null, reopened.Data["outcome"].Type);

            ApiResult noMatch = await PostAsync("/api/Activity/Search", new { searchText = "zzz-no-match" }, Personas.Jamie);
            Assert.Equal(0, (int)noMatch.Data["totalCount"]);

            ApiResult byNumber = await PostAsync(
                "/api/Activity/Search", new { searchText = "ACT-000001", openOnly = true }, Personas.Jamie);
            Assert.Equal(1, (int)byNumber.Data["totalCount"]);
            Assert.Equal(id, (int)byNumber.Data["items"][0]["activityId"]);
        }

        [Fact]
        public async Task An_analyst_cannot_cancel_a_colleagues_activity_but_a_supervisor_can()
        {
            Activity activity = World.SeedActivity(a => a.AssignedToUserId = 3);
            string rowVersion = Convert.ToBase64String(activity.RowVersion);

            // Jamie created it and Blake owns it; Alex is neither.
            ApiResult denied = await PostAsync(
                "/api/Activity/Cancel", new { activityId = activity.ActivityId, comment = "Not needed.", rowVersion }, Personas.Alex);
            Assert.Equal(HttpStatusCode.Forbidden, denied.Status);

            ApiResult allowed = await PostAsync(
                "/api/Activity/Cancel", new { activityId = activity.ActivityId, comment = "Not needed.", rowVersion }, Personas.Blake);
            Assert.True(allowed.Success, allowed.Raw);
            Assert.Equal((int)ActivityStatus.Cancelled, (int)allowed.Data["status"]);
        }

        [Fact]
        public async Task Searching_filters_sorts_and_pages()
        {
            World.SeedActivity(a => { a.Subject = "Charlie"; a.DueDate = new DateTime(2025, 3, 18); });
            World.SeedActivity(a => { a.Subject = "Alpha"; a.DueDate = new DateTime(2025, 3, 16); });
            World.SeedActivity(a => { a.Subject = "Bravo"; a.DueDate = null; });
            World.SeedActivity(a => { a.Subject = "Delta"; a.Status = ActivityStatus.Completed; });

            ApiResult byDueDate = await PostAsync("/api/Activity/Search", new { openOnly = true });
            Assert.Equal(new[] { "Alpha", "Charlie", "Bravo" }, byDueDate.Data["items"].Select(i => (string)i["subject"]).ToArray());

            ApiResult bySubjectDescending = await PostAsync(
                "/api/Activity/Search", new { sortBy = "subject", sortDescending = true, pageSize = 2 });
            Assert.Equal(new[] { "Delta", "Charlie" }, bySubjectDescending.Data["items"].Select(i => (string)i["subject"]).ToArray());
            Assert.Equal(4, (int)bySubjectDescending.Data["totalCount"]);
            Assert.Equal(2, (int)bySubjectDescending.Data["totalPages"]);

            ApiResult completedOnly = await PostAsync("/api/Activity/Search", new { status = (int)ActivityStatus.Completed });
            Assert.Equal(1, (int)completedOnly.Data["totalCount"]);
        }

        [Fact]
        public async Task An_unknown_sort_key_is_rejected_instead_of_being_passed_to_the_database()
        {
            ApiResult result = await PostAsync("/api/Activity/Search", new { sortBy = "subject; DROP TABLE Activity" });

            Assert.Equal("VALIDATION", result.ErrorCode);
            Assert.Contains(result.Errors, e => (string)e["field"] == "sortBy");
        }

        [Fact]
        public async Task A_page_size_above_the_maximum_is_rejected()
        {
            ApiResult result = await PostAsync("/api/Activity/Search", new { pageSize = 101 });

            Assert.Equal("VALIDATION", result.ErrorCode);
            Assert.Contains(result.Errors, e => (string)e["field"] == "pageSize");
        }

        private static string[] Strings(JToken array)
        {
            return array.Select(t => (string)t).ToArray();
        }
    }

    public class TakebackWorkflowApiTests : ApiTestBase
    {
        private static object NewTakeback(decimal amount = 1200m, string claim = "CLM-77001")
        {
            return new
            {
                claimNumber = claim,
                memberId = 1,
                providerId = 1,
                reason = (int)TakebackReason.OtherInsurancePrimary,
                dateOfService = "2025-01-15",
                originalPaidAmount = amount + 300m,
                takebackAmount = amount,
                otherCarrierName = "Northwind Health",
                otherPolicyNumber = "NW-4455",
                notes = "Other carrier is primary."
            };
        }

        private async Task<JToken> Act(string action, object body, string user)
        {
            ApiResult result = await PostAsync("/api/Takeback/" + action, body, user);
            Assert.True(result.Success, action + ": " + result.Raw);
            return result.Data;
        }

        [Fact]
        public async Task A_takeback_goes_from_draft_to_recovered_with_the_right_people_at_each_step()
        {
            ApiResult created = await PostAsync("/api/Takeback/Save", NewTakeback(), Personas.Jamie);
            Assert.True(created.Success, created.Raw);
            JToken takeback = created.Data;
            int id = (int)takeback["takebackId"];
            Assert.Equal("TB-000001", (string)takeback["takebackNumber"]);
            Assert.Equal((int)TakebackStatus.Draft, (int)takeback["status"]);
            Assert.Equal(new[] { "Edit", "Submit", "Cancel" }, takeback["availableActions"].Select(a => (string)a).ToArray());

            takeback = await Act("Submit", new { takebackId = id, rowVersion = (string)takeback["rowVersion"] }, Personas.Jamie);
            Assert.Equal((int)TakebackStatus.PendingApproval, (int)takeback["status"]);

            ApiResult analystApproves = await PostAsync(
                "/api/Takeback/Approve", new { takebackId = id, rowVersion = (string)takeback["rowVersion"] }, Personas.Alex);
            Assert.Equal(HttpStatusCode.Forbidden, analystApproves.Status);

            takeback = await Act("Approve", new { takebackId = id, rowVersion = (string)takeback["rowVersion"] }, Personas.Blake);
            Assert.Equal((int)TakebackStatus.Approved, (int)takeback["status"]);
            Assert.Equal("Blake Wilson", (string)takeback["approvedByName"]);
            Assert.Equal(new[] { "SendNotice", "Cancel" }, takeback["availableActions"].Select(a => (string)a).ToArray());

            takeback = await Act("SendNotice", new { takebackId = id, rowVersion = (string)takeback["rowVersion"] }, Personas.Alex);
            Assert.Equal((int)TakebackStatus.NoticeSent, (int)takeback["status"]);
            Assert.Equal("2025-03-14T00:00:00", (string)takeback["noticeDate"]);
            Assert.Equal("2025-04-13T00:00:00", (string)takeback["dueDate"]);

            takeback = await Act(
                "RecordRecovery",
                new
                {
                    takebackId = id,
                    amount = 500m,
                    recoveryDate = "2025-03-14",
                    method = (int)RecoveryMethod.Check,
                    referenceNumber = "CHK-1001",
                    rowVersion = (string)takeback["rowVersion"]
                },
                Personas.Alex);
            Assert.Equal((int)TakebackStatus.PartiallyRecovered, (int)takeback["status"]);
            Assert.Equal(500m, (decimal)takeback["recoveredAmount"]);
            Assert.Equal(700m, (decimal)takeback["outstandingAmount"]);

            ApiResult tooMuch = await PostAsync(
                "/api/Takeback/RecordRecovery",
                new
                {
                    takebackId = id,
                    amount = 700.01m,
                    recoveryDate = "2025-03-14",
                    method = (int)RecoveryMethod.Offset,
                    rowVersion = (string)takeback["rowVersion"]
                },
                Personas.Alex);
            Assert.Equal("VALIDATION", tooMuch.ErrorCode);
            Assert.Contains(tooMuch.Errors, e => (string)e["field"] == "amount");

            takeback = await Act(
                "RecordRecovery",
                new
                {
                    takebackId = id,
                    amount = 700m,
                    recoveryDate = "2025-03-14",
                    method = (int)RecoveryMethod.Eft,
                    referenceNumber = "EFT-9",
                    rowVersion = (string)takeback["rowVersion"]
                },
                Personas.Jamie);
            Assert.Equal((int)TakebackStatus.Recovered, (int)takeback["status"]);
            Assert.Equal(0m, (decimal)takeback["outstandingAmount"]);
            Assert.Empty((JArray)takeback["availableActions"]);
            Assert.Equal(2, ((JArray)takeback["recoveries"]).Count);

            JToken reloaded = (await GetAsync("/api/Takeback/GetById?id=" + id, Personas.Jamie)).Data;
            Assert.Equal(
                new[] { "Create", "Submit", "Approve", "SendNotice", "RecordRecovery", "RecordRecovery" },
                reloaded["history"].Select(h => (string)h["action"]).ToArray());
            Assert.Equal(
                new[] { "Jamie Doe", "Jamie Doe", "Blake Wilson", "Alex Smith", "Alex Smith", "Jamie Doe" },
                reloaded["history"].Select(h => (string)h["changedByName"]).ToArray());

            ApiResult dashboard = await GetAsync("/api/Dashboard/GetSummary", Personas.Jamie);
            Assert.Equal(1200m, (decimal)dashboard.Data["totalTakebackAmount"]);
            Assert.Equal(1200m, (decimal)dashboard.Data["totalRecoveredAmount"]);
            Assert.Equal(0m, (decimal)dashboard.Data["totalOutstandingAmount"]);
        }

        [Fact]
        public async Task The_creator_cannot_approve_their_own_takeback_but_another_supervisor_can()
        {
            // Blake creates and submits; Blake may not approve it, Morgan (another supervisor) may.
            JToken takeback = (await PostAsync("/api/Takeback/Save", NewTakeback(), Personas.Blake)).Data;
            int id = (int)takeback["takebackId"];
            takeback = await Act("Submit", new { takebackId = id, rowVersion = (string)takeback["rowVersion"] }, Personas.Blake);

            ApiResult self = await PostAsync(
                "/api/Takeback/Approve", new { takebackId = id, rowVersion = (string)takeback["rowVersion"] }, Personas.Blake);
            Assert.Equal(HttpStatusCode.Forbidden, self.Status);
            Assert.Equal("FORBIDDEN", self.ErrorCode);
            Assert.Contains("that you created", self.Message);

            JToken approved = await Act(
                "Approve", new { takebackId = id, rowVersion = (string)takeback["rowVersion"] }, "CORP\\mlee");
            Assert.Equal((int)TakebackStatus.Approved, (int)approved["status"]);
        }

        [Fact]
        public async Task A_high_value_takeback_needs_an_administrator_to_approve()
        {
            JToken takeback = (await PostAsync("/api/Takeback/Save", NewTakeback(30000m, "CLM-90001"), Personas.Jamie)).Data;
            int id = (int)takeback["takebackId"];
            takeback = await Act("Submit", new { takebackId = id, rowVersion = (string)takeback["rowVersion"] }, Personas.Jamie);

            ApiResult supervisor = await PostAsync(
                "/api/Takeback/Approve", new { takebackId = id, rowVersion = (string)takeback["rowVersion"] }, Personas.Blake);
            Assert.Equal(HttpStatusCode.Forbidden, supervisor.Status);
            Assert.Equal("FORBIDDEN", supervisor.ErrorCode);
            Assert.Contains("25,000", supervisor.Message);

            JToken approved = await Act(
                "Approve", new { takebackId = id, rowVersion = (string)takeback["rowVersion"] }, Personas.Casey);
            Assert.Equal((int)TakebackStatus.Approved, (int)approved["status"]);
            Assert.Equal("Casey Admin", (string)approved["approvedByName"]);
        }

        [Fact]
        public async Task A_rejected_takeback_is_resubmitted_after_the_reason_is_fixed()
        {
            JToken takeback = (await PostAsync("/api/Takeback/Save", NewTakeback(), Personas.Jamie)).Data;
            int id = (int)takeback["takebackId"];
            takeback = await Act("Submit", new { takebackId = id, rowVersion = (string)takeback["rowVersion"] }, Personas.Jamie);

            ApiResult noComment = await PostAsync(
                "/api/Takeback/Reject", new { takebackId = id, rowVersion = (string)takeback["rowVersion"] }, Personas.Blake);
            Assert.Equal("VALIDATION", noComment.ErrorCode);
            Assert.Contains(noComment.Errors, e => (string)e["field"] == "comment");

            takeback = await Act(
                "Reject",
                new { takebackId = id, comment = "Attach the other carrier's EOB.", rowVersion = (string)takeback["rowVersion"] },
                Personas.Blake);
            Assert.Equal((int)TakebackStatus.Rejected, (int)takeback["status"]);
            Assert.Contains("Edit", takeback["availableActions"].Select(a => (string)a).ToList());

            takeback = await Act("Submit", new { takebackId = id, rowVersion = (string)takeback["rowVersion"] }, Personas.Jamie);
            Assert.Equal((int)TakebackStatus.PendingApproval, (int)takeback["status"]);
        }

        [Fact]
        public async Task A_dispute_is_resolved_by_a_supervisor()
        {
            Takeback seeded = World.SeedTakeback(TakebackStatus.NoticeSent);
            string rowVersion = Convert.ToBase64String(seeded.RowVersion);

            JToken disputed = await Act(
                "Dispute", new { takebackId = seeded.TakebackId, comment = "Provider says Northwind denied.", rowVersion }, Personas.Alex);
            Assert.Equal((int)TakebackStatus.Disputed, (int)disputed["status"]);

            ApiResult analystResolves = await PostAsync(
                "/api/Takeback/ResolveDispute",
                new { takebackId = seeded.TakebackId, upheld = true, comment = "Upheld.", rowVersion = (string)disputed["rowVersion"] },
                Personas.Alex);
            Assert.Equal(HttpStatusCode.Forbidden, analystResolves.Status);

            JToken resolved = await Act(
                "ResolveDispute",
                new { takebackId = seeded.TakebackId, upheld = true, comment = "EOB confirms Northwind is secondary.", rowVersion = (string)disputed["rowVersion"] },
                Personas.Blake);
            Assert.Equal((int)TakebackStatus.NoticeSent, (int)resolved["status"]);
            Assert.Equal("2025-04-13T00:00:00", (string)resolved["dueDate"]);
        }

        [Fact]
        public async Task A_supervisor_can_write_off_and_the_takeback_becomes_read_only()
        {
            Takeback seeded = World.SeedTakeback(TakebackStatus.PartiallyRecovered);

            JToken writtenOff = await Act(
                "WriteOff",
                new { takebackId = seeded.TakebackId, comment = "Provider closed.", rowVersion = Convert.ToBase64String(seeded.RowVersion) },
                Personas.Blake);

            Assert.Equal((int)TakebackStatus.WrittenOff, (int)writtenOff["status"]);
            Assert.Empty((JArray)writtenOff["availableActions"]);
        }

        [Fact]
        public async Task A_stale_row_version_on_a_takeback_save_reports_a_concurrency_conflict()
        {
            JToken takeback = (await PostAsync("/api/Takeback/Save", NewTakeback(), Personas.Jamie)).Data;
            int id = (int)takeback["takebackId"];
            string staleVersion = (string)takeback["rowVersion"];

            object edit = new
            {
                takebackId = id,
                claimNumber = "CLM-77001",
                memberId = 1,
                providerId = 1,
                reason = 1,
                dateOfService = "2025-01-15",
                originalPaidAmount = 1500m,
                takebackAmount = 1100m,
                otherCarrierName = "Northwind Health",
                rowVersion = staleVersion
            };

            Assert.True((await PostAsync("/api/Takeback/Save", edit, Personas.Jamie)).Success);
            ApiResult second = await PostAsync("/api/Takeback/Save", edit, Personas.Jamie);

            Assert.Equal("CONCURRENCY", second.ErrorCode);
        }

        [Fact]
        public async Task Searching_takebacks_filters_by_status_and_text()
        {
            World.SeedTakeback(TakebackStatus.Draft);
            World.SeedTakeback(TakebackStatus.NoticeSent);
            World.SeedTakeback(TakebackStatus.NoticeSent, t => t.ClaimNumber = "CLM-SPECIAL");

            ApiResult noticeSent = await PostAsync("/api/Takeback/Search", new { status = (int)TakebackStatus.NoticeSent });
            Assert.Equal(2, (int)noticeSent.Data["totalCount"]);

            ApiResult special = await PostAsync("/api/Takeback/Search", new { searchText = "special" });
            Assert.Equal(1, (int)special.Data["totalCount"]);
            Assert.Equal("CLM-SPECIAL", (string)special.Data["items"][0]["claimNumber"]);
            Assert.Equal(1200m, (decimal)special.Data["items"][0]["outstandingAmount"]);
        }
    }
}
