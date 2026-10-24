using System.Collections.Generic;
using CobLink.Data.Repositories;
using CobLink.Models;

namespace CobLink.Data.Sql
{
    public class SqlUserRepository : IUserRepository
    {
        private readonly string _connectionString;

        public SqlUserRepository(string connectionString)
        {
            _connectionString = SqlHelper.RequireConnectionString(connectionString);
        }

        public AppUser GetById(int userId)
        {
            return SqlHelper.ExecuteReader(
                _connectionString,
                "dbo.usp_User_GetById",
                new[] { SqlHelper.Int("@UserId", userId) },
                row => row.ReadFirstOrDefault(ReferenceMapper.ReadUser));
        }

        public AppUser GetByUserName(string userName)
        {
            return SqlHelper.ExecuteReader(
                _connectionString,
                "dbo.usp_User_GetByUserName",
                new[] { SqlHelper.NVarChar("@UserName", 100, userName) },
                row => row.ReadFirstOrDefault(ReferenceMapper.ReadUser));
        }

        public IList<AppUser> GetActiveUsers()
        {
            return SqlHelper.ExecuteReader(
                _connectionString,
                "dbo.usp_User_GetActive",
                null,
                row => (IList<AppUser>)row.ReadList(ReferenceMapper.ReadUser));
        }
    }
}
