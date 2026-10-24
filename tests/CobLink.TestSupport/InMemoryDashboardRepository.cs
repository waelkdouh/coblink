using System;
using System.Collections.Generic;
using System.Linq;
using CobLink.Data.Repositories;
using CobLink.Models;

namespace CobLink.TestSupport
{
    /// <summary>Computes the dashboard figures of docs/api-reference.md section 5 from the in-memory tables.</summary>
    public class InMemoryDashboardRepository : IDashboardRepository
    {
        private static readonly TakebackStatus[] FinancialStatuses =
        {
            TakebackStatus.Approved, TakebackStatus.NoticeSent, TakebackStatus.PartiallyRecovered,
            TakebackStatus.Recovered, TakebackStatus.Disputed
        };

        private static readonly TakebackStatus[] ActiveStatuses =
        {
            TakebackStatus.NoticeSent, TakebackStatus.PartiallyRecovered, TakebackStatus.Disputed
        };

        private readonly FakeDatabase _db;
        private readonly IActivityRepository _activities;
        private readonly ITakebackRepository _takebacks;

        public InMemoryDashboardRepository(FakeDatabase db, IActivityRepository activities, ITakebackRepository takebacks)
        {
            _db = db;
            _activities = activities;
            _takebacks = takebacks;
        }

        public DashboardSummary GetSummary(int userId)
        {
            DateTime today = _db.Clock.Today;
            List<Activity> open = _db.Activities
                .Where(a => a.Status == ActivityStatus.Open || a.Status == ActivityStatus.InProgress)
                .ToList();
            List<Activity> mine = open.Where(a => a.AssignedToUserId == userId).ToList();

            var summary = new DashboardSummary
            {
                MyOpenActivities = mine.Count,
                MyOverdueActivities = mine.Count(a => _db.IsOverdue(a)),
                OpenActivities = open.Count,
                OverdueActivities = open.Count(a => _db.IsOverdue(a)),
                ActivitiesDueThisWeek = open.Count(a =>
                    a.DueDate.HasValue && a.DueDate.Value.Date >= today && a.DueDate.Value.Date <= today.AddDays(7)),
                ActivitiesByStatus = _db.Activities
                    .GroupBy(a => a.Status)
                    .OrderBy(g => (int)g.Key)
                    .Select(g => new StatusCount { StatusId = (int)g.Key, Count = g.Count(), Amount = 0m })
                    .ToList(),
                MyUpcomingActivities = _activities.Search(new ActivitySearchRequest
                {
                    AssignedToUserId = userId,
                    OpenOnly = true,
                    PageNumber = 1,
                    PageSize = 5
                }).Items
            };

            List<Takeback> financial = _db.Takebacks.Where(t => FinancialStatuses.Contains(t.Status)).ToList();
            summary.TakebacksPendingApproval = _db.Takebacks.Count(t => t.Status == TakebackStatus.PendingApproval);
            summary.ActiveTakebacks = _db.Takebacks.Count(t => ActiveStatuses.Contains(t.Status));
            summary.OverdueTakebacks = _db.Takebacks.Count(t => _db.IsOverdue(t));
            summary.TotalTakebackAmount = financial.Sum(t => t.TakebackAmount);
            summary.TotalRecoveredAmount = financial.Sum(t => t.RecoveredAmount);
            summary.TakebacksByStatus = _db.Takebacks
                .GroupBy(t => t.Status)
                .OrderBy(g => (int)g.Key)
                .Select(g => new StatusCount { StatusId = (int)g.Key, Count = g.Count(), Amount = g.Sum(t => t.TakebackAmount) })
                .ToList();
            summary.RecentTakebacks = _takebacks.Search(new TakebackSearchRequest { PageNumber = 1, PageSize = 5 }).Items;
            return summary;
        }
    }
}
