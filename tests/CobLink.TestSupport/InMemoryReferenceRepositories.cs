using System;
using System.Collections.Generic;
using System.Linq;
using CobLink.Data.Repositories;
using CobLink.Models;

namespace CobLink.TestSupport
{
    public class InMemoryUserRepository : IUserRepository
    {
        private readonly FakeDatabase _db;

        public InMemoryUserRepository(FakeDatabase db)
        {
            _db = db;
        }

        public AppUser GetById(int userId)
        {
            AppUser user = _db.FindUser(userId);
            return user == null ? null : Cloner.Clone(user);
        }

        public AppUser GetByUserName(string userName)
        {
            AppUser user = _db.Users.FirstOrDefault(
                u => string.Equals(u.UserName, userName, StringComparison.OrdinalIgnoreCase));
            return user == null ? null : Cloner.Clone(user);
        }

        public IList<AppUser> GetActiveUsers()
        {
            return _db.Users.Where(u => u.IsActive).OrderBy(u => u.DisplayName).Select(Cloner.Clone).ToList();
        }
    }

    public class InMemoryLookupRepository : ILookupRepository
    {
        private readonly FakeDatabase _db;

        public InMemoryLookupRepository(FakeDatabase db)
        {
            _db = db;
        }

        public LookupData GetLookups()
        {
            return new LookupData
            {
                UserRoles = Items<UserRole>(),
                ActivityTypes = Items<ActivityType>(),
                ActivityStatuses = Items<ActivityStatus>(),
                ActivityPriorities = Items<ActivityPriority>(),
                TakebackReasons = Items<TakebackReason>(),
                TakebackStatuses = Items<TakebackStatus>(),
                RecoveryMethods = Items<RecoveryMethod>()
            };
        }

        public IList<Member> SearchMembers(string term, int maxResults)
        {
            return _db.Members
                .Where(m => Contains(m.MemberNumber, term) || Contains(m.FirstName, term) || Contains(m.LastName, term))
                .OrderBy(m => m.LastName).ThenBy(m => m.FirstName)
                .Take(maxResults)
                .Select(Cloner.Clone)
                .ToList();
        }

        public Member GetMember(int memberId)
        {
            Member member = _db.FindMember(memberId);
            return member == null ? null : Cloner.Clone(member);
        }

        public IList<Provider> SearchProviders(string term, int maxResults)
        {
            return _db.Providers
                .Where(p => Contains(p.ProviderNumber, term) || Contains(p.Name, term) || Contains(p.Npi, term))
                .OrderBy(p => p.Name)
                .Take(maxResults)
                .Select(Cloner.Clone)
                .ToList();
        }

        public Provider GetProvider(int providerId)
        {
            Provider provider = _db.FindProvider(providerId);
            return provider == null ? null : Cloner.Clone(provider);
        }

        private static bool Contains(string value, string term)
        {
            return value != null && value.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static List<LookupItem> Items<TEnum>() where TEnum : struct
        {
            return Enum.GetValues(typeof(TEnum)).Cast<TEnum>()
                .Select(value => new LookupItem
                {
                    Id = Convert.ToInt32(value),
                    Code = value.ToString(),
                    Name = value.ToString(),
                    SortOrder = Convert.ToInt32(value)
                })
                .ToList();
        }
    }

    public class FakeDatabaseStatus : IDatabaseStatus
    {
        public bool IsUp { get; set; } = true;

        public bool CanConnect(out string error)
        {
            error = IsUp ? null : "The fake database is down.";
            return IsUp;
        }
    }
}
