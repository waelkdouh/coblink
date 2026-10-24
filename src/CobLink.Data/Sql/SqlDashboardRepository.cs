using CobLink.Data.Repositories;
using CobLink.Models;

namespace CobLink.Data.Sql
{
    public class SqlDashboardRepository : IDashboardRepository
    {
        private readonly string _connectionString;

        public SqlDashboardRepository(string connectionString)
        {
            _connectionString = SqlHelper.RequireConnectionString(connectionString);
        }

        public DashboardSummary GetSummary(int userId)
        {
            return SqlHelper.ExecuteReader(
                _connectionString,
                "dbo.usp_Dashboard_GetSummary",
                new[] { SqlHelper.Int("@UserId", userId) },
                ReadSummary);
        }

        // Result sets: 1 totals (one row), 2 activities by status, 3 takebacks by status, 4 upcoming activities
        // (same columns as usp_Activity_Search), 5 recent takebacks (same columns as usp_Takeback_Search).
        private static DashboardSummary ReadSummary(RowReader row)
        {
            DashboardSummary summary = new DashboardSummary();

            if (row.Read())
            {
                summary.MyOpenActivities = row.GetInt("MyOpenActivities");
                summary.MyOverdueActivities = row.GetInt("MyOverdueActivities");
                summary.OpenActivities = row.GetInt("OpenActivities");
                summary.OverdueActivities = row.GetInt("OverdueActivities");
                summary.ActivitiesDueThisWeek = row.GetInt("ActivitiesDueThisWeek");
                summary.TakebacksPendingApproval = row.GetInt("TakebacksPendingApproval");
                summary.ActiveTakebacks = row.GetInt("ActiveTakebacks");
                summary.OverdueTakebacks = row.GetInt("OverdueTakebacks");
                summary.TotalTakebackAmount = row.GetDecimal("TotalTakebackAmount");
                summary.TotalRecoveredAmount = row.GetDecimal("TotalRecoveredAmount");
            }

            row.NextResult();
            summary.ActivitiesByStatus = row.ReadList(ReadActivityStatusCount);
            row.NextResult();
            summary.TakebacksByStatus = row.ReadList(ReadTakebackStatusCount);
            row.NextResult();
            summary.MyUpcomingActivities = row.ReadList(ActivityMapper.ReadListItem);
            row.NextResult();
            summary.RecentTakebacks = row.ReadList(TakebackMapper.ReadListItem);
            return summary;
        }

        private static StatusCount ReadActivityStatusCount(RowReader row)
        {
            return new StatusCount
            {
                StatusId = row.GetInt("StatusId"),
                Count = row.GetInt("Count"),
                Amount = 0m
            };
        }

        private static StatusCount ReadTakebackStatusCount(RowReader row)
        {
            return new StatusCount
            {
                StatusId = row.GetInt("StatusId"),
                Count = row.GetInt("Count"),
                Amount = row.GetDecimal("Amount")
            };
        }
    }
}
