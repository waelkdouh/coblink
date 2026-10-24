using System;

namespace CobLink.Business
{
    /// <summary>Single source of "now" so business rules are testable.</summary>
    public interface IClock
    {
        /// <summary>Current UTC timestamp, used for audit-style values such as completed and approved dates.</summary>
        DateTime UtcNow { get; }

        /// <summary>Current calendar date (time 00:00, Kind Unspecified), used for due dates and "not in the future" rules.</summary>
        DateTime Today { get; }
    }
}
