using System.Collections.Generic;
using CobLink.Data.Repositories;
using CobLink.Models;

namespace CobLink.Data.Sql
{
    public class SqlLookupRepository : ILookupRepository
    {
        private readonly string _connectionString;

        public SqlLookupRepository(string connectionString)
        {
            _connectionString = SqlHelper.RequireConnectionString(connectionString);
        }

        public LookupData GetLookups()
        {
            // usp_Lookup_GetAll returns exactly seven result sets in this order.
            return SqlHelper.ExecuteReader(_connectionString, "dbo.usp_Lookup_GetAll", null, row =>
            {
                LookupData data = new LookupData();
                data.UserRoles = row.ReadList(ReferenceMapper.ReadLookupItem);
                row.NextResult();
                data.ActivityTypes = row.ReadList(ReferenceMapper.ReadLookupItem);
                row.NextResult();
                data.ActivityStatuses = row.ReadList(ReferenceMapper.ReadLookupItem);
                row.NextResult();
                data.ActivityPriorities = row.ReadList(ReferenceMapper.ReadLookupItem);
                row.NextResult();
                data.TakebackReasons = row.ReadList(ReferenceMapper.ReadLookupItem);
                row.NextResult();
                data.TakebackStatuses = row.ReadList(ReferenceMapper.ReadLookupItem);
                row.NextResult();
                data.RecoveryMethods = row.ReadList(ReferenceMapper.ReadLookupItem);
                return data;
            });
        }

        public IList<Member> SearchMembers(string term, int maxResults)
        {
            if (maxResults < 1)
            {
                return new List<Member>();
            }

            return SqlHelper.ExecuteReader(
                _connectionString,
                "dbo.usp_Member_Search",
                new[]
                {
                    SqlHelper.NVarChar("@Term", 100, term),
                    SqlHelper.Int("@MaxResults", maxResults)
                },
                row => (IList<Member>)row.ReadList(ReferenceMapper.ReadMember));
        }

        public Member GetMember(int memberId)
        {
            return SqlHelper.ExecuteReader(
                _connectionString,
                "dbo.usp_Member_GetById",
                new[] { SqlHelper.Int("@MemberId", memberId) },
                row => row.ReadFirstOrDefault(ReferenceMapper.ReadMember));
        }

        public IList<Provider> SearchProviders(string term, int maxResults)
        {
            if (maxResults < 1)
            {
                return new List<Provider>();
            }

            return SqlHelper.ExecuteReader(
                _connectionString,
                "dbo.usp_Provider_Search",
                new[]
                {
                    SqlHelper.NVarChar("@Term", 100, term),
                    SqlHelper.Int("@MaxResults", maxResults)
                },
                row => (IList<Provider>)row.ReadList(ReferenceMapper.ReadProvider));
        }

        public Provider GetProvider(int providerId)
        {
            return SqlHelper.ExecuteReader(
                _connectionString,
                "dbo.usp_Provider_GetById",
                new[] { SqlHelper.Int("@ProviderId", providerId) },
                row => row.ReadFirstOrDefault(ReferenceMapper.ReadProvider));
        }
    }
}
