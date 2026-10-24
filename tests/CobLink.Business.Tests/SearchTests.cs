using System;
using System.Linq;
using CobLink.Models;
using CobLink.TestSupport;
using Xunit;

namespace CobLink.Business.Tests
{
    public class ActivitySearchTests
    {
        private readonly TestWorld _world = new TestWorld();

        private void SeedMix()
        {
            DateTime today = _world.Clock.Today;
            _world.SeedActivity(a => { a.Subject = "Call Ava about Northwind"; a.DueDate = today.AddDays(3); });
            _world.SeedActivity(a =>
            {
                a.Subject = "Letter to Riverside";
                a.ActivityType = ActivityType.Letter;
                a.Priority = ActivityPriority.High;
                a.AssignedToUserId = TestUsers.Alex;
                a.MemberId = TestReference.MemberNoah;
                a.DueDate = today.AddDays(-2);
            });
            _world.SeedActivity(a =>
            {
                a.Subject = "Review claim documents";
                a.ActivityType = ActivityType.DocumentReview;
                a.Status = ActivityStatus.Completed;
                a.DueDate = today.AddDays(-5);
            });
            _world.SeedActivity(a => { a.Subject = "Undated research"; a.DueDate = null; a.Status = ActivityStatus.InProgress; });
        }

        [Fact]
        public void The_default_order_is_due_date_ascending_with_undated_activities_last()
        {
            SeedMix();

            PagedResult<ActivityListItem> page = _world.ActivityService.Search(null);

            Assert.Equal(4, page.TotalCount);
            Assert.Equal(
                new[] { "Review claim documents", "Letter to Riverside", "Call Ava about Northwind", "Undated research" },
                page.Items.Select(i => i.Subject).ToArray());
        }

        [Fact]
        public void A_descending_due_date_sort_still_puts_undated_activities_last()
        {
            SeedMix();

            PagedResult<ActivityListItem> page = _world.ActivityService.Search(
                new ActivitySearchRequest { SortBy = "dueDate", SortDescending = true });

            Assert.Equal("Call Ava about Northwind", page.Items.First().Subject);
            Assert.Equal("Undated research", page.Items.Last().Subject);
        }

        [Fact]
        public void Filters_combine()
        {
            SeedMix();

            Assert.Equal(3, Count(new ActivitySearchRequest { OpenOnly = true }));
            Assert.Equal(1, Count(new ActivitySearchRequest { Status = ActivityStatus.Completed }));
            Assert.Equal(1, Count(new ActivitySearchRequest { ActivityType = ActivityType.Letter }));
            Assert.Equal(1, Count(new ActivitySearchRequest { Priority = ActivityPriority.High }));
            Assert.Equal(1, Count(new ActivitySearchRequest { AssignedToUserId = TestUsers.Alex }));
            Assert.Equal(1, Count(new ActivitySearchRequest { MemberId = TestReference.MemberNoah }));
            Assert.Equal(1, Count(new ActivitySearchRequest { OverdueOnly = true }));
            Assert.Equal(0, Count(new ActivitySearchRequest { OverdueOnly = true, AssignedToUserId = TestUsers.Jamie }));
        }

        [Fact]
        public void The_due_date_range_is_inclusive_and_ignores_undated_activities()
        {
            SeedMix();
            DateTime today = _world.Clock.Today;

            Assert.Equal(2, Count(new ActivitySearchRequest { DueFrom = today.AddDays(-2), DueTo = today.AddDays(3) }));
            Assert.Equal(1, Count(new ActivitySearchRequest { DueFrom = today }));
            Assert.Equal(2, Count(new ActivitySearchRequest { DueTo = today.AddDays(-2) }));
        }

        [Fact]
        public void Search_text_matches_number_subject_description_member_and_takeback()
        {
            SeedMix();
            Takeback takeback = _world.SeedTakeback();
            _world.SeedActivity(a =>
            {
                a.Subject = "Follow up";
                a.Description = "Waiting for a reply from Zebra Insurance";
                a.TakebackId = takeback.TakebackId;
            });

            Assert.Equal(1, Count(new ActivitySearchRequest { SearchText = "ACT-000002" }));
            Assert.Equal(1, Count(new ActivitySearchRequest { SearchText = "riverside" }));
            Assert.Equal(1, Count(new ActivitySearchRequest { SearchText = "zebra" }));
            Assert.Equal(1, Count(new ActivitySearchRequest { SearchText = "Brown" }));
            Assert.Equal(1, Count(new ActivitySearchRequest { SearchText = takeback.TakebackNumber }));
            Assert.Equal(5, Count(new ActivitySearchRequest { SearchText = "   " }));
        }

        [Fact]
        public void Paging_returns_the_requested_slice_and_the_total()
        {
            SeedMix();

            PagedResult<ActivityListItem> second = _world.ActivityService.Search(
                new ActivitySearchRequest { PageNumber = 2, PageSize = 3, SortBy = "activityNumber" });

            Assert.Equal(4, second.TotalCount);
            Assert.Equal(2, second.TotalPages);
            Assert.Equal(2, second.PageNumber);
            Assert.Equal(new[] { "ACT-000004" }, second.Items.Select(i => i.ActivityNumber).ToArray());
        }

        [Fact]
        public void The_sort_key_is_case_insensitive_and_unknown_keys_are_rejected()
        {
            SeedMix();

            PagedResult<ActivityListItem> page = _world.ActivityService.Search(new ActivitySearchRequest { SortBy = "SUBJECT" });
            Assert.Equal("Call Ava about Northwind", page.Items.First().Subject);

            var exception = Assert.Throws<ValidationFailedException>(
                () => _world.ActivityService.Search(new ActivitySearchRequest { SortBy = "createdBy; DROP TABLE Activity" }));
            Assert.Contains(exception.Errors, e => e.Field == "sortBy");
        }

        [Theory]
        [InlineData("activityNumber")]
        [InlineData("subject")]
        [InlineData("activityType")]
        [InlineData("status")]
        [InlineData("priority")]
        [InlineData("memberName")]
        [InlineData("assignedToName")]
        [InlineData("createdDate")]
        [InlineData("dueDate")]
        public void Every_documented_sort_key_works_in_both_directions(string sortBy)
        {
            SeedMix();

            Assert.Equal(4, _world.ActivityService.Search(new ActivitySearchRequest { SortBy = sortBy }).Items.Count);
            Assert.Equal(
                4,
                _world.ActivityService.Search(new ActivitySearchRequest { SortBy = sortBy, SortDescending = true }).Items.Count);
        }

        [Theory]
        [InlineData(0, 20, "pageNumber")]
        [InlineData(-1, 20, "pageNumber")]
        [InlineData(1, 0, "pageSize")]
        [InlineData(1, 101, "pageSize")]
        public void Paging_arguments_are_validated(int pageNumber, int pageSize, string field)
        {
            var exception = Assert.Throws<ValidationFailedException>(() => _world.ActivityService.Search(
                new ActivitySearchRequest { PageNumber = pageNumber, PageSize = pageSize }));

            Assert.Contains(exception.Errors, e => e.Field == field);
        }

        [Fact]
        public void Enum_filters_and_the_date_range_are_validated()
        {
            var exception = Assert.Throws<ValidationFailedException>(() => _world.ActivityService.Search(new ActivitySearchRequest
            {
                Status = (ActivityStatus)99,
                ActivityType = (ActivityType)99,
                Priority = (ActivityPriority)99,
                DueFrom = _world.Clock.Today.AddDays(2),
                DueTo = _world.Clock.Today
            }));

            Assert.Equal(
                new[] { "activityType", "dueTo", "priority", "status" },
                exception.Errors.Select(e => e.Field).OrderBy(f => f).ToArray());
        }

        private int Count(ActivitySearchRequest request)
        {
            return _world.ActivityService.Search(request).TotalCount;
        }
    }

    public class TakebackSearchTests
    {
        private readonly TestWorld _world = new TestWorld();

        private void SeedMix()
        {
            DateTime today = _world.Clock.Today;
            _world.SeedTakeback(TakebackStatus.Draft, t => { t.ClaimNumber = "AAA-1"; t.TakebackAmount = 100m; });
            _world.SeedTakeback(TakebackStatus.PendingApproval, t =>
            {
                t.ClaimNumber = "BBB-2";
                t.TakebackAmount = 5000m;
                t.OriginalPaidAmount = 6000m;
                t.MemberId = TestReference.MemberNoah;
                t.ProviderId = TestReference.ProviderLakeview;
                t.Reason = TakebackReason.MedicarePrimary;
            });
            _world.SeedTakeback(TakebackStatus.NoticeSent, t => { t.ClaimNumber = "CCC-3"; t.DueDate = today.AddDays(-1); });
            _world.SeedTakeback(TakebackStatus.PartiallyRecovered, t => { t.ClaimNumber = "DDD-4"; t.CreatedByUserId = TestUsers.Alex; });
        }

        [Fact]
        public void The_default_order_is_newest_first()
        {
            SeedMix();

            PagedResult<TakebackListItem> page = _world.TakebackService.Search(null);

            Assert.Equal(4, page.TotalCount);
            Assert.Equal(
                new[] { "TB-000004", "TB-000003", "TB-000002", "TB-000001" },
                page.Items.Select(i => i.TakebackNumber).ToArray());
        }

        [Fact]
        public void Filters_combine()
        {
            SeedMix();

            Assert.Equal(1, Count(new TakebackSearchRequest { Status = TakebackStatus.PendingApproval }));
            Assert.Equal(1, Count(new TakebackSearchRequest { Reason = TakebackReason.MedicarePrimary }));
            Assert.Equal(1, Count(new TakebackSearchRequest { MemberId = TestReference.MemberNoah }));
            Assert.Equal(1, Count(new TakebackSearchRequest { ProviderId = TestReference.ProviderLakeview }));
            Assert.Equal(1, Count(new TakebackSearchRequest { CreatedByUserId = TestUsers.Alex }));
            Assert.Equal(1, Count(new TakebackSearchRequest { OverdueOnly = true }));
            Assert.Equal(3, Count(new TakebackSearchRequest { MinAmount = 1000m }));
            Assert.Equal(3, Count(new TakebackSearchRequest { MaxAmount = 1200m }));
            Assert.Equal(1, Count(new TakebackSearchRequest { MinAmount = 1000m, MaxAmount = 4000m, Status = TakebackStatus.NoticeSent }));
        }

        [Fact]
        public void Search_text_matches_number_claim_member_and_provider()
        {
            SeedMix();

            Assert.Equal(1, Count(new TakebackSearchRequest { SearchText = "TB-000003" }));
            Assert.Equal(1, Count(new TakebackSearchRequest { SearchText = "bbb" }));
            Assert.Equal(1, Count(new TakebackSearchRequest { SearchText = "Brown" }));
            Assert.Equal(1, Count(new TakebackSearchRequest { SearchText = "Lakeview" }));
            Assert.Equal(1, Count(new TakebackSearchRequest { SearchText = "P-5002" }));
            Assert.Equal(4, Count(new TakebackSearchRequest { SearchText = "  " }));
        }

        [Theory]
        [InlineData("createdDate")]
        [InlineData("takebackNumber")]
        [InlineData("claimNumber")]
        [InlineData("memberName")]
        [InlineData("providerName")]
        [InlineData("reason")]
        [InlineData("status")]
        [InlineData("takebackAmount")]
        [InlineData("recoveredAmount")]
        [InlineData("outstandingAmount")]
        [InlineData("dueDate")]
        public void Every_documented_sort_key_works_in_both_directions(string sortBy)
        {
            SeedMix();

            Assert.Equal(4, _world.TakebackService.Search(new TakebackSearchRequest { SortBy = sortBy }).Items.Count);
            Assert.Equal(
                4,
                _world.TakebackService.Search(new TakebackSearchRequest { SortBy = sortBy, SortDescending = true }).Items.Count);
        }

        [Fact]
        public void Sorting_by_amount_orders_by_the_takeback_amount()
        {
            SeedMix();

            PagedResult<TakebackListItem> page = _world.TakebackService.Search(
                new TakebackSearchRequest { SortBy = "takebackAmount", SortDescending = true });

            Assert.Equal(new[] { 5000m, 1200m, 1200m, 100m }, page.Items.Select(i => i.TakebackAmount).ToArray());
        }

        [Fact]
        public void Unknown_sort_keys_are_rejected()
        {
            var exception = Assert.Throws<ValidationFailedException>(
                () => _world.TakebackService.Search(new TakebackSearchRequest { SortBy = "notAColumn" }));

            Assert.Contains(exception.Errors, e => e.Field == "sortBy");
        }

        [Fact]
        public void Paging_amounts_enums_and_dates_are_validated()
        {
            var exception = Assert.Throws<ValidationFailedException>(() => _world.TakebackService.Search(new TakebackSearchRequest
            {
                PageNumber = 0,
                PageSize = 500,
                Status = (TakebackStatus)99,
                Reason = (TakebackReason)99,
                MinAmount = 10m,
                MaxAmount = 5m,
                DueFrom = _world.Clock.Today.AddDays(1),
                DueTo = _world.Clock.Today
            }));

            Assert.Equal(
                new[] { "dueTo", "maxAmount", "pageNumber", "pageSize", "reason", "status" },
                exception.Errors.Select(e => e.Field).OrderBy(f => f).ToArray());
        }

        private int Count(TakebackSearchRequest request)
        {
            return _world.TakebackService.Search(request).TotalCount;
        }
    }
}
