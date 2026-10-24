using System;
using System.Collections.Generic;
using System.Linq;
using CobLink.Business.Services;
using CobLink.Data.Repositories;
using CobLink.Models;
using CobLink.TestSupport;
using Xunit;

namespace CobLink.Business.Tests
{
    public class LookupServiceTests
    {
        private readonly TestWorld _world = new TestWorld();

        private class RecordingLookupRepository : ILookupRepository
        {
            public string LastTerm { get; private set; }
            public int LastMax { get; private set; }
            public int Calls { get; private set; }

            public LookupData GetLookups()
            {
                return new LookupData();
            }

            public IList<Member> SearchMembers(string term, int maxResults)
            {
                Calls++;
                LastTerm = term;
                LastMax = maxResults;
                return new List<Member>();
            }

            public Member GetMember(int memberId)
            {
                return null;
            }

            public IList<Provider> SearchProviders(string term, int maxResults)
            {
                Calls++;
                LastTerm = term;
                LastMax = maxResults;
                return new List<Provider>();
            }

            public Provider GetProvider(int providerId)
            {
                return null;
            }
        }

        [Fact]
        public void GetAll_returns_every_lookup_with_ids_equal_to_the_enum_values()
        {
            LookupData data = _world.LookupService.GetAll();

            AssertMatches<UserRole>(data.UserRoles);
            AssertMatches<ActivityType>(data.ActivityTypes);
            AssertMatches<ActivityStatus>(data.ActivityStatuses);
            AssertMatches<ActivityPriority>(data.ActivityPriorities);
            AssertMatches<TakebackReason>(data.TakebackReasons);
            AssertMatches<TakebackStatus>(data.TakebackStatuses);
            AssertMatches<RecoveryMethod>(data.RecoveryMethods);
        }

        private static void AssertMatches<TEnum>(List<LookupItem> items) where TEnum : struct
        {
            Assert.Equal(
                Enum.GetValues(typeof(TEnum)).Cast<TEnum>().Select(v => Convert.ToInt32(v)).OrderBy(v => v).ToArray(),
                items.Select(i => i.Id).OrderBy(v => v).ToArray());
            Assert.All(items, i => Assert.Equal(Enum.GetName(typeof(TEnum), i.Id), i.Code));
        }

        [Fact]
        public void Member_search_matches_number_and_names_and_orders_by_last_name()
        {
            Assert.Equal(new[] { "M-100001" }, _world.LookupService.SearchMembers("M-100001", null).Select(m => m.MemberNumber).ToArray());
            Assert.Equal(new[] { "Brown" }, _world.LookupService.SearchMembers("brown", null).Select(m => m.LastName).ToArray());
            Assert.Equal(
                new[] { "Brown", "Garcia", "Johnson" },
                _world.LookupService.SearchMembers("M-10", null).Select(m => m.LastName).ToArray());
        }

        [Fact]
        public void Provider_search_matches_number_name_and_npi()
        {
            Assert.Equal(new[] { 2 }, _world.LookupService.SearchProviders("lakeview", null).Select(p => p.ProviderId).ToArray());
            Assert.Equal(new[] { 1 }, _world.LookupService.SearchProviders("P-5001", null).Select(p => p.ProviderId).ToArray());
            Assert.Equal(new[] { 1 }, _world.LookupService.SearchProviders("1234567890", null).Select(p => p.ProviderId).ToArray());
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData(" ")]
        [InlineData("a")]
        [InlineData(" a ")]
        public void Searches_with_fewer_than_two_characters_return_nothing_without_touching_the_database(string term)
        {
            var repository = new RecordingLookupRepository();
            var service = new LookupService(repository, _world.CurrentUser);

            Assert.Empty(service.SearchMembers(term, null));
            Assert.Empty(service.SearchProviders(term, null));
            Assert.Equal(0, repository.Calls);
        }

        [Theory]
        [InlineData(null, 15)]
        [InlineData(0, 15)]
        [InlineData(-3, 15)]
        [InlineData(1, 1)]
        [InlineData(50, 50)]
        [InlineData(500, 50)]
        public void The_maximum_number_of_results_is_defaulted_and_capped(int? requested, int expected)
        {
            var repository = new RecordingLookupRepository();
            var service = new LookupService(repository, _world.CurrentUser);

            service.SearchMembers("  smith ", requested);

            Assert.Equal("smith", repository.LastTerm);
            Assert.Equal(expected, repository.LastMax);
        }

        [Fact]
        public void Every_lookup_needs_a_registered_user()
        {
            _world.SignOut();

            Assert.Throws<ForbiddenException>(() => _world.LookupService.GetAll());
            Assert.Throws<ForbiddenException>(() => _world.LookupService.SearchMembers("ab", null));
            Assert.Throws<ForbiddenException>(() => _world.LookupService.SearchProviders("ab", null));
        }
    }

    public class UserServiceTests
    {
        private readonly TestWorld _world = new TestWorld();

        [Fact]
        public void Only_active_users_are_listed_ordered_by_display_name()
        {
            IList<AppUser> users = _world.UserService.GetActiveUsers();

            Assert.Equal(
                new[] { "Alex Smith", "Blake Wilson", "Casey Admin", "Jamie Doe", "Morgan Lee" },
                users.Select(u => u.DisplayName).ToArray());
        }

        [Fact]
        public void Listing_users_needs_a_registered_user()
        {
            _world.SignOut();

            Assert.Throws<ForbiddenException>(() => _world.UserService.GetActiveUsers());
        }
    }

    public class DashboardServiceTests
    {
        private readonly TestWorld _world = new TestWorld();

        [Fact]
        public void An_empty_system_has_an_empty_dashboard()
        {
            DashboardSummary summary = _world.DashboardService.GetSummary();

            Assert.Equal(0, summary.OpenActivities);
            Assert.Equal(0, summary.ActiveTakebacks);
            Assert.Equal(0m, summary.TotalOutstandingAmount);
            Assert.Empty(summary.MyUpcomingActivities);
            Assert.Empty(summary.RecentTakebacks);
            Assert.Empty(summary.ActivitiesByStatus);
            Assert.Empty(summary.TakebacksByStatus);
        }

        [Fact]
        public void Activity_figures_follow_the_definitions_in_the_api_reference()
        {
            DateTime today = _world.Clock.Today;
            _world.SeedActivity(a => a.DueDate = today.AddDays(2));                                          // mine, due this week
            _world.SeedActivity(a => a.DueDate = today.AddDays(-1));                                         // mine, overdue
            _world.SeedActivity(a => { a.DueDate = null; a.Status = ActivityStatus.InProgress; });          // mine, undated
            _world.SeedActivity(a => { a.AssignedToUserId = TestUsers.Alex; a.DueDate = today.AddDays(7); });   // theirs, day 7
            _world.SeedActivity(a => { a.AssignedToUserId = TestUsers.Alex; a.DueDate = today.AddDays(8); });   // theirs, day 8
            _world.SeedActivity(a => { a.AssignedToUserId = TestUsers.Alex; a.DueDate = today.AddDays(-4); });  // theirs, overdue
            _world.SeedActivity(a => { a.Status = ActivityStatus.Completed; a.DueDate = today.AddDays(-9); });  // closed
            _world.SeedActivity(a => { a.Status = ActivityStatus.Cancelled; a.DueDate = today.AddDays(1); });   // closed

            DashboardSummary summary = _world.DashboardService.GetSummary();

            Assert.Equal(3, summary.MyOpenActivities);
            Assert.Equal(1, summary.MyOverdueActivities);
            Assert.Equal(6, summary.OpenActivities);
            Assert.Equal(2, summary.OverdueActivities);
            Assert.Equal(2, summary.ActivitiesDueThisWeek);

            Assert.Equal(
                new[] { Tuple.Create((int)ActivityStatus.Open, 5), Tuple.Create((int)ActivityStatus.InProgress, 1), Tuple.Create((int)ActivityStatus.Completed, 1), Tuple.Create((int)ActivityStatus.Cancelled, 1) }
                    .OrderBy(t => t.Item1).ToArray(),
                summary.ActivitiesByStatus.Select(s => Tuple.Create(s.StatusId, s.Count)).ToArray());

            Assert.Equal(
                new[] { today.AddDays(-1), today.AddDays(2) },
                summary.MyUpcomingActivities.Where(a => a.DueDate.HasValue).Select(a => a.DueDate.Value).ToArray());
            Assert.Null(summary.MyUpcomingActivities.Last().DueDate);
            Assert.All(summary.MyUpcomingActivities, a => Assert.Equal(TestUsers.Jamie, a.AssignedToUserId));
        }

        [Fact]
        public void The_my_figures_follow_the_signed_in_user()
        {
            _world.SeedActivity(a => a.AssignedToUserId = TestUsers.Alex);
            _world.SeedActivity(a => a.AssignedToUserId = TestUsers.Alex);
            _world.SeedActivity();
            _world.SignIn(TestUsers.Alex);

            DashboardSummary summary = _world.DashboardService.GetSummary();

            Assert.Equal(2, summary.MyOpenActivities);
            Assert.Equal(3, summary.OpenActivities);
        }

        [Fact]
        public void My_upcoming_activities_are_limited_to_five()
        {
            for (int i = 0; i < 7; i++)
            {
                int offset = i;
                _world.SeedActivity(a => a.DueDate = _world.Clock.Today.AddDays(offset));
            }

            DashboardSummary summary = _world.DashboardService.GetSummary();

            Assert.Equal(5, summary.MyUpcomingActivities.Count);
            Assert.Equal(7, summary.MyOpenActivities);
        }

        [Fact]
        public void Takeback_figures_follow_the_definitions_in_the_api_reference()
        {
            DateTime today = _world.Clock.Today;
            _world.SeedTakeback(TakebackStatus.Draft);
            _world.SeedTakeback(TakebackStatus.PendingApproval);
            _world.SeedTakeback(TakebackStatus.PendingApproval);
            _world.SeedTakeback(TakebackStatus.Approved);
            _world.SeedTakeback(TakebackStatus.NoticeSent, t => t.DueDate = today.AddDays(-2));
            _world.SeedTakeback(TakebackStatus.PartiallyRecovered);
            _world.SeedTakeback(TakebackStatus.Recovered);
            _world.SeedTakeback(TakebackStatus.Disputed, t => t.DueDate = today.AddDays(-2));
            _world.SeedTakeback(TakebackStatus.WrittenOff);
            _world.SeedTakeback(TakebackStatus.Cancelled);

            DashboardSummary summary = _world.DashboardService.GetSummary();

            Assert.Equal(2, summary.TakebacksPendingApproval);
            Assert.Equal(3, summary.ActiveTakebacks);
            Assert.Equal(1, summary.OverdueTakebacks);

            // Approved, NoticeSent, PartiallyRecovered, Recovered and Disputed: 5 x 1200 taken back, 400 + 1200 recovered.
            Assert.Equal(6000m, summary.TotalTakebackAmount);
            Assert.Equal(1600m, summary.TotalRecoveredAmount);
            Assert.Equal(4400m, summary.TotalOutstandingAmount);

            Assert.Equal(9, summary.TakebacksByStatus.Count);
            StatusCount pending = summary.TakebacksByStatus.Single(s => s.StatusId == (int)TakebackStatus.PendingApproval);
            Assert.Equal(2, pending.Count);
            Assert.Equal(2400m, pending.Amount);
        }

        [Fact]
        public void Recent_takebacks_are_the_five_most_recently_created()
        {
            for (int i = 0; i < 7; i++)
            {
                _world.SeedTakeback();
            }

            DashboardSummary summary = _world.DashboardService.GetSummary();

            Assert.Equal(
                new[] { "TB-000007", "TB-000006", "TB-000005", "TB-000004", "TB-000003" },
                summary.RecentTakebacks.Select(t => t.TakebackNumber).ToArray());
        }

        [Fact]
        public void The_dashboard_needs_a_registered_user()
        {
            _world.SignOut();

            Assert.Throws<ForbiddenException>(() => _world.DashboardService.GetSummary());
        }
    }
}
