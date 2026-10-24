using System.Collections.Generic;
using CobLink.Business.Validation;
using CobLink.Data.Repositories;
using CobLink.Models;

namespace CobLink.Business.Services
{
    public class LookupService : ILookupService
    {
        public const int MinimumTermLength = 2;
        public const int DefaultMaxResults = 15;
        public const int MaxResultsCap = 50;

        private readonly ILookupRepository _lookups;
        private readonly ICurrentUser _currentUser;

        public LookupService(ILookupRepository lookups, ICurrentUser currentUser)
        {
            _lookups = lookups;
            _currentUser = currentUser;
        }

        public LookupData GetAll()
        {
            _currentUser.Require();
            return _lookups.GetLookups();
        }

        public IList<Member> SearchMembers(string term, int? maxResults)
        {
            _currentUser.Require();
            string cleaned = CleanTerm(term);
            if (cleaned == null)
            {
                return new List<Member>();
            }

            return _lookups.SearchMembers(cleaned, ClampMax(maxResults));
        }

        public IList<Provider> SearchProviders(string term, int? maxResults)
        {
            _currentUser.Require();
            string cleaned = CleanTerm(term);
            if (cleaned == null)
            {
                return new List<Provider>();
            }

            return _lookups.SearchProviders(cleaned, ClampMax(maxResults));
        }

        private static string CleanTerm(string term)
        {
            string cleaned = ValidationCollector.Clean(term);
            return cleaned != null && cleaned.Length >= MinimumTermLength ? cleaned : null;
        }

        private static int ClampMax(int? maxResults)
        {
            if (!maxResults.HasValue || maxResults.Value < 1)
            {
                return DefaultMaxResults;
            }

            return maxResults.Value > MaxResultsCap ? MaxResultsCap : maxResults.Value;
        }
    }
}
