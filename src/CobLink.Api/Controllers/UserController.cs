using System.Collections.Generic;
using CobLink.Api.Infrastructure;
using CobLink.Business;
using CobLink.Business.Services;
using CobLink.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Hosting;

namespace CobLink.Api.Controllers
{
    public class UserController : ApiControllerBase
    {
        private readonly ICurrentUser _currentUser;
        private readonly IUserService _userService;
        private readonly AuthenticationSettings _authentication;
        private readonly IHostEnvironment _environment;

        public UserController(
            ICurrentUser currentUser,
            IUserService userService,
            AuthenticationSettings authentication,
            IHostEnvironment environment)
        {
            _currentUser = currentUser;
            _userService = userService;
            _authentication = authentication;
            _environment = environment;
        }

        /// <summary>Who am I, and how did I sign in? The SPA calls this first.</summary>
        [HttpGet]
        public ServiceResponse<SessionInfo> GetCurrent()
        {
            var session = new SessionInfo
            {
                User = _currentUser.Require(),
                AuthenticationMode = _authentication.IsDevelopmentMode
                    ? AuthenticationSettings.DevelopmentMode
                    : AuthenticationSettings.WindowsMode,
                EnvironmentName = _environment.EnvironmentName,
                Version = AppVersion.Current
            };

            return Success(session);
        }

        /// <summary>Active users, for assignee lists and the development persona switcher.</summary>
        [HttpGet]
        public ServiceResponse<IList<AppUser>> GetAll()
        {
            return Success(_userService.GetActiveUsers());
        }
    }
}
