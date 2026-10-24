using System;
using System.Linq;
using CobLink.Models;
using CobLink.TestSupport;
using Xunit;

namespace CobLink.Business.Tests
{
    /// <summary>One story that walks a takeback through its whole life with three different people.</summary>
    public class TakebackLifecycleTests
    {
        private readonly TestWorld _world = new TestWorld();

        [Fact]
        public void A_takeback_goes_from_draft_to_fully_recovered_via_a_dispute()
        {
            // Jamie (analyst) drafts and submits.
            _world.SignIn(TestUsers.Jamie);
            Takeback takeback = _world.TakebackService.Save(new SaveTakebackRequest
            {
                ClaimNumber = "CLM-900100",
                MemberId = TestReference.MemberMia,
                ProviderId = TestReference.ProviderLakeview,
                Reason = TakebackReason.MedicarePrimary,
                DateOfService = _world.Clock.Today.AddDays(-90),
                OriginalPaidAmount = 2500m,
                TakebackAmount = 2000m,
                Notes = "Member is Medicare primary."
            });
            takeback = _world.TakebackService.Submit(Action(takeback));
            Assert.Equal(TakebackStatus.PendingApproval, takeback.Status);

            // The creator cannot approve their own takeback.
            Assert.Throws<ForbiddenException>(() => _world.TakebackService.Approve(Action(takeback)));

            // Blake (supervisor) approves and sends the notice.
            _world.SignIn(TestUsers.Blake);
            takeback = _world.TakebackService.Approve(Action(takeback));
            Assert.Equal(TakebackStatus.Approved, takeback.Status);
            Assert.Equal(TestUsers.Blake, takeback.ApprovedByUserId);

            takeback = _world.TakebackService.SendNotice(Action(takeback));
            Assert.Equal(TakebackStatus.NoticeSent, takeback.Status);
            Assert.Equal(_world.Clock.Today, takeback.NoticeDate);
            Assert.Equal(_world.Clock.Today.AddDays(30), takeback.DueDate);

            // Jamie records a partial recovery and follows up with an activity.
            _world.SignIn(TestUsers.Jamie);
            takeback = _world.TakebackService.RecordRecovery(Recovery(takeback, 500m, "CHK-1"));
            Assert.Equal(TakebackStatus.PartiallyRecovered, takeback.Status);
            Assert.Equal(500m, takeback.RecoveredAmount);
            Assert.Equal(1500m, takeback.OutstandingAmount);

            Activity followUp = _world.ActivityService.Save(new SaveActivityRequest
            {
                TakebackId = takeback.TakebackId,
                ActivityType = ActivityType.PhoneCall,
                Priority = ActivityPriority.High,
                Subject = "Call Lakeview about the balance",
                AssignedToUserId = TestUsers.Jamie,
                DueDate = _world.Clock.Today.AddDays(2)
            });
            Assert.Equal(TestReference.MemberMia, followUp.MemberId);

            takeback = _world.TakebackService.GetById(takeback.TakebackId);
            Assert.Equal(new[] { followUp.ActivityId }, takeback.LinkedActivities.Select(a => a.ActivityId).ToArray());

            // The provider disputes; Blake upholds the takeback.
            takeback = _world.TakebackService.Dispute(Action(takeback, "Provider says the claim was correct."));
            Assert.Equal(TakebackStatus.Disputed, takeback.Status);

            _world.SignIn(TestUsers.Blake);
            _world.Clock.AdvanceDays(10);
            takeback = _world.TakebackService.ResolveDispute(new ResolveDisputeRequest
            {
                TakebackId = takeback.TakebackId,
                RowVersion = takeback.RowVersion,
                Upheld = true,
                Comment = "Medicare eligibility confirmed."
            });
            Assert.Equal(TakebackStatus.PartiallyRecovered, takeback.Status);
            Assert.Equal(_world.Clock.Today.AddDays(30), takeback.DueDate);

            // The rest arrives by EFT.
            _world.SignIn(TestUsers.Jamie);
            takeback = _world.TakebackService.RecordRecovery(Recovery(takeback, 1500m, "EFT-77", RecoveryMethod.Eft));
            Assert.Equal(TakebackStatus.Recovered, takeback.Status);
            Assert.Equal(0m, takeback.OutstandingAmount);
            Assert.Empty(takeback.AvailableActions);

            Assert.Equal(2, takeback.Recoveries.Count);
            Assert.Equal(
                new[]
                {
                    TakebackActions.Create, TakebackActions.Submit, TakebackActions.Approve, TakebackActions.SendNotice,
                    TakebackActions.RecordRecovery, TakebackActions.Dispute, TakebackActions.ResolveDispute,
                    TakebackActions.RecordRecovery
                },
                takeback.History.OrderBy(h => h.HistoryId).Select(h => h.Action).ToArray());
        }

        [Fact]
        public void A_rejected_takeback_can_be_corrected_and_resubmitted()
        {
            _world.SignIn(TestUsers.Jamie);
            Takeback takeback = _world.SeedTakeback(TakebackStatus.Draft);
            takeback = _world.TakebackService.Submit(Action(takeback));

            _world.SignIn(TestUsers.Blake);
            takeback = _world.TakebackService.Reject(Action(takeback, "Amount does not match the EOB."));
            Assert.Equal(TakebackStatus.Rejected, takeback.Status);

            _world.SignIn(TestUsers.Jamie);
            Assert.Contains(TakebackActions.Edit, takeback.AvailableActions);
            SaveTakebackRequest correction = SaveRequest(takeback);
            correction.TakebackAmount = 1100m;
            takeback = _world.TakebackService.Save(correction);
            takeback = _world.TakebackService.Submit(Action(takeback));

            Assert.Equal(TakebackStatus.PendingApproval, takeback.Status);
            Assert.Equal(1100m, takeback.TakebackAmount);
        }

        [Fact]
        public void A_stale_copy_of_a_takeback_cannot_overwrite_a_newer_change()
        {
            _world.SignIn(TestUsers.Jamie);
            Takeback takeback = _world.SeedTakeback(TakebackStatus.Draft);
            byte[] original = takeback.RowVersion;

            SaveTakebackRequest edit = SaveRequest(takeback);
            edit.Notes = "Corrected after the call.";
            Takeback edited = _world.TakebackService.Save(edit);
            Assert.NotEqual(original, edited.RowVersion);

            // A second user still holding the old copy tries to submit it.
            _world.SignIn(TestUsers.Blake);
            var stale = new TakebackActionRequest { TakebackId = takeback.TakebackId, RowVersion = original };

            Assert.Throws<ConcurrencyException>(() => _world.TakebackService.Submit(stale));
            Assert.Equal(TakebackStatus.Draft, _world.TakebackService.GetById(takeback.TakebackId).Status);
        }

        [Fact]
        public void A_cancelled_takeback_refuses_further_actions_even_from_a_stale_copy()
        {
            _world.SignIn(TestUsers.Jamie);
            Takeback takeback = _world.SeedTakeback(TakebackStatus.Draft);

            _world.TakebackService.Cancel(Action(takeback, "Duplicate."));

            _world.SignIn(TestUsers.Blake);
            Assert.Throws<BusinessRuleException>(() => _world.TakebackService.Submit(Action(takeback)));
        }

        private static SaveTakebackRequest SaveRequest(Takeback takeback)
        {
            return new SaveTakebackRequest
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
                OtherPolicyNumber = takeback.OtherPolicyNumber,
                Notes = takeback.Notes
            };
        }

        private static TakebackActionRequest Action(Takeback takeback, string comment = null)
        {
            return new TakebackActionRequest
            {
                TakebackId = takeback.TakebackId,
                RowVersion = takeback.RowVersion,
                Comment = comment
            };
        }

        private RecordRecoveryRequest Recovery(Takeback takeback, decimal amount, string reference, RecoveryMethod method = RecoveryMethod.Check)
        {
            return new RecordRecoveryRequest
            {
                TakebackId = takeback.TakebackId,
                RowVersion = takeback.RowVersion,
                Amount = amount,
                Method = method,
                RecoveryDate = _world.Clock.Today,
                ReferenceNumber = reference
            };
        }
    }
}
