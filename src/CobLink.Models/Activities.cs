using System;
using System.Collections.Generic;

namespace CobLink.Models
{
    /// <summary>Names of the actions a user can perform on an activity (Activity.AvailableActions).</summary>
    public static class ActivityActions
    {
        public const string Edit = "Edit";
        public const string Complete = "Complete";
        public const string Reopen = "Reopen";
        public const string Cancel = "Cancel";
        public const string AddNote = "AddNote";
    }

    public class Activity
    {
        public int ActivityId { get; set; }
        public string ActivityNumber { get; set; }

        public int? MemberId { get; set; }
        public string MemberNumber { get; set; }
        public string MemberName { get; set; }

        public int? TakebackId { get; set; }
        public string TakebackNumber { get; set; }

        public ActivityType ActivityType { get; set; }
        public ActivityStatus Status { get; set; }
        public ActivityPriority Priority { get; set; }

        public string Subject { get; set; }
        public string Description { get; set; }

        public int? AssignedToUserId { get; set; }
        public string AssignedToName { get; set; }

        /// <summary>Calendar date (no time zone semantics).</summary>
        public DateTime? DueDate { get; set; }

        /// <summary>UTC timestamp.</summary>
        public DateTime? CompletedDate { get; set; }

        public string Outcome { get; set; }

        /// <summary>Calculated by the database: due date passed and status is Open or InProgress.</summary>
        public bool IsOverdue { get; set; }

        public int CreatedByUserId { get; set; }
        public string CreatedByName { get; set; }
        public DateTime CreatedDate { get; set; }
        public int? ModifiedByUserId { get; set; }
        public string ModifiedByName { get; set; }
        public DateTime? ModifiedDate { get; set; }

        /// <summary>SQL Server rowversion; serialised as base64 and echoed back by the client for optimistic concurrency.</summary>
        public byte[] RowVersion { get; set; }

        public List<ActivityNote> Notes { get; set; } = new List<ActivityNote>();

        /// <summary>Filled in by the business layer for the current user (see ActivityActions).</summary>
        public List<string> AvailableActions { get; set; } = new List<string>();
    }

    public class ActivityListItem
    {
        public int ActivityId { get; set; }
        public string ActivityNumber { get; set; }
        public string Subject { get; set; }
        public ActivityType ActivityType { get; set; }
        public ActivityStatus Status { get; set; }
        public ActivityPriority Priority { get; set; }
        public int? MemberId { get; set; }
        public string MemberNumber { get; set; }
        public string MemberName { get; set; }
        public int? TakebackId { get; set; }
        public string TakebackNumber { get; set; }
        public int? AssignedToUserId { get; set; }
        public string AssignedToName { get; set; }
        public DateTime? DueDate { get; set; }
        public DateTime? CompletedDate { get; set; }
        public bool IsOverdue { get; set; }
        public DateTime CreatedDate { get; set; }
    }

    public class ActivityNote
    {
        public int NoteId { get; set; }
        public int ActivityId { get; set; }
        public string NoteText { get; set; }

        /// <summary>True for notes written automatically when the activity changes state.</summary>
        public bool IsSystem { get; set; }

        public int CreatedByUserId { get; set; }
        public string CreatedByName { get; set; }
        public DateTime CreatedDate { get; set; }
    }

    public class ActivitySearchRequest : PagedRequest
    {
        /// <summary>Matches activity number, subject, description, member name/number and takeback number.</summary>
        public string SearchText { get; set; }

        public ActivityStatus? Status { get; set; }

        /// <summary>When true only Open and InProgress activities are returned.</summary>
        public bool OpenOnly { get; set; }

        public ActivityType? ActivityType { get; set; }
        public ActivityPriority? Priority { get; set; }
        public int? AssignedToUserId { get; set; }
        public int? MemberId { get; set; }
        public int? TakebackId { get; set; }
        public DateTime? DueFrom { get; set; }
        public DateTime? DueTo { get; set; }
        public bool OverdueOnly { get; set; }
    }

    /// <summary>Create (ActivityId = 0) or update an activity. Status may only be Open or InProgress here.</summary>
    public class SaveActivityRequest
    {
        public int ActivityId { get; set; }
        public int? MemberId { get; set; }
        public int? TakebackId { get; set; }
        public ActivityType ActivityType { get; set; }
        public ActivityPriority Priority { get; set; }
        public ActivityStatus Status { get; set; } = ActivityStatus.Open;
        public string Subject { get; set; }
        public string Description { get; set; }
        public int? AssignedToUserId { get; set; }
        public DateTime? DueDate { get; set; }
        public byte[] RowVersion { get; set; }
    }

    /// <summary>
    /// Used by Complete (Comment = outcome, required), Cancel (Comment = reason, required) and Reopen (Comment optional).
    /// </summary>
    public class ActivityActionRequest
    {
        public int ActivityId { get; set; }
        public string Comment { get; set; }
        public byte[] RowVersion { get; set; }
    }

    public class AddActivityNoteRequest
    {
        public int ActivityId { get; set; }
        public string NoteText { get; set; }
    }
}
