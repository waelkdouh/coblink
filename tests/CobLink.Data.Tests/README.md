# CobLink.Data.Tests

Tests of everything below the business layer: the ADO.NET repositories, the stored procedures and views, the demo
data and the deployer that builds the database. They run against a **real SQL Server** (no mocks, no LocalDB): the
logic of this application lives largely in T-SQL, so a fake would test nothing.

## Run them

```bash
# 1. A SQL Server whose login may create and drop databases. Docker is the quickest way:
docker run -d --name coblink-sql -p 1433:1433 \
  -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD='<choose a strong password>' \
  mcr.microsoft.com/mssql/server:2022-latest

# 2. Tell the tests where it is (the Database= entry, if any, is ignored)
export COBLINK_TEST_CONNECTION='Server=localhost,1433;User Id=sa;Password=<the same password>;TrustServerCertificate=True'

# 3. Run
dotnet test tests/CobLink.Data.Tests
```

Without `COBLINK_TEST_CONNECTION` the SQL tests are reported as **skipped** (xUnit 2 cannot skip at run time, so
`[SqlFact]`/`[SqlTheory]` set `Skip` when the variable is missing) and the tests that need no server still run:
batch splitting, folder discovery, argument checks, DI registration, the behaviour against a server that is not
there. That makes `dotnet test` on the whole solution safe on a machine without SQL Server.

Run the suite in another time zone as well; one test only proves anything when the machine is not on UTC:

```bash
TZ=America/Chicago dotnet test tests/CobLink.Data.Tests
```

## How it is organised

* **One scratch database per test collection**, named `CobLinkTest_<random>`, created by the *real* deployer from the
  *real* `database/scripts` (and `database/sample-data`) and dropped afterwards. Editing a script takes effect on the
  next run without rebuilding. A crashed run can leave databases behind: drop the ones named `CobLinkTest_*`.
* **Seeded (read only)** collection (`SeededDatabaseFixture`): the demo data exactly as the script leaves it, so tests
  can assert the documented numbers (27 activities, 18 takebacks, 6 users, ...). Nothing in it is ever changed.
* **Working (read and write)** collection (`WorkingDatabaseFixture`): demo data for tests that write. Each test
  creates its own rows with unique claim numbers/subjects and never relies on totals.
* **Server time, not machine time.** `IsOverdue`, "due this week" and the sample data are relative to the SQL Server
  clock (`GETDATE()`), so tests ask the server (`ServerToday()`, `ServerUtcNow()`). The only residual flake risk is the
  date rolling over in the middle of a run.
* Timestamps leave the data layer as UTC; `Update_converts_a_local_completion_time_to_utc` guards the conversion.

| File | Covers |
|---|---|
| `LookupRepositoryTests` | Lookup tables match the C# enums one to one; member and provider search |
| `UserRepositoryTests` | Lookup by id and Windows name (case-insensitive), roles, inactive users |
| `ActivityRepositoryReadTests` | Search (paging, every filter, text search with wildcards and injection attempts, all sort keys), `GetById`, notes |
| `ActivityRepositoryWriteTests` | Insert, update (completion details, UTC conversion), notes, optimistic concurrency, missing rows, foreign-key errors |
| `TakebackRepositoryReadTests` | The same for takebacks, including `IsOverdue`, amounts, due dates, history, recoveries, available actions |
| `TakebackRepositoryWriteTests` | Insert, update, status changes (approver, notice and due-date stamps), recoveries, history entries, all-or-nothing rollbacks, concurrency, duplicate check |
| `DashboardRepositoryTests` | Every dashboard figure, cross-checked against what the search repositories return |
| `SampleDataTests` | The demo data tells a consistent story: amounts add up, histories are continuous, nothing lies in the future |
| `DatabaseDeployerTests` | `GO` splitting, folder discovery, ordering, idempotence, failures, quoting, UTF-8, real scripts end to end |
| `SqlDatabaseStatusTests` | The `/health` probe: connected, database missing, server down, never throws |
| `DataServiceCollectionExtensionsTests` | What `AddCobLinkData` registers |

`Infrastructure/` holds the fixtures (`RepositorySet`, `SeededDatabaseFixture`, `WorkingDatabaseFixture`),
`TestDatabase` (scratch database, plain SQL for arranging and checking) and `TempDatabaseFolder` (tiny scripts for
deployer tests).

## Reusing these tests when the data layer is rewritten

The repository tests only talk to the interfaces in `CobLink.Data.Repositories`. `RepositorySet` is the single place
that names the ADO.NET implementation. When the data layer moves to Microsoft.Data.SqlClient, async methods or
EF Core, change that one class (and the interfaces, if they become async) and run the suite: it is the behavioural
contract the new implementation has to meet, with the old implementation as the proof that the contract is right.

Some tests pin *legacy* behaviour on purpose and are expected to change with the rewrite:

* constraint and foreign-key violations surface as a raw `SqlException` (error 547); a new layer will probably
  translate them;
* `DatabaseDeployerTests`, `SqlDatabaseStatusTests` and `DataServiceCollectionExtensionsTests` describe the
  hand-rolled deployer, the `System.Data.SqlClient` probe and the singleton registrations.

Two legacy traps are *not* covered by a test and worth knowing before the rewrite: ADO.NET silently truncates a string
parameter longer than its declared size (lengths must be validated before the call, which the business layer does),
and `datetime2(0)` columns round fractional seconds.
