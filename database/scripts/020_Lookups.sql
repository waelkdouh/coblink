/*
    Lookup data. Id and Code mirror the C# enums in CobLink.Models/Enums.cs and the TypeScript enums in
    client/src/app/models/enums.ts: change all three together. Name is the display text shown by the Angular client.
    Re-runnable: rows are inserted or corrected, never deleted (other tables reference them).
*/

MERGE dbo.LkpUserRole AS target
USING (VALUES
    (1, 'Analyst',    N'Analyst',       1),
    (2, 'Supervisor', N'Supervisor',    2),
    (3, 'Admin',      N'Administrator', 3)
) AS source (Id, Code, Name, SortOrder)
ON target.Id = source.Id
WHEN MATCHED AND (target.Code <> source.Code OR target.Name <> source.Name OR target.SortOrder <> source.SortOrder)
    THEN UPDATE SET Code = source.Code, Name = source.Name, SortOrder = source.SortOrder
WHEN NOT MATCHED BY TARGET
    THEN INSERT (Id, Code, Name, SortOrder) VALUES (source.Id, source.Code, source.Name, source.SortOrder);
GO

MERGE dbo.LkpActivityType AS target
USING (VALUES
    (1,  'PhoneCall',                 N'Phone call',                 1),
    (2,  'Email',                     N'Email',                      2),
    (3,  'Letter',                    N'Letter',                     3),
    (4,  'OtherCarrierVerification',  N'Other carrier verification', 4),
    (5,  'MemberOutreach',            N'Member outreach',            5),
    (6,  'ProviderOutreach',          N'Provider outreach',          6),
    (7,  'DocumentReview',            N'Document review',            7),
    (8,  'ClaimReview',               N'Claim review',               8),
    (9,  'Research',                  N'Research',                   9),
    (10, 'Other',                     N'Other',                      10)
) AS source (Id, Code, Name, SortOrder)
ON target.Id = source.Id
WHEN MATCHED AND (target.Code <> source.Code OR target.Name <> source.Name OR target.SortOrder <> source.SortOrder)
    THEN UPDATE SET Code = source.Code, Name = source.Name, SortOrder = source.SortOrder
WHEN NOT MATCHED BY TARGET
    THEN INSERT (Id, Code, Name, SortOrder) VALUES (source.Id, source.Code, source.Name, source.SortOrder);
GO

MERGE dbo.LkpActivityStatus AS target
USING (VALUES
    (1, 'Open',       N'Open',        1),
    (2, 'InProgress', N'In progress', 2),
    (3, 'Completed',  N'Completed',   3),
    (4, 'Cancelled',  N'Cancelled',   4)
) AS source (Id, Code, Name, SortOrder)
ON target.Id = source.Id
WHEN MATCHED AND (target.Code <> source.Code OR target.Name <> source.Name OR target.SortOrder <> source.SortOrder)
    THEN UPDATE SET Code = source.Code, Name = source.Name, SortOrder = source.SortOrder
WHEN NOT MATCHED BY TARGET
    THEN INSERT (Id, Code, Name, SortOrder) VALUES (source.Id, source.Code, source.Name, source.SortOrder);
GO

MERGE dbo.LkpActivityPriority AS target
USING (VALUES
    (1, 'Low',    N'Low',    1),
    (2, 'Normal', N'Normal', 2),
    (3, 'High',   N'High',   3),
    (4, 'Urgent', N'Urgent', 4)
) AS source (Id, Code, Name, SortOrder)
ON target.Id = source.Id
WHEN MATCHED AND (target.Code <> source.Code OR target.Name <> source.Name OR target.SortOrder <> source.SortOrder)
    THEN UPDATE SET Code = source.Code, Name = source.Name, SortOrder = source.SortOrder
WHEN NOT MATCHED BY TARGET
    THEN INSERT (Id, Code, Name, SortOrder) VALUES (source.Id, source.Code, source.Name, source.SortOrder);
GO

MERGE dbo.LkpTakebackReason AS target
USING (VALUES
    (1, 'OtherInsurancePrimary', N'Other insurance is primary', 1),
    (2, 'MedicarePrimary',       N'Medicare is primary',        2),
    (3, 'DuplicatePayment',      N'Duplicate payment',          3),
    (4, 'EligibilityTerminated', N'Eligibility terminated',     4),
    (5, 'ThirdPartyLiability',   N'Third-party liability',      5),
    (6, 'WorkersCompensation',   N'Workers'' compensation',     6),
    (7, 'ProviderBillingError',  N'Provider billing error',     7),
    (8, 'Other',                 N'Other',                      8)
) AS source (Id, Code, Name, SortOrder)
ON target.Id = source.Id
WHEN MATCHED AND (target.Code <> source.Code OR target.Name <> source.Name OR target.SortOrder <> source.SortOrder)
    THEN UPDATE SET Code = source.Code, Name = source.Name, SortOrder = source.SortOrder
WHEN NOT MATCHED BY TARGET
    THEN INSERT (Id, Code, Name, SortOrder) VALUES (source.Id, source.Code, source.Name, source.SortOrder);
GO

MERGE dbo.LkpTakebackStatus AS target
USING (VALUES
    (1,  'Draft',              N'Draft',               1),
    (2,  'PendingApproval',    N'Pending approval',    2),
    (3,  'Approved',           N'Approved',            3),
    (4,  'Rejected',           N'Rejected',            4),
    (5,  'NoticeSent',         N'Notice sent',         5),
    (6,  'PartiallyRecovered', N'Partially recovered', 6),
    (7,  'Recovered',          N'Recovered',           7),
    (8,  'Disputed',           N'Disputed',            8),
    (9,  'WrittenOff',         N'Written off',         9),
    (10, 'Cancelled',          N'Cancelled',           10)
) AS source (Id, Code, Name, SortOrder)
ON target.Id = source.Id
WHEN MATCHED AND (target.Code <> source.Code OR target.Name <> source.Name OR target.SortOrder <> source.SortOrder)
    THEN UPDATE SET Code = source.Code, Name = source.Name, SortOrder = source.SortOrder
WHEN NOT MATCHED BY TARGET
    THEN INSERT (Id, Code, Name, SortOrder) VALUES (source.Id, source.Code, source.Name, source.SortOrder);
GO

MERGE dbo.LkpRecoveryMethod AS target
USING (VALUES
    (1, 'Check',  N'Check',  1),
    (2, 'Eft',    N'EFT',    2),
    (3, 'Offset', N'Offset', 3)
) AS source (Id, Code, Name, SortOrder)
ON target.Id = source.Id
WHEN MATCHED AND (target.Code <> source.Code OR target.Name <> source.Name OR target.SortOrder <> source.SortOrder)
    THEN UPDATE SET Code = source.Code, Name = source.Name, SortOrder = source.SortOrder
WHEN NOT MATCHED BY TARGET
    THEN INSERT (Id, Code, Name, SortOrder) VALUES (source.Id, source.Code, source.Name, source.SortOrder);
GO
