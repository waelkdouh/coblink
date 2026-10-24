using System.Collections.Generic;
using CobLink.Models;

namespace CobLink.Data.Repositories
{
    /// <summary>
    /// Persistence contracts. Implementations (src/CobLink.Data/Sql) call stored procedures; the business layer
    /// (CobLink.Business) owns every business rule and only uses these interfaces.
    ///
    /// Conventions shared by all repositories:
    ///  * Methods are synchronous (legacy style).
    ///  * Get* methods return null when the row does not exist.
    ///  * Update/ChangeStatus/AddRecovery verify the supplied RowVersion and throw ConcurrencyException when the
    ///    stored row has changed; they throw NotFoundException when the row does not exist.
    ///  * userId arguments are the acting AppUser.UserId and are written to the audit columns.
    ///  * *Date timestamps (CreatedDate, ModifiedDate, ChangedDate, CompletedDate, ApprovedDate) are UTC and must be
    ///    returned with DateTimeKind.Utc; date-only business fields (DueDate, NoticeDate, DateOfService,
    ///    RecoveryDate) are returned with DateTimeKind.Unspecified at midnight.
    /// </summary>
    public interface IUserRepository
    {
        AppUser GetById(int userId);

        /// <summary>Case-insensitive lookup by AppUser.UserName (DOMAIN\user). Returns inactive users too.</summary>
        AppUser GetByUserName(string userName);

        /// <summary>Active users ordered by DisplayName.</summary>
        IList<AppUser> GetActiveUsers();
    }

    public interface ILookupRepository
    {
        LookupData GetLookups();

        /// <summary>Matches member number, first name or last name (contains); ordered by last name, first name.</summary>
        IList<Member> SearchMembers(string term, int maxResults);

        Member GetMember(int memberId);

        /// <summary>Matches provider number, name or NPI (contains); ordered by name.</summary>
        IList<Provider> SearchProviders(string term, int maxResults);

        Provider GetProvider(int providerId);
    }

    public interface IActivityRepository
    {
        PagedResult<ActivityListItem> Search(ActivitySearchRequest request);

        /// <summary>Returns the activity including its notes (oldest first).</summary>
        Activity GetById(int activityId);

        /// <summary>Inserts the activity (database generates ActivityId, ActivityNumber, audit columns) and returns the new id.</summary>
        int Insert(Activity activity, int userId);

        /// <summary>Updates the editable columns, including Status, Outcome and CompletedDate.</summary>
        void Update(Activity activity, int userId);

        ActivityNote AddNote(int activityId, string noteText, bool isSystem, int userId);
    }

    public interface ITakebackRepository
    {
        PagedResult<TakebackListItem> Search(TakebackSearchRequest request);

        /// <summary>Returns the takeback including Recoveries (oldest first) and History (oldest first).</summary>
        Takeback GetById(int takebackId);

        /// <summary>True when a takeback for the same claim number and provider exists in any status except Rejected or Cancelled.</summary>
        bool ActiveTakebackExists(string claimNumber, int providerId, int excludeTakebackId);

        /// <summary>Inserts a Draft takeback plus a "Create" history entry; returns the new id.</summary>
        int Insert(Takeback takeback, int userId);

        /// <summary>Updates the editable business columns and writes an "Edit" history entry. Status is unchanged.</summary>
        void Update(Takeback takeback, int userId);

        /// <summary>Sets the new status, stamps the optional columns of the change, and writes a history entry.</summary>
        void ChangeStatus(TakebackStatusChange change, int userId);

        /// <summary>
        /// In one transaction: inserts the recovery, adds its amount to Takeback.RecoveredAmount, sets the new status and
        /// writes a "RecordRecovery" history entry. Returns nothing; re-read the takeback afterwards.
        /// </summary>
        void AddRecovery(TakebackRecovery recovery, TakebackStatus newStatus, byte[] rowVersion, int userId);
    }

    public interface IDashboardRepository
    {
        /// <summary>userId drives the "My ..." figures; everything else is organisation wide.</summary>
        DashboardSummary GetSummary(int userId);
    }

    /// <summary>Used by the /health endpoint.</summary>
    public interface IDatabaseStatus
    {
        /// <summary>Opens a connection and runs SELECT 1. Never throws; error carries the failure message.</summary>
        bool CanConnect(out string error);
    }
}
