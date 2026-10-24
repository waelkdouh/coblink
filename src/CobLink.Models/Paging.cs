using System;
using System.Collections.Generic;

namespace CobLink.Models
{
    public class PagedRequest
    {
        public const int DefaultPageSize = 20;
        public const int MaxPageSize = 100;

        public int PageNumber { get; set; } = 1;
        public int PageSize { get; set; } = DefaultPageSize;

        /// <summary>Whitelisted camelCase sort key (see the search stored procedures). Null = default order.</summary>
        public string SortBy { get; set; }

        public bool SortDescending { get; set; }
    }

    public class PagedResult<T>
    {
        public List<T> Items { get; set; } = new List<T>();
        public int TotalCount { get; set; }
        public int PageNumber { get; set; }
        public int PageSize { get; set; }

        public int TotalPages
        {
            get { return PageSize <= 0 ? 0 : (int)Math.Ceiling(TotalCount / (double)PageSize); }
        }
    }
}
