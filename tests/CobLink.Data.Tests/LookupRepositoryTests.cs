using System;
using System.Collections.Generic;
using System.Linq;
using CobLink.Data.Repositories;
using CobLink.Data.Tests.Infrastructure;
using CobLink.Models;
using Xunit;

namespace CobLink.Data.Tests
{
    [Collection(SeededDatabaseCollection.Name)]
    public class LookupRepositoryTests
    {
        private readonly ILookupRepository _lookups;

        public LookupRepositoryTests(SeededDatabaseFixture db)
        {
            _lookups = db.Lookups;
        }

        // ---- reference data ---------------------------------------------------------------------------------------

        // The lookup tables, the C# enums and the TypeScript enums are mirrored by hand; this is the guard for the first two.
        [SqlFact]
        public void Lookup_ids_and_codes_equal_the_csharp_enums()
        {
            LookupData data = _lookups.GetLookups();

            AssertMatchesEnum<UserRole>(data.UserRoles);
            AssertMatchesEnum<ActivityType>(data.ActivityTypes);
            AssertMatchesEnum<ActivityStatus>(data.ActivityStatuses);
            AssertMatchesEnum<ActivityPriority>(data.ActivityPriorities);
            AssertMatchesEnum<TakebackReason>(data.TakebackReasons);
            AssertMatchesEnum<TakebackStatus>(data.TakebackStatuses);
            AssertMatchesEnum<RecoveryMethod>(data.RecoveryMethods);
        }

        [SqlFact]
        public void Lookups_are_returned_in_sort_order()
        {
            LookupData data = _lookups.GetLookups();

            foreach (IList<LookupItem> list in new[]
                     {
                         data.UserRoles, data.ActivityTypes, data.ActivityStatuses, data.ActivityPriorities,
                         data.TakebackReasons, data.TakebackStatuses, data.RecoveryMethods
                     })
            {
                Assert.Equal(list.OrderBy(i => i.SortOrder).ThenBy(i => i.Id).Select(i => i.Id), list.Select(i => i.Id));
            }
        }

        // ---- members ----------------------------------------------------------------------------------------------

        [SqlTheory]
        [InlineData("M000105", "Davis")]
        [InlineData("m000105", "Davis")]
        [InlineData("ava", "Davis")]
        [InlineData("DAVI", "Davis")]
        [InlineData("Rodrig", "Rodriguez")]
        public void SearchMembers_matches_number_first_name_and_last_name_in_any_case(string term, string expectedLastName)
        {
            IList<Member> found = _lookups.SearchMembers(term, 10);

            Assert.Contains(found, m => m.LastName == expectedLastName);
        }

        [SqlFact]
        public void SearchMembers_orders_by_last_name_then_first_name()
        {
            IList<Member> all = _lookups.SearchMembers(string.Empty, 50);

            Assert.Equal(19, all.Count);
            Assert.Equal(
                all.OrderBy(m => m.LastName, StringComparer.OrdinalIgnoreCase).ThenBy(m => m.FirstName, StringComparer.OrdinalIgnoreCase).Select(m => m.MemberId),
                all.Select(m => m.MemberId));
        }

        [SqlFact]
        public void SearchMembers_honours_the_maximum_number_of_results()
        {
            Assert.Equal(5, _lookups.SearchMembers(string.Empty, 5).Count);
            Assert.Empty(_lookups.SearchMembers(string.Empty, 0));
            Assert.Empty(_lookups.SearchMembers(string.Empty, -3));
        }

        // LIKE wildcards typed by a user must be matched literally (dbo.fn_EscapeLike), never as patterns.
        [SqlTheory]
        [InlineData("%")]
        [InlineData("_")]
        [InlineData("[")]
        [InlineData("M00010_")]
        [InlineData("[A-Z]")]
        [InlineData("\\")]
        public void SearchMembers_treats_wildcards_literally(string term)
        {
            Assert.Empty(_lookups.SearchMembers(term, 50));
        }

        [SqlFact]
        public void SearchMembers_finds_names_with_an_apostrophe()
        {
            IList<Member> found = _lookups.SearchMembers("O'Brien", 10);

            Member member = Assert.Single(found);
            Assert.Equal("Siobhan", member.FirstName);
        }

        [SqlFact]
        public void SearchMembers_returns_nothing_for_an_unknown_term()
        {
            Assert.Empty(_lookups.SearchMembers("no such member", 10));
        }

        [SqlFact]
        public void GetMember_returns_all_fields()
        {
            Member member = _lookups.GetMember(_lookups.SearchMembers("M000101", 1).Single().MemberId);

            Assert.Equal("M000101", member.MemberNumber);
            Assert.Equal("Olivia", member.FirstName);
            Assert.Equal("Martinez", member.LastName);
            Assert.Equal("Martinez, Olivia", member.FullName);
            Assert.Equal(new DateTime(1968, 3, 14), member.DateOfBirth);
            Assert.Equal(DateTimeKind.Unspecified, member.DateOfBirth.Value.Kind);
        }

        [SqlFact]
        public void GetMember_returns_null_for_an_unknown_id()
        {
            Assert.Null(_lookups.GetMember(999999));
        }

        // ---- providers --------------------------------------------------------------------------------------------

        [SqlTheory]
        [InlineData("P10003", "Summit Orthopedic Associates")]
        [InlineData("imaging", "Lakeshore Imaging Center")]
        [InlineData("1000000045", "Harborview Surgical Center")]
        [InlineData("URGENT CARE", "Bayside Urgent Care")]
        public void SearchProviders_matches_number_name_and_npi(string term, string expectedName)
        {
            Assert.Contains(_lookups.SearchProviders(term, 10), p => p.Name == expectedName);
        }

        [SqlFact]
        public void SearchProviders_orders_by_name()
        {
            IList<Provider> all = _lookups.SearchProviders(string.Empty, 50);

            Assert.Equal(10, all.Count);
            Assert.Equal(all.OrderBy(p => p.Name, StringComparer.OrdinalIgnoreCase).Select(p => p.ProviderId), all.Select(p => p.ProviderId));
        }

        [SqlFact]
        public void SearchProviders_honours_the_maximum_and_treats_wildcards_literally()
        {
            Assert.Equal(3, _lookups.SearchProviders(string.Empty, 3).Count);
            Assert.Empty(_lookups.SearchProviders(string.Empty, 0));
            Assert.Empty(_lookups.SearchProviders("%", 50));
            Assert.Empty(_lookups.SearchProviders("_", 50));
        }

        [SqlFact]
        public void GetProvider_returns_all_fields_and_a_missing_npi_as_null()
        {
            Provider summit = _lookups.GetProvider(_lookups.SearchProviders("P10003", 1).Single().ProviderId);
            Assert.Equal("P10003", summit.ProviderNumber);
            Assert.Equal("Summit Orthopedic Associates", summit.Name);
            Assert.Equal("1000000037", summit.Npi);
            Assert.Equal("Denver", summit.City);
            Assert.Equal("CO", summit.State);

            Provider cedar = _lookups.GetProvider(_lookups.SearchProviders("P10010", 1).Single().ProviderId);
            Assert.Null(cedar.Npi);
        }

        [SqlFact]
        public void GetProvider_returns_null_for_an_unknown_id()
        {
            Assert.Null(_lookups.GetProvider(999999));
        }

        private static void AssertMatchesEnum<TEnum>(IList<LookupItem> items) where TEnum : struct
        {
            Array values = Enum.GetValues(typeof(TEnum));

            Assert.Equal(values.Length, items.Count);
            foreach (object value in values)
            {
                LookupItem item = Assert.Single(items, i => i.Id == (int)value);
                Assert.Equal(value.ToString(), item.Code);
                Assert.False(string.IsNullOrWhiteSpace(item.Name), typeof(TEnum).Name + " " + value + " has no display name.");
            }
        }
    }
}
