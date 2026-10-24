/*
    Reference-data procedures: users, lookups, members, providers.
    Result-set contract: column names equal the model property names, enum-typed properties come back as <Property>Id.
*/

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.usp_User_GetById
    @UserId int
AS
BEGIN
    SET NOCOUNT ON;

    SELECT UserId, UserName, DisplayName, Email, RoleId, IsActive
    FROM dbo.AppUser
    WHERE UserId = @UserId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_User_GetByUserName
    @UserName nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;

    -- The database collation is case-insensitive, so CORP\JDoe and corp\jdoe are the same user.
    SELECT UserId, UserName, DisplayName, Email, RoleId, IsActive
    FROM dbo.AppUser
    WHERE UserName = @UserName;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_User_GetActive
AS
BEGIN
    SET NOCOUNT ON;

    SELECT UserId, UserName, DisplayName, Email, RoleId, IsActive
    FROM dbo.AppUser
    WHERE IsActive = 1
    ORDER BY DisplayName, UserId;
END
GO

-- Seven result sets, always in this order: UserRoles, ActivityTypes, ActivityStatuses, ActivityPriorities,
-- TakebackReasons, TakebackStatuses, RecoveryMethods.
CREATE OR ALTER PROCEDURE dbo.usp_Lookup_GetAll
AS
BEGIN
    SET NOCOUNT ON;

    SELECT Id, Code, Name, SortOrder FROM dbo.LkpUserRole ORDER BY SortOrder, Id;
    SELECT Id, Code, Name, SortOrder FROM dbo.LkpActivityType ORDER BY SortOrder, Id;
    SELECT Id, Code, Name, SortOrder FROM dbo.LkpActivityStatus ORDER BY SortOrder, Id;
    SELECT Id, Code, Name, SortOrder FROM dbo.LkpActivityPriority ORDER BY SortOrder, Id;
    SELECT Id, Code, Name, SortOrder FROM dbo.LkpTakebackReason ORDER BY SortOrder, Id;
    SELECT Id, Code, Name, SortOrder FROM dbo.LkpTakebackStatus ORDER BY SortOrder, Id;
    SELECT Id, Code, Name, SortOrder FROM dbo.LkpRecoveryMethod ORDER BY SortOrder, Id;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Member_Search
    @Term nvarchar(100),
    @MaxResults int
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Like nvarchar(1700) = N'%' + dbo.fn_EscapeLike(@Term) + N'%';
    DECLARE @Top int = CASE WHEN @MaxResults IS NULL THEN 15 WHEN @MaxResults < 1 THEN 1 WHEN @MaxResults > 50 THEN 50 ELSE @MaxResults END;

    SELECT TOP (@Top) MemberId, MemberNumber, FirstName, LastName, DateOfBirth
    FROM dbo.Member
    WHERE MemberNumber LIKE @Like ESCAPE N'\'
       OR FirstName LIKE @Like ESCAPE N'\'
       OR LastName LIKE @Like ESCAPE N'\'
    ORDER BY LastName, FirstName, MemberId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Member_GetById
    @MemberId int
AS
BEGIN
    SET NOCOUNT ON;

    SELECT MemberId, MemberNumber, FirstName, LastName, DateOfBirth
    FROM dbo.Member
    WHERE MemberId = @MemberId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Provider_Search
    @Term nvarchar(100),
    @MaxResults int
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Like nvarchar(1700) = N'%' + dbo.fn_EscapeLike(@Term) + N'%';
    DECLARE @Top int = CASE WHEN @MaxResults IS NULL THEN 15 WHEN @MaxResults < 1 THEN 1 WHEN @MaxResults > 50 THEN 50 ELSE @MaxResults END;

    SELECT TOP (@Top) ProviderId, ProviderNumber, Name, Npi, City, State
    FROM dbo.Provider
    WHERE ProviderNumber LIKE @Like ESCAPE N'\'
       OR Name LIKE @Like ESCAPE N'\'
       OR Npi LIKE @Like ESCAPE N'\'
    ORDER BY Name, ProviderId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_Provider_GetById
    @ProviderId int
AS
BEGIN
    SET NOCOUNT ON;

    SELECT ProviderId, ProviderNumber, Name, Npi, City, State
    FROM dbo.Provider
    WHERE ProviderId = @ProviderId;
END
GO
