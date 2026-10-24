using System;
using System.Collections.Generic;
using System.Linq;
using CobLink.Business;
using CobLink.Models;

namespace CobLink.TestSupport
{
    /// <summary>
    /// In-memory stand-in for the SQL Server database shared by the in-memory repositories. Stored rows hold only
    /// the columns of their table; display names, notes, history and IsOverdue are derived when a repository reads.
    /// </summary>
    public class FakeDatabase
    {
        private long _rowVersion;
        private int _activityId;
        private int _noteId;
        private int _takebackId;
        private int _recoveryId;
        private int _historyId;

        public FakeDatabase(IClock clock)
        {
            Clock = clock;
            SeedReferenceData();
        }

        public IClock Clock { get; private set; }

        public List<AppUser> Users { get; } = new List<AppUser>();
        public List<Member> Members { get; } = new List<Member>();
        public List<Provider> Providers { get; } = new List<Provider>();
        public List<Activity> Activities { get; } = new List<Activity>();
        public List<ActivityNote> ActivityNotes { get; } = new List<ActivityNote>();
        public List<Takeback> Takebacks { get; } = new List<Takeback>();
        public List<TakebackRecovery> Recoveries { get; } = new List<TakebackRecovery>();
        public List<TakebackHistoryEntry> History { get; } = new List<TakebackHistoryEntry>();

        public int NextActivityId()
        {
            return ++_activityId;
        }

        public int NextNoteId()
        {
            return ++_noteId;
        }

        public int NextTakebackId()
        {
            return ++_takebackId;
        }

        public int NextRecoveryId()
        {
            return ++_recoveryId;
        }

        public int NextHistoryId()
        {
            return ++_historyId;
        }

        /// <summary>Mimics a SQL Server rowversion: a new, strictly increasing 8 byte value for every write.</summary>
        public byte[] NextRowVersion()
        {
            _rowVersion++;
            byte[] bytes = BitConverter.GetBytes(_rowVersion);
            if (BitConverter.IsLittleEndian)
            {
                Array.Reverse(bytes);
            }

            return bytes;
        }

        public AppUser FindUser(int userId)
        {
            return Users.SingleOrDefault(u => u.UserId == userId);
        }

        public string UserDisplayName(int? userId)
        {
            AppUser user = userId.HasValue ? FindUser(userId.Value) : null;
            return user == null ? null : user.DisplayName;
        }

        public Member FindMember(int memberId)
        {
            return Members.SingleOrDefault(m => m.MemberId == memberId);
        }

        public Provider FindProvider(int providerId)
        {
            return Providers.SingleOrDefault(p => p.ProviderId == providerId);
        }

        public bool IsOverdue(Activity activity)
        {
            return activity.DueDate.HasValue &&
                   activity.DueDate.Value.Date < Clock.Today &&
                   (activity.Status == ActivityStatus.Open || activity.Status == ActivityStatus.InProgress);
        }

        public bool IsOverdue(Takeback takeback)
        {
            return takeback.DueDate.HasValue &&
                   takeback.DueDate.Value.Date < Clock.Today &&
                   (takeback.Status == TakebackStatus.NoticeSent || takeback.Status == TakebackStatus.PartiallyRecovered);
        }

        private void SeedReferenceData()
        {
            AddUser(TestUsers.Jamie, "CORP\\jdoe", "Jamie Doe", UserRole.Analyst, true);
            AddUser(TestUsers.Alex, "CORP\\asmith", "Alex Smith", UserRole.Analyst, true);
            AddUser(TestUsers.Blake, "CORP\\bwilson", "Blake Wilson", UserRole.Supervisor, true);
            AddUser(TestUsers.Morgan, "CORP\\mlee", "Morgan Lee", UserRole.Supervisor, true);
            AddUser(TestUsers.Casey, "CORP\\admin", "Casey Admin", UserRole.Admin, true);
            AddUser(TestUsers.Inactive, "CORP\\retired", "Robin Retired", UserRole.Analyst, false);

            Members.Add(new Member { MemberId = 1, MemberNumber = "M-100001", FirstName = "Ava", LastName = "Johnson" });
            Members.Add(new Member { MemberId = 2, MemberNumber = "M-100002", FirstName = "Noah", LastName = "Brown" });
            Members.Add(new Member { MemberId = 3, MemberNumber = "M-100003", FirstName = "Mia", LastName = "Garcia" });

            Providers.Add(new Provider { ProviderId = 1, ProviderNumber = "P-5001", Name = "Riverside Medical Group", Npi = "1234567890", City = "Austin", State = "TX" });
            Providers.Add(new Provider { ProviderId = 2, ProviderNumber = "P-5002", Name = "Lakeview Imaging Center", Npi = "1098765432", City = "Denver", State = "CO" });
        }

        private void AddUser(int id, string userName, string displayName, UserRole role, bool isActive)
        {
            Users.Add(new AppUser
            {
                UserId = id,
                UserName = userName,
                DisplayName = displayName,
                Email = userName.Substring(userName.IndexOf('\\') + 1) + "@example.com",
                Role = role,
                IsActive = isActive
            });
        }
    }
}
