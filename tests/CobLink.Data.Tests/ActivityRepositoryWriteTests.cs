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
    /// Tests of IActivityRepository that write. Every test creates its own activities (subjects carry a unique tag),
    /// so they can run in any order next to each other.
    /// </summary>
    [Collection(WorkingDatabaseCollection.Name)]
    public class ActivityRepositoryWriteTests
    {
        private const int ForeignKeyViolation = 547;

        private readonly WorkingDatabaseFixture _db;
        private readonly IActivityRepository _activities;
        private readonly int _memberId;

        public ActivityRepositoryWriteTests(WorkingDatabaseFixture db)
        {
            _db = db;
            _activities = db.Activities;
            _memberId = db.Lookups.SearchMembers("M000101", 1).Single().MemberId;
        }

        // ---- Insert -----------------------------------------------------------------------------------------------

        [SqlFact]
        public void Insert_stores_the_activity_and_returns_its_id()
        {
            Activity input = NewActivity();

            int id = _activities.Insert(input, SampleUsers.Jamie);
            Activity stored = _activities.GetById(id);

            Assert.True(id > 0);
            Assert.Equal(id, stored.ActivityId);
            Assert.Equal("ACT-" + id.ToString("D6"), stored.ActivityNumber);
            Assert.Equal(input.Subject, stored.Subject);
            Assert.Equal(input.Description, stored.Description);
            Assert.Equal(ActivityType.PhoneCall, stored.ActivityType);
            Assert.Equal(ActivityStatus.Open, stored.Status);
            Assert.Equal(ActivityPriority.Normal, stored.Priority);
            Assert.Equal(_memberId, stored.MemberId);
            Assert.Equal("M000101", stored.MemberNumber);
            Assert.Equal("Martinez, Olivia", stored.MemberName);
            Assert.Equal(SampleUsers.Alex, stored.AssignedToUserId);
            Assert.Equal("Alex Smith", stored.AssignedToName);
            Assert.Equal(input.DueDate, stored.DueDate);
            Assert.Equal(SampleUsers.Jamie, stored.CreatedByUserId);
            Assert.Equal("Jamie Doe", stored.CreatedByName);
            AssertJustNow(stored.CreatedDate);
            Assert.Null(stored.ModifiedByUserId);
            Assert.Null(stored.ModifiedDate);
            Assert.Null(stored.CompletedDate);
            Assert.Null(stored.Outcome);
            Assert.False(stored.IsOverdue);
            Assert.Empty(stored.Notes);
            Assert.Equal(8, stored.RowVersion.Length);
        }

        [SqlFact]
        public void Insert_accepts_an_activity_without_member_assignee_due_date_or_description()
        {
            Activity input = NewActivity();
            input.MemberId = null;
            input.AssignedToUserId = null;
            input.DueDate = null;
            input.Description = null;

            Activity stored = _activities.GetById(_activities.Insert(input, SampleUsers.Jamie));

            Assert.Null(stored.MemberId);
            Assert.Null(stored.MemberName);
            Assert.Null(stored.AssignedToUserId);
            Assert.Null(stored.AssignedToName);
            Assert.Null(stored.DueDate);
            Assert.Null(stored.Description);
            Assert.False(stored.IsOverdue);
        }

        [SqlFact]
        public void Insert_can_link_the_activity_to_a_takeback()
        {
            int takebackId = _db.Takebacks.Insert(NewTakeback(), SampleUsers.Jamie);
            Activity input = NewActivity();
            input.TakebackId = takebackId;

            Activity stored = _activities.GetById(_activities.Insert(input, SampleUsers.Jamie));

            Assert.Equal(takebackId, stored.TakebackId);
            Assert.Equal("TB-" + takebackId.ToString("D6"), stored.TakebackNumber);
        }

        [SqlFact]
        public void Insert_round_trips_unicode_text()
        {
            Activity input = NewActivity();
            input.Subject = input.Subject + " - Zoë Müller 田中 \u2013 caf\u00e9";
            input.Description = "Line one\r\nLine two with ümlauts and \u20ac";

            Activity stored = _activities.GetById(_activities.Insert(input, SampleUsers.Jamie));

            Assert.Equal(input.Subject, stored.Subject);
            Assert.Equal(input.Description, stored.Description);
        }

        [SqlFact]
        public void Insert_with_an_unknown_assignee_or_member_fails_on_the_foreign_key_and_stores_nothing()
        {
            Activity unknownAssignee = NewActivity();
            unknownAssignee.AssignedToUserId = 999999;
            Activity unknownMember = NewActivity();
            unknownMember.MemberId = 999999;

            Assert.Equal(ForeignKeyViolation, Assert.Throws<SqlException>(() => _activities.Insert(unknownAssignee, SampleUsers.Jamie)).Number);
            Assert.Equal(ForeignKeyViolation, Assert.Throws<SqlException>(() => _activities.Insert(unknownMember, SampleUsers.Jamie)).Number);

            Assert.Equal(0, CountBySubject(unknownAssignee.Subject));
            Assert.Equal(0, CountBySubject(unknownMember.Subject));
        }

        // ---- Update -----------------------------------------------------------------------------------------------

        [SqlFact]
        public void Update_changes_every_editable_column_and_the_audit_columns()
        {
            int id = _activities.Insert(NewActivity(), SampleUsers.Jamie);
            Activity edit = _activities.GetById(id);
            byte[] oldRowVersion = edit.RowVersion;
            DateTime createdDate = edit.CreatedDate;

            edit.Subject = edit.Subject + " (edited)";
            edit.Description = "Edited description";
            edit.ActivityType = ActivityType.Email;
            edit.Status = ActivityStatus.InProgress;
            edit.Priority = ActivityPriority.Urgent;
            edit.AssignedToUserId = SampleUsers.Casey;
            edit.DueDate = edit.DueDate.Value.AddDays(5);
            edit.MemberId = null;
            _activities.Update(edit, SampleUsers.Blake);
            Activity after = _activities.GetById(id);

            Assert.Equal(edit.Subject, after.Subject);
            Assert.Equal("Edited description", after.Description);
            Assert.Equal(ActivityType.Email, after.ActivityType);
            Assert.Equal(ActivityStatus.InProgress, after.Status);
            Assert.Equal(ActivityPriority.Urgent, after.Priority);
            Assert.Equal(SampleUsers.Casey, after.AssignedToUserId);
            Assert.Equal("Casey Admin", after.AssignedToName);
            Assert.Equal(edit.DueDate, after.DueDate);
            Assert.Null(after.MemberId);

            Assert.Equal(SampleUsers.Blake, after.ModifiedByUserId);
            Assert.Equal("Blake Wilson", after.ModifiedByName);
            AssertJustNow(after.ModifiedDate.Value);
            Assert.Equal(SampleUsers.Jamie, after.CreatedByUserId);
            Assert.Equal(createdDate, after.CreatedDate);
            Assert.NotEqual(oldRowVersion, after.RowVersion);
        }

        [SqlFact]
        public void Update_stores_the_completion_details()
        {
            int id = _activities.Insert(NewActivity(), SampleUsers.Jamie);
            Activity edit = _activities.GetById(id);
            DateTime completed = new DateTime(2026, 3, 9, 14, 30, 15, DateTimeKind.Utc);

            edit.Status = ActivityStatus.Completed;
            edit.CompletedDate = completed;
            edit.Outcome = "Member confirmed the other policy.";
            _activities.Update(edit, SampleUsers.Alex);
            Activity after = _activities.GetById(id);

            Assert.Equal(ActivityStatus.Completed, after.Status);
            Assert.Equal(completed, after.CompletedDate);
            Assert.Equal(DateTimeKind.Utc, after.CompletedDate.Value.Kind);
            Assert.Equal("Member confirmed the other policy.", after.Outcome);
        }

        [SqlFact]
        public void Update_converts_a_local_completion_time_to_utc()
        {
            int id = _activities.Insert(NewActivity(), SampleUsers.Jamie);
            Activity edit = _activities.GetById(id);
            DateTime local = new DateTime(2026, 3, 9, 14, 30, 15, DateTimeKind.Local);

            edit.Status = ActivityStatus.Completed;
            edit.CompletedDate = local;
            edit.Outcome = "Done";
            _activities.Update(edit, SampleUsers.Alex);

            Assert.Equal(local.ToUniversalTime(), _activities.GetById(id).CompletedDate);
        }

        [SqlFact]
        public void IsOverdue_is_calculated_by_the_database_from_the_due_date_and_status()
        {
            DateTime today = _db.Database.ServerToday();
            Activity input = NewActivity();
            input.DueDate = today.AddDays(-2);
            int id = _activities.Insert(input, SampleUsers.Jamie);

            Activity activity = _activities.GetById(id);
            Assert.True(activity.IsOverdue);

            activity.DueDate = today;
            _activities.Update(activity, SampleUsers.Jamie);
            activity = _activities.GetById(id);
            Assert.False(activity.IsOverdue);

            activity.DueDate = today.AddDays(-1);
            activity.Status = ActivityStatus.InProgress;
            _activities.Update(activity, SampleUsers.Jamie);
            activity = _activities.GetById(id);
            Assert.True(activity.IsOverdue);

            activity.Status = ActivityStatus.Completed;
            activity.CompletedDate = DateTime.UtcNow;
            activity.Outcome = "Done";
            _activities.Update(activity, SampleUsers.Jamie);
            Assert.False(_activities.GetById(id).IsOverdue);
        }

        [SqlFact]
        public void Update_with_a_stale_row_version_throws_ConcurrencyException_and_keeps_the_first_change()
        {
            int id = _activities.Insert(NewActivity(), SampleUsers.Jamie);
            Activity first = _activities.GetById(id);
            Activity second = _activities.GetById(id);

            first.Subject = "first writer " + Guid.NewGuid().ToString("N");
            _activities.Update(first, SampleUsers.Jamie);
            second.Subject = "second writer";

            Assert.Throws<ConcurrencyException>(() => _activities.Update(second, SampleUsers.Alex));
            Assert.Equal(first.Subject, _activities.GetById(id).Subject);
        }

        [SqlFact]
        public void Update_can_be_repeated_with_the_row_version_of_a_fresh_read()
        {
            int id = _activities.Insert(NewActivity(), SampleUsers.Jamie);

            for (int round = 1; round <= 3; round++)
            {
                Activity activity = _activities.GetById(id);
                activity.Description = "round " + round;
                _activities.Update(activity, SampleUsers.Jamie);
            }

            Assert.Equal("round 3", _activities.GetById(id).Description);
        }

        [SqlFact]
        public void Update_without_a_row_version_is_treated_as_a_stale_update()
        {
            int id = _activities.Insert(NewActivity(), SampleUsers.Jamie);
            Activity edit = _activities.GetById(id);
            edit.RowVersion = null;

            Assert.Throws<ConcurrencyException>(() => _activities.Update(edit, SampleUsers.Jamie));
        }

        [SqlFact]
        public void Update_of_a_missing_activity_throws_NotFoundException()
        {
            Activity ghost = NewActivity();
            ghost.ActivityId = 999999;
            ghost.RowVersion = new byte[8];

            NotFoundException exception = Assert.Throws<NotFoundException>(() => _activities.Update(ghost, SampleUsers.Jamie));

            Assert.Equal("Activity", exception.EntityName);
        }

        // ---- AddNote ----------------------------------------------------------------------------------------------

        [SqlFact]
        public void AddNote_returns_the_saved_note_and_leaves_the_activity_row_version_alone()
        {
            int id = _activities.Insert(NewActivity(), SampleUsers.Jamie);
            Activity before = _activities.GetById(id);

            ActivityNote note = _activities.AddNote(id, "Left a voicemail.", false, SampleUsers.Alex);
            Activity after = _activities.GetById(id);

            Assert.True(note.NoteId > 0);
            Assert.Equal(id, note.ActivityId);
            Assert.Equal("Left a voicemail.", note.NoteText);
            Assert.False(note.IsSystem);
            Assert.Equal(SampleUsers.Alex, note.CreatedByUserId);
            Assert.Equal("Alex Smith", note.CreatedByName);
            AssertJustNow(note.CreatedDate);

            Assert.Equal(before.RowVersion, after.RowVersion);
            Assert.Equal(note.NoteId, Assert.Single(after.Notes).NoteId);
        }

        [SqlFact]
        public void AddNote_keeps_the_notes_in_the_order_they_were_written_and_remembers_system_notes()
        {
            int id = _activities.Insert(NewActivity(), SampleUsers.Jamie);

            _activities.AddNote(id, "one", false, SampleUsers.Jamie);
            _activities.AddNote(id, "two", true, SampleUsers.Jamie);
            _activities.AddNote(id, "three", false, SampleUsers.Alex);
            Activity activity = _activities.GetById(id);

            Assert.Equal(new[] { "one", "two", "three" }, activity.Notes.Select(n => n.NoteText).ToArray());
            Assert.Equal(new[] { false, true, false }, activity.Notes.Select(n => n.IsSystem).ToArray());
            Assert.Equal(new[] { SampleUsers.Jamie, SampleUsers.Jamie, SampleUsers.Alex }, activity.Notes.Select(n => n.CreatedByUserId).ToArray());
        }

        [SqlFact]
        public void AddNote_round_trips_unicode_and_the_maximum_length()
        {
            int id = _activities.Insert(NewActivity(), SampleUsers.Jamie);
            string longText = "Zoë – 田中 " + new string('x', 2000 - "Zoë – 田中 ".Length);

            ActivityNote note = _activities.AddNote(id, longText, false, SampleUsers.Jamie);

            Assert.Equal(2000, longText.Length);
            Assert.Equal(longText, note.NoteText);
            Assert.Equal(longText, _activities.GetById(id).Notes.Single().NoteText);
        }

        [SqlFact]
        public void AddNote_to_a_missing_activity_throws_NotFoundException()
        {
            NotFoundException exception = Assert.Throws<NotFoundException>(() => _activities.AddNote(999999, "text", false, SampleUsers.Jamie));

            Assert.Equal("Activity", exception.EntityName);
        }

        // ---- helpers ----------------------------------------------------------------------------------------------

        private Activity NewActivity()
        {
            return new Activity
            {
                MemberId = _memberId,
                ActivityType = ActivityType.PhoneCall,
                Status = ActivityStatus.Open,
                Priority = ActivityPriority.Normal,
                Subject = "Write test " + Guid.NewGuid().ToString("N"),
                Description = "Ask about the other coverage.",
                AssignedToUserId = SampleUsers.Alex,
                DueDate = _db.Database.ServerToday().AddDays(3)
            };
        }

        private Takeback NewTakeback()
        {
            return new Takeback
            {
                ClaimNumber = "AW-" + Guid.NewGuid().ToString("N").Substring(0, 12).ToUpperInvariant(),
                MemberId = _memberId,
                ProviderId = _db.Lookups.SearchProviders("P10001", 1).Single().ProviderId,
                Reason = TakebackReason.DuplicatePayment,
                DateOfService = _db.Database.ServerToday().AddDays(-30),
                OriginalPaidAmount = 500.00m,
                TakebackAmount = 400.00m
            };
        }

        private int CountBySubject(string subject)
        {
            return _db.Database.Scalar<int>("SELECT COUNT(*) FROM dbo.Activity WHERE Subject = N'" + subject.Replace("'", "''") + "'");
        }

        // Timestamps are written by the database (SYSUTCDATETIME); they must be UTC and close to the server's clock.
        private void AssertJustNow(DateTime utc)
        {
            Assert.Equal(DateTimeKind.Utc, utc.Kind);
            Assert.True(Math.Abs((utc - _db.Database.ServerUtcNow()).TotalSeconds) < 120, "Timestamp " + utc.ToString("o") + " is not close to the server's UTC time.");
        }
    }
}
