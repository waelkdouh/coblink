using System.Collections.Generic;
using System.Linq;
using CobLink.Models;

namespace CobLink.Business.Validation
{
    /// <summary>Validation shared by every search request.</summary>
    public static class SearchRules
    {
        public static readonly string[] ActivitySortKeys =
        {
            "dueDate", "activityNumber", "subject", "activityType", "status", "priority", "memberName",
            "assignedToName", "createdDate"
        };

        public static readonly string[] TakebackSortKeys =
        {
            "createdDate", "takebackNumber", "claimNumber", "memberName", "providerName", "reason", "status",
            "takebackAmount", "recoveredAmount", "outstandingAmount", "dueDate"
        };

        /// <summary>
        /// Checks page number, page size and sort key. A valid sort key is rewritten to its canonical casing;
        /// a blank one becomes null (default order).
        /// </summary>
        public static void ValidatePaging(PagedRequest request, IEnumerable<string> sortKeys, ValidationCollector errors)
        {
            if (request.PageNumber < 1)
            {
                errors.Add("pageNumber", "Page number must be 1 or greater.");
            }

            if (request.PageSize < 1 || request.PageSize > PagedRequest.MaxPageSize)
            {
                errors.Add("pageSize", "Page size must be between 1 and " + PagedRequest.MaxPageSize + ".");
            }

            string sortBy = ValidationCollector.Clean(request.SortBy);
            if (sortBy == null)
            {
                request.SortBy = null;
                return;
            }

            string canonical = sortKeys.FirstOrDefault(
                key => string.Equals(key, sortBy, System.StringComparison.OrdinalIgnoreCase));
            if (canonical == null)
            {
                errors.Add("sortBy", "Unknown sort key '" + sortBy + "'.");
            }
            else
            {
                request.SortBy = canonical;
            }
        }
    }
}
