using System;
using System.Collections.Generic;
using System.Linq;
using CobLink.Data.Repositories;
using CobLink.Data.Tests.Infrastructure;
using CobLink.Models;
using Xunit;

namespace CobLink.Data.Tests
{
    /// <summary>Read-only tests of ITakebackRepository against the demo data (18 takebacks).</summary>
    [Collection(SeededDatabaseCollection.Name)]
    public class TakebackRepositoryReadTests
    {
        private readonly SeededDatabaseFixture _db;
        private readonly ITakebackRepository _takebacks;

        public TakebackRepositoryReadTests(SeededDatabaseFixture db)
        {
            _db = db;
            _takebacks = db.Takebacks;
        }

        // ---- search: paging and default order ---------------------------------------------------------------------

        [SqlFact]
        public void Search_without_criteria_returns_every_takeback_newest_first()
        {
            PagedResult<TakebackListItem> result = Search();

            Assert.Equal(18, result.TotalCount);
            Assert.Equal(18, result.Items.Count);
            Assert.Equal(result.Items.Count, result.Items.Select(i => i.TakebackId).Distinct().Count());
            Assert.Equal(1, result.PageNumber);
            Assert.Equal(100, result.PageSize);
            Assert.Equal(1, result.TotalPages);

            Assert.Equal(
                result.Items.OrderByDescending(i => i.CreatedDate).ThenByDescending(i => i.TakebackId).Select(i => i.TakebackId),
                result.Items.Select(i => i.TakebackId));
            Assert.Equal("TB-000015", result.Items.First().TakebackNumber);
            Assert.Equal("TB-000016", result.Items.Last().TakebackNumber);
        }

        [SqlFact]
        public void Search_pages_through_the_result_without_gaps_or_repeats()
        {
            List<int> everything = Search().Items.Select(i => i.TakebackId).ToList();
            List<int> paged = new List<int>();

            for (int page = 1; page <= 4; page++)
            {
                PagedResult<TakebackListItem> result = _takebacks.Search(new TakebackSearchRequest { PageNumber = page, PageSize = 5 });

                Assert.Equal(18, result.TotalCount);
                Assert.Equal(page, result.PageNumber);
                Assert.Equal(5, result.PageSize);
                Assert.Equal(4, result.TotalPages);
                Assert.Equal(page < 4 ? 5 : 3, result.Items.Count);
                paged.AddRange(result.Items.Select(i => i.TakebackId));
            }

            Assert.Equal(everything, paged);
        }

        [SqlFact]
        public void Search_uses_twenty_rows_per_page_by_default()
        {
            PagedResult<TakebackListItem> result = _takebacks.Search(new TakebackSearchRequest());

            Assert.Equal(PagedRequest.DefaultPageSize, result.PageSize);
            Assert.Equal(18, result.Items.Count);
        }

        [SqlFact]
        public void Search_clamps_the_paging_arguments()
        {
            PagedResult<TakebackListItem> smallest = _takebacks.Search(new TakebackSearchRequest { PageNumber = 0, PageSize = 0 });
            Assert.Equal(1, smallest.PageNumber);
            Assert.Equal(1, smallest.PageSize);
            Assert.Single(smallest.Items);
            Assert.Equal(18, smallest.TotalCount);

            PagedResult<TakebackListItem> largest = _takebacks.Search(new TakebackSearchRequest { PageSize = 5000 });
            Assert.Equal(100, largest.PageSize);
            Assert.Equal(18, largest.Items.Count);

            PagedResult<TakebackListItem> beyondTheEnd = _takebacks.Search(new TakebackSearchRequest { PageNumber = 50, PageSize = 10 });
            Assert.Empty(beyondTheEnd.Items);
            Assert.Equal(18, beyondTheEnd.TotalCount);
        }

        [SqlFact]
        public void Search_returns_the_columns_the_grid_shows()
        {
            TakebackListItem item = Search(r => r.SearchText = "TB-000014").Items.Single();

            Assert.Equal("CLM-105701", item.ClaimNumber);
            Assert.True(item.MemberId > 0);
            Assert.Equal("M000114", item.MemberNumber);
            Assert.Equal("Harris, Elijah", item.MemberName);
            Assert.True(item.ProviderId > 0);
            Assert.Equal("Pinecrest Cardiology Group", item.ProviderName);
            Assert.Equal(TakebackReason.ThirdPartyLiability, item.Reason);
            Assert.Equal(TakebackStatus.PartiallyRecovered, item.Status);
            Assert.Equal(18250.00m, item.TakebackAmount);
            Assert.Equal(10000.00m, item.RecoveredAmount);
            Assert.Equal(8250.00m, item.OutstandingAmount);
            Assert.Equal(item.NoticeDate.Value.AddDays(30), item.DueDate.Value);
            Assert.Equal(DateTimeKind.Unspecified, item.NoticeDate.Value.Kind);
            Assert.Equal(DateTimeKind.Unspecified, item.DueDate.Value.Kind);
            Assert.False(item.IsOverdue);
            Assert.Equal("Alex Smith", item.CreatedByName);
            Assert.Equal(DateTimeKind.Utc, item.CreatedDate.Kind);
        }

        // ---- search: filters --------------------------------------------------------------------------------------

        [SqlTheory]
        [InlineData(TakebackStatus.Draft, 2)]
        [InlineData(TakebackStatus.PendingApproval, 3)]
        [InlineData(TakebackStatus.Approved, 1)]
        [InlineData(TakebackStatus.Rejected, 1)]
        [InlineData(TakebackStatus.NoticeSent, 3)]
        [InlineData(TakebackStatus.PartiallyRecovered, 3)]
        [InlineData(TakebackStatus.Recovered, 2)]
        [InlineData(TakebackStatus.Disputed, 1)]
        [InlineData(TakebackStatus.WrittenOff, 1)]
        [InlineData(TakebackStatus.Cancelled, 1)]
        public void Search_filters_by_status(TakebackStatus status, int expectedCount)
        {
            PagedResult<TakebackListItem> result = Search(r => r.Status = status);

            Assert.Equal(expectedCount, result.TotalCount);
            Assert.All(result.Items, i => Assert.Equal(status, i.Status));
        }

        [SqlTheory]
        [InlineData(TakebackReason.OtherInsurancePrimary, 3)]
        [InlineData(TakebackReason.MedicarePrimary, 3)]
        [InlineData(TakebackReason.DuplicatePayment, 3)]
        [InlineData(TakebackReason.EligibilityTerminated, 2)]
        [InlineData(TakebackReason.ThirdPartyLiability, 2)]
        [InlineData(TakebackReason.WorkersCompensation, 2)]
        [InlineData(TakebackReason.ProviderBillingError, 2)]
        [InlineData(TakebackReason.Other, 1)]
        public void Search_filters_by_reason(TakebackReason reason, int expectedCount)
        {
            PagedResult<TakebackListItem> result = Search(r => r.Reason = reason);

            Assert.Equal(expectedCount, result.TotalCount);
            Assert.All(result.Items, i => Assert.Equal(reason, i.Reason));
        }

        [SqlFact]
        public void Search_with_OverdueOnly_returns_the_takebacks_that_are_past_due_while_collecting()
        {
            DateTime today = _db.Database.ServerToday();

            PagedResult<TakebackListItem> result = Search(r => r.OverdueOnly = true);

            Assert.Equal(new[] { "TB-000003", "TB-000013" }, Numbers(result));
            Assert.All(result.Items, i =>
            {
                Assert.True(i.IsOverdue);
                Assert.True(i.Status == TakebackStatus.NoticeSent || i.Status == TakebackStatus.PartiallyRecovered);
                Assert.True(i.DueDate.Value < today);
            });
        }

        [SqlFact]
        public void IsOverdue_means_notice_sent_or_partially_recovered_and_past_due_for_every_takeback()
        {
            DateTime today = _db.Database.ServerToday();

            foreach (TakebackListItem item in Search().Items)
            {
                bool collecting = item.Status == TakebackStatus.NoticeSent || item.Status == TakebackStatus.PartiallyRecovered;
                Assert.Equal(collecting && item.DueDate.HasValue && item.DueDate.Value < today, item.IsOverdue);
            }
        }

        [SqlFact]
        public void Search_filters_by_member()
        {
            int memberId = _db.Lookups.SearchMembers("M000101", 1).Single().MemberId;

            PagedResult<TakebackListItem> result = Search(r => r.MemberId = memberId);

            Assert.Equal(new[] { "TB-000001" }, Numbers(result));
            Assert.Equal(0, Search(r => r.MemberId = 999999).TotalCount);
        }

        [SqlFact]
        public void Search_filters_by_provider()
        {
            int riverbend = ProviderId("P10001");
            int northgate = ProviderId("P10008");

            Assert.Equal(new[] { "TB-000001", "TB-000011" }, Numbers(Search(r => r.ProviderId = riverbend)));
            Assert.Equal(new[] { "TB-000006" }, Numbers(Search(r => r.ProviderId = northgate)));
            Assert.Equal(0, Search(r => r.ProviderId = 999999).TotalCount);
        }

        [SqlFact]
        public void Search_filters_by_the_user_who_created_the_takeback()
        {
            PagedResult<TakebackListItem> jamie = Search(r => r.CreatedByUserId = SampleUsers.Jamie);
            PagedResult<TakebackListItem> alex = Search(r => r.CreatedByUserId = SampleUsers.Alex);

            Assert.Equal(9, jamie.TotalCount);
            Assert.All(jamie.Items, i => Assert.Equal("Jamie Doe", i.CreatedByName));
            Assert.Equal(9, alex.TotalCount);
            Assert.All(alex.Items, i => Assert.Equal("Alex Smith", i.CreatedByName));
            Assert.Equal(0, Search(r => r.CreatedByUserId = SampleUsers.Casey).TotalCount);
        }

        [SqlFact]
        public void Search_amount_range_uses_the_takeback_amount_and_includes_both_ends()
        {
            Assert.Equal(new[] { "TB-000004", "TB-000008", "TB-000014" }, Numbers(Search(r => r.MinAmount = 12800.00m)));
            Assert.Equal(new[] { "TB-000007", "TB-000011" }, Numbers(Search(r => r.MaxAmount = 215.50m)));
            Assert.Equal(
                new[] { "TB-000001", "TB-000010", "TB-000012", "TB-000002", "TB-000017", "TB-000018" }.OrderBy(n => n, StringComparer.Ordinal),
                Numbers(Search(r =>
                {
                    r.MinAmount = 1000.00m;
                    r.MaxAmount = 5000.00m;
                })));
            Assert.Equal(0, Search(r =>
            {
                r.MinAmount = 5000.00m;
                r.MaxAmount = 1000.00m;
            }).TotalCount);

            // TB-000008 was paid 48,000.00 but only 31,500.00 is being taken back: only the second figure counts.
            Assert.Equal(0, Search(r => r.MinAmount = 40000.00m).TotalCount);
        }

        [SqlFact]
        public void Search_due_date_range_is_inclusive_and_skips_takebacks_without_a_due_date()
        {
            DateTime today = _db.Database.ServerToday();
            List<TakebackListItem> all = Search().Items.ToList();

            PagedResult<TakebackListItem> fromToday = Search(r => r.DueFrom = today);
            PagedResult<TakebackListItem> untilToday = Search(r => r.DueTo = today);
            PagedResult<TakebackListItem> window = Search(r =>
            {
                r.DueFrom = today.AddDays(4);
                r.DueTo = today.AddDays(13);
            });

            Assert.NotEmpty(fromToday.Items);
            Assert.Equal(all.Where(i => i.DueDate >= today).Select(i => i.TakebackId).OrderBy(i => i), fromToday.Items.Select(i => i.TakebackId).OrderBy(i => i));
            Assert.NotEmpty(untilToday.Items);
            Assert.Equal(all.Where(i => i.DueDate <= today).Select(i => i.TakebackId).OrderBy(i => i), untilToday.Items.Select(i => i.TakebackId).OrderBy(i => i));
            Assert.All(fromToday.Items.Concat(untilToday.Items), i => Assert.True(i.DueDate.HasValue));

            // TB-000005 is due in 4 days, TB-000014 in 8 and TB-000002 in 13: both ends of the window count.
            Assert.Equal(new[] { "TB-000002", "TB-000005", "TB-000014" }, Numbers(window));
        }

        [SqlFact]
        public void Search_combines_the_filters_with_AND()
        {
            Assert.Equal(new[] { "TB-000013" }, Numbers(Search(r =>
            {
                r.Status = TakebackStatus.NoticeSent;
                r.ProviderId = ProviderId("P10003");
            })));

            Assert.Equal(2, Search(r =>
            {
                r.OverdueOnly = true;
                r.CreatedByUserId = SampleUsers.Jamie;
            }).TotalCount);
            Assert.Equal(0, Search(r =>
            {
                r.OverdueOnly = true;
                r.CreatedByUserId = SampleUsers.Alex;
            }).TotalCount);

            Assert.Equal(new[] { "TB-000003" }, Numbers(Search(r =>
            {
                r.SearchText = "Summit";
                r.Status = TakebackStatus.PartiallyRecovered;
            })));
        }

        // ---- search: text -----------------------------------------------------------------------------------------

        [SqlTheory]
        [InlineData("TB-000014", "TB-000014")]
        [InlineData("tb-000014", "TB-000014")]
        [InlineData("TB-00001", "TB-000010,TB-000011,TB-000012,TB-000013,TB-000014,TB-000015,TB-000016,TB-000017,TB-000018")]
        [InlineData("CLM-105701", "TB-000014")]
        [InlineData("clm-104", "TB-000010,TB-000011,TB-000012")]
        [InlineData("M000105", "TB-000005")]
        [InlineData("davis", "TB-000005")]
        [InlineData("Riverbend", "TB-000001,TB-000011")]
        [InlineData("summit orthopedic", "TB-000003,TB-000013")]
        [InlineData("P10003", "TB-000003,TB-000013")]
        public void Search_text_matches_number_claim_member_and_provider(string text, string expectedNumbers)
        {
            PagedResult<TakebackListItem> result = Search(r => r.SearchText = text);

            Assert.Equal(expectedNumbers.Split(','), Numbers(result));
            Assert.Equal(result.Items.Count, result.TotalCount);
        }

        [SqlTheory]
        [InlineData("%")]
        [InlineData("_")]
        [InlineData("[")]
        [InlineData("[A-Z]")]
        [InlineData("\\")]
        [InlineData("TB_000014")]
        [InlineData("TB-00001%")]
        [InlineData("CLM-1_5701")]
        public void Search_text_treats_wildcard_characters_as_literal_text(string text)
        {
            Assert.Equal(0, Search(r => r.SearchText = text).TotalCount);
        }

        [SqlFact]
        public void Search_text_cannot_inject_sql()
        {
            foreach (string text in new[] { "'; DROP TABLE dbo.Takeback;--", "O'Brien", "' OR 1=1 --", "\"" })
            {
                string value = text;
                Assert.Equal(0, Search(r => r.SearchText = value).TotalCount);
            }

            Assert.Equal(18, Search().TotalCount);
        }

        [SqlFact]
        public void Search_text_that_is_null_or_empty_means_no_filter()
        {
            Assert.Equal(18, Search(r => r.SearchText = string.Empty).TotalCount);
            Assert.Equal(18, Search(r => r.SearchText = null).TotalCount);
        }

        // ---- search: sorting --------------------------------------------------------------------------------------

        [SqlFact]
        public void Sorting_matches_an_independent_ordering_for_every_key_in_both_directions()
        {
            AssertSortedBy("takebackNumber", i => i.TakebackId);
            AssertSortedBy("claimNumber", i => i.ClaimNumber, StringComparer.OrdinalIgnoreCase);
            AssertSortedBy("memberName", i => i.MemberName, StringComparer.OrdinalIgnoreCase);
            AssertSortedBy("providerName", i => i.ProviderName, StringComparer.OrdinalIgnoreCase);
            AssertSortedBy("reason", i => (int)i.Reason);
            AssertSortedBy("status", i => (int)i.Status);
            AssertSortedBy("takebackAmount", i => i.TakebackAmount);
            AssertSortedBy("recoveredAmount", i => i.RecoveredAmount);
            AssertSortedBy("outstandingAmount", i => i.OutstandingAmount);
            AssertSortedBy("createdDate", i => i.CreatedDate);
        }

        [SqlFact]
        public void Sorting_by_amount_puts_the_smallest_and_the_largest_where_expected()
        {
            IList<TakebackListItem> ascending = Search(r => r.SortBy = "takebackAmount").Items;
            IList<TakebackListItem> descending = Search(r =>
            {
                r.SortBy = "takebackAmount";
                r.SortDescending = true;
            }).Items;

            Assert.Equal("TB-000011", ascending.First().TakebackNumber);
            Assert.Equal(150.00m, ascending.First().TakebackAmount);
            Assert.Equal("TB-000008", descending.First().TakebackNumber);
            Assert.Equal(31500.00m, descending.First().TakebackAmount);
        }

        [SqlFact]
        public void Sorting_by_due_date_keeps_takebacks_without_a_due_date_last_in_both_directions()
        {
            AssertDueDateOrder(Search(r => r.SortBy = "dueDate").Items, false);
            AssertDueDateOrder(Search(r =>
            {
                r.SortBy = "dueDate";
                r.SortDescending = true;
            }).Items, true);
        }

        [SqlFact]
        public void Sorting_by_an_unknown_key_falls_back_to_newest_first_in_both_directions()
        {
            List<int> expected = Search().Items.Select(i => i.TakebackId).ToList();

            foreach (string sortBy in new[] { "bogus", "DueDate; DROP TABLE dbo.Takeback;--", "1", "createdDate desc", string.Empty })
            {
                string key = sortBy;
                Assert.Equal(expected, Search(r => r.SortBy = key).Items.Select(i => i.TakebackId).ToList());
                Assert.Equal(expected, Search(r =>
                {
                    r.SortBy = key;
                    r.SortDescending = true;
                }).Items.Select(i => i.TakebackId).ToList());
            }

            Assert.Equal(18, Search().TotalCount);
        }

        [SqlFact]
        public void Sorting_works_for_every_key_together_with_paging()
        {
            string[] keys =
            {
                "takebackNumber", "claimNumber", "memberName", "providerName", "reason", "status",
                "takebackAmount", "recoveredAmount", "outstandingAmount", "dueDate", "createdDate"
            };

            foreach (string sortBy in keys)
            {
                string key = sortBy;
                PagedResult<TakebackListItem> page = _takebacks.Search(new TakebackSearchRequest { SortBy = key, PageNumber = 2, PageSize = 5 });

                Assert.Equal(5, page.Items.Count);
                Assert.Equal(18, page.TotalCount);
            }
        }

        // ---- GetById ----------------------------------------------------------------------------------------------

        [SqlFact]
        public void GetById_returns_the_same_values_as_the_list_for_every_takeback()
        {
            foreach (TakebackListItem item in Search().Items)
            {
                Takeback detail = _takebacks.GetById(item.TakebackId);

                Assert.NotNull(detail);
                Assert.Equal(item.TakebackNumber, detail.TakebackNumber);
                Assert.Equal(item.ClaimNumber, detail.ClaimNumber);
                Assert.Equal(item.MemberId, detail.MemberId);
                Assert.Equal(item.MemberNumber, detail.MemberNumber);
                Assert.Equal(item.MemberName, detail.MemberName);
                Assert.Equal(item.ProviderId, detail.ProviderId);
                Assert.Equal(item.ProviderName, detail.ProviderName);
                Assert.Equal(item.Reason, detail.Reason);
                Assert.Equal(item.Status, detail.Status);
                Assert.Equal(item.TakebackAmount, detail.TakebackAmount);
                Assert.Equal(item.RecoveredAmount, detail.RecoveredAmount);
                Assert.Equal(item.OutstandingAmount, detail.OutstandingAmount);
                Assert.Equal(item.NoticeDate, detail.NoticeDate);
                Assert.Equal(item.DueDate, detail.DueDate);
                Assert.Equal(item.IsOverdue, detail.IsOverdue);
                Assert.Equal(item.CreatedByName, detail.CreatedByName);
                Assert.Equal(item.CreatedDate, detail.CreatedDate);
            }
        }

        [SqlFact]
        public void GetById_returns_a_fully_recovered_takeback_with_both_recoveries_and_the_whole_history()
        {
            Takeback takeback = _takebacks.GetById(IdOf("TB-000001"));

            Assert.Equal("CLM-100234", takeback.ClaimNumber);
            Assert.Equal("M000101", takeback.MemberNumber);
            Assert.Equal("Martinez, Olivia", takeback.MemberName);
            Assert.Equal("P10001", takeback.ProviderNumber);
            Assert.Equal("Riverbend Family Medicine", takeback.ProviderName);
            Assert.Equal(TakebackReason.OtherInsurancePrimary, takeback.Reason);
            Assert.Equal(TakebackStatus.Recovered, takeback.Status);
            Assert.Equal(1240.00m, takeback.OriginalPaidAmount);
            Assert.Equal(1240.00m, takeback.TakebackAmount);
            Assert.Equal(1240.00m, takeback.RecoveredAmount);
            Assert.Equal(0m, takeback.OutstandingAmount);
            Assert.Equal("Blue Horizon Insurance", takeback.OtherCarrierName);
            Assert.Equal("BH-5530981", takeback.OtherPolicyNumber);
            Assert.StartsWith("Member is a dependent", takeback.Notes);
            Assert.Equal(takeback.NoticeDate.Value.AddDays(30), takeback.DueDate.Value);
            Assert.False(takeback.IsOverdue);
            Assert.Equal(SampleUsers.Blake, takeback.ApprovedByUserId);
            Assert.Equal("Blake Wilson", takeback.ApprovedByName);
            Assert.Equal(SampleUsers.Jamie, takeback.CreatedByUserId);
            Assert.Equal("Jamie Doe", takeback.CreatedByName);
            Assert.Equal(SampleUsers.Jamie, takeback.ModifiedByUserId);
            Assert.Equal("Jamie Doe", takeback.ModifiedByName);
            Assert.NotNull(takeback.ModifiedDate);
            Assert.Equal(8, takeback.RowVersion.Length);

            Assert.Equal(new[] { 620.00m, 620.00m }, takeback.Recoveries.Select(r => r.Amount).ToArray());
            Assert.Equal(new[] { RecoveryMethod.Eft, RecoveryMethod.Check }, takeback.Recoveries.Select(r => r.Method).ToArray());
            Assert.Equal(new[] { "EFT-88231", "CHK-440917" }, takeback.Recoveries.Select(r => r.ReferenceNumber).ToArray());
            Assert.All(takeback.Recoveries, r =>
            {
                Assert.Equal(takeback.TakebackId, r.TakebackId);
                Assert.Null(r.Notes);
                Assert.Equal(SampleUsers.Jamie, r.CreatedByUserId);
                Assert.Equal("Jamie Doe", r.CreatedByName);
            });

            Assert.Equal(
                new[]
                {
                    TakebackActions.Create, TakebackActions.Submit, TakebackActions.Approve,
                    TakebackActions.SendNotice, TakebackActions.RecordRecovery, TakebackActions.RecordRecovery
                },
                takeback.History.Select(h => h.Action).ToArray());
            Assert.Equal(
                new TakebackStatus?[]
                {
                    null, TakebackStatus.Draft, TakebackStatus.PendingApproval,
                    TakebackStatus.Approved, TakebackStatus.NoticeSent, TakebackStatus.PartiallyRecovered
                },
                takeback.History.Select(h => h.FromStatus).ToArray());
            Assert.Equal(
                new[]
                {
                    TakebackStatus.Draft, TakebackStatus.PendingApproval, TakebackStatus.Approved,
                    TakebackStatus.NoticeSent, TakebackStatus.PartiallyRecovered, TakebackStatus.Recovered
                },
                takeback.History.Select(h => h.ToStatus).ToArray());
            Assert.Equal(
                new[] { SampleUsers.Jamie, SampleUsers.Jamie, SampleUsers.Blake, SampleUsers.Jamie, SampleUsers.Jamie, SampleUsers.Jamie },
                takeback.History.Select(h => h.ChangedByUserId).ToArray());
            Assert.Equal("Blake Wilson", takeback.History[2].ChangedByName);
            Assert.Equal("Recovered 620.00 by Eft.", takeback.History[4].Comment);
            Assert.Equal("Recovered 620.00 by Check.", takeback.History[5].Comment);
            Assert.All(takeback.History, h => Assert.Equal(takeback.TakebackId, h.TakebackId));
        }

        [SqlFact]
        public void GetById_returns_a_partially_recovered_takeback_that_an_administrator_approved()
        {
            Takeback takeback = _takebacks.GetById(IdOf("TB-000014"));

            Assert.Equal(TakebackStatus.PartiallyRecovered, takeback.Status);
            Assert.Equal(18250.00m, takeback.TakebackAmount);
            Assert.Equal(10000.00m, takeback.RecoveredAmount);
            Assert.Equal(8250.00m, takeback.OutstandingAmount);
            Assert.Equal(SampleUsers.Casey, takeback.ApprovedByUserId);
            Assert.Equal("Casey Admin", takeback.ApprovedByName);
            Assert.Equal(new[] { 6000.00m, 4000.00m }, takeback.Recoveries.Select(r => r.Amount).ToArray());
            Assert.Equal(new[] { "EFT-90012", "EFT-90455" }, takeback.Recoveries.Select(r => r.ReferenceNumber).ToArray());

            TakebackHistoryEntry first = takeback.History[takeback.History.Count - 2];
            TakebackHistoryEntry second = takeback.History[takeback.History.Count - 1];
            Assert.Equal(TakebackStatus.NoticeSent, first.FromStatus);
            Assert.Equal(TakebackStatus.PartiallyRecovered, first.ToStatus);
            Assert.Equal("Recovered 6,000.00 by Eft.", first.Comment);
            Assert.Equal(TakebackStatus.PartiallyRecovered, second.FromStatus);
            Assert.Equal(TakebackStatus.PartiallyRecovered, second.ToStatus);
            Assert.Equal("Recovered 4,000.00 by Eft.", second.Comment);
        }

        [SqlFact]
        public void GetById_returns_the_notes_and_reference_of_an_offset_recovery()
        {
            Takeback takeback = _takebacks.GetById(IdOf("TB-000003"));

            TakebackRecovery recovery = Assert.Single(takeback.Recoveries);
            Assert.Equal(1000.00m, recovery.Amount);
            Assert.Equal(RecoveryMethod.Offset, recovery.Method);
            Assert.Equal("OFFSET-2291", recovery.ReferenceNumber);
            Assert.Equal("Provider agreed to return the balance in installments.", recovery.Notes);
            Assert.True(takeback.IsOverdue);
        }

        [SqlFact]
        public void GetById_returns_a_draft_without_notice_approval_recoveries_or_edits()
        {
            Takeback takeback = _takebacks.GetById(IdOf("TB-000009"));

            Assert.Equal(TakebackStatus.Draft, takeback.Status);
            Assert.Null(takeback.NoticeDate);
            Assert.Null(takeback.DueDate);
            Assert.False(takeback.IsOverdue);
            Assert.Null(takeback.ApprovedByUserId);
            Assert.Null(takeback.ApprovedByName);
            Assert.Null(takeback.ApprovedDate);
            Assert.Null(takeback.ModifiedByUserId);
            Assert.Null(takeback.ModifiedByName);
            Assert.Null(takeback.ModifiedDate);
            Assert.Null(takeback.OtherCarrierName);
            Assert.Null(takeback.OtherPolicyNumber);
            Assert.Equal(0m, takeback.RecoveredAmount);
            Assert.Empty(takeback.Recoveries);

            TakebackHistoryEntry created = Assert.Single(takeback.History);
            Assert.Equal(TakebackActions.Create, created.Action);
            Assert.Null(created.FromStatus);
            Assert.Equal(TakebackStatus.Draft, created.ToStatus);
        }

        [SqlFact]
        public void GetById_keeps_the_original_paid_amount_apart_from_the_takeback_amount()
        {
            Takeback takeback = _takebacks.GetById(IdOf("TB-000008"));

            Assert.Equal(TakebackStatus.PendingApproval, takeback.Status);
            Assert.Equal(48000.00m, takeback.OriginalPaidAmount);
            Assert.Equal(31500.00m, takeback.TakebackAmount);
            Assert.Contains("25,000", takeback.Notes);
        }

        [SqlFact]
        public void GetById_stamps_dates_and_timestamps_with_the_documented_kinds()
        {
            Takeback takeback = _takebacks.GetById(IdOf("TB-000001"));

            Assert.Equal(DateTimeKind.Unspecified, takeback.DateOfService.Kind);
            Assert.Equal(DateTimeKind.Unspecified, takeback.NoticeDate.Value.Kind);
            Assert.Equal(DateTimeKind.Unspecified, takeback.DueDate.Value.Kind);
            Assert.Equal(DateTimeKind.Utc, takeback.ApprovedDate.Value.Kind);
            Assert.Equal(DateTimeKind.Utc, takeback.CreatedDate.Kind);
            Assert.Equal(DateTimeKind.Utc, takeback.ModifiedDate.Value.Kind);
            Assert.Equal(DateTimeKind.Unspecified, takeback.Recoveries[0].RecoveryDate.Kind);
            Assert.Equal(DateTimeKind.Utc, takeback.Recoveries[0].CreatedDate.Kind);
            Assert.All(takeback.History, h => Assert.Equal(DateTimeKind.Utc, h.ChangedDate.Kind));
        }

        [SqlFact]
        public void GetById_leaves_the_linked_activities_and_available_actions_to_the_business_layer()
        {
            Takeback takeback = _takebacks.GetById(IdOf("TB-000008"));

            Assert.Empty(takeback.LinkedActivities);
            Assert.Empty(takeback.AvailableActions);
        }

        [SqlFact]
        public void GetById_of_an_unknown_takeback_returns_null()
        {
            Assert.Null(_takebacks.GetById(999999));
            Assert.Null(_takebacks.GetById(0));
        }

        // ---- ActiveTakebackExists ---------------------------------------------------------------------------------

        [SqlFact]
        public void ActiveTakebackExists_matches_the_claim_and_provider_of_a_takeback_that_is_still_alive()
        {
            int riverbend = ProviderId("P10001");

            Assert.True(_takebacks.ActiveTakebackExists("CLM-100234", riverbend, 0));
            Assert.True(_takebacks.ActiveTakebackExists("clm-100234", riverbend, 0));
            Assert.False(_takebacks.ActiveTakebackExists("CLM-100234", riverbend, IdOf("TB-000001")));
            Assert.False(_takebacks.ActiveTakebackExists("CLM-100234", ProviderId("P10002"), 0));
            Assert.False(_takebacks.ActiveTakebackExists("CLM-999999", riverbend, 0));
        }

        [SqlFact]
        public void ActiveTakebackExists_ignores_rejected_and_cancelled_takebacks()
        {
            // TB-000007 (Rejected) and TB-000011 (Cancelled).
            Assert.False(_takebacks.ActiveTakebackExists("CLM-103115", ProviderId("P10009"), 0));
            Assert.False(_takebacks.ActiveTakebackExists("CLM-104630", ProviderId("P10001"), 0));
        }

        // ---- helpers ----------------------------------------------------------------------------------------------

        private PagedResult<TakebackListItem> Search(Action<TakebackSearchRequest> configure = null)
        {
            TakebackSearchRequest request = new TakebackSearchRequest { PageSize = 100 };
            if (configure != null)
            {
                configure(request);
            }

            return _takebacks.Search(request);
        }

        private int IdOf(string takebackNumber)
        {
            return Search(r => r.SearchText = takebackNumber).Items.Single(i => i.TakebackNumber == takebackNumber).TakebackId;
        }

        private int ProviderId(string providerNumber)
        {
            return _db.Lookups.SearchProviders(providerNumber, 1).Single().ProviderId;
        }

        private static string[] Numbers(PagedResult<TakebackListItem> result)
        {
            return result.Items.Select(i => i.TakebackNumber).OrderBy(n => n, StringComparer.Ordinal).ToArray();
        }

        // Ties are broken by the takeback id in the same direction, so descending is the exact reverse of ascending.
        private void AssertSortedBy<TKey>(string sortBy, Func<TakebackListItem, TKey> key, IComparer<TKey> comparer = null)
        {
            IComparer<TKey> compare = comparer ?? Comparer<TKey>.Default;
            List<TakebackListItem> all = Search().Items.ToList();

            List<int> ascending = all.OrderBy(key, compare).ThenBy(i => i.TakebackId).Select(i => i.TakebackId).ToList();
            List<int> descending = all.OrderByDescending(key, compare).ThenByDescending(i => i.TakebackId).Select(i => i.TakebackId).ToList();

            Assert.Equal(ascending, Search(r => r.SortBy = sortBy).Items.Select(i => i.TakebackId).ToList());
            Assert.Equal(descending, Search(r =>
            {
                r.SortBy = sortBy;
                r.SortDescending = true;
            }).Items.Select(i => i.TakebackId).ToList());
        }

        private static void AssertDueDateOrder(IList<TakebackListItem> items, bool descending)
        {
            List<TakebackListItem> dated = items.Where(i => i.DueDate.HasValue).ToList();
            Assert.NotEmpty(dated);
            Assert.Equal(
                descending ? dated.OrderByDescending(i => i.DueDate).Select(i => i.DueDate) : dated.OrderBy(i => i.DueDate).Select(i => i.DueDate),
                dated.Select(i => i.DueDate));

            int firstUndated = items.ToList().FindIndex(i => i.DueDate == null);
            Assert.True(firstUndated > 0);
            Assert.All(items.Skip(firstUndated), i => Assert.Null(i.DueDate));
        }
    }
}
