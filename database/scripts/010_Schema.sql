/*
    COBLink schema (SQL Server 2019+; developed against SQL Server 2022).

    The baseline has no migration framework. Every script in database/scripts is idempotent and is applied in file-name
    order by CobLink.Data.Deployment.DatabaseDeployer (GO separates batches). Re-running a script against an existing
    database changes nothing.

    Conventions
      * dbo schema, singular PascalCase table names, <Table>Id identity keys.
      * Lkp* tables hold the C# enums: Id = enum value, Code = enum name (see CobLink.Models/Enums.cs).
      * Timestamps (CreatedDate, ModifiedDate, ChangedDate, CompletedDate, ApprovedDate) are UTC in datetime2(0).
        Business dates (DueDate, NoticeDate, DateOfService, RecoveryDate, DateOfBirth) are plain date columns.
      * RowVersion (rowversion) is the optimistic concurrency token; the stored procedures compare it on every update.
      * ActivityNumber / TakebackNumber are persisted computed columns (ACT-000001, TB-000001).
*/

-- Required for persisted computed columns; sqlcmd defaults to QUOTED_IDENTIFIER OFF, ADO.NET to ON.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Lookup tables -------------------------------------------------------------------------------------------------

IF OBJECT_ID(N'dbo.LkpUserRole', N'U') IS NULL
    CREATE TABLE dbo.LkpUserRole
    (
        Id        int           NOT NULL CONSTRAINT PK_LkpUserRole PRIMARY KEY,
        Code      varchar(50)   NOT NULL,
        Name      nvarchar(100) NOT NULL,
        SortOrder int           NOT NULL
    );
GO

IF OBJECT_ID(N'dbo.LkpActivityType', N'U') IS NULL
    CREATE TABLE dbo.LkpActivityType
    (
        Id        int           NOT NULL CONSTRAINT PK_LkpActivityType PRIMARY KEY,
        Code      varchar(50)   NOT NULL,
        Name      nvarchar(100) NOT NULL,
        SortOrder int           NOT NULL
    );
GO

IF OBJECT_ID(N'dbo.LkpActivityStatus', N'U') IS NULL
    CREATE TABLE dbo.LkpActivityStatus
    (
        Id        int           NOT NULL CONSTRAINT PK_LkpActivityStatus PRIMARY KEY,
        Code      varchar(50)   NOT NULL,
        Name      nvarchar(100) NOT NULL,
        SortOrder int           NOT NULL
    );
GO

IF OBJECT_ID(N'dbo.LkpActivityPriority', N'U') IS NULL
    CREATE TABLE dbo.LkpActivityPriority
    (
        Id        int           NOT NULL CONSTRAINT PK_LkpActivityPriority PRIMARY KEY,
        Code      varchar(50)   NOT NULL,
        Name      nvarchar(100) NOT NULL,
        SortOrder int           NOT NULL
    );
GO

IF OBJECT_ID(N'dbo.LkpTakebackReason', N'U') IS NULL
    CREATE TABLE dbo.LkpTakebackReason
    (
        Id        int           NOT NULL CONSTRAINT PK_LkpTakebackReason PRIMARY KEY,
        Code      varchar(50)   NOT NULL,
        Name      nvarchar(100) NOT NULL,
        SortOrder int           NOT NULL
    );
GO

IF OBJECT_ID(N'dbo.LkpTakebackStatus', N'U') IS NULL
    CREATE TABLE dbo.LkpTakebackStatus
    (
        Id        int           NOT NULL CONSTRAINT PK_LkpTakebackStatus PRIMARY KEY,
        Code      varchar(50)   NOT NULL,
        Name      nvarchar(100) NOT NULL,
        SortOrder int           NOT NULL
    );
GO

IF OBJECT_ID(N'dbo.LkpRecoveryMethod', N'U') IS NULL
    CREATE TABLE dbo.LkpRecoveryMethod
    (
        Id        int           NOT NULL CONSTRAINT PK_LkpRecoveryMethod PRIMARY KEY,
        Code      varchar(50)   NOT NULL,
        Name      nvarchar(100) NOT NULL,
        SortOrder int           NOT NULL
    );
GO

-- Reference data ------------------------------------------------------------------------------------------------

IF OBJECT_ID(N'dbo.AppUser', N'U') IS NULL
    CREATE TABLE dbo.AppUser
    (
        UserId      int IDENTITY(1, 1) NOT NULL CONSTRAINT PK_AppUser PRIMARY KEY,
        UserName    nvarchar(100)      NOT NULL, -- Windows identity, DOMAIN\user; matched case-insensitively
        DisplayName nvarchar(100)      NOT NULL,
        Email       nvarchar(200)      NULL,
        RoleId      int                NOT NULL CONSTRAINT FK_AppUser_Role REFERENCES dbo.LkpUserRole (Id),
        IsActive    bit                NOT NULL CONSTRAINT DF_AppUser_IsActive DEFAULT (1),
        CreatedDate datetime2(0)       NOT NULL CONSTRAINT DF_AppUser_CreatedDate DEFAULT (SYSUTCDATETIME())
    );
GO

IF OBJECT_ID(N'dbo.Member', N'U') IS NULL
    CREATE TABLE dbo.Member
    (
        MemberId     int IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Member PRIMARY KEY,
        MemberNumber nvarchar(20)       NOT NULL,
        FirstName    nvarchar(60)       NOT NULL,
        LastName     nvarchar(60)       NOT NULL,
        DateOfBirth  date               NULL
    );
GO

IF OBJECT_ID(N'dbo.Provider', N'U') IS NULL
    CREATE TABLE dbo.Provider
    (
        ProviderId     int IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Provider PRIMARY KEY,
        ProviderNumber nvarchar(20)       NOT NULL,
        Name           nvarchar(150)      NOT NULL,
        Npi            nvarchar(10)       NULL,
        City           nvarchar(80)       NULL,
        State          nvarchar(2)        NULL
    );
GO

-- Takeback ------------------------------------------------------------------------------------------------------

IF OBJECT_ID(N'dbo.Takeback', N'U') IS NULL
    CREATE TABLE dbo.Takeback
    (
        TakebackId        int IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Takeback PRIMARY KEY,
        TakebackNumber    AS (N'TB-' + RIGHT(N'0000000000' + CONVERT(nvarchar(10), TakebackId),
                              CASE WHEN TakebackId > 999999 THEN LEN(CONVERT(nvarchar(10), TakebackId)) ELSE 6 END)) PERSISTED,
        ClaimNumber       nvarchar(30)       NOT NULL,
        MemberId          int                NOT NULL CONSTRAINT FK_Takeback_Member REFERENCES dbo.Member (MemberId),
        ProviderId        int                NOT NULL CONSTRAINT FK_Takeback_Provider REFERENCES dbo.Provider (ProviderId),
        ReasonId          int                NOT NULL CONSTRAINT FK_Takeback_Reason REFERENCES dbo.LkpTakebackReason (Id),
        StatusId          int                NOT NULL CONSTRAINT FK_Takeback_Status REFERENCES dbo.LkpTakebackStatus (Id),
        DateOfService     date               NOT NULL,
        OriginalPaidAmount decimal(12, 2)    NOT NULL,
        TakebackAmount    decimal(12, 2)     NOT NULL,
        RecoveredAmount   decimal(12, 2)     NOT NULL CONSTRAINT DF_Takeback_RecoveredAmount DEFAULT (0),
        OtherCarrierName  nvarchar(150)      NULL,
        OtherPolicyNumber nvarchar(50)       NULL,
        NoticeDate        date               NULL,
        DueDate           date               NULL,
        Notes             nvarchar(2000)     NULL,
        ApprovedByUserId  int                NULL CONSTRAINT FK_Takeback_ApprovedBy REFERENCES dbo.AppUser (UserId),
        ApprovedDate      datetime2(0)       NULL,
        CreatedByUserId   int                NOT NULL CONSTRAINT FK_Takeback_CreatedBy REFERENCES dbo.AppUser (UserId),
        CreatedDate       datetime2(0)       NOT NULL CONSTRAINT DF_Takeback_CreatedDate DEFAULT (SYSUTCDATETIME()),
        ModifiedByUserId  int                NULL CONSTRAINT FK_Takeback_ModifiedBy REFERENCES dbo.AppUser (UserId),
        ModifiedDate      datetime2(0)       NULL,
        RowVersion        rowversion         NOT NULL,
        CONSTRAINT CK_Takeback_Amounts CHECK
            (OriginalPaidAmount > 0 AND TakebackAmount > 0 AND TakebackAmount <= OriginalPaidAmount
             AND RecoveredAmount >= 0 AND RecoveredAmount <= TakebackAmount)
    );
GO

IF OBJECT_ID(N'dbo.TakebackRecovery', N'U') IS NULL
    CREATE TABLE dbo.TakebackRecovery
    (
        RecoveryId      int IDENTITY(1, 1) NOT NULL CONSTRAINT PK_TakebackRecovery PRIMARY KEY,
        TakebackId      int                NOT NULL CONSTRAINT FK_TakebackRecovery_Takeback REFERENCES dbo.Takeback (TakebackId),
        Amount          decimal(12, 2)     NOT NULL CONSTRAINT CK_TakebackRecovery_Amount CHECK (Amount > 0),
        RecoveryDate    date               NOT NULL,
        MethodId        int                NOT NULL CONSTRAINT FK_TakebackRecovery_Method REFERENCES dbo.LkpRecoveryMethod (Id),
        ReferenceNumber nvarchar(50)       NULL,
        Notes           nvarchar(500)      NULL,
        CreatedByUserId int                NOT NULL CONSTRAINT FK_TakebackRecovery_CreatedBy REFERENCES dbo.AppUser (UserId),
        CreatedDate     datetime2(0)       NOT NULL CONSTRAINT DF_TakebackRecovery_CreatedDate DEFAULT (SYSUTCDATETIME())
    );
GO

IF OBJECT_ID(N'dbo.TakebackHistory', N'U') IS NULL
    CREATE TABLE dbo.TakebackHistory
    (
        HistoryId       int IDENTITY(1, 1) NOT NULL CONSTRAINT PK_TakebackHistory PRIMARY KEY,
        TakebackId      int                NOT NULL CONSTRAINT FK_TakebackHistory_Takeback REFERENCES dbo.Takeback (TakebackId),
        Action          nvarchar(30)       NOT NULL, -- one of CobLink.Models.TakebackActions
        FromStatusId    int                NULL CONSTRAINT FK_TakebackHistory_FromStatus REFERENCES dbo.LkpTakebackStatus (Id),
        ToStatusId      int                NOT NULL CONSTRAINT FK_TakebackHistory_ToStatus REFERENCES dbo.LkpTakebackStatus (Id),
        Comment         nvarchar(2000)     NULL,
        ChangedByUserId int                NOT NULL CONSTRAINT FK_TakebackHistory_ChangedBy REFERENCES dbo.AppUser (UserId),
        ChangedDate     datetime2(0)       NOT NULL CONSTRAINT DF_TakebackHistory_ChangedDate DEFAULT (SYSUTCDATETIME())
    );
GO

-- Activity ------------------------------------------------------------------------------------------------------

IF OBJECT_ID(N'dbo.Activity', N'U') IS NULL
    CREATE TABLE dbo.Activity
    (
        ActivityId       int IDENTITY(1, 1) NOT NULL CONSTRAINT PK_Activity PRIMARY KEY,
        ActivityNumber   AS (N'ACT-' + RIGHT(N'0000000000' + CONVERT(nvarchar(10), ActivityId),
                             CASE WHEN ActivityId > 999999 THEN LEN(CONVERT(nvarchar(10), ActivityId)) ELSE 6 END)) PERSISTED,
        MemberId         int                NULL CONSTRAINT FK_Activity_Member REFERENCES dbo.Member (MemberId),
        TakebackId       int                NULL CONSTRAINT FK_Activity_Takeback REFERENCES dbo.Takeback (TakebackId),
        ActivityTypeId   int                NOT NULL CONSTRAINT FK_Activity_Type REFERENCES dbo.LkpActivityType (Id),
        StatusId         int                NOT NULL CONSTRAINT FK_Activity_Status REFERENCES dbo.LkpActivityStatus (Id),
        PriorityId       int                NOT NULL CONSTRAINT FK_Activity_Priority REFERENCES dbo.LkpActivityPriority (Id),
        Subject          nvarchar(200)      NOT NULL,
        Description      nvarchar(4000)     NULL,
        AssignedToUserId int                NULL CONSTRAINT FK_Activity_AssignedTo REFERENCES dbo.AppUser (UserId),
        DueDate          date               NULL,
        CompletedDate    datetime2(0)       NULL,
        Outcome          nvarchar(1000)     NULL,
        CreatedByUserId  int                NOT NULL CONSTRAINT FK_Activity_CreatedBy REFERENCES dbo.AppUser (UserId),
        CreatedDate      datetime2(0)       NOT NULL CONSTRAINT DF_Activity_CreatedDate DEFAULT (SYSUTCDATETIME()),
        ModifiedByUserId int                NULL CONSTRAINT FK_Activity_ModifiedBy REFERENCES dbo.AppUser (UserId),
        ModifiedDate     datetime2(0)       NULL,
        RowVersion       rowversion         NOT NULL
    );
GO

IF OBJECT_ID(N'dbo.ActivityNote', N'U') IS NULL
    CREATE TABLE dbo.ActivityNote
    (
        NoteId          int IDENTITY(1, 1) NOT NULL CONSTRAINT PK_ActivityNote PRIMARY KEY,
        ActivityId      int                NOT NULL CONSTRAINT FK_ActivityNote_Activity REFERENCES dbo.Activity (ActivityId),
        NoteText        nvarchar(2000)     NOT NULL,
        IsSystem        bit                NOT NULL CONSTRAINT DF_ActivityNote_IsSystem DEFAULT (0),
        CreatedByUserId int                NOT NULL CONSTRAINT FK_ActivityNote_CreatedBy REFERENCES dbo.AppUser (UserId),
        CreatedDate     datetime2(0)       NOT NULL CONSTRAINT DF_ActivityNote_CreatedDate DEFAULT (SYSUTCDATETIME())
    );
GO

-- Indexes -------------------------------------------------------------------------------------------------------

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_AppUser_UserName' AND object_id = OBJECT_ID(N'dbo.AppUser'))
    CREATE UNIQUE INDEX UX_AppUser_UserName ON dbo.AppUser (UserName);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Member_MemberNumber' AND object_id = OBJECT_ID(N'dbo.Member'))
    CREATE UNIQUE INDEX UX_Member_MemberNumber ON dbo.Member (MemberNumber);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Member_LastName_FirstName' AND object_id = OBJECT_ID(N'dbo.Member'))
    CREATE INDEX IX_Member_LastName_FirstName ON dbo.Member (LastName, FirstName);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_Provider_ProviderNumber' AND object_id = OBJECT_ID(N'dbo.Provider'))
    CREATE UNIQUE INDEX UX_Provider_ProviderNumber ON dbo.Provider (ProviderNumber);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Provider_Name' AND object_id = OBJECT_ID(N'dbo.Provider'))
    CREATE INDEX IX_Provider_Name ON dbo.Provider (Name);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Takeback_Status' AND object_id = OBJECT_ID(N'dbo.Takeback'))
    CREATE INDEX IX_Takeback_Status ON dbo.Takeback (StatusId) INCLUDE (DueDate, TakebackAmount, RecoveredAmount);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Takeback_Claim_Provider' AND object_id = OBJECT_ID(N'dbo.Takeback'))
    CREATE INDEX IX_Takeback_Claim_Provider ON dbo.Takeback (ProviderId, ClaimNumber);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Takeback_Member' AND object_id = OBJECT_ID(N'dbo.Takeback'))
    CREATE INDEX IX_Takeback_Member ON dbo.Takeback (MemberId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Takeback_CreatedDate' AND object_id = OBJECT_ID(N'dbo.Takeback'))
    CREATE INDEX IX_Takeback_CreatedDate ON dbo.Takeback (CreatedDate DESC, TakebackId DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TakebackRecovery_Takeback' AND object_id = OBJECT_ID(N'dbo.TakebackRecovery'))
    CREATE INDEX IX_TakebackRecovery_Takeback ON dbo.TakebackRecovery (TakebackId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_TakebackHistory_Takeback' AND object_id = OBJECT_ID(N'dbo.TakebackHistory'))
    CREATE INDEX IX_TakebackHistory_Takeback ON dbo.TakebackHistory (TakebackId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Activity_Status_DueDate' AND object_id = OBJECT_ID(N'dbo.Activity'))
    CREATE INDEX IX_Activity_Status_DueDate ON dbo.Activity (StatusId, DueDate);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Activity_AssignedTo' AND object_id = OBJECT_ID(N'dbo.Activity'))
    CREATE INDEX IX_Activity_AssignedTo ON dbo.Activity (AssignedToUserId, StatusId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Activity_Member' AND object_id = OBJECT_ID(N'dbo.Activity'))
    CREATE INDEX IX_Activity_Member ON dbo.Activity (MemberId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Activity_Takeback' AND object_id = OBJECT_ID(N'dbo.Activity'))
    CREATE INDEX IX_Activity_Takeback ON dbo.Activity (TakebackId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ActivityNote_Activity' AND object_id = OBJECT_ID(N'dbo.ActivityNote'))
    CREATE INDEX IX_ActivityNote_Activity ON dbo.ActivityNote (ActivityId);
GO
