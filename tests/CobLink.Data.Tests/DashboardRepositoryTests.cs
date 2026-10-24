using System;
using System.Collections.Generic;
using System.Linq;
using CobLink.Data.Repositories;
using CobLink.Data.Tests.Infrastructure;
using CobLink.Models;
using Xunit;

namespace CobLink.Data.Tests
{
    /// <summary>
    /// Read-only tests of IDashboardRepository. The figures are checked twice: against the numbers of the demo data
    /// and against what the search repositories return for the same question, so the dashboard and the lists cannot
    /// drift apart.
    /// </summary>
    [Collection(SeededDatabaseCollection.Name)]
    public class DashboardRepositoryTests
    {
        private static readonly int[] AllUsers =
        {
            SampleUsers.Jamie, SampleUsers.Alex, SampleUsers.Blake, SampleUsers.Morgan, SampleUsers.Casey, SampleUsers.Robin
        };

        private readonly SeededDatabaseFixture _db;
        private readonly IDashboardRepository _dashboard;

        public DashboardRepositoryTests(SeededDatabaseFixture db)
        {
            _db = db;
            _dashboard = db.Dashboard;
        }

        [SqlFact]
        public void Summary_of_an_analyst_counts_her_own_work_and_the_work_of_the_whole_team()
        {
            DashboardSummary summary = _dashboard.GetSummary(SampleUsers.Jamie);

            Assert.Equal(7, summary.MyOpenActivities);
            Assert.Equal(3, summary.MyOverdueActivities);
            Assert.Equal(21, summary.OpenActivities);
            Assert.Equal(3, summary.OverdueActivities);
            Assert.Equal(13, summary.ActivitiesDueThisWeek);
            Assert.Equal(3, summary.TakebacksPendingApproval);
            Assert.Equal(7, summary.ActiveTakebacks);
            Assert.Equal(2, summary.OverdueTakebacks);
            Assert.Equal(66555.25m, summary.TotalTakebackAmount);
            Assert.Equal(14800.00m, summary.TotalRecoveredAmount);
            Assert.Equal(51755.25m, summary.TotalOutstandingAmount);
        }

        [SqlFact]
        public void Only_the_personal_figures_depend_on_the_user()
        {
            DashboardSummary jamie = _dashboard.GetSummary(SampleUsers.Jamie);
            DashboardSummary alex = _dashboard.GetSummary(SampleUsers.Alex);

            Assert.Equal(9, alex.MyOpenActivities);
            Assert.Equal(0, alex.MyOverdueActivities);
            Assert.NotEqual(jamie.MyOpenActivities, alex.MyOpenActivities);

            Assert.Equal(jamie.OpenActivities, alex.OpenActivities);
            Assert.Equal(jamie.OverdueActivities, alex.OverdueActivities);
            Assert.Equal(jamie.ActivitiesDueThisWeek, alex.ActivitiesDueThisWeek);
            Assert.Equal(jamie.TakebacksPendingApproval, alex.TakebacksPendingApproval);
            Assert.Equal(jamie.ActiveTakebacks, alex.ActiveTakebacks);
            Assert.Equal(jamie.OverdueTakebacks, alex.OverdueTakebacks);
            Assert.Equal(jamie.TotalTakebackAmount, alex.TotalTakebackAmount);
            Assert.Equal(jamie.TotalRecoveredAmount, alex.TotalRecoveredAmount);
        }

        [SqlFact]
        public void Every_figure_agrees_with_the_search_repositories()
        {
            DateTime today = _db.Database.ServerToday();
            List<TakebackListItem> takebacks = _db.Takebacks.Search(new TakebackSearchRequest { PageSize = 100 }).Items;
            TakebackStatus[] counted =
            {
                TakebackStatus.Approved, TakebackStatus.NoticeSent, TakebackStatus.PartiallyRecovered,
                TakebackStatus.Recovered, TakebackStatus.Disputed
            };

            foreach (int userId in AllUsers)
            {
                DashboardSummary summary = _dashboard.GetSummary(userId);

                Assert.Equal(CountActivities(r =>
                {
                    r.AssignedToUserId = userId;
                    r.OpenOnly = true;
                }), summary.MyOpenActivities);
                Assert.Equal(CountActivities(r =>
                {
                    r.AssignedToUserId = userId;
                    r.OverdueOnly = true;
                }), summary.MyOverdueActivities);
                Assert.Equal(CountActivities(r => r.OpenOnly = true), summary.OpenActivities);
                Assert.Equal(CountActivities(r => r.OverdueOnly = true), summary.OverdueActivities);

                // "This week" is the next seven days, today included, not a calendar week.
                Assert.Equal(CountActivities(r =>
                {
                    r.OpenOnly = true;
                    r.DueFrom = today;
                    r.DueTo = today.AddDays(7);
                }), summary.ActivitiesDueThisWeek);

                Assert.Equal(takebacks.Count(t => t.Status == TakebackStatus.PendingApproval), summary.TakebacksPendingApproval);
                Assert.Equal(
                    takebacks.Count(t => t.Status == TakebackStatus.NoticeSent || t.Status == TakebackStatus.PartiallyRecovered || t.Status == TakebackStatus.Disputed),
                    summary.ActiveTakebacks);
                Assert.Equal(takebacks.Count(t => t.IsOverdue), summary.OverdueTakebacks);
                Assert.Equal(takebacks.Where(t => counted.Contains(t.Status)).Sum(t => t.TakebackAmount), summary.TotalTakebackAmount);
                Assert.Equal(takebacks.Where(t => counted.Contains(t.Status)).Sum(t => t.RecoveredAmount), summary.TotalRecoveredAmount);
            }
        }

        [SqlFact]
        public void Activities_by_status_has_one_entry_per_status_in_status_order()
        {
            DashboardSummary summary = _dashboard.GetSummary(SampleUsers.Jamie);

            Assert.Equal(
                new[] { (int)ActivityStatus.Open, (int)ActivityStatus.InProgress, (int)ActivityStatus.Completed, (int)ActivityStatus.Cancelled },
                summary.ActivitiesByStatus.Select(s => s.StatusId).ToArray());
            Assert.Equal(new[] { 16, 5, 5, 1 }, summary.ActivitiesByStatus.Select(s => s.Count).ToArray());
            Assert.All(summary.ActivitiesByStatus, s => Assert.Equal(0m, s.Amount));
            Assert.Equal(27, summary.ActivitiesByStatus.Sum(s => s.Count));
        }

        [SqlFact]
        public void Takebacks_by_status_has_the_count_and_the_amount_of_every_status()
        {
            DashboardSummary summary = _dashboard.GetSummary(SampleUsers.Jamie);

            Assert.Equal(Enumerable.Range(1, 10).ToArray(), summary.TakebacksByStatus.Select(s => s.StatusId).ToArray());
            Assert.Equal(new[] { 2, 3, 1, 1, 3, 3, 2, 1, 1, 1 }, summary.TakebacksByStatus.Select(s => s.Count).ToArray());
            Assert.Equal(
                new[] { 3940.00m, 33130.00m, 2975.25m, 215.50m, 17360.00m, 31620.00m, 1800.00m, 12800.00m, 860.00m, 150.00m },
                summary.TakebacksByStatus.Select(s => s.Amount).ToArray());

            List<TakebackListItem> takebacks = _db.Takebacks.Search(new TakebackSearchRequest { PageSize = 100 }).Items;
            foreach (StatusCount entry in summary.TakebacksByStatus)
            {
                int statusId = entry.StatusId;
                Assert.Equal(takebacks.Count(t => (int)t.Status == statusId), entry.Count);
                Assert.Equal(takebacks.Where(t => (int)t.Status == statusId).Sum(t => t.TakebackAmount), entry.Amount);
            }
        }

        [SqlFact]
        public void Upcoming_activities_are_the_five_soonest_open_activities_of_the_user()
        {
            foreach (int userId in AllUsers.Concat(new[] { 999999 }))
            {
                int id = userId;
                List<int> expected = _db.Activities.Search(new ActivitySearchRequest
                {
                    AssignedToUserId = id,
                    OpenOnly = true,
                    PageSize = 5
                }).Items.Select(i => i.ActivityId).ToList();

                List<ActivityListItem> upcoming = _dashboard.GetSummary(id).MyUpcomingActivities;

                Assert.Equal(expected, upcoming.Select(i => i.ActivityId).ToList());
                Assert.True(upcoming.Count <= 5);
                Assert.All(upcoming, i =>
                {
                    Assert.Equal(id, i.AssignedToUserId);
                    Assert.True(i.Status == ActivityStatus.Open || i.Status == ActivityStatus.InProgress);
                });
            }
        }

        [SqlFact]
        public void Upcoming_activities_of_a_busy_user_are_limited_to_five_and_ordered_by_due_date()
        {
            List<ActivityListItem> upcoming = _dashboard.GetSummary(SampleUsers.Jamie).MyUpcomingActivities;

            Assert.Equal(5, upcoming.Count);
            Assert.Equal(upcoming.OrderBy(i => i.DueDate ?? DateTime.MaxValue).Select(i => i.ActivityId), upcoming.Select(i => i.ActivityId));
            Assert.Equal(2, _dashboard.GetSummary(SampleUsers.Morgan).MyUpcomingActivities.Count);
        }

        [SqlFact]
        public void Recent_takebacks_are_the_five_newest_ones()
        {
            List<TakebackListItem> recent = _dashboard.GetSummary(SampleUsers.Jamie).RecentTakebacks;
            List<TakebackListItem> newest = _db.Takebacks.Search(new TakebackSearchRequest { PageSize = 5 }).Items;

            Assert.Equal(new[] { "TB-000015", "TB-000009", "TB-000010", "TB-000007", "TB-000008" }, recent.Select(t => t.TakebackNumber).ToArray());
            Assert.Equal(newest.Select(t => t.TakebackId), recent.Select(t => t.TakebackId));
            Assert.Equal(DateTimeKind.Utc, recent[0].CreatedDate.Kind);
        }

        [SqlFact]
        public void Summary_of_a_user_without_activities_has_zero_personal_figures_and_the_shared_figures()
        {
            foreach (int userId in new[] { SampleUsers.Robin, 999999 })
            {
                DashboardSummary summary = _dashboard.GetSummary(userId);

                Assert.Equal(0, summary.MyOpenActivities);
                Assert.Equal(0, summary.MyOverdueActivities);
                Assert.Empty(summary.MyUpcomingActivities);
                Assert.Equal(21, summary.OpenActivities);
                Assert.Equal(18, summary.TakebacksByStatus.Sum(s => s.Count));
                Assert.Equal(5, summary.RecentTakebacks.Count);
            }
        }

        private int CountActivities(Action<ActivitySearchRequest> configure)
        {
            ActivitySearchRequest request = new ActivitySearchRequest { PageSize = 1 };
            configure(request);
            return _db.Activities.Search(request).TotalCount;
        }
    }
}
