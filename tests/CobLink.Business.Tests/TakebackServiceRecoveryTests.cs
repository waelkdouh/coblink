using System;
using System.Linq;
using CobLink.Models;
using CobLink.TestSupport;
using Xunit;

namespace CobLink.Business.Tests
{
    public class TakebackServiceRecoveryTests
    {
        private readonly TestWorld _world = new TestWorld();

        private RecordRecoveryRequest Recovery(Takeback takeback, Action<RecordRecoveryRequest> customize = null)
        {
            var request = new RecordRecoveryRequest
            {
                TakebackId = takeback.TakebackId,
                RowVersion = takeback.RowVersion,
                Amount = 500m,
                RecoveryDate = _world.Clock.Today,
                Method = RecoveryMethod.Check,
                ReferenceNumber = "CHK-4411",
                Notes = "Received in the mail."
            };

            if (customize != null)
            {
                customize(request);
            }

            return request;
        }

        private static void AssertError(ValidationFailedException exception, string field)
        {
            Assert.Contains(exception.Errors, e => e.Field == field);
        }

        private ValidationFailedException Invalid(Takeback takeback, Action<RecordRecoveryRequest> customize)
        {
            return Assert.Throws<ValidationFailedException>(
                () => _world.TakebackService.RecordRecovery(Recovery(takeback, customize)));
        }

        [Fact]
        public void A_partial_recovery_reduces_the_outstanding_amount_and_moves_to_partially_recovered()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.NoticeSent);

            Takeback updated = _world.TakebackService.RecordRecovery(Recovery(takeback));

            Assert.Equal(TakebackStatus.PartiallyRecovered, updated.Status);
            Assert.Equal(500m, updated.RecoveredAmount);
            Assert.Equal(700m, updated.OutstandingAmount);

            TakebackRecovery recovery = Assert.Single(updated.Recoveries);
            Assert.Equal(500m, recovery.Amount);
            Assert.Equal(RecoveryMethod.Check, recovery.Method);
            Assert.Equal("CHK-4411", recovery.ReferenceNumber);
            Assert.Equal("Received in the mail.", recovery.Notes);
            Assert.Equal(_world.Clock.Today, recovery.RecoveryDate);
            Assert.Equal("Jamie Doe", recovery.CreatedByName);

            TakebackHistoryEntry entry = updated.History.Last();
            Assert.Equal(TakebackActions.RecordRecovery, entry.Action);
            Assert.Equal(TakebackStatus.NoticeSent, entry.FromStatus);
            Assert.Equal(TakebackStatus.PartiallyRecovered, entry.ToStatus);
        }

        [Fact]
        public void Recovering_the_full_outstanding_amount_moves_to_recovered()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.NoticeSent);

            Takeback updated = _world.TakebackService.RecordRecovery(Recovery(takeback, r => r.Amount = 1200m));

            Assert.Equal(TakebackStatus.Recovered, updated.Status);
            Assert.Equal(0m, updated.OutstandingAmount);
            Assert.Empty(updated.AvailableActions);
        }

        [Fact]
        public void Recoveries_can_be_recorded_in_several_steps()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.NoticeSent);

            Takeback first = _world.TakebackService.RecordRecovery(Recovery(takeback, r => r.Amount = 200.50m));
            Takeback second = _world.TakebackService.RecordRecovery(Recovery(first, r =>
            {
                r.Amount = 300m;
                r.Method = RecoveryMethod.Eft;
                r.ReferenceNumber = "EFT-9";
            }));
            Takeback third = _world.TakebackService.RecordRecovery(Recovery(second, r =>
            {
                r.Amount = 699.50m;
                r.Method = RecoveryMethod.Offset;
                r.ReferenceNumber = null;
            }));

            Assert.Equal(TakebackStatus.PartiallyRecovered, second.Status);
            Assert.Equal(TakebackStatus.Recovered, third.Status);
            Assert.Equal(1200m, third.RecoveredAmount);
            Assert.Equal(
                new[] { 200.50m, 300m, 699.50m },
                third.Recoveries.Select(r => r.Amount).ToArray());
        }

        [Fact]
        public void Recording_a_recovery_on_a_partially_recovered_takeback_is_allowed()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.PartiallyRecovered);

            Takeback updated = _world.TakebackService.RecordRecovery(Recovery(takeback, r => r.Amount = 800m));

            Assert.Equal(TakebackStatus.Recovered, updated.Status);
            Assert.Equal(2, updated.Recoveries.Count);
        }

        [Fact]
        public void A_recovery_cannot_exceed_the_outstanding_amount()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.NoticeSent);

            ValidationFailedException exception = Invalid(takeback, r => r.Amount = 1200.01m);

            AssertError(exception, "amount");
            Takeback stored = _world.TakebackService.GetById(takeback.TakebackId);
            Assert.Equal(0m, stored.RecoveredAmount);
            Assert.Empty(stored.Recoveries);
        }

        [Theory]
        [InlineData(0)]
        [InlineData(-10)]
        public void A_recovery_amount_must_be_positive(double amount)
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.NoticeSent);

            AssertError(Invalid(takeback, r => r.Amount = (decimal)amount), "amount");
        }

        [Fact]
        public void A_recovery_amount_can_have_at_most_two_decimals()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.NoticeSent);

            AssertError(Invalid(takeback, r => r.Amount = 10.005m), "amount");
        }

        [Fact]
        public void A_recovery_amount_above_the_maximum_is_a_field_error()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.NoticeSent);

            AssertError(Invalid(takeback, r => r.Amount = Services.TakebackService.MaxAmount + 0.01m), "amount");
        }

        [Fact]
        public void The_recovery_date_cannot_be_in_the_future_or_before_the_notice_date()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.NoticeSent);

            AssertError(Invalid(takeback, r => r.RecoveryDate = _world.Clock.Today.AddDays(1)), "recoveryDate");
            AssertError(Invalid(takeback, r => r.RecoveryDate = takeback.NoticeDate.Value.AddDays(-1)), "recoveryDate");
            AssertError(Invalid(takeback, r => r.RecoveryDate = default(DateTime)), "recoveryDate");
        }

        [Fact]
        public void The_recovery_date_may_be_the_notice_date_or_today()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.NoticeSent);

            Takeback onNoticeDate = _world.TakebackService.RecordRecovery(
                Recovery(takeback, r => r.RecoveryDate = takeback.NoticeDate.Value));
            Takeback today = _world.TakebackService.RecordRecovery(Recovery(onNoticeDate, r => r.RecoveryDate = _world.Clock.Today));

            Assert.Equal(2, today.Recoveries.Count);
        }

        [Fact]
        public void The_recovery_date_loses_its_time_part()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.NoticeSent);

            Takeback updated = _world.TakebackService.RecordRecovery(
                Recovery(takeback, r => r.RecoveryDate = _world.Clock.Today.AddHours(9)));

            Assert.Equal(_world.Clock.Today, updated.Recoveries.Single().RecoveryDate);
        }

        [Theory]
        [InlineData(RecoveryMethod.Check)]
        [InlineData(RecoveryMethod.Eft)]
        public void Checks_and_EFTs_need_a_reference_number(RecoveryMethod method)
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.NoticeSent);

            ValidationFailedException exception = Invalid(takeback, r =>
            {
                r.Method = method;
                r.ReferenceNumber = "  ";
            });

            AssertError(exception, "referenceNumber");
        }

        [Fact]
        public void An_offset_does_not_need_a_reference_number()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.NoticeSent);

            Takeback updated = _world.TakebackService.RecordRecovery(Recovery(takeback, r =>
            {
                r.Method = RecoveryMethod.Offset;
                r.ReferenceNumber = null;
            }));

            Assert.Null(updated.Recoveries.Single().ReferenceNumber);
        }

        [Fact]
        public void An_unknown_method_and_over_long_text_are_rejected()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.NoticeSent);

            AssertError(Invalid(takeback, r => r.Method = (RecoveryMethod)99), "method");
            AssertError(
                Invalid(takeback, r => r.ReferenceNumber = new string('x', Services.TakebackService.MaxReferenceLength + 1)),
                "referenceNumber");
            AssertError(
                Invalid(takeback, r => r.Notes = new string('x', Services.TakebackService.MaxRecoveryNotesLength + 1)),
                "notes");
        }

        [Fact]
        public void The_row_version_and_takeback_id_are_required()
        {
            ValidationFailedException exception = Assert.Throws<ValidationFailedException>(
                () => _world.TakebackService.RecordRecovery(new RecordRecoveryRequest
                {
                    Amount = 10m,
                    RecoveryDate = _world.Clock.Today,
                    Method = RecoveryMethod.Offset
                }));

            AssertError(exception, "takebackId");
            AssertError(exception, "rowVersion");
        }

        [Theory]
        [InlineData(TakebackStatus.Draft)]
        [InlineData(TakebackStatus.PendingApproval)]
        [InlineData(TakebackStatus.Approved)]
        [InlineData(TakebackStatus.Rejected)]
        [InlineData(TakebackStatus.Recovered)]
        [InlineData(TakebackStatus.Disputed)]
        [InlineData(TakebackStatus.WrittenOff)]
        [InlineData(TakebackStatus.Cancelled)]
        public void Recoveries_can_only_be_recorded_after_a_notice_and_before_the_takeback_is_closed(TakebackStatus status)
        {
            Takeback takeback = _world.SeedTakeback(status);

            Assert.Throws<BusinessRuleException>(
                () => _world.TakebackService.RecordRecovery(Recovery(takeback, r => r.RecoveryDate = _world.Clock.Today.AddDays(-20))));
        }

        [Fact]
        public void Recording_a_recovery_with_an_outdated_row_version_is_a_concurrency_error()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.NoticeSent);
            _world.TakebackService.RecordRecovery(Recovery(takeback, r => r.Amount = 100m));

            Assert.Throws<ConcurrencyException>(() => _world.TakebackService.RecordRecovery(Recovery(takeback)));

            Takeback stored = _world.TakebackService.GetById(takeback.TakebackId);
            Assert.Equal(100m, stored.RecoveredAmount);
            Assert.Single(stored.Recoveries);
        }

        [Fact]
        public void Any_registered_user_can_record_a_recovery()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.NoticeSent);
            _world.SignIn(TestUsers.Alex);

            Takeback updated = _world.TakebackService.RecordRecovery(Recovery(takeback));

            Assert.Equal(TestUsers.Alex, updated.Recoveries.Single().CreatedByUserId);
        }

        [Fact]
        public void An_unknown_takeback_is_not_found()
        {
            Assert.Throws<NotFoundException>(() => _world.TakebackService.RecordRecovery(new RecordRecoveryRequest
            {
                TakebackId = 999,
                RowVersion = new byte[8],
                Amount = 10m,
                RecoveryDate = _world.Clock.Today,
                Method = RecoveryMethod.Offset
            }));
        }
    }
}
