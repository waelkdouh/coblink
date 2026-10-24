// System.Data.SqlClient is deliberately the legacy provider; moving to Microsoft.Data.SqlClient is a modernization task.
#pragma warning disable CS0618
using System;
using System.Data.SqlClient;
using System.Linq;
using CobLink.Data.Repositories;
using CobLink.Data.Tests.Infrastructure;
using CobLink.Models;
using Xunit;

namespace CobLink.Data.Tests
{
    /// <summary>
    /// Tests of ITakebackRepository that write. Every test creates its own takeback (unique claim number). The
    /// repository does not enforce the workflow (that is the business layer's job), so the tests walk the
    /// transitions the business layer would make.
    /// </summary>
    [Collection(WorkingDatabaseCollection.Name)]
    public class TakebackRepositoryWriteTests
    {
        private const int ConstraintViolation = 547;

        private readonly WorkingDatabaseFixture _db;
        private readonly ITakebackRepository _takebacks;
        private readonly int _memberId;
        private readonly int _otherMemberId;
        private readonly int _providerId;
        private readonly int _otherProviderId;

        public TakebackRepositoryWriteTests(WorkingDatabaseFixture db)
        {
            _db = db;
            _takebacks = db.Takebacks;
            _memberId = db.Lookups.SearchMembers("M000101", 1).Single().MemberId;
            _otherMemberId = db.Lookups.SearchMembers("M000102", 1).Single().MemberId;
            _providerId = db.Lookups.SearchProviders("P10001", 1).Single().ProviderId;
            _otherProviderId = db.Lookups.SearchProviders("P10002", 1).Single().ProviderId;
        }

        // ---- Insert -----------------------------------------------------------------------------------------------

        [SqlFact]
        public void Insert_creates_a_draft_with_a_create_history_entry()
        {
            Takeback input = NewTakeback();

            int id = _takebacks.Insert(input, SampleUsers.Jamie);
            Takeback stored = _takebacks.GetById(id);

            Assert.True(id > 0);
            Assert.Equal(id, stored.TakebackId);
            Assert.Equal("TB-" + id.ToString("D6"), stored.TakebackNumber);
            Assert.Equal(input.ClaimNumber, stored.ClaimNumber);
            Assert.Equal(_memberId, stored.MemberId);
            Assert.Equal("M000101", stored.MemberNumber);
            Assert.Equal("Martinez, Olivia", stored.MemberName);
            Assert.Equal(_providerId, stored.ProviderId);
            Assert.Equal("P10001", stored.ProviderNumber);
            Assert.Equal("Riverbend Family Medicine", stored.ProviderName);
            Assert.Equal(TakebackReason.DuplicatePayment, stored.Reason);
            Assert.Equal(TakebackStatus.Draft, stored.Status);
            Assert.Equal(input.DateOfService, stored.DateOfService);
            Assert.Equal(DateTimeKind.Unspecified, stored.DateOfService.Kind);
            Assert.Equal(1500.00m, stored.OriginalPaidAmount);
            Assert.Equal(1200.00m, stored.TakebackAmount);
            Assert.Equal(0m, stored.RecoveredAmount);
            Assert.Equal(1200.00m, stored.OutstandingAmount);
            Assert.Equal("Contoso Health", stored.OtherCarrierName);
            Assert.Equal("POL-7788", stored.OtherPolicyNumber);
            Assert.Equal("Paid twice.", stored.Notes);
            Assert.Null(stored.NoticeDate);
            Assert.Null(stored.DueDate);
            Assert.False(stored.IsOverdue);
            Assert.Null(stored.ApprovedByUserId);
            Assert.Null(stored.ApprovedByName);
            Assert.Null(stored.ApprovedDate);
            Assert.Equal(SampleUsers.Jamie, stored.CreatedByUserId);
            Assert.Equal("Jamie Doe", stored.CreatedByName);
            AssertJustNow(stored.CreatedDate);
            Assert.Null(stored.ModifiedByUserId);
            Assert.Null(stored.ModifiedDate);
            Assert.Equal(8, stored.RowVersion.Length);
            Assert.Empty(stored.Recoveries);

            TakebackHistoryEntry entry = Assert.Single(stored.History);
            Assert.Equal(TakebackActions.Create, entry.Action);
            Assert.Null(entry.FromStatus);
            Assert.Equal(TakebackStatus.Draft, entry.ToStatus);
            Assert.Equal(SampleUsers.Jamie, entry.ChangedByUserId);
            Assert.Equal("Jamie Doe", entry.ChangedByName);
            AssertJustNow(entry.ChangedDate);
        }

        [SqlFact]
        public void Insert_accepts_a_takeback_without_the_optional_columns()
        {
            Takeback input = NewTakeback();
            input.OtherCarrierName = null;
            input.OtherPolicyNumber = null;
            input.Notes = null;

            Takeback stored = _takebacks.GetById(_takebacks.Insert(input, SampleUsers.Jamie));

            Assert.Null(stored.OtherCarrierName);
            Assert.Null(stored.OtherPolicyNumber);
            Assert.Null(stored.Notes);
        }

        [SqlFact]
        public void Insert_keeps_cents_exactly()
        {
            Takeback input = NewTakeback();
            input.OriginalPaidAmount = 9999999.99m;
            input.TakebackAmount = 1234567.89m;

            Takeback stored = _takebacks.GetById(_takebacks.Insert(input, SampleUsers.Jamie));

            Assert.Equal(9999999.99m, stored.OriginalPaidAmount);
            Assert.Equal(1234567.89m, stored.TakebackAmount);
        }

        [SqlTheory]
        [InlineData(1500.00, 1500.01)]
        [InlineData(1500.00, 0.00)]
        [InlineData(0.00, 0.00)]
        public void Insert_that_breaks_the_amount_rules_is_rejected_by_the_database_and_stores_nothing(double paid, double takeback)
        {
            Takeback input = NewTakeback();
            input.OriginalPaidAmount = (decimal)paid;
            input.TakebackAmount = (decimal)takeback;

            SqlException exception = Assert.Throws<SqlException>(() => _takebacks.Insert(input, SampleUsers.Jamie));

            Assert.Equal(ConstraintViolation, exception.Number);
            Assert.Equal(0, CountByClaim(input.ClaimNumber));
        }

        [SqlFact]
        public void Insert_with_an_unknown_member_provider_or_user_is_rejected_by_the_database()
        {
            Takeback unknownMember = NewTakeback();
            unknownMember.MemberId = 999999;
            Takeback unknownProvider = NewTakeback();
            unknownProvider.ProviderId = 999999;
            Takeback validButUnknownUser = NewTakeback();

            Assert.Equal(ConstraintViolation, Assert.Throws<SqlException>(() => _takebacks.Insert(unknownMember, SampleUsers.Jamie)).Number);
            Assert.Equal(ConstraintViolation, Assert.Throws<SqlException>(() => _takebacks.Insert(unknownProvider, SampleUsers.Jamie)).Number);
            Assert.Equal(ConstraintViolation, Assert.Throws<SqlException>(() => _takebacks.Insert(validButUnknownUser, 999999)).Number);

            Assert.Equal(0, CountByClaim(unknownMember.ClaimNumber));
            Assert.Equal(0, CountByClaim(unknownProvider.ClaimNumber));
            Assert.Equal(0, CountByClaim(validButUnknownUser.ClaimNumber));
        }

        // ---- Update -----------------------------------------------------------------------------------------------

        [SqlFact]
        public void Update_changes_the_business_columns_and_writes_an_edit_history_entry()
        {
            int id = _takebacks.Insert(NewTakeback(), SampleUsers.Jamie);
            Takeback edit = _takebacks.GetById(id);
            byte[] oldRowVersion = edit.RowVersion;
            string number = edit.TakebackNumber;

            edit.ClaimNumber = edit.ClaimNumber + "-B";
            edit.MemberId = _otherMemberId;
            edit.ProviderId = _otherProviderId;
            edit.Reason = TakebackReason.MedicarePrimary;
            edit.DateOfService = edit.DateOfService.AddDays(-3);
            edit.OriginalPaidAmount = 2500.50m;
            edit.TakebackAmount = 2000.25m;
            edit.OtherCarrierName = "Fabrikam Health";
            edit.OtherPolicyNumber = "POL-1";
            edit.Notes = "Edited";
            _takebacks.Update(edit, SampleUsers.Casey);
            Takeback after = _takebacks.GetById(id);

            Assert.Equal(number, after.TakebackNumber);
            Assert.Equal(edit.ClaimNumber, after.ClaimNumber);
            Assert.Equal(_otherMemberId, after.MemberId);
            Assert.Equal(_otherProviderId, after.ProviderId);
            Assert.Equal(TakebackReason.MedicarePrimary, after.Reason);
            Assert.Equal(edit.DateOfService, after.DateOfService);
            Assert.Equal(2500.50m, after.OriginalPaidAmount);
            Assert.Equal(2000.25m, after.TakebackAmount);
            Assert.Equal("Fabrikam Health", after.OtherCarrierName);
            Assert.Equal("POL-1", after.OtherPolicyNumber);
            Assert.Equal("Edited", after.Notes);

            Assert.Equal(TakebackStatus.Draft, after.Status);
            Assert.Equal(SampleUsers.Jamie, after.CreatedByUserId);
            Assert.Equal(SampleUsers.Casey, after.ModifiedByUserId);
            Assert.Equal("Casey Admin", after.ModifiedByName);
            AssertJustNow(after.ModifiedDate.Value);
            Assert.NotEqual(oldRowVersion, after.RowVersion);

            Assert.Equal(new[] { TakebackActions.Create, TakebackActions.Edit }, after.History.Select(h => h.Action).ToArray());
            TakebackHistoryEntry entry = after.History[1];
            Assert.Equal(TakebackStatus.Draft, entry.FromStatus);
            Assert.Equal(TakebackStatus.Draft, entry.ToStatus);
            Assert.Equal(SampleUsers.Casey, entry.ChangedByUserId);
        }

        [SqlFact]
        public void Update_with_a_stale_row_version_throws_ConcurrencyException_and_changes_nothing()
        {
            int id = _takebacks.Insert(NewTakeback(), SampleUsers.Jamie);
            Takeback first = _takebacks.GetById(id);
            Takeback second = _takebacks.GetById(id);

            first.Notes = "first writer";
            _takebacks.Update(first, SampleUsers.Jamie);
            second.Notes = "second writer";

            Assert.Throws<ConcurrencyException>(() => _takebacks.Update(second, SampleUsers.Alex));

            Takeback after = _takebacks.GetById(id);
            Assert.Equal("first writer", after.Notes);
            Assert.Equal(2, after.History.Count);
        }

        [SqlFact]
        public void Update_without_a_row_version_is_treated_as_a_stale_update()
        {
            int id = _takebacks.Insert(NewTakeback(), SampleUsers.Jamie);
            Takeback edit = _takebacks.GetById(id);
            edit.RowVersion = null;

            Assert.Throws<ConcurrencyException>(() => _takebacks.Update(edit, SampleUsers.Jamie));
        }

        [SqlFact]
        public void Update_of_a_missing_takeback_throws_NotFoundException()
        {
            Takeback ghost = NewTakeback();
            ghost.TakebackId = 999999;
            ghost.RowVersion = new byte[8];

            NotFoundException exception = Assert.Throws<NotFoundException>(() => _takebacks.Update(ghost, SampleUsers.Jamie));

            Assert.Equal("Takeback", exception.EntityName);
        }

        [SqlFact]
        public void Update_that_breaks_the_amount_rules_is_rolled_back_with_its_history_entry()
        {
            int id = _takebacks.Insert(NewTakeback(), SampleUsers.Jamie);
            Takeback edit = _takebacks.GetById(id);
            byte[] rowVersion = edit.RowVersion;
            edit.TakebackAmount = edit.OriginalPaidAmount + 0.01m;

            Assert.Equal(ConstraintViolation, Assert.Throws<SqlException>(() => _takebacks.Update(edit, SampleUsers.Jamie)).Number);

            Takeback after = _takebacks.GetById(id);
            Assert.Equal(1200.00m, after.TakebackAmount);
            Assert.Single(after.History);
            Assert.Equal(rowVersion, after.RowVersion);
        }

        // ---- ChangeStatus -----------------------------------------------------------------------------------------

        [SqlFact]
        public void ChangeStatus_moves_the_takeback_and_records_who_why_and_from_where()
        {
            int id = _takebacks.Insert(NewTakeback(), SampleUsers.Jamie);
            byte[] oldRowVersion = _takebacks.GetById(id).RowVersion;

            Takeback after = Move(id, TakebackStatus.PendingApproval, TakebackActions.Submit, SampleUsers.Alex, "Ready for review");

            Assert.Equal(TakebackStatus.PendingApproval, after.Status);
            Assert.Equal(SampleUsers.Alex, after.ModifiedByUserId);
            AssertJustNow(after.ModifiedDate.Value);
            Assert.NotEqual(oldRowVersion, after.RowVersion);

            TakebackHistoryEntry entry = after.History.Last();
            Assert.Equal(TakebackActions.Submit, entry.Action);
            Assert.Equal(TakebackStatus.Draft, entry.FromStatus);
            Assert.Equal(TakebackStatus.PendingApproval, entry.ToStatus);
            Assert.Equal("Ready for review", entry.Comment);
            Assert.Equal(SampleUsers.Alex, entry.ChangedByUserId);
            Assert.Equal("Alex Smith", entry.ChangedByName);
            Assert.Equal(2, after.History.Count);
        }

        [SqlFact]
        public void ChangeStatus_stamps_the_approver_and_the_notice_and_due_dates_and_later_changes_keep_them()
        {
            DateTime today = _db.Database.ServerToday();
            DateTime approvedAt = new DateTime(2026, 5, 4, 10, 20, 30, DateTimeKind.Utc);
            int id = _takebacks.Insert(NewTakeback(), SampleUsers.Jamie);
            Move(id, TakebackStatus.PendingApproval, TakebackActions.Submit, SampleUsers.Jamie);

            Takeback approved = Move(id, TakebackStatus.Approved, TakebackActions.Approve, SampleUsers.Blake, null, approvedBy: SampleUsers.Blake, approvedDate: approvedAt);
            Assert.Equal(SampleUsers.Blake, approved.ApprovedByUserId);
            Assert.Equal("Blake Wilson", approved.ApprovedByName);
            Assert.Equal(approvedAt, approved.ApprovedDate);
            Assert.Equal(DateTimeKind.Utc, approved.ApprovedDate.Value.Kind);
            Assert.Null(approved.NoticeDate);
            Assert.Null(approved.DueDate);

            Takeback noticed = Move(id, TakebackStatus.NoticeSent, TakebackActions.SendNotice, SampleUsers.Jamie, null, noticeDate: today, dueDate: today.AddDays(30));
            Assert.Equal(today, noticed.NoticeDate);
            Assert.Equal(today.AddDays(30), noticed.DueDate);
            Assert.Equal(DateTimeKind.Unspecified, noticed.NoticeDate.Value.Kind);
            Assert.Equal(SampleUsers.Blake, noticed.ApprovedByUserId);

            Takeback disputed = Move(id, TakebackStatus.Disputed, TakebackActions.Dispute, SampleUsers.Alex, "Provider disagrees");
            Assert.Equal(today, disputed.NoticeDate);
            Assert.Equal(today.AddDays(30), disputed.DueDate);
            Assert.Equal(SampleUsers.Blake, disputed.ApprovedByUserId);
            Assert.Equal(approvedAt, disputed.ApprovedDate);
        }

        [SqlFact]
        public void IsOverdue_is_calculated_by_the_database_from_the_due_date_and_status()
        {
            DateTime today = _db.Database.ServerToday();
            int id = _takebacks.Insert(NewTakeback(), SampleUsers.Jamie);
            Move(id, TakebackStatus.PendingApproval, TakebackActions.Submit, SampleUsers.Jamie);
            Move(id, TakebackStatus.Approved, TakebackActions.Approve, SampleUsers.Blake, null, approvedBy: SampleUsers.Blake, approvedDate: DateTime.UtcNow);

            Takeback overdue = Move(id, TakebackStatus.NoticeSent, TakebackActions.SendNotice, SampleUsers.Jamie, null, noticeDate: today.AddDays(-40), dueDate: today.AddDays(-10));
            Assert.True(overdue.IsOverdue);

            Takeback dueToday = Move(id, TakebackStatus.NoticeSent, TakebackActions.SendNotice, SampleUsers.Jamie, null, dueDate: today);
            Assert.False(dueToday.IsOverdue);

            Takeback longPast = Move(id, TakebackStatus.NoticeSent, TakebackActions.SendNotice, SampleUsers.Jamie, null, dueDate: today.AddDays(-1));
            Assert.True(longPast.IsOverdue);

            Takeback disputed = Move(id, TakebackStatus.Disputed, TakebackActions.Dispute, SampleUsers.Alex, "Disputed");
            Assert.False(disputed.IsOverdue);
        }

        [SqlFact]
        public void ChangeStatus_with_a_stale_or_missing_row_version_throws_ConcurrencyException_and_writes_nothing()
        {
            int id = _takebacks.Insert(NewTakeback(), SampleUsers.Jamie);
            byte[] stale = _takebacks.GetById(id).RowVersion;
            Move(id, TakebackStatus.PendingApproval, TakebackActions.Submit, SampleUsers.Jamie);
            int historyCount = _takebacks.GetById(id).History.Count;

            Assert.Throws<ConcurrencyException>(() => _takebacks.ChangeStatus(StatusChange(id, TakebackStatus.Approved, TakebackActions.Approve, stale), SampleUsers.Blake));
            Assert.Throws<ConcurrencyException>(() => _takebacks.ChangeStatus(StatusChange(id, TakebackStatus.Approved, TakebackActions.Approve, null), SampleUsers.Blake));

            Takeback after = _takebacks.GetById(id);
            Assert.Equal(TakebackStatus.PendingApproval, after.Status);
            Assert.Equal(historyCount, after.History.Count);
        }

        [SqlFact]
        public void ChangeStatus_of_a_missing_takeback_throws_NotFoundException()
        {
            NotFoundException exception = Assert.Throws<NotFoundException>(
                () => _takebacks.ChangeStatus(StatusChange(999999, TakebackStatus.PendingApproval, TakebackActions.Submit, new byte[8]), SampleUsers.Jamie));

            Assert.Equal("Takeback", exception.EntityName);
        }

        // ---- AddRecovery ------------------------------------------------------------------------------------------

        [SqlFact]
        public void AddRecovery_adds_the_recovery_updates_the_total_and_status_and_writes_history_in_one_step()
        {
            DateTime today = _db.Database.ServerToday();
            int id = CreateNoticeSent();
            Takeback before = _takebacks.GetById(id);

            _takebacks.AddRecovery(
                new TakebackRecovery
                {
                    TakebackId = id,
                    Amount = 400.00m,
                    RecoveryDate = today,
                    Method = RecoveryMethod.Eft,
                    ReferenceNumber = "EFT-1001",
                    Notes = "First payment"
                },
                TakebackStatus.PartiallyRecovered,
                before.RowVersion,
                SampleUsers.Alex);
            Takeback after = _takebacks.GetById(id);

            Assert.Equal(TakebackStatus.PartiallyRecovered, after.Status);
            Assert.Equal(400.00m, after.RecoveredAmount);
            Assert.Equal(800.00m, after.OutstandingAmount);
            Assert.Equal(SampleUsers.Alex, after.ModifiedByUserId);
            Assert.NotEqual(before.RowVersion, after.RowVersion);

            TakebackRecovery recovery = Assert.Single(after.Recoveries);
            Assert.True(recovery.RecoveryId > 0);
            Assert.Equal(id, recovery.TakebackId);
            Assert.Equal(400.00m, recovery.Amount);
            Assert.Equal(today, recovery.RecoveryDate);
            Assert.Equal(DateTimeKind.Unspecified, recovery.RecoveryDate.Kind);
            Assert.Equal(RecoveryMethod.Eft, recovery.Method);
            Assert.Equal("EFT-1001", recovery.ReferenceNumber);
            Assert.Equal("First payment", recovery.Notes);
            Assert.Equal(SampleUsers.Alex, recovery.CreatedByUserId);
            Assert.Equal("Alex Smith", recovery.CreatedByName);
            AssertJustNow(recovery.CreatedDate);

            TakebackHistoryEntry entry = after.History.Last();
            Assert.Equal(TakebackActions.RecordRecovery, entry.Action);
            Assert.Equal(TakebackStatus.NoticeSent, entry.FromStatus);
            Assert.Equal(TakebackStatus.PartiallyRecovered, entry.ToStatus);
            Assert.Equal("Recovered 400.00 by Eft.", entry.Comment);
            Assert.Equal(SampleUsers.Alex, entry.ChangedByUserId);
        }

        [SqlFact]
        public void AddRecovery_can_collect_the_whole_amount_in_several_steps()
        {
            DateTime today = _db.Database.ServerToday();
            int id = CreateNoticeSent();

            Recover(id, 400.00m, RecoveryMethod.Offset, null, TakebackStatus.PartiallyRecovered);
            Recover(id, 799.99m, RecoveryMethod.Check, "CHK-77", TakebackStatus.PartiallyRecovered);
            Recover(id, 0.01m, RecoveryMethod.Check, "CHK-78", TakebackStatus.Recovered);
            Takeback after = _takebacks.GetById(id);

            Assert.Equal(TakebackStatus.Recovered, after.Status);
            Assert.Equal(1200.00m, after.RecoveredAmount);
            Assert.Equal(0m, after.OutstandingAmount);
            Assert.Equal(new[] { 400.00m, 799.99m, 0.01m }, after.Recoveries.Select(r => r.Amount).ToArray());
            Assert.Equal(new[] { RecoveryMethod.Offset, RecoveryMethod.Check, RecoveryMethod.Check }, after.Recoveries.Select(r => r.Method).ToArray());
            Assert.Null(after.Recoveries[0].ReferenceNumber);
            Assert.Equal(
                new[]
                {
                    TakebackActions.Create, TakebackActions.Submit, TakebackActions.Approve, TakebackActions.SendNotice,
                    TakebackActions.RecordRecovery, TakebackActions.RecordRecovery, TakebackActions.RecordRecovery
                },
                after.History.Select(h => h.Action).ToArray());
            Assert.Equal(today, after.Recoveries[0].RecoveryDate);
        }

        [SqlFact]
        public void AddRecovery_writes_amounts_in_the_history_comment_the_same_way_on_every_server_culture()
        {
            int id = CreateNoticeSent();

            Recover(id, 1200.00m, RecoveryMethod.Check, "CHK-1", TakebackStatus.Recovered);

            Assert.Equal("Recovered 1,200.00 by Check.", _takebacks.GetById(id).History.Last().Comment);
        }

        [SqlFact]
        public void AddRecovery_beyond_the_takeback_amount_is_rejected_and_everything_is_rolled_back()
        {
            int id = CreateNoticeSent();
            Takeback before = _takebacks.GetById(id);

            SqlException exception = Assert.Throws<SqlException>(
                () => _takebacks.AddRecovery(NewRecovery(id, 1200.01m, RecoveryMethod.Check, "CHK-9"), TakebackStatus.Recovered, before.RowVersion, SampleUsers.Alex));
            Takeback after = _takebacks.GetById(id);

            Assert.Equal(ConstraintViolation, exception.Number);
            Assert.Equal(TakebackStatus.NoticeSent, after.Status);
            Assert.Equal(0m, after.RecoveredAmount);
            Assert.Empty(after.Recoveries);
            Assert.Equal(before.History.Count, after.History.Count);
            Assert.Equal(before.RowVersion, after.RowVersion);

            // The untouched row version is still good for a valid recovery.
            Recover(id, 100.00m, RecoveryMethod.Check, "CHK-10", TakebackStatus.PartiallyRecovered);
            Assert.Equal(100.00m, _takebacks.GetById(id).RecoveredAmount);
        }

        [SqlFact]
        public void AddRecovery_with_a_zero_amount_is_rejected_and_rolled_back()
        {
            int id = CreateNoticeSent();
            Takeback before = _takebacks.GetById(id);

            SqlException exception = Assert.Throws<SqlException>(
                () => _takebacks.AddRecovery(NewRecovery(id, 0m, RecoveryMethod.Check, "CHK-0"), TakebackStatus.PartiallyRecovered, before.RowVersion, SampleUsers.Alex));
            Takeback after = _takebacks.GetById(id);

            Assert.Equal(ConstraintViolation, exception.Number);
            Assert.Empty(after.Recoveries);
            Assert.Equal(TakebackStatus.NoticeSent, after.Status);
            Assert.Equal(before.History.Count, after.History.Count);
        }

        [SqlFact]
        public void AddRecovery_with_a_stale_row_version_throws_ConcurrencyException_and_inserts_nothing()
        {
            int id = CreateNoticeSent();
            byte[] stale = _takebacks.GetById(id).RowVersion;
            Recover(id, 100.00m, RecoveryMethod.Check, "CHK-1", TakebackStatus.PartiallyRecovered);

            Assert.Throws<ConcurrencyException>(
                () => _takebacks.AddRecovery(NewRecovery(id, 50.00m, RecoveryMethod.Check, "CHK-2"), TakebackStatus.PartiallyRecovered, stale, SampleUsers.Alex));
            Assert.Throws<ConcurrencyException>(
                () => _takebacks.AddRecovery(NewRecovery(id, 50.00m, RecoveryMethod.Check, "CHK-3"), TakebackStatus.PartiallyRecovered, null, SampleUsers.Alex));

            Takeback after = _takebacks.GetById(id);
            Assert.Equal(100.00m, after.RecoveredAmount);
            Assert.Single(after.Recoveries);
        }

        [SqlFact]
        public void AddRecovery_to_a_missing_takeback_throws_NotFoundException()
        {
            NotFoundException exception = Assert.Throws<NotFoundException>(
                () => _takebacks.AddRecovery(NewRecovery(999999, 10.00m, RecoveryMethod.Check, "CHK-1"), TakebackStatus.PartiallyRecovered, new byte[8], SampleUsers.Alex));

            Assert.Equal("Takeback", exception.EntityName);
        }

        // ---- ActiveTakebackExists ---------------------------------------------------------------------------------

        [SqlFact]
        public void ActiveTakebackExists_finds_takebacks_of_the_same_claim_and_provider_until_they_are_rejected_or_cancelled()
        {
            Takeback input = NewTakeback();
            int id = _takebacks.Insert(input, SampleUsers.Jamie);

            Assert.True(_takebacks.ActiveTakebackExists(input.ClaimNumber, _providerId, 0));
            Assert.True(_takebacks.ActiveTakebackExists(input.ClaimNumber.ToLowerInvariant(), _providerId, 0));
            Assert.False(_takebacks.ActiveTakebackExists(input.ClaimNumber, _providerId, id));
            Assert.False(_takebacks.ActiveTakebackExists(input.ClaimNumber, _otherProviderId, 0));
            Assert.False(_takebacks.ActiveTakebackExists(input.ClaimNumber + "X", _providerId, 0));

            Move(id, TakebackStatus.PendingApproval, TakebackActions.Submit, SampleUsers.Jamie);
            Assert.True(_takebacks.ActiveTakebackExists(input.ClaimNumber, _providerId, 0));

            Move(id, TakebackStatus.Rejected, TakebackActions.Reject, SampleUsers.Blake, "Not supported");
            Assert.False(_takebacks.ActiveTakebackExists(input.ClaimNumber, _providerId, 0));

            Move(id, TakebackStatus.Cancelled, TakebackActions.Cancel, SampleUsers.Jamie, "Withdrawn");
            Assert.False(_takebacks.ActiveTakebackExists(input.ClaimNumber, _providerId, 0));

            Takeback replacement = NewTakeback();
            replacement.ClaimNumber = input.ClaimNumber;
            int replacementId = _takebacks.Insert(replacement, SampleUsers.Jamie);

            // The replacement is active; the cancelled original no longer counts, so excluding the replacement leaves nothing.
            Assert.True(_takebacks.ActiveTakebackExists(input.ClaimNumber, _providerId, id));
            Assert.False(_takebacks.ActiveTakebackExists(input.ClaimNumber, _providerId, replacementId));
        }

        // ---- helpers ----------------------------------------------------------------------------------------------

        private Takeback NewTakeback()
        {
            return new Takeback
            {
                ClaimNumber = "WT-" + Guid.NewGuid().ToString("N").Substring(0, 12).ToUpperInvariant(),
                MemberId = _memberId,
                ProviderId = _providerId,
                Reason = TakebackReason.DuplicatePayment,
                DateOfService = _db.Database.ServerToday().AddDays(-60),
                OriginalPaidAmount = 1500.00m,
                TakebackAmount = 1200.00m,
                OtherCarrierName = "Contoso Health",
                OtherPolicyNumber = "POL-7788",
                Notes = "Paid twice."
            };
        }

        private static TakebackStatusChange StatusChange(int id, TakebackStatus status, string action, byte[] rowVersion)
        {
            return new TakebackStatusChange { TakebackId = id, NewStatus = status, Action = action, RowVersion = rowVersion };
        }

        private TakebackRecovery NewRecovery(int takebackId, decimal amount, RecoveryMethod method, string reference)
        {
            return new TakebackRecovery
            {
                TakebackId = takebackId,
                Amount = amount,
                RecoveryDate = _db.Database.ServerToday(),
                Method = method,
                ReferenceNumber = reference
            };
        }

        // Reads the current row version first, exactly like a business-layer call that has just loaded the takeback.
        private Takeback Move(
            int id,
            TakebackStatus status,
            string action,
            int userId,
            string comment = null,
            int? approvedBy = null,
            DateTime? approvedDate = null,
            DateTime? noticeDate = null,
            DateTime? dueDate = null)
        {
            TakebackStatusChange change = StatusChange(id, status, action, _takebacks.GetById(id).RowVersion);
            change.Comment = comment;
            change.ApprovedByUserId = approvedBy;
            change.ApprovedDate = approvedDate;
            change.NoticeDate = noticeDate;
            change.DueDate = dueDate;
            _takebacks.ChangeStatus(change, userId);
            return _takebacks.GetById(id);
        }

        private void Recover(int id, decimal amount, RecoveryMethod method, string reference, TakebackStatus newStatus)
        {
            _takebacks.AddRecovery(NewRecovery(id, amount, method, reference), newStatus, _takebacks.GetById(id).RowVersion, SampleUsers.Alex);
        }

        private int CreateNoticeSent()
        {
            DateTime today = _db.Database.ServerToday();
            int id = _takebacks.Insert(NewTakeback(), SampleUsers.Jamie);
            Move(id, TakebackStatus.PendingApproval, TakebackActions.Submit, SampleUsers.Jamie);
            Move(id, TakebackStatus.Approved, TakebackActions.Approve, SampleUsers.Blake, null, approvedBy: SampleUsers.Blake, approvedDate: DateTime.UtcNow);
            Move(id, TakebackStatus.NoticeSent, TakebackActions.SendNotice, SampleUsers.Jamie, null, noticeDate: today, dueDate: today.AddDays(30));
            return id;
        }

        private int CountByClaim(string claimNumber)
        {
            return _db.Database.Scalar<int>("SELECT COUNT(*) FROM dbo.Takeback WHERE ClaimNumber = N'" + claimNumber.Replace("'", "''") + "'");
        }

        // Timestamps are written by the database (SYSUTCDATETIME); they must be UTC and close to the server's clock.
        private void AssertJustNow(DateTime utc)
        {
            Assert.Equal(DateTimeKind.Utc, utc.Kind);
            Assert.True(Math.Abs((utc - _db.Database.ServerUtcNow()).TotalSeconds) < 120, "Timestamp " + utc.ToString("o") + " is not close to the server's UTC time.");
        }
    }
}
