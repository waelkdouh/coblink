using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using CobLink.Data.Tests.Infrastructure;
using CobLink.Models;
using Xunit;

namespace CobLink.Data.Tests
{
    /// <summary>
    /// Guards the demo data of database/sample-data/900_SampleData.sql. Workshops, screenshots and many other tests
    /// rely on it, so the checks are about the data's story: amounts add up, histories are continuous, nothing lies
    /// in the future and every status, type and reason is represented. Read only.
    /// </summary>
    [Collection(SeededDatabaseCollection.Name)]
    public class SampleDataTests
    {
        private readonly SeededDatabaseFixture _db;

        public SampleDataTests(SeededDatabaseFixture db)
        {
            _db = db;
        }

        [SqlTheory]
        [InlineData("AppUser", 6)]
        [InlineData("Member", 19)]
        [InlineData("Provider", 10)]
        [InlineData("Takeback", 18)]
        [InlineData("TakebackRecovery", 7)]
        [InlineData("TakebackHistory", 71)]
        [InlineData("Activity", 27)]
        [InlineData("ActivityNote", 53)]
        public void The_demo_data_has_the_documented_size(string table, int expectedRows)
        {
            Assert.Equal(expectedRows, _db.Database.Scalar<int>("SELECT COUNT(*) FROM dbo." + table));
        }

        [SqlFact]
        public void Every_takeback_adds_up_and_has_a_continuous_history()
        {
            DateTime today = _db.Database.ServerToday();
            DateTime now = _db.Database.ServerUtcNow();

            foreach (TakebackListItem item in AllTakebacks())
            {
                Takeback t = _db.Takebacks.GetById(item.TakebackId);
                string who = t.TakebackNumber + ": ";

                Assert.Equal("TB-" + t.TakebackId.ToString("D6"), t.TakebackNumber);

                // amounts
                Assert.True(t.TakebackAmount > 0 && t.TakebackAmount <= t.OriginalPaidAmount, who + "takeback amount within the paid amount");
                Assert.True(t.RecoveredAmount >= 0 && t.RecoveredAmount <= t.TakebackAmount, who + "recovered amount within the takeback amount");
                Assert.Equal(t.RecoveredAmount, t.Recoveries.Sum(r => r.Amount));
                if (t.Status == TakebackStatus.Recovered)
                {
                    Assert.Equal(t.TakebackAmount, t.RecoveredAmount);
                }

                if (t.Status == TakebackStatus.PartiallyRecovered)
                {
                    Assert.True(t.RecoveredAmount > 0 && t.RecoveredAmount < t.TakebackAmount, who + "partial recovery");
                }

                // recoveries: oldest first, in the past, one history entry each
                Assert.Equal(t.Recoveries.OrderBy(r => r.RecoveryId).Select(r => r.RecoveryId), t.Recoveries.Select(r => r.RecoveryId));
                Assert.Equal(t.Recoveries.OrderBy(r => r.RecoveryDate).Select(r => r.RecoveryId), t.Recoveries.Select(r => r.RecoveryId));
                Assert.All(t.Recoveries, r => Assert.True(r.RecoveryDate <= today && r.Amount > 0, who + "recovery in the past with a positive amount"));
                List<TakebackHistoryEntry> recoveryEntries = t.History.Where(h => h.Action == TakebackActions.RecordRecovery).ToList();
                Assert.Equal(t.Recoveries.Count, recoveryEntries.Count);
                for (int i = 0; i < recoveryEntries.Count; i++)
                {
                    string expectedComment = "Recovered " + t.Recoveries[i].Amount.ToString("N2", CultureInfo.GetCultureInfo("en-US")) + " by " + t.Recoveries[i].Method + ".";
                    Assert.Equal(expectedComment, recoveryEntries[i].Comment);
                }

                // history: starts with Create, every entry continues where the previous one ended, ends at the current status
                Assert.NotEmpty(t.History);
                Assert.Equal(TakebackActions.Create, t.History[0].Action);
                Assert.Null(t.History[0].FromStatus);
                Assert.Equal(TakebackStatus.Draft, t.History[0].ToStatus);
                Assert.Equal(t.CreatedByUserId, t.History[0].ChangedByUserId);
                Assert.Equal(t.CreatedDate, t.History[0].ChangedDate);
                for (int i = 1; i < t.History.Count; i++)
                {
                    Assert.Equal(t.History[i - 1].ToStatus, t.History[i].FromStatus);
                    Assert.True(t.History[i].HistoryId > t.History[i - 1].HistoryId, who + "history ids increase");
                    Assert.True(t.History[i].ChangedDate >= t.History[i - 1].ChangedDate, who + "history is oldest first");
                }

                Assert.Equal(t.Status, t.History[t.History.Count - 1].ToStatus);

                // approval and notice are stamped exactly when the history says so
                TakebackHistoryEntry approval = t.History.LastOrDefault(h => h.Action == TakebackActions.Approve);
                Assert.Equal(approval != null, t.ApprovedByUserId.HasValue);
                if (approval != null)
                {
                    Assert.Equal(approval.ChangedByUserId, t.ApprovedByUserId.Value);
                    Assert.Equal(approval.ChangedDate, t.ApprovedDate.Value);
                    Assert.NotEqual(t.CreatedByUserId, t.ApprovedByUserId.Value);
                    Assert.NotEqual(UserRole.Analyst, _db.Users.GetById(t.ApprovedByUserId.Value).Role);
                }

                bool noticeSent = t.History.Any(h => h.Action == TakebackActions.SendNotice);
                Assert.Equal(noticeSent, t.NoticeDate.HasValue);
                Assert.Equal(noticeSent, t.DueDate.HasValue);
                if (noticeSent)
                {
                    Assert.True(t.NoticeDate.Value <= today, who + "notice sent in the past");
                    Assert.True(t.DueDate.Value > t.NoticeDate.Value, who + "due after the notice");
                }

                // audit columns and clock
                Assert.Equal(t.ModifiedByUserId.HasValue, t.ModifiedDate.HasValue);
                Assert.True(t.DateOfService <= t.CreatedDate.Date, who + "service before the takeback was created");
                Assert.True(t.CreatedDate <= now, who + "created in the past");
                Assert.True(t.ModifiedDate == null || (t.ModifiedDate.Value >= t.CreatedDate && t.ModifiedDate.Value <= now), who + "modified after creation, in the past");
                Assert.True(t.ApprovedDate == null || t.ApprovedDate.Value <= now, who + "approved in the past");
                Assert.All(t.History, h => Assert.True(h.ChangedDate <= now, who + "history in the past"));
                Assert.All(t.Recoveries, r => Assert.True(r.CreatedDate <= now, who + "recovery recorded in the past"));
            }
        }

        [SqlFact]
        public void Every_activity_is_consistent_with_its_status_takeback_and_notes()
        {
            DateTime now = _db.Database.ServerUtcNow();

            foreach (ActivityListItem item in AllActivities())
            {
                Activity a = _db.Activities.GetById(item.ActivityId);
                string who = a.ActivityNumber + ": ";

                Assert.Equal("ACT-" + a.ActivityId.ToString("D6"), a.ActivityNumber);

                // completion details belong to completed activities only
                bool completed = a.Status == ActivityStatus.Completed;
                Assert.Equal(completed, a.CompletedDate.HasValue);
                Assert.Equal(completed, !string.IsNullOrEmpty(a.Outcome));

                // a linked takeback is the member's takeback
                Assert.Equal(a.TakebackId.HasValue, a.TakebackNumber != null);
                if (a.TakebackId.HasValue)
                {
                    Takeback linked = _db.Takebacks.GetById(a.TakebackId.Value);
                    Assert.Equal(linked.TakebackNumber, a.TakebackNumber);
                    Assert.Equal(linked.MemberId, a.MemberId);
                }

                // notes: the creation note comes first, then oldest first
                Assert.NotEmpty(a.Notes);
                Assert.True(a.Notes[0].IsSystem, who + "first note is the creation note");
                Assert.Equal(a.CreatedDate, a.Notes[0].CreatedDate);
                Assert.Equal(a.CreatedByUserId, a.Notes[0].CreatedByUserId);
                for (int i = 1; i < a.Notes.Count; i++)
                {
                    Assert.True(a.Notes[i].NoteId > a.Notes[i - 1].NoteId, who + "note ids increase");
                    Assert.True(a.Notes[i].CreatedDate >= a.Notes[i - 1].CreatedDate, who + "notes are oldest first");
                }

                // audit columns and clock
                Assert.Equal(a.ModifiedByUserId.HasValue, a.ModifiedDate.HasValue);
                Assert.True(a.CreatedDate <= now, who + "created in the past");
                Assert.True(a.ModifiedDate == null || (a.ModifiedDate.Value >= a.CreatedDate && a.ModifiedDate.Value <= now), who + "modified after creation, in the past");
                Assert.True(a.CompletedDate == null || a.CompletedDate.Value <= now, who + "completed in the past");
                Assert.All(a.Notes, n => Assert.True(n.CreatedDate <= now, who + "notes written in the past"));
                if (a.Status == ActivityStatus.Completed || a.Status == ActivityStatus.Cancelled)
                {
                    Assert.NotNull(a.ModifiedDate);
                }
            }
        }

        [SqlFact]
        public void Every_status_type_priority_reason_and_recovery_method_is_represented()
        {
            List<ActivityListItem> activities = AllActivities();
            List<TakebackListItem> takebacks = AllTakebacks();
            List<TakebackRecovery> recoveries = takebacks.SelectMany(t => _db.Takebacks.GetById(t.TakebackId).Recoveries).ToList();

            Assert.Equal(Enum.GetValues(typeof(ActivityStatus)).Cast<ActivityStatus>().OrderBy(v => (int)v), activities.Select(a => a.Status).Distinct().OrderBy(v => (int)v));
            Assert.Equal(Enum.GetValues(typeof(ActivityType)).Cast<ActivityType>().OrderBy(v => (int)v), activities.Select(a => a.ActivityType).Distinct().OrderBy(v => (int)v));
            Assert.Equal(Enum.GetValues(typeof(ActivityPriority)).Cast<ActivityPriority>().OrderBy(v => (int)v), activities.Select(a => a.Priority).Distinct().OrderBy(v => (int)v));
            Assert.Equal(Enum.GetValues(typeof(TakebackStatus)).Cast<TakebackStatus>().OrderBy(v => (int)v), takebacks.Select(t => t.Status).Distinct().OrderBy(v => (int)v));
            Assert.Equal(Enum.GetValues(typeof(TakebackReason)).Cast<TakebackReason>().OrderBy(v => (int)v), takebacks.Select(t => t.Reason).Distinct().OrderBy(v => (int)v));
            Assert.Equal(Enum.GetValues(typeof(RecoveryMethod)).Cast<RecoveryMethod>().OrderBy(v => (int)v), recoveries.Select(r => r.Method).Distinct().OrderBy(v => (int)v));
        }

        [SqlFact]
        public void The_demo_data_shows_the_situations_a_walkthrough_needs()
        {
            List<ActivityListItem> activities = AllActivities();
            List<TakebackListItem> takebacks = AllTakebacks();

            Assert.Contains(activities, a => a.IsOverdue);
            Assert.Contains(activities, a => a.AssignedToUserId == null);
            Assert.Contains(activities, a => a.DueDate == null);
            Assert.Contains(activities, a => a.TakebackId != null);
            Assert.Contains(activities, a => a.MemberId == null);
            Assert.Contains(takebacks, t => t.IsOverdue);
            Assert.Contains(takebacks, t => t.Status == TakebackStatus.PendingApproval && t.TakebackAmount > 25000m);
            Assert.Contains(takebacks, t => t.Status == TakebackStatus.PendingApproval && t.TakebackAmount <= 25000m);
            Assert.Contains(takebacks, t => t.Status == TakebackStatus.PartiallyRecovered);
        }

        private List<TakebackListItem> AllTakebacks()
        {
            return _db.Takebacks.Search(new TakebackSearchRequest { PageSize = 100 }).Items;
        }

        private List<ActivityListItem> AllActivities()
        {
            return _db.Activities.Search(new ActivitySearchRequest { PageSize = 100 }).Items;
        }
    }
}
