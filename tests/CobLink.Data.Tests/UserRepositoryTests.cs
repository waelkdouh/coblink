using System.Collections.Generic;
using System.Linq;
using CobLink.Data.Repositories;
using CobLink.Data.Tests.Infrastructure;
using CobLink.Models;
using Xunit;

namespace CobLink.Data.Tests
{
    [Collection(SeededDatabaseCollection.Name)]
    public class UserRepositoryTests
    {
        private readonly IUserRepository _users;

        public UserRepositoryTests(SeededDatabaseFixture db)
        {
            _users = db.Users;
        }

        // The other test classes address the people of the demo data by id (SampleUsers); this keeps that mapping honest.
        [SqlTheory]
        [InlineData(SampleUsers.Jamie, @"CORP\jdoe", "Jamie Doe", UserRole.Analyst, true)]
        [InlineData(SampleUsers.Alex, @"CORP\asmith", "Alex Smith", UserRole.Analyst, true)]
        [InlineData(SampleUsers.Blake, @"CORP\bwilson", "Blake Wilson", UserRole.Supervisor, true)]
        [InlineData(SampleUsers.Morgan, @"CORP\mlee", "Morgan Lee", UserRole.Supervisor, true)]
        [InlineData(SampleUsers.Casey, @"CORP\admin", "Casey Admin", UserRole.Admin, true)]
        [InlineData(SampleUsers.Robin, @"CORP\retired", "Robin Retired", UserRole.Analyst, false)]
        public void GetById_returns_the_user_with_role_and_status(int id, string userName, string displayName, UserRole role, bool isActive)
        {
            AppUser user = _users.GetById(id);

            Assert.NotNull(user);
            Assert.Equal(id, user.UserId);
            Assert.Equal(userName, user.UserName);
            Assert.Equal(displayName, user.DisplayName);
            Assert.Equal(role, user.Role);
            Assert.Equal(isActive, user.IsActive);
            Assert.False(string.IsNullOrWhiteSpace(user.Email));
        }

        [SqlFact]
        public void GetById_returns_null_for_an_unknown_id()
        {
            Assert.Null(_users.GetById(999999));
        }

        [SqlTheory]
        [InlineData(@"CORP\jdoe")]
        [InlineData(@"corp\JDOE")]
        [InlineData(@"Corp\JDoe")]
        public void GetByUserName_ignores_case(string userName)
        {
            AppUser user = _users.GetByUserName(userName);

            Assert.NotNull(user);
            Assert.Equal(SampleUsers.Jamie, user.UserId);
        }

        [SqlFact]
        public void GetByUserName_also_returns_inactive_users()
        {
            AppUser user = _users.GetByUserName(@"CORP\retired");

            Assert.NotNull(user);
            Assert.False(user.IsActive);
        }

        [SqlTheory]
        [InlineData(@"CORP\nobody")]
        [InlineData("jdoe")]
        [InlineData("")]
        public void GetByUserName_returns_null_for_an_unknown_user(string userName)
        {
            Assert.Null(_users.GetByUserName(userName));
        }

        [SqlFact]
        public void GetActiveUsers_excludes_inactive_users_and_orders_by_display_name()
        {
            IList<AppUser> users = _users.GetActiveUsers();

            Assert.Equal(
                new[] { "Alex Smith", "Blake Wilson", "Casey Admin", "Jamie Doe", "Morgan Lee" },
                users.Select(u => u.DisplayName).ToArray());
            Assert.All(users, u => Assert.True(u.IsActive));
        }
    }
}
