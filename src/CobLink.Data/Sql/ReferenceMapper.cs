using CobLink.Models;

namespace CobLink.Data.Sql
{
    /// <summary>Row mapping for the reference data result sets (users, members, providers, lookups).</summary>
    internal static class ReferenceMapper
    {
        public static AppUser ReadUser(RowReader row)
        {
            return new AppUser
            {
                UserId = row.GetInt("UserId"),
                UserName = row.GetString("UserName"),
                DisplayName = row.GetString("DisplayName"),
                Email = row.GetString("Email"),
                Role = (UserRole)row.GetInt("RoleId"),
                IsActive = row.GetBool("IsActive")
            };
        }

        public static Member ReadMember(RowReader row)
        {
            return new Member
            {
                MemberId = row.GetInt("MemberId"),
                MemberNumber = row.GetString("MemberNumber"),
                FirstName = row.GetString("FirstName"),
                LastName = row.GetString("LastName"),
                DateOfBirth = row.GetNullableDate("DateOfBirth")
            };
        }

        public static Provider ReadProvider(RowReader row)
        {
            return new Provider
            {
                ProviderId = row.GetInt("ProviderId"),
                ProviderNumber = row.GetString("ProviderNumber"),
                Name = row.GetString("Name"),
                Npi = row.GetString("Npi"),
                City = row.GetString("City"),
                State = row.GetString("State")
            };
        }

        public static LookupItem ReadLookupItem(RowReader row)
        {
            return new LookupItem
            {
                Id = row.GetInt("Id"),
                Code = row.GetString("Code"),
                Name = row.GetString("Name"),
                SortOrder = row.GetInt("SortOrder")
            };
        }
    }
}
