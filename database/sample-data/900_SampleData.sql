/*
    900_SampleData.sql - fictional demo data for COBLink.

    Everything here is invented: people, providers, carriers, claim numbers and amounts. Do not load it into a
    production database.

    Re-runnable:
      * users, members and providers are inserted only when their natural key (UserName, MemberNumber,
        ProviderNumber) is missing;
      * takebacks and activities are inserted only when BOTH tables are empty, so a database that already holds
        work items is never touched.

    Dates are relative to "today" so the demo always looks current: every takeback and activity is created in the
    past, some are overdue, some are due soon, and every status of both workflows is represented.

    The takeback history, recoveries, current status, approval and notice/due dates are all derived from the single
    #TbStep list below, so they cannot disagree with each other. History text follows what the business layer writes.

    Windows-style user names (CORP\jdoe) match the development persona header (X-CobLink-User) and what Windows
    authentication delivers in a domain; change the prefix if your domain differs.

    The seeding runs as ONE batch (no GO) because it uses temp tables.
*/
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
GO

-- Users (RoleId: 1 Analyst, 2 Supervisor, 3 Administrator) ---------------------------------------------------------
INSERT INTO dbo.AppUser (UserName, DisplayName, Email, RoleId, IsActive)
SELECT v.UserName, v.DisplayName, v.Email, v.RoleId, v.IsActive
FROM (VALUES
    (1, N'CORP\jdoe',    N'Jamie Doe',     N'jamie.doe@example.test',     1, 1),
    (2, N'CORP\asmith',  N'Alex Smith',    N'alex.smith@example.test',    1, 1),
    (3, N'CORP\bwilson', N'Blake Wilson',  N'blake.wilson@example.test',  2, 1),
    (4, N'CORP\mlee',    N'Morgan Lee',    N'morgan.lee@example.test',    2, 1),
    (5, N'CORP\admin',   N'Casey Admin',   N'casey.admin@example.test',   3, 1),
    (6, N'CORP\retired', N'Robin Retired', N'robin.retired@example.test', 1, 0)
) AS v (Seq, UserName, DisplayName, Email, RoleId, IsActive)
WHERE NOT EXISTS (SELECT 1 FROM dbo.AppUser AS u WHERE u.UserName = v.UserName)
ORDER BY v.Seq;
GO

-- Members -----------------------------------------------------------------------------------------------------------
INSERT INTO dbo.Member (MemberNumber, FirstName, LastName, DateOfBirth)
SELECT v.MemberNumber, v.FirstName, v.LastName, CAST(v.DateOfBirth AS date)
FROM (VALUES
    (N'M000101', N'Olivia',   N'Martinez',  '1968-03-14'),
    (N'M000102', N'Liam',     N'Johnson',   '1975-11-02'),
    (N'M000103', N'Emma',     N'Williams',  '1982-07-21'),
    (N'M000104', N'Noah',     N'Brown',     '1990-01-30'),
    (N'M000105', N'Ava',      N'Davis',     '1959-09-09'),
    (N'M000106', N'Ethan',    N'Miller',    '1971-05-17'),
    (N'M000107', N'Sophia',   N'Wilson',    '1986-12-25'),
    (N'M000108', N'Mason',    N'Moore',     '1964-08-03'),
    (N'M000109', N'Isabella', N'Taylor',    '1993-04-11'),
    (N'M000110', N'Lucas',    N'Anderson',  '1978-06-28'),
    (N'M000111', N'Mia',      N'Thomas',    '1955-02-19'),
    (N'M000112', N'Logan',    N'Jackson',   '2001-10-05'),
    (N'M000113', N'Amelia',   N'White',     '1949-12-12'),
    (N'M000114', N'Elijah',   N'Harris',    '1980-03-07'),
    (N'M000115', N'Priya',    N'Patel',     '1984-09-18'),
    (N'M000116', N'Wei',      N'Chen',      '1991-05-23'),
    (N'M000117', N'Fatima',   N'Hassan',    '1973-01-14'),
    (N'M000118', N'Mateo',    N'Rodriguez', '1966-07-30'),
    (N'M000119', N'Siobhan',  N'O''Brien',  '1988-11-11')
) AS v (MemberNumber, FirstName, LastName, DateOfBirth)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Member AS m WHERE m.MemberNumber = v.MemberNumber)
ORDER BY v.MemberNumber;
GO

-- Providers ---------------------------------------------------------------------------------------------------------
INSERT INTO dbo.Provider (ProviderNumber, Name, Npi, City, State)
SELECT v.ProviderNumber, v.Name, v.Npi, v.City, v.State
FROM (VALUES
    (N'P10001', N'Riverbend Family Medicine',      N'1000000011', N'Austin',      N'TX'),
    (N'P10002', N'Lakeshore Imaging Center',       N'1000000029', N'Chicago',     N'IL'),
    (N'P10003', N'Summit Orthopedic Associates',   N'1000000037', N'Denver',      N'CO'),
    (N'P10004', N'Harborview Surgical Center',     N'1000000045', N'Seattle',     N'WA'),
    (N'P10005', N'Pinecrest Cardiology Group',     N'1000000052', N'Atlanta',     N'GA'),
    (N'P10006', N'Sunrise Pediatrics',             N'1000000060', N'Phoenix',     N'AZ'),
    (N'P10007', N'Mercy Valley Hospital',          N'1000000078', N'Columbus',    N'OH'),
    (N'P10008', N'Northgate Physical Therapy',     N'1000000086', N'Minneapolis', N'MN'),
    (N'P10009', N'Bayside Urgent Care',            N'1000000094', N'Tampa',       N'FL'),
    (N'P10010', N'Cedar Ridge Behavioral Health',  NULL,          N'Nashville',   N'TN')
) AS v (ProviderNumber, Name, Npi, City, State)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Provider AS p WHERE p.ProviderNumber = v.ProviderNumber)
ORDER BY v.ProviderNumber;
GO

-- Takebacks and activities (only into an empty work-item store) -----------------------------------------------------
IF EXISTS (SELECT 1 FROM dbo.Takeback) OR EXISTS (SELECT 1 FROM dbo.Activity)
BEGIN
    PRINT N'900_SampleData: takebacks or activities already exist - demo work items were not added.';
    RETURN;
END;

SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @Today  date         = CAST(GETDATE() AS date);
    DECLARE @UtcDay datetime2(0) = CAST(CAST(SYSUTCDATETIME() AS date) AS datetime2(0));
    DECLARE @ResponseWindowDays int = 30; -- same as Takeback:ResponseWindowDays in appsettings.json

    -- Takeback headers. Status, dates, approval and recovered amount come from #TbStep.
    CREATE TABLE #Tb
    (
        Seq                int            NOT NULL PRIMARY KEY,
        ClaimNumber        nvarchar(30)   NOT NULL,
        MemberNumber       nvarchar(20)   NOT NULL,
        ProviderNumber     nvarchar(20)   NOT NULL,
        ReasonId           int            NOT NULL,
        ServiceDaysAgo     int            NOT NULL,
        OriginalPaidAmount decimal(12, 2) NOT NULL,
        TakebackAmount     decimal(12, 2) NOT NULL,
        OtherCarrierName   nvarchar(150)  NULL,
        OtherPolicyNumber  nvarchar(50)   NULL,
        Notes              nvarchar(2000) NULL
    );

    -- ReasonId: 1 Other insurance primary, 2 Medicare primary, 3 Duplicate payment, 4 Eligibility terminated,
    --           5 Third-party liability, 6 Workers' compensation, 7 Provider billing error, 8 Other
    INSERT INTO #Tb (Seq, ClaimNumber, MemberNumber, ProviderNumber, ReasonId, ServiceDaysAgo, OriginalPaidAmount, TakebackAmount, OtherCarrierName, OtherPolicyNumber, Notes)
    VALUES
    (1,  N'CLM-100234', N'M000101', N'P10001', 1, 160,  1240.00,  1240.00, N'Blue Horizon Insurance',     N'BH-5530981',   N'Member is a dependent on a spouse''s employer plan that is primary. COB questionnaire returned by the member.'),
    (2,  N'CLM-100871', N'M000102', N'P10002', 2, 120,  3860.00,  3860.00, NULL,                          NULL,            N'Medicare Part B entitlement began before the date of service; Medicare is primary.'),
    (3,  N'CLM-101442', N'M000103', N'P10003', 3, 130,  5420.00,  5420.00, NULL,                          NULL,            N'Claim was paid twice (original and resubmission).'),
    (4,  N'CLM-102019', N'M000104', N'P10004', 4, 110, 12800.00, 12800.00, NULL,                          NULL,            N'Coverage terminated before the date of service.'),
    (5,  N'CLM-102377', N'M000105', N'P10005', 5, 100,  7950.00,  7950.00, N'Keystone Auto Mutual',       N'KAM-77-20931', N'Third-party liability: member was injured in an auto accident and the liability carrier is identified.'),
    (6,  N'CLM-102840', N'M000106', N'P10008', 6, 190,   860.00,   860.00, N'Granite State Workers Comp', N'WC-3382-17',    N'Work-related injury; the workers'' compensation carrier is primary.'),
    (7,  N'CLM-103115', N'M000107', N'P10009', 7,  45,   215.50,   215.50, NULL,                          NULL,            N'Provider billed a procedure code twice.'),
    (8,  N'CLM-103560', N'M000108', N'P10007', 1,  75, 48000.00, 31500.00, N'Evergreen Health Plan',      N'EHP-2201-9930', N'Inpatient stay with other insurance primary. The amount is above 25,000, so administrator approval is required.'),
    (9,  N'CLM-103902', N'M000109', N'P10006', 2,  30,   640.00,   640.00, NULL,                          NULL,            N'Draft - waiting for Medicare eligibility confirmation.'),
    (10, N'CLM-104271', N'M000110', N'P10010', 8,  80,  2300.00,  1150.00, NULL,                          NULL,            N'Partial overpayment after a benefit reprocessing.'),
    (11, N'CLM-104630', N'M000111', N'P10001', 3,  60,   150.00,   150.00, NULL,                          NULL,            N'Duplicate payment.'),
    (12, N'CLM-104988', N'M000112', N'P10002', 4,  95,  2975.25,  2975.25, NULL,                          NULL,            N'Eligibility ended the month before the service.'),
    (13, N'CLM-105344', N'M000113', N'P10003', 1, 140,  9400.00,  9400.00, N'Heartland Mutual',           N'HM-409-55120', N'Other insurance is primary according to the COB questionnaire.'),
    (14, N'CLM-105701', N'M000114', N'P10005', 5, 120, 18250.00, 18250.00, N'Summit Casualty',            N'SC-8812-004',  N'Third-party liability settlement was received by the member.'),
    (15, N'CLM-106058', N'M000115', N'P10004', 7,  40,  1980.00,   480.00, NULL,                          NULL,            N'Unbundled line items and a duplicated facility fee.'),
    (16, N'CLM-106419', N'M000116', N'P10007', 3, 160,   560.00,   560.00, NULL,                          NULL,            N'Duplicate payment.'),
    (17, N'CLM-106777', N'M000117', N'P10009', 6,  70,  3300.00,  3300.00, N'Atlantic Workers Comp',      NULL,            N'Draft - waiting for the workers'' compensation claim number.'),
    (18, N'CLM-107135', N'M000118', N'P10006', 2,  85,  4100.00,  4100.00, NULL,                          NULL,            N'Medicare is primary; the member turned 65 before the service.');

    -- One row per state change: Create, Submit, Approve, Reject, SendNotice, RecordRecovery, Dispute, ResolveDispute,
    -- WriteOff, Cancel, Edit. ToStatusId: 1 Draft, 2 Pending approval, 3 Approved, 4 Rejected, 5 Notice sent,
    -- 6 Partially recovered, 7 Recovered, 8 Disputed, 9 Written off, 10 Cancelled. DaysAgo must fall as Step rises
    -- and stay >= 1. Recoveries carry Amount, MethodId (1 Check, 2 EFT, 3 Offset) and RefNo.
    CREATE TABLE #TbStep
    (
        Seq        int            NOT NULL,
        Step       int            NOT NULL,
        Action     nvarchar(30)   NOT NULL,
        ToStatusId int            NOT NULL,
        Actor      nvarchar(20)   NOT NULL,
        DaysAgo    int            NOT NULL,
        Comment    nvarchar(2000) NULL,
        Amount     decimal(12, 2) NULL,
        MethodId   int            NULL,
        RefNo      nvarchar(50)   NULL,
        PRIMARY KEY (Seq, Step)
    );

    INSERT INTO #TbStep (Seq, Step, Action, ToStatusId, Actor, DaysAgo, Comment, Amount, MethodId, RefNo)
    VALUES
    -- 1 Martinez: recovered in two payments
    (1, 1, N'Create',         1, N'jdoe',    60, NULL, NULL,   NULL, NULL),
    (1, 2, N'Submit',         2, N'jdoe',    59, NULL, NULL,   NULL, NULL),
    (1, 3, N'Approve',        3, N'bwilson', 58, NULL, NULL,   NULL, NULL),
    (1, 4, N'SendNotice',     5, N'jdoe',    57, NULL, NULL,   NULL, NULL),
    (1, 5, N'RecordRecovery', 6, N'jdoe',    40, NULL, 620.00, 2,    N'EFT-88231'),
    (1, 6, N'RecordRecovery', 7, N'jdoe',    31, NULL, 620.00, 1,    N'CHK-440917'),
    -- 2 Johnson: notice sent, response window still open
    (2, 1, N'Create',         1, N'asmith',  20, NULL, NULL,   NULL, NULL),
    (2, 2, N'Submit',         2, N'asmith',  19, NULL, NULL,   NULL, NULL),
    (2, 3, N'Approve',        3, N'mlee',    18, NULL, NULL,   NULL, NULL),
    (2, 4, N'SendNotice',     5, N'asmith',  17, NULL, NULL,   NULL, NULL),
    -- 3 Williams: partially recovered and overdue
    (3, 1, N'Create',         1, N'jdoe',    55, NULL, NULL,   NULL, NULL),
    (3, 2, N'Submit',         2, N'jdoe',    54, NULL, NULL,   NULL, NULL),
    (3, 3, N'Approve',        3, N'bwilson', 52, NULL, NULL,   NULL, NULL),
    (3, 4, N'SendNotice',     5, N'jdoe',    50, NULL, NULL,   NULL, NULL),
    (3, 5, N'RecordRecovery', 6, N'jdoe',    35, N'Provider agreed to return the balance in installments.', 1000.00, 3, N'OFFSET-2291'),
    -- 4 Brown: disputed by the provider
    (4, 1, N'Create',         1, N'asmith',  12, NULL, NULL,   NULL, NULL),
    (4, 2, N'Submit',         2, N'asmith',  11, NULL, NULL,   NULL, NULL),
    (4, 3, N'Approve',        3, N'mlee',    10, NULL, NULL,   NULL, NULL),
    (4, 4, N'SendNotice',     5, N'asmith',   9, NULL, NULL,   NULL, NULL),
    (4, 5, N'Dispute',        8, N'asmith',   3, N'Provider says the member was reinstated retroactively; supporting documents requested.', NULL, NULL, NULL),
    -- 5 Davis: partially recovered, still inside the response window
    (5, 1, N'Create',         1, N'jdoe',    30, NULL, NULL,   NULL, NULL),
    (5, 2, N'Submit',         2, N'jdoe',    29, NULL, NULL,   NULL, NULL),
    (5, 3, N'Approve',        3, N'bwilson', 27, NULL, NULL,   NULL, NULL),
    (5, 4, N'SendNotice',     5, N'jdoe',    26, NULL, NULL,   NULL, NULL),
    (5, 5, N'RecordRecovery', 6, N'jdoe',     5, NULL, 2000.00, 1,   N'CHK-441822'),
    -- 6 Miller: disputed, then written off
    (6, 1, N'Create',         1, N'asmith',  90, NULL, NULL,   NULL, NULL),
    (6, 2, N'Submit',         2, N'asmith',  89, NULL, NULL,   NULL, NULL),
    (6, 3, N'Approve',        3, N'bwilson', 86, NULL, NULL,   NULL, NULL),
    (6, 4, N'SendNotice',     5, N'asmith',  85, NULL, NULL,   NULL, NULL),
    (6, 5, N'Dispute',        8, N'asmith',  70, N'Provider says the workers'' compensation claim was denied.', NULL, NULL, NULL),
    (6, 6, N'WriteOff',       9, N'mlee',    20, N'Workers'' compensation denial confirmed; the balance is uncollectible and was written off per policy.', NULL, NULL, NULL),
    -- 7 Wilson: rejected by the supervisor
    (7, 1, N'Create',         1, N'jdoe',     6, NULL, NULL,   NULL, NULL),
    (7, 2, N'Submit',         2, N'jdoe',     5, NULL, NULL,   NULL, NULL),
    (7, 3, N'Reject',         4, N'bwilson',  4, N'The provider already corrected the billing error on a replacement claim.', NULL, NULL, NULL),
    -- 8 Moore: above the 25,000 limit, waiting for an administrator
    (8, 1, N'Create',         1, N'asmith',   8, NULL, NULL,   NULL, NULL),
    (8, 2, N'Submit',         2, N'asmith',   7, NULL, NULL,   NULL, NULL),
    -- 9 Taylor: fresh draft
    (9, 1, N'Create',         1, N'jdoe',     3, NULL, NULL,   NULL, NULL),
    -- 10 Anderson: waiting for a supervisor
    (10, 1, N'Create',        1, N'asmith',   5, NULL, NULL,   NULL, NULL),
    (10, 2, N'Submit',        2, N'asmith',   4, NULL, NULL,   NULL, NULL),
    -- 11 Thomas: cancelled
    (11, 1, N'Create',        1, N'jdoe',    45, NULL, NULL,   NULL, NULL),
    (11, 2, N'Cancel',       10, N'jdoe',    44, N'Entered in error: the claim had already been adjusted.', NULL, NULL, NULL),
    -- 12 Jackson: approved, notice not sent yet
    (12, 1, N'Create',        1, N'asmith',  14, NULL, NULL,   NULL, NULL),
    (12, 2, N'Submit',        2, N'asmith',  13, NULL, NULL,   NULL, NULL),
    (12, 3, N'Approve',       3, N'mlee',    12, NULL, NULL,   NULL, NULL),
    -- 13 White: notice sent long ago, nothing recovered
    (13, 1, N'Create',        1, N'jdoe',    70, NULL, NULL,   NULL, NULL),
    (13, 2, N'Submit',        2, N'jdoe',    69, NULL, NULL,   NULL, NULL),
    (13, 3, N'Approve',       3, N'bwilson', 67, NULL, NULL,   NULL, NULL),
    (13, 4, N'SendNotice',    5, N'jdoe',    66, NULL, NULL,   NULL, NULL),
    -- 14 Harris: administrator approved, two EFT recoveries so far
    (14, 1, N'Create',        1, N'asmith',  25, NULL, NULL,   NULL, NULL),
    (14, 2, N'Submit',        2, N'asmith',  24, NULL, NULL,   NULL, NULL),
    (14, 3, N'Approve',       3, N'admin',   23, NULL, NULL,   NULL, NULL),
    (14, 4, N'SendNotice',    5, N'asmith',  22, NULL, NULL,   NULL, NULL),
    (14, 5, N'RecordRecovery', 6, N'asmith', 10, NULL, 6000.00, 2,  N'EFT-90012'),
    (14, 6, N'RecordRecovery', 6, N'asmith',  2, NULL, 4000.00, 2,  N'EFT-90455'),
    -- 15 Patel: waiting for a supervisor
    (15, 1, N'Create',        1, N'jdoe',     2, NULL, NULL,   NULL, NULL),
    (15, 2, N'Submit',        2, N'jdoe',     1, NULL, NULL,   NULL, NULL),
    -- 16 Chen: rejected, edited, resubmitted, approved, recovered in full
    (16, 1, N'Create',        1, N'asmith', 100, NULL, NULL,   NULL, NULL),
    (16, 2, N'Submit',        2, N'asmith',  99, NULL, NULL,   NULL, NULL),
    (16, 3, N'Reject',        4, N'mlee',    98, N'Please confirm the duplicate payment date before resubmitting.', NULL, NULL, NULL),
    (16, 4, N'Edit',          4, N'asmith',  96, NULL, NULL,   NULL, NULL),
    (16, 5, N'Submit',        2, N'asmith',  95, NULL, NULL,   NULL, NULL),
    (16, 6, N'Approve',       3, N'mlee',    93, NULL, NULL,   NULL, NULL),
    (16, 7, N'SendNotice',    5, N'asmith',  92, NULL, NULL,   NULL, NULL),
    (16, 8, N'RecordRecovery', 7, N'asmith', 80, NULL, 560.00, 1,   N'CHK-437700'),
    -- 17 Hassan: stale draft
    (17, 1, N'Create',        1, N'jdoe',    35, NULL, NULL,   NULL, NULL),
    -- 18 Rodriguez: disputed, dispute upheld, back to notice sent with a fresh response window
    (18, 1, N'Create',        1, N'asmith',  45, NULL, NULL,   NULL, NULL),
    (18, 2, N'Submit',        2, N'asmith',  44, NULL, NULL,   NULL, NULL),
    (18, 3, N'Approve',       3, N'bwilson', 42, NULL, NULL,   NULL, NULL),
    (18, 4, N'SendNotice',    5, N'asmith',  41, NULL, NULL,   NULL, NULL),
    (18, 5, N'Dispute',       8, N'asmith',  30, N'Provider disputes the Medicare entitlement date.', NULL, NULL, NULL),
    (18, 6, N'ResolveDispute', 5, N'bwilson', 12, N'Dispute upheld. Entitlement date confirmed with the Medicare eligibility portal.', NULL, NULL, NULL);

    -- Resolve actors, previous status and a time of day that keeps the steps of one takeback in order.
    SELECT s.Seq, s.Step, s.Action, s.ToStatusId, s.DaysAgo, s.Comment, s.Amount, s.MethodId, s.RefNo,
           u.UserId AS ActorUserId,
           LAG(s.ToStatusId) OVER (PARTITION BY s.Seq ORDER BY s.Step) AS FromStatusId,
           DATEADD(minute, 540 + (s.Seq * 11) % 300 + s.Step * 5, DATEADD(day, -s.DaysAgo, @UtcDay)) AS ChangedDate
    INTO #H
    FROM #TbStep AS s
    INNER JOIN dbo.AppUser AS u ON u.UserName = N'CORP\' + s.Actor;

    CREATE TABLE #TbMap (TakebackId int NOT NULL, ClaimNumber nvarchar(30) NOT NULL);

    INSERT INTO dbo.Takeback
        (ClaimNumber, MemberId, ProviderId, ReasonId, StatusId, DateOfService, OriginalPaidAmount, TakebackAmount,
         RecoveredAmount, OtherCarrierName, OtherPolicyNumber, NoticeDate, DueDate, Notes,
         ApprovedByUserId, ApprovedDate, CreatedByUserId, CreatedDate, ModifiedByUserId, ModifiedDate)
    OUTPUT inserted.TakebackId, inserted.ClaimNumber INTO #TbMap (TakebackId, ClaimNumber)
    SELECT t.ClaimNumber, m.MemberId, p.ProviderId, t.ReasonId, lastStep.ToStatusId,
           DATEADD(day, -t.ServiceDaysAgo, @Today),
           t.OriginalPaidAmount, t.TakebackAmount, ISNULL(rec.Total, 0),
           t.OtherCarrierName, t.OtherPolicyNumber,
           notice.NoticeDate, due.DueDate, t.Notes,
           approved.ActorUserId, approved.ChangedDate,
           created.ActorUserId, created.ChangedDate,
           CASE WHEN lastStep.Step > 1 THEN lastStep.ActorUserId END,
           CASE WHEN lastStep.Step > 1 THEN lastStep.ChangedDate END
    FROM #Tb AS t
    INNER JOIN dbo.Member AS m ON m.MemberNumber = t.MemberNumber
    INNER JOIN dbo.Provider AS p ON p.ProviderNumber = t.ProviderNumber
    CROSS APPLY (SELECT TOP (1) h.ToStatusId, h.Step, h.ActorUserId, h.ChangedDate
                 FROM #H AS h WHERE h.Seq = t.Seq ORDER BY h.Step DESC) AS lastStep
    CROSS APPLY (SELECT TOP (1) h.ActorUserId, h.ChangedDate
                 FROM #H AS h WHERE h.Seq = t.Seq ORDER BY h.Step) AS created
    OUTER APPLY (SELECT TOP (1) h.ActorUserId, h.ChangedDate
                 FROM #H AS h WHERE h.Seq = t.Seq AND h.Action = N'Approve' ORDER BY h.Step DESC) AS approved
    OUTER APPLY (SELECT TOP (1) DATEADD(day, -h.DaysAgo, @Today) AS NoticeDate
                 FROM #H AS h WHERE h.Seq = t.Seq AND h.Action = N'SendNotice' ORDER BY h.Step DESC) AS notice
    OUTER APPLY (SELECT TOP (1) DATEADD(day, @ResponseWindowDays - h.DaysAgo, @Today) AS DueDate
                 FROM #H AS h
                 WHERE h.Seq = t.Seq AND h.Action IN (N'SendNotice', N'ResolveDispute') AND h.ToStatusId IN (5, 6)
                 ORDER BY h.Step DESC) AS due
    OUTER APPLY (SELECT SUM(h.Amount) AS Total
                 FROM #H AS h WHERE h.Seq = t.Seq AND h.Action = N'RecordRecovery') AS rec
    ORDER BY t.Seq;

    INSERT INTO dbo.TakebackHistory (TakebackId, Action, FromStatusId, ToStatusId, Comment, ChangedByUserId, ChangedDate)
    SELECT map.TakebackId, h.Action, h.FromStatusId, h.ToStatusId,
           CASE WHEN h.Action = N'RecordRecovery'
                THEN N'Recovered ' + FORMAT(h.Amount, N'N2', N'en-US') + N' by ' + meth.Code + N'.'
                ELSE h.Comment END,
           h.ActorUserId, h.ChangedDate
    FROM #H AS h
    INNER JOIN #Tb AS t ON t.Seq = h.Seq
    INNER JOIN #TbMap AS map ON map.ClaimNumber = t.ClaimNumber
    LEFT JOIN dbo.LkpRecoveryMethod AS meth ON meth.Id = h.MethodId
    ORDER BY h.Seq, h.Step;

    INSERT INTO dbo.TakebackRecovery (TakebackId, Amount, RecoveryDate, MethodId, ReferenceNumber, Notes, CreatedByUserId, CreatedDate)
    SELECT map.TakebackId, h.Amount, DATEADD(day, -h.DaysAgo, @Today), h.MethodId, h.RefNo, h.Comment, h.ActorUserId, h.ChangedDate
    FROM #H AS h
    INNER JOIN #Tb AS t ON t.Seq = h.Seq
    INNER JOIN #TbMap AS map ON map.ClaimNumber = t.ClaimNumber
    WHERE h.Action = N'RecordRecovery'
    ORDER BY h.Seq, h.Step;

    -- Activities. TypeId: 1 Phone call, 2 Email, 3 Letter, 4 Other carrier verification, 5 Member outreach,
    -- 6 Provider outreach, 7 Document review, 8 Claim review, 9 Research, 10 Other.
    -- StatusId: 1 Open, 2 In progress, 3 Completed, 4 Cancelled. PriorityId: 1 Low .. 4 Urgent.
    -- DueInDays is relative to today (negative = overdue while still open). ClosedDaysAgo is the completion or
    -- cancellation day; Outcome holds the outcome (completed) or the reason (cancelled).
    CREATE TABLE #Act
    (
        Seq            int            NOT NULL PRIMARY KEY,
        TypeId         int            NOT NULL,
        StatusId       int            NOT NULL,
        PriorityId     int            NOT NULL,
        Subject        nvarchar(200)  NOT NULL,
        Description    nvarchar(4000) NULL,
        MemberNumber   nvarchar(20)   NULL,
        Claim          nvarchar(30)   NULL,
        Assignee       nvarchar(20)   NULL,
        DueInDays      int            NULL,
        CreatedDaysAgo int            NOT NULL,
        Creator        nvarchar(20)   NOT NULL,
        ClosedDaysAgo  int            NULL,
        Outcome        nvarchar(1000) NULL
    );

    INSERT INTO #Act (Seq, TypeId, StatusId, PriorityId, Subject, Description, MemberNumber, Claim, Assignee, DueInDays, CreatedDaysAgo, Creator, ClosedDaysAgo, Outcome)
    VALUES
    (1,  4, 1, 3, N'Confirm Evergreen Health Plan coverage dates for Moore',          N'Call Evergreen Health Plan to confirm the coverage effective date and that it is the primary plan for the inpatient stay.', N'M000108', N'CLM-103560', N'asmith',  1,    8, N'asmith',  NULL, NULL),
    (2,  9, 1, 2, N'Confirm Medicare entitlement dates for Johnson',                  N'Check the Medicare Part B entitlement start date against the date of service.',                                          N'M000102', N'CLM-100871', N'asmith',  5,   17, N'mlee',    NULL, NULL),
    (3,  1, 1, 4, N'Call Summit Orthopedic about the remaining duplicate-payment balance', N'Ask the billing manager when the remaining balance will be returned or offset.',                                    N'M000103', N'CLM-101442', N'jdoe',   -3,   20, N'bwilson', NULL, NULL),
    (4,  7, 2, 3, N'Review dispute documentation from Harborview Surgical Center',    N'Compare the records the provider sent with the eligibility termination date.',                                           N'M000104', N'CLM-102019', N'asmith',  2,    3, N'mlee',    NULL, NULL),
    (5,  3, 1, 2, N'Send subrogation information request to the liability carrier',   N'Request the claim number and adjuster contact for the member''s auto accident claim.',                                   N'M000105', N'CLM-102377', N'jdoe',   10,   20, N'jdoe',    NULL, NULL),
    (6,  7, 2, 3, N'Assemble supporting documents for administrator approval',        N'The takeback is above the administrator approval limit; collect the EOB, the other carrier''s letter and the COB questionnaire.', N'M000108', N'CLM-103560', N'asmith',  3,    7, N'asmith',  NULL, NULL),
    (7,  1, 1, 3, N'Second notice call to Summit Orthopedic',                         N'The notice response window has passed with no payment; call the billing office.',                                        N'M000113', N'CLM-105344', N'jdoe',   -7,   30, N'jdoe',    NULL, NULL),
    (8,  6, 1, 2, N'Confirm EFT settlement schedule with Pinecrest Cardiology',       N'Agree on dates for the remaining electronic payments.',                                                                   N'M000114', N'CLM-105701', N'asmith',  6,   10, N'asmith',  NULL, NULL),
    (9,  10, 3, 1, N'Archive rejected takeback documentation',                        N'File the correspondence and the corrected claim with the claim record.',                                                  N'M000107', N'CLM-103115', N'asmith', -2,    4, N'bwilson',   3, N'Documentation filed with the claim record; no further action needed.'),
    (10, 7, 3, 2, N'Write-off rationale memo for workers'' compensation takeback',    N'Document why the balance is uncollectible.',                                                                              N'M000106', N'CLM-102840', N'jdoe',  -22,   25, N'mlee',     21, N'Memo attached to the takeback and signed off by the supervisor.'),
    (11, 5, 1, 2, N'Call member to update other-coverage information',                N'Confirm whether the member has any other health coverage and collect the policy details.',                                N'M000117', NULL,          N'jdoe',    2,    4, N'bwilson', NULL, NULL),
    (12, 2, 3, 1, N'Email Bayside Urgent Care about corrected claims',                N'Ask the billing contact to confirm that replacement claims were submitted.',                                              NULL,       NULL,          N'jdoe',   -5,    9, N'jdoe',      6, N'Billing contact confirmed the replacement claims were submitted.'),
    (13, 8, 2, 2, N'Review claims batch for coordination-of-benefits flags',          N'Work through the weekly batch of claims flagged for possible other coverage.',                                            NULL,       NULL,          N'asmith',  0,    2, N'asmith',  NULL, NULL),
    (14, 9, 1, 1, N'Research updated Medicare Secondary Payer guidance',              N'Summarize recent changes that affect primary-payer determination.',                                                       NULL,       NULL,          NULL,    NULL,   12, N'mlee',    NULL, NULL),
    (15, 10, 4, 1, N'COB backlog huddle',                                             N'Short team meeting to review the backlog.',                                                                               NULL,       NULL,          N'bwilson',-4,   15, N'bwilson',  14, N'Meeting replaced by the weekly stand-up.'),
    (16, 1, 1, 4, N'Return member call about the COB letter',                         N'The member called with questions about the coordination-of-benefits letter.',                                             N'M000115', NULL,          N'jdoe',   -1,    2, N'jdoe',    NULL, NULL),
    (17, 3, 1, 2, N'Send COB questionnaire to member',                                N'Mail the questionnaire and a prepaid return envelope.',                                                                   N'M000116', NULL,          N'asmith',  3,    5, N'asmith',  NULL, NULL),
    (18, 7, 2, 2, N'Quarterly audit of takeback documentation',                       N'Sample 25 closed takebacks and check that the required documents are attached.',                                          NULL,       NULL,          N'mlee',   14,    6, N'mlee',    NULL, NULL),
    (19, 4, 1, 2, N'Verify Medicare entitlement for Rodriguez',                       N'Confirm the entitlement date with the Medicare eligibility portal.',                                                      N'M000118', N'CLM-107135', N'jdoe',    4,   12, N'bwilson', NULL, NULL),
    (20, 6, 1, 1, N'Provider education: reporting other insurance on claims',         N'Prepare a short bulletin for providers.',                                                                                 NULL,       NULL,          N'bwilson',21,    7, N'bwilson', NULL, NULL),
    (21, 5, 3, 2, N'Follow up with Anderson about other coverage',                    N'Ask the member whether any other coverage was in force on the date of service.',                                          N'M000110', N'CLM-104271', N'asmith', -3,    6, N'asmith',    2, N'Member confirmed no other coverage; the takeback amount was reduced.'),
    (22, 9, 2, 3, N'Investigate duplicate-payment pattern at Summit Orthopedic',      N'Look for other claims paid twice for the same provider.',                                                                 NULL,       NULL,          N'asmith',  7,    9, N'mlee',    NULL, NULL),
    (23, 2, 3, 2, N'Notify supervisor of the disputed takeback',                      N'Forward the dispute packet to the supervisor.',                                                                           N'M000104', N'CLM-102019', N'bwilson',-1,    3, N'asmith',    2, N'Supervisor notified and the dispute packet was forwarded.'),
    (24, 8, 1, 2, N'Re-adjudicate claim after Medicare confirmation',                 N'Once Medicare is confirmed as primary, re-process the secondary claim.',                                                  N'M000102', N'CLM-100871', N'asmith',  8,   16, N'mlee',    NULL, NULL),
    (25, 3, 1, 3, N'Prepare and send the takeback notice',                            N'The takeback is approved; send the notice to the provider.',                                                              N'M000112', N'CLM-104988', N'jdoe',    1,   12, N'mlee',    NULL, NULL),
    (26, 10, 1, 3, N'Review takebacks awaiting approval',                             N'Several submitted takebacks are waiting for a decision.',                                                                 NULL,       NULL,          N'mlee',    0,    1, N'bwilson', NULL, NULL),
    (27, 8, 1, 3, N'Review high-value takeback approval request',                     N'The takeback is above the 25,000 limit; administrator approval is required.',                                             N'M000108', N'CLM-103560', N'admin',   1,    7, N'asmith',  NULL, NULL);

    CREATE TABLE #ActNote
    (
        Seq      int            NOT NULL,
        NoteText nvarchar(2000) NOT NULL,
        Actor    nvarchar(20)   NOT NULL,
        DaysAgo  int            NOT NULL
    );

    INSERT INTO #ActNote (Seq, NoteText, Actor, DaysAgo)
    VALUES
    (1,  N'Evergreen needs the member ID card number before they release the coverage dates.',     N'asmith',  6),
    (3,  N'Left a voicemail with the billing manager; will try again tomorrow.',                     N'jdoe',    2),
    (3,  N'Please escalate to provider relations if there is no response by Friday.',                N'bwilson', 1),
    (4,  N'The provider sent a stack of records; comparing them with the termination date.',        N'asmith',  1),
    (7,  N'First notice call made; the office said they will check with their billing team.',       N'jdoe',    5),
    (16, N'Member prefers calls after 5 pm.',                                                        N'jdoe',    1),
    (22, N'Found three more duplicate payments from the same billing system; list saved to the shared drive.', N'asmith', 3);

    CREATE TABLE #ActMap (ActivityId int NOT NULL, Subject nvarchar(200) NOT NULL);

    INSERT INTO dbo.Activity
        (MemberId, TakebackId, ActivityTypeId, StatusId, PriorityId, Subject, Description, AssignedToUserId, DueDate,
         CompletedDate, Outcome, CreatedByUserId, CreatedDate, ModifiedByUserId, ModifiedDate)
    OUTPUT inserted.ActivityId, inserted.Subject INTO #ActMap (ActivityId, Subject)
    SELECT m.MemberId, tm.TakebackId, a.TypeId, a.StatusId, a.PriorityId, a.Subject, a.Description, asg.UserId,
           CASE WHEN a.DueInDays IS NULL THEN NULL ELSE DATEADD(day, a.DueInDays, @Today) END,
           CASE WHEN a.StatusId = 3 THEN DATEADD(minute, 840 + (a.Seq * 7) % 120, DATEADD(day, -a.ClosedDaysAgo, @UtcDay)) END,
           CASE WHEN a.StatusId = 3 THEN a.Outcome END,
           cr.UserId,
           DATEADD(minute, 540 + (a.Seq * 13) % 240, DATEADD(day, -a.CreatedDaysAgo, @UtcDay)),
           CASE WHEN a.StatusId IN (3, 4) THEN COALESCE(asg.UserId, cr.UserId) END,
           CASE WHEN a.StatusId IN (3, 4) THEN DATEADD(minute, 840 + (a.Seq * 7) % 120, DATEADD(day, -a.ClosedDaysAgo, @UtcDay)) END
    FROM #Act AS a
    INNER JOIN dbo.AppUser AS cr ON cr.UserName = N'CORP\' + a.Creator
    LEFT JOIN dbo.AppUser AS asg ON asg.UserName = N'CORP\' + a.Assignee
    LEFT JOIN dbo.Member AS m ON m.MemberNumber = a.MemberNumber
    LEFT JOIN #TbMap AS tm ON tm.ClaimNumber = a.Claim
    ORDER BY a.Seq;

    -- Notes: the system notes the business layer writes, then a few human ones, in time order per activity.
    INSERT INTO dbo.ActivityNote (ActivityId, NoteText, IsSystem, CreatedByUserId, CreatedDate)
    SELECT n.ActivityId, n.NoteText, n.IsSystem, n.UserId, n.CreatedDate
    FROM (
        SELECT am.ActivityId, a.Seq, CAST(1 AS bit) AS IsSystem, N'Activity created.' AS NoteText, cr.UserId,
               DATEADD(minute, 540 + (a.Seq * 13) % 240, DATEADD(day, -a.CreatedDaysAgo, @UtcDay)) AS CreatedDate
        FROM #Act AS a
        INNER JOIN #ActMap AS am ON am.Subject = a.Subject
        INNER JOIN dbo.AppUser AS cr ON cr.UserName = N'CORP\' + a.Creator

        UNION ALL

        SELECT am.ActivityId, a.Seq, CAST(1 AS bit), N'Assigned to ' + asg.DisplayName + N'.', cr.UserId,
               DATEADD(minute, 1 + 540 + (a.Seq * 13) % 240, DATEADD(day, -a.CreatedDaysAgo, @UtcDay))
        FROM #Act AS a
        INNER JOIN #ActMap AS am ON am.Subject = a.Subject
        INNER JOIN dbo.AppUser AS cr ON cr.UserName = N'CORP\' + a.Creator
        INNER JOIN dbo.AppUser AS asg ON asg.UserName = N'CORP\' + a.Assignee
        WHERE a.Assignee <> a.Creator

        UNION ALL

        SELECT am.ActivityId, a.Seq, CAST(0 AS bit), x.NoteText, u.UserId,
               DATEADD(minute, 600 + (a.Seq * 7) % 240, DATEADD(day, -x.DaysAgo, @UtcDay))
        FROM #ActNote AS x
        INNER JOIN #Act AS a ON a.Seq = x.Seq
        INNER JOIN #ActMap AS am ON am.Subject = a.Subject
        INNER JOIN dbo.AppUser AS u ON u.UserName = N'CORP\' + x.Actor

        UNION ALL

        SELECT am.ActivityId, a.Seq, CAST(1 AS bit),
               CASE WHEN a.StatusId = 3 THEN N'Completed. Outcome: ' ELSE N'Cancelled. Reason: ' END + a.Outcome,
               COALESCE(asg.UserId, cr.UserId),
               DATEADD(minute, 840 + (a.Seq * 7) % 120, DATEADD(day, -a.ClosedDaysAgo, @UtcDay))
        FROM #Act AS a
        INNER JOIN #ActMap AS am ON am.Subject = a.Subject
        INNER JOIN dbo.AppUser AS cr ON cr.UserName = N'CORP\' + a.Creator
        LEFT JOIN dbo.AppUser AS asg ON asg.UserName = N'CORP\' + a.Assignee
        WHERE a.StatusId IN (3, 4)
    ) AS n
    ORDER BY n.Seq, n.CreatedDate;

    COMMIT TRANSACTION;

    DECLARE @TakebackCount int = (SELECT COUNT(*) FROM #TbMap);
    DECLARE @ActivityCount int = (SELECT COUNT(*) FROM #ActMap);
    PRINT N'900_SampleData: added ' + CAST(@TakebackCount AS nvarchar(10)) + N' takebacks and '
        + CAST(@ActivityCount AS nvarchar(10)) + N' activities.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
