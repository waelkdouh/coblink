using System;
using System.Collections.Generic;

namespace CobLink.Models
{
    /// <summary>Internal COBLink user. UserName is the Windows identity (DOMAIN\user).</summary>
    public class AppUser
    {
        public int UserId { get; set; }
        public string UserName { get; set; }
        public string DisplayName { get; set; }
        public string Email { get; set; }
        public UserRole Role { get; set; }
        public bool IsActive { get; set; }
    }

    /// <summary>Returned by User/GetCurrent so the SPA knows who is signed in and how.</summary>
    public class SessionInfo
    {
        public AppUser User { get; set; }

        /// <summary>"Windows" (production) or "Development" (header based persona switching).</summary>
        public string AuthenticationMode { get; set; }

        public string EnvironmentName { get; set; }
        public string Version { get; set; }
    }

    public class Member
    {
        public int MemberId { get; set; }
        public string MemberNumber { get; set; }
        public string FirstName { get; set; }
        public string LastName { get; set; }
        public DateTime? DateOfBirth { get; set; }

        public string FullName
        {
            get { return LastName + ", " + FirstName; }
        }
    }

    public class Provider
    {
        public int ProviderId { get; set; }
        public string ProviderNumber { get; set; }
        public string Name { get; set; }
        public string Npi { get; set; }
        public string City { get; set; }
        public string State { get; set; }
    }

    public class LookupItem
    {
        public int Id { get; set; }
        public string Code { get; set; }
        public string Name { get; set; }
        public int SortOrder { get; set; }
    }

    /// <summary>All reference data in one payload; Id values equal the corresponding enum values.</summary>
    public class LookupData
    {
        public List<LookupItem> UserRoles { get; set; } = new List<LookupItem>();
        public List<LookupItem> ActivityTypes { get; set; } = new List<LookupItem>();
        public List<LookupItem> ActivityStatuses { get; set; } = new List<LookupItem>();
        public List<LookupItem> ActivityPriorities { get; set; } = new List<LookupItem>();
        public List<LookupItem> TakebackReasons { get; set; } = new List<LookupItem>();
        public List<LookupItem> TakebackStatuses { get; set; } = new List<LookupItem>();
        public List<LookupItem> RecoveryMethods { get; set; } = new List<LookupItem>();
    }
}
