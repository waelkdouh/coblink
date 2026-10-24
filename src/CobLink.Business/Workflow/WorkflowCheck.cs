using CobLink.Models;

namespace CobLink.Business.Workflow
{
    public enum WorkflowOutcome
    {
        Allowed,

        /// <summary>The user may never do this (role or ownership).</summary>
        Forbidden,

        /// <summary>The takeback is not in a status that permits the action.</summary>
        WrongState
    }

    /// <summary>Result of asking the workflow whether a user may perform an action on a takeback right now.</summary>
    public class WorkflowCheck
    {
        private WorkflowCheck(WorkflowOutcome outcome, string message)
        {
            Outcome = outcome;
            Message = message;
        }

        public WorkflowOutcome Outcome { get; private set; }

        public string Message { get; private set; }

        public bool IsAllowed
        {
            get { return Outcome == WorkflowOutcome.Allowed; }
        }

        public static WorkflowCheck Allow()
        {
            return new WorkflowCheck(WorkflowOutcome.Allowed, null);
        }

        public static WorkflowCheck Forbid(string message)
        {
            return new WorkflowCheck(WorkflowOutcome.Forbidden, message);
        }

        public static WorkflowCheck WrongState(string message)
        {
            return new WorkflowCheck(WorkflowOutcome.WrongState, message);
        }

        /// <summary>Throws the exception that matches a denied check; does nothing when allowed.</summary>
        public void ThrowIfDenied()
        {
            switch (Outcome)
            {
                case WorkflowOutcome.Forbidden:
                    throw new ForbiddenException(Message);
                case WorkflowOutcome.WrongState:
                    throw new BusinessRuleException(Message);
            }
        }
    }
}
