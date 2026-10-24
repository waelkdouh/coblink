using System;

namespace CobLink.Business
{
    public class SystemClock : IClock
    {
        public DateTime UtcNow
        {
            get { return DateTime.UtcNow; }
        }

        public DateTime Today
        {
            get { return DateTime.SpecifyKind(DateTime.Today, DateTimeKind.Unspecified); }
        }
    }
}
