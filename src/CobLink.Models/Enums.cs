namespace CobLink.Models
{
    // The numeric values below are persisted in SQL Server lookup tables (Lkp*) and are also
    // mirrored by hand in client/src/app/models/enums.ts. Change all three together.

    public enum UserRole
    {
        Analyst = 1,
        Supervisor = 2,
        Admin = 3
    }

    public enum ActivityType
    {
        PhoneCall = 1,
        Email = 2,
        Letter = 3,
        OtherCarrierVerification = 4,
        MemberOutreach = 5,
        ProviderOutreach = 6,
        DocumentReview = 7,
        ClaimReview = 8,
        Research = 9,
        Other = 10
    }

    public enum ActivityStatus
    {
        Open = 1,
        InProgress = 2,
        Completed = 3,
        Cancelled = 4
    }

    public enum ActivityPriority
    {
        Low = 1,
        Normal = 2,
        High = 3,
        Urgent = 4
    }

    public enum TakebackReason
    {
        OtherInsurancePrimary = 1,
        MedicarePrimary = 2,
        DuplicatePayment = 3,
        EligibilityTerminated = 4,
        ThirdPartyLiability = 5,
        WorkersCompensation = 6,
        ProviderBillingError = 7,
        Other = 8
    }

    public enum TakebackStatus
    {
        Draft = 1,
        PendingApproval = 2,
        Approved = 3,
        Rejected = 4,
        NoticeSent = 5,
        PartiallyRecovered = 6,
        Recovered = 7,
        Disputed = 8,
        WrittenOff = 9,
        Cancelled = 10
    }

    public enum RecoveryMethod
    {
        Check = 1,
        Eft = 2,
        Offset = 3
    }
}
