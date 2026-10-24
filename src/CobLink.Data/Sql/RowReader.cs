// System.Data.SqlClient is deliberately the legacy provider; moving to Microsoft.Data.SqlClient is a modernization task.
#pragma warning disable CS0618
using System;
using System.Collections.Generic;
using System.Data.SqlClient;

namespace CobLink.Data.Sql
{
    /// <summary>
    /// Thin wrapper over SqlDataReader: columns are addressed by name (ordinals are cached per result set) and the
    /// date/time getters stamp the DateTimeKind the model contract requires.
    /// </summary>
    internal sealed class RowReader
    {
        private readonly SqlDataReader _reader;
        private readonly Dictionary<string, int> _ordinals = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        public RowReader(SqlDataReader reader)
        {
            _reader = reader;
        }

        public bool Read()
        {
            return _reader.Read();
        }

        public bool NextResult()
        {
            _ordinals.Clear();
            return _reader.NextResult();
        }

        /// <summary>Maps every remaining row of the current result set.</summary>
        public List<T> ReadList<T>(Func<RowReader, T> map)
        {
            List<T> items = new List<T>();
            while (_reader.Read())
            {
                items.Add(map(this));
            }

            return items;
        }

        /// <summary>Maps the first row of the current result set; default(T) when the result set is empty.</summary>
        public T ReadFirstOrDefault<T>(Func<RowReader, T> map)
        {
            if (_reader.Read())
            {
                return map(this);
            }

            return default(T);
        }

        public bool IsNull(string column)
        {
            return _reader.IsDBNull(Ordinal(column));
        }

        public int GetInt(string column)
        {
            return _reader.GetInt32(Ordinal(column));
        }

        public int? GetNullableInt(string column)
        {
            int ordinal = Ordinal(column);
            if (_reader.IsDBNull(ordinal))
            {
                return null;
            }

            return _reader.GetInt32(ordinal);
        }

        public string GetString(string column)
        {
            int ordinal = Ordinal(column);
            if (_reader.IsDBNull(ordinal))
            {
                return null;
            }

            return _reader.GetString(ordinal);
        }

        public bool GetBool(string column)
        {
            return _reader.GetBoolean(Ordinal(column));
        }

        public decimal GetDecimal(string column)
        {
            return _reader.GetDecimal(Ordinal(column));
        }

        /// <summary>A date column: midnight, DateTimeKind.Unspecified.</summary>
        public DateTime GetDate(string column)
        {
            return DateTime.SpecifyKind(_reader.GetDateTime(Ordinal(column)).Date, DateTimeKind.Unspecified);
        }

        public DateTime? GetNullableDate(string column)
        {
            int ordinal = Ordinal(column);
            if (_reader.IsDBNull(ordinal))
            {
                return null;
            }

            return DateTime.SpecifyKind(_reader.GetDateTime(ordinal).Date, DateTimeKind.Unspecified);
        }

        /// <summary>A datetime2 column holding a UTC timestamp.</summary>
        public DateTime GetUtc(string column)
        {
            return DateTime.SpecifyKind(_reader.GetDateTime(Ordinal(column)), DateTimeKind.Utc);
        }

        public DateTime? GetNullableUtc(string column)
        {
            int ordinal = Ordinal(column);
            if (_reader.IsDBNull(ordinal))
            {
                return null;
            }

            return DateTime.SpecifyKind(_reader.GetDateTime(ordinal), DateTimeKind.Utc);
        }

        /// <summary>binary(8) / rowversion column; null when the value is NULL.</summary>
        public byte[] GetBytes(string column)
        {
            int ordinal = Ordinal(column);
            if (_reader.IsDBNull(ordinal))
            {
                return null;
            }

            return (byte[])_reader.GetValue(ordinal);
        }

        private int Ordinal(string column)
        {
            int ordinal;
            if (_ordinals.TryGetValue(column, out ordinal))
            {
                return ordinal;
            }

            try
            {
                ordinal = _reader.GetOrdinal(column);
            }
            catch (IndexOutOfRangeException)
            {
                throw new InvalidOperationException("The result set returned by the stored procedure has no column named '" + column + "'.");
            }

            _ordinals[column] = ordinal;
            return ordinal;
        }
    }
}
