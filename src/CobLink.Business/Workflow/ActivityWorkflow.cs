using System.Collections.Generic;
using CobLink.Models;

namespace CobLink.Business.Workflow
{
    /// <summary>Which activities can be changed by whom, and which actions the UI should offer.</summary>
    public static class ActivityWorkflow
    {
        public static bool IsOpen(ActivityStatus status)
        {
            return status == ActivityStatus.Open || status == ActivityStatus.InProgress;
        }

        /// <summary>Supervisors and administrators can change any activity; analysts only their own or assigned ones.</summary>
        public static bool CanModify(Activity activity, AppUser user)
        {
            if (user.Role >= UserRole.Supervisor)
            {
                return true;
            }

            return activity.CreatedByUserId == user.UserId || activity.AssignedToUserId == user.UserId;
        }

        public static List<string> GetAvailableActions(Activity activity, AppUser user)
        {
            var actions = new List<string>();
            if (CanModify(activity, user))
            {
                if (IsOpen(activity.Status))
                {
                    actions.Add(ActivityActions.Edit);
                    actions.Add(ActivityActions.Complete);
                    actions.Add(ActivityActions.Cancel);
                }
                else
                {
                    actions.Add(ActivityActions.Reopen);
                }
            }

            actions.Add(ActivityActions.AddNote);
            return actions;
        }
    }
}
