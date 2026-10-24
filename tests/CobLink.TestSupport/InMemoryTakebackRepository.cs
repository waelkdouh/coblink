using System;
using System.Collections.Generic;
using System.Linq;
using CobLink.Data.Repositories;
using CobLink.Models;

namespace CobLink.TestSupport
{
    public class InMemoryTakebackRepository : ITakebackRepository
    {
        private readonly FakeDatabase _db;

        public InMemoryTakebackRepository(FakeDatabase db)
        {
            _db = db;
        }

        public PagedResult<TakebackListItem> Search(TakebackSearchRequest request)
        {
            IEnumerable<Takeback> query = _db.Takebacks.Select(CloneWithDerived);

            if (!string.IsNullOrEmpty(request.SearchText))
            {
                query = query.Where(t => Matches(t, request.SearchText));
            }

            if (request.Status.HasValue)
            {
                query = query.Where(t => t.Status == request.Status.Value);
            }

            if (request.Reason.HasValue)
            {
                query = query.Where(t => t.Reason == request.Reason.Value);
            }

            if (request.MemberId.HasValue)
            {
                query = query.Where(t => t.MemberId == request.MemberId.Value);
            }

            if (request.ProviderId.HasValue)
            {
                query = query.Where(t => t.ProviderId == request.ProviderId.Value);
            }

            if (request.CreatedByUserId.HasValue)
            {
                query = query.Where(t => t.CreatedByUserId == request.CreatedByUserId.Value);
            }

            if (request.MinAmount.HasValue)
            {
                query = query.Where(t => t.TakebackAmount >= request.MinAmount.Value);
            }

            if (request.MaxAmount.HasValue)
            {
                query = query.Where(t => t.TakebackAmount <= request.MaxAmount.Value);
            }

            if (request.DueFrom.HasValue)
            {
                query = query.Where(t => t.DueDate.HasValue && t.DueDate.Value.Date >= request.DueFrom.Value.Date);
            }

            if (request.DueTo.HasValue)
            {
                query = query.Where(t => t.DueDate.HasValue && t.DueDate.Value.Date <= request.DueTo.Value.Date);
            }

            if (request.OverdueOnly)
            {
                query = query.Where(t => t.IsOverdue);
            }

            List<TakebackListItem> sorted = Sort(query.Select(ToListItem), request.SortBy, request.SortDescending).ToList();
            int pageNumber = Math.Max(1, request.PageNumber);
            int pageSize = Math.Max(1, Math.Min(PagedRequest.MaxPageSize, request.PageSize));
            return new PagedResult<TakebackListItem>
            {
                Items = sorted.Skip((pageNumber - 1) * pageSize).Take(pageSize).ToList(),
                TotalCount = sorted.Count,
                PageNumber = pageNumber,
                PageSize = pageSize
            };
        }

        public Takeback GetById(int takebackId)
        {
            Takeback stored = Find(takebackId);
            if (stored == null)
            {
                return null;
            }

            Takeback copy = CloneWithDerived(stored);
            copy.Recoveries = _db.Recoveries
                .Where(r => r.TakebackId == takebackId)
                .OrderBy(r => r.RecoveryId)
                .Select(r =>
                {
                    TakebackRecovery recovery = Cloner.Clone(r);
                    recovery.CreatedByName = _db.UserDisplayName(r.CreatedByUserId);
                    return recovery;
                })
                .ToList();
            copy.History = _db.History
                .Where(h => h.TakebackId == takebackId)
                .OrderBy(h => h.HistoryId)
                .Select(h =>
                {
                    TakebackHistoryEntry entry = Cloner.Clone(h);
                    entry.ChangedByName = _db.UserDisplayName(h.ChangedByUserId);
                    return entry;
                })
                .ToList();
            return copy;
        }

        public bool ActiveTakebackExists(string claimNumber, int providerId, int excludeTakebackId)
        {
            return _db.Takebacks.Any(t =>
                t.TakebackId != excludeTakebackId &&
                t.ProviderId == providerId &&
                string.Equals(t.ClaimNumber, claimNumber, StringComparison.OrdinalIgnoreCase) &&
                t.Status != TakebackStatus.Rejected &&
                t.Status != TakebackStatus.Cancelled);
        }

        public int Insert(Takeback takeback, int userId)
        {
            Takeback stored = Cloner.Clone(takeback);
            stored.TakebackId = _db.NextTakebackId();
            stored.TakebackNumber = "TB-" + stored.TakebackId.ToString("D6");
            stored.Status = TakebackStatus.Draft;
            stored.RecoveredAmount = 0m;
            stored.NoticeDate = null;
            stored.DueDate = null;
            stored.ApprovedByUserId = null;
            stored.ApprovedDate = null;
            stored.CreatedByUserId = userId;
            stored.CreatedDate = _db.Clock.UtcNow;
            stored.ModifiedByUserId = null;
            stored.ModifiedDate = null;
            stored.RowVersion = _db.NextRowVersion();
            stored.Recoveries = new List<TakebackRecovery>();
            stored.History = new List<TakebackHistoryEntry>();
            stored.LinkedActivities = new List<ActivityListItem>();
            stored.AvailableActions = new List<string>();
            _db.Takebacks.Add(stored);

            AddHistory(stored.TakebackId, TakebackActions.Create, null, TakebackStatus.Draft, null, userId);
            return stored.TakebackId;
        }

        public void Update(Takeback takeback, int userId)
        {
            Takeback stored = FindForUpdate(takeback.TakebackId, takeback.RowVersion);

            stored.ClaimNumber = takeback.ClaimNumber;
            stored.MemberId = takeback.MemberId;
            stored.ProviderId = takeback.ProviderId;
            stored.Reason = takeback.Reason;
            stored.DateOfService = takeback.DateOfService;
            stored.OriginalPaidAmount = takeback.OriginalPaidAmount;
            stored.TakebackAmount = takeback.TakebackAmount;
            stored.OtherCarrierName = takeback.OtherCarrierName;
            stored.OtherPolicyNumber = takeback.OtherPolicyNumber;
            stored.Notes = takeback.Notes;
            Touch(stored, userId);

            AddHistory(stored.TakebackId, TakebackActions.Edit, stored.Status, stored.Status, null, userId);
        }

        public void ChangeStatus(TakebackStatusChange change, int userId)
        {
            Takeback stored = FindForUpdate(change.TakebackId, change.RowVersion);
            TakebackStatus from = stored.Status;

            stored.Status = change.NewStatus;
            if (change.ApprovedByUserId.HasValue)
            {
                stored.ApprovedByUserId = change.ApprovedByUserId;
            }

            if (change.ApprovedDate.HasValue)
            {
                stored.ApprovedDate = change.ApprovedDate;
            }

            if (change.NoticeDate.HasValue)
            {
                stored.NoticeDate = change.NoticeDate;
            }

            if (change.DueDate.HasValue)
            {
                stored.DueDate = change.DueDate;
            }

            Touch(stored, userId);
            AddHistory(stored.TakebackId, change.Action, from, change.NewStatus, change.Comment, userId);
        }

        public void AddRecovery(TakebackRecovery recovery, TakebackStatus newStatus, byte[] rowVersion, int userId)
        {
            Takeback stored = FindForUpdate(recovery.TakebackId, rowVersion);
            TakebackStatus from = stored.Status;

            TakebackRecovery row = Cloner.Clone(recovery);
            row.RecoveryId = _db.NextRecoveryId();
            row.CreatedByUserId = userId;
            row.CreatedDate = _db.Clock.UtcNow;
            _db.Recoveries.Add(row);

            stored.RecoveredAmount += recovery.Amount;
            stored.Status = newStatus;
            Touch(stored, userId);

            string comment = string.Format(
                "Recovered {0:N2} by {1}.", recovery.Amount, recovery.Method);
            AddHistory(stored.TakebackId, TakebackActions.RecordRecovery, from, newStatus, comment, userId);
        }

        private Takeback Find(int takebackId)
        {
            return _db.Takebacks.SingleOrDefault(t => t.TakebackId == takebackId);
        }

        private Takeback FindForUpdate(int takebackId, byte[] rowVersion)
        {
            Takeback stored = Find(takebackId);
            if (stored == null)
            {
                throw new NotFoundException("Takeback", takebackId);
            }

            if (rowVersion == null || !stored.RowVersion.SequenceEqual(rowVersion))
            {
                throw new ConcurrencyException();
            }

            return stored;
        }

        private void Touch(Takeback stored, int userId)
        {
            stored.ModifiedByUserId = userId;
            stored.ModifiedDate = _db.Clock.UtcNow;
            stored.RowVersion = _db.NextRowVersion();
        }

        private void AddHistory(int takebackId, string action, TakebackStatus? from, TakebackStatus to, string comment, int userId)
        {
            _db.History.Add(new TakebackHistoryEntry
            {
                HistoryId = _db.NextHistoryId(),
                TakebackId = takebackId,
                Action = action,
                FromStatus = from,
                ToStatus = to,
                Comment = comment,
                ChangedByUserId = userId,
                ChangedDate = _db.Clock.UtcNow
            });
        }

        private Takeback CloneWithDerived(Takeback stored)
        {
            Takeback copy = Cloner.Clone(stored);
            Member member = _db.FindMember(copy.MemberId);
            Provider provider = _db.FindProvider(copy.ProviderId);
            copy.MemberNumber = member == null ? null : member.MemberNumber;
            copy.MemberName = member == null ? null : member.FullName;
            copy.ProviderNumber = provider == null ? null : provider.ProviderNumber;
            copy.ProviderName = provider == null ? null : provider.Name;
            copy.ApprovedByName = _db.UserDisplayName(copy.ApprovedByUserId);
            copy.CreatedByName = _db.UserDisplayName(copy.CreatedByUserId);
            copy.ModifiedByName = _db.UserDisplayName(copy.ModifiedByUserId);
            copy.IsOverdue = _db.IsOverdue(copy);
            copy.Recoveries = new List<TakebackRecovery>();
            copy.History = new List<TakebackHistoryEntry>();
            return copy;
        }

        private static TakebackListItem ToListItem(Takeback takeback)
        {
            return new TakebackListItem
            {
                TakebackId = takeback.TakebackId,
                TakebackNumber = takeback.TakebackNumber,
                ClaimNumber = takeback.ClaimNumber,
                MemberId = takeback.MemberId,
                MemberNumber = takeback.MemberNumber,
                MemberName = takeback.MemberName,
                ProviderId = takeback.ProviderId,
                ProviderName = takeback.ProviderName,
                Reason = takeback.Reason,
                Status = takeback.Status,
                TakebackAmount = takeback.TakebackAmount,
                RecoveredAmount = takeback.RecoveredAmount,
                NoticeDate = takeback.NoticeDate,
                DueDate = takeback.DueDate,
                IsOverdue = takeback.IsOverdue,
                CreatedByName = takeback.CreatedByName,
                CreatedDate = takeback.CreatedDate
            };
        }

        private static bool Matches(Takeback takeback, string text)
        {
            return new[]
                {
                    takeback.TakebackNumber, takeback.ClaimNumber, takeback.MemberName, takeback.MemberNumber,
                    takeback.ProviderName, takeback.ProviderNumber
                }
                .Any(value => value != null && value.IndexOf(text, StringComparison.OrdinalIgnoreCase) >= 0);
        }

        private static IEnumerable<TakebackListItem> Sort(IEnumerable<TakebackListItem> items, string sortBy, bool descending)
        {
            switch (sortBy)
            {
                case "takebackNumber":
                    return Order(items, i => i.TakebackId, descending);
                case "claimNumber":
                    return Order(items, i => i.ClaimNumber, descending);
                case "memberName":
                    return Order(items, i => i.MemberName ?? string.Empty, descending);
                case "providerName":
                    return Order(items, i => i.ProviderName ?? string.Empty, descending);
                case "reason":
                    return Order(items, i => (int)i.Reason, descending);
                case "status":
                    return Order(items, i => (int)i.Status, descending);
                case "takebackAmount":
                    return Order(items, i => i.TakebackAmount, descending);
                case "recoveredAmount":
                    return Order(items, i => i.RecoveredAmount, descending);
                case "outstandingAmount":
                    return Order(items, i => i.OutstandingAmount, descending);
                case "dueDate":
                    // Takebacks without a due date are always last, whatever the direction.
                    return descending
                        ? items.OrderBy(i => i.DueDate.HasValue ? 0 : 1).ThenByDescending(i => i.DueDate).ThenByDescending(i => i.TakebackId)
                        : items.OrderBy(i => i.DueDate.HasValue ? 0 : 1).ThenBy(i => i.DueDate).ThenBy(i => i.TakebackId);
                case "createdDate":
                    return Order(items, i => i.CreatedDate, descending);
                default:
                    // No sort key: newest first.
                    return items.OrderByDescending(i => i.CreatedDate).ThenByDescending(i => i.TakebackId);
            }
        }

        private static IEnumerable<TakebackListItem> Order<TKey>(
            IEnumerable<TakebackListItem> items,
            Func<TakebackListItem, TKey> key,
            bool descending)
        {
            return descending
                ? items.OrderByDescending(key).ThenByDescending(i => i.TakebackId)
                : items.OrderBy(key).ThenBy(i => i.TakebackId);
        }
    }
}
