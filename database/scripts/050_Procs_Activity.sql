/*
    Activity procedures.
    Errors: THROW 50001 = row not found, THROW 50002 = RowVersion mismatch (CobLink.Data maps them to
    NotFoundException / ConcurrencyException).
    Enum values used below: ActivityStatus 1 Open, 2 InProgress.
*/

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Page of ActivityListItem rows plus TotalCount. @SortBy is a whitelisted camelCase key (unknown or NULL = default order:
-- due date ascending, undated activities last). Text filters are literal "contains" matches.
CREATE OR ALTER PROCEDURE dbo.usp_Activity_Search
    @SearchText       nvarchar(200) = NULL,
    @StatusId         int           = NULL,
    @OpenOnly         bit           = 0,
    @ActivityTypeId   int           = NULL,
    @PriorityId       int           = NULL,
    @AssignedToUserId int           = NULL,
    @MemberId         int           = NULL,
    @TakebackId       int           = NULL,
    @DueFrom          date          = NULL,
    @DueTo            date          = NULL,
    @OverdueOnly      bit           = 0,
    @SortBy           nvarchar(50)  = NULL,
    @SortDescending   bit           = 0,
    @PageNumber       int           = 1,
    @PageSize         int           = 20
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Like nvarchar(1700) = NULL;
    IF @SearchText IS NOT NULL AND @SearchText <> N''
        SET @Like = N'%' + dbo.fn_EscapeLike(@SearchText) + N'%';

    SET @PageNumber = CASE WHEN @PageNumber IS NULL OR @PageNumber < 1 THEN 1 ELSE @PageNumber END;
    SET @PageSize = CASE WHEN @PageSize IS NULL THEN 20 WHEN @PageSize < 1 THEN 1 WHEN @PageSize > 100 THEN 100 ELSE @PageSize END;

    DECLARE @SortKey nvarchar(50) = CASE
        WHEN @SortBy IN (N'activityNumber', N'subject', N'activityType', N'status', N'priority',
                         N'memberName', N'assignedToName', N'createdDate', N'dueDate') THEN @SortBy
        ELSE N'' END;
    SET @SortDescending = ISNULL(@SortDescending, 0);

    SELECT
        v.ActivityId, v.ActivityNumber, v.Subject, v.ActivityTypeId, v.StatusId, v.PriorityId,
        v.MemberId, v.MemberNumber, v.MemberName, v.TakebackId, v.TakebackNumber,
        v.AssignedToUserId, v.AssignedToName, v.DueDate, v.CompletedDate, v.IsOverdue, v.CreatedDate
    INTO #Filtered
    FROM dbo.vActivityList AS v
    WHERE (@StatusId IS NULL OR v.StatusId = @StatusId)
      AND (@OpenOnly = 0 OR v.StatusId IN (1, 2))
      AND (@ActivityTypeId IS NULL OR v.ActivityTypeId = @ActivityTypeId)
      AND (@PriorityId IS NULL OR v.PriorityId = @PriorityId)
      AND (@AssignedToUserId IS NULL OR v.AssignedToUserId = @AssignedToUserId)
      AND (@MemberId IS NULL OR v.MemberId = @MemberId)
      AND (@TakebackId IS NULL OR v.TakebackId = @TakebackId)
      AND (@DueFrom IS NULL OR v.DueDate >= @DueFrom)
      AND (@DueTo IS NULL OR v.DueDate <= @DueTo)
      AND (@OverdueOnly = 0 OR v.IsOverdue = 1)
      AND (@Like IS NULL
           OR v.ActivityNumber LIKE @Like ESCAPE N'\'
           OR v.Subject LIKE @Like ESCAPE N'\'
           OR v.Description LIKE @Like ESCAPE N'\'
           OR v.MemberName LIKE @Like ESCAPE N'\'
           OR v.MemberNumber LIKE @Like ESCAPE N'\'
           OR v.TakebackNumber LIKE @Like ESCAPE N'\');

    -- One CASE per key and direction: every CASE yields a single data type, non-selected keys are NULL for all rows.
    SELECT f.ActivityId, f.ActivityNumber, f.Subject, f.ActivityTypeId, f.StatusId, f.PriorityId,
           f.MemberId, f.MemberNumber, f.MemberName, f.TakebackId, f.TakebackNumber,
           f.AssignedToUserId, f.AssignedToName, f.DueDate, f.CompletedDate, f.IsOverdue, f.CreatedDate
    FROM #Filtered AS f
    ORDER BY
        CASE WHEN @SortKey IN (N'', N'dueDate') AND f.DueDate IS NULL THEN 1 WHEN @SortKey IN (N'', N'dueDate') THEN 0 END,
        CASE WHEN @SortKey = N'' OR (@SortKey = N'dueDate' AND @SortDescending = 0) THEN f.DueDate END ASC,
        CASE WHEN @SortKey = N'dueDate' AND @SortDescending = 1 THEN f.DueDate END DESC,
        CASE WHEN @SortKey = N'subject' AND @SortDescending = 0 THEN f.Subject END ASC,
        CASE WHEN @SortKey = N'subject' AND @SortDescending = 1 THEN f.Subject END DESC,
        CASE WHEN @SortKey = N'activityType' AND @SortDescending = 0 THEN f.ActivityTypeId END ASC,
        CASE WHEN @SortKey = N'activityType' AND @SortDescending = 1 THEN f.ActivityTypeId END DESC,
        CASE WHEN @SortKey = N'status' AND @SortDescending = 0 THEN f.StatusId END ASC,
        CASE WHEN @SortKey = N'status' AND @SortDescending = 1 THEN f.StatusId END DESC,
        CASE WHEN @SortKey = N'priority' AND @SortDescending = 0 THEN f.PriorityId END ASC,
        CASE WHEN @SortKey = N'priority' AND @SortDescending = 1 THEN f.PriorityId END DESC,
        CASE WHEN @SortKey = N'memberName' AND @SortDescending = 0 THEN ISNULL(f.MemberName, N'') END ASC,
        CASE WHEN @SortKey = N'memberName' AND @SortDescending = 1 THEN ISNULL(f.MemberName, N'') END DESC,
        CASE WHEN @SortKey = N'assignedToName' AND @SortDescending = 0 THEN ISNULL(f.AssignedToName, N'') END ASC,
        CASE WHEN @SortKey = N'assignedToName' AND @SortDescending = 1 THEN ISNULL(f.AssignedToName, N'') END DESC,
        CASE WHEN @SortKey = N'createdDate' AND @SortDescending = 0 THEN f.CreatedDate END ASC,
        CASE WHEN @SortKey = N'createdDate' AND @SortDescending = 1 THEN f.CreatedDate END DESC,
        -- ActivityNumber is derived from ActivityId, so both sort the same way; the id is also the tie-breaker.
        CASE WHEN @SortKey <> N'' AND @SortDescending = 1 THEN f.ActivityId END DESC,
        f.ActivityId ASC
    OFFSET (@PageNumber - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;

    SELECT COUNT(*) AS TotalCount FROM #Filtered;
END
GO

-- RS1: the activity (0 or 1 row). RS2: its notes, oldest first (always returned).
CREATE OR ALTER PROCEDURE dbo.usp_Activity_GetById
    @ActivityId int
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        a.ActivityId, a.ActivityNumber,
        a.MemberId, v.MemberNumber, v.MemberName,
        a.TakebackId, v.TakebackNumber,
        a.ActivityTypeId, a.StatusId, a.PriorityId,
        a.Subject, a.Description,
        a.AssignedToUserId, v.AssignedToName,
        a.DueDate, a.CompletedDate, a.Outcome, v.IsOverdue,
        a.CreatedByUserId, cu.DisplayName AS CreatedByName, a.CreatedDate,
        a.ModifiedByUserId, mu.DisplayName AS ModifiedByName, a.ModifiedDate,
        a.RowVersion
    FROM dbo.Activity AS a
    INNER JOIN dbo.vActivityList AS v ON v.ActivityId = a.ActivityId
    INNER JOIN dbo.AppUser AS cu ON cu.UserId = a.CreatedByUserId
    LEFT JOIN dbo.AppUser AS mu ON mu.UserId = a.ModifiedByUserId
    WHERE a.ActivityId = @ActivityId;

    SELECT n.NoteId, n.ActivityId, n.NoteText, n.IsSystem, n.CreatedByUserId, u.DisplayName AS CreatedByName, n.CreatedDate
    FROM dbo.ActivityNote AS n
    INNER JOIN dbo.AppUser AS u ON u.UserId = n.CreatedByUserId
    WHERE n.ActivityId = @ActivityId
    ORDER BY n.NoteId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Activity_Insert
    @MemberId         int            = NULL,
    @TakebackId       int            = NULL,
    @ActivityTypeId   int,
    @StatusId         int,
    @PriorityId       int,
    @Subject          nvarchar(200),
    @Description      nvarchar(4000) = NULL,
    @AssignedToUserId int            = NULL,
    @DueDate          date           = NULL,
    @CompletedDate    datetime2(0)   = NULL,
    @Outcome          nvarchar(1000) = NULL,
    @UserId           int
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.Activity
        (MemberId, TakebackId, ActivityTypeId, StatusId, PriorityId, Subject, Description,
         AssignedToUserId, DueDate, CompletedDate, Outcome, CreatedByUserId)
    VALUES
        (@MemberId, @TakebackId, @ActivityTypeId, @StatusId, @PriorityId, @Subject, @Description,
         @AssignedToUserId, @DueDate, @CompletedDate, @Outcome, @UserId);

    SELECT CAST(SCOPE_IDENTITY() AS int) AS ActivityId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Activity_Update
    @ActivityId       int,
    @MemberId         int            = NULL,
    @TakebackId       int            = NULL,
    @ActivityTypeId   int,
    @StatusId         int,
    @PriorityId       int,
    @Subject          nvarchar(200),
    @Description      nvarchar(4000) = NULL,
    @AssignedToUserId int            = NULL,
    @DueDate          date           = NULL,
    @CompletedDate    datetime2(0)   = NULL,
    @Outcome          nvarchar(1000) = NULL,
    @RowVersion       varbinary(8),
    @UserId           int
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.Activity
    SET MemberId = @MemberId,
        TakebackId = @TakebackId,
        ActivityTypeId = @ActivityTypeId,
        StatusId = @StatusId,
        PriorityId = @PriorityId,
        Subject = @Subject,
        Description = @Description,
        AssignedToUserId = @AssignedToUserId,
        DueDate = @DueDate,
        CompletedDate = @CompletedDate,
        Outcome = @Outcome,
        ModifiedByUserId = @UserId,
        ModifiedDate = SYSUTCDATETIME()
    WHERE ActivityId = @ActivityId
      AND RowVersion = @RowVersion;

    IF @@ROWCOUNT = 0
    BEGIN
        IF EXISTS (SELECT 1 FROM dbo.Activity WHERE ActivityId = @ActivityId)
            THROW 50002, N'The activity was changed by another user.', 1;

        THROW 50001, N'Activity not found.', 1;
    END
END
GO

-- Notes never touch the activity row, so adding a note does not change its RowVersion.
CREATE OR ALTER PROCEDURE dbo.usp_Activity_AddNote
    @ActivityId int,
    @NoteText   nvarchar(2000),
    @IsSystem   bit,
    @UserId     int
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Activity WHERE ActivityId = @ActivityId)
        THROW 50001, N'Activity not found.', 1;

    INSERT INTO dbo.ActivityNote (ActivityId, NoteText, IsSystem, CreatedByUserId)
    VALUES (@ActivityId, @NoteText, @IsSystem, @UserId);

    DECLARE @NoteId int = CAST(SCOPE_IDENTITY() AS int);

    SELECT n.NoteId, n.ActivityId, n.NoteText, n.IsSystem, n.CreatedByUserId, u.DisplayName AS CreatedByName, n.CreatedDate
    FROM dbo.ActivityNote AS n
    INNER JOIN dbo.AppUser AS u ON u.UserId = n.CreatedByUserId
    WHERE n.NoteId = @NoteId;
END
GO
