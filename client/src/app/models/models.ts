/*
 * Hand-written mirror of the classes in src/CobLink.Models (JSON is the camelCase form of the C# members).
 * Computed C# properties (fullName, outstandingAmount, totalOutstandingAmount, totalPages) are serialised too.
 */
import {
  ActivityPriority,
  ActivityStatus,
  ActivityType,
  RecoveryMethod,
  TakebackReason,
  TakebackStatus,
  UserRole
} from './enums';

/** Calendar date: arrives as `2025-03-14T00:00:00` (no zone) and is sent as `yyyy-MM-dd`. */
export type CalendarDateString = string;

/** UTC timestamp: arrives as `2025-03-14T16:22:05.1234567Z`. */
export type TimestampString = string;

/** `byte[]` rowversion serialised as base64; echo it back unchanged on every write. */
export type RowVersionString = string;

// ---------------------------------------------------------------------------------------------------------------
// Users, session, reference data
// ---------------------------------------------------------------------------------------------------------------

export interface AppUser {
  userId: number;
  userName: string;
  displayName: string;
  email: string | null;
  role: UserRole;
  isActive: boolean;
}

export interface SessionInfo {
  user: AppUser;
  /** "Windows" (production) or "Development" (header based persona switching). */
  authenticationMode: string;
  environmentName: string;
  version: string;
}

export interface Member {
  memberId: number;
  memberNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: CalendarDateString | null;
  fullName: string;
}

export interface Provider {
  providerId: number;
  providerNumber: string;
  name: string;
  npi: string | null;
  city: string | null;
  state: string | null;
}

export interface LookupItem {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
}

export interface LookupData {
  userRoles: LookupItem[];
  activityTypes: LookupItem[];
  activityStatuses: LookupItem[];
  activityPriorities: LookupItem[];
  takebackReasons: LookupItem[];
  takebackStatuses: LookupItem[];
  recoveryMethods: LookupItem[];
}

/** Names of the lists inside LookupData. */
export type LookupListName = keyof LookupData;

// ---------------------------------------------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------------------------------------------

export interface PagedRequest {
  pageNumber: number;
  pageSize: number;
  sortBy?: string | null;
  sortDescending: boolean;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------------------------------------------

export interface ActivityNote {
  noteId: number;
  activityId: number;
  noteText: string;
  /** True for notes written automatically when the activity changes state. */
  isSystem: boolean;
  createdByUserId: number;
  createdByName: string;
  createdDate: TimestampString;
}

export interface Activity {
  activityId: number;
  activityNumber: string;
  memberId: number | null;
  memberNumber: string | null;
  memberName: string | null;
  takebackId: number | null;
  takebackNumber: string | null;
  activityType: ActivityType;
  status: ActivityStatus;
  priority: ActivityPriority;
  subject: string;
  description: string | null;
  assignedToUserId: number | null;
  assignedToName: string | null;
  dueDate: CalendarDateString | null;
  completedDate: TimestampString | null;
  outcome: string | null;
  isOverdue: boolean;
  createdByUserId: number;
  createdByName: string;
  createdDate: TimestampString;
  modifiedByUserId: number | null;
  modifiedByName: string | null;
  modifiedDate: TimestampString | null;
  rowVersion: RowVersionString;
  notes: ActivityNote[];
  availableActions: string[];
}

export interface ActivityListItem {
  activityId: number;
  activityNumber: string;
  subject: string;
  activityType: ActivityType;
  status: ActivityStatus;
  priority: ActivityPriority;
  memberId: number | null;
  memberNumber: string | null;
  memberName: string | null;
  takebackId: number | null;
  takebackNumber: string | null;
  assignedToUserId: number | null;
  assignedToName: string | null;
  dueDate: CalendarDateString | null;
  completedDate: TimestampString | null;
  isOverdue: boolean;
  createdDate: TimestampString;
}

export interface ActivitySearchRequest extends PagedRequest {
  searchText?: string | null;
  status?: ActivityStatus | null;
  /** When true only Open and InProgress activities are returned. */
  openOnly: boolean;
  activityType?: ActivityType | null;
  priority?: ActivityPriority | null;
  assignedToUserId?: number | null;
  memberId?: number | null;
  takebackId?: number | null;
  dueFrom?: CalendarDateString | null;
  dueTo?: CalendarDateString | null;
  overdueOnly: boolean;
}

/** Create (activityId = 0) or update. Status may only be Open or InProgress. */
export interface SaveActivityRequest {
  activityId: number;
  memberId: number | null;
  takebackId: number | null;
  activityType: ActivityType;
  priority: ActivityPriority;
  status: ActivityStatus;
  subject: string;
  description: string | null;
  assignedToUserId: number | null;
  dueDate: CalendarDateString | null;
  rowVersion: RowVersionString | null;
}

/** Complete (comment = outcome, required), Cancel (comment = reason, required), Reopen (comment optional). */
export interface ActivityActionRequest {
  activityId: number;
  comment: string | null;
  rowVersion: RowVersionString;
}

export interface AddActivityNoteRequest {
  activityId: number;
  noteText: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Takebacks
// ---------------------------------------------------------------------------------------------------------------

export interface TakebackRecovery {
  recoveryId: number;
  takebackId: number;
  amount: number;
  recoveryDate: CalendarDateString;
  method: RecoveryMethod;
  referenceNumber: string | null;
  notes: string | null;
  createdByUserId: number;
  createdByName: string;
  createdDate: TimestampString;
}

export interface TakebackHistoryEntry {
  historyId: number;
  takebackId: number;
  /** One of TakebackAction. */
  action: string;
  fromStatus: TakebackStatus | null;
  toStatus: TakebackStatus;
  comment: string | null;
  changedByUserId: number;
  changedByName: string;
  changedDate: TimestampString;
}

export interface Takeback {
  takebackId: number;
  takebackNumber: string;
  claimNumber: string;
  memberId: number;
  memberNumber: string | null;
  memberName: string | null;
  providerId: number;
  providerNumber: string | null;
  providerName: string | null;
  reason: TakebackReason;
  status: TakebackStatus;
  dateOfService: CalendarDateString;
  originalPaidAmount: number;
  takebackAmount: number;
  recoveredAmount: number;
  outstandingAmount: number;
  otherCarrierName: string | null;
  otherPolicyNumber: string | null;
  noticeDate: CalendarDateString | null;
  dueDate: CalendarDateString | null;
  isOverdue: boolean;
  notes: string | null;
  approvedByUserId: number | null;
  approvedByName: string | null;
  approvedDate: TimestampString | null;
  createdByUserId: number;
  createdByName: string;
  createdDate: TimestampString;
  modifiedByUserId: number | null;
  modifiedByName: string | null;
  modifiedDate: TimestampString | null;
  rowVersion: RowVersionString;
  recoveries: TakebackRecovery[];
  history: TakebackHistoryEntry[];
  linkedActivities: ActivityListItem[];
  availableActions: string[];
}

export interface TakebackListItem {
  takebackId: number;
  takebackNumber: string;
  claimNumber: string;
  memberId: number;
  memberNumber: string | null;
  memberName: string | null;
  providerId: number;
  providerName: string | null;
  reason: TakebackReason;
  status: TakebackStatus;
  takebackAmount: number;
  recoveredAmount: number;
  outstandingAmount: number;
  noticeDate: CalendarDateString | null;
  dueDate: CalendarDateString | null;
  isOverdue: boolean;
  createdByName: string | null;
  createdDate: TimestampString;
}

export interface TakebackSearchRequest extends PagedRequest {
  searchText?: string | null;
  status?: TakebackStatus | null;
  reason?: TakebackReason | null;
  memberId?: number | null;
  providerId?: number | null;
  createdByUserId?: number | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  dueFrom?: CalendarDateString | null;
  dueTo?: CalendarDateString | null;
  overdueOnly: boolean;
}

/** Create (takebackId = 0) or update a takeback that is still editable (Draft or Rejected). */
export interface SaveTakebackRequest {
  takebackId: number;
  claimNumber: string;
  memberId: number;
  providerId: number;
  reason: TakebackReason;
  dateOfService: CalendarDateString;
  originalPaidAmount: number;
  takebackAmount: number;
  otherCarrierName: string | null;
  otherPolicyNumber: string | null;
  notes: string | null;
  rowVersion: RowVersionString | null;
}

/** Submit, Approve, Reject, SendNotice, Dispute, WriteOff and Cancel. Comment is mandatory for the last four and Reject. */
export interface TakebackActionRequest {
  takebackId: number;
  comment: string | null;
  rowVersion: RowVersionString;
}

export interface ResolveDisputeRequest extends TakebackActionRequest {
  /** True = the takeback stands and recovery resumes; false = the dispute is accepted and the takeback is cancelled. */
  upheld: boolean;
}

export interface RecordRecoveryRequest {
  takebackId: number;
  amount: number;
  recoveryDate: CalendarDateString;
  method: RecoveryMethod;
  referenceNumber: string | null;
  notes: string | null;
  rowVersion: RowVersionString;
}

// ---------------------------------------------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------------------------------------------

export interface StatusCount {
  statusId: number;
  count: number;
  /** Sum of takeback amounts (always 0 for activity counts). */
  amount: number;
}

export interface DashboardSummary {
  myOpenActivities: number;
  myOverdueActivities: number;
  openActivities: number;
  overdueActivities: number;
  activitiesDueThisWeek: number;
  activitiesByStatus: StatusCount[];
  myUpcomingActivities: ActivityListItem[];
  takebacksPendingApproval: number;
  activeTakebacks: number;
  overdueTakebacks: number;
  totalTakebackAmount: number;
  totalRecoveredAmount: number;
  totalOutstandingAmount: number;
  takebacksByStatus: StatusCount[];
  recentTakebacks: TakebackListItem[];
}
