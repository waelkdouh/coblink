/*
    Shared read models used by the search/detail/dashboard procedures, so derived columns (member name, overdue flag,
    display names) are defined once.

    Magic numbers below are the enum values of CobLink.Models (kept in sync by hand, see 020_Lookups.sql):
      ActivityStatus : 1 Open, 2 InProgress, 3 Completed, 4 Cancelled
      TakebackStatus : 1 Draft, 2 PendingApproval, 3 Approved, 4 Rejected, 5 NoticeSent, 6 PartiallyRecovered,
                       7 Recovered, 8 Disputed, 9 WrittenOff, 10 Cancelled

    "Today" is the database server's local date (GETDATE()). The business layer's IClock is not consulted, which is
    fine while the server and the application run in the same time zone (see the modernization backlog in README.md).
*/

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Escapes LIKE wildcards so user input is always matched literally (use with ESCAPE N'\').
CREATE OR ALTER FUNCTION dbo.fn_EscapeLike (@Value nvarchar(400))
RETURNS nvarchar(1600)
AS
BEGIN
    RETURN REPLACE(REPLACE(REPLACE(REPLACE(@Value, N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[');
END
GO

CREATE OR ALTER VIEW dbo.vActivityList
AS
SELECT
    a.ActivityId,
    a.ActivityNumber,
    a.Subject,
    a.Description,
    a.ActivityTypeId,
    a.StatusId,
    a.PriorityId,
    a.MemberId,
    m.MemberNumber,
    CASE WHEN m.MemberId IS NULL THEN NULL ELSE m.LastName + N', ' + m.FirstName END AS MemberName,
    a.TakebackId,
    t.TakebackNumber,
    a.AssignedToUserId,
    au.DisplayName AS AssignedToName,
    a.DueDate,
    a.CompletedDate,
    CAST(CASE WHEN a.DueDate < CAST(GETDATE() AS date) AND a.StatusId IN (1, 2) THEN 1 ELSE 0 END AS bit) AS IsOverdue,
    a.CreatedDate
FROM dbo.Activity AS a
LEFT JOIN dbo.Member AS m ON m.MemberId = a.MemberId
LEFT JOIN dbo.Takeback AS t ON t.TakebackId = a.TakebackId
LEFT JOIN dbo.AppUser AS au ON au.UserId = a.AssignedToUserId;
GO

CREATE OR ALTER VIEW dbo.vTakebackList
AS
SELECT
    t.TakebackId,
    t.TakebackNumber,
    t.ClaimNumber,
    t.MemberId,
    m.MemberNumber,
    m.LastName + N', ' + m.FirstName AS MemberName,
    t.ProviderId,
    p.ProviderNumber,
    p.Name AS ProviderName,
    t.ReasonId,
    t.StatusId,
    t.TakebackAmount,
    t.RecoveredAmount,
    t.NoticeDate,
    t.DueDate,
    CAST(CASE WHEN t.DueDate < CAST(GETDATE() AS date) AND t.StatusId IN (5, 6) THEN 1 ELSE 0 END AS bit) AS IsOverdue,
    t.CreatedByUserId,
    cu.DisplayName AS CreatedByName,
    t.CreatedDate
FROM dbo.Takeback AS t
INNER JOIN dbo.Member AS m ON m.MemberId = t.MemberId
INNER JOIN dbo.Provider AS p ON p.ProviderId = t.ProviderId
INNER JOIN dbo.AppUser AS cu ON cu.UserId = t.CreatedByUserId;
GO
