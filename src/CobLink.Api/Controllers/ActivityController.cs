using CobLink.Api.Infrastructure;
using CobLink.Business.Services;
using CobLink.Models;
using Microsoft.AspNetCore.Mvc;

namespace CobLink.Api.Controllers
{
    public class ActivityController : ApiControllerBase
    {
        private readonly IActivityService _activityService;

        public ActivityController(IActivityService activityService)
        {
            _activityService = activityService;
        }

        [HttpPost]
        public ServiceResponse<PagedResult<ActivityListItem>> Search(ActivitySearchRequest request)
        {
            return Success(_activityService.Search(request));
        }

        [HttpGet]
        public ServiceResponse<Activity> GetById(int id)
        {
            return Success(_activityService.GetById(id));
        }

        /// <summary>Creates (activityId = 0) or updates an open activity.</summary>
        [HttpPost]
        public ServiceResponse<Activity> Save(SaveActivityRequest request)
        {
            return Success(_activityService.Save(request));
        }

        /// <summary>The comment is the outcome and is required.</summary>
        [HttpPost]
        public ServiceResponse<Activity> Complete(ActivityActionRequest request)
        {
            return Success(_activityService.Complete(request));
        }

        [HttpPost]
        public ServiceResponse<Activity> Reopen(ActivityActionRequest request)
        {
            return Success(_activityService.Reopen(request));
        }

        /// <summary>The comment is the reason and is required.</summary>
        [HttpPost]
        public ServiceResponse<Activity> Cancel(ActivityActionRequest request)
        {
            return Success(_activityService.Cancel(request));
        }

        [HttpPost]
        public ServiceResponse<Activity> AddNote(AddActivityNoteRequest request)
        {
            return Success(_activityService.AddNote(request));
        }
    }
}
