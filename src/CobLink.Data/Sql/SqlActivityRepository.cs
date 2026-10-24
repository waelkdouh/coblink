// System.Data.SqlClient is deliberately the legacy provider; moving to Microsoft.Data.SqlClient is a modernization task.
#pragma warning disable CS0618
using System;
using System.Data.SqlClient;
using CobLink.Data.Repositories;
using CobLink.Models;

namespace CobLink.Data.Sql
{
    public class SqlActivityRepository : IActivityRepository
    {
        private readonly string _connectionString;

        public SqlActivityRepository(string connectionString)
        {
            _connectionString = SqlHelper.RequireConnectionString(connectionString);
        }

        public PagedResult<ActivityListItem> Search(ActivitySearchRequest request)
        {
            if (request == null)
            {
                throw new ArgumentNullException("request");
            }

            int pageNumber = SqlHelper.ClampPageNumber(request.PageNumber);
            int pageSize = SqlHelper.ClampPageSize(request.PageSize);

            SqlParameter[] parameters =
            {
                SqlHelper.NVarChar("@SearchText", 200, SqlHelper.NullIfEmpty(request.SearchText)),
                SqlHelper.Int("@StatusId", (int?)request.Status),
                SqlHelper.Bit("@OpenOnly", request.OpenOnly),
                SqlHelper.Int("@ActivityTypeId", (int?)request.ActivityType),
                SqlHelper.Int("@PriorityId", (int?)request.Priority),
                SqlHelper.Int("@AssignedToUserId", request.AssignedToUserId),
                SqlHelper.Int("@MemberId", request.MemberId),
                SqlHelper.Int("@TakebackId", request.TakebackId),
                SqlHelper.Date("@DueFrom", request.DueFrom),
                SqlHelper.Date("@DueTo", request.DueTo),
                SqlHelper.Bit("@OverdueOnly", request.OverdueOnly),
                SqlHelper.NVarChar("@SortBy", 50, request.SortBy),
                SqlHelper.Bit("@SortDescending", request.SortDescending),
                SqlHelper.Int("@PageNumber", pageNumber),
                SqlHelper.Int("@PageSize", pageSize)
            };

            return SqlHelper.ExecuteReader(_connectionString, "dbo.usp_Activity_Search", parameters, row =>
            {
                PagedResult<ActivityListItem> result = new PagedResult<ActivityListItem>();
                result.Items = row.ReadList(ActivityMapper.ReadListItem);
                row.NextResult();
                if (row.Read())
                {
                    result.TotalCount = row.GetInt("TotalCount");
                }

                result.PageNumber = pageNumber;
                result.PageSize = pageSize;
                return result;
            });
        }

        public Activity GetById(int activityId)
        {
            return SqlHelper.ExecuteReader<Activity>(
                _connectionString,
                "dbo.usp_Activity_GetById",
                new[] { SqlHelper.Int("@ActivityId", activityId) },
                row =>
                {
                    Activity activity = row.ReadFirstOrDefault(ActivityMapper.ReadActivity);
                    if (activity == null)
                    {
                        return null;
                    }

                    row.NextResult();
                    activity.Notes = row.ReadList(ActivityMapper.ReadNote);
                    return activity;
                });
        }

        public int Insert(Activity activity, int userId)
        {
            if (activity == null)
            {
                throw new ArgumentNullException("activity");
            }

            SqlParameter[] parameters =
            {
                SqlHelper.Int("@MemberId", activity.MemberId),
                SqlHelper.Int("@TakebackId", activity.TakebackId),
                SqlHelper.Int("@ActivityTypeId", (int)activity.ActivityType),
                SqlHelper.Int("@StatusId", (int)activity.Status),
                SqlHelper.Int("@PriorityId", (int)activity.Priority),
                SqlHelper.NVarChar("@Subject", 200, activity.Subject),
                SqlHelper.NVarChar("@Description", 4000, activity.Description),
                SqlHelper.Int("@AssignedToUserId", activity.AssignedToUserId),
                SqlHelper.Date("@DueDate", activity.DueDate),
                SqlHelper.Utc("@CompletedDate", activity.CompletedDate),
                SqlHelper.NVarChar("@Outcome", 1000, activity.Outcome),
                SqlHelper.Int("@UserId", userId)
            };

            return SqlHelper.ExecuteScalar<int>(_connectionString, "dbo.usp_Activity_Insert", parameters);
        }

        public void Update(Activity activity, int userId)
        {
            if (activity == null)
            {
                throw new ArgumentNullException("activity");
            }

            SqlParameter[] parameters =
            {
                SqlHelper.Int("@ActivityId", activity.ActivityId),
                SqlHelper.Int("@MemberId", activity.MemberId),
                SqlHelper.Int("@TakebackId", activity.TakebackId),
                SqlHelper.Int("@ActivityTypeId", (int)activity.ActivityType),
                SqlHelper.Int("@StatusId", (int)activity.Status),
                SqlHelper.Int("@PriorityId", (int)activity.Priority),
                SqlHelper.NVarChar("@Subject", 200, activity.Subject),
                SqlHelper.NVarChar("@Description", 4000, activity.Description),
                SqlHelper.Int("@AssignedToUserId", activity.AssignedToUserId),
                SqlHelper.Date("@DueDate", activity.DueDate),
                SqlHelper.Utc("@CompletedDate", activity.CompletedDate),
                SqlHelper.NVarChar("@Outcome", 1000, activity.Outcome),
                SqlHelper.RowVersion("@RowVersion", activity.RowVersion),
                SqlHelper.Int("@UserId", userId)
            };

            SqlHelper.ExecuteNonQuery(_connectionString, "dbo.usp_Activity_Update", parameters, "Activity", activity.ActivityId);
        }

        public ActivityNote AddNote(int activityId, string noteText, bool isSystem, int userId)
        {
            SqlParameter[] parameters =
            {
                SqlHelper.Int("@ActivityId", activityId),
                SqlHelper.NVarChar("@NoteText", 2000, noteText),
                SqlHelper.Bit("@IsSystem", isSystem),
                SqlHelper.Int("@UserId", userId)
            };

            return SqlHelper.ExecuteReader(
                _connectionString,
                "dbo.usp_Activity_AddNote",
                parameters,
                row => row.ReadFirstOrDefault(ActivityMapper.ReadNote),
                "Activity",
                activityId);
        }
    }
}
