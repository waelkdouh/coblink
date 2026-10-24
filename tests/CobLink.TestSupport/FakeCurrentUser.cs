using CobLink.Business;
using CobLink.Models;

namespace CobLink.TestSupport
{
    /// <summary>Current user that tests can switch. A null User simulates a caller without an AppUser row.</summary>
    public class FakeCurrentUser : ICurrentUser
    {
        public AppUser User { get; set; }
    }
}
