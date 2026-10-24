using CobLink.Models;

namespace CobLink.Business.Services
{
    public interface ITakebackService
    {
        PagedResult<TakebackListItem> Search(TakebackSearchRequest request);

        Takeback GetById(int takebackId);

        /// <summary>Creates (TakebackId = 0) or updates a Draft or Rejected takeback.</summary>
        Takeback Save(SaveTakebackRequest request);

        Takeback Submit(TakebackActionRequest request);

        Takeback Approve(TakebackActionRequest request);

        Takeback Reject(TakebackActionRequest request);

        Takeback SendNotice(TakebackActionRequest request);

        Takeback RecordRecovery(RecordRecoveryRequest request);

        Takeback Dispute(TakebackActionRequest request);

        Takeback ResolveDispute(ResolveDisputeRequest request);

        Takeback WriteOff(TakebackActionRequest request);

        Takeback Cancel(TakebackActionRequest request);
    }
}
