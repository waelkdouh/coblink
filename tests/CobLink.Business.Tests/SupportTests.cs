using System;
using System.Linq;
using CobLink.Business.Text;
using CobLink.Business.Validation;
using CobLink.Models;
using CobLink.TestSupport;
using Xunit;

namespace CobLink.Business.Tests
{
    public class EnumTextTests
    {
        [Theory]
        [InlineData(ActivityStatus.Open, "Open")]
        [InlineData(ActivityStatus.InProgress, "In progress")]
        [InlineData(TakebackStatus.PendingApproval, "Pending approval")]
        [InlineData(TakebackStatus.PartiallyRecovered, "Partially recovered")]
        [InlineData(RecoveryMethod.Eft, "EFT")]
        [InlineData(RecoveryMethod.Check, "Check")]
        [InlineData(TakebackReason.OtherInsurancePrimary, "Other insurance primary")]
        public void Names_are_turned_into_sentence_case_text(Enum value, string expected)
        {
            Assert.Equal(expected, EnumText.Humanize(value));
        }
    }

    public class ValidationCollectorTests
    {
        [Fact]
        public void A_new_collector_has_no_errors_and_does_not_throw()
        {
            var errors = new ValidationCollector();

            Assert.False(errors.HasErrors);
            errors.ThrowIfAny();
        }

        [Fact]
        public void Every_error_is_reported_at_once()
        {
            var errors = new ValidationCollector();
            errors.Add("a", "first");
            errors.Add("b", "second");

            Assert.True(errors.HasErrors);
            var exception = Assert.Throws<ValidationFailedException>(() => errors.ThrowIfAny());
            Assert.Equal(new[] { "a", "b" }, exception.Errors.Select(e => e.Field).ToArray());
            Assert.Equal(new[] { "first", "second" }, exception.Errors.Select(e => e.Message).ToArray());
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        public void Required_rejects_blank_values(string value)
        {
            var errors = new ValidationCollector();

            Assert.Null(errors.Required("subject", "Subject", value, 10));

            var exception = Assert.Throws<ValidationFailedException>(() => errors.ThrowIfAny());
            Assert.Equal("Subject is required.", Assert.Single(exception.Errors).Message);
        }

        [Fact]
        public void Required_trims_and_enforces_the_maximum_length_after_trimming()
        {
            var errors = new ValidationCollector();

            Assert.Equal("abcde", errors.Required("subject", "Subject", "  abcde  ", 5));
            Assert.False(errors.HasErrors);

            errors.Required("subject", "Subject", "abcdef", 5);

            var exception = Assert.Throws<ValidationFailedException>(() => errors.ThrowIfAny());
            Assert.Equal("Subject cannot be longer than 5 characters.", Assert.Single(exception.Errors).Message);
        }

        [Fact]
        public void Optional_returns_null_for_blank_values_and_enforces_the_maximum_length()
        {
            var errors = new ValidationCollector();

            Assert.Null(errors.Optional("notes", "Notes", "   ", 5));
            Assert.Null(errors.Optional("notes", "Notes", null, 5));
            Assert.Equal("abc", errors.Optional("notes", "Notes", " abc ", 5));
            Assert.False(errors.HasErrors);

            errors.Optional("notes", "Notes", "abcdef", 5);

            Assert.True(errors.HasErrors);
        }

        [Theory]
        [InlineData(null, null)]
        [InlineData("", null)]
        [InlineData("  ", null)]
        [InlineData(" x ", "x")]
        public void Clean_trims_and_turns_blank_into_null(string value, string expected)
        {
            Assert.Equal(expected, ValidationCollector.Clean(value));
        }
    }

    public class SearchRulesTests
    {
        private static ValidationCollector Check(PagedRequest request)
        {
            var errors = new ValidationCollector();
            SearchRules.ValidatePaging(request, SearchRules.ActivitySortKeys, errors);
            return errors;
        }

        [Fact]
        public void The_defaults_are_valid()
        {
            var request = new PagedRequest();

            Assert.False(Check(request).HasErrors);
            Assert.Null(request.SortBy);
        }

        [Fact]
        public void The_largest_page_is_allowed()
        {
            Assert.False(Check(new PagedRequest { PageSize = PagedRequest.MaxPageSize }).HasErrors);
            Assert.True(Check(new PagedRequest { PageSize = PagedRequest.MaxPageSize + 1 }).HasErrors);
        }

        [Fact]
        public void A_blank_sort_key_means_the_default_order()
        {
            var request = new PagedRequest { SortBy = "   " };

            Assert.False(Check(request).HasErrors);
            Assert.Null(request.SortBy);
        }

        [Fact]
        public void A_known_sort_key_is_rewritten_to_its_canonical_casing()
        {
            var request = new PagedRequest { SortBy = " ASSIGNEDTONAME " };

            Assert.False(Check(request).HasErrors);
            Assert.Equal("assignedToName", request.SortBy);
        }

        [Fact]
        public void Activity_and_takeback_sort_keys_are_unique_and_camel_case()
        {
            foreach (string[] keys in new[] { SearchRules.ActivitySortKeys, SearchRules.TakebackSortKeys })
            {
                Assert.Equal(keys.Length, keys.Distinct(StringComparer.OrdinalIgnoreCase).Count());
                Assert.All(keys, key => Assert.True(char.IsLower(key[0]), key));
            }
        }
    }

    public class CurrentUserTests
    {
        [Fact]
        public void Require_returns_the_signed_in_user()
        {
            var world = new TestWorld();
            world.SignIn(TestUsers.Blake);

            Assert.Equal(TestUsers.Blake, world.CurrentUser.Require().UserId);
        }

        [Fact]
        public void Require_throws_forbidden_when_nobody_is_signed_in()
        {
            var world = new TestWorld();
            world.SignOut();

            Assert.Throws<ForbiddenException>(() => world.CurrentUser.Require());
        }
    }

    public class SystemClockTests
    {
        [Fact]
        public void Now_is_utc_and_today_is_a_date_without_a_time_or_a_kind()
        {
            var clock = new SystemClock();

            Assert.Equal(DateTimeKind.Utc, clock.UtcNow.Kind);
            Assert.Equal(DateTimeKind.Unspecified, clock.Today.Kind);
            Assert.Equal(TimeSpan.Zero, clock.Today.TimeOfDay);
        }
    }
}
