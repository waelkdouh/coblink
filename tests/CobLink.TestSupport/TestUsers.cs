namespace CobLink.TestSupport
{
    /// <summary>Ids of the users every <see cref="FakeDatabase"/> starts with.</summary>
    public static class TestUsers
    {
        public const int Jamie = 1;      // Analyst CORP\jdoe
        public const int Alex = 2;       // Analyst CORP\asmith
        public const int Blake = 3;      // Supervisor CORP\bwilson
        public const int Morgan = 4;     // Supervisor CORP\mlee
        public const int Casey = 5;      // Admin CORP\admin
        public const int Inactive = 6;   // inactive Analyst CORP\retired
    }

    /// <summary>Ids of the members and providers every <see cref="FakeDatabase"/> starts with.</summary>
    public static class TestReference
    {
        public const int MemberAva = 1;
        public const int MemberNoah = 2;
        public const int MemberMia = 3;
        public const int ProviderRiverside = 1;
        public const int ProviderLakeview = 2;
    }
}
