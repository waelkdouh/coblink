# Copilot instructions for COBLink

COBLink is an internal web app for **Activity Tracking** and **Takeback** (recoupment of claim payments, a Coordination of
Benefits domain). It is a deliberately **legacy-style baseline** (.NET 8, Angular 16 with NgModules, SQL Server stored
procedures, RPC-style API) that exists to practise modernizing an application with an agentic SDLC.

Read these first: `README.md` (architecture, legacy-to-target map, modernization backlog), `docs/api-reference.md`
(API contract and business rules), `database/README.md` (SQL conventions), `docs/modernization-playbook.md` (phases, gates, prompts).

## Ground rules

1. **Do not modernize unasked.** The legacy traits are intentional and listed in the README backlog. Fix what you were asked
   to fix in the style of the surrounding code. Do not upgrade packages, move to minimal hosting, add EF Core, standalone
   components, signals or System.Text.Json as a side effect of another task.
2. **Behaviour is pinned by tests and by `docs/api-reference.md`.** A change to a business rule, route, response shape, enum value
   or stored-procedure result set updates the code, the tests and that document in the same change. A contract test
   (`tests/CobLink.Api.Tests/SwaggerAndContractTests.cs`) parses the endpoint table of the document.
3. **Every change comes with tests**, and the affected suites are green before you finish. Never delete or weaken a test to make a
   change pass; if a test is wrong, say so and why.
4. **One concern per change** (for example "target framework to net10.0" is separate from "Microsoft.Data.SqlClient").
5. **No secrets in the repository.** Passwords come from environment variables or the git-ignored `.env`. The sample data is
   fictional and is never loaded into production.

## Repository map and layering

| Path | Role | May reference |
|---|---|---|
| `src/CobLink.Models` | POCOs, enums, request/response types, exceptions | nothing |
| `src/CobLink.Data` | ADO.NET repositories over stored procedures, `DatabaseDeployer` | Models |
| `src/CobLink.Business` | Services, `TakebackWorkflow`/`ActivityWorkflow` (state machine and permissions), validation, `ICurrentUser`, `IClock` | Models, Data |
| `src/CobLink.Api` | ASP.NET Core host: `Startup`, controllers, authentication, `ServiceResponse<T>`, `ApiExceptionFilter` | all of `src` |
| `tests/CobLink.TestSupport` | `TestWorld`: in-memory repositories, fixed clock, switchable fake user | src |
| `tests/CobLink.{Business,Api,Data}.Tests` | xUnit suites. Data.Tests needs a real SQL Server and only talks to the repository interfaces, so it is the behavioural contract for any new data-access implementation (`Infrastructure/DatabaseFixtures.cs`, `RepositorySet`) | src, TestSupport (Data.Tests: Models and Data only) |
| `tools/CobLink.DbDeploy` | Command line wrapper of `DatabaseDeployer` | Data |
| `database/` | `scripts/010..070` (schema, lookups, views, procedures), `sample-data/900_SampleData.sql` | |
| `client/` | Angular 16 app: `core/` (ApiService, services, guard, interceptor), `models/`, `shared/`, `layout/`, `features/{dashboard,activities,takebacks}` | |
| `deploy/web` | nginx image that serves the SPA and proxies `/api`, `/swagger`, `/health` | |

* Controllers are thin: one service call wrapped in `Success(...)`. No rules, no data access.
* Services validate, authorize (`_currentUser.Require()`) and apply rules. State and permission decisions go through the
  workflow classes, which also produce `AvailableActions`; do not duplicate those rules elsewhere, in the client either.
* Repositories call stored procedures only (no inline or dynamic SQL), open one connection per call and map SQL errors
  `50001`/`50002` to `NotFoundException`/`ConcurrencyException`.
* Failures are exceptions from `CobLink.Models` (`ValidationFailedException`, `BusinessRuleException`, `NotFoundException`,
  `ConcurrencyException`, `ForbiddenException`); `ApiExceptionFilter` turns them into the response envelope.
* The client reaches HTTP only through `core/api/api.service.ts`; features are lazy NgModules; shared pieces live in `SharedModule`.

## Commands

The repository pins the .NET 8 SDK (`global.json`, `rollForward: latestFeature`); install it next to newer SDKs.

```bash
dotnet build CobLink.sln
dotnet test CobLink.sln          # SQL-backed Data tests are skipped unless COBLINK_TEST_CONNECTION is set
COBLINK_TEST_CONNECTION='Server=localhost,1433;User Id=sa;Password=<password>;TrustServerCertificate=True' \
  dotnet test tests/CobLink.Data.Tests
cd client && npm ci && CHROME_BIN=/usr/bin/google-chrome npm run test:ci && npm run build:prod
cp .env.example .env && docker compose up --build     # then http://localhost:8080
```

Start a throwaway SQL Server with `docker run -d -p 1433:1433 -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD='<strong password>' mcr.microsoft.com/mssql/server:2022-latest`.
Run the Data tests in a non-UTC time zone as well (`TZ=America/Chicago dotnet test tests/CobLink.Data.Tests`).

## Conventions to preserve

* **C#**: Allman braces, 4 spaces, `_camelCase` private fields, block-scoped namespaces, explicit `using` directives
  (`ImplicitUsings` and `Nullable` are off in `Directory.Build.props`), synchronous repository and service methods.
  Use `IClock` for "now" and "today" in the business layer, never `DateTime.Now`.
* **TypeScript/Angular**: 2 spaces, single quotes, constructor injection with `private readonly`, `takeUntil(this.destroy$)`,
  new components are declared in their feature module, `*ngIf`/`*ngFor`, Reactive Forms, specs next to the code
  (helpers in `client/src/app/testing`). Server errors surface as `ApiError`; show messages through `NotificationService`.
* **SQL**: idempotent and re-runnable (`IF OBJECT_ID ... CREATE TABLE`, `CREATE OR ALTER` for views and procedures, `MERGE` for
  lookups, `IF COL_LENGTH(...) IS NULL ALTER TABLE` for new columns); batches end with a line that holds only `GO`; scripts start
  with `SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;`; result-set column names equal the model property names (enum-typed
  properties come back as `<Property>Id`); every status change writes its history row in the same transaction.
* **Enums live in three places**: `src/CobLink.Models/Enums.cs`, `client/src/app/models/enums.ts` and
  `database/scripts/020_Lookups.sql` (the views and procedures also contain the numbers). Change all of them together.
* **Wire format**: Newtonsoft camelCase, enums as numbers, `ServiceResponse<T>` envelope. Business failures are HTTP 200 with
  `success: false`; forbidden is 403. `rowVersion` is echoed unchanged on every write of an activity or takeback.
* **Time**: audit timestamps are UTC (`datetime2(0)`, `SYSUTCDATETIME()`); business dates are `date` without a time zone.
* The server's `availableActions` is the only source of truth for which buttons the client shows.

## Business rules that must not change silently

* An activity can be general (no member, no takeback), member-linked or takeback-linked (the member is then derived and must match).
* Edit, Complete and Cancel need an Open or InProgress activity and `CanModify`: Supervisors and Admins any activity, Analysts only
  their own (created by or assigned to).
* Takeback approval: Supervisor or Admin, never the creator; amounts above `Takeback:HighValueThreshold` (25,000) need an Admin.
  Sending the notice sets the due date to today plus `Takeback:ResponseWindowDays` (30).
* A recovery cannot exceed the outstanding amount; every status change and edit writes a history row.
* The demo data anchors used by tests (6 users, 19 members, 10 providers, 18 takebacks, 27 activities, 5 activities without a member) only
  change together with `SampleDataTests`, `DashboardRepositoryTests` and the dashboard figures in the docs.

## When asked to modernize

1. **Baseline first**: run every suite and note the result before touching code. Nothing may fail afterwards.
2. Follow the order of the README "Legacy to target" map and keep the repository green after each step.
3. Keep the public contract stable unless the task is the REST redesign. Then update `docs/api-reference.md`, the contract test and
   the Angular client in the same change (prefer generating the client from the OpenAPI document).
4. Prove equivalence with tests: write characterization tests before replacing a component (serializer, data provider, hosting), and
   let the existing tests pass unchanged afterwards.
5. Use the tools (`dotnet`, `ng update`, schematics, `npm`) rather than hand-editing lock files or generated code.
6. State what changed, why, and how it was verified in the pull request; list anything left undone.

## Security

* Windows (Negotiate) authentication is the production mode and a fallback policy requires an authenticated user. The header-based
  `Development` mode is refused outside Development, Testing and Demo; do not widen that.
* Error responses never carry exception details, only a trace id. Do not log secrets or member data.
