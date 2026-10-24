using CobLink.Models;

namespace CobLink.Data.Sql
{
    /// <summary>
    /// Row mapping for the takeback result sets. ReadListItem is shared by usp_Takeback_Search and the dashboard's
    /// recent-takebacks result set. Enum columns arrive as &lt;Property&gt;Id integers.
    /// </summary>
    internal static class TakebackMapper
    {
        public static TakebackListItem ReadListItem(RowReader row)
        {
            return new TakebackListItem
            {
                TakebackId = row.GetInt("TakebackId"),
                TakebackNumber = row.GetString("TakebackNumber"),
                ClaimNumber = row.GetString("ClaimNumber"),
                MemberId = row.GetInt("MemberId"),
                MemberNumber = row.GetString("MemberNumber"),
                MemberName = row.GetString("MemberName"),
                ProviderId = row.GetInt("ProviderId"),
                ProviderName = row.GetString("ProviderName"),
                Reason = (TakebackReason)row.GetInt("ReasonId"),
                Status = (TakebackStatus)row.GetInt("StatusId"),
                TakebackAmount = row.GetDecimal("TakebackAmount"),
                RecoveredAmount = row.GetDecimal("RecoveredAmount"),
                NoticeDate = row.GetNullableDate("NoticeDate"),
                DueDate = row.GetNullableDate("DueDate"),
                IsOverdue = row.GetBool("IsOverdue"),
                CreatedByName = row.GetString("CreatedByName"),
                CreatedDate = row.GetUtc("CreatedDate")
            };
        }

        /// <summary>Maps the takeback columns only; Recoveries and History come from the second and third result sets.</summary>
        public static Takeback ReadTakeback(RowReader row)
        {
            return new Takeback
            {
                TakebackId = row.GetInt("TakebackId"),
                TakebackNumber = row.GetString("TakebackNumber"),
                ClaimNumber = row.GetString("ClaimNumber"),
                MemberId = row.GetInt("MemberId"),
                MemberNumber = row.GetString("MemberNumber"),
                MemberName = row.GetString("MemberName"),
                ProviderId = row.GetInt("ProviderId"),
                ProviderNumber = row.GetString("ProviderNumber"),
                ProviderName = row.GetString("ProviderName"),
                Reason = (TakebackReason)row.GetInt("ReasonId"),
                Status = (TakebackStatus)row.GetInt("StatusId"),
                DateOfService = row.GetDate("DateOfService"),
                OriginalPaidAmount = row.GetDecimal("OriginalPaidAmount"),
                TakebackAmount = row.GetDecimal("TakebackAmount"),
                RecoveredAmount = row.GetDecimal("RecoveredAmount"),
                OtherCarrierName = row.GetString("OtherCarrierName"),
                OtherPolicyNumber = row.GetString("OtherPolicyNumber"),
                NoticeDate = row.GetNullableDate("NoticeDate"),
                DueDate = row.GetNullableDate("DueDate"),
                IsOverdue = row.GetBool("IsOverdue"),
                Notes = row.GetString("Notes"),
                ApprovedByUserId = row.GetNullableInt("ApprovedByUserId"),
                ApprovedByName = row.GetString("ApprovedByName"),
                ApprovedDate = row.GetNullableUtc("ApprovedDate"),
                CreatedByUserId = row.GetInt("CreatedByUserId"),
                CreatedByName = row.GetString("CreatedByName"),
                CreatedDate = row.GetUtc("CreatedDate"),
                ModifiedByUserId = row.GetNullableInt("ModifiedByUserId"),
                ModifiedByName = row.GetString("ModifiedByName"),
                ModifiedDate = row.GetNullableUtc("ModifiedDate"),
                RowVersion = row.GetBytes("RowVersion")
            };
        }

        public static TakebackRecovery ReadRecovery(RowReader row)
        {
            return new TakebackRecovery
            {
                RecoveryId = row.GetInt("RecoveryId"),
                TakebackId = row.GetInt("TakebackId"),
                Amount = row.GetDecimal("Amount"),
                RecoveryDate = row.GetDate("RecoveryDate"),
                Method = (RecoveryMethod)row.GetInt("MethodId"),
                ReferenceNumber = row.GetString("ReferenceNumber"),
                Notes = row.GetString("Notes"),
                CreatedByUserId = row.GetInt("CreatedByUserId"),
                CreatedByName = row.GetString("CreatedByName"),
                CreatedDate = row.GetUtc("CreatedDate")
            };
        }

        public static TakebackHistoryEntry ReadHistoryEntry(RowReader row)
        {
            int? fromStatus = row.GetNullableInt("FromStatusId");
            return new TakebackHistoryEntry
            {
                HistoryId = row.GetInt("HistoryId"),
                TakebackId = row.GetInt("TakebackId"),
                Action = row.GetString("Action"),
                FromStatus = fromStatus.HasValue ? (TakebackStatus?)fromStatus.Value : null,
                ToStatus = (TakebackStatus)row.GetInt("ToStatusId"),
                Comment = row.GetString("Comment"),
                ChangedByUserId = row.GetInt("ChangedByUserId"),
                ChangedByName = row.GetString("ChangedByName"),
                ChangedDate = row.GetUtc("ChangedDate")
            };
        }
    }
}
