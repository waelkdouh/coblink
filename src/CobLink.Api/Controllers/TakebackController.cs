using CobLink.Api.Infrastructure;
using CobLink.Business.Services;
using CobLink.Models;
using Microsoft.AspNetCore.Mvc;

namespace CobLink.Api.Controllers
{
    public class TakebackController : ApiControllerBase
    {
        private readonly ITakebackService _takebackService;

        public TakebackController(ITakebackService takebackService)
        {
            _takebackService = takebackService;
        }

        [HttpPost]
        public ServiceResponse<PagedResult<TakebackListItem>> Search(TakebackSearchRequest request)
        {
            return Success(_takebackService.Search(request));
        }

        [HttpGet]
        public ServiceResponse<Takeback> GetById(int id)
        {
            return Success(_takebackService.GetById(id));
        }

        /// <summary>Creates (takebackId = 0) or updates a Draft or Rejected takeback.</summary>
        [HttpPost]
        public ServiceResponse<Takeback> Save(SaveTakebackRequest request)
        {
            return Success(_takebackService.Save(request));
        }

        [HttpPost]
        public ServiceResponse<Takeback> Submit(TakebackActionRequest request)
        {
            return Success(_takebackService.Submit(request));
        }

        [HttpPost]
        public ServiceResponse<Takeback> Approve(TakebackActionRequest request)
        {
            return Success(_takebackService.Approve(request));
        }

        [HttpPost]
        public ServiceResponse<Takeback> Reject(TakebackActionRequest request)
        {
            return Success(_takebackService.Reject(request));
        }

        [HttpPost]
        public ServiceResponse<Takeback> SendNotice(TakebackActionRequest request)
        {
            return Success(_takebackService.SendNotice(request));
        }

        [HttpPost]
        public ServiceResponse<Takeback> RecordRecovery(RecordRecoveryRequest request)
        {
            return Success(_takebackService.RecordRecovery(request));
        }

        [HttpPost]
        public ServiceResponse<Takeback> Dispute(TakebackActionRequest request)
        {
            return Success(_takebackService.Dispute(request));
        }

        [HttpPost]
        public ServiceResponse<Takeback> ResolveDispute(ResolveDisputeRequest request)
        {
            return Success(_takebackService.ResolveDispute(request));
        }

        [HttpPost]
        public ServiceResponse<Takeback> WriteOff(TakebackActionRequest request)
        {
            return Success(_takebackService.WriteOff(request));
        }

        [HttpPost]
        public ServiceResponse<Takeback> Cancel(TakebackActionRequest request)
        {
            return Success(_takebackService.Cancel(request));
        }
    }
}
