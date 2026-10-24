using System;
using System.Linq;
using CobLink.Models;
using CobLink.TestSupport;
using Xunit;

namespace CobLink.Business.Tests
{
    public class TakebackServiceSaveTests
    {
        private readonly TestWorld _world = new TestWorld();

        private SaveTakebackRequest ValidRequest(Action<SaveTakebackRequest> customize = null)
        {
            var request = new SaveTakebackRequest
            {
                ClaimNumber = "CLM-100200",
                MemberId = TestReference.MemberAva,
                ProviderId = TestReference.ProviderRiverside,
                Reason = TakebackReason.OtherInsurancePrimary,
                DateOfService = _world.Clock.Today.AddDays(-45),
                OriginalPaidAmount = 1000m,
                TakebackAmount = 800m,
                OtherCarrierName = "Northwind Health",
                OtherPolicyNumber = "NW-1",
                Notes = "Other carrier is primary."
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

        private ValidationFailedException Invalid(Action<SaveTakebackRequest> customize)
        {
            return Assert.Throws<ValidationFailedException>(() => _world.TakebackService.Save(ValidRequest(customize)));
        }

        [Fact]
        public void Create_makes_a_draft_with_a_number_a_history_entry_and_the_creator_actions()
        {
            Takeback takeback = _world.TakebackService.Save(ValidRequest());

            Assert.Equal("TB-000001", takeback.TakebackNumber);
            Assert.Equal(TakebackStatus.Draft, takeback.Status);
            Assert.Equal(0m, takeback.RecoveredAmount);
            Assert.Equal(800m, takeback.OutstandingAmount);
            Assert.Equal("Johnson, Ava", takeback.MemberName);
            Assert.Equal("Riverside Medical Group", takeback.ProviderName);
            Assert.Equal(TestUsers.Jamie, takeback.CreatedByUserId);
            Assert.Equal("Jamie Doe", takeback.CreatedByName);
            Assert.Null(takeback.NoticeDate);
            Assert.Null(takeback.DueDate);
            Assert.False(takeback.IsOverdue);

            TakebackHistoryEntry entry = Assert.Single(takeback.History);
            Assert.Equal(TakebackActions.Create, entry.Action);
            Assert.Null(entry.FromStatus);
            Assert.Equal(TakebackStatus.Draft, entry.ToStatus);
            Assert.Equal("Jamie Doe", entry.ChangedByName);

            Assert.Equal(
                new[] { TakebackActions.Edit, TakebackActions.Submit, TakebackActions.Cancel },
                takeback.AvailableActions.ToArray());
        }

        [Fact]
        public void Create_trims_text_and_stores_blank_optional_values_as_null()
        {
            Takeback takeback = _world.TakebackService.Save(ValidRequest(r =>
            {
                r.ClaimNumber = "  CLM-7  ";
                r.OtherCarrierName = "  Northwind  ";
                r.OtherPolicyNumber = "  ";
                r.Notes = "";
            }));

            Assert.Equal("CLM-7", takeback.ClaimNumber);
            Assert.Equal("Northwind", takeback.OtherCarrierName);
            Assert.Null(takeback.OtherPolicyNumber);
            Assert.Null(takeback.Notes);
        }

        [Fact]
        public void Create_keeps_the_date_of_service_as_a_date_without_time()
        {
            DateTime dateOfService = _world.Clock.Today.AddDays(-10).AddHours(13);

            Takeback takeback = _world.TakebackService.Save(ValidRequest(r => r.DateOfService = dateOfService));

            Assert.Equal(dateOfService.Date, takeback.DateOfService);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("CLM 100")]
        [InlineData("CLM_100")]
        [InlineData("CLM/100")]
        [InlineData("CLM-1000000000000000000000000000000")]
        public void Create_rejects_an_invalid_claim_number(string claimNumber)
        {
            AssertError(Invalid(r => r.ClaimNumber = claimNumber), "claimNumber");
        }

        [Theory]
        [InlineData("1")]
        [InlineData("CLM-100")]
        [InlineData("abc-DEF-123")]
        public void Create_accepts_letters_digits_and_hyphens_in_the_claim_number(string claimNumber)
        {
            Takeback takeback = _world.TakebackService.Save(ValidRequest(r => r.ClaimNumber = claimNumber));

            Assert.Equal(claimNumber, takeback.ClaimNumber);
        }

        [Fact]
        public void Create_rejects_members_and_providers_that_are_missing_or_unknown()
        {
            AssertError(Invalid(r => r.MemberId = 0), "memberId");
            AssertError(Invalid(r => r.MemberId = 999), "memberId");
            AssertError(Invalid(r => r.ProviderId = 0), "providerId");
            AssertError(Invalid(r => r.ProviderId = 999), "providerId");
        }

        [Fact]
        public void Create_rejects_an_unknown_reason()
        {
            AssertError(Invalid(r => r.Reason = (TakebackReason)99), "reason");
        }

        [Fact]
        public void Create_rejects_a_missing_or_future_date_of_service_and_accepts_today()
        {
            AssertError(Invalid(r => r.DateOfService = default(DateTime)), "dateOfService");
            AssertError(Invalid(r => r.DateOfService = _world.Clock.Today.AddDays(1)), "dateOfService");

            Takeback takeback = _world.TakebackService.Save(ValidRequest(r => r.DateOfService = _world.Clock.Today));
            Assert.Equal(_world.Clock.Today, takeback.DateOfService);
        }

        [Theory]
        [InlineData(0, 0)]
        [InlineData(-5, 800)]
        [InlineData(1000, -1)]
        [InlineData(1000.001, 800)]
        [InlineData(1000, 800.005)]
        public void Create_rejects_amounts_that_are_not_positive_or_have_more_than_two_decimals(
            double paid,
            double takeback)
        {
            ValidationFailedException exception = Invalid(r =>
            {
                r.OriginalPaidAmount = (decimal)paid;
                r.TakebackAmount = (decimal)takeback;
            });

            Assert.Contains(
                exception.Errors,
                e => e.Field == "originalPaidAmount" || e.Field == "takebackAmount");
        }

        [Fact]
        public void Create_rejects_amounts_above_the_maximum_and_accepts_the_maximum()
        {
            AssertError(Invalid(r =>
            {
                r.OriginalPaidAmount = Services.TakebackService.MaxAmount + 0.01m;
                r.TakebackAmount = 100m;
            }), "originalPaidAmount");

            // Would overflow decimal(12,2) in the database if it reached it.
            AssertError(Invalid(r =>
            {
                r.OriginalPaidAmount = 99999999999.99m;
                r.TakebackAmount = 99999999999.99m;
            }), "takebackAmount");

            Takeback largest = _world.TakebackService.Save(ValidRequest(r =>
            {
                r.OriginalPaidAmount = Services.TakebackService.MaxAmount;
                r.TakebackAmount = Services.TakebackService.MaxAmount;
            }));
            Assert.Equal(Services.TakebackService.MaxAmount, largest.TakebackAmount);
        }

        [Fact]
        public void Create_rejects_a_takeback_amount_above_the_paid_amount_and_accepts_an_equal_one()
        {
            AssertError(Invalid(r =>
            {
                r.OriginalPaidAmount = 500m;
                r.TakebackAmount = 500.01m;
            }), "takebackAmount");

            Takeback full = _world.TakebackService.Save(ValidRequest(r =>
            {
                r.OriginalPaidAmount = 500m;
                r.TakebackAmount = 500m;
            }));
            Assert.Equal(500m, full.TakebackAmount);
        }

        [Fact]
        public void Create_requires_the_other_carrier_only_when_other_insurance_is_primary()
        {
            AssertError(Invalid(r => r.OtherCarrierName = null), "otherCarrierName");

            Takeback medicare = _world.TakebackService.Save(ValidRequest(r =>
            {
                r.Reason = TakebackReason.MedicarePrimary;
                r.OtherCarrierName = null;
            }));
            Assert.Null(medicare.OtherCarrierName);
        }

        [Fact]
        public void Create_enforces_the_length_limits()
        {
            AssertError(Invalid(r => r.OtherCarrierName = new string('x', Services.TakebackService.MaxCarrierNameLength + 1)), "otherCarrierName");
            AssertError(Invalid(r => r.OtherPolicyNumber = new string('x', Services.TakebackService.MaxPolicyNumberLength + 1)), "otherPolicyNumber");
            AssertError(Invalid(r => r.Notes = new string('x', Services.TakebackService.MaxNotesLength + 1)), "notes");
        }

        [Fact]
        public void Create_rejects_a_second_active_takeback_for_the_same_claim_and_provider()
        {
            _world.TakebackService.Save(ValidRequest());

            ValidationFailedException exception = Invalid(r => r.ClaimNumber = "clm-100200");

            AssertError(exception, "claimNumber");
        }

        [Fact]
        public void Create_allows_the_same_claim_for_a_different_provider()
        {
            _world.TakebackService.Save(ValidRequest());

            Takeback other = _world.TakebackService.Save(ValidRequest(r => r.ProviderId = TestReference.ProviderLakeview));

            Assert.Equal("TB-000002", other.TakebackNumber);
        }

        [Theory]
        [InlineData(TakebackStatus.Rejected)]
        [InlineData(TakebackStatus.Cancelled)]
        public void Create_allows_the_claim_again_once_the_earlier_takeback_is_rejected_or_cancelled(TakebackStatus status)
        {
            _world.SeedTakeback(status, t => t.ClaimNumber = "CLM-100200");

            Takeback again = _world.TakebackService.Save(ValidRequest());

            Assert.Equal(TakebackStatus.Draft, again.Status);
        }

        [Theory]
        [InlineData(TakebackStatus.Draft)]
        [InlineData(TakebackStatus.PendingApproval)]
        [InlineData(TakebackStatus.Approved)]
        [InlineData(TakebackStatus.NoticeSent)]
        [InlineData(TakebackStatus.Recovered)]
        [InlineData(TakebackStatus.WrittenOff)]
        public void Create_blocks_the_claim_while_the_earlier_takeback_is_still_active(TakebackStatus status)
        {
            _world.SeedTakeback(status, t => t.ClaimNumber = "CLM-100200");

            AssertError(Invalid(r => { }), "claimNumber");
        }

        [Fact]
        public void Create_reports_every_problem_at_once()
        {
            ValidationFailedException exception = Invalid(r =>
            {
                r.ClaimNumber = null;
                r.MemberId = 0;
                r.TakebackAmount = 0;
                r.DateOfService = _world.Clock.Today.AddDays(5);
            });

            Assert.Equal(
                new[] { "claimNumber", "dateOfService", "memberId", "takebackAmount" },
                exception.Errors.Select(e => e.Field).OrderBy(f => f).ToArray());
        }

        [Fact]
        public void Save_requires_a_request_and_a_registered_user()
        {
            Assert.Throws<ValidationFailedException>(() => _world.TakebackService.Save(null));

            _world.SignOut();
            Assert.Throws<ForbiddenException>(() => _world.TakebackService.Save(ValidRequest()));
        }

        [Fact]
        public void Update_changes_the_fields_logs_an_edit_and_keeps_the_status()
        {
            Takeback created = _world.TakebackService.Save(ValidRequest());

            Takeback updated = _world.TakebackService.Save(ValidRequest(r =>
            {
                r.TakebackId = created.TakebackId;
                r.RowVersion = created.RowVersion;
                r.TakebackAmount = 750m;
                r.Notes = "Amount corrected.";
            }));

            Assert.Equal(TakebackStatus.Draft, updated.Status);
            Assert.Equal(750m, updated.TakebackAmount);
            Assert.Equal("Amount corrected.", updated.Notes);
            Assert.Equal(TestUsers.Jamie, updated.ModifiedByUserId);
            Assert.False(created.RowVersion.SequenceEqual(updated.RowVersion));
            Assert.Equal(
                new[] { TakebackActions.Create, TakebackActions.Edit },
                updated.History.Select(h => h.Action).ToArray());
            Assert.Equal(TakebackStatus.Draft, updated.History.Last().FromStatus);
            Assert.Equal(TakebackStatus.Draft, updated.History.Last().ToStatus);
        }

        [Fact]
        public void Update_does_not_treat_the_takeback_as_a_duplicate_of_itself()
        {
            Takeback created = _world.TakebackService.Save(ValidRequest());

            Takeback updated = _world.TakebackService.Save(ValidRequest(r =>
            {
                r.TakebackId = created.TakebackId;
                r.RowVersion = created.RowVersion;
            }));

            Assert.Equal(created.ClaimNumber, updated.ClaimNumber);
        }

        [Fact]
        public void Update_requires_the_row_version()
        {
            Takeback created = _world.TakebackService.Save(ValidRequest());

            AssertError(
                Assert.Throws<ValidationFailedException>(() => _world.TakebackService.Save(
                    ValidRequest(r => r.TakebackId = created.TakebackId))),
                "rowVersion");
        }

        [Fact]
        public void Update_with_an_outdated_row_version_is_a_concurrency_error()
        {
            Takeback created = _world.TakebackService.Save(ValidRequest());
            _world.TakebackService.Save(ValidRequest(r =>
            {
                r.TakebackId = created.TakebackId;
                r.RowVersion = created.RowVersion;
                r.Notes = "First";
            }));

            Assert.Throws<ConcurrencyException>(() => _world.TakebackService.Save(ValidRequest(r =>
            {
                r.TakebackId = created.TakebackId;
                r.RowVersion = created.RowVersion;
                r.Notes = "Second";
            })));
        }

        [Fact]
        public void Update_of_an_unknown_takeback_is_not_found()
        {
            Assert.Throws<NotFoundException>(() => _world.TakebackService.Save(ValidRequest(r =>
            {
                r.TakebackId = 999;
                r.RowVersion = new byte[8];
            })));
        }

        [Fact]
        public void A_rejected_takeback_can_be_edited_and_stays_rejected_until_it_is_submitted_again()
        {
            Takeback rejected = _world.SeedTakeback(TakebackStatus.Rejected);

            Takeback updated = _world.TakebackService.Save(ValidRequest(r =>
            {
                r.TakebackId = rejected.TakebackId;
                r.RowVersion = rejected.RowVersion;
                r.ClaimNumber = rejected.ClaimNumber;
                r.TakebackAmount = 900m;
            }));

            Assert.Equal(TakebackStatus.Rejected, updated.Status);
            Assert.Equal(900m, updated.TakebackAmount);
        }

        [Theory]
        [InlineData(TakebackStatus.PendingApproval)]
        [InlineData(TakebackStatus.Approved)]
        [InlineData(TakebackStatus.NoticeSent)]
        [InlineData(TakebackStatus.PartiallyRecovered)]
        [InlineData(TakebackStatus.Recovered)]
        [InlineData(TakebackStatus.Disputed)]
        [InlineData(TakebackStatus.WrittenOff)]
        [InlineData(TakebackStatus.Cancelled)]
        public void Update_is_only_possible_for_draft_and_rejected_takebacks(TakebackStatus status)
        {
            Takeback takeback = _world.SeedTakeback(status);

            Assert.Throws<BusinessRuleException>(() => _world.TakebackService.Save(ValidRequest(r =>
            {
                r.TakebackId = takeback.TakebackId;
                r.RowVersion = takeback.RowVersion;
            })));
        }

        [Fact]
        public void Update_by_an_analyst_who_did_not_create_the_takeback_is_forbidden()
        {
            Takeback takeback = _world.SeedTakeback();
            _world.SignIn(TestUsers.Alex);

            Assert.Throws<ForbiddenException>(() => _world.TakebackService.Save(ValidRequest(r =>
            {
                r.TakebackId = takeback.TakebackId;
                r.RowVersion = takeback.RowVersion;
            })));
        }

        [Theory]
        [InlineData(TestUsers.Blake)]
        [InlineData(TestUsers.Casey)]
        public void Update_is_allowed_for_supervisors_and_admins(int userId)
        {
            Takeback takeback = _world.SeedTakeback();
            _world.SignIn(userId);

            Takeback updated = _world.TakebackService.Save(ValidRequest(r =>
            {
                r.TakebackId = takeback.TakebackId;
                r.RowVersion = takeback.RowVersion;
                r.ClaimNumber = takeback.ClaimNumber;
            }));

            Assert.Equal(userId, updated.ModifiedByUserId);
            Assert.Equal(TestUsers.Jamie, updated.CreatedByUserId);
        }

        [Fact]
        public void A_rejected_update_leaves_the_stored_takeback_unchanged()
        {
            Takeback created = _world.TakebackService.Save(ValidRequest());

            Assert.Throws<ValidationFailedException>(() => _world.TakebackService.Save(ValidRequest(r =>
            {
                r.TakebackId = created.TakebackId;
                r.RowVersion = created.RowVersion;
                r.Notes = "Changed";
                r.TakebackAmount = 0m;
            })));

            Takeback stored = _world.TakebackService.GetById(created.TakebackId);
            Assert.Equal(created.Notes, stored.Notes);
            Assert.Equal(created.TakebackAmount, stored.TakebackAmount);
            Assert.True(created.RowVersion.SequenceEqual(stored.RowVersion));
            Assert.Single(stored.History);
        }

        [Fact]
        public void GetById_returns_linked_activities_and_the_history()
        {
            Takeback takeback = _world.SeedTakeback();
            _world.SeedActivity(a =>
            {
                a.TakebackId = takeback.TakebackId;
                a.Subject = "Verify coverage with Northwind";
            });
            _world.SeedActivity(a => a.TakebackId = null);

            Takeback loaded = _world.TakebackService.GetById(takeback.TakebackId);

            ActivityListItem linked = Assert.Single(loaded.LinkedActivities);
            Assert.Equal("Verify coverage with Northwind", linked.Subject);
            Assert.Equal(takeback.TakebackNumber, linked.TakebackNumber);
            Assert.NotEmpty(loaded.History);
        }

        [Fact]
        public void GetById_of_an_unknown_takeback_is_not_found_and_needs_a_registered_user()
        {
            Assert.Throws<NotFoundException>(() => _world.TakebackService.GetById(999));

            _world.SignOut();
            Assert.Throws<ForbiddenException>(() => _world.TakebackService.GetById(1));
        }
    }
}
