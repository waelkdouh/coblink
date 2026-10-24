namespace CobLink.Business
{
    /// <summary>Bound to the "Takeback" configuration section.</summary>
    public class TakebackOptions
    {
        public const string SectionName = "Takeback";

        /// <summary>Takebacks above this amount can only be approved by an administrator.</summary>
        public decimal HighValueThreshold { get; set; } = 25000m;

        /// <summary>Days the provider has to respond or repay after a notice is sent.</summary>
        public int ResponseWindowDays { get; set; } = 30;
    }
}
