// System.Data.SqlClient is deliberately the legacy provider; moving to Microsoft.Data.SqlClient is a modernization task.
#pragma warning disable CS0618
using System;
using System.Data;
using System.Data.SqlClient;
using CobLink.Data.Repositories;

namespace CobLink.Data.Sql
{
    public class SqlDatabaseStatus : IDatabaseStatus
    {
        private const int MaxConnectTimeoutSeconds = 5;

        private readonly string _connectionString;

        public SqlDatabaseStatus(string connectionString)
        {
            _connectionString = SqlHelper.RequireConnectionString(connectionString);
        }

        public bool CanConnect(out string error)
        {
            try
            {
                // A health probe must answer quickly even when the server is down (the default timeout is 15 s).
                SqlConnectionStringBuilder builder = new SqlConnectionStringBuilder(_connectionString);
                if (builder.ConnectTimeout == 0 || builder.ConnectTimeout > MaxConnectTimeoutSeconds)
                {
                    builder.ConnectTimeout = MaxConnectTimeoutSeconds;
                }

                using (SqlConnection connection = new SqlConnection(builder.ConnectionString))
                using (SqlCommand command = new SqlCommand("SELECT 1", connection))
                {
                    command.CommandType = CommandType.Text;
                    command.CommandTimeout = MaxConnectTimeoutSeconds;
                    connection.Open();
                    command.ExecuteScalar();
                }

                error = null;
                return true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
        }
    }
}
