/*
    Dashboard summary: five result sets in one round trip. Definitions follow docs/api-reference.md section 5.
    Enum values used below: ActivityStatus 1 Open, 2 InProgress.
    TakebackStatus 2 PendingApproval, 3 Approved, 5 NoticeSent, 6 PartiallyRecovered, 7 Recovered, 8 Disputed.
*/

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- RS1 scalar figures (one row), RS2 activities by status, RS3 takebacks by status, RS4 up to five upcoming open
-- activities of @UserId (undated last), RS5 the five newest takebacks.
CREATE OR ALTER PROCEDURE dbo.usp_Dashboard_GetSummary
    @UserId int
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Today date = CAST(GETDATE() AS date);

    SELECT
        (SELECT COUNT(*) FROM dbo.Activity WHERE StatusId IN (1, 2) AND AssignedToUserId = @UserId) AS MyOpenActivities,
        (SELECT COUNT(*) FROM dbo.vActivityList WHERE IsOverdue = 1 AND AssignedToUserId = @UserId) AS MyOverdueActivities,
        (SELECT COUNT(*) FROM dbo.Activity WHERE StatusId IN (1, 2)) AS OpenActivities,
        (SELECT COUNT(*) FROM dbo.vActivityList WHERE IsOverdue = 1) AS OverdueActivities,
        (SELECT COUNT(*) FROM dbo.Activity
          WHERE StatusId IN (1, 2) AND DueDate >= @Today AND DueDate <= DATEADD(DAY, 7, @Today)) AS ActivitiesDueThisWeek,
        (SELECT COUNT(*) FROM dbo.Takeback WHERE StatusId = 2) AS TakebacksPendingApproval,
        (SELECT COUNT(*) FROM dbo.Takeback WHERE StatusId IN (5, 6, 8)) AS ActiveTakebacks,
        (SELECT COUNT(*) FROM dbo.vTakebackList WHERE IsOverdue = 1) AS OverdueTakebacks,
        ISNULL((SELECT SUM(TakebackAmount) FROM dbo.Takeback WHERE StatusId IN (3, 5, 6, 7, 8)), 0) AS TotalTakebackAmount,
        ISNULL((SELECT SUM(RecoveredAmount) FROM dbo.Takeback WHERE StatusId IN (3, 5, 6, 7, 8)), 0) AS TotalRecoveredAmount;

    SELECT StatusId, COUNT(*) AS [Count]
    FROM dbo.Activity
    GROUP BY StatusId
    ORDER BY StatusId;

    SELECT StatusId, COUNT(*) AS [Count], SUM(TakebackAmount) AS Amount
    FROM dbo.Takeback
    GROUP BY StatusId
    ORDER BY StatusId;

    SELECT TOP (5)
        ActivityId, ActivityNumber, Subject, ActivityTypeId, StatusId, PriorityId,
        MemberId, MemberNumber, MemberName, TakebackId, TakebackNumber,
        AssignedToUserId, AssignedToName, DueDate, CompletedDate, IsOverdue, CreatedDate
    FROM dbo.vActivityList
    WHERE AssignedToUserId = @UserId
      AND StatusId IN (1, 2)
    ORDER BY CASE WHEN DueDate IS NULL THEN 1 ELSE 0 END, DueDate, ActivityId;

    SELECT TOP (5)
        TakebackId, TakebackNumber, ClaimNumber, MemberId, MemberNumber, MemberName,
        ProviderId, ProviderName, ReasonId, StatusId, TakebackAmount, RecoveredAmount,
        NoticeDate, DueDate, IsOverdue, CreatedByName, CreatedDate
    FROM dbo.vTakebackList
    ORDER BY CreatedDate DESC, TakebackId DESC;
END
GO
