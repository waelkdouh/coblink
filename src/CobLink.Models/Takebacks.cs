using System;
using System.Collections.Generic;

namespace CobLink.Models
{
    /// <summary>
    /// Action names. Used for Takeback.AvailableActions and as the Action column of the takeback history.
    /// "Create" only ever appears in the history.
    /// </summary>
    public static class TakebackActions
    {
        public const string Create = "Create";
        public const string Edit = "Edit";
        public const string Submit = "Submit";
        public const string Approve = "Approve";
        public const string Reject = "Reject";
        public const string SendNotice = "SendNotice";
        public const string RecordRecovery = "RecordRecovery";
        public const string Dispute = "Dispute";
        public const string ResolveDispute = "ResolveDispute";
        public const string WriteOff = "WriteOff";
        public const string Cancel = "Cancel";
    }

    /// <summary>A recoupment of money previously paid on a claim (e.g. because another carrier is primary).</summary>
    public class Takeback
    {
        public int TakebackId { get; set; }
        public string TakebackNumber { get; set; }
        public string ClaimNumber { get; set; }

        public int MemberId { get; set; }
        public string MemberNumber { get; set; }
        public string MemberName { get; set; }

        public int ProviderId { get; set; }
        public string ProviderNumber { get; set; }
        public string ProviderName { get; set; }

        public TakebackReason Reason { get; set; }
        public TakebackStatus Status { get; set; }

        public DateTime DateOfService { get; set; }
        public decimal OriginalPaidAmount { get; set; }
        public decimal TakebackAmount { get; set; }
        public decimal RecoveredAmount { get; set; }

        public decimal OutstandingAmount
        {
            get { return TakebackAmount - RecoveredAmount; }
        }

        public string OtherCarrierName { get; set; }
        public string OtherPolicyNumber { get; set; }

        /// <summary>Date the recoupment notice was sent to the provider.</summary>
        public DateTime? NoticeDate { get; set; }

        /// <summary>Date by which the provider must respond / repay.</summary>
        public DateTime? DueDate { get; set; }

        /// <summary>Calculated by the database: due date passed while NoticeSent or PartiallyRecovered.</summary>
        public bool IsOverdue { get; set; }

        public string Notes { get; set; }

        public int? ApprovedByUserId { get; set; }
        public string ApprovedByName { get; set; }
        public DateTime? ApprovedDate { get; set; }

        public int CreatedByUserId { get; set; }
        public string CreatedByName { get; set; }
        public DateTime CreatedDate { get; set; }
        public int? ModifiedByUserId { get; set; }
        public string ModifiedByName { get; set; }
        public DateTime? ModifiedDate { get; set; }

        public byte[] RowVersion { get; set; }

        public List<TakebackRecovery> Recoveries { get; set; } = new List<TakebackRecovery>();
        public List<TakebackHistoryEntry> History { get; set; } = new List<TakebackHistoryEntry>();

        /// <summary>Activities linked to this takeback; filled in by the business layer.</summary>
        public List<ActivityListItem> LinkedActivities { get; set; } = new List<ActivityListItem>();

        /// <summary>Filled in by the business layer for the current user (see TakebackActions).</summary>
        public List<string> AvailableActions { get; set; } = new List<string>();
    }

    public class TakebackListItem
    {
        public int TakebackId { get; set; }
        public string TakebackNumber { get; set; }
        public string ClaimNumber { get; set; }
        public int MemberId { get; set; }
        public string MemberNumber { get; set; }
        public string MemberName { get; set; }
        public int ProviderId { get; set; }
        public string ProviderName { get; set; }
        public TakebackReason Reason { get; set; }
        public TakebackStatus Status { get; set; }
        public decimal TakebackAmount { get; set; }
        public decimal RecoveredAmount { get; set; }

        public decimal OutstandingAmount
        {
            get { return TakebackAmount - RecoveredAmount; }
        }

        public DateTime? NoticeDate { get; set; }
        public DateTime? DueDate { get; set; }
        public bool IsOverdue { get; set; }
        public string CreatedByName { get; set; }
        public DateTime CreatedDate { get; set; }
    }

    public class TakebackRecovery
    {
        public int RecoveryId { get; set; }
        public int TakebackId { get; set; }
        public decimal Amount { get; set; }
        public DateTime RecoveryDate { get; set; }
        public RecoveryMethod Method { get; set; }
        public string ReferenceNumber { get; set; }
        public string Notes { get; set; }
        public int CreatedByUserId { get; set; }
        public string CreatedByName { get; set; }
        public DateTime CreatedDate { get; set; }
    }

    public class TakebackHistoryEntry
    {
        public int HistoryId { get; set; }
        public int TakebackId { get; set; }

        /// <summary>One of TakebackActions.</summary>
        public string Action { get; set; }

        public TakebackStatus? FromStatus { get; set; }
        public TakebackStatus ToStatus { get; set; }
        public string Comment { get; set; }
        public int ChangedByUserId { get; set; }
        public string ChangedByName { get; set; }
        public DateTime ChangedDate { get; set; }
    }

    public class TakebackSearchRequest : PagedRequest
    {
        /// <summary>Matches takeback number, claim number, member name/number and provider name/number.</summary>
        public string SearchText { get; set; }

        public TakebackStatus? Status { get; set; }
        public TakebackReason? Reason { get; set; }
        public int? MemberId { get; set; }
        public int? ProviderId { get; set; }
        public int? CreatedByUserId { get; set; }
        public decimal? MinAmount { get; set; }
        public decimal? MaxAmount { get; set; }
        public DateTime? DueFrom { get; set; }
        public DateTime? DueTo { get; set; }
        public bool OverdueOnly { get; set; }
    }

    /// <summary>Create (TakebackId = 0) or update a takeback that is still editable (Draft or Rejected).</summary>
    public class SaveTakebackRequest
    {
        public int TakebackId { get; set; }
        public string ClaimNumber { get; set; }
        public int MemberId { get; set; }
        public int ProviderId { get; set; }
        public TakebackReason Reason { get; set; }
        public DateTime DateOfService { get; set; }
        public decimal OriginalPaidAmount { get; set; }
        public decimal TakebackAmount { get; set; }
        public string OtherCarrierName { get; set; }
        public string OtherPolicyNumber { get; set; }
        public string Notes { get; set; }
        public byte[] RowVersion { get; set; }
    }

    /// <summary>
    /// Used by Submit, Approve, Reject, SendNotice, Dispute, WriteOff and Cancel.
    /// Comment is mandatory for Reject, Dispute, WriteOff and Cancel.
    /// </summary>
    public class TakebackActionRequest
    {
        public int TakebackId { get; set; }
        public string Comment { get; set; }
        public byte[] RowVersion { get; set; }
    }

    public class ResolveDisputeRequest : TakebackActionRequest
    {
        /// <summary>True = the takeback stands and recovery resumes; false = the dispute is accepted and the takeback is cancelled.</summary>
        public bool Upheld { get; set; }
    }

    public class RecordRecoveryRequest
    {
        public int TakebackId { get; set; }
        public decimal Amount { get; set; }
        public DateTime RecoveryDate { get; set; }
        public RecoveryMethod Method { get; set; }
        public string ReferenceNumber { get; set; }
        public string Notes { get; set; }
        public byte[] RowVersion { get; set; }
    }

    /// <summary>Data-layer command that moves a takeback to a new status (and optionally stamps dates / approver).</summary>
    public class TakebackStatusChange
    {
        public int TakebackId { get; set; }
        public TakebackStatus NewStatus { get; set; }

        /// <summary>One of TakebackActions; written to the history.</summary>
        public string Action { get; set; }

        public string Comment { get; set; }
        public byte[] RowVersion { get; set; }

        // Non-null values overwrite the stored value; null leaves it unchanged.
        public int? ApprovedByUserId { get; set; }
        public DateTime? ApprovedDate { get; set; }
        public DateTime? NoticeDate { get; set; }
        public DateTime? DueDate { get; set; }
    }
}
