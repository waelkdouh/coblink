using CobLink.Api.Infrastructure;
using CobLink.Business.Services;
using CobLink.Models;
using Microsoft.AspNetCore.Mvc;

namespace CobLink.Api.Controllers
{
    public class DashboardController : ApiControllerBase
    {
        private readonly IDashboardService _dashboardService;

        public DashboardController(IDashboardService dashboardService)
        {
            _dashboardService = dashboardService;
        }

        [HttpGet]
        public ServiceResponse<DashboardSummary> GetSummary()
        {
            return Success(_dashboardService.GetSummary());
        }
    }
}
