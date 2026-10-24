using System;
using CobLink.Business;
using CobLink.Business.Services;
using CobLink.Data.Repositories;
using CobLink.Models;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CobLink.TestSupport
{
    /// <summary>
    /// Everything a test needs: a fixed clock, an in-memory database with seeded reference data, the repositories on
    /// top of it, and the business services wired to a switchable current user.
    /// </summary>
    public class TestWorld
    {
        private static readonly TakebackStatus[] ApprovedStatuses =
        {
            TakebackStatus.Approved, TakebackStatus.NoticeSent, TakebackStatus.PartiallyRecovered,
            TakebackStatus.Recovered, TakebackStatus.Disputed, TakebackStatus.WrittenOff
        };

        private static readonly TakebackStatus[] NoticeStatuses =
        {
            TakebackStatus.NoticeSent, TakebackStatus.PartiallyRecovered, TakebackStatus.Recovered,
            TakebackStatus.Disputed, TakebackStatus.WrittenOff
        };

        public TestWorld()
            : this(new FixedClock())
        {
        }

        public TestWorld(FixedClock clock)
        {
            Clock = clock;
            Db = new FakeDatabase(clock);
            CurrentUser = new FakeCurrentUser();
            Options = new TakebackOptions();
            DatabaseStatus = new FakeDatabaseStatus();

            Users = new InMemoryUserRepository(Db);
            Lookups = new InMemoryLookupRepository(Db);
            ActivityRepository = new InMemoryActivityRepository(Db);
            TakebackRepository = new InMemoryTakebackRepository(Db);
            Dashboard = new InMemoryDashboardRepository(Db, ActivityRepository, TakebackRepository);

            SignIn(TestUsers.Jamie);
        }

        public FixedClock Clock { get; private set; }
        public FakeDatabase Db { get; private set; }
        public FakeCurrentUser CurrentUser { get; private set; }
        public TakebackOptions Options { get; private set; }
        public FakeDatabaseStatus DatabaseStatus { get; private set; }

        public InMemoryUserRepository Users { get; private set; }
        public InMemoryLookupRepository Lookups { get; private set; }
        public InMemoryActivityRepository ActivityRepository { get; private set; }
        public InMemoryTakebackRepository TakebackRepository { get; private set; }
        public InMemoryDashboardRepository Dashboard { get; private set; }

        public IUserService UserService
        {
            get { return new UserService(Users, CurrentUser); }
        }

        public ILookupService LookupService
        {
            get { return new LookupService(Lookups, CurrentUser); }
        }

        public IDashboardService DashboardService
        {
            get { return new DashboardService(Dashboard, CurrentUser); }
        }

        public IActivityService ActivityService
        {
            get { return new ActivityService(ActivityRepository, TakebackRepository, Lookups, Users, CurrentUser, Clock); }
        }

        public ITakebackService TakebackService
        {
            get
            {
                return new TakebackService(
                    TakebackRepository, ActivityRepository, Lookups, CurrentUser, Clock, Microsoft.Extensions.Options.Options.Create(Options));
            }
        }

        public AppUser SignIn(int userId)
        {
            CurrentUser.User = Users.GetById(userId);
            return CurrentUser.User;
        }

        public void SignOut()
        {
            CurrentUser.User = null;
        }

        /// <summary>Inserts an activity directly into the store (bypassing business rules) and returns the stored copy.</summary>
        public Activity SeedActivity(Action<Activity> customize = null)
        {
            var activity = new Activity
            {
                MemberId = TestReference.MemberAva,
                ActivityType = ActivityType.PhoneCall,
                Status = ActivityStatus.Open,
                Priority = ActivityPriority.Normal,
                Subject = "Call member about other coverage",
                Description = "Confirm whether the member has other insurance.",
                AssignedToUserId = TestUsers.Jamie,
                DueDate = Clock.Today.AddDays(5)
            };

            if (customize != null)
            {
                customize(activity);
            }

            int id = ActivityRepository.Insert(activity, TestUsers.Jamie);
            return ActivityRepository.GetById(id);
        }

        /// <summary>
        /// Inserts a takeback directly into the store in the requested status, with the dates, approver and recovered
        /// amount a takeback in that status would normally have. Returns the stored copy.
        /// </summary>
        public Takeback SeedTakeback(TakebackStatus status = TakebackStatus.Draft, Action<Takeback> customize = null)
        {
            var takeback = new Takeback
            {
                ClaimNumber = "CLM-" + (Db.Takebacks.Count + 1).ToString("D5"),
                MemberId = TestReference.MemberAva,
                ProviderId = TestReference.ProviderRiverside,
                Reason = TakebackReason.OtherInsurancePrimary,
                OtherCarrierName = "Northwind Health",
                OtherPolicyNumber = "NW-4455",
                DateOfService = Clock.Today.AddDays(-60),
                OriginalPaidAmount = 1500m,
                TakebackAmount = 1200m,
                Notes = "Other carrier is primary."
            };

            int id = TakebackRepository.Insert(takeback, TestUsers.Jamie);
            Takeback stored = Db.Takebacks.Find(t => t.TakebackId == id);
            stored.Status = status;

            if (Array.IndexOf(ApprovedStatuses, status) >= 0)
            {
                stored.ApprovedByUserId = TestUsers.Blake;
                stored.ApprovedDate = Clock.UtcNow.AddDays(-12);
            }

            if (Array.IndexOf(NoticeStatuses, status) >= 0)
            {
                stored.NoticeDate = Clock.Today.AddDays(-10);
                stored.DueDate = Clock.Today.AddDays(20);
            }

            if (status == TakebackStatus.PartiallyRecovered)
            {
                AddSeedRecovery(stored, 400m);
            }
            else if (status == TakebackStatus.Recovered)
            {
                AddSeedRecovery(stored, stored.TakebackAmount);
            }

            // Applied last so a test can override anything above (claim number, amounts, DueDate, creator...).
            if (customize != null)
            {
                customize(stored);
            }

            stored.RowVersion = Db.NextRowVersion();
            return TakebackRepository.GetById(id);
        }

        /// <summary>Replaces the data layer and clock registrations of a host with this world's in-memory versions.</summary>
        public void ReplaceServices(IServiceCollection services)
        {
            services.RemoveAll<IClock>();
            services.RemoveAll<IUserRepository>();
            services.RemoveAll<ILookupRepository>();
            services.RemoveAll<IActivityRepository>();
            services.RemoveAll<ITakebackRepository>();
            services.RemoveAll<IDashboardRepository>();
            services.RemoveAll<IDatabaseStatus>();

            services.AddSingleton<IClock>(Clock);
            services.AddSingleton<IUserRepository>(Users);
            services.AddSingleton<ILookupRepository>(Lookups);
            services.AddSingleton<IActivityRepository>(ActivityRepository);
            services.AddSingleton<ITakebackRepository>(TakebackRepository);
            services.AddSingleton<IDashboardRepository>(Dashboard);
            services.AddSingleton<IDatabaseStatus>(DatabaseStatus);
        }

        private void AddSeedRecovery(Takeback stored, decimal amount)
        {
            Db.Recoveries.Add(new TakebackRecovery
            {
                RecoveryId = Db.NextRecoveryId(),
                TakebackId = stored.TakebackId,
                Amount = amount,
                RecoveryDate = Clock.Today.AddDays(-3),
                Method = RecoveryMethod.Check,
                ReferenceNumber = "CHK-1001",
                CreatedByUserId = TestUsers.Jamie,
                CreatedDate = Clock.UtcNow.AddDays(-3)
            });
            stored.RecoveredAmount = amount;
        }
    }
}
