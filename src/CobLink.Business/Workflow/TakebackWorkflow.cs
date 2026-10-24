using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using CobLink.Business.Text;
using CobLink.Models;

namespace CobLink.Business.Workflow
{
    /// <summary>
    /// The takeback state machine and its permission rules (see docs/api-reference.md section 4).
    /// One place decides both what is enforced and what is offered as AvailableActions.
    /// </summary>
    public class TakebackWorkflow
    {
        private static readonly string[] ActionOrder =
        {
            TakebackActions.Edit, TakebackActions.Submit, TakebackActions.Approve, TakebackActions.Reject,
            TakebackActions.SendNotice, TakebackActions.RecordRecovery, TakebackActions.Dispute,
            TakebackActions.ResolveDispute, TakebackActions.WriteOff, TakebackActions.Cancel
        };

        private static readonly Dictionary<string, TakebackStatus[]> AllowedFrom =
            new Dictionary<string, TakebackStatus[]>
            {
                { TakebackActions.Edit, new[] { TakebackStatus.Draft, TakebackStatus.Rejected } },
                { TakebackActions.Submit, new[] { TakebackStatus.Draft, TakebackStatus.Rejected } },
                { TakebackActions.Approve, new[] { TakebackStatus.PendingApproval } },
                { TakebackActions.Reject, new[] { TakebackStatus.PendingApproval } },
                { TakebackActions.SendNotice, new[] { TakebackStatus.Approved } },
                { TakebackActions.RecordRecovery, new[] { TakebackStatus.NoticeSent, TakebackStatus.PartiallyRecovered } },
                { TakebackActions.Dispute, new[] { TakebackStatus.NoticeSent, TakebackStatus.PartiallyRecovered } },
                { TakebackActions.ResolveDispute, new[] { TakebackStatus.Disputed } },
                {
                    TakebackActions.WriteOff,
                    new[] { TakebackStatus.NoticeSent, TakebackStatus.PartiallyRecovered, TakebackStatus.Disputed }
                },
                {
                    TakebackActions.Cancel,
                    new[]
                    {
                        TakebackStatus.Draft, TakebackStatus.PendingApproval, TakebackStatus.Approved,
                        TakebackStatus.Rejected
                    }
                }
            };

        private readonly TakebackOptions _options;

        public TakebackWorkflow(TakebackOptions options)
        {
            _options = options;
        }

        public WorkflowCheck Check(string action, Takeback takeback, AppUser user)
        {
            if (!AllowedFrom.ContainsKey(action))
            {
                throw new ArgumentOutOfRangeException("action", action, "Unknown takeback action.");
            }

            WorkflowCheck roleCheck = CheckRole(action, takeback, user);
            if (!roleCheck.IsAllowed)
            {
                return roleCheck;
            }

            if (!AllowedFrom[action].Contains(takeback.Status))
            {
                return WorkflowCheck.WrongState(StateMessage(action, takeback));
            }

            return CheckRecordRules(action, takeback, user);
        }

        public void Require(string action, Takeback takeback, AppUser user)
        {
            Check(action, takeback, user).ThrowIfDenied();
        }

        public List<string> GetAvailableActions(Takeback takeback, AppUser user)
        {
            return ActionOrder.Where(action => Check(action, takeback, user).IsAllowed).ToList();
        }

        private static WorkflowCheck CheckRole(string action, Takeback takeback, AppUser user)
        {
            switch (action)
            {
                case TakebackActions.Edit:
                case TakebackActions.Submit:
                case TakebackActions.Cancel:
                    if (user.Role < UserRole.Supervisor && takeback.CreatedByUserId != user.UserId)
                    {
                        return WorkflowCheck.Forbid(
                            "Only the creator, a supervisor or an administrator can " + Verb(action) +
                            " this takeback.");
                    }

                    break;

                case TakebackActions.Approve:
                case TakebackActions.Reject:
                case TakebackActions.ResolveDispute:
                case TakebackActions.WriteOff:
                    if (user.Role < UserRole.Supervisor)
                    {
                        return WorkflowCheck.Forbid(
                            "Only supervisors and administrators can " + Verb(action) + " takebacks.");
                    }

                    break;
            }

            return WorkflowCheck.Allow();
        }

        private WorkflowCheck CheckRecordRules(string action, Takeback takeback, AppUser user)
        {
            if (action == TakebackActions.Approve || action == TakebackActions.Reject)
            {
                if (takeback.CreatedByUserId == user.UserId)
                {
                    return WorkflowCheck.Forbid("You cannot approve or reject a takeback that you created.");
                }
            }

            if (action == TakebackActions.Approve &&
                takeback.TakebackAmount > _options.HighValueThreshold &&
                user.Role != UserRole.Admin)
            {
                return WorkflowCheck.Forbid(
                    "Takebacks above " + _options.HighValueThreshold.ToString("N2", CultureInfo.InvariantCulture) +
                    " must be approved by an administrator.");
            }

            return WorkflowCheck.Allow();
        }

        private static string StateMessage(string action, Takeback takeback)
        {
            List<string> allowed = AllowedFrom[action].Select(s => EnumText.Humanize(s).ToLowerInvariant()).ToList();
            string allowedText = allowed.Count == 1
                ? allowed[0]
                : string.Join(", ", allowed.Take(allowed.Count - 1)) + " or " + allowed[allowed.Count - 1];

            return "Takeback " + takeback.TakebackNumber + " is " + EnumText.Humanize(takeback.Status).ToLowerInvariant() +
                   ". You can only " + Verb(action) + " a takeback that is " + allowedText + ".";
        }

        private static string Verb(string action)
        {
            switch (action)
            {
                case TakebackActions.SendNotice:
                    return "send a notice for";
                case TakebackActions.RecordRecovery:
                    return "record a recovery for";
                case TakebackActions.ResolveDispute:
                    return "resolve a dispute on";
                case TakebackActions.WriteOff:
                    return "write off";
                default:
                    return action.ToLowerInvariant();
            }
        }
    }
}
