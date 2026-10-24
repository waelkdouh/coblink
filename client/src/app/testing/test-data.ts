import {
  ActivityPriority,
  ActivityStatus,
  ActivityType,
  RecoveryMethod,
  TakebackAction,
  TakebackReason,
  TakebackStatus,
  UserRole
} from '../models/enums';
import {
  Activity,
  ActivityListItem,
  ActivityNote,
  AppUser,
  DashboardSummary,
  LookupData,
  LookupItem,
  Member,
  PagedResult,
  Provider,
  SessionInfo,
  Takeback,
  TakebackHistoryEntry,
  TakebackListItem,
  TakebackRecovery
} from '../models/models';

function items(names: Record<number, string>): LookupItem[] {
  return Object.keys(names).map((key, index) => ({
    id: Number(key),
    code: names[Number(key)].replace(/\W+/g, '').toUpperCase(),
    name: names[Number(key)],
    sortOrder: index + 1
  }));
}

/** The reference data as the database serves it: display names with spaces, ids equal to the enum values. */
export const TEST_LOOKUPS: LookupData = {
  userRoles: items({ [UserRole.Analyst]: 'Analyst', [UserRole.Supervisor]: 'Supervisor', [UserRole.Admin]: 'Administrator' }),
  activityTypes: items({
    [ActivityType.PhoneCall]: 'Phone Call',
    [ActivityType.Email]: 'Email',
    [ActivityType.Letter]: 'Letter',
    [ActivityType.OtherCarrierVerification]: 'Other Carrier Verification',
    [ActivityType.MemberOutreach]: 'Member Outreach',
    [ActivityType.ProviderOutreach]: 'Provider Outreach',
    [ActivityType.DocumentReview]: 'Document Review',
    [ActivityType.ClaimReview]: 'Claim Review',
    [ActivityType.Research]: 'Research',
    [ActivityType.Other]: 'Other'
  }),
  activityStatuses: items({
    [ActivityStatus.Open]: 'Open',
    [ActivityStatus.InProgress]: 'In Progress',
    [ActivityStatus.Completed]: 'Completed',
    [ActivityStatus.Cancelled]: 'Cancelled'
  }),
  activityPriorities: items({
    [ActivityPriority.Low]: 'Low',
    [ActivityPriority.Normal]: 'Normal',
    [ActivityPriority.High]: 'High',
    [ActivityPriority.Urgent]: 'Urgent'
  }),
  takebackReasons: items({
    [TakebackReason.OtherInsurancePrimary]: 'Other Insurance Primary',
    [TakebackReason.MedicarePrimary]: 'Medicare Primary',
    [TakebackReason.DuplicatePayment]: 'Duplicate Payment',
    [TakebackReason.EligibilityTerminated]: 'Eligibility Terminated',
    [TakebackReason.ThirdPartyLiability]: 'Third Party Liability',
    [TakebackReason.WorkersCompensation]: 'Workers Compensation',
    [TakebackReason.ProviderBillingError]: 'Provider Billing Error',
    [TakebackReason.Other]: 'Other'
  }),
  takebackStatuses: items({
    [TakebackStatus.Draft]: 'Draft',
    [TakebackStatus.PendingApproval]: 'Pending Approval',
    [TakebackStatus.Approved]: 'Approved',
    [TakebackStatus.Rejected]: 'Rejected',
    [TakebackStatus.NoticeSent]: 'Notice Sent',
    [TakebackStatus.PartiallyRecovered]: 'Partially Recovered',
    [TakebackStatus.Recovered]: 'Recovered',
    [TakebackStatus.Disputed]: 'Disputed',
    [TakebackStatus.WrittenOff]: 'Written Off',
    [TakebackStatus.Cancelled]: 'Cancelled'
  }),
  recoveryMethods: items({
    [RecoveryMethod.Check]: 'Check',
    [RecoveryMethod.Eft]: 'EFT',
    [RecoveryMethod.Offset]: 'Offset'
  })
};

export const TEST_ROW_VERSION = 'AAAAAAAAB9E=';
export const TEST_TIMESTAMP = '2025-03-14T16:22:05.1234567Z';

export function buildUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    userId: 1,
    userName: 'COBLINK\\ana.analyst',
    displayName: 'Ana Analyst',
    email: 'ana@example.com',
    role: UserRole.Analyst,
    isActive: true,
    ...overrides
  };
}

export const TEST_USERS: AppUser[] = [
  buildUser(),
  buildUser({ userId: 2, userName: 'COBLINK\\sam.supervisor', displayName: 'Sam Supervisor', role: UserRole.Supervisor }),
  buildUser({ userId: 3, userName: 'COBLINK\\ada.admin', displayName: 'Ada Admin', role: UserRole.Admin })
];

export function buildSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    user: buildUser(),
    authenticationMode: 'Development',
    environmentName: 'Development',
    version: '1.2.3',
    ...overrides
  };
}

export function buildMember(overrides: Partial<Member> = {}): Member {
  return {
    memberId: 11,
    memberNumber: 'M-0011',
    firstName: 'Maria',
    lastName: 'Lopez',
    dateOfBirth: '1980-02-29T00:00:00',
    fullName: 'Maria Lopez',
    ...overrides
  };
}

export function buildProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    providerId: 21,
    providerNumber: 'P-0021',
    name: 'Riverside Clinic',
    npi: '1234567890',
    city: 'Austin',
    state: 'TX',
    ...overrides
  };
}

export function buildNote(overrides: Partial<ActivityNote> = {}): ActivityNote {
  return {
    noteId: 1,
    activityId: 5,
    noteText: 'Called the member.',
    isSystem: false,
    createdByUserId: 1,
    createdByName: 'Ana Analyst',
    createdDate: TEST_TIMESTAMP,
    ...overrides
  };
}

export function buildActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    activityId: 5,
    activityNumber: 'ACT-000005',
    memberId: 11,
    memberNumber: 'M-0011',
    memberName: 'Maria Lopez',
    takebackId: null,
    takebackNumber: null,
    activityType: ActivityType.PhoneCall,
    status: ActivityStatus.Open,
    priority: ActivityPriority.Normal,
    subject: 'Verify other coverage',
    description: 'Ask about the second policy.',
    assignedToUserId: 1,
    assignedToName: 'Ana Analyst',
    dueDate: '2025-03-14T00:00:00',
    completedDate: null,
    outcome: null,
    isOverdue: false,
    createdByUserId: 1,
    createdByName: 'Ana Analyst',
    createdDate: TEST_TIMESTAMP,
    modifiedByUserId: null,
    modifiedByName: null,
    modifiedDate: null,
    rowVersion: TEST_ROW_VERSION,
    notes: [],
    availableActions: ['Edit', 'Complete', 'Cancel', 'AddNote'],
    ...overrides
  };
}

export function buildActivityListItem(overrides: Partial<ActivityListItem> = {}): ActivityListItem {
  return {
    activityId: 5,
    activityNumber: 'ACT-000005',
    subject: 'Verify other coverage',
    activityType: ActivityType.PhoneCall,
    status: ActivityStatus.Open,
    priority: ActivityPriority.Normal,
    memberId: 11,
    memberNumber: 'M-0011',
    memberName: 'Maria Lopez',
    takebackId: null,
    takebackNumber: null,
    assignedToUserId: 1,
    assignedToName: 'Ana Analyst',
    dueDate: '2025-03-14T00:00:00',
    completedDate: null,
    isOverdue: false,
    createdDate: TEST_TIMESTAMP,
    ...overrides
  };
}

export function buildRecovery(overrides: Partial<TakebackRecovery> = {}): TakebackRecovery {
  return {
    recoveryId: 1,
    takebackId: 7,
    amount: 250,
    recoveryDate: '2025-03-20T00:00:00',
    method: RecoveryMethod.Check,
    referenceNumber: 'CHK-1001',
    notes: null,
    createdByUserId: 1,
    createdByName: 'Ana Analyst',
    createdDate: TEST_TIMESTAMP,
    ...overrides
  };
}

export function buildHistoryEntry(overrides: Partial<TakebackHistoryEntry> = {}): TakebackHistoryEntry {
  return {
    historyId: 1,
    takebackId: 7,
    action: TakebackAction.Create,
    fromStatus: null,
    toStatus: TakebackStatus.Draft,
    comment: null,
    changedByUserId: 1,
    changedByName: 'Ana Analyst',
    changedDate: TEST_TIMESTAMP,
    ...overrides
  };
}

export function buildTakeback(overrides: Partial<Takeback> = {}): Takeback {
  return {
    takebackId: 7,
    takebackNumber: 'TB-000007',
    claimNumber: 'CLM-2025-0042',
    memberId: 11,
    memberNumber: 'M-0011',
    memberName: 'Maria Lopez',
    providerId: 21,
    providerNumber: 'P-0021',
    providerName: 'Riverside Clinic',
    reason: TakebackReason.DuplicatePayment,
    status: TakebackStatus.Draft,
    dateOfService: '2025-01-15T00:00:00',
    originalPaidAmount: 1500,
    takebackAmount: 1000,
    recoveredAmount: 0,
    outstandingAmount: 1000,
    otherCarrierName: null,
    otherPolicyNumber: null,
    noticeDate: null,
    dueDate: null,
    isOverdue: false,
    notes: null,
    approvedByUserId: null,
    approvedByName: null,
    approvedDate: null,
    createdByUserId: 1,
    createdByName: 'Ana Analyst',
    createdDate: TEST_TIMESTAMP,
    modifiedByUserId: null,
    modifiedByName: null,
    modifiedDate: null,
    rowVersion: TEST_ROW_VERSION,
    recoveries: [],
    history: [buildHistoryEntry()],
    linkedActivities: [],
    availableActions: ['Edit', 'Submit', 'Cancel'],
    ...overrides
  };
}

export function buildTakebackListItem(overrides: Partial<TakebackListItem> = {}): TakebackListItem {
  return {
    takebackId: 7,
    takebackNumber: 'TB-000007',
    claimNumber: 'CLM-2025-0042',
    memberId: 11,
    memberNumber: 'M-0011',
    memberName: 'Maria Lopez',
    providerId: 21,
    providerName: 'Riverside Clinic',
    reason: TakebackReason.DuplicatePayment,
    status: TakebackStatus.Draft,
    takebackAmount: 1000,
    recoveredAmount: 250,
    outstandingAmount: 750,
    noticeDate: null,
    dueDate: '2025-04-14T00:00:00',
    isOverdue: false,
    createdByName: 'Ana Analyst',
    createdDate: TEST_TIMESTAMP,
    ...overrides
  };
}

export function buildPage<T>(pageItems: T[], overrides: Partial<PagedResult<T>> = {}): PagedResult<T> {
  const pageSize = overrides.pageSize ?? 20;
  const totalCount = overrides.totalCount ?? pageItems.length;
  return {
    items: pageItems,
    totalCount,
    pageNumber: 1,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    ...overrides
  };
}

export function buildSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    myOpenActivities: 4,
    myOverdueActivities: 1,
    openActivities: 12,
    overdueActivities: 3,
    activitiesDueThisWeek: 5,
    activitiesByStatus: [
      { statusId: ActivityStatus.Open, count: 8, amount: 0 },
      { statusId: ActivityStatus.InProgress, count: 4, amount: 0 }
    ],
    myUpcomingActivities: [buildActivityListItem()],
    takebacksPendingApproval: 2,
    activeTakebacks: 6,
    overdueTakebacks: 1,
    totalTakebackAmount: 10000,
    totalRecoveredAmount: 2500,
    totalOutstandingAmount: 7500,
    takebacksByStatus: [
      { statusId: TakebackStatus.NoticeSent, count: 3, amount: 6000 },
      { statusId: TakebackStatus.PartiallyRecovered, count: 3, amount: 4000 }
    ],
    recentTakebacks: [buildTakebackListItem()],
    ...overrides
  };
}
