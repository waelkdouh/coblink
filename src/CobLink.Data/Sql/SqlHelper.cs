// System.Data.SqlClient is deliberately the legacy provider; moving to Microsoft.Data.SqlClient is a modernization task.
#pragma warning disable CS0618
using System;
using System.Data;
using System.Data.SqlClient;
using System.Globalization;
using CobLink.Models;

namespace CobLink.Data.Sql
{
    /// <summary>
    /// Hand-rolled ADO.NET plumbing shared by the repositories: one connection per call (the pool does the reuse),
    /// stored procedures only, and translation of the application errors raised by the procedures.
    /// </summary>
    internal static class SqlHelper
    {
        /// <summary>THROW 50001: the row addressed by the call does not exist.</summary>
        public const int NotFoundErrorNumber = 50001;

        /// <summary>THROW 50002: the supplied RowVersion no longer matches the stored row.</summary>
        public const int ConcurrencyErrorNumber = 50002;

        private const int CommandTimeoutSeconds = 60;

        public static string RequireConnectionString(string connectionString)
        {
            if (string.IsNullOrWhiteSpace(connectionString))
            {
                throw new ArgumentException("A connection string is required.", "connectionString");
            }

            return connectionString;
        }

        public static int ClampPageNumber(int pageNumber)
        {
            return Math.Max(1, pageNumber);
        }

        public static int ClampPageSize(int pageSize)
        {
            return Math.Max(1, Math.Min(PagedRequest.MaxPageSize, pageSize));
        }

        /// <summary>Empty search text means "no filter", exactly like null.</summary>
        public static string NullIfEmpty(string value)
        {
            return string.IsNullOrEmpty(value) ? null : value;
        }

        // ---- parameters -------------------------------------------------------------------------------------------

        public static SqlParameter Int(string name, int? value)
        {
            return new SqlParameter(name, SqlDbType.Int) { Value = (object)value ?? DBNull.Value };
        }

        public static SqlParameter Bit(string name, bool value)
        {
            return new SqlParameter(name, SqlDbType.Bit) { Value = value };
        }

        public static SqlParameter NVarChar(string name, int size, string value)
        {
            return new SqlParameter(name, SqlDbType.NVarChar, size) { Value = (object)value ?? DBNull.Value };
        }

        /// <summary>varbinary(8): the rowversion echoed back by the client. A null array is sent as NULL (= stale).</summary>
        public static SqlParameter RowVersion(string name, byte[] value)
        {
            return new SqlParameter(name, SqlDbType.VarBinary, 8) { Value = (object)value ?? DBNull.Value };
        }

        /// <summary>decimal(12,2).</summary>
        public static SqlParameter Money(string name, decimal? value)
        {
            return new SqlParameter(name, SqlDbType.Decimal)
            {
                Precision = 12,
                Scale = 2,
                Value = (object)value ?? DBNull.Value
            };
        }

        /// <summary>A calendar date; the time part is dropped.</summary>
        public static SqlParameter Date(string name, DateTime? value)
        {
            object dbValue = DBNull.Value;
            if (value.HasValue)
            {
                dbValue = value.Value.Date;
            }

            return new SqlParameter(name, SqlDbType.Date) { Value = dbValue };
        }

        /// <summary>A UTC timestamp (datetime2). Local values are converted, Unspecified values are taken as UTC.</summary>
        public static SqlParameter Utc(string name, DateTime? value)
        {
            object dbValue = DBNull.Value;
            if (value.HasValue)
            {
                DateTime utc = value.Value.Kind == DateTimeKind.Local
                    ? value.Value.ToUniversalTime()
                    : DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
                dbValue = utc;
            }

            return new SqlParameter(name, SqlDbType.DateTime2) { Value = dbValue };
        }

        // ---- execution --------------------------------------------------------------------------------------------

        public static int ExecuteNonQuery(
            string connectionString,
            string procedureName,
            SqlParameter[] parameters,
            string entityName = null,
            object entityId = null)
        {
            return Run(connectionString, procedureName, parameters, entityName, entityId, command => command.ExecuteNonQuery());
        }

        /// <summary>Returns the first column of the first row converted to T; default(T) when there is none.</summary>
        public static T ExecuteScalar<T>(
            string connectionString,
            string procedureName,
            SqlParameter[] parameters,
            string entityName = null,
            object entityId = null)
        {
            object value = Run(connectionString, procedureName, parameters, entityName, entityId, command => command.ExecuteScalar());
            if (value == null || value == DBNull.Value)
            {
                return default(T);
            }

            return (T)Convert.ChangeType(value, typeof(T), CultureInfo.InvariantCulture);
        }

        /// <summary>
        /// Executes the procedure and hands the reader to <paramref name="read"/>, which maps the result sets it needs
        /// (call NextResult between sets). The connection is closed when the callback returns.
        /// </summary>
        public static T ExecuteReader<T>(
            string connectionString,
            string procedureName,
            SqlParameter[] parameters,
            Func<RowReader, T> read,
            string entityName = null,
            object entityId = null)
        {
            return Run(connectionString, procedureName, parameters, entityName, entityId, command =>
            {
                using (SqlDataReader reader = command.ExecuteReader())
                {
                    return read(new RowReader(reader));
                }
            });
        }

        private static T Run<T>(
            string connectionString,
            string procedureName,
            SqlParameter[] parameters,
            string entityName,
            object entityId,
            Func<SqlCommand, T> execute)
        {
            try
            {
                using (SqlConnection connection = new SqlConnection(connectionString))
                using (SqlCommand command = new SqlCommand(procedureName, connection))
                {
                    command.CommandType = CommandType.StoredProcedure;
                    command.CommandTimeout = CommandTimeoutSeconds;
                    if (parameters != null)
                    {
                        command.Parameters.AddRange(parameters);
                    }

                    connection.Open();
                    return execute(command);
                }
            }
            catch (SqlException ex) when (entityName != null && HasError(ex, NotFoundErrorNumber))
            {
                throw new NotFoundException(entityName, entityId);
            }
            catch (SqlException ex) when (HasError(ex, ConcurrencyErrorNumber))
            {
                throw new ConcurrencyException(ex);
            }
        }

        // The error can arrive while the reader is being consumed, so every SqlError is inspected, not only Number.
        private static bool HasError(SqlException exception, int number)
        {
            foreach (SqlError error in exception.Errors)
            {
                if (error.Number == number)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
