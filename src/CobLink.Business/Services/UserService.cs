using System.Collections.Generic;
using CobLink.Data.Repositories;
using CobLink.Models;

namespace CobLink.Business.Services
{
    public class UserService : IUserService
    {
        private readonly IUserRepository _users;
        private readonly ICurrentUser _currentUser;

        public UserService(IUserRepository users, ICurrentUser currentUser)
        {
            _users = users;
            _currentUser = currentUser;
        }

        public IList<AppUser> GetActiveUsers()
        {
            _currentUser.Require();
            return _users.GetActiveUsers();
        }
    }
}
