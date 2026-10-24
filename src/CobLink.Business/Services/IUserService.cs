using System.Collections.Generic;
using CobLink.Models;

namespace CobLink.Business.Services
{
    public interface IUserService
    {
        /// <summary>Active users ordered by display name (assignee lists, persona switcher).</summary>
        IList<AppUser> GetActiveUsers();
    }
}
