using System;
using System.Collections.Generic;
using CobLink.Business.Text;
using CobLink.Business.Validation;
using CobLink.Business.Workflow;
using CobLink.Data.Repositories;
using CobLink.Models;

namespace CobLink.Business.Services
{
    public class ActivityService : IActivityService
    {
        public const int MaxSubjectLength = 200;
        public const int MaxDescriptionLength = 4000;
        public const int MaxOutcomeLength = 1000;
        public const int MaxNoteLength = 2000;

        private readonly IActivityRepository _activities;
        private readonly ITakebackRepository _takebacks;
        private readonly ILookupRepository _lookups;
        private readonly IUserRepository _users;
        private readonly ICurrentUser _currentUser;
        private readonly IClock _clock;

        public ActivityService(
            IActivityRepository activities,
            ITakebackRepository takebacks,
            ILookupRepository lookups,
            IUserRepository users,
            ICurrentUser currentUser,
            IClock clock)
        {
            _activities = activities;
            _takebacks = takebacks;
            _lookups = lookups;
            _users = users;
            _currentUser = currentUser;
            _clock = clock;
        }

        public PagedResult<ActivityListItem> Search(ActivitySearchRequest request)
        {
            _currentUser.Require();
            request = request ?? new ActivitySearchRequest();

            var errors = new ValidationCollector();
            SearchRules.ValidatePaging(request, SearchRules.ActivitySortKeys, errors);
            if (request.Status.HasValue && !Enum.IsDefined(typeof(ActivityStatus), request.Status.Value))
            {
                errors.Add("status", "Unknown activity status.");
            }

            if (request.ActivityType.HasValue && !Enum.IsDefined(typeof(ActivityType), request.ActivityType.Value))
            {
                errors.Add("activityType", "Unknown activity type.");
            }

            if (request.Priority.HasValue && !Enum.IsDefined(typeof(ActivityPriority), request.Priority.Value))
            {
                errors.Add("priority", "Unknown priority.");
            }

            if (request.DueFrom.HasValue && request.DueTo.HasValue &&
                request.DueFrom.Value.Date > request.DueTo.Value.Date)
            {
                errors.Add("dueTo", "Due to cannot be before due from.");
            }

            errors.ThrowIfAny();

            request.SearchText = ValidationCollector.Clean(request.SearchText);
            return _activities.Search(request);
        }

        public Activity GetById(int activityId)
        {
            _currentUser.Require();
            return Load(activityId);
        }

        public Activity Save(SaveActivityRequest request)
        {
            RequireRequest(request);
            AppUser user = _currentUser.Require();
            bool isNew = request.ActivityId == 0;

            Activity existing = null;
            if (!isNew)
            {
                existing = LoadForUpdate(request.ActivityId, user);
                if (!ActivityWorkflow.IsOpen(existing.Status))
                {
                    throw new BusinessRuleException(
                        "Activity " + existing.ActivityNumber + " is " + EnumText.Humanize(existing.Status).ToLowerInvariant() +
                        " and cannot be edited. Reopen it first.");
                }
            }

            var errors = new ValidationCollector();
            string subject = errors.Required("subject", "Subject", request.Subject, MaxSubjectLength);
            string description = errors.Optional("description", "Description", request.Description, MaxDescriptionLength);

            if (!Enum.IsDefined(typeof(ActivityType), request.ActivityType))
            {
                errors.Add("activityType", "Select a valid activity type.");
            }

            if (!Enum.IsDefined(typeof(ActivityPriority), request.Priority))
            {
                errors.Add("priority", "Select a valid priority.");
            }

            if (!ActivityWorkflow.IsOpen(request.Status))
            {
                errors.Add("status", "Status must be Open or In progress. Use Complete or Cancel to close an activity.");
            }

            DateTime? dueDate = request.DueDate.HasValue ? request.DueDate.Value.Date : (DateTime?)null;
            if (isNew && dueDate.HasValue && dueDate.Value < _clock.Today)
            {
                errors.Add("dueDate", "Due date cannot be in the past.");
            }

            if (!isNew && request.RowVersion == null)
            {
                errors.Add("rowVersion", "The record version is required to update an activity.");
            }

            int? memberId = request.MemberId;
            if (request.TakebackId.HasValue)
            {
                Takeback takeback = _takebacks.GetById(request.TakebackId.Value);
                if (takeback == null)
                {
                    errors.Add("takebackId", "The linked takeback does not exist.");
                }
                else
                {
                    if (memberId.HasValue && memberId.Value != takeback.MemberId)
                    {
                        errors.Add("memberId", "The member must be the member of the linked takeback.");
                    }

                    memberId = takeback.MemberId;
                }
            }

            // General activities (no member, no takeback) are allowed, e.g. a quarterly audit.
            if (memberId.HasValue && _lookups.GetMember(memberId.Value) == null)
            {
                errors.Add("memberId", "The selected member does not exist.");
            }

            AppUser assignee = null;
            int? assignedToUserId = request.AssignedToUserId ?? (isNew ? user.UserId : (int?)null);
            if (assignedToUserId.HasValue)
            {
                assignee = assignedToUserId.Value == user.UserId ? user : _users.GetById(assignedToUserId.Value);
                if (assignee == null || !assignee.IsActive)
                {
                    errors.Add("assignedToUserId", "The assignee must be an active user.");
                }
            }

            errors.ThrowIfAny();

            if (isNew)
            {
                return Create(request, user, assignee, memberId, subject, description, dueDate);
            }

            return Update(request, existing, user, assignee, memberId, subject, description, dueDate);
        }

        public Activity Complete(ActivityActionRequest request)
        {
            return Close(request, ActivityStatus.Completed, "Outcome", "completed");
        }

        public Activity Cancel(ActivityActionRequest request)
        {
            return Close(request, ActivityStatus.Cancelled, "Reason", "cancelled");
        }

        public Activity Reopen(ActivityActionRequest request)
        {
            RequireRequest(request);
            AppUser user = _currentUser.Require();

            var errors = new ValidationCollector();
            string comment = errors.Optional("comment", "Comment", request.Comment, MaxOutcomeLength);
            ValidateAction(request, errors);
            errors.ThrowIfAny();

            Activity activity = LoadForUpdate(request.ActivityId, user);
            if (ActivityWorkflow.IsOpen(activity.Status))
            {
                throw new BusinessRuleException("Activity " + activity.ActivityNumber + " is already open.");
            }

            string previous = EnumText.Humanize(activity.Status).ToLowerInvariant();
            activity.Status = ActivityStatus.Open;
            activity.CompletedDate = null;
            activity.Outcome = null;
            activity.RowVersion = request.RowVersion;
            _activities.Update(activity, user.UserId);

            string note = "Reopened (was " + previous + ").";
            _activities.AddNote(activity.ActivityId, comment == null ? note : note + " " + comment, true, user.UserId);
            return Load(activity.ActivityId);
        }

        public Activity AddNote(AddActivityNoteRequest request)
        {
            RequireRequest(request);
            AppUser user = _currentUser.Require();

            var errors = new ValidationCollector();
            string text = errors.Required("noteText", "Note", request.NoteText, MaxNoteLength);
            if (request.ActivityId <= 0)
            {
                errors.Add("activityId", "Activity id is required.");
            }

            errors.ThrowIfAny();

            Activity activity = _activities.GetById(request.ActivityId);
            if (activity == null)
            {
                throw new NotFoundException("Activity", request.ActivityId);
            }

            _activities.AddNote(activity.ActivityId, text, false, user.UserId);
            return Load(activity.ActivityId);
        }

        private Activity Create(
            SaveActivityRequest request,
            AppUser user,
            AppUser assignee,
            int? memberId,
            string subject,
            string description,
            DateTime? dueDate)
        {
            var activity = new Activity
            {
                MemberId = memberId,
                TakebackId = request.TakebackId,
                ActivityType = request.ActivityType,
                Priority = request.Priority,
                Status = request.Status,
                Subject = subject,
                Description = description,
                AssignedToUserId = assignee == null ? (int?)null : assignee.UserId,
                DueDate = dueDate
            };

            int activityId = _activities.Insert(activity, user.UserId);
            _activities.AddNote(activityId, "Activity created.", true, user.UserId);
            if (assignee != null && assignee.UserId != user.UserId)
            {
                _activities.AddNote(activityId, "Assigned to " + assignee.DisplayName + ".", true, user.UserId);
            }

            return Load(activityId);
        }

        private Activity Update(
            SaveActivityRequest request,
            Activity activity,
            AppUser user,
            AppUser assignee,
            int? memberId,
            string subject,
            string description,
            DateTime? dueDate)
        {
            var notes = new List<string>();
            if (activity.Status != request.Status)
            {
                notes.Add(
                    "Status changed from " + EnumText.Humanize(activity.Status).ToLowerInvariant() + " to " +
                    EnumText.Humanize(request.Status).ToLowerInvariant() + ".");
            }

            int? newAssigneeId = assignee == null ? (int?)null : assignee.UserId;
            if (activity.AssignedToUserId != newAssigneeId)
            {
                notes.Add(assignee == null ? "Unassigned." : "Reassigned to " + assignee.DisplayName + ".");
            }

            activity.MemberId = memberId;
            activity.TakebackId = request.TakebackId;
            activity.ActivityType = request.ActivityType;
            activity.Priority = request.Priority;
            activity.Status = request.Status;
            activity.Subject = subject;
            activity.Description = description;
            activity.AssignedToUserId = newAssigneeId;
            activity.DueDate = dueDate;
            activity.RowVersion = request.RowVersion;

            _activities.Update(activity, user.UserId);
            foreach (string note in notes)
            {
                _activities.AddNote(activity.ActivityId, note, true, user.UserId);
            }

            return Load(activity.ActivityId);
        }

        private Activity Close(ActivityActionRequest request, ActivityStatus newStatus, string commentLabel, string verb)
        {
            RequireRequest(request);
            AppUser user = _currentUser.Require();

            var errors = new ValidationCollector();
            string comment = errors.Required("comment", commentLabel, request.Comment, MaxOutcomeLength);
            ValidateAction(request, errors);
            errors.ThrowIfAny();

            Activity activity = LoadForUpdate(request.ActivityId, user);
            if (!ActivityWorkflow.IsOpen(activity.Status))
            {
                throw new BusinessRuleException(
                    "Activity " + activity.ActivityNumber + " is " + EnumText.Humanize(activity.Status).ToLowerInvariant() +
                    " and cannot be " + verb + ".");
            }

            bool completing = newStatus == ActivityStatus.Completed;
            activity.Status = newStatus;
            activity.CompletedDate = completing ? _clock.UtcNow : (DateTime?)null;
            activity.Outcome = completing ? comment : null;
            activity.RowVersion = request.RowVersion;
            _activities.Update(activity, user.UserId);

            string prefix = completing ? "Completed. Outcome: " : "Cancelled. Reason: ";
            _activities.AddNote(activity.ActivityId, prefix + comment, true, user.UserId);
            return Load(activity.ActivityId);
        }

        private static void ValidateAction(ActivityActionRequest request, ValidationCollector errors)
        {
            if (request.ActivityId <= 0)
            {
                errors.Add("activityId", "Activity id is required.");
            }

            if (request.RowVersion == null)
            {
                errors.Add("rowVersion", "The record version is required to update an activity.");
            }
        }

        private static void RequireRequest(object request)
        {
            if (request == null)
            {
                throw new ValidationFailedException(null, "A request body is required.");
            }
        }

        /// <summary>Loads the activity and makes sure the current user may change it.</summary>
        private Activity LoadForUpdate(int activityId, AppUser user)
        {
            Activity activity = _activities.GetById(activityId);
            if (activity == null)
            {
                throw new NotFoundException("Activity", activityId);
            }

            if (!ActivityWorkflow.CanModify(activity, user))
            {
                throw new ForbiddenException(
                    "Only the creator, the assignee, a supervisor or an administrator can change this activity.");
            }

            return activity;
        }

        private Activity Load(int activityId)
        {
            Activity activity = _activities.GetById(activityId);
            if (activity == null)
            {
                throw new NotFoundException("Activity", activityId);
            }

            activity.AvailableActions = ActivityWorkflow.GetAvailableActions(activity, _currentUser.Require());
            return activity;
        }
    }
}
