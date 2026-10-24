using System;
using CobLink.Business;

namespace CobLink.TestSupport
{
    /// <summary>Clock whose time only moves when a test says so. Default: 14 March 2025, 15:30 UTC.</summary>
    public class FixedClock : IClock
    {
        public FixedClock()
            : this(new DateTime(2025, 3, 14, 15, 30, 0, DateTimeKind.Utc))
        {
        }

        public FixedClock(DateTime utcNow)
        {
            UtcNow = utcNow;
        }

        public DateTime UtcNow { get; set; }

        public DateTime Today
        {
            get { return DateTime.SpecifyKind(UtcNow.Date, DateTimeKind.Unspecified); }
        }

        public void AdvanceDays(int days)
        {
            UtcNow = UtcNow.AddDays(days);
        }
    }
}
