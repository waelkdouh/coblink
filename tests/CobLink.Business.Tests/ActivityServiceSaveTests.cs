using System;
using System.Linq;
using CobLink.Models;
using CobLink.TestSupport;
using Xunit;

namespace CobLink.Business.Tests
{
    public class ActivityServiceSaveTests
    {
        private readonly TestWorld _world = new TestWorld();

        private SaveActivityRequest ValidRequest(Action<SaveActivityRequest> customize = null)
        {
            var request = new SaveActivityRequest
            {
                MemberId = TestReference.MemberAva,
                ActivityType = ActivityType.PhoneCall,
                Priority = ActivityPriority.Normal,
                Subject = "Call member about other coverage",
                Description = "Confirm whether the member has other insurance.",
                DueDate = _world.Clock.Today.AddDays(6)
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

        [Fact]
        public void Create_assigns_the_activity_to_its_creator_and_writes_a_system_note()
        {
            Activity activity = _world.ActivityService.Save(ValidRequest());

            Assert.Equal("ACT-000001", activity.ActivityNumber);
            Assert.Equal(ActivityStatus.Open, activity.Status);
            Assert.Equal(TestUsers.Jamie, activity.AssignedToUserId);
            Assert.Equal("Jamie Doe", activity.AssignedToName);
            Assert.Equal(TestUsers.Jamie, activity.CreatedByUserId);
            Assert.Equal("Jamie Doe", activity.CreatedByName);
            Assert.Equal(_world.Clock.UtcNow, activity.CreatedDate);
            Assert.Equal("Johnson, Ava", activity.MemberName);
            Assert.False(activity.IsOverdue);

            ActivityNote note = Assert.Single(activity.Notes);
            Assert.True(note.IsSystem);
            Assert.Equal("Activity created.", note.NoteText);
        }

        [Fact]
        public void Create_for_another_assignee_adds_an_assignment_note()
        {
            Activity activity = _world.ActivityService.Save(ValidRequest(r => r.AssignedToUserId = TestUsers.Alex));

            Assert.Equal(TestUsers.Alex, activity.AssignedToUserId);
            Assert.Equal(
                new[] { "Activity created.", "Assigned to Alex Smith." },
                activity.Notes.Select(n => n.NoteText).ToArray());
        }

        [Fact]
        public void Create_returns_the_actions_available_to_the_creator()
        {
            Activity activity = _world.ActivityService.Save(ValidRequest());

            Assert.Equal(
                new[] { ActivityActions.Edit, ActivityActions.Complete, ActivityActions.Cancel, ActivityActions.AddNote },
                activity.AvailableActions.ToArray());
        }

        [Fact]
        public void Create_trims_text_and_stores_blank_description_as_null()
        {
            Activity activity = _world.ActivityService.Save(ValidRequest(r =>
            {
                r.Subject = "  Call member  ";
                r.Description = "   ";
            }));

            Assert.Equal("Call member", activity.Subject);
            Assert.Null(activity.Description);
        }

        [Fact]
        public void Create_keeps_the_due_date_as_a_date_without_time()
        {
            DateTime due = _world.Clock.Today.AddDays(3).AddHours(17);

            Activity activity = _world.ActivityService.Save(ValidRequest(r => r.DueDate = due));

            Assert.Equal(due.Date, activity.DueDate);
        }

        [Fact]
        public void Create_accepts_a_due_date_of_today_and_no_due_date()
        {
            Activity today = _world.ActivityService.Save(ValidRequest(r => r.DueDate = _world.Clock.Today));
            Activity none = _world.ActivityService.Save(ValidRequest(r => r.DueDate = null));

            Assert.Equal(_world.Clock.Today, today.DueDate);
            Assert.Null(none.DueDate);
        }

        [Fact]
        public void Create_can_link_a_takeback_and_takes_the_member_from_it()
        {
            Takeback takeback = _world.SeedTakeback(customize: t => t.MemberId = TestReference.MemberMia);

            Activity activity = _world.ActivityService.Save(ValidRequest(r =>
            {
                r.MemberId = null;
                r.TakebackId = takeback.TakebackId;
            }));

            Assert.Equal(TestReference.MemberMia, activity.MemberId);
            Assert.Equal(takeback.TakebackId, activity.TakebackId);
            Assert.Equal(takeback.TakebackNumber, activity.TakebackNumber);
        }

        [Fact]
        public void Create_rejects_a_member_that_is_not_the_member_of_the_linked_takeback()
        {
            Takeback takeback = _world.SeedTakeback();

            var exception = Assert.Throws<ValidationFailedException>(() => _world.ActivityService.Save(ValidRequest(r =>
            {
                r.MemberId = TestReference.MemberNoah;
                r.TakebackId = takeback.TakebackId;
            })));

            AssertError(exception, "memberId");
        }

        [Fact]
        public void Create_allows_a_general_activity_without_a_member_or_a_takeback()
        {
            Activity activity = _world.ActivityService.Save(ValidRequest(r => r.MemberId = null));

            Assert.Null(activity.MemberId);
            Assert.Null(activity.TakebackId);
            Assert.Null(activity.MemberName);
        }

        [Fact]
        public void Create_rejects_a_member_or_takeback_that_does_not_exist()
        {
            var member = Assert.Throws<ValidationFailedException>(
                () => _world.ActivityService.Save(ValidRequest(r => r.MemberId = 999)));
            var takeback = Assert.Throws<ValidationFailedException>(
                () => _world.ActivityService.Save(ValidRequest(r => r.TakebackId = 999)));

            AssertError(member, "memberId");
            AssertError(takeback, "takebackId");
        }

        [Fact]
        public void Create_rejects_a_due_date_in_the_past()
        {
            var exception = Assert.Throws<ValidationFailedException>(
                () => _world.ActivityService.Save(ValidRequest(r => r.DueDate = _world.Clock.Today.AddDays(-1))));

            AssertError(exception, "dueDate");
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        public void Create_requires_a_subject(string subject)
        {
            var exception = Assert.Throws<ValidationFailedException>(
                () => _world.ActivityService.Save(ValidRequest(r => r.Subject = subject)));

            AssertError(exception, "subject");
        }

        [Fact]
        public void Create_enforces_the_length_limits()
        {
            var subject = Assert.Throws<ValidationFailedException>(() => _world.ActivityService.Save(
                ValidRequest(r => r.Subject = new string('x', Services.ActivityService.MaxSubjectLength + 1))));
            var description = Assert.Throws<ValidationFailedException>(() => _world.ActivityService.Save(
                ValidRequest(r => r.Description = new string('x', Services.ActivityService.MaxDescriptionLength + 1))));

            AssertError(subject, "subject");
            AssertError(description, "description");

            Activity atLimit = _world.ActivityService.Save(
                ValidRequest(r => r.Subject = new string('x', Services.ActivityService.MaxSubjectLength)));
            Assert.Equal(Services.ActivityService.MaxSubjectLength, atLimit.Subject.Length);
        }

        [Fact]
        public void Create_rejects_unknown_type_and_priority()
        {
            var exception = Assert.Throws<ValidationFailedException>(() => _world.ActivityService.Save(ValidRequest(r =>
            {
                r.ActivityType = (ActivityType)99;
                r.Priority = (ActivityPriority)99;
            })));

            AssertError(exception, "activityType");
            AssertError(exception, "priority");
        }

        [Theory]
        [InlineData(ActivityStatus.Completed)]
        [InlineData(ActivityStatus.Cancelled)]
        [InlineData((ActivityStatus)0)]
        public void Create_only_accepts_open_statuses(ActivityStatus status)
        {
            var exception = Assert.Throws<ValidationFailedException>(
                () => _world.ActivityService.Save(ValidRequest(r => r.Status = status)));

            AssertError(exception, "status");
        }

        [Fact]
        public void Create_can_start_in_progress()
        {
            Activity activity = _world.ActivityService.Save(ValidRequest(r => r.Status = ActivityStatus.InProgress));

            Assert.Equal(ActivityStatus.InProgress, activity.Status);
        }

        [Fact]
        public void Create_rejects_an_inactive_or_unknown_assignee()
        {
            var inactive = Assert.Throws<ValidationFailedException>(
                () => _world.ActivityService.Save(ValidRequest(r => r.AssignedToUserId = TestUsers.Inactive)));
            var unknown = Assert.Throws<ValidationFailedException>(
                () => _world.ActivityService.Save(ValidRequest(r => r.AssignedToUserId = 999)));

            AssertError(inactive, "assignedToUserId");
            AssertError(unknown, "assignedToUserId");
        }

        [Fact]
        public void Create_reports_every_problem_at_once()
        {
            var exception = Assert.Throws<ValidationFailedException>(() => _world.ActivityService.Save(ValidRequest(r =>
            {
                r.Subject = null;
                r.MemberId = 999;
                r.DueDate = _world.Clock.Today.AddDays(-3);
            })));

            Assert.Equal(
                new[] { "dueDate", "memberId", "subject" },
                exception.Errors.Select(e => e.Field).OrderBy(f => f).ToArray());
        }

        [Fact]
        public void Save_requires_a_request_and_a_registered_user()
        {
            Assert.Throws<ValidationFailedException>(() => _world.ActivityService.Save(null));

            _world.SignOut();
            Assert.Throws<ForbiddenException>(() => _world.ActivityService.Save(ValidRequest()));
        }

        [Fact]
        public void Update_changes_the_fields_and_records_status_and_assignee_changes()
        {
            Activity created = _world.ActivityService.Save(ValidRequest());

            Activity updated = _world.ActivityService.Save(ValidRequest(r =>
            {
                r.ActivityId = created.ActivityId;
                r.RowVersion = created.RowVersion;
                r.Subject = "Call member again";
                r.Priority = ActivityPriority.Urgent;
                r.Status = ActivityStatus.InProgress;
                r.AssignedToUserId = TestUsers.Alex;
                r.DueDate = _world.Clock.Today.AddDays(2);
            }));

            Assert.Equal("Call member again", updated.Subject);
            Assert.Equal(ActivityPriority.Urgent, updated.Priority);
            Assert.Equal(ActivityStatus.InProgress, updated.Status);
            Assert.Equal(TestUsers.Alex, updated.AssignedToUserId);
            Assert.Equal(TestUsers.Jamie, updated.ModifiedByUserId);
            Assert.NotNull(updated.ModifiedDate);
            Assert.False(created.RowVersion.SequenceEqual(updated.RowVersion));
            Assert.Equal(
                new[]
                {
                    "Activity created.",
                    "Status changed from open to in progress.",
                    "Reassigned to Alex Smith."
                },
                updated.Notes.Select(n => n.NoteText).ToArray());
        }

        [Fact]
        public void Update_keeps_a_general_activity_without_a_member_general()
        {
            Activity created = _world.ActivityService.Save(ValidRequest(r => r.MemberId = null));

            Activity updated = _world.ActivityService.Save(ValidRequest(r =>
            {
                r.ActivityId = created.ActivityId;
                r.RowVersion = created.RowVersion;
                r.MemberId = null;
                r.Subject = "Quarterly audit, second sample";
            }));

            Assert.Equal("Quarterly audit, second sample", updated.Subject);
            Assert.Null(updated.MemberId);
        }

        [Fact]
        public void Update_without_changes_to_status_or_assignee_adds_no_notes()
        {
            Activity created = _world.ActivityService.Save(ValidRequest());

            Activity updated = _world.ActivityService.Save(ValidRequest(r =>
            {
                r.ActivityId = created.ActivityId;
                r.RowVersion = created.RowVersion;
                r.AssignedToUserId = TestUsers.Jamie;
                r.Subject = "New subject";
            }));

            Assert.Single(updated.Notes);
        }

        [Fact]
        public void Update_with_a_null_assignee_unassigns_the_activity()
        {
            Activity created = _world.ActivityService.Save(ValidRequest());

            Activity updated = _world.ActivityService.Save(ValidRequest(r =>
            {
                r.ActivityId = created.ActivityId;
                r.RowVersion = created.RowVersion;
                r.AssignedToUserId = null;
            }));

            Assert.Null(updated.AssignedToUserId);
            Assert.Null(updated.AssignedToName);
            Assert.Contains(updated.Notes, n => n.NoteText == "Unassigned.");
        }

        [Fact]
        public void Update_allows_the_due_date_to_stay_in_the_past()
        {
            Activity created = _world.ActivityService.Save(ValidRequest(r => r.DueDate = _world.Clock.Today.AddDays(1)));
            _world.Clock.AdvanceDays(10);

            Activity updated = _world.ActivityService.Save(ValidRequest(r =>
            {
                r.ActivityId = created.ActivityId;
                r.RowVersion = created.RowVersion;
                r.DueDate = created.DueDate;
                r.Subject = "Still working on it";
            }));

            Assert.Equal(created.DueDate, updated.DueDate);
            Assert.True(updated.IsOverdue);
        }

        [Fact]
        public void Update_requires_the_row_version()
        {
            Activity created = _world.ActivityService.Save(ValidRequest());

            var exception = Assert.Throws<ValidationFailedException>(() => _world.ActivityService.Save(
                ValidRequest(r => r.ActivityId = created.ActivityId)));

            AssertError(exception, "rowVersion");
        }

        [Fact]
        public void Update_with_an_outdated_row_version_is_a_concurrency_error()
        {
            Activity created = _world.ActivityService.Save(ValidRequest());
            _world.ActivityService.Save(ValidRequest(r =>
            {
                r.ActivityId = created.ActivityId;
                r.RowVersion = created.RowVersion;
                r.Subject = "First edit wins";
            }));

            Assert.Throws<ConcurrencyException>(() => _world.ActivityService.Save(ValidRequest(r =>
            {
                r.ActivityId = created.ActivityId;
                r.RowVersion = created.RowVersion;
                r.Subject = "Second edit loses";
            })));

            Assert.Equal("First edit wins", _world.ActivityService.GetById(created.ActivityId).Subject);
        }

        [Fact]
        public void Update_of_an_unknown_activity_is_not_found()
        {
            Assert.Throws<NotFoundException>(() => _world.ActivityService.Save(ValidRequest(r =>
            {
                r.ActivityId = 999;
                r.RowVersion = new byte[8];
            })));
        }

        [Theory]
        [InlineData(ActivityStatus.Completed)]
        [InlineData(ActivityStatus.Cancelled)]
        public void Update_of_a_closed_activity_is_a_business_rule_error(ActivityStatus status)
        {
            Activity closed = _world.SeedActivity(a => a.Status = status);

            Assert.Throws<BusinessRuleException>(() => _world.ActivityService.Save(ValidRequest(r =>
            {
                r.ActivityId = closed.ActivityId;
                r.RowVersion = closed.RowVersion;
            })));
        }

        [Fact]
        public void Update_by_an_analyst_who_is_neither_creator_nor_assignee_is_forbidden()
        {
            Activity activity = _world.SeedActivity();
            _world.SignIn(TestUsers.Alex);

            Assert.Throws<ForbiddenException>(() => _world.ActivityService.Save(ValidRequest(r =>
            {
                r.ActivityId = activity.ActivityId;
                r.RowVersion = activity.RowVersion;
            })));
        }

        [Theory]
        [InlineData(TestUsers.Alex)]
        [InlineData(TestUsers.Blake)]
        [InlineData(TestUsers.Casey)]
        public void Update_is_allowed_for_the_assignee_and_for_supervisors_and_admins(int userId)
        {
            Activity activity = _world.SeedActivity(a => a.AssignedToUserId = TestUsers.Alex);
            _world.SignIn(userId);

            Activity updated = _world.ActivityService.Save(ValidRequest(r =>
            {
                r.ActivityId = activity.ActivityId;
                r.RowVersion = activity.RowVersion;
                r.AssignedToUserId = TestUsers.Alex;
                r.Subject = "Edited by " + userId;
            }));

            Assert.Equal("Edited by " + userId, updated.Subject);
            Assert.Equal(userId, updated.ModifiedByUserId);
        }

        [Fact]
        public void A_rejected_update_leaves_the_stored_activity_unchanged()
        {
            Activity created = _world.ActivityService.Save(ValidRequest());

            Assert.Throws<ValidationFailedException>(() => _world.ActivityService.Save(ValidRequest(r =>
            {
                r.ActivityId = created.ActivityId;
                r.RowVersion = created.RowVersion;
                r.Subject = "Changed";
                r.MemberId = 999;
            })));

            Activity stored = _world.ActivityService.GetById(created.ActivityId);
            Assert.Equal(created.Subject, stored.Subject);
            Assert.True(created.RowVersion.SequenceEqual(stored.RowVersion));
        }
    }
}
