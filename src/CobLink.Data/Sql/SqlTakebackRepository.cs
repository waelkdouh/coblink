// System.Data.SqlClient is deliberately the legacy provider; moving to Microsoft.Data.SqlClient is a modernization task.
#pragma warning disable CS0618
using System;
using System.Data.SqlClient;
using CobLink.Data.Repositories;
using CobLink.Models;

namespace CobLink.Data.Sql
{
    public class SqlTakebackRepository : ITakebackRepository
    {
        private readonly string _connectionString;

        public SqlTakebackRepository(string connectionString)
        {
            _connectionString = SqlHelper.RequireConnectionString(connectionString);
        }

        public PagedResult<TakebackListItem> Search(TakebackSearchRequest request)
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
                SqlHelper.Int("@ReasonId", (int?)request.Reason),
                SqlHelper.Int("@MemberId", request.MemberId),
                SqlHelper.Int("@ProviderId", request.ProviderId),
                SqlHelper.Int("@CreatedByUserId", request.CreatedByUserId),
                SqlHelper.Money("@MinAmount", request.MinAmount),
                SqlHelper.Money("@MaxAmount", request.MaxAmount),
                SqlHelper.Date("@DueFrom", request.DueFrom),
                SqlHelper.Date("@DueTo", request.DueTo),
                SqlHelper.Bit("@OverdueOnly", request.OverdueOnly),
                SqlHelper.NVarChar("@SortBy", 50, request.SortBy),
                SqlHelper.Bit("@SortDescending", request.SortDescending),
                SqlHelper.Int("@PageNumber", pageNumber),
                SqlHelper.Int("@PageSize", pageSize)
            };

            return SqlHelper.ExecuteReader(_connectionString, "dbo.usp_Takeback_Search", parameters, row =>
            {
                PagedResult<TakebackListItem> result = new PagedResult<TakebackListItem>();
                result.Items = row.ReadList(TakebackMapper.ReadListItem);
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

        public Takeback GetById(int takebackId)
        {
            return SqlHelper.ExecuteReader<Takeback>(
                _connectionString,
                "dbo.usp_Takeback_GetById",
                new[] { SqlHelper.Int("@TakebackId", takebackId) },
                row =>
                {
                    Takeback takeback = row.ReadFirstOrDefault(TakebackMapper.ReadTakeback);
                    if (takeback == null)
                    {
                        return null;
                    }

                    row.NextResult();
                    takeback.Recoveries = row.ReadList(TakebackMapper.ReadRecovery);
                    row.NextResult();
                    takeback.History = row.ReadList(TakebackMapper.ReadHistoryEntry);
                    return takeback;
                });
        }

        public bool ActiveTakebackExists(string claimNumber, int providerId, int excludeTakebackId)
        {
            SqlParameter[] parameters =
            {
                SqlHelper.NVarChar("@ClaimNumber", 30, claimNumber),
                SqlHelper.Int("@ProviderId", providerId),
                SqlHelper.Int("@ExcludeTakebackId", excludeTakebackId)
            };

            return SqlHelper.ExecuteScalar<bool>(_connectionString, "dbo.usp_Takeback_ActiveExists", parameters);
        }

        public int Insert(Takeback takeback, int userId)
        {
            if (takeback == null)
            {
                throw new ArgumentNullException("takeback");
            }

            SqlParameter[] parameters =
            {
                SqlHelper.NVarChar("@ClaimNumber", 30, takeback.ClaimNumber),
                SqlHelper.Int("@MemberId", takeback.MemberId),
                SqlHelper.Int("@ProviderId", takeback.ProviderId),
                SqlHelper.Int("@ReasonId", (int)takeback.Reason),
                SqlHelper.Date("@DateOfService", takeback.DateOfService),
                SqlHelper.Money("@OriginalPaidAmount", takeback.OriginalPaidAmount),
                SqlHelper.Money("@TakebackAmount", takeback.TakebackAmount),
                SqlHelper.NVarChar("@OtherCarrierName", 150, takeback.OtherCarrierName),
                SqlHelper.NVarChar("@OtherPolicyNumber", 50, takeback.OtherPolicyNumber),
                SqlHelper.NVarChar("@Notes", 2000, takeback.Notes),
                SqlHelper.Int("@UserId", userId)
            };

            return SqlHelper.ExecuteScalar<int>(_connectionString, "dbo.usp_Takeback_Insert", parameters);
        }

        public void Update(Takeback takeback, int userId)
        {
            if (takeback == null)
            {
                throw new ArgumentNullException("takeback");
            }

            SqlParameter[] parameters =
            {
                SqlHelper.Int("@TakebackId", takeback.TakebackId),
                SqlHelper.NVarChar("@ClaimNumber", 30, takeback.ClaimNumber),
                SqlHelper.Int("@MemberId", takeback.MemberId),
                SqlHelper.Int("@ProviderId", takeback.ProviderId),
                SqlHelper.Int("@ReasonId", (int)takeback.Reason),
                SqlHelper.Date("@DateOfService", takeback.DateOfService),
                SqlHelper.Money("@OriginalPaidAmount", takeback.OriginalPaidAmount),
                SqlHelper.Money("@TakebackAmount", takeback.TakebackAmount),
                SqlHelper.NVarChar("@OtherCarrierName", 150, takeback.OtherCarrierName),
                SqlHelper.NVarChar("@OtherPolicyNumber", 50, takeback.OtherPolicyNumber),
                SqlHelper.NVarChar("@Notes", 2000, takeback.Notes),
                SqlHelper.RowVersion("@RowVersion", takeback.RowVersion),
                SqlHelper.Int("@UserId", userId)
            };

            SqlHelper.ExecuteNonQuery(_connectionString, "dbo.usp_Takeback_Update", parameters, "Takeback", takeback.TakebackId);
        }

        public void ChangeStatus(TakebackStatusChange change, int userId)
        {
            if (change == null)
            {
                throw new ArgumentNullException("change");
            }

            SqlParameter[] parameters =
            {
                SqlHelper.Int("@TakebackId", change.TakebackId),
                SqlHelper.Int("@NewStatusId", (int)change.NewStatus),
                SqlHelper.NVarChar("@Action", 30, change.Action),
                SqlHelper.NVarChar("@Comment", 2000, change.Comment),
                SqlHelper.RowVersion("@RowVersion", change.RowVersion),
                SqlHelper.Int("@ApprovedByUserId", change.ApprovedByUserId),
                SqlHelper.Utc("@ApprovedDate", change.ApprovedDate),
                SqlHelper.Date("@NoticeDate", change.NoticeDate),
                SqlHelper.Date("@DueDate", change.DueDate),
                SqlHelper.Int("@UserId", userId)
            };

            SqlHelper.ExecuteNonQuery(_connectionString, "dbo.usp_Takeback_ChangeStatus", parameters, "Takeback", change.TakebackId);
        }

        public void AddRecovery(TakebackRecovery recovery, TakebackStatus newStatus, byte[] rowVersion, int userId)
        {
            if (recovery == null)
            {
                throw new ArgumentNullException("recovery");
            }

            SqlParameter[] parameters =
            {
                SqlHelper.Int("@TakebackId", recovery.TakebackId),
                SqlHelper.Money("@Amount", recovery.Amount),
                SqlHelper.Date("@RecoveryDate", recovery.RecoveryDate),
                SqlHelper.Int("@MethodId", (int)recovery.Method),
                SqlHelper.NVarChar("@ReferenceNumber", 50, recovery.ReferenceNumber),
                SqlHelper.NVarChar("@Notes", 500, recovery.Notes),
                SqlHelper.Int("@NewStatusId", (int)newStatus),
                SqlHelper.RowVersion("@RowVersion", rowVersion),
                SqlHelper.Int("@UserId", userId)
            };

            SqlHelper.ExecuteNonQuery(_connectionString, "dbo.usp_Takeback_AddRecovery", parameters, "Takeback", recovery.TakebackId);
        }
    }
}
