using CobLink.Models;

namespace CobLink.Business
{
    public static class CurrentUserExtensions
    {
        /// <summary>Returns the signed-in user or throws <see cref="ForbiddenException"/> when there is none.</summary>
        public static AppUser Require(this ICurrentUser currentUser)
        {
            AppUser user = currentUser.User;
            if (user == null)
            {
                throw new ForbiddenException("You are not registered in COBLink.");
            }

            return user;
        }
    }
}
