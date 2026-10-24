using System.Collections.Generic;

namespace CobLink.Models
{
    public class StatusCount
    {
        public int StatusId { get; set; }
        public int Count { get; set; }

        /// <summary>Sum of takeback amounts (always 0 for activity counts).</summary>
        public decimal Amount { get; set; }
    }

    public class DashboardSummary
    {
        // Activity tracking
        public int MyOpenActivities { get; set; }
        public int MyOverdueActivities { get; set; }
        public int OpenActivities { get; set; }
        public int OverdueActivities { get; set; }
        public int ActivitiesDueThisWeek { get; set; }
        public List<StatusCount> ActivitiesByStatus { get; set; } = new List<StatusCount>();
        public List<ActivityListItem> MyUpcomingActivities { get; set; } = new List<ActivityListItem>();

        // Takebacks
        public int TakebacksPendingApproval { get; set; }
        public int ActiveTakebacks { get; set; }
        public int OverdueTakebacks { get; set; }

        /// <summary>Takeback amount of Approved, NoticeSent, PartiallyRecovered, Recovered and Disputed takebacks.</summary>
        public decimal TotalTakebackAmount { get; set; }

        /// <summary>Recovered amount of the same set of takebacks.</summary>
        public decimal TotalRecoveredAmount { get; set; }

        public decimal TotalOutstandingAmount
        {
            get { return TotalTakebackAmount - TotalRecoveredAmount; }
        }

        public List<StatusCount> TakebacksByStatus { get; set; } = new List<StatusCount>();
        public List<TakebackListItem> RecentTakebacks { get; set; } = new List<TakebackListItem>();
    }
}
