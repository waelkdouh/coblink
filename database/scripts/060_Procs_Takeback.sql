/*
    Takeback procedures.
    Errors: THROW 50001 = row not found, THROW 50002 = RowVersion mismatch (CobLink.Data maps them to
    NotFoundException / ConcurrencyException).
    Enum values used below: TakebackStatus 1 Draft, 2 PendingApproval, 4 Rejected, 10 Cancelled.
    Every state change and its history row are written in one transaction. The writing procedures use
    BEGIN TRY / BEGIN TRANSACTION ... COMMIT / BEGIN CATCH ROLLBACK; THROW so a failure (including 50001/50002 and
    constraint errors) leaves nothing behind and never leaves a doomed transaction for a T-SQL caller.
*/

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Page of TakebackListItem rows plus TotalCount. @SortBy is a whitelisted camelCase key (unknown or NULL = default order:
-- newest first). Text filters are literal "contains" matches.
CREATE OR ALTER PROCEDURE dbo.usp_Takeback_Search
    @SearchText      nvarchar(200)  = NULL,
    @StatusId        int            = NULL,
    @ReasonId        int            = NULL,
    @MemberId        int            = NULL,
    @ProviderId      int            = NULL,
    @CreatedByUserId int            = NULL,
    @MinAmount       decimal(12, 2) = NULL,
    @MaxAmount       decimal(12, 2) = NULL,
    @DueFrom         date           = NULL,
    @DueTo           date           = NULL,
    @OverdueOnly     bit            = 0,
    @SortBy          nvarchar(50)   = NULL,
    @SortDescending  bit            = 0,
    @PageNumber      int            = 1,
    @PageSize        int            = 20
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Like nvarchar(1700) = NULL;
    IF @SearchText IS NOT NULL AND @SearchText <> N''
        SET @Like = N'%' + dbo.fn_EscapeLike(@SearchText) + N'%';

    SET @PageNumber = CASE WHEN @PageNumber IS NULL OR @PageNumber < 1 THEN 1 ELSE @PageNumber END;
    SET @PageSize = CASE WHEN @PageSize IS NULL THEN 20 WHEN @PageSize < 1 THEN 1 WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;

    DECLARE @SortKey nvarchar(50) = CASE
        WHEN @SortBy IN (N'takebackNumber', N'claimNumber', N'memberName', N'providerName', N'reason', N'status',
                         N'takebackAmount', N'recoveredAmount', N'outstandingAmount', N'dueDate', N'createdDate') THEN @SortBy
        ELSE N'' END;
    SET @SortDescending = ISNULL(@SortDescending, 0);

    SELECT
        v.TakebackId, v.TakebackNumber, v.ClaimNumber, v.MemberId, v.MemberNumber, v.MemberName,
        v.ProviderId, v.ProviderName, v.ReasonId, v.StatusId, v.TakebackAmount, v.RecoveredAmount,
        v.TakebackAmount - v.RecoveredAmount AS OutstandingAmount,
        v.NoticeDate, v.DueDate, v.IsOverdue, v.CreatedByName, v.CreatedDate
    INTO #Filtered
    FROM dbo.vTakebackList AS v
    WHERE (@StatusId IS NULL OR v.StatusId = @StatusId)
      AND (@ReasonId IS NULL OR v.ReasonId = @ReasonId)
      AND (@MemberId IS NULL OR v.MemberId = @MemberId)
      AND (@ProviderId IS NULL OR v.ProviderId = @ProviderId)
      AND (@CreatedByUserId IS NULL OR v.CreatedByUserId = @CreatedByUserId)
      AND (@MinAmount IS NULL OR v.TakebackAmount >= @MinAmount)
      AND (@MaxAmount IS NULL OR v.TakebackAmount <= @MaxAmount)
      AND (@DueFrom IS NULL OR v.DueDate >= @DueFrom)
      AND (@DueTo IS NULL OR v.DueDate <= @DueTo)
      AND (@OverdueOnly = 0 OR v.IsOverdue = 1)
      AND (@Like IS NULL
           OR v.TakebackNumber LIKE @Like ESCAPE N'\'
           OR v.ClaimNumber LIKE @Like ESCAPE N'\'
           OR v.MemberName LIKE @Like ESCAPE N'\'
           OR v.MemberNumber LIKE @Like ESCAPE N'\'
           OR v.ProviderName LIKE @Like ESCAPE N'\'
           OR v.ProviderNumber LIKE @Like ESCAPE N'\');

    -- One CASE per key and direction: every CASE yields a single data type, non-selected keys are NULL for all rows.
    SELECT f.TakebackId, f.TakebackNumber, f.ClaimNumber, f.MemberId, f.MemberNumber, f.MemberName,
           f.ProviderId, f.ProviderName, f.ReasonId, f.StatusId, f.TakebackAmount, f.RecoveredAmount,
           f.NoticeDate, f.DueDate, f.IsOverdue, f.CreatedByName, f.CreatedDate
    FROM #Filtered AS f
    ORDER BY
        CASE WHEN @SortKey = N'dueDate' AND f.DueDate IS NULL THEN 1 WHEN @SortKey = N'dueDate' THEN 0 END,
        CASE WHEN @SortKey = N'dueDate' AND @SortDescending = 0 THEN f.DueDate END ASC,
        CASE WHEN @SortKey = N'dueDate' AND @SortDescending = 1 THEN f.DueDate END DESC,
        CASE WHEN @SortKey = N'claimNumber' AND @SortDescending = 0 THEN f.ClaimNumber END ASC,
        CASE WHEN @SortKey = N'claimNumber' AND @SortDescending = 1 THEN f.ClaimNumber END DESC,
        CASE WHEN @SortKey = N'memberName' AND @SortDescending = 0 THEN f.MemberName END ASC,
        CASE WHEN @SortKey = N'memberName' AND @SortDescending = 1 THEN f.MemberName END DESC,
        CASE WHEN @SortKey = N'providerName' AND @SortDescending = 0 THEN f.ProviderName END ASC,
        CASE WHEN @SortKey = N'providerName' AND @SortDescending = 1 THEN f.ProviderName END DESC,
        CASE WHEN @SortKey = N'reason' AND @SortDescending = 0 THEN f.ReasonId END ASC,
        CASE WHEN @SortKey = N'reason' AND @SortDescending = 1 THEN f.ReasonId END DESC,
        CASE WHEN @SortKey = N'status' AND @SortDescending = 0 THEN f.StatusId END ASC,
        CASE WHEN @SortKey = N'status' AND @SortDescending = 1 THEN f.StatusId END DESC,
        CASE WHEN @SortKey = N'takebackAmount' AND @SortDescending = 0 THEN f.TakebackAmount END ASC,
        CASE WHEN @SortKey = N'takebackAmount' AND @SortDescending = 1 THEN f.TakebackAmount END DESC,
        CASE WHEN @SortKey = N'recoveredAmount' AND @SortDescending = 0 THEN f.RecoveredAmount END ASC,
        CASE WHEN @SortKey = N'recoveredAmount' AND @SortDescending = 1 THEN f.RecoveredAmount END DESC,
        CASE WHEN @SortKey = N'outstandingAmount' AND @SortDescending = 0 THEN f.OutstandingAmount END ASC,
        CASE WHEN @SortKey = N'outstandingAmount' AND @SortDescending = 1 THEN f.OutstandingAmount END DESC,
        CASE WHEN @SortKey = N'createdDate' AND @SortDescending = 0 THEN f.CreatedDate END ASC,
        CASE WHEN @SortKey = N'createdDate' AND @SortDescending = 1 THEN f.CreatedDate END DESC,
        -- No (or unknown) sort key: newest first. TakebackNumber is derived from TakebackId, so both sort the same way.
        CASE WHEN @SortKey = N'' THEN f.CreatedDate END DESC,
        CASE WHEN @SortKey = N'' OR @SortDescending = 1 THEN f.TakebackId END DESC,
        f.TakebackId ASC
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;

    SELECT COUNT(*) AS TotalCount FROM #Filtered;
END
GO

-- RS1: the takeback (0 or 1 row). RS2: recoveries, RS3: status history, both oldest first (always returned).
CREATE OR ALTER PROCEDURE dbo.usp_Takeback_GetById
    @TakebackId int
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        t.TakebackId, t.TakebackNumber, t.ClaimNumber,
        t.MemberId, v.MemberNumber, v.MemberName,
        t.ProviderId, v.ProviderNumber, v.ProviderName,
        t.ReasonId, t.StatusId, t.DateOfService,
        t.OriginalPaidAmount, t.TakebackAmount, t.RecoveredAmount,
        t.OtherCarrierName, t.OtherPolicyNumber,
        t.NoticeDate, t.DueDate, v.IsOverdue, t.Notes,
        t.ApprovedByUserId, au.DisplayName AS ApprovedByName, t.ApprovedDate,
        t.CreatedByUserId, v.CreatedByName, t.CreatedDate,
        t.ModifiedByUserId, mu.DisplayName AS ModifiedByName, t.ModifiedDate,
        t.RowVersion
    FROM dbo.Takeback AS t
    INNER JOIN dbo.vTakebackList AS v ON v.TakebackId = t.TakebackId
    LEFT JOIN dbo.AppUser AS au ON au.UserId = t.ApprovedByUserId
    LEFT JOIN dbo.AppUser AS mu ON mu.UserId = t.ModifiedByUserId
    WHERE t.TakebackId = @TakebackId;

    SELECT r.RecoveryId, r.TakebackId, r.Amount, r.RecoveryDate, r.MethodId, r.ReferenceNumber, r.Notes,
           r.CreatedByUserId, u.DisplayName AS CreatedByName, r.CreatedDate
    FROM dbo.TakebackRecovery AS r
    INNER JOIN dbo.AppUser AS u ON u.UserId = r.CreatedByUserId
    WHERE r.TakebackId = @TakebackId
    ORDER BY r.RecoveryId;

    SELECT h.HistoryId, h.TakebackId, h.Action, h.FromStatusId, h.ToStatusId, h.Comment,
           h.ChangedByUserId, u.DisplayName AS ChangedByName, h.ChangedDate
    FROM dbo.TakebackHistory AS h
    INNER JOIN dbo.AppUser AS u ON u.UserId = h.ChangedByUserId
    WHERE h.TakebackId = @TakebackId
    ORDER BY h.HistoryId;
END
GO

-- A takeback for the same claim and provider blocks a new one unless it was Rejected (4) or Cancelled (10).
CREATE OR ALTER PROCEDURE dbo.usp_Takeback_ActiveExists
    @ClaimNumber       nvarchar(30),
    @ProviderId        int,
    @ExcludeTakebackId int
AS
BEGIN
    SET NOCOUNT ON;

    SELECT CAST(CASE WHEN EXISTS
        (SELECT 1
         FROM dbo.Takeback
         WHERE ProviderId = @ProviderId
           AND ClaimNumber = @ClaimNumber
           AND TakebackId <> @ExcludeTakebackId
           AND StatusId NOT IN (4, 10))
        THEN 1 ELSE 0 END AS bit) AS ActiveExists;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Takeback_Insert
    @ClaimNumber        nvarchar(30),
    @MemberId           int,
    @ProviderId         int,
    @ReasonId           int,
    @DateOfService      date,
    @OriginalPaidAmount decimal(12, 2),
    @TakebackAmount     decimal(12, 2),
    @OtherCarrierName   nvarchar(150)  = NULL,
    @OtherPolicyNumber  nvarchar(50)   = NULL,
    @Notes              nvarchar(2000) = NULL,
    @UserId             int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @TakebackId int;

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO dbo.Takeback
            (ClaimNumber, MemberId, ProviderId, ReasonId, StatusId, DateOfService, OriginalPaidAmount, TakebackAmount,
             RecoveredAmount, OtherCarrierName, OtherPolicyNumber, Notes, CreatedByUserId)
        VALUES
            (@ClaimNumber, @MemberId, @ProviderId, @ReasonId, 1, @DateOfService, @OriginalPaidAmount, @TakebackAmount,
             0, @OtherCarrierName, @OtherPolicyNumber, @Notes, @UserId);

        SET @TakebackId = CAST(SCOPE_IDENTITY() AS int);

        INSERT INTO dbo.TakebackHistory (TakebackId, Action, FromStatusId, ToStatusId, Comment, ChangedByUserId)
        VALUES (@TakebackId, N'Create', NULL, 1, NULL, @UserId);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH

    SELECT @TakebackId AS TakebackId;
END
GO

-- Edits the business columns only; the status is unchanged and an "Edit" history row is written.
CREATE OR ALTER PROCEDURE dbo.usp_Takeback_Update
    @TakebackId         int,
    @ClaimNumber        nvarchar(30),
    @MemberId           int,
    @ProviderId         int,
    @ReasonId           int,
    @DateOfService      date,
    @OriginalPaidAmount decimal(12, 2),
    @TakebackAmount     decimal(12, 2),
    @OtherCarrierName   nvarchar(150)  = NULL,
    @OtherPolicyNumber  nvarchar(50)   = NULL,
    @Notes              nvarchar(2000) = NULL,
    @RowVersion         varbinary(8),
    @UserId             int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Current TABLE (StatusId int);
    DECLARE @StatusId int;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.Takeback
        SET ClaimNumber = @ClaimNumber,
            MemberId = @MemberId,
            ProviderId = @ProviderId,
            ReasonId = @ReasonId,
            DateOfService = @DateOfService,
            OriginalPaidAmount = @OriginalPaidAmount,
            TakebackAmount = @TakebackAmount,
            OtherCarrierName = @OtherCarrierName,
            OtherPolicyNumber = @OtherPolicyNumber,
            Notes = @Notes,
            ModifiedByUserId = @UserId,
            ModifiedDate = SYSUTCDATETIME()
        OUTPUT inserted.StatusId INTO @Current
        WHERE TakebackId = @TakebackId
          AND RowVersion = @RowVersion;

        IF @@ROWCOUNT = 0
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.Takeback WHERE TakebackId = @TakebackId)
                THROW 50002, N'The takeback was changed by another user.', 1;

            THROW 50001, N'Takeback not found.', 1;
        END

        SELECT @StatusId = StatusId FROM @Current;

        INSERT INTO dbo.TakebackHistory (TakebackId, Action, FromStatusId, ToStatusId, Comment, ChangedByUserId)
        VALUES (@TakebackId, N'Edit', @StatusId, @StatusId, NULL, @UserId);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

-- Moves the takeback to @NewStatusId and writes the history row. Non-NULL @ApprovedByUserId, @ApprovedDate, @NoticeDate
-- and @DueDate overwrite the stored value; NULL leaves it as it is.
CREATE OR ALTER PROCEDURE dbo.usp_Takeback_ChangeStatus
    @TakebackId       int,
    @NewStatusId      int,
    @Action           nvarchar(30),
    @Comment          nvarchar(2000) = NULL,
    @RowVersion       varbinary(8),
    @ApprovedByUserId int            = NULL,
    @ApprovedDate     datetime2(0)   = NULL,
    @NoticeDate       date           = NULL,
    @DueDate          date           = NULL,
    @UserId           int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Previous TABLE (StatusId int);
    DECLARE @FromStatusId int;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.Takeback
        SET StatusId = @NewStatusId,
            ApprovedByUserId = COALESCE(@ApprovedByUserId, ApprovedByUserId),
            ApprovedDate = COALESCE(@ApprovedDate, ApprovedDate),
            NoticeDate = COALESCE(@NoticeDate, NoticeDate),
            DueDate = COALESCE(@DueDate, DueDate),
            ModifiedByUserId = @UserId,
            ModifiedDate = SYSUTCDATETIME()
        OUTPUT deleted.StatusId INTO @Previous
        WHERE TakebackId = @TakebackId
          AND RowVersion = @RowVersion;

        IF @@ROWCOUNT = 0
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.Takeback WHERE TakebackId = @TakebackId)
                THROW 50002, N'The takeback was changed by another user.', 1;

            THROW 50001, N'Takeback not found.', 1;
        END

        SELECT @FromStatusId = StatusId FROM @Previous;

        INSERT INTO dbo.TakebackHistory (TakebackId, Action, FromStatusId, ToStatusId, Comment, ChangedByUserId)
        VALUES (@TakebackId, @Action, @FromStatusId, @NewStatusId, @Comment, @UserId);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

-- One transaction: recovery row, RecoveredAmount += @Amount, new status, "RecordRecovery" history row.
CREATE OR ALTER PROCEDURE dbo.usp_Takeback_AddRecovery
    @TakebackId      int,
    @Amount          decimal(12, 2),
    @RecoveryDate    date,
    @MethodId        int,
    @ReferenceNumber nvarchar(50)  = NULL,
    @Notes           nvarchar(500) = NULL,
    @NewStatusId     int,
    @RowVersion      varbinary(8),
    @UserId          int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Previous TABLE (StatusId int);
    DECLARE @FromStatusId int;
    DECLARE @MethodCode varchar(50);

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.Takeback
        SET RecoveredAmount = RecoveredAmount + @Amount,
            StatusId = @NewStatusId,
            ModifiedByUserId = @UserId,
            ModifiedDate = SYSUTCDATETIME()
        OUTPUT deleted.StatusId INTO @Previous
        WHERE TakebackId = @TakebackId
          AND RowVersion = @RowVersion;

        IF @@ROWCOUNT = 0
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.Takeback WHERE TakebackId = @TakebackId)
                THROW 50002, N'The takeback was changed by another user.', 1;

            THROW 50001, N'Takeback not found.', 1;
        END

        SELECT @FromStatusId = StatusId FROM @Previous;
        SELECT @MethodCode = Code FROM dbo.LkpRecoveryMethod WHERE Id = @MethodId;

        INSERT INTO dbo.TakebackRecovery (TakebackId, Amount, RecoveryDate, MethodId, ReferenceNumber, Notes, CreatedByUserId)
        VALUES (@TakebackId, @Amount, @RecoveryDate, @MethodId, @ReferenceNumber, @Notes, @UserId);

        INSERT INTO dbo.TakebackHistory (TakebackId, Action, FromStatusId, ToStatusId, Comment, ChangedByUserId)
        VALUES (@TakebackId, N'RecordRecovery', @FromStatusId, @NewStatusId,
                N'Recovered ' + FORMAT(@Amount, N'N2', N'en-US') + N' by ' + ISNULL(@MethodCode, N'unknown method') + N'.',
                @UserId);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO
