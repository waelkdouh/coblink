using System;
using System.Collections.Generic;
using System.Linq;
using CobLink.Data.Repositories;
using CobLink.Data.Tests.Infrastructure;
using CobLink.Models;
using Xunit;

namespace CobLink.Data.Tests
{
    /// <summary>Read-only tests of IActivityRepository against the demo data (27 activities).</summary>
    [Collection(SeededDatabaseCollection.Name)]
    public class ActivityRepositoryReadTests
    {
        private static readonly string[] SortKeys =
        {
            "activityNumber", "subject", "activityType", "status", "priority", "memberName", "assignedToName", "createdDate"
        };

        private readonly SeededDatabaseFixture _db;
        private readonly IActivityRepository _activities;

        public ActivityRepositoryReadTests(SeededDatabaseFixture db)
        {
            _db = db;
            _activities = db.Activities;
        }

        // ---- search: paging and default order ---------------------------------------------------------------------

        [SqlFact]
        public void Search_without_criteria_returns_every_activity()
        {
            PagedResult<ActivityListItem> result = Search();

            Assert.Equal(27, result.TotalCount);
            Assert.Equal(27, result.Items.Count);
            Assert.Equal(result.Items.Count, result.Items.Select(i => i.ActivityId).Distinct().Count());
            Assert.Equal(1, result.PageNumber);
            Assert.Equal(100, result.PageSize);
            Assert.Equal(1, result.TotalPages);
        }

        [SqlFact]
        public void Search_orders_by_due_date_with_undated_activities_last_by_default()
        {
            IList<ActivityListItem> items = Search().Items;

            AssertDueDateOrder(items, false);
            Assert.Contains(items, i => i.DueDate == null);
        }

        [SqlFact]
        public void Search_pages_through_the_result_without_gaps_or_repeats()
        {
            List<int> everything = Search().Items.Select(i => i.ActivityId).ToList();
            List<int> paged = new List<int>();

            for (int page = 1; page <= 3; page++)
            {
                PagedResult<ActivityListItem> result = _activities.Search(new ActivitySearchRequest { PageNumber = page, PageSize = 10 });

                Assert.Equal(everything.Count, result.TotalCount);
                Assert.Equal(page, result.PageNumber);
                Assert.Equal(10, result.PageSize);
                Assert.Equal(3, result.TotalPages);
                paged.AddRange(result.Items.Select(i => i.ActivityId));
            }

            Assert.Equal(everything, paged);
        }

        [SqlFact]
        public void Search_clamps_the_paging_arguments()
        {
            PagedResult<ActivityListItem> smallest = _activities.Search(new ActivitySearchRequest { PageNumber = 0, PageSize = 0 });
            Assert.Equal(1, smallest.PageNumber);
            Assert.Equal(1, smallest.PageSize);
            Assert.Single(smallest.Items);
            Assert.Equal(27, smallest.TotalCount);

            PagedResult<ActivityListItem> largest = _activities.Search(new ActivitySearchRequest { PageSize = 5000 });
            Assert.Equal(100, largest.PageSize);
            Assert.Equal(27, largest.Items.Count);

            PagedResult<ActivityListItem> beyondTheEnd = _activities.Search(new ActivitySearchRequest { PageNumber = 50, PageSize = 10 });
            Assert.Empty(beyondTheEnd.Items);
            Assert.Equal(27, beyondTheEnd.TotalCount);
        }

        // ---- search: filters --------------------------------------------------------------------------------------

        [SqlTheory]
        [InlineData(ActivityStatus.Open, 16)]
        [InlineData(ActivityStatus.InProgress, 5)]
        [InlineData(ActivityStatus.Completed, 5)]
        [InlineData(ActivityStatus.Cancelled, 1)]
        public void Search_filters_by_status(ActivityStatus status, int expectedCount)
        {
            PagedResult<ActivityListItem> result = Search(r => r.Status = status);

            Assert.Equal(expectedCount, result.TotalCount);
            Assert.All(result.Items, i => Assert.Equal(status, i.Status));
        }

        [SqlFact]
        public void Search_with_OpenOnly_returns_open_and_in_progress_activities()
        {
            PagedResult<ActivityListItem> result = Search(r => r.OpenOnly = true);

            Assert.Equal(21, result.TotalCount);
            Assert.All(result.Items, i => Assert.True(i.Status == ActivityStatus.Open || i.Status == ActivityStatus.InProgress));
        }

        [SqlFact]
        public void Search_with_OverdueOnly_returns_the_open_activities_that_are_past_due()
        {
            DateTime today = _db.Database.ServerToday();

            PagedResult<ActivityListItem> result = Search(r => r.OverdueOnly = true);

            Assert.Equal(3, result.TotalCount);
            Assert.All(result.Items, i =>
            {
                Assert.True(i.IsOverdue);
                Assert.True(i.Status == ActivityStatus.Open || i.Status == ActivityStatus.InProgress);
                Assert.True(i.DueDate.Value < today);
            });
        }

        [SqlFact]
        public void IsOverdue_means_open_and_past_due_for_every_activity()
        {
            DateTime today = _db.Database.ServerToday();

            foreach (ActivityListItem item in Search().Items)
            {
                bool open = item.Status == ActivityStatus.Open || item.Status == ActivityStatus.InProgress;
                Assert.Equal(open && item.DueDate.HasValue && item.DueDate.Value < today, item.IsOverdue);
            }
        }

        [SqlFact]
        public void Search_filters_by_type()
        {
            int total = 0;
            foreach (ActivityType type in Enum.GetValues(typeof(ActivityType)))
            {
                ActivityType current = type;
                PagedResult<ActivityListItem> result = Search(r => r.ActivityType = current);

                Assert.True(result.TotalCount > 0, "The demo data has no " + type + " activity.");
                Assert.All(result.Items, i => Assert.Equal(current, i.ActivityType));
                total += result.TotalCount;
            }

            Assert.Equal(27, total);
        }

        [SqlFact]
        public void Search_filters_by_priority()
        {
            int total = 0;
            foreach (ActivityPriority priority in Enum.GetValues(typeof(ActivityPriority)))
            {
                ActivityPriority current = priority;
                PagedResult<ActivityListItem> result = Search(r => r.Priority = current);

                Assert.True(result.TotalCount > 0, "The demo data has no " + priority + " activity.");
                Assert.All(result.Items, i => Assert.Equal(current, i.Priority));
                total += result.TotalCount;
            }

            Assert.Equal(27, total);
        }

        [SqlFact]
        public void Search_filters_by_assignee()
        {
            PagedResult<ActivityListItem> result = Search(r =>
            {
                r.AssignedToUserId = SampleUsers.Jamie;
                r.OpenOnly = true;
            });

            Assert.Equal(7, result.TotalCount);
            Assert.All(result.Items, i =>
            {
                Assert.Equal(SampleUsers.Jamie, i.AssignedToUserId);
                Assert.Equal("Jamie Doe", i.AssignedToName);
            });
        }

        [SqlFact]
        public void Search_filters_by_member()
        {
            IList<ActivityListItem> all = Search().Items;
            int memberId = all.First(i => i.MemberId.HasValue).MemberId.Value;

            PagedResult<ActivityListItem> result = Search(r => r.MemberId = memberId);

            Assert.Equal(all.Count(i => i.MemberId == memberId), result.TotalCount);
            Assert.All(result.Items, i => Assert.Equal(memberId, i.MemberId));
        }

        [SqlFact]
        public void Search_filters_by_takeback()
        {
            IList<ActivityListItem> all = Search().Items;
            int takebackId = all.First(i => i.TakebackId.HasValue).TakebackId.Value;

            PagedResult<ActivityListItem> result = Search(r => r.TakebackId = takebackId);

            Assert.Equal(all.Count(i => i.TakebackId == takebackId), result.TotalCount);
            Assert.All(result.Items, i => Assert.Equal(takebackId, i.TakebackId));
        }

        [SqlFact]
        public void Search_filters_by_due_date_range_inclusively()
        {
            DateTime today = _db.Database.ServerToday();
            IList<ActivityListItem> all = Search().Items;

            PagedResult<ActivityListItem> thisWeek = Search(r =>
            {
                r.OpenOnly = true;
                r.DueFrom = today;
                r.DueTo = today.AddDays(7);
            });

            int expected = all.Count(i =>
                (i.Status == ActivityStatus.Open || i.Status == ActivityStatus.InProgress)
                && i.DueDate.HasValue && i.DueDate.Value >= today && i.DueDate.Value <= today.AddDays(7));
            Assert.True(expected > 0);
            Assert.Equal(expected, thisWeek.TotalCount);

            DateTime oneDay = all.First(i => i.DueDate.HasValue).DueDate.Value;
            PagedResult<ActivityListItem> exactly = Search(r =>
            {
                r.DueFrom = oneDay;
                r.DueTo = oneDay;
            });
            Assert.Equal(all.Count(i => i.DueDate == oneDay), exactly.TotalCount);
            Assert.All(exactly.Items, i => Assert.Equal(oneDay, i.DueDate));
        }

        [SqlFact]
        public void Search_text_matches_the_activity_number_ignoring_case()
        {
            PagedResult<ActivityListItem> upper = Search(r => r.SearchText = "ACT-000001");
            PagedResult<ActivityListItem> lower = Search(r => r.SearchText = "act-000001");

            Assert.Contains(upper.Items, i => i.ActivityNumber == "ACT-000001");
            Assert.Equal(upper.Items.Select(i => i.ActivityId), lower.Items.Select(i => i.ActivityId));
        }

        [SqlFact]
        public void Search_text_matches_the_subject()
        {
            ActivityListItem item = Search().Items.First();

            PagedResult<ActivityListItem> result = Search(r => r.SearchText = item.Subject);

            Assert.Contains(result.Items, i => i.ActivityId == item.ActivityId);
        }

        [SqlFact]
        public void Search_text_matches_member_and_takeback_numbers()
        {
            IList<ActivityListItem> all = Search().Items;
            ActivityListItem withBoth = all.First(i => i.MemberNumber != null && i.TakebackNumber != null);

            PagedResult<ActivityListItem> byMember = Search(r => r.SearchText = withBoth.MemberNumber);
            Assert.All(all.Where(i => i.MemberNumber == withBoth.MemberNumber), expected => Assert.Contains(byMember.Items, i => i.ActivityId == expected.ActivityId));

            PagedResult<ActivityListItem> byTakeback = Search(r => r.SearchText = withBoth.TakebackNumber);
            Assert.All(all.Where(i => i.TakebackNumber == withBoth.TakebackNumber), expected => Assert.Contains(byTakeback.Items, i => i.ActivityId == expected.ActivityId));
        }

        [SqlTheory]
        [InlineData("%")]
        [InlineData("_")]
        [InlineData("[")]
        [InlineData("\\")]
        [InlineData("ACT-00000_")]
        public void Search_text_treats_wildcards_literally(string text)
        {
            Assert.Equal(0, Search(r => r.SearchText = text).TotalCount);
        }

        [SqlFact]
        public void Search_text_with_a_sql_injection_attempt_is_just_text()
        {
            Assert.Equal(0, Search(r => r.SearchText = "'; DROP TABLE dbo.Activity; --").TotalCount);

            Assert.Equal(27, Search().TotalCount);
        }

        [SqlFact]
        public void Search_text_that_is_null_or_empty_means_no_filter()
        {
            Assert.Equal(27, Search(r => r.SearchText = string.Empty).TotalCount);
            Assert.Equal(27, Search(r => r.SearchText = null).TotalCount);
        }

        // ---- search: sorting --------------------------------------------------------------------------------------

        [SqlTheory]
        [InlineData("activityNumber")]
        [InlineData("subject")]
        [InlineData("activityType")]
        [InlineData("status")]
        [InlineData("priority")]
        [InlineData("memberName")]
        [InlineData("assignedToName")]
        [InlineData("createdDate")]
        public void Sorting_descending_is_the_exact_reverse_of_sorting_ascending(string sortBy)
        {
            List<int> ascending = Search(r => r.SortBy = sortBy).Items.Select(i => i.ActivityId).ToList();
            List<int> descending = Search(r =>
            {
                r.SortBy = sortBy;
                r.SortDescending = true;
            }).Items.Select(i => i.ActivityId).ToList();

            Assert.Equal(27, ascending.Count);
            ascending.Reverse();
            Assert.Equal(ascending, descending);
        }

        [SqlFact]
        public void Sorting_by_a_numeric_key_orders_by_that_key()
        {
            IList<ActivityListItem> byType = Search(r => r.SortBy = "activityType").Items;
            Assert.Equal(byType.OrderBy(i => (int)i.ActivityType).Select(i => i.ActivityId), byType.Select(i => i.ActivityId));

            IList<ActivityListItem> byStatus = Search(r => r.SortBy = "status").Items;
            Assert.Equal(byStatus.OrderBy(i => (int)i.Status).Select(i => i.ActivityId), byStatus.Select(i => i.ActivityId));

            IList<ActivityListItem> byPriority = Search(r => r.SortBy = "priority").Items;
            Assert.Equal(byPriority.OrderBy(i => (int)i.Priority).Select(i => i.ActivityId), byPriority.Select(i => i.ActivityId));

            IList<ActivityListItem> byCreated = Search(r => r.SortBy = "createdDate").Items;
            Assert.Equal(byCreated.OrderBy(i => i.CreatedDate).Select(i => i.CreatedDate), byCreated.Select(i => i.CreatedDate));

            IList<ActivityListItem> byNumber = Search(r => r.SortBy = "activityNumber").Items;
            Assert.Equal(byNumber.OrderBy(i => i.ActivityId).Select(i => i.ActivityNumber), byNumber.Select(i => i.ActivityNumber));
        }

        [SqlFact]
        public void Sorting_by_name_puts_activities_without_a_member_or_assignee_first_ascending()
        {
            IList<ActivityListItem> byMember = Search(r => r.SortBy = "memberName").Items;
            Assert.True(byMember.First().MemberName == null);
            AssertNullsFirst(byMember.Select(i => i.MemberName));

            IList<ActivityListItem> byAssignee = Search(r => r.SortBy = "assignedToName").Items;
            Assert.True(byAssignee.First().AssignedToName == null);
            AssertNullsFirst(byAssignee.Select(i => i.AssignedToName));
        }

        [SqlFact]
        public void Sorting_by_due_date_keeps_undated_activities_last_in_both_directions()
        {
            AssertDueDateOrder(Search(r => r.SortBy = "dueDate").Items, false);
            AssertDueDateOrder(Search(r =>
            {
                r.SortBy = "dueDate";
                r.SortDescending = true;
            }).Items, true);
        }

        [SqlFact]
        public void Sorting_by_an_unknown_key_falls_back_to_the_default_order_and_never_reaches_the_sql()
        {
            List<int> expected = Search().Items.Select(i => i.ActivityId).ToList();

            foreach (string sortBy in new[] { "bogus", "DueDate; DROP TABLE dbo.Activity;--", "1", "createdDate desc", string.Empty })
            {
                string key = sortBy;
                Assert.Equal(expected, Search(r => r.SortBy = key).Items.Select(i => i.ActivityId).ToList());
            }

            Assert.Equal(27, Search().TotalCount);
        }

        [SqlFact]
        public void Sorting_works_for_every_whitelisted_key_together_with_paging()
        {
            foreach (string sortBy in SortKeys.Concat(new[] { "dueDate" }))
            {
                string key = sortBy;
                PagedResult<ActivityListItem> page = _activities.Search(new ActivitySearchRequest { SortBy = key, PageNumber = 2, PageSize = 10 });

                Assert.Equal(10, page.Items.Count);
                Assert.Equal(27, page.TotalCount);
            }
        }

        // ---- GetById ----------------------------------------------------------------------------------------------

        [SqlFact]
        public void GetById_returns_the_same_data_as_the_list_plus_audit_columns_and_notes_oldest_first()
        {
            IList<ActivityListItem> all = Search().Items;
            Activity activity = all.Select(i => _activities.GetById(i.ActivityId)).First(a => a.Notes.Count >= 2 && a.TakebackId.HasValue && a.AssignedToUserId.HasValue);
            ActivityListItem item = all.Single(i => i.ActivityId == activity.ActivityId);

            Assert.Equal(item.ActivityNumber, activity.ActivityNumber);
            Assert.Equal(item.Subject, activity.Subject);
            Assert.Equal(item.ActivityType, activity.ActivityType);
            Assert.Equal(item.Status, activity.Status);
            Assert.Equal(item.Priority, activity.Priority);
            Assert.Equal(item.MemberId, activity.MemberId);
            Assert.Equal(item.MemberNumber, activity.MemberNumber);
            Assert.Equal(item.MemberName, activity.MemberName);
            Assert.Equal(item.TakebackId, activity.TakebackId);
            Assert.Equal(item.TakebackNumber, activity.TakebackNumber);
            Assert.Equal(item.AssignedToUserId, activity.AssignedToUserId);
            Assert.Equal(item.AssignedToName, activity.AssignedToName);
            Assert.Equal(item.DueDate, activity.DueDate);
            Assert.Equal(item.IsOverdue, activity.IsOverdue);
            Assert.Equal(item.CreatedDate, activity.CreatedDate);

            Assert.False(string.IsNullOrWhiteSpace(activity.CreatedByName));
            Assert.NotNull(activity.RowVersion);
            Assert.Equal(8, activity.RowVersion.Length);

            Assert.Equal(activity.Notes.OrderBy(n => n.NoteId).Select(n => n.NoteId), activity.Notes.Select(n => n.NoteId));
            Assert.All(activity.Notes, note =>
            {
                Assert.Equal(activity.ActivityId, note.ActivityId);
                Assert.False(string.IsNullOrWhiteSpace(note.NoteText));
                Assert.False(string.IsNullOrWhiteSpace(note.CreatedByName));
            });
        }

        [SqlFact]
        public void GetById_distinguishes_system_notes_from_user_notes()
        {
            List<ActivityNote> notes = Search().Items.SelectMany(i => _activities.GetById(i.ActivityId).Notes).ToList();

            Assert.Contains(notes, n => n.IsSystem);
            Assert.Contains(notes, n => !n.IsSystem);
        }

        [SqlFact]
        public void GetById_returns_utc_timestamps_and_unspecified_dates()
        {
            Activity activity = Search().Items.Select(i => _activities.GetById(i.ActivityId)).First(a => a.DueDate.HasValue && a.Notes.Count > 0);

            Assert.Equal(DateTimeKind.Utc, activity.CreatedDate.Kind);
            Assert.Equal(DateTimeKind.Unspecified, activity.DueDate.Value.Kind);
            Assert.Equal(DateTimeKind.Utc, activity.Notes[0].CreatedDate.Kind);
        }

        [SqlFact]
        public void GetById_returns_completion_details_of_a_completed_activity()
        {
            ActivityListItem completed = Search(r => r.Status = ActivityStatus.Completed).Items.First();

            Activity activity = _activities.GetById(completed.ActivityId);

            Assert.NotNull(activity.CompletedDate);
            Assert.Equal(DateTimeKind.Utc, activity.CompletedDate.Value.Kind);
            Assert.False(string.IsNullOrWhiteSpace(activity.Outcome));
            Assert.False(activity.IsOverdue);
        }

        [SqlFact]
        public void GetById_returns_the_unassigned_undated_activity_with_null_columns()
        {
            ActivityListItem item = Search().Items.Single(i => i.AssignedToUserId == null);

            Activity activity = _activities.GetById(item.ActivityId);

            Assert.Null(activity.AssignedToName);
            Assert.Null(activity.DueDate);
            Assert.Null(activity.ModifiedByUserId);
            Assert.Null(activity.ModifiedDate);
        }

        [SqlFact]
        public void GetById_returns_null_for_an_unknown_id()
        {
            Assert.Null(_activities.GetById(999999));
        }

        // ---- helpers ----------------------------------------------------------------------------------------------

        private PagedResult<ActivityListItem> Search(Action<ActivitySearchRequest> configure = null)
        {
            ActivitySearchRequest request = new ActivitySearchRequest { PageSize = 100 };
            if (configure != null)
            {
                configure(request);
            }

            return _activities.Search(request);
        }

        private static void AssertDueDateOrder(IList<ActivityListItem> items, bool descending)
        {
            List<ActivityListItem> dated = items.Where(i => i.DueDate.HasValue).ToList();
            Assert.Equal(
                descending ? dated.OrderByDescending(i => i.DueDate).Select(i => i.DueDate) : dated.OrderBy(i => i.DueDate).Select(i => i.DueDate),
                dated.Select(i => i.DueDate));

            int firstUndated = items.ToList().FindIndex(i => i.DueDate == null);
            if (firstUndated >= 0)
            {
                Assert.All(items.Skip(firstUndated), i => Assert.Null(i.DueDate));
            }
        }

        private static void AssertNullsFirst(IEnumerable<string> values)
        {
            List<string> list = values.ToList();
            int firstValue = list.FindIndex(v => v != null);
            Assert.True(firstValue > 0);
            Assert.All(list.Skip(firstValue), v => Assert.NotNull(v));
        }
    }
}
