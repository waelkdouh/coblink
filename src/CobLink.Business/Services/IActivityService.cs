using CobLink.Models;

namespace CobLink.Business.Services
{
    public interface IActivityService
    {
        PagedResult<ActivityListItem> Search(ActivitySearchRequest request);

        Activity GetById(int activityId);

        /// <summary>Creates (ActivityId = 0) or updates an open activity.</summary>
        Activity Save(SaveActivityRequest request);

        Activity Complete(ActivityActionRequest request);

        Activity Reopen(ActivityActionRequest request);

        Activity Cancel(ActivityActionRequest request);

        Activity AddNote(AddActivityNoteRequest request);
    }
}
