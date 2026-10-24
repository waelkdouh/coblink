using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;
using CobLink.Business.Text;
using CobLink.Business.Validation;
using CobLink.Business.Workflow;
using CobLink.Data.Repositories;
using CobLink.Models;
using Microsoft.Extensions.Options;

namespace CobLink.Business.Services
{
    public class TakebackService : ITakebackService
    {
        public const int MaxClaimNumberLength = 30;
        public const int MaxCarrierNameLength = 150;
        public const int MaxPolicyNumberLength = 50;
        public const int MaxNotesLength = 2000;
        public const int MaxCommentLength = 1000;
        public const int MaxReferenceLength = 50;
        public const int MaxRecoveryNotesLength = 500;

        /// <summary>Largest amount accepted; far below what decimal(12,2) can store so a typo is caught, not a SQL overflow.</summary>
        public const decimal MaxAmount = 9999999.99m;

        private static readonly Regex ClaimNumberPattern = new Regex("^[A-Za-z0-9-]+$", RegexOptions.Compiled);

        private readonly ITakebackRepository _takebacks;
        private readonly IActivityRepository _activities;
        private readonly ILookupRepository _lookups;
        private readonly ICurrentUser _currentUser;
        private readonly IClock _clock;
        private readonly TakebackOptions _options;
        private readonly TakebackWorkflow _workflow;

        public TakebackService(
            ITakebackRepository takebacks,
            IActivityRepository activities,
            ILookupRepository lookups,
            ICurrentUser currentUser,
            IClock clock,
            IOptions<TakebackOptions> options)
        {
            _takebacks = takebacks;
            _activities = activities;
            _lookups = lookups;
            _currentUser = currentUser;
            _clock = clock;
            _options = options.Value;
            _workflow = new TakebackWorkflow(_options);
        }

        public PagedResult<TakebackListItem> Search(TakebackSearchRequest request)
        {
            _currentUser.Require();
            request = request ?? new TakebackSearchRequest();

            var errors = new ValidationCollector();
            SearchRules.ValidatePaging(request, SearchRules.TakebackSortKeys, errors);
            if (request.Status.HasValue && !Enum.IsDefined(typeof(TakebackStatus), request.Status.Value))
            {
                errors.Add("status", "Unknown takeback status.");
            }

            if (request.Reason.HasValue && !Enum.IsDefined(typeof(TakebackReason), request.Reason.Value))
            {
                errors.Add("reason", "Unknown takeback reason.");
            }

            if (request.MinAmount.HasValue && request.MaxAmount.HasValue && request.MinAmount.Value > request.MaxAmount.Value)
            {
                errors.Add("maxAmount", "Maximum amount cannot be less than the minimum amount.");
            }

            if (request.DueFrom.HasValue && request.DueTo.HasValue &&
                request.DueFrom.Value.Date > request.DueTo.Value.Date)
            {
                errors.Add("dueTo", "Due to cannot be before due from.");
            }

            errors.ThrowIfAny();

            request.SearchText = ValidationCollector.Clean(request.SearchText);
            return _takebacks.Search(request);
        }

        public Takeback GetById(int takebackId)
        {
            _currentUser.Require();
            return Load(takebackId);
        }

        public Takeback Save(SaveTakebackRequest request)
        {
            RequireRequest(request);
            AppUser user = _currentUser.Require();
            bool isNew = request.TakebackId == 0;

            Takeback takeback;
            if (isNew)
            {
                takeback = new Takeback();
            }
            else
            {
                takeback = Find(request.TakebackId);
                _workflow.Require(TakebackActions.Edit, takeback, user);
            }

            Apply(takeback, request);

            var errors = new ValidationCollector();
            ValidateFields(errors, takeback);
            if (!isNew && request.RowVersion == null)
            {
                errors.Add("rowVersion", "The record version is required to update a takeback.");
            }

            if (takeback.MemberId <= 0)
            {
                errors.Add("memberId", "Select a member.");
            }
            else if (_lookups.GetMember(takeback.MemberId) == null)
            {
                errors.Add("memberId", "The selected member does not exist.");
            }

            if (takeback.ProviderId <= 0)
            {
                errors.Add("providerId", "Select a provider.");
            }
            else if (_lookups.GetProvider(takeback.ProviderId) == null)
            {
                errors.Add("providerId", "The selected provider does not exist.");
            }

            if (!errors.HasErrors && takeback.ClaimNumber != null &&
                _takebacks.ActiveTakebackExists(takeback.ClaimNumber, takeback.ProviderId, takeback.TakebackId))
            {
                errors.Add("claimNumber", "An active takeback already exists for this claim and provider.");
            }

            errors.ThrowIfAny();

            if (isNew)
            {
                return Load(_takebacks.Insert(takeback, user.UserId));
            }

            takeback.RowVersion = request.RowVersion;
            _takebacks.Update(takeback, user.UserId);
            return Load(takeback.TakebackId);
        }

        public Takeback Submit(TakebackActionRequest request)
        {
            return Transition(
                request,
                TakebackActions.Submit,
                TakebackStatus.PendingApproval,
                false,
                (takeback, change) =>
                {
                    var errors = new ValidationCollector();
                    ValidateFields(errors, takeback);
                    errors.ThrowIfAny();
                });
        }

        public Takeback Approve(TakebackActionRequest request)
        {
            return Transition(
                request,
                TakebackActions.Approve,
                TakebackStatus.Approved,
                false,
                (takeback, change) =>
                {
                    change.ApprovedByUserId = _currentUser.Require().UserId;
                    change.ApprovedDate = _clock.UtcNow;
                });
        }

        public Takeback Reject(TakebackActionRequest request)
        {
            return Transition(request, TakebackActions.Reject, TakebackStatus.Rejected, true, null);
        }

        public Takeback SendNotice(TakebackActionRequest request)
        {
            return Transition(
                request,
                TakebackActions.SendNotice,
                TakebackStatus.NoticeSent,
                false,
                (takeback, change) =>
                {
                    change.NoticeDate = _clock.Today;
                    change.DueDate = _clock.Today.AddDays(_options.ResponseWindowDays);
                });
        }

        public Takeback Dispute(TakebackActionRequest request)
        {
            return Transition(request, TakebackActions.Dispute, TakebackStatus.Disputed, true, null);
        }

        public Takeback ResolveDispute(ResolveDisputeRequest request)
        {
            return Transition(
                request,
                TakebackActions.ResolveDispute,
                TakebackStatus.Cancelled,
                true,
                (takeback, change) =>
                {
                    if (request.Upheld)
                    {
                        change.NewStatus = takeback.RecoveredAmount > 0
                            ? TakebackStatus.PartiallyRecovered
                            : TakebackStatus.NoticeSent;
                        change.DueDate = _clock.Today.AddDays(_options.ResponseWindowDays);
                        change.Comment = "Dispute upheld. " + change.Comment;
                    }
                    else if (takeback.RecoveredAmount > 0)
                    {
                        throw new BusinessRuleException(
                            "Recoveries have already been recorded for this takeback, so the dispute cannot cancel it. " +
                            "Write the takeback off instead.");
                    }
                    else
                    {
                        change.Comment = "Dispute overturned. " + change.Comment;
                    }
                });
        }

        public Takeback WriteOff(TakebackActionRequest request)
        {
            return Transition(request, TakebackActions.WriteOff, TakebackStatus.WrittenOff, true, null);
        }

        public Takeback Cancel(TakebackActionRequest request)
        {
            return Transition(request, TakebackActions.Cancel, TakebackStatus.Cancelled, true, null);
        }

        public Takeback RecordRecovery(RecordRecoveryRequest request)
        {
            RequireRequest(request);
            AppUser user = _currentUser.Require();

            var errors = new ValidationCollector();
            if (request.TakebackId <= 0)
            {
                errors.Add("takebackId", "Takeback id is required.");
            }

            if (request.RowVersion == null)
            {
                errors.Add("rowVersion", "The record version is required to update a takeback.");
            }

            if (!Enum.IsDefined(typeof(RecoveryMethod), request.Method))
            {
                errors.Add("method", "Select a valid recovery method.");
            }

            string reference = errors.Optional("referenceNumber", "Reference number", request.ReferenceNumber, MaxReferenceLength);
            string notes = errors.Optional("notes", "Notes", request.Notes, MaxRecoveryNotesLength);

            ValidateAmount(errors, "amount", "Amount", request.Amount);

            DateTime recoveryDate = request.RecoveryDate.Date;
            if (request.RecoveryDate == default(DateTime))
            {
                errors.Add("recoveryDate", "Recovery date is required.");
            }
            else if (recoveryDate > _clock.Today)
            {
                errors.Add("recoveryDate", "Recovery date cannot be in the future.");
            }

            bool needsReference = request.Method == RecoveryMethod.Check || request.Method == RecoveryMethod.Eft;
            if (needsReference && reference == null)
            {
                errors.Add("referenceNumber", "Reference number is required for " + EnumText.Humanize(request.Method) + " recoveries.");
            }

            errors.ThrowIfAny();

            Takeback takeback = Find(request.TakebackId);
            _workflow.Require(TakebackActions.RecordRecovery, takeback, user);

            decimal outstanding = takeback.OutstandingAmount;
            if (request.Amount > outstanding)
            {
                errors.Add("amount", "Amount cannot be more than the outstanding balance of " + FormatMoney(outstanding) + ".");
            }

            if (takeback.NoticeDate.HasValue && recoveryDate < takeback.NoticeDate.Value.Date)
            {
                errors.Add("recoveryDate", "Recovery date cannot be before the notice date.");
            }

            errors.ThrowIfAny();

            var recovery = new TakebackRecovery
            {
                TakebackId = takeback.TakebackId,
                Amount = request.Amount,
                RecoveryDate = recoveryDate,
                Method = request.Method,
                ReferenceNumber = reference,
                Notes = notes
            };

            TakebackStatus newStatus = request.Amount == outstanding
                ? TakebackStatus.Recovered
                : TakebackStatus.PartiallyRecovered;

            _takebacks.AddRecovery(recovery, newStatus, request.RowVersion, user.UserId);
            return Load(takeback.TakebackId);
        }

        /// <summary>
        /// Shared path of every status change: validate the request, load, check the workflow, let the caller add
        /// action specific rules and values, then persist.
        /// </summary>
        private Takeback Transition(
            TakebackActionRequest request,
            string action,
            TakebackStatus newStatus,
            bool commentRequired,
            Action<Takeback, TakebackStatusChange> customize)
        {
            RequireRequest(request);
            AppUser user = _currentUser.Require();

            var errors = new ValidationCollector();
            if (request.TakebackId <= 0)
            {
                errors.Add("takebackId", "Takeback id is required.");
            }

            if (request.RowVersion == null)
            {
                errors.Add("rowVersion", "The record version is required to update a takeback.");
            }

            string comment = commentRequired
                ? errors.Required("comment", "Comment", request.Comment, MaxCommentLength)
                : errors.Optional("comment", "Comment", request.Comment, MaxCommentLength);
            errors.ThrowIfAny();

            Takeback takeback = Find(request.TakebackId);
            _workflow.Require(action, takeback, user);

            var change = new TakebackStatusChange
            {
                TakebackId = takeback.TakebackId,
                NewStatus = newStatus,
                Action = action,
                Comment = comment,
                RowVersion = request.RowVersion
            };

            if (customize != null)
            {
                customize(takeback, change);
            }

            _takebacks.ChangeStatus(change, user.UserId);
            return Load(takeback.TakebackId);
        }

        private static void Apply(Takeback takeback, SaveTakebackRequest request)
        {
            takeback.ClaimNumber = ValidationCollector.Clean(request.ClaimNumber);
            takeback.MemberId = request.MemberId;
            takeback.ProviderId = request.ProviderId;
            takeback.Reason = request.Reason;
            takeback.DateOfService = request.DateOfService.Date;
            takeback.OriginalPaidAmount = request.OriginalPaidAmount;
            takeback.TakebackAmount = request.TakebackAmount;
            takeback.OtherCarrierName = ValidationCollector.Clean(request.OtherCarrierName);
            takeback.OtherPolicyNumber = ValidationCollector.Clean(request.OtherPolicyNumber);
            takeback.Notes = ValidationCollector.Clean(request.Notes);
        }

        /// <summary>Field rules of docs/api-reference.md section 4; used on Save and again on Submit.</summary>
        private void ValidateFields(ValidationCollector errors, Takeback takeback)
        {
            if (takeback.ClaimNumber == null)
            {
                errors.Add("claimNumber", "Claim number is required.");
            }
            else if (takeback.ClaimNumber.Length > MaxClaimNumberLength)
            {
                errors.Add("claimNumber", "Claim number cannot be longer than " + MaxClaimNumberLength + " characters.");
            }
            else if (!ClaimNumberPattern.IsMatch(takeback.ClaimNumber))
            {
                errors.Add("claimNumber", "Claim number can only contain letters, digits and hyphens.");
            }

            if (!Enum.IsDefined(typeof(TakebackReason), takeback.Reason))
            {
                errors.Add("reason", "Select a valid reason.");
            }

            if (takeback.DateOfService == default(DateTime))
            {
                errors.Add("dateOfService", "Date of service is required.");
            }
            else if (takeback.DateOfService > _clock.Today)
            {
                errors.Add("dateOfService", "Date of service cannot be in the future.");
            }

            ValidateAmount(errors, "originalPaidAmount", "Original paid amount", takeback.OriginalPaidAmount);
            ValidateAmount(errors, "takebackAmount", "Takeback amount", takeback.TakebackAmount);
            if (takeback.OriginalPaidAmount > 0 && takeback.TakebackAmount > takeback.OriginalPaidAmount)
            {
                errors.Add("takebackAmount", "Takeback amount cannot be more than the original paid amount.");
            }

            if (takeback.Reason == TakebackReason.OtherInsurancePrimary && takeback.OtherCarrierName == null)
            {
                errors.Add("otherCarrierName", "Other carrier name is required when another insurance is primary.");
            }

            CheckLength(errors, "otherCarrierName", "Other carrier name", takeback.OtherCarrierName, MaxCarrierNameLength);
            CheckLength(errors, "otherPolicyNumber", "Other policy number", takeback.OtherPolicyNumber, MaxPolicyNumberLength);
            CheckLength(errors, "notes", "Notes", takeback.Notes, MaxNotesLength);
        }

        private static void ValidateAmount(ValidationCollector errors, string field, string label, decimal amount)
        {
            if (amount <= 0)
            {
                errors.Add(field, label + " must be greater than zero.");
            }
            else if (HasMoreThanTwoDecimals(amount))
            {
                errors.Add(field, label + " can have at most 2 decimals.");
            }
            else if (amount > MaxAmount)
            {
                errors.Add(field, label + " cannot be more than " + FormatMoney(MaxAmount) + ".");
            }
        }

        private static void CheckLength(ValidationCollector errors, string field, string label, string value, int maxLength)
        {
            if (value != null && value.Length > maxLength)
            {
                errors.Add(field, label + " cannot be longer than " + maxLength + " characters.");
            }
        }

        private static bool HasMoreThanTwoDecimals(decimal amount)
        {
            return decimal.Round(amount, 2) != amount;
        }

        private static string FormatMoney(decimal amount)
        {
            return amount.ToString("N2", CultureInfo.InvariantCulture);
        }

        private static void RequireRequest(object request)
        {
            if (request == null)
            {
                throw new ValidationFailedException(null, "A request body is required.");
            }
        }

        private Takeback Find(int takebackId)
        {
            Takeback takeback = _takebacks.GetById(takebackId);
            if (takeback == null)
            {
                throw new NotFoundException("Takeback", takebackId);
            }

            return takeback;
        }

        private Takeback Load(int takebackId)
        {
            Takeback takeback = Find(takebackId);
            takeback.LinkedActivities = GetLinkedActivities(takebackId);
            takeback.AvailableActions = _workflow.GetAvailableActions(takeback, _currentUser.Require());
            return takeback;
        }

        private List<ActivityListItem> GetLinkedActivities(int takebackId)
        {
            PagedResult<ActivityListItem> page = _activities.Search(new ActivitySearchRequest
            {
                TakebackId = takebackId,
                PageNumber = 1,
                PageSize = PagedRequest.MaxPageSize,
                SortBy = "dueDate"
            });

            return page.Items;
        }
    }
}
