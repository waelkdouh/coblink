using System;
using System.Linq;
using CobLink.Models;
using CobLink.TestSupport;
using Xunit;

namespace CobLink.Business.Tests
{
    public class ActivityServiceActionTests
    {
        private readonly TestWorld _world = new TestWorld();

        private static ActivityActionRequest Request(Activity activity, string comment = null)
        {
            return new ActivityActionRequest
            {
                ActivityId = activity.ActivityId,
                RowVersion = activity.RowVersion,
                Comment = comment
            };
        }

        [Fact]
        public void Complete_records_the_outcome_the_completion_time_and_a_system_note()
        {
            Activity activity = _world.SeedActivity();

            Activity completed = _world.ActivityService.Complete(Request(activity, "  Member confirmed no other coverage.  "));

            Assert.Equal(ActivityStatus.Completed, completed.Status);
            Assert.Equal("Member confirmed no other coverage.", completed.Outcome);
            Assert.Equal(_world.Clock.UtcNow, completed.CompletedDate);
            Assert.Equal(DateTimeKind.Utc, completed.CompletedDate.Value.Kind);
            Assert.Equal(TestUsers.Jamie, completed.ModifiedByUserId);
            ActivityNote note = Assert.Single(completed.Notes);
            Assert.True(note.IsSystem);
            Assert.Equal("Completed. Outcome: Member confirmed no other coverage.", note.NoteText);
            Assert.Equal(new[] { ActivityActions.Reopen, ActivityActions.AddNote }, completed.AvailableActions.ToArray());
        }

        [Theory]
        [InlineData(null)]
        [InlineData("   ")]
        public void Complete_requires_an_outcome(string outcome)
        {
            Activity activity = _world.SeedActivity();

            var exception = Assert.Throws<ValidationFailedException>(
                () => _world.ActivityService.Complete(Request(activity, outcome)));

            Assert.Contains(exception.Errors, e => e.Field == "comment");
        }

        [Fact]
        public void Complete_limits_the_outcome_length()
        {
            Activity activity = _world.SeedActivity();

            Assert.Throws<ValidationFailedException>(() => _world.ActivityService.Complete(
                Request(activity, new string('x', Services.ActivityService.MaxOutcomeLength + 1))));
        }

        [Fact]
        public void Complete_requires_the_row_version_and_an_activity_id()
        {
            var exception = Assert.Throws<ValidationFailedException>(() => _world.ActivityService.Complete(
                new ActivityActionRequest { Comment = "Done" }));

            Assert.Contains(exception.Errors, e => e.Field == "rowVersion");
            Assert.Contains(exception.Errors, e => e.Field == "activityId");
        }

        [Fact]
        public void Complete_with_an_outdated_row_version_is_a_concurrency_error()
        {
            Activity activity = _world.SeedActivity();
            _world.ActivityService.Save(new SaveActivityRequest
            {
                ActivityId = activity.ActivityId,
                RowVersion = activity.RowVersion,
                MemberId = activity.MemberId,
                ActivityType = activity.ActivityType,
                Priority = activity.Priority,
                Status = activity.Status,
                AssignedToUserId = activity.AssignedToUserId,
                DueDate = activity.DueDate,
                Subject = "Edited by someone else"
            });

            Assert.Throws<ConcurrencyException>(() => _world.ActivityService.Complete(Request(activity, "Done")));
            Assert.Equal(ActivityStatus.Open, _world.ActivityService.GetById(activity.ActivityId).Status);
        }

        [Theory]
        [InlineData(ActivityStatus.Completed)]
        [InlineData(ActivityStatus.Cancelled)]
        public void Complete_and_cancel_of_a_closed_activity_are_business_rule_errors(ActivityStatus status)
        {
            Activity closed = _world.SeedActivity(a => a.Status = status);

            Assert.Throws<BusinessRuleException>(() => _world.ActivityService.Complete(Request(closed, "Done")));
            Assert.Throws<BusinessRuleException>(() => _world.ActivityService.Cancel(Request(closed, "Reason")));
        }

        [Fact]
        public void Complete_by_an_unrelated_analyst_is_forbidden_and_by_a_supervisor_is_allowed()
        {
            Activity activity = _world.SeedActivity();

            _world.SignIn(TestUsers.Alex);
            Assert.Throws<ForbiddenException>(() => _world.ActivityService.Complete(Request(activity, "Done")));

            _world.SignIn(TestUsers.Blake);
            Activity completed = _world.ActivityService.Complete(Request(activity, "Done"));
            Assert.Equal(ActivityStatus.Completed, completed.Status);
            Assert.Equal(TestUsers.Blake, completed.ModifiedByUserId);
        }

        [Fact]
        public void Complete_of_an_unknown_activity_is_not_found()
        {
            Assert.Throws<NotFoundException>(() => _world.ActivityService.Complete(
                new ActivityActionRequest { ActivityId = 999, RowVersion = new byte[8], Comment = "Done" }));
        }

        [Fact]
        public void Cancel_records_the_reason_and_leaves_no_completion_data()
        {
            Activity activity = _world.SeedActivity();

            Activity cancelled = _world.ActivityService.Cancel(Request(activity, "Duplicate of ACT-000009"));

            Assert.Equal(ActivityStatus.Cancelled, cancelled.Status);
            Assert.Null(cancelled.CompletedDate);
            Assert.Null(cancelled.Outcome);
            Assert.Equal("Cancelled. Reason: Duplicate of ACT-000009", Assert.Single(cancelled.Notes).NoteText);
        }

        [Fact]
        public void Cancel_requires_a_reason()
        {
            Activity activity = _world.SeedActivity();

            Assert.Throws<ValidationFailedException>(() => _world.ActivityService.Cancel(Request(activity, null)));
        }

        [Theory]
        [InlineData(ActivityStatus.Completed)]
        [InlineData(ActivityStatus.Cancelled)]
        public void Reopen_makes_the_activity_open_again_and_clears_the_completion_data(ActivityStatus status)
        {
            Activity activity = _world.SeedActivity();
            Activity closed = status == ActivityStatus.Completed
                ? _world.ActivityService.Complete(Request(activity, "Done"))
                : _world.ActivityService.Cancel(Request(activity, "Not needed"));

            Activity reopened = _world.ActivityService.Reopen(Request(closed));

            Assert.Equal(ActivityStatus.Open, reopened.Status);
            Assert.Null(reopened.CompletedDate);
            Assert.Null(reopened.Outcome);
            Assert.Equal(
                "Reopened (was " + status.ToString().ToLowerInvariant() + ").",
                reopened.Notes.Last().NoteText);
            Assert.Contains(ActivityActions.Complete, reopened.AvailableActions);
        }

        [Fact]
        public void Reopen_appends_the_optional_comment_to_the_note()
        {
            Activity activity = _world.SeedActivity(a => a.Status = ActivityStatus.Completed);

            Activity reopened = _world.ActivityService.Reopen(Request(activity, "Member called back"));

            Assert.Equal("Reopened (was completed). Member called back", reopened.Notes.Last().NoteText);
        }

        [Fact]
        public void Reopen_of_an_open_activity_is_a_business_rule_error()
        {
            Activity activity = _world.SeedActivity();

            Assert.Throws<BusinessRuleException>(() => _world.ActivityService.Reopen(Request(activity)));
        }

        [Fact]
        public void Reopen_by_an_unrelated_analyst_is_forbidden()
        {
            Activity activity = _world.SeedActivity(a => a.Status = ActivityStatus.Completed);
            _world.SignIn(TestUsers.Alex);

            Assert.Throws<ForbiddenException>(() => _world.ActivityService.Reopen(Request(activity)));
        }

        [Fact]
        public void AddNote_lets_any_registered_user_add_a_note_even_to_a_closed_activity()
        {
            Activity activity = _world.SeedActivity(a => a.Status = ActivityStatus.Completed);
            _world.SignIn(TestUsers.Alex);

            Activity updated = _world.ActivityService.AddNote(new AddActivityNoteRequest
            {
                ActivityId = activity.ActivityId,
                NoteText = "  Following up next week.  "
            });

            ActivityNote note = Assert.Single(updated.Notes);
            Assert.False(note.IsSystem);
            Assert.Equal("Following up next week.", note.NoteText);
            Assert.Equal(TestUsers.Alex, note.CreatedByUserId);
            Assert.Equal("Alex Smith", note.CreatedByName);
            Assert.Equal(new[] { ActivityActions.AddNote }, updated.AvailableActions.ToArray());
        }

        [Fact]
        public void AddNote_does_not_change_the_row_version()
        {
            Activity activity = _world.SeedActivity();

            Activity updated = _world.ActivityService.AddNote(new AddActivityNoteRequest
            {
                ActivityId = activity.ActivityId,
                NoteText = "A note"
            });

            Assert.True(activity.RowVersion.SequenceEqual(updated.RowVersion));
        }

        [Fact]
        public void AddNote_validates_the_text_and_the_activity()
        {
            Activity activity = _world.SeedActivity();

            Assert.Throws<ValidationFailedException>(() => _world.ActivityService.AddNote(
                new AddActivityNoteRequest { ActivityId = activity.ActivityId, NoteText = " " }));
            Assert.Throws<ValidationFailedException>(() => _world.ActivityService.AddNote(
                new AddActivityNoteRequest
                {
                    ActivityId = activity.ActivityId,
                    NoteText = new string('x', Services.ActivityService.MaxNoteLength + 1)
                }));
            Assert.Throws<ValidationFailedException>(() => _world.ActivityService.AddNote(
                new AddActivityNoteRequest { ActivityId = 0, NoteText = "Hello" }));
            Assert.Throws<NotFoundException>(() => _world.ActivityService.AddNote(
                new AddActivityNoteRequest { ActivityId = 999, NoteText = "Hello" }));
        }

        [Fact]
        public void GetById_returns_notes_oldest_first_and_flags_overdue_activities()
        {
            Activity activity = _world.SeedActivity(a => a.DueDate = _world.Clock.Today.AddDays(1));
            _world.ActivityService.AddNote(new AddActivityNoteRequest { ActivityId = activity.ActivityId, NoteText = "First" });
            _world.ActivityService.AddNote(new AddActivityNoteRequest { ActivityId = activity.ActivityId, NoteText = "Second" });
            _world.Clock.AdvanceDays(3);

            Activity loaded = _world.ActivityService.GetById(activity.ActivityId);

            Assert.Equal(new[] { "First", "Second" }, loaded.Notes.Select(n => n.NoteText).ToArray());
            Assert.True(loaded.IsOverdue);
        }

        [Fact]
        public void GetById_of_an_unknown_activity_is_not_found()
        {
            Assert.Throws<NotFoundException>(() => _world.ActivityService.GetById(999));
        }

        [Fact]
        public void GetById_offers_only_AddNote_to_an_analyst_who_cannot_change_the_activity()
        {
            Activity activity = _world.SeedActivity();
            _world.SignIn(TestUsers.Alex);

            Activity loaded = _world.ActivityService.GetById(activity.ActivityId);

            Assert.Equal(new[] { ActivityActions.AddNote }, loaded.AvailableActions.ToArray());
        }

        [Fact]
        public void Every_operation_needs_a_registered_user()
        {
            Activity activity = _world.SeedActivity();
            _world.SignOut();

            Assert.Throws<ForbiddenException>(() => _world.ActivityService.GetById(activity.ActivityId));
            Assert.Throws<ForbiddenException>(() => _world.ActivityService.Search(new ActivitySearchRequest()));
            Assert.Throws<ForbiddenException>(() => _world.ActivityService.Complete(Request(activity, "Done")));
            Assert.Throws<ForbiddenException>(() => _world.ActivityService.Cancel(Request(activity, "Reason")));
            Assert.Throws<ForbiddenException>(() => _world.ActivityService.Reopen(Request(activity)));
            Assert.Throws<ForbiddenException>(() => _world.ActivityService.AddNote(
                new AddActivityNoteRequest { ActivityId = activity.ActivityId, NoteText = "Hello" }));
        }
    }
}
