# COBLink database

SQL Server scripts for the COBLink baseline. There is **no migration framework**: the schema, lookup data, views and
stored procedures are plain `.sql` files that are *idempotent* (safe to run again) and are applied in file-name order.

> Target: SQL Server 2019 or later (developed and tested against SQL Server 2022, collation
> `SQL_Latin1_General_CP1_CI_AS`). The case-insensitive collation matters: `CORP\JDoe` and `corp\jdoe` must be the same user.

## Layout

| Path | Purpose | Re-run behaviour |
|------|---------|------------------|
| `scripts/010_Schema.sql` | 7 `Lkp*` lookup tables, `AppUser`, `Member`, `Provider`, `Takeback`, `TakebackRecovery`, `TakebackHistory`, `Activity`, `ActivityNote`, indexes | `IF OBJECT_ID(...) IS NULL CREATE TABLE ...` - existing tables are never altered |
| `scripts/020_Lookups.sql` | Lookup rows (`Id` = C# enum value, `Code` = enum name, `Name` = display text) | `MERGE` - inserts or corrects rows, never deletes |
| `scripts/030_Views.sql` | `fn_EscapeLike`, `vActivityList`, `vTakebackList` (derived columns defined once) | `CREATE OR ALTER` |
| `scripts/040_Procs_Reference.sql` | Users, lookups, member and provider search | `CREATE OR ALTER` |
| `scripts/050_Procs_Activity.sql` | Activity search/get/insert/update/add note | `CREATE OR ALTER` |
| `scripts/060_Procs_Takeback.sql` | Takeback search/get/insert/update/change status/add recovery | `CREATE OR ALTER` |
| `scripts/070_Procs_Dashboard.sql` | Dashboard summary (five result sets) | `CREATE OR ALTER` |
| `sample-data/900_SampleData.sql` | Fictional demo users, members, providers, takebacks and activities | Inserts only what is missing; work items only into an empty store |

Scripts are split into batches on lines that contain only `GO`. `DatabaseDeployer` (`src/CobLink.Data/Deployment`) does
the same, so each script runs exactly the way `sqlcmd` would run it.

The scripts start with `SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;`. That is required for the persisted computed
columns (`ActivityNumber`, `TakebackNumber`); `sqlcmd` defaults to `QUOTED_IDENTIFIER OFF`, ADO.NET to `ON`.

## Deploying

The API can deploy the database when it starts (`Database:AutoDeploy`, `Database:SeedSampleData`; both are `true` in
`appsettings.Development.json` and `appsettings.Demo.json`, and off otherwise). The same code is available as a command line
tool:

```bash
# schema + procedures only
dotnet run --project tools/CobLink.DbDeploy -- --connection "Server=localhost,1433;Database=CobLink;User Id=sa;Password=<password>;TrustServerCertificate=True"

# plus the demo data
dotnet run --project tools/CobLink.DbDeploy -- --connection "<connection string>" --sample-data

# drop and recreate the database first (asks for --yes; refuses unless you are sure)
dotnet run --project tools/CobLink.DbDeploy -- --connection "<connection string>" --sample-data --recreate --yes
```

The connection string can also come from the `ConnectionStrings__CobLink` or `COBLINK_CONNECTION` environment variable.
The tool creates the database when it does not exist, waits for the server to accept connections (a freshly started
container needs a minute), applies `scripts/*.sql` in order and, with `--sample-data`, `sample-data/*.sql`. Exit codes:
`0` success, `1` a script failed, `2` bad arguments.

Manual alternative with `sqlcmd` (apply the files in order, `-b` stops on the first error):

```bash
for f in database/scripts/*.sql database/sample-data/*.sql; do
  sqlcmd -S localhost,1433 -U sa -P "<password>" -d CobLink -C -b -i "$f" || break
done
```

### Windows authentication needs a user row

Users come from the `AppUser` table, not from Active Directory. A database deployed **without** the sample data has no users,
and the API answers `403 Forbidden` to every call until your identity exists. Add at least one administrator:

```sql
INSERT INTO dbo.AppUser (UserName, DisplayName, Email, RoleId, IsActive)
VALUES (N'YOURDOMAIN\your.name', N'Your Name', N'your.name@example.com', 3, 1);  -- RoleId 1 Analyst, 2 Supervisor, 3 Admin
```

`UserName` must match the Windows identity (`DOMAIN\user`) exactly apart from case.

## Conventions

* `dbo` schema, singular PascalCase table names, `<Table>Id` identity keys.
* **Lookups mirror the enums.** `Lkp*.Id` equals the C# enum value (`src/CobLink.Models/Enums.cs`) and the TypeScript enum
  (`client/src/app/models/enums.ts`); change all three together. The views and procedures contain the enum numbers
  (for example `StatusId IN (1, 2)` for "open"), with a comment saying what they mean.
* **Timestamps are UTC** (`datetime2(0)`, `SYSUTCDATETIME()`); business dates (`DueDate`, `NoticeDate`, `DateOfService`,
  `RecoveryDate`, `DateOfBirth`) are plain `date`.
* **Optimistic concurrency** with a `rowversion` column on `Activity` and `Takeback`. The update procedures compare it and
  raise error 50002 when it is stale (or `NULL`).
* **Display numbers** `ACT-000001` / `TB-000001` are persisted computed columns over the identity key.
* **"Today"** in the views and the dashboard is `GETDATE()` (the database server's local date). The business layer's `IClock`
  is not consulted; fine while both run in one time zone. Documented as modernization backlog in the root README.
* No dynamic SQL. Sorting uses a whitelisted camelCase key (`@SortBy`) mapped to `ORDER BY CASE ...`; an unknown or `NULL` key
  falls back to the default order. Text filters are literal "contains" matches: `%`, `_`, `[` and `\` in the search text are
  escaped by `dbo.fn_EscapeLike`. `@PageSize` is clamped to 1-100 and `@PageNumber` to at least 1.

## Stored procedure contract

Result-set column names equal the model property names in `src/CobLink.Models`; enum-typed properties come back as
`<Property>Id`. Repository classes in `src/CobLink.Data/Sql` read them by name.

| Procedure | Result sets | Notes |
|-----------|-------------|-------|
| `usp_User_GetById`, `usp_User_GetByUserName`, `usp_User_GetActive` | users | `GetByUserName` is case-insensitive |
| `usp_Lookup_GetAll` | 7: roles, activity types, statuses, priorities, takeback reasons, statuses, recovery methods | always in this order |
| `usp_Member_Search`, `usp_Provider_Search` | top `@MaxResults` (clamped to at least 1) ordered by name | blank term returns the first rows |
| `usp_Member_GetById`, `usp_Provider_GetById` | 0 or 1 row | |
| `usp_Activity_Search` | page of `vActivityList` rows, then `TotalCount` | default order: due date ascending, undated last |
| `usp_Activity_GetById` | activity, then its notes (oldest first) | 0 rows when not found |
| `usp_Activity_Insert` | new `ActivityId` | the business layer then calls `usp_Activity_AddNote` for the system notes (`Activity created.`, `Assigned to ...`); the two calls are separate transactions (a baseline shortcut) |
| `usp_Activity_Update` | none | `50001` not found, `50002` stale row version; the repository re-reads with `GetById` |
| `usp_Activity_AddNote` | the new note | does not change the activity row version; `50001` when the activity is missing |
| `usp_Takeback_Search` | page of `vTakebackList` rows, then `TotalCount` | default order: newest first |
| `usp_Takeback_GetById` | takeback, recoveries, history | 0 rows when not found |
| `usp_Takeback_ActiveExists` | one bit | same claim and provider, any status except Rejected and Cancelled |
| `usp_Takeback_Insert` | new `TakebackId` | writes the `Create` history row in the same transaction |
| `usp_Takeback_Update` | none | writes an `Edit` history row; `50001` / `50002` |
| `usp_Takeback_ChangeStatus` | none | status change, approval/notice/due-date fields and the history row in one transaction; `50001` / `50002` |
| `usp_Takeback_AddRecovery` | none | recovery row, new `RecoveredAmount`, status change and history in one transaction; `50001` / `50002` |
| `usp_Dashboard_GetSummary` | 5: figures, activities by status, takebacks by status, upcoming activities of the user, newest takebacks | only statuses that have rows are returned |

### Errors

| Error | Meaning | Mapped by the data layer to |
|-------|---------|------------------------------|
| `THROW 50001` | row not found | `NotFoundException` -> envelope `success:false`, code `NOT_FOUND` |
| `THROW 50002` | row version mismatch | `ConcurrencyException` -> envelope `success:false`, code `CONCURRENCY` |
| `547` (CHECK / FK) | constraint violation, for example recovering more than the takeback amount | surfaced as a server error; the business layer normally prevents it |

The writing procedures use `BEGIN TRY / BEGIN TRANSACTION ... COMMIT / BEGIN CATCH ROLLBACK; THROW`. A failure, including
`50001`/`50002` and constraint errors, therefore leaves nothing behind and does not leave a doomed transaction for a T-SQL
caller that has its own `TRY/CATCH`.

## Sample data

`900_SampleData.sql` is fictional and for demos and tests only. Never load it into production.

| Persona (`UserName`) | Display name | Role |
|----------------------|--------------|------|
| `CORP\jdoe` | Jamie Doe | Analyst |
| `CORP\asmith` | Alex Smith | Analyst |
| `CORP\bwilson` | Blake Wilson | Supervisor |
| `CORP\mlee` | Morgan Lee | Supervisor |
| `CORP\admin` | Casey Admin | Administrator |
| `CORP\retired` | Robin Retired | Analyst, inactive |

* 19 members (`M000101`-`M000119`) and 10 providers (`P10001`-`P10010`).
* 18 takebacks that cover every status (draft through recovered, written off, disputed, rejected, cancelled), including a high-value
  one (31,500.00) that only an administrator can approve and two that are past their response date.
* 27 activities covering all ten types and all four statuses, three open ones overdue, some without a due date or assignee.
* Every date is relative to the day you run the script, so the demo never looks stale. The takeback history, recoveries,
  current status, approver and notice/due dates are all derived from one step list in the script, so they cannot disagree.
* Dates and the history text follow what the business layer writes, for example `Recovered 620.00 by Eft.`

Expected dashboard figures right after seeding: 3 takebacks pending approval, 7 active, 2 overdue; 21 open activities, 3 overdue.

## When you change the database

1. Add a new numbered script (or edit the owning `CREATE OR ALTER` script for procedures and views). Keep it idempotent: guard
   `CREATE TABLE` with `IF OBJECT_ID`, add columns with `IF COL_LENGTH(...) IS NULL ALTER TABLE ...`.
2. Keep result-set column names equal to the model property names; update `src/CobLink.Data/Sql` and `docs/api-reference.md`.
3. Run `dotnet test tests/CobLink.Data.Tests` against a scratch database (see the root README, *Testing*).
