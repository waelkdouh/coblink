using CobLink.Data.Repositories;
using CobLink.Models;

namespace CobLink.Business.Services
{
    public class DashboardService : IDashboardService
    {
        private readonly IDashboardRepository _dashboard;
        private readonly ICurrentUser _currentUser;

        public DashboardService(IDashboardRepository dashboard, ICurrentUser currentUser)
        {
            _dashboard = dashboard;
            _currentUser = currentUser;
        }

        public DashboardSummary GetSummary()
        {
            return _dashboard.GetSummary(_currentUser.Require().UserId);
        }
    }
}
