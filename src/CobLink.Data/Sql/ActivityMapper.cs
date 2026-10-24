using CobLink.Models;

namespace CobLink.Data.Sql
{
    /// <summary>
    /// Row mapping for the activity result sets. ReadListItem is shared by usp_Activity_Search and the dashboard's
    /// upcoming-activities result set. Enum columns arrive as &lt;Property&gt;Id integers.
    /// </summary>
    internal static class ActivityMapper
    {
        public static ActivityListItem ReadListItem(RowReader row)
        {
            return new ActivityListItem
            {
                ActivityId = row.GetInt("ActivityId"),
                ActivityNumber = row.GetString("ActivityNumber"),
                Subject = row.GetString("Subject"),
                ActivityType = (ActivityType)row.GetInt("ActivityTypeId"),
                Status = (ActivityStatus)row.GetInt("StatusId"),
                Priority = (ActivityPriority)row.GetInt("PriorityId"),
                MemberId = row.GetNullableInt("MemberId"),
                MemberNumber = row.GetString("MemberNumber"),
                MemberName = row.GetString("MemberName"),
                TakebackId = row.GetNullableInt("TakebackId"),
                TakebackNumber = row.GetString("TakebackNumber"),
                AssignedToUserId = row.GetNullableInt("AssignedToUserId"),
                AssignedToName = row.GetString("AssignedToName"),
                DueDate = row.GetNullableDate("DueDate"),
                CompletedDate = row.GetNullableUtc("CompletedDate"),
                IsOverdue = row.GetBool("IsOverdue"),
                CreatedDate = row.GetUtc("CreatedDate")
            };
        }

        /// <summary>Maps the activity columns only; Notes are read from the second result set by the repository.</summary>
        public static Activity ReadActivity(RowReader row)
        {
            return new Activity
            {
                ActivityId = row.GetInt("ActivityId"),
                ActivityNumber = row.GetString("ActivityNumber"),
                MemberId = row.GetNullableInt("MemberId"),
                MemberNumber = row.GetString("MemberNumber"),
                MemberName = row.GetString("MemberName"),
                TakebackId = row.GetNullableInt("TakebackId"),
                TakebackNumber = row.GetString("TakebackNumber"),
                ActivityType = (ActivityType)row.GetInt("ActivityTypeId"),
                Status = (ActivityStatus)row.GetInt("StatusId"),
                Priority = (ActivityPriority)row.GetInt("PriorityId"),
                Subject = row.GetString("Subject"),
                Description = row.GetString("Description"),
                AssignedToUserId = row.GetNullableInt("AssignedToUserId"),
                AssignedToName = row.GetString("AssignedToName"),
                DueDate = row.GetNullableDate("DueDate"),
                CompletedDate = row.GetNullableUtc("CompletedDate"),
                Outcome = row.GetString("Outcome"),
                IsOverdue = row.GetBool("IsOverdue"),
                CreatedByUserId = row.GetInt("CreatedByUserId"),
                CreatedByName = row.GetString("CreatedByName"),
                CreatedDate = row.GetUtc("CreatedDate"),
                ModifiedByUserId = row.GetNullableInt("ModifiedByUserId"),
                ModifiedByName = row.GetString("ModifiedByName"),
                ModifiedDate = row.GetNullableUtc("ModifiedDate"),
                RowVersion = row.GetBytes("RowVersion")
            };
        }

        public static ActivityNote ReadNote(RowReader row)
        {
            return new ActivityNote
            {
                NoteId = row.GetInt("NoteId"),
                ActivityId = row.GetInt("ActivityId"),
                NoteText = row.GetString("NoteText"),
                IsSystem = row.GetBool("IsSystem"),
                CreatedByUserId = row.GetInt("CreatedByUserId"),
                CreatedByName = row.GetString("CreatedByName"),
                CreatedDate = row.GetUtc("CreatedDate")
            };
        }
    }
}
