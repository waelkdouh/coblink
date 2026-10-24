/*
 * Hand-written mirror of src/CobLink.Models/Enums.cs (and the Lkp* lookup tables).
 * The numeric values travel over the wire as numbers - change C#, SQL and this file together.
 */

export enum UserRole {
  Analyst = 1,
  Supervisor = 2,
  Admin = 3
}

export enum ActivityType {
  PhoneCall = 1,
  Email = 2,
  Letter = 3,
  OtherCarrierVerification = 4,
  MemberOutreach = 5,
  ProviderOutreach = 6,
  DocumentReview = 7,
  ClaimReview = 8,
  Research = 9,
  Other = 10
}

export enum ActivityStatus {
  Open = 1,
  InProgress = 2,
  Completed = 3,
  Cancelled = 4
}

export enum ActivityPriority {
  Low = 1,
  Normal = 2,
  High = 3,
  Urgent = 4
}

export enum TakebackReason {
  OtherInsurancePrimary = 1,
  MedicarePrimary = 2,
  DuplicatePayment = 3,
  EligibilityTerminated = 4,
  ThirdPartyLiability = 5,
  WorkersCompensation = 6,
  ProviderBillingError = 7,
  Other = 8
}

export enum TakebackStatus {
  Draft = 1,
  PendingApproval = 2,
  Approved = 3,
  Rejected = 4,
  NoticeSent = 5,
  PartiallyRecovered = 6,
  Recovered = 7,
  Disputed = 8,
  WrittenOff = 9,
  Cancelled = 10
}

export enum RecoveryMethod {
  Check = 1,
  Eft = 2,
  Offset = 3
}

/** Mirrors the ActivityActions constants: the values found in Activity.availableActions. */
export enum ActivityAction {
  Edit = 'Edit',
  Complete = 'Complete',
  Reopen = 'Reopen',
  Cancel = 'Cancel',
  AddNote = 'AddNote'
}

/** Mirrors the TakebackActions constants: Takeback.availableActions and the history Action column. */
export enum TakebackAction {
  Create = 'Create',
  Edit = 'Edit',
  Submit = 'Submit',
  Approve = 'Approve',
  Reject = 'Reject',
  SendNotice = 'SendNotice',
  RecordRecovery = 'RecordRecovery',
  Dispute = 'Dispute',
  ResolveDispute = 'ResolveDispute',
  WriteOff = 'WriteOff',
  Cancel = 'Cancel'
}

/** Whitelisted `sortBy` keys (docs/api-reference.md section 6). */
export const SortKeys = {
  activity: {
    dueDate: 'dueDate',
    activityNumber: 'activityNumber',
    subject: 'subject',
    activityType: 'activityType',
    status: 'status',
    priority: 'priority',
    memberName: 'memberName',
    assignedToName: 'assignedToName',
    createdDate: 'createdDate'
  },
  takeback: {
    createdDate: 'createdDate',
    takebackNumber: 'takebackNumber',
    claimNumber: 'claimNumber',
    memberName: 'memberName',
    providerName: 'providerName',
    reason: 'reason',
    status: 'status',
    takebackAmount: 'takebackAmount',
    recoveredAmount: 'recoveredAmount',
    outstandingAmount: 'outstandingAmount',
    dueDate: 'dueDate'
  }
} as const;

export type ActivitySortKey = (typeof SortKeys.activity)[keyof typeof SortKeys.activity];
export type TakebackSortKey = (typeof SortKeys.takeback)[keyof typeof SortKeys.takeback];

/** Default order of each search when `sortBy` is omitted. */
export const DefaultSort = {
  activity: { sortBy: SortKeys.activity.dueDate, sortDescending: false },
  takeback: { sortBy: SortKeys.takeback.createdDate, sortDescending: true }
} as const;

/** Statuses an activity can be saved with (everything else is reached through actions). */
export const EDITABLE_ACTIVITY_STATUSES: readonly ActivityStatus[] = [ActivityStatus.Open, ActivityStatus.InProgress];

/** Statuses that make an activity read-only until it is reopened. */
export const CLOSED_ACTIVITY_STATUSES: readonly ActivityStatus[] = [ActivityStatus.Completed, ActivityStatus.Cancelled];
