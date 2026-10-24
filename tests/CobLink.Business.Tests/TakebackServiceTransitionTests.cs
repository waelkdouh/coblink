using System;
using System.Linq;
using CobLink.Models;
using CobLink.TestSupport;
using Xunit;

namespace CobLink.Business.Tests
{
    public class TakebackServiceTransitionTests
    {
        private readonly TestWorld _world = new TestWorld();

        private static TakebackActionRequest Request(Takeback takeback, string comment = null)
        {
            return new TakebackActionRequest
            {
                TakebackId = takeback.TakebackId,
                RowVersion = takeback.RowVersion,
                Comment = comment
            };
        }

        private static void AssertError(ValidationFailedException exception, string field)
        {
            Assert.Contains(exception.Errors, e => e.Field == field);
        }

        // ---- Submit ----

        [Theory]
        [InlineData(TakebackStatus.Draft)]
        [InlineData(TakebackStatus.Rejected)]
        public void Submit_moves_a_draft_or_rejected_takeback_to_pending_approval(TakebackStatus status)
        {
            Takeback takeback = _world.SeedTakeback(status);

            Takeback submitted = _world.TakebackService.Submit(Request(takeback, "Ready for review"));

            Assert.Equal(TakebackStatus.PendingApproval, submitted.Status);
            TakebackHistoryEntry entry = submitted.History.Last();
            Assert.Equal(TakebackActions.Submit, entry.Action);
            Assert.Equal(TakebackStatus.PendingApproval, entry.ToStatus);
            Assert.Equal("Ready for review", entry.Comment);
            Assert.Equal(TestUsers.Jamie, entry.ChangedByUserId);
        }

        [Fact]
        public void Submit_checks_the_saved_data_again()
        {
            Takeback takeback = _world.SeedTakeback(customize: t => t.TakebackAmount = t.OriginalPaidAmount + 1m);

            var exception = Assert.Throws<ValidationFailedException>(() => _world.TakebackService.Submit(Request(takeback)));

            AssertError(exception, "takebackAmount");
            Assert.Equal(TakebackStatus.Draft, _world.TakebackService.GetById(takeback.TakebackId).Status);
        }

        [Fact]
        public void Submit_by_an_analyst_who_did_not_create_the_takeback_is_forbidden()
        {
            Takeback takeback = _world.SeedTakeback();
            _world.SignIn(TestUsers.Alex);

            Assert.Throws<ForbiddenException>(() => _world.TakebackService.Submit(Request(takeback)));
        }

        [Fact]
        public void Submit_by_a_supervisor_is_allowed()
        {
            Takeback takeback = _world.SeedTakeback();
            _world.SignIn(TestUsers.Blake);

            Assert.Equal(TakebackStatus.PendingApproval, _world.TakebackService.Submit(Request(takeback)).Status);
        }

        [Fact]
        public void Submit_of_a_takeback_that_is_already_pending_is_a_business_rule_error()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.PendingApproval);

            Assert.Throws<BusinessRuleException>(() => _world.TakebackService.Submit(Request(takeback)));
        }

        // ---- Approve / Reject ----

        [Fact]
        public void Approve_by_a_supervisor_stamps_the_approver_and_date()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.PendingApproval);
            _world.SignIn(TestUsers.Blake);

            Takeback approved = _world.TakebackService.Approve(Request(takeback));

            Assert.Equal(TakebackStatus.Approved, approved.Status);
            Assert.Equal(TestUsers.Blake, approved.ApprovedByUserId);
            Assert.Equal("Blake Wilson", approved.ApprovedByName);
            Assert.Equal(_world.Clock.UtcNow, approved.ApprovedDate);
            Assert.Equal(
                new[] { TakebackActions.SendNotice, TakebackActions.Cancel },
                approved.AvailableActions.ToArray());
        }

        [Fact]
        public void Approve_by_an_analyst_is_forbidden()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.PendingApproval);
            _world.SignIn(TestUsers.Alex);

            Assert.Throws<ForbiddenException>(() => _world.TakebackService.Approve(Request(takeback)));
        }

        [Theory]
        [InlineData(TestUsers.Blake)]
        [InlineData(TestUsers.Casey)]
        public void Approve_and_reject_by_the_creator_are_forbidden(int creatorId)
        {
            Takeback takeback = _world.SeedTakeback(
                TakebackStatus.PendingApproval,
                t => t.CreatedByUserId = creatorId);
            _world.SignIn(creatorId);

            Assert.Throws<ForbiddenException>(() => _world.TakebackService.Approve(Request(takeback)));
            Assert.Throws<ForbiddenException>(() => _world.TakebackService.Reject(Request(takeback, "No")));
            Assert.DoesNotContain(TakebackActions.Approve, _world.TakebackService.GetById(takeback.TakebackId).AvailableActions);
        }

        [Fact]
        public void Approve_of_a_high_value_takeback_needs_an_administrator()
        {
            Takeback takeback = _world.SeedTakeback(
                TakebackStatus.PendingApproval,
                t =>
                {
                    t.OriginalPaidAmount = 40000m;
                    t.TakebackAmount = 25000.01m;
                });

            _world.SignIn(TestUsers.Blake);
            Assert.Throws<ForbiddenException>(() => _world.TakebackService.Approve(Request(takeback)));
            Assert.DoesNotContain(TakebackActions.Approve, _world.TakebackService.GetById(takeback.TakebackId).AvailableActions);

            _world.SignIn(TestUsers.Casey);
            Takeback approved = _world.TakebackService.Approve(Request(takeback));
            Assert.Equal(TakebackStatus.Approved, approved.Status);
            Assert.Equal(TestUsers.Casey, approved.ApprovedByUserId);
        }

        [Fact]
        public void Approve_of_a_takeback_exactly_at_the_threshold_does_not_need_an_administrator()
        {
            Takeback takeback = _world.SeedTakeback(
                TakebackStatus.PendingApproval,
                t =>
                {
                    t.OriginalPaidAmount = 30000m;
                    t.TakebackAmount = 25000m;
                });
            _world.SignIn(TestUsers.Blake);

            Assert.Equal(TakebackStatus.Approved, _world.TakebackService.Approve(Request(takeback)).Status);
        }

        [Fact]
        public void The_high_value_threshold_comes_from_the_options()
        {
            _world.Options.HighValueThreshold = 500m;
            Takeback takeback = _world.SeedTakeback(TakebackStatus.PendingApproval);
            _world.SignIn(TestUsers.Blake);

            Assert.Throws<ForbiddenException>(() => _world.TakebackService.Approve(Request(takeback)));
        }

        [Theory]
        [InlineData(TakebackStatus.Draft)]
        [InlineData(TakebackStatus.Approved)]
        [InlineData(TakebackStatus.Rejected)]
        [InlineData(TakebackStatus.NoticeSent)]
        public void Approve_and_reject_need_a_pending_takeback(TakebackStatus status)
        {
            Takeback takeback = _world.SeedTakeback(status);
            _world.SignIn(TestUsers.Blake);

            Assert.Throws<BusinessRuleException>(() => _world.TakebackService.Approve(Request(takeback)));
            Assert.Throws<BusinessRuleException>(() => _world.TakebackService.Reject(Request(takeback, "No")));
        }

        [Fact]
        public void Reject_needs_a_comment_and_returns_the_takeback_to_its_creator()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.PendingApproval);
            _world.SignIn(TestUsers.Blake);

            AssertError(
                Assert.Throws<ValidationFailedException>(() => _world.TakebackService.Reject(Request(takeback, "  "))),
                "comment");

            Takeback rejected = _world.TakebackService.Reject(Request(takeback, "Missing proof of other coverage"));

            Assert.Equal(TakebackStatus.Rejected, rejected.Status);
            Assert.Null(rejected.ApprovedByUserId);
            Assert.Equal("Missing proof of other coverage", rejected.History.Last().Comment);

            _world.SignIn(TestUsers.Jamie);
            Assert.Equal(
                new[] { TakebackActions.Edit, TakebackActions.Submit, TakebackActions.Cancel },
                _world.TakebackService.GetById(takeback.TakebackId).AvailableActions.ToArray());
        }

        // ---- SendNotice ----

        [Fact]
        public void SendNotice_sets_the_notice_date_to_today_and_the_due_date_to_the_end_of_the_response_window()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.Approved);

            Takeback sent = _world.TakebackService.SendNotice(Request(takeback));

            Assert.Equal(TakebackStatus.NoticeSent, sent.Status);
            Assert.Equal(new DateTime(2025, 3, 14), sent.NoticeDate);
            Assert.Equal(new DateTime(2025, 4, 13), sent.DueDate);
            Assert.False(sent.IsOverdue);

            // Jamie is an analyst: writing off needs a supervisor.
            Assert.Equal(
                new[] { TakebackActions.RecordRecovery, TakebackActions.Dispute },
                sent.AvailableActions.ToArray());
            _world.SignIn(TestUsers.Blake);
            Assert.Equal(
                new[] { TakebackActions.RecordRecovery, TakebackActions.Dispute, TakebackActions.WriteOff },
                _world.TakebackService.GetById(sent.TakebackId).AvailableActions.ToArray());
        }

        [Fact]
        public void The_response_window_comes_from_the_options()
        {
            _world.Options.ResponseWindowDays = 10;
            Takeback takeback = _world.SeedTakeback(TakebackStatus.Approved);

            Takeback sent = _world.TakebackService.SendNotice(Request(takeback));

            Assert.Equal(new DateTime(2025, 3, 24), sent.DueDate);
        }

        [Fact]
        public void SendNotice_is_open_to_any_registered_user_but_only_for_approved_takebacks()
        {
            Takeback approved = _world.SeedTakeback(TakebackStatus.Approved);
            Takeback pending = _world.SeedTakeback(TakebackStatus.PendingApproval);
            _world.SignIn(TestUsers.Alex);

            Assert.Equal(TakebackStatus.NoticeSent, _world.TakebackService.SendNotice(Request(approved)).Status);
            Assert.Throws<BusinessRuleException>(() => _world.TakebackService.SendNotice(Request(pending)));
        }

        [Fact]
        public void A_takeback_becomes_overdue_when_the_due_date_passes()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.Approved);
            Takeback sent = _world.TakebackService.SendNotice(Request(takeback));

            _world.Clock.AdvanceDays(30);
            Assert.False(_world.TakebackService.GetById(sent.TakebackId).IsOverdue);

            _world.Clock.AdvanceDays(1);
            Assert.True(_world.TakebackService.GetById(sent.TakebackId).IsOverdue);
        }

        // ---- Dispute / ResolveDispute ----

        [Theory]
        [InlineData(TakebackStatus.NoticeSent)]
        [InlineData(TakebackStatus.PartiallyRecovered)]
        public void Dispute_needs_a_comment_and_moves_the_takeback_to_disputed(TakebackStatus status)
        {
            Takeback takeback = _world.SeedTakeback(status);
            _world.SignIn(TestUsers.Alex);

            AssertError(
                Assert.Throws<ValidationFailedException>(() => _world.TakebackService.Dispute(Request(takeback))),
                "comment");

            Takeback disputed = _world.TakebackService.Dispute(Request(takeback, "Provider says it was billed correctly"));

            Assert.Equal(TakebackStatus.Disputed, disputed.Status);
            Assert.Equal(status, disputed.History.Last().FromStatus);

            // Alex is an analyst: resolving or writing off a dispute needs a supervisor.
            Assert.Empty(disputed.AvailableActions);
            _world.SignIn(TestUsers.Blake);
            Assert.Equal(
                new[] { TakebackActions.ResolveDispute, TakebackActions.WriteOff },
                _world.TakebackService.GetById(disputed.TakebackId).AvailableActions.ToArray());
        }

        [Theory]
        [InlineData(TakebackStatus.Approved)]
        [InlineData(TakebackStatus.Disputed)]
        [InlineData(TakebackStatus.Recovered)]
        public void Dispute_needs_a_notice_that_is_still_open(TakebackStatus status)
        {
            Takeback takeback = _world.SeedTakeback(status);

            Assert.Throws<BusinessRuleException>(() => _world.TakebackService.Dispute(Request(takeback, "No")));
        }

        [Fact]
        public void ResolveDispute_upheld_resumes_collection_with_a_new_response_window()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.Disputed);
            _world.SignIn(TestUsers.Blake);

            Takeback resolved = _world.TakebackService.ResolveDispute(new ResolveDisputeRequest
            {
                TakebackId = takeback.TakebackId,
                RowVersion = takeback.RowVersion,
                Comment = "Documents confirm the other carrier is primary",
                Upheld = true
            });

            Assert.Equal(TakebackStatus.NoticeSent, resolved.Status);
            Assert.Equal(_world.Clock.Today.AddDays(30), resolved.DueDate);
            Assert.Equal(
                "Dispute upheld. Documents confirm the other carrier is primary",
                resolved.History.Last().Comment);
        }

        [Fact]
        public void ResolveDispute_upheld_returns_to_partially_recovered_when_money_was_already_recovered()
        {
            Takeback takeback = _world.SeedTakeback(
                TakebackStatus.Disputed,
                t => t.RecoveredAmount = 300m);
            _world.SignIn(TestUsers.Blake);

            Takeback resolved = _world.TakebackService.ResolveDispute(new ResolveDisputeRequest
            {
                TakebackId = takeback.TakebackId,
                RowVersion = takeback.RowVersion,
                Comment = "Upheld",
                Upheld = true
            });

            Assert.Equal(TakebackStatus.PartiallyRecovered, resolved.Status);
        }

        [Fact]
        public void ResolveDispute_overturned_cancels_the_takeback()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.Disputed);
            _world.SignIn(TestUsers.Blake);

            Takeback resolved = _world.TakebackService.ResolveDispute(new ResolveDisputeRequest
            {
                TakebackId = takeback.TakebackId,
                RowVersion = takeback.RowVersion,
                Comment = "Provider is right",
                Upheld = false
            });

            Assert.Equal(TakebackStatus.Cancelled, resolved.Status);
            Assert.Equal("Dispute overturned. Provider is right", resolved.History.Last().Comment);
            Assert.Empty(resolved.AvailableActions);
        }

        [Fact]
        public void ResolveDispute_overturned_is_refused_once_a_recovery_has_been_recorded()
        {
            Takeback takeback = _world.SeedTakeback(
                TakebackStatus.Disputed,
                t => t.RecoveredAmount = 300m);
            _world.SignIn(TestUsers.Blake);

            var exception = Assert.Throws<BusinessRuleException>(() => _world.TakebackService.ResolveDispute(
                new ResolveDisputeRequest
                {
                    TakebackId = takeback.TakebackId,
                    RowVersion = takeback.RowVersion,
                    Comment = "Provider is right",
                    Upheld = false
                }));

            Assert.Contains("write the takeback off", exception.Message, StringComparison.OrdinalIgnoreCase);
            Assert.Equal(TakebackStatus.Disputed, _world.TakebackService.GetById(takeback.TakebackId).Status);
        }

        [Fact]
        public void ResolveDispute_needs_a_comment_a_supervisor_and_a_disputed_takeback()
        {
            Takeback disputed = _world.SeedTakeback(TakebackStatus.Disputed);
            Takeback noticeSent = _world.SeedTakeback(TakebackStatus.NoticeSent);

            _world.SignIn(TestUsers.Alex);
            Assert.Throws<ForbiddenException>(() => _world.TakebackService.ResolveDispute(
                new ResolveDisputeRequest { TakebackId = disputed.TakebackId, RowVersion = disputed.RowVersion, Comment = "x", Upheld = true }));

            _world.SignIn(TestUsers.Blake);
            Assert.Throws<ValidationFailedException>(() => _world.TakebackService.ResolveDispute(
                new ResolveDisputeRequest { TakebackId = disputed.TakebackId, RowVersion = disputed.RowVersion, Upheld = true }));
            Assert.Throws<BusinessRuleException>(() => _world.TakebackService.ResolveDispute(
                new ResolveDisputeRequest { TakebackId = noticeSent.TakebackId, RowVersion = noticeSent.RowVersion, Comment = "x", Upheld = true }));
        }

        // ---- WriteOff ----

        [Theory]
        [InlineData(TakebackStatus.NoticeSent)]
        [InlineData(TakebackStatus.PartiallyRecovered)]
        [InlineData(TakebackStatus.Disputed)]
        public void WriteOff_by_a_supervisor_closes_the_takeback(TakebackStatus status)
        {
            Takeback takeback = _world.SeedTakeback(status);
            _world.SignIn(TestUsers.Blake);

            Takeback writtenOff = _world.TakebackService.WriteOff(Request(takeback, "Provider insolvent"));

            Assert.Equal(TakebackStatus.WrittenOff, writtenOff.Status);
            Assert.Empty(writtenOff.AvailableActions);
            Assert.Equal("Provider insolvent", writtenOff.History.Last().Comment);
        }

        [Fact]
        public void WriteOff_needs_a_comment_a_supervisor_and_an_open_notice()
        {
            Takeback takeback = _world.SeedTakeback(TakebackStatus.NoticeSent);
            Takeback approved = _world.SeedTakeback(TakebackStatus.Approved);

            _world.SignIn(TestUsers.Alex);
            Assert.Throws<ForbiddenException>(() => _world.TakebackService.WriteOff(Request(takeback, "Reason")));

            _world.SignIn(TestUsers.Blake);
            Assert.Throws<ValidationFailedException>(() => _world.TakebackService.WriteOff(Request(takeback)));
            Assert.Throws<BusinessRuleException>(() => _world.TakebackService.WriteOff(Request(approved, "Reason")));
        }

        // ---- Cancel ----

        [Theory]
        [InlineData(TakebackStatus.Draft)]
        [InlineData(TakebackStatus.PendingApproval)]
        [InlineData(TakebackStatus.Approved)]
        [InlineData(TakebackStatus.Rejected)]
        public void Cancel_by_the_creator_is_possible_before_a_notice_is_sent(TakebackStatus status)
        {
            Takeback takeback = _world.SeedTakeback(status);

            Takeback cancelled = _world.TakebackService.Cancel(Request(takeback, "Raised by mistake"));

            Assert.Equal(TakebackStatus.Cancelled, cancelled.Status);
            Assert.Equal(status, cancelled.History.Last().FromStatus);
        }

        [Theory]
        [InlineData(TakebackStatus.NoticeSent)]
        [InlineData(TakebackStatus.PartiallyRecovered)]
        [InlineData(TakebackStatus.Recovered)]
        [InlineData(TakebackStatus.Disputed)]
        [InlineData(TakebackStatus.WrittenOff)]
        [InlineData(TakebackStatus.Cancelled)]
        public void Cancel_is_not_possible_after_a_notice_was_sent_or_once_closed(TakebackStatus status)
        {
            Takeback takeback = _world.SeedTakeback(status);

            Assert.Throws<BusinessRuleException>(() => _world.TakebackService.Cancel(Request(takeback, "Reason")));
        }

        [Fact]
        public void Cancel_needs_a_comment_and_the_creator_or_a_supervisor()
        {
            Takeback takeback = _world.SeedTakeback();

            Assert.Throws<ValidationFailedException>(() => _world.TakebackService.Cancel(Request(takeback)));

            _world.SignIn(TestUsers.Alex);
            Assert.Throws<ForbiddenException>(() => _world.TakebackService.Cancel(Request(takeback, "Reason")));

            _world.SignIn(TestUsers.Blake);
            Assert.Equal(TakebackStatus.Cancelled, _world.TakebackService.Cancel(Request(takeback, "Reason")).Status);
        }

        // ---- Shared behaviour of every action ----

        [Fact]
        public void Comments_are_trimmed_and_limited_in_length()
        {
            Takeback takeback = _world.SeedTakeback();

            Assert.Throws<ValidationFailedException>(() => _world.TakebackService.Cancel(
                Request(takeback, new string('x', Services.TakebackService.MaxCommentLength + 1))));

            Takeback cancelled = _world.TakebackService.Cancel(Request(takeback, "  padded  "));
            Assert.Equal("padded", cancelled.History.Last().Comment);
        }

        [Fact]
        public void Every_action_needs_the_takeback_id_and_the_row_version()
        {
            var exception = Assert.Throws<ValidationFailedException>(() => _world.TakebackService.Submit(
                new TakebackActionRequest()));

            AssertError(exception, "takebackId");
            AssertError(exception, "rowVersion");
        }

        [Fact]
        public void Every_action_on_an_unknown_takeback_is_not_found()
        {
            var request = new TakebackActionRequest { TakebackId = 999, RowVersion = new byte[8], Comment = "x" };
            _world.SignIn(TestUsers.Casey);

            Assert.Throws<NotFoundException>(() => _world.TakebackService.Submit(request));
            Assert.Throws<NotFoundException>(() => _world.TakebackService.Approve(request));
            Assert.Throws<NotFoundException>(() => _world.TakebackService.Reject(request));
            Assert.Throws<NotFoundException>(() => _world.TakebackService.SendNotice(request));
            Assert.Throws<NotFoundException>(() => _world.TakebackService.Dispute(request));
            Assert.Throws<NotFoundException>(() => _world.TakebackService.WriteOff(request));
            Assert.Throws<NotFoundException>(() => _world.TakebackService.Cancel(request));
        }

        [Fact]
        public void An_action_with_an_outdated_row_version_is_a_concurrency_error()
        {
            Takeback takeback = _world.SeedTakeback();
            _world.TakebackService.Save(new SaveTakebackRequest
            {
                TakebackId = takeback.TakebackId,
                RowVersion = takeback.RowVersion,
                ClaimNumber = takeback.ClaimNumber,
                MemberId = takeback.MemberId,
                ProviderId = takeback.ProviderId,
                Reason = takeback.Reason,
                DateOfService = takeback.DateOfService,
                OriginalPaidAmount = takeback.OriginalPaidAmount,
                TakebackAmount = takeback.TakebackAmount,
                OtherCarrierName = takeback.OtherCarrierName,
                Notes = "Edited by someone else"
            });

            Assert.Throws<ConcurrencyException>(() => _world.TakebackService.Submit(Request(takeback)));
            Assert.Equal(TakebackStatus.Draft, _world.TakebackService.GetById(takeback.TakebackId).Status);
        }

        [Fact]
        public void Forbidden_is_reported_before_a_wrong_state()
        {
            Takeback approved = _world.SeedTakeback(TakebackStatus.Approved);
            _world.SignIn(TestUsers.Alex);

            // Alex may not approve at all; that is reported even though the takeback is not pending.
            Assert.Throws<ForbiddenException>(() => _world.TakebackService.Approve(Request(approved)));
        }

        [Fact]
        public void Every_action_needs_a_registered_user()
        {
            Takeback takeback = _world.SeedTakeback();
            _world.SignOut();

            Assert.Throws<ForbiddenException>(() => _world.TakebackService.Submit(Request(takeback)));
            Assert.Throws<ForbiddenException>(() => _world.TakebackService.Cancel(Request(takeback, "x")));
            Assert.Throws<ForbiddenException>(() => _world.TakebackService.Search(new TakebackSearchRequest()));
            Assert.Throws<ForbiddenException>(() => _world.TakebackService.RecordRecovery(new RecordRecoveryRequest()));
        }
    }
}
