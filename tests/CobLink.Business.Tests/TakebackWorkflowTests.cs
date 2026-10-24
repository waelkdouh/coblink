using System;
using System.Collections.Generic;
using System.Linq;
using CobLink.Business.Workflow;
using CobLink.Models;
using CobLink.TestSupport;
using Xunit;

namespace CobLink.Business.Tests
{
    public class TakebackWorkflowTests
    {
        private readonly TestWorld _world = new TestWorld();
        private readonly TakebackWorkflow _workflow = new TakebackWorkflow(new TakebackOptions());

        private AppUser User(int userId)
        {
            return _world.Users.GetById(userId);
        }

        private static Takeback TakebackIn(TakebackStatus status, int createdBy = TestUsers.Jamie, decimal amount = 1000m)
        {
            return new Takeback
            {
                TakebackId = 1,
                TakebackNumber = "TB-000001",
                Status = status,
                CreatedByUserId = createdBy,
                TakebackAmount = amount
            };
        }

        private string[] Actions(TakebackStatus status, int userId, int createdBy = TestUsers.Jamie, decimal amount = 1000m)
        {
            return _workflow.GetAvailableActions(TakebackIn(status, createdBy, amount), User(userId)).ToArray();
        }

        public static IEnumerable<object[]> ActionsForTheCreator()
        {
            yield return new object[] { TakebackStatus.Draft, new[] { "Edit", "Submit", "Cancel" } };
            yield return new object[] { TakebackStatus.PendingApproval, new[] { "Cancel" } };
            yield return new object[] { TakebackStatus.Approved, new[] { "SendNotice", "Cancel" } };
            yield return new object[] { TakebackStatus.Rejected, new[] { "Edit", "Submit", "Cancel" } };
            yield return new object[] { TakebackStatus.NoticeSent, new[] { "RecordRecovery", "Dispute" } };
            yield return new object[] { TakebackStatus.PartiallyRecovered, new[] { "RecordRecovery", "Dispute" } };
            yield return new object[] { TakebackStatus.Recovered, new string[0] };
            yield return new object[] { TakebackStatus.Disputed, new string[0] };
            yield return new object[] { TakebackStatus.WrittenOff, new string[0] };
            yield return new object[] { TakebackStatus.Cancelled, new string[0] };
        }

        public static IEnumerable<object[]> ActionsForASupervisorWhoDidNotCreateIt()
        {
            yield return new object[] { TakebackStatus.Draft, new[] { "Edit", "Submit", "Cancel" } };
            yield return new object[] { TakebackStatus.PendingApproval, new[] { "Approve", "Reject", "Cancel" } };
            yield return new object[] { TakebackStatus.Approved, new[] { "SendNotice", "Cancel" } };
            yield return new object[] { TakebackStatus.Rejected, new[] { "Edit", "Submit", "Cancel" } };
            yield return new object[] { TakebackStatus.NoticeSent, new[] { "RecordRecovery", "Dispute", "WriteOff" } };
            yield return new object[] { TakebackStatus.PartiallyRecovered, new[] { "RecordRecovery", "Dispute", "WriteOff" } };
            yield return new object[] { TakebackStatus.Recovered, new string[0] };
            yield return new object[] { TakebackStatus.Disputed, new[] { "ResolveDispute", "WriteOff" } };
            yield return new object[] { TakebackStatus.WrittenOff, new string[0] };
            yield return new object[] { TakebackStatus.Cancelled, new string[0] };
        }

        [Theory]
        [MemberData(nameof(ActionsForTheCreator))]
        public void An_analyst_who_created_the_takeback_is_offered_these_actions(TakebackStatus status, string[] expected)
        {
            Assert.Equal(expected, Actions(status, TestUsers.Jamie));
        }

        [Theory]
        [MemberData(nameof(ActionsForASupervisorWhoDidNotCreateIt))]
        public void A_supervisor_who_did_not_create_the_takeback_is_offered_these_actions(TakebackStatus status, string[] expected)
        {
            Assert.Equal(expected, Actions(status, TestUsers.Blake));
        }

        [Theory]
        [InlineData(TakebackStatus.Draft)]
        [InlineData(TakebackStatus.Rejected)]
        public void An_analyst_who_did_not_create_the_takeback_cannot_edit_submit_or_cancel_it(TakebackStatus status)
        {
            Assert.Empty(Actions(status, TestUsers.Alex));
        }

        [Fact]
        public void An_analyst_who_did_not_create_the_takeback_can_still_send_notices_and_record_recoveries()
        {
            Assert.Equal(new[] { "SendNotice" }, Actions(TakebackStatus.Approved, TestUsers.Alex));
            Assert.Equal(new[] { "RecordRecovery", "Dispute" }, Actions(TakebackStatus.NoticeSent, TestUsers.Alex));
        }

        [Fact]
        public void The_creator_cannot_approve_or_reject_even_as_a_supervisor_or_admin()
        {
            Assert.Equal(new[] { "Cancel" }, Actions(TakebackStatus.PendingApproval, TestUsers.Blake, TestUsers.Blake));
            Assert.Equal(new[] { "Cancel" }, Actions(TakebackStatus.PendingApproval, TestUsers.Casey, TestUsers.Casey));
        }

        [Fact]
        public void High_value_takebacks_can_only_be_approved_by_an_administrator()
        {
            Assert.Equal(new[] { "Reject", "Cancel" }, Actions(TakebackStatus.PendingApproval, TestUsers.Blake, amount: 25000.01m));
            Assert.Equal(
                new[] { "Approve", "Reject", "Cancel" },
                Actions(TakebackStatus.PendingApproval, TestUsers.Casey, amount: 25000.01m));
            Assert.Contains("Approve", Actions(TakebackStatus.PendingApproval, TestUsers.Blake, amount: 25000m));
        }

        [Fact]
        public void A_supervisor_can_reject_but_not_approve_a_high_value_takeback()
        {
            Takeback takeback = TakebackIn(TakebackStatus.PendingApproval, amount: 30000m);

            Assert.Equal(WorkflowOutcome.Forbidden, _workflow.Check(TakebackActions.Approve, takeback, User(TestUsers.Blake)).Outcome);
            Assert.Equal(WorkflowOutcome.Allowed, _workflow.Check(TakebackActions.Reject, takeback, User(TestUsers.Blake)).Outcome);
        }

        [Fact]
        public void Check_distinguishes_forbidden_from_wrong_state()
        {
            AppUser analyst = User(TestUsers.Alex);
            AppUser supervisor = User(TestUsers.Blake);

            Assert.Equal(
                WorkflowOutcome.Forbidden,
                _workflow.Check(TakebackActions.Approve, TakebackIn(TakebackStatus.Draft), analyst).Outcome);
            Assert.Equal(
                WorkflowOutcome.WrongState,
                _workflow.Check(TakebackActions.Approve, TakebackIn(TakebackStatus.Draft), supervisor).Outcome);
            Assert.Equal(
                WorkflowOutcome.Allowed,
                _workflow.Check(TakebackActions.Approve, TakebackIn(TakebackStatus.PendingApproval), supervisor).Outcome);
        }

        [Fact]
        public void The_wrong_state_message_names_the_current_status_and_the_statuses_that_work()
        {
            WorkflowCheck check = _workflow.Check(
                TakebackActions.RecordRecovery,
                TakebackIn(TakebackStatus.Draft),
                User(TestUsers.Jamie));

            Assert.Equal(
                "Takeback TB-000001 is draft. You can only record a recovery for a takeback that is notice sent or partially recovered.",
                check.Message);
        }

        [Fact]
        public void ThrowIfDenied_maps_each_outcome_to_its_exception()
        {
            Assert.Throws<ForbiddenException>(() => WorkflowCheck.Forbid("no").ThrowIfDenied());
            Assert.Throws<BusinessRuleException>(() => WorkflowCheck.WrongState("wrong").ThrowIfDenied());
            WorkflowCheck.Allow().ThrowIfDenied();
        }

        [Fact]
        public void An_unknown_action_is_a_programming_error()
        {
            Assert.Throws<ArgumentOutOfRangeException>(
                () => _workflow.Check("Explode", TakebackIn(TakebackStatus.Draft), User(TestUsers.Jamie)));
        }

        [Fact]
        public void Every_action_name_is_known_to_the_workflow()
        {
            string[] actions = typeof(TakebackActions)
                .GetFields()
                .Where(f => f.IsLiteral)
                .Select(f => (string)f.GetRawConstantValue())
                .Where(name => name != TakebackActions.Create)
                .ToArray();

            Takeback takeback = TakebackIn(TakebackStatus.Draft);
            AppUser admin = User(TestUsers.Casey);
            foreach (string action in actions)
            {
                _workflow.Check(action, takeback, admin);
            }

            Assert.Equal(10, actions.Length);
        }
    }

    public class ActivityWorkflowTests
    {
        private readonly TestWorld _world = new TestWorld();

        private static Activity ActivityIn(ActivityStatus status)
        {
            return new Activity
            {
                ActivityId = 1,
                Status = status,
                CreatedByUserId = TestUsers.Jamie,
                AssignedToUserId = TestUsers.Alex
            };
        }

        [Theory]
        [InlineData(ActivityStatus.Open, true)]
        [InlineData(ActivityStatus.InProgress, true)]
        [InlineData(ActivityStatus.Completed, false)]
        [InlineData(ActivityStatus.Cancelled, false)]
        public void IsOpen_is_true_for_open_and_in_progress_only(ActivityStatus status, bool expected)
        {
            Assert.Equal(expected, ActivityWorkflow.IsOpen(status));
        }

        [Theory]
        [InlineData(TestUsers.Jamie, true)]
        [InlineData(TestUsers.Alex, true)]
        [InlineData(TestUsers.Blake, true)]
        [InlineData(TestUsers.Morgan, true)]
        [InlineData(TestUsers.Casey, true)]
        [InlineData(TestUsers.Inactive, false)]
        public void CanModify_allows_the_creator_the_assignee_supervisors_and_admins(int userId, bool expected)
        {
            Assert.Equal(expected, ActivityWorkflow.CanModify(ActivityIn(ActivityStatus.Open), _world.Users.GetById(userId)));
        }

        [Fact]
        public void Available_actions_depend_on_whether_the_activity_is_open()
        {
            AppUser creator = _world.Users.GetById(TestUsers.Jamie);

            Assert.Equal(
                new[] { "Edit", "Complete", "Cancel", "AddNote" },
                ActivityWorkflow.GetAvailableActions(ActivityIn(ActivityStatus.InProgress), creator).ToArray());
            Assert.Equal(
                new[] { "Reopen", "AddNote" },
                ActivityWorkflow.GetAvailableActions(ActivityIn(ActivityStatus.Cancelled), creator).ToArray());
            Assert.Equal(
                new[] { "AddNote" },
                ActivityWorkflow.GetAvailableActions(ActivityIn(ActivityStatus.Open), _world.Users.GetById(TestUsers.Inactive)).ToArray());
        }
    }
}
