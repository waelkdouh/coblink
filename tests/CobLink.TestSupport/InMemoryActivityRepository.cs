using System;
using System.Collections.Generic;
using System.Linq;
using CobLink.Data.Repositories;
using CobLink.Models;

namespace CobLink.TestSupport
{
    public class InMemoryActivityRepository : IActivityRepository
    {
        private readonly FakeDatabase _db;

        public InMemoryActivityRepository(FakeDatabase db)
        {
            _db = db;
        }

        public PagedResult<ActivityListItem> Search(ActivitySearchRequest request)
        {
            IEnumerable<Activity> query = _db.Activities.Select(CloneWithDerived);

            if (!string.IsNullOrEmpty(request.SearchText))
            {
                query = query.Where(a => Matches(a, request.SearchText));
            }

            if (request.Status.HasValue)
            {
                query = query.Where(a => a.Status == request.Status.Value);
            }

            if (request.OpenOnly)
            {
                query = query.Where(a => a.Status == ActivityStatus.Open || a.Status == ActivityStatus.InProgress);
            }

            if (request.ActivityType.HasValue)
            {
                query = query.Where(a => a.ActivityType == request.ActivityType.Value);
            }

            if (request.Priority.HasValue)
            {
                query = query.Where(a => a.Priority == request.Priority.Value);
            }

            if (request.AssignedToUserId.HasValue)
            {
                query = query.Where(a => a.AssignedToUserId == request.AssignedToUserId);
            }

            if (request.MemberId.HasValue)
            {
                query = query.Where(a => a.MemberId == request.MemberId);
            }

            if (request.TakebackId.HasValue)
            {
                query = query.Where(a => a.TakebackId == request.TakebackId);
            }

            if (request.DueFrom.HasValue)
            {
                query = query.Where(a => a.DueDate.HasValue && a.DueDate.Value.Date >= request.DueFrom.Value.Date);
            }

            if (request.DueTo.HasValue)
            {
                query = query.Where(a => a.DueDate.HasValue && a.DueDate.Value.Date <= request.DueTo.Value.Date);
            }

            if (request.OverdueOnly)
            {
                query = query.Where(a => a.IsOverdue);
            }

            List<ActivityListItem> sorted = Sort(query.Select(ToListItem), request.SortBy, request.SortDescending).ToList();
            int pageNumber = Math.Max(1, request.PageNumber);
            int pageSize = Math.Max(1, Math.Min(PagedRequest.MaxPageSize, request.PageSize));
            return new PagedResult<ActivityListItem>
            {
                Items = sorted.Skip((pageNumber - 1) * pageSize).Take(pageSize).ToList(),
                TotalCount = sorted.Count,
                PageNumber = pageNumber,
                PageSize = pageSize
            };
        }

        public Activity GetById(int activityId)
        {
            Activity stored = Find(activityId);
            if (stored == null)
            {
                return null;
            }

            Activity copy = Cloner.Clone(stored);
            FillDerived(copy);
            copy.Notes = _db.ActivityNotes
                .Where(n => n.ActivityId == activityId)
                .OrderBy(n => n.NoteId)
                .Select(n =>
                {
                    ActivityNote note = Cloner.Clone(n);
                    note.CreatedByName = _db.UserDisplayName(n.CreatedByUserId);
                    return note;
                })
                .ToList();
            return copy;
        }

        public int Insert(Activity activity, int userId)
        {
            Activity stored = Cloner.Clone(activity);
            stored.ActivityId = _db.NextActivityId();
            stored.ActivityNumber = "ACT-" + stored.ActivityId.ToString("D6");
            stored.CreatedByUserId = userId;
            stored.CreatedDate = _db.Clock.UtcNow;
            stored.ModifiedByUserId = null;
            stored.ModifiedDate = null;
            stored.RowVersion = _db.NextRowVersion();
            stored.Notes = new List<ActivityNote>();
            stored.AvailableActions = new List<string>();
            _db.Activities.Add(stored);
            return stored.ActivityId;
        }

        public void Update(Activity activity, int userId)
        {
            Activity stored = Find(activity.ActivityId);
            if (stored == null)
            {
                throw new NotFoundException("Activity", activity.ActivityId);
            }

            if (activity.RowVersion == null || !stored.RowVersion.SequenceEqual(activity.RowVersion))
            {
                throw new ConcurrencyException();
            }

            stored.MemberId = activity.MemberId;
            stored.TakebackId = activity.TakebackId;
            stored.ActivityType = activity.ActivityType;
            stored.Status = activity.Status;
            stored.Priority = activity.Priority;
            stored.Subject = activity.Subject;
            stored.Description = activity.Description;
            stored.AssignedToUserId = activity.AssignedToUserId;
            stored.DueDate = activity.DueDate;
            stored.CompletedDate = activity.CompletedDate;
            stored.Outcome = activity.Outcome;
            stored.ModifiedByUserId = userId;
            stored.ModifiedDate = _db.Clock.UtcNow;
            stored.RowVersion = _db.NextRowVersion();
        }

        public ActivityNote AddNote(int activityId, string noteText, bool isSystem, int userId)
        {
            if (Find(activityId) == null)
            {
                throw new NotFoundException("Activity", activityId);
            }

            var note = new ActivityNote
            {
                NoteId = _db.NextNoteId(),
                ActivityId = activityId,
                NoteText = noteText,
                IsSystem = isSystem,
                CreatedByUserId = userId,
                CreatedDate = _db.Clock.UtcNow
            };

            _db.ActivityNotes.Add(note);
            ActivityNote copy = Cloner.Clone(note);
            copy.CreatedByName = _db.UserDisplayName(userId);
            return copy;
        }

        private Activity Find(int activityId)
        {
            return _db.Activities.SingleOrDefault(a => a.ActivityId == activityId);
        }

        private void FillDerived(Activity activity)
        {
            Member member = activity.MemberId.HasValue ? _db.FindMember(activity.MemberId.Value) : null;
            Takeback takeback = activity.TakebackId.HasValue
                ? _db.Takebacks.SingleOrDefault(t => t.TakebackId == activity.TakebackId.Value)
                : null;

            activity.MemberNumber = member == null ? null : member.MemberNumber;
            activity.MemberName = member == null ? null : member.FullName;
            activity.TakebackNumber = takeback == null ? null : takeback.TakebackNumber;
            activity.AssignedToName = _db.UserDisplayName(activity.AssignedToUserId);
            activity.CreatedByName = _db.UserDisplayName(activity.CreatedByUserId);
            activity.ModifiedByName = _db.UserDisplayName(activity.ModifiedByUserId);
            activity.IsOverdue = _db.IsOverdue(activity);
        }

        private Activity CloneWithDerived(Activity stored)
        {
            Activity copy = Cloner.Clone(stored);
            FillDerived(copy);
            return copy;
        }

        private static ActivityListItem ToListItem(Activity activity)
        {
            return new ActivityListItem
            {
                ActivityId = activity.ActivityId,
                ActivityNumber = activity.ActivityNumber,
                Subject = activity.Subject,
                ActivityType = activity.ActivityType,
                Status = activity.Status,
                Priority = activity.Priority,
                MemberId = activity.MemberId,
                MemberNumber = activity.MemberNumber,
                MemberName = activity.MemberName,
                TakebackId = activity.TakebackId,
                TakebackNumber = activity.TakebackNumber,
                AssignedToUserId = activity.AssignedToUserId,
                AssignedToName = activity.AssignedToName,
                DueDate = activity.DueDate,
                CompletedDate = activity.CompletedDate,
                IsOverdue = activity.IsOverdue,
                CreatedDate = activity.CreatedDate
            };
        }

        private static bool Matches(Activity activity, string text)
        {
            return new[]
                {
                    activity.ActivityNumber, activity.Subject, activity.Description, activity.MemberName,
                    activity.MemberNumber, activity.TakebackNumber
                }
                .Any(value => value != null && value.IndexOf(text, StringComparison.OrdinalIgnoreCase) >= 0);
        }

        private static IEnumerable<ActivityListItem> Sort(IEnumerable<ActivityListItem> items, string sortBy, bool descending)
        {
            switch (sortBy)
            {
                case "activityNumber":
                    return Order(items, i => i.ActivityId, descending);
                case "subject":
                    return Order(items, i => i.Subject, descending);
                case "activityType":
                    return Order(items, i => (int)i.ActivityType, descending);
                case "status":
                    return Order(items, i => (int)i.Status, descending);
                case "priority":
                    return Order(items, i => (int)i.Priority, descending);
                case "memberName":
                    return Order(items, i => i.MemberName ?? string.Empty, descending);
                case "assignedToName":
                    return Order(items, i => i.AssignedToName ?? string.Empty, descending);
                case "createdDate":
                    return Order(items, i => i.CreatedDate, descending);
                case "dueDate":
                    // Undated activities are always last, whatever the direction.
                    return descending
                        ? items.OrderBy(i => i.DueDate.HasValue ? 0 : 1).ThenByDescending(i => i.DueDate).ThenByDescending(i => i.ActivityId)
                        : items.OrderBy(i => i.DueDate.HasValue ? 0 : 1).ThenBy(i => i.DueDate).ThenBy(i => i.ActivityId);
                default:
                    // No sort key: due date ascending with undated activities last.
                    return items.OrderBy(i => i.DueDate.HasValue ? 0 : 1).ThenBy(i => i.DueDate).ThenBy(i => i.ActivityId);
            }
        }

        private static IEnumerable<ActivityListItem> Order<TKey>(
            IEnumerable<ActivityListItem> items,
            Func<ActivityListItem, TKey> key,
            bool descending)
        {
            return descending
                ? items.OrderByDescending(key).ThenByDescending(i => i.ActivityId)
                : items.OrderBy(key).ThenBy(i => i.ActivityId);
        }
    }
}
