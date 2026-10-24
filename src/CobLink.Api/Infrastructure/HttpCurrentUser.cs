using System.Security.Claims;
using CobLink.Business;
using CobLink.Data.Repositories;
using CobLink.Models;
using Microsoft.AspNetCore.Http;

namespace CobLink.Api.Infrastructure
{
    /// <summary>
    /// Maps the authenticated identity (Windows name such as CORP\jdoe) to the AppUser table once per request.
    /// Unknown and inactive users resolve to null; the business services turn that into a 403.
    /// </summary>
    public class HttpCurrentUser : ICurrentUser
    {
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly IUserRepository _users;
        private bool _resolved;
        private AppUser _user;

        public HttpCurrentUser(IHttpContextAccessor httpContextAccessor, IUserRepository users)
        {
            _httpContextAccessor = httpContextAccessor;
            _users = users;
        }

        public AppUser User
        {
            get
            {
                if (!_resolved)
                {
                    _user = Resolve();
                    _resolved = true;
                }

                return _user;
            }
        }

        private AppUser Resolve()
        {
            HttpContext context = _httpContextAccessor.HttpContext;
            ClaimsPrincipal principal = context == null ? null : context.User;
            if (principal == null || principal.Identity == null || !principal.Identity.IsAuthenticated)
            {
                return null;
            }

            string userName = principal.Identity.Name;
            if (string.IsNullOrWhiteSpace(userName))
            {
                return null;
            }

            AppUser user = _users.GetByUserName(userName.Trim());
            return user != null && user.IsActive ? user : null;
        }
    }
}
