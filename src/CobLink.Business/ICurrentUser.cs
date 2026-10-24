using CobLink.Models;

namespace CobLink.Business
{
    /// <summary>The signed-in COBLink user of the current request.</summary>
    public interface ICurrentUser
    {
        /// <summary>
        /// The registered, active user, or null when the caller is authenticated but has no active AppUser row.
        /// Business services call <see cref="CurrentUserExtensions.Require"/>, which turns null into a
        /// <see cref="ForbiddenException"/>.
        /// </summary>
        AppUser User { get; }
    }
}
