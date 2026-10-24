# COBLink

[![CI](https://github.com/waelkdouh/coblink/actions/workflows/ci.yml/badge.svg)](https://github.com/waelkdouh/coblink/actions/workflows/ci.yml)

**COBLink** is an internal, browser-based application for the operations staff of a health plan. It has two functions:

* **Activity Tracking** – log, assign, work and close the calls, letters, verifications and reviews behind Coordination of
  Benefits (COB) work.
* **Takeback** – manage the recoupment ("takeback") of money that was paid on a claim, from draft through approval, notice,
  recovery, dispute and write-off.

This repository is a **modernization baseline**. It is a working, tested and intentionally *legacy-style* application built on
**Angular + C# + SQL Server**, prepared so that it can be upgraded with an **agentic SDLC** (AI agents doing the work, people
reviewing it, tests and CI as the quality gate) to **C# + Angular + REST API + .NET 10**. This README describes the architecture
as it is today and how every part maps to the target.

> **Sample code, not a product.** The baseline is deliberately a few generations behind: .NET 8 (end of support on
> 10 November 2026), Angular 16 (out of support), ADO.NET with the deprecated `System.Data.SqlClient`, an RPC-style API.
> The data is fictional and the container demo uses header-based demo sign-in. Do not expose it to a network you do not control.

## Contents

1. [What COBLink does](#1-what-coblink-does)
2. [Quick start](#2-quick-start)
3. [Architecture](#3-architecture)
4. [Technology stack: baseline and target](#4-technology-stack-baseline-and-target)
5. [Repository layout](#5-repository-layout)
6. [Configuration](#6-configuration)
7. [Testing](#7-testing)
8. [Modernization with an agentic SDLC](#8-modernization-with-an-agentic-sdlc)
9. [Known limitations and assumptions](#9-known-limitations-and-assumptions)
10. [Documentation index](#10-documentation-index)

---

## 1. What COBLink does

**Domain in one paragraph.** *Coordination of Benefits* (COB) decides which health plan pays first when a member has more than
one coverage. When a claim has been paid and it later turns out that another carrier was primary, the plan recoups the payment
from the provider: that is a **takeback**. Staff chase the other carrier, the member and the provider through calls, letters
and reviews: those are **activities**. (The brief only said "Activity Tracking and Takeback functions"; reading COB as
Coordination of Benefits is an assumption. The code does not depend on the wording.)

### Roles

Users are rows in the `AppUser` table; the role comes from there, not from Active Directory groups.

| Role | What the role may do |
|---|---|
| **Analyst** | Works their own activities (created by or assigned to them) and adds notes to any. Creates takebacks, submits and cancels their own, sends notices, records recoveries and raises disputes on any. |
| **Supervisor** | Everything an analyst can do on **any** record, approves or rejects takebacks created by someone else up to the approval limit, resolves disputes and writes off. |
| **Admin** | Everything a supervisor can do, plus approving takebacks **above the approval limit** (default 25,000). |

### Capabilities

| Area | Screens and behaviour |
|---|---|
| **Dashboard** | KPI cards (my open and overdue activities, due this week, takebacks pending approval, active, total and recovered amounts), breakdowns by status with drill-down links, my upcoming activities, newest takebacks. |
| **Activities** | Search, filter, sort and page; create and edit; link to a member and/or a takeback through type-ahead pickers (a *general* activity has neither); Complete (outcome required), Cancel (reason required) and Reopen; a note timeline with automatic system notes; overdue badges. |
| **Takebacks** | Search, filter, sort and page; create and edit a Draft or Rejected takeback; detail page with the amounts (takeback, recovered, outstanding), a status badge, workflow buttons that depend on the user and the state, recoveries, linked activities with *Add activity*, and the complete history. |
| **Takeback workflow** | Draft → Pending approval → Approved → Notice sent → Partially recovered / Recovered, plus Rejected, Disputed, Written off and Cancelled; separation of duties, high-value approval limit, recovery rules, optimistic concurrency. Full rules in [`docs/api-reference.md`](docs/api-reference.md). |
| **Administration** | None in the UI. Users, members and providers are data (see [`database/README.md`](database/README.md)). |

### Screenshots

Captured from the running demo (Docker Compose stack, fictional data).

![Dashboard](docs/images/dashboard.png)

![Takebacks list](docs/images/takebacks-list.png)

![Takeback detail with workflow actions](docs/images/takeback-detail-notice-sent.png)

![Activity detail](docs/images/activity-detail.png)

<details>
<summary>More screens: forms, dialogs and edge cases</summary>

| | |
|---|---|
| ![Activities list](docs/images/activities-list.png) | ![Activity form validation](docs/images/activity-form-validation.png) |
| ![Member picker](docs/images/member-picker.png) | ![Complete activity dialog](docs/images/activity-complete-dialog.png) |
| ![Takeback form](docs/images/takeback-form.png) | ![Takeback detail, draft](docs/images/takeback-detail-draft.png) |
| ![Record recovery dialog](docs/images/record-recovery-dialog.png) | ![Takeback detail, recovered](docs/images/takeback-detail-recovered.png) |
| ![Resolve dispute dialog](docs/images/resolve-dispute-dialog.png) | ![Concurrency conflict](docs/images/concurrency-conflict.png) |
| ![Persona switcher (demo sign-in)](docs/images/persona-switcher.png) | ![Access denied](docs/images/access-denied.png) |

</details>

---

## 2. Quick start

### Option A: everything in Docker (recommended)

Needs Docker with Compose v2 and at least 2 GB of memory for the SQL Server container.

```bash
cp .env.example .env        # then edit .env: set MSSQL_SA_PASSWORD (8+ characters, three of: upper, lower, digit, symbol)
docker compose up --build
```

Open **http://localhost:8080**. The first start takes a minute: SQL Server must become healthy, then the API creates the
database `CobLink` and loads the demo data.

| URL | What |
|---|---|
| http://localhost:8080 | The Angular app (nginx). `/api`, `/swagger` and `/health` are proxied to the API. |
| http://localhost:5080/swagger | Swagger UI of the API, direct |
| http://localhost:8080/health | Health probe (database reachable?) |

The compose file runs the API in the **Demo** environment: there is no login, and the navbar has a **persona switcher**
(Jamie Doe = Analyst, Blake Wilson = Supervisor, Casey Admin = Admin, ...). Switch persona to see the approval rules at work.
`docker compose down` stops the stack, `docker compose down -v` also deletes the database volume.

### Option B: local development with hot reload

Prerequisites: the **.NET 8 SDK** (`global.json` pins it; a machine with only a newer SDK needs the 8 SDK installed next to it),
**Node.js 18 or newer** with npm (CI and the web image use Node 22; Angular 16 officially supports Node 16/18, so newer
versions print a warning but work), and a SQL Server 2019+ (the Docker one below is the easiest).

```bash
# 1. SQL Server (any strong password; keep it out of the repository)
docker run -d --name coblink-sql -p 1433:1433 -e ACCEPT_EULA=Y \
  -e MSSQL_SA_PASSWORD='<strong password>' mcr.microsoft.com/mssql/server:2022-latest

# 2. API on http://localhost:5080 (Development: creates the database CobLink, loads the demo data, header sign-in, Swagger)
export ConnectionStrings__CobLink='Server=localhost,1433;Database=CobLink;User Id=sa;Password=<same password>;TrustServerCertificate=True'
dotnet run --project src/CobLink.Api

# 3. Angular dev server on http://localhost:4200 (proxies /api to the API)
cd client && npm ci && npm start
```

Visual Studio or Rider: open `CobLink.sln`, set `CobLink.Api` as the startup project (the launch profile uses port 5080).
On Windows with a local SQL Server and Integrated Security the connection string in `appsettings.json` works as it is.

### Database only

The API deploys the database itself in Development and Demo. Everywhere else use the command line tool or `sqlcmd`; see
[`database/README.md`](database/README.md) (including how to add the first administrator).

```bash
dotnet run --project tools/CobLink.DbDeploy -- --connection "<connection string>" [--sample-data] [--recreate --yes]
```

---

## 3. Architecture

COBLink is a classic **three-tier web application with a thin API layer**: an Angular single-page app, an ASP.NET Core API
split into four class libraries/projects by responsibility, and a SQL Server database that owns the data and a good part
of the set-based logic (stored procedures). It is built the way many enterprise line-of-business apps of the 2018-2022 era were
built, which is exactly what makes it a realistic modernization subject.

### 3.1 System context and deployment

```mermaid
flowchart LR
    user["Analyst / Supervisor / Admin<br/>(browser)"]
    ad["Active Directory<br/>Kerberos / NTLM"]

    subgraph web["web container (nginx)"]
        spa["Angular 16 SPA<br/>static files"]
        proxy["reverse proxy<br/>/api  /swagger  /health"]
    end

    subgraph api["api container (ASP.NET Core 8, Kestrel)"]
        host["Controllers -> Services -> Repositories"]
    end

    sql[("SQL Server 2022<br/>database CobLink<br/>tables, views, stored procedures")]

    user -->|"HTTP(S)"| spa
    user -->|"/api JSON"| proxy
    proxy --> host
    host -->|"ADO.NET, stored procedures"| sql
    ad -.->|"production sign-in (Windows auth)"| host
```

* **Same origin.** The SPA and the API are published under one host name (nginx here, IIS or a reverse proxy in a real
  deployment). All client URLs are relative and there is no CORS configuration.
* **Docker Compose** (`docker-compose.yml`) runs the three containers above for demos. `deploy/web/Dockerfile` builds the
  Angular app and serves it with nginx; `src/CobLink.Api/Dockerfile` publishes the API together with the `database/` scripts.
* **Production shape** (not provided as automation): API on Windows/IIS or Kestrel with Windows authentication, SQL Server
  with a login for the API's service account, `Database:AutoDeploy` off and the scripts deployed by `tools/CobLink.DbDeploy` or
  your release pipeline.

### 3.2 Solution structure and layering

```mermaid
flowchart TB
    subgraph client["client/  Angular 16"]
        ui["features, shared, layout<br/>(components, forms)"] --> core["core<br/>ApiService, typed services,<br/>guard, interceptor"]
    end

    core -->|"HTTP + ServiceResponse envelope"| apiProj

    subgraph server["src/  .NET 8"]
        apiProj["CobLink.Api<br/>controllers, authentication,<br/>envelope, exception filter"]
        biz["CobLink.Business<br/>services, workflows, validation,<br/>IClock, ICurrentUser"]
        dat["CobLink.Data<br/>repository interfaces,<br/>ADO.NET implementation, deployer"]
        mod["CobLink.Models<br/>POCOs, enums, requests,<br/>exceptions"]
        apiProj --> biz
        apiProj --> dat
        biz --> dat
        biz --> mod
        dat --> mod
        apiProj --> mod
    end

    dat -->|"EXEC usp_..."| db[("SQL Server<br/>database/scripts")]
```

| Project | Responsibility | Depends on |
|---|---|---|
| `src/CobLink.Models` | Plain data classes shared by every layer: entities, request and response types, `enum`s, paging types and the exception types that carry business failures. No logic, no dependencies. | none |
| `src/CobLink.Data` | `I*Repository` interfaces and their ADO.NET implementations that call **stored procedures only**. `DatabaseDeployer` applies the SQL scripts. | Models |
| `src/CobLink.Business` | The application: services (`ActivityService`, `TakebackService`, `DashboardService`, `LookupService`, `UserService`), the state machines and permission rules (`TakebackWorkflow`, `ActivityWorkflow`), validation, `IClock`, `ICurrentUser`, `TakebackOptions`. | Models, Data (interfaces) |
| `src/CobLink.Api` | The host: `Program`, `Startup`, the six controllers, authentication, the `ServiceResponse<T>` envelope, `ApiExceptionFilter`, Swagger, database bootstrapper. | Models, Data, Business |
| `tools/CobLink.DbDeploy` | Console wrapper around `DatabaseDeployer` (create or upgrade a database from the scripts). | Data |
| `tests/*` | Three xUnit projects plus `CobLink.TestSupport` (in-memory fakes). See [Testing](#7-testing). | src |
| `client/` | Angular app, built and tested independently with npm. | the HTTP contract only |
| `database/` | Idempotent T-SQL scripts and demo data. Not compiled; deployed. | |

**Rules of the layering** (the agent instructions in `.github/copilot-instructions.md` repeat them):

1. Dependencies point downwards only. Models know nothing; Data knows Models; Business knows Data's *interfaces*; the API wires everything up.
2. Controllers are thin: one service call wrapped in `ServiceResponse.Ok`. No rules and no data access in controllers.
3. All rules (validation, authorization, state transitions) live in the Business layer. The database enforces integrity (keys,
   `CHECK`s, transactions) but does not decide who may do what.
4. All SQL is in stored procedures; the C# code has no inline or dynamic SQL.
5. Business code never reads the clock or the HTTP context directly; it uses `IClock` and `ICurrentUser`, which the tests replace.
6. The client talks to the server only through `core/api/api.service.ts`.

### 3.3 Request lifecycle

A takeback approval, from click to database and back:

```mermaid
sequenceDiagram
    actor U as Supervisor (browser)
    participant C as Angular (TakebackService, ApiService)
    participant A as API pipeline (auth, MVC, ApiExceptionFilter)
    participant S as TakebackService
    participant W as TakebackWorkflow
    participant R as SqlTakebackRepository
    participant D as SQL Server

    U->>C: click Approve
    C->>A: POST /api/Takeback/Approve { takebackId, rowVersion, comment }
    A->>A: authenticate (Negotiate or demo header), fallback policy
    A->>S: Approve(request)
    S->>S: ICurrentUser.Require() (AppUser row, else 403)
    S->>R: GetById(id)
    R->>D: EXEC usp_Takeback_GetById
    S->>W: Require("Approve", takeback, user)
    Note right of W: wrong state, creator approving own record,<br/>or amount above the limit => exception
    S->>R: ChangeStatus(change, userId)
    R->>D: EXEC usp_Takeback_ChangeStatus (one transaction: update + history row)
    D-->>R: ok, or THROW 50002 when rowVersion is stale
    S->>R: GetById + linked activities
    S-->>A: Takeback with availableActions
    A-->>C: 200 { success: true, data }
    C-->>U: page refreshes, toast "Takeback TB-000007 was approved."
```

Failures take the same road in reverse: a repository or service throws a typed exception, `ApiExceptionFilter` converts it to the
envelope (`success: false`, `errorCode`, message, field errors), and `ApiService` turns the envelope into an `ApiError` that the
component shows (field errors on the form, a banner, a toast, or the concurrency panel).

### 3.4 Backend in detail

**API (`CobLink.Api`)**

* `Program.Main` uses the classic `CreateHostBuilder` and runs `DatabaseBootstrapper.Run` (applies the scripts when
  `Database:AutoDeploy` is on) before `host.Run()`. `Startup.ConfigureServices` / `Configure` register and order the pipeline:
  Swagger (Development, Demo, Testing) → routing → authentication → authorization → controllers.
* Controllers (`Activity`, `Takeback`, `Dashboard`, `Lookup`, `User`) derive from `ApiControllerBase`
  (`[Route("api/[controller]/[action]")]`): **RPC style**, reads are `GET`, everything with a body is `POST`. `HealthController`
  (`GET /health`, anonymous, not enveloped) is the exception.
* `ServiceResponse<T>` is the envelope of every response; `ApiExceptionFilter` maps `ValidationFailedException`,
  `BusinessRuleException`, `NotFoundException` and `ConcurrencyException` to HTTP 200 with `success: false`, `ForbiddenException`
  to 403, anything else to 500 with a trace id and no details. Model-binding problems become a 400 `BAD_REQUEST` envelope.
* JSON is Newtonsoft.Json (camelCase, enums as numbers, UTC timestamps with `Z`).
* `HttpCurrentUser` maps the authenticated Windows name to the `AppUser` row once per request; unknown or inactive users resolve
  to `null`, which the services turn into 403.

**Business (`CobLink.Business`)**

* Services follow one pattern: validate the request (`ValidationCollector`) → `ICurrentUser.Require()` → load → ask the workflow
  whether the action is allowed → persist through the repository → reload and attach `AvailableActions`.
* `TakebackWorkflow` and `ActivityWorkflow` are the single place that knows which action is allowed from which status for which
  role. The same decision produces the enforcement *and* the `availableActions` list the UI uses to show buttons.
* Options: `Takeback:HighValueThreshold` and `Takeback:ResponseWindowDays` (`TakebackOptions`).
* Everything is synchronous and in-process; there are no background jobs, queues or caches.

**Data (`CobLink.Data`)**

* `SqlHelper` opens one pooled connection per call, executes a stored procedure with typed parameters, and translates
  `THROW 50001` / `50002` into `NotFoundException` / `ConcurrencyException`. Mappers read result sets **by column name**, so
  the column names of the procedures are part of the contract (see `database/README.md`).
* `AddCobLinkData(connectionString)` registers five stateless singleton repositories and a health probe (`IDatabaseStatus`).
* `DatabaseDeployer` splits scripts on `GO` lines and applies `database/scripts/*.sql` (and optionally `sample-data/*.sql`) in
  file-name order. It is used by the API start-up, the `DbDeploy` tool and the Data tests.

### 3.5 Database

SQL Server owns the data, the integrity rules and the set-based queries. There is **no ORM and no migration framework**: the
schema, lookup data, views and stored procedures are idempotent `.sql` files applied in file-name order (details, conventions
and the stored-procedure contract: [`database/README.md`](database/README.md)).

```mermaid
erDiagram
    AppUser ||--o{ Takeback : "creates, approves, modifies"
    AppUser ||--o{ Activity : "creates, is assigned"
    AppUser ||--o{ ActivityNote : writes
    AppUser ||--o{ TakebackRecovery : records
    AppUser ||--o{ TakebackHistory : changes
    Member ||--o{ Takeback : "is subject of"
    Provider ||--o{ Takeback : "was paid"
    Member |o--o{ Activity : "about (optional)"
    Takeback |o--o{ Activity : "linked (optional)"
    Takeback ||--o{ TakebackRecovery : "recovered by"
    Takeback ||--o{ TakebackHistory : "audit trail"
    Activity ||--o{ ActivityNote : has

    AppUser {
        int UserId PK
        string UserName UK "Windows identity"
        string DisplayName
        int RoleId FK
        bit IsActive
    }
    Member {
        int MemberId PK
        string MemberNumber UK
        string FirstName
        string LastName
    }
    Provider {
        int ProviderId PK
        string ProviderNumber UK
        string Name
        string Npi
    }
    Takeback {
        int TakebackId PK
        string TakebackNumber "computed TB-000001"
        string ClaimNumber
        int MemberId FK
        int ProviderId FK
        int ReasonId FK
        int StatusId FK
        decimal TakebackAmount
        decimal RecoveredAmount
        date NoticeDate
        date DueDate
        rowversion RowVersion
    }
    TakebackRecovery {
        int RecoveryId PK
        int TakebackId FK
        decimal Amount
        date RecoveryDate
        int MethodId FK
    }
    TakebackHistory {
        int HistoryId PK
        int TakebackId FK
        string Action
        int FromStatusId FK
        int ToStatusId FK
    }
    Activity {
        int ActivityId PK
        string ActivityNumber "computed ACT-000001"
        int MemberId FK "optional"
        int TakebackId FK "optional"
        int ActivityTypeId FK
        int StatusId FK
        int PriorityId FK
        int AssignedToUserId FK
        date DueDate
        rowversion RowVersion
    }
    ActivityNote {
        int NoteId PK
        int ActivityId FK
        string NoteText
        bit IsSystem
    }
```

* **15 tables**: the eight above plus seven `Lkp*` lookup tables (user role, activity type/status/priority, takeback reason/status,
  recovery method) whose `Id` equals the C# enum value. **2 views** (`vActivityList`, `vTakebackList`, which define the derived
  columns such as overdue and outstanding once) and **21 stored procedures** (`usp_<Entity>_<Operation>`).
* Writes are atomic per procedure: a status change updates the takeback and inserts the `TakebackHistory` row in one
  transaction. Optimistic concurrency uses a `rowversion` column compared by the update procedures (`THROW 50002`).
* Money is `decimal(12, 2)`, audit timestamps are UTC `datetime2(0)`, business dates are `date`, display numbers
  (`ACT-000001`, `TB-000001`) are persisted computed columns.
* `database/sample-data/900_SampleData.sql` loads a fictional, internally consistent data set (6 users, 19 members, 10 providers,
  18 takebacks covering every status, 27 activities) whose dates are relative to the day it runs.

### 3.6 Frontend

```mermaid
flowchart TB
    subgraph shell["AppModule / LayoutModule"]
        app["AppComponent: navbar, router outlet, toast container, footer"]
    end
    guard["SessionGuard<br/>loads the session and the lookups before any route renders"]
    subgraph features["Lazy feature modules (loadChildren)"]
        dash["DashboardModule"]
        act["ActivitiesModule<br/>list, form, detail"]
        tb["TakebacksModule<br/>list, form, detail,<br/>recovery and dispute dialogs"]
    end
    shared["SharedModule<br/>pickers, modal, pager, badges, pipes, validators"]
    subgraph core["CoreModule (singletons)"]
        svc["ActivityService, TakebackService, DashboardService,<br/>LookupService, SessionService, NotificationService"]
        api["ApiService: the only HttpClient user<br/>unwraps ServiceResponse, throws ApiError"]
        icp["DevUserInterceptor<br/>adds X-CobLink-User in demo mode"]
    end
    app --> guard --> features
    features --> shared
    features --> svc --> api --> icp -->|"/api/..."| server["ASP.NET Core API"]
```

| Concern | How it is done |
|---|---|
| Structure | `core/` (singletons), `models/` (hand-mirrored C# types, enums, sort keys, envelope), `shared/` (`SharedModule`), `layout/`, `features/{dashboard,activities,takebacks}`, `testing/` (spec helpers). NgModules, class-based guard and interceptor, constructor injection. |
| Routing | `/dashboard`, `/activities` (`/new`, `/:id`, `/:id/edit`), `/takebacks` (`/new`, `/:id`, `/:id/edit`), `/access-denied`, wildcard 404. Feature modules are lazy. List filters, sort and page live in the URL query string, so dashboard links and the Back button restore the exact view. |
| API access | Components never see `HttpClient`. `ApiService` converts the envelope, HTTP errors, gateway pages and network loss into one `ApiError` (`status`, `errorCode`, `message`, `errors`). |
| State | No store. `SessionService` (current user, mode) and `LookupService` (lookup tables, cached with `shareReplay`) hold shared state; pages load their own data on entry. |
| Forms | Reactive Forms; server-side field errors are mapped back onto form controls; member, provider and takeback pickers are type-ahead `ControlValueAccessor` components with a "typed but not selected" validator. |
| Authorization in the UI | Buttons are shown from the record's `availableActions`, never from role checks. |
| Concurrency | A `CONCURRENCY` failure shows the *changed by another user* panel with a Reload button. |
| Dates | Date-only fields are calendar dates (`calendarDate` pipe, no time zone shifts); timestamps are shown in local time. |
| Styling | Bootstrap 5.3 and Bootstrap Icons, small custom modal (no Bootstrap JavaScript). |

### 3.7 Domain model and workflows

* **Activity** statuses: Open, InProgress, Completed, Cancelled. Edit, Complete and Cancel need an open activity; Reopen needs a closed one.
  Supervisors and Admins may change any activity, Analysts only those they created or are assigned to; anyone may add a note. Every
  action leaves a system note.
* **Takeback** lifecycle (the rules per action, field rules and duplicate check are in [`docs/api-reference.md`](docs/api-reference.md) §4):

```mermaid
stateDiagram-v2
    [*] --> Draft: Save (new)
    Draft --> PendingApproval: Submit
    Rejected --> PendingApproval: Submit
    PendingApproval --> Approved: Approve
    PendingApproval --> Rejected: Reject
    Approved --> NoticeSent: SendNotice
    NoticeSent --> PartiallyRecovered: RecordRecovery (outstanding > 0)
    PartiallyRecovered --> PartiallyRecovered: RecordRecovery (outstanding > 0)
    NoticeSent --> Recovered: RecordRecovery (outstanding = 0)
    PartiallyRecovered --> Recovered: RecordRecovery (outstanding = 0)
    NoticeSent --> Disputed: Dispute
    PartiallyRecovered --> Disputed: Dispute
    Disputed --> NoticeSent: ResolveDispute (upheld, nothing recovered)
    Disputed --> PartiallyRecovered: ResolveDispute (upheld, something recovered)
    Disputed --> Cancelled: ResolveDispute (overturned, nothing recovered)
    NoticeSent --> WrittenOff: WriteOff
    PartiallyRecovered --> WrittenOff: WriteOff
    Disputed --> WrittenOff: WriteOff
    Draft --> Cancelled: Cancel
    Rejected --> Cancelled: Cancel
    PendingApproval --> Cancelled: Cancel
    Approved --> Cancelled: Cancel
    Recovered --> [*]
    WrittenOff --> [*]
    Cancelled --> [*]
```

| Takeback action | Analyst | Supervisor | Admin |
|---|---|---|---|
| Save, Submit, Cancel | own takebacks | any | any |
| Approve, Reject | no | yes, never the creator, up to the limit | yes, never the creator, any amount |
| SendNotice, RecordRecovery, Dispute | yes | yes | yes |
| ResolveDispute, WriteOff | no | yes | yes |

### 3.8 Cross-cutting concerns

| Concern | How it works in the baseline | Where |
|---|---|---|
| Authentication | Windows (Negotiate) in production; header-based demo sign-in in Development, Demo and Testing only. A fallback policy requires an authenticated user for everything except `/health`. | `Startup.AddAuthentication`, `Infrastructure/Authentication.cs` |
| Authorization | Role and active flag from `AppUser`. `ICurrentUser.Require()` turns an unknown user into 403; the workflows decide per action. | `Business/Workflow`, `Infrastructure/HttpCurrentUser.cs` |
| Validation | Business layer, collected per field (`ValidationCollector`) and returned as `VALIDATION` errors; the client repeats the cheap checks for fast feedback; `CHECK` constraints are the last line. | `Business/Validation`, `Business/Services` |
| Error handling | Typed exceptions → envelope. Unexpected errors: 500 with a trace id, details only in the log. | `Infrastructure/ApiExceptionFilter.cs`, `client/.../api.service.ts` |
| Concurrency | `rowVersion` echoed on every write, compared in SQL, `CONCURRENCY` error, reload panel in the UI. | procedures, `shared/components/concurrency-panel` |
| Audit trail | `TakebackHistory` row for every create, edit and status change (same transaction); `ActivityNote` system notes; created/modified by and date columns. | `database/scripts/050`, `060` |
| Time | UTC for timestamps, `date` for business dates; the business layer uses `IClock`; the views and the dashboard use `GETDATE()` (see the backlog). | `Business/IClock.cs`, `database/scripts/030`, `070` |
| Configuration | `appsettings*.json` and environment variables; typed options for the takeback rules. | [Configuration](#6-configuration) |
| Logging and health | `ILogger` to the console (levels in `appsettings`); anonymous `GET /health` reports database reachability and version. | `Controllers/HealthController.cs` |
| Serialization | Newtonsoft camelCase, enums as numbers, decimals as numbers, `byte[]` as base64, date-only values without a zone. | `Startup.cs`, `docs/api-reference.md` §1 |
| Paging and sorting | Server side; page size 1-100; sort keys are a whitelist. | `Models/Paging.cs`, `usp_*_Search` |
| Enum mirroring | Enums exist in C#, TypeScript and the SQL lookup tables (and as numbers inside views and procedures) and are kept equal by hand and by tests. | `Models/Enums.cs`, `client/src/app/models/enums.ts`, `020_Lookups.sql` |
| Transport security | Same origin, so no CORS; nginx hides its version. TLS, security headers and a content security policy are *not* part of the baseline. | `deploy/web/nginx.conf` |

### 3.9 Where a change goes (a field's journey)

Adding a field to a takeback touches every layer, which is why a modernization agent needs a map and tests:

| Step | File(s) |
|---|---|
| Column | a new numbered script in `database/scripts` (`IF COL_LENGTH(...) IS NULL ALTER TABLE ...`) |
| Procedures and view | `060_Procs_Takeback.sql` (insert, update, get), `030_Views.sql` when it appears in a list |
| Model | `src/CobLink.Models/Takebacks.cs` |
| Data layer | `src/CobLink.Data/Sql/TakebackMapper.cs`, `SqlTakebackRepository.cs` (parameters) |
| Rules | `src/CobLink.Business/Services/TakebackService.cs` (validation, `Apply`) |
| Contract | `docs/api-reference.md` |
| Client | `client/src/app/models/models.ts`, `features/takebacks/takeback-form`, `takeback-detail` |
| Tests | the matching Business, Data and Api tests, the sample data if the field is shown in the demo, client specs |

### 3.10 Design decisions

| Decision | Why | Revisit when modernizing |
|---|---|---|
| N-tier with repository interfaces in `Data` | The business layer is testable with in-memory fakes; the data provider can be swapped without touching rules. | Interfaces could move into the business layer (clean architecture) once Data depends on it. |
| Stored procedures own SQL | Typical of the era; keeps set-based logic and transactions in the database. | Keep, wrap, or replace with EF Core/LINQ: the Data tests are the behavioural contract either way. |
| `availableActions` computed on the server | One source of truth for rules and UI; no duplicated permission logic in Angular. | Keep. In REST this becomes `_links` or a capabilities field. |
| Envelope with HTTP 200 for business failures | Simple client code: one shape to parse. | Replace with status codes and problem details. |
| `rowversion` optimistic concurrency | No locks across a user's think time. | Map to `ETag` / `If-Match` in REST. |
| Auto-deploy of scripts at start-up (Development and Demo) | Zero-friction demos and tests. | Production uses the CLI or a pipeline; consider migrations or DACPAC. |
| Same-origin deployment | No CORS, cookies and Windows auth just work. | Keep unless the API becomes a separate service. |
| Hand-mirrored enums and models | Keeps the baseline dependency-free and shows a real legacy pain point. | Generate the TypeScript client and enums from OpenAPI. |

---

## 4. Technology stack: baseline and target

| Area | Baseline (this repository) | Target of the modernization |
|---|---|---|
| Runtime and SDK | .NET 8 (`net8.0`), SDK 8.0.100 pinned in `global.json` | **.NET 10** (LTS), `net10.0` |
| Language | C# 12; `ImplicitUsings` and `Nullable` disabled; block-scoped namespaces | C# 14 defaults, nullable reference types enabled, implicit usings, file-scoped namespaces |
| Hosting | `Program` + `Startup` with `CreateHostBuilder`, MVC controllers | Minimal hosting (`WebApplication.CreateBuilder`), controllers or endpoints |
| API style | RPC routes `api/{Controller}/{Action}`, `ServiceResponse<T>` envelope, business failures as HTTP 200 | **REST**: resource URLs, HTTP verbs, 400/401/403/404/409/422, RFC 9457 problem details |
| JSON | Newtonsoft.Json via `Microsoft.AspNetCore.Mvc.NewtonsoftJson` 8.0.32 | `System.Text.Json` with the same wire shape (or a deliberate, documented change) |
| API documentation | Swashbuckle.AspNetCore 6.9.0 (+ Newtonsoft support) | Built-in OpenAPI (`Microsoft.AspNetCore.OpenApi`), generated TypeScript client |
| Data access | ADO.NET + `System.Data.SqlClient` 4.9.1 (deprecated), stored procedures, synchronous | `Microsoft.Data.SqlClient`, async end to end; EF Core 10 is an option to evaluate |
| Database | SQL Server 2022 (2019+ supported), idempotent T-SQL scripts, no migration tool | SQL Server 2022 or later / Azure SQL; scripts, EF Core migrations or DACPAC (a decision) |
| Authentication | Windows Negotiate + `AppUser` roles; header sign-in for demos | Same behaviour on .NET 10; Entra ID / OIDC is a later option |
| Frontend | **Angular 16.2**, NgModules, RxJS 7.8, TypeScript 5.1, zone.js, Bootstrap 5.3 | **Current Angular**: standalone components, signals, built-in control flow, `inject()`, the esbuild application builder |
| Frontend tests | Karma + Jasmine, 774 specs | Vitest (default of recent Angular releases) or Karma/Jasmine, a decision |
| Server tests | xUnit 2.9, `Microsoft.AspNetCore.Mvc.Testing` 8.0, real SQL Server for the Data tests | Same suites on .NET 10 |
| Build and CI | GitHub Actions: .NET 8, Node 22, SQL Server container | .NET 10 SDK, current Node LTS |
| Containers | `dotnet/aspnet:8.0`, `node:22-alpine`, `nginx:stable-alpine`, `mssql/server:2022-latest` | `dotnet/aspnet:10.0` |

---

## 5. Repository layout

```text
.
├── CobLink.sln                    Solution: 4 source projects, 1 tool, 4 test projects
├── global.json                    Pins the .NET 8 SDK (rollForward latestFeature)
├── Directory.Build.props          Target framework, language settings, version: one place for every project
├── docker-compose.yml             Demo stack: SQL Server + API (Demo environment) + nginx/Angular
├── .env.example                   Copy to .env and set MSSQL_SA_PASSWORD (.env is git-ignored)
├── .github/
│   ├── copilot-instructions.md    Repository instructions for Copilot agents
│   └── workflows/
│       ├── ci.yml                 Build, test and image build
│       └── copilot-setup-steps.yml  Prepares the Copilot cloud agent's environment (.NET 8, Node 22, restore)
├── src/
│   ├── CobLink.Models/            POCOs, enums, request/response types, exceptions
│   ├── CobLink.Data/              Repository interfaces, ADO.NET implementation (Sql/), DatabaseDeployer (Deployment/)
│   ├── CobLink.Business/          Services/, Workflow/, Validation/, IClock, ICurrentUser, TakebackOptions
│   └── CobLink.Api/               Program, Startup, Controllers/, Infrastructure/, appsettings*.json, Dockerfile
├── tests/
│   ├── CobLink.TestSupport/       In-memory repositories, fake clock and user (TestWorld)
│   ├── CobLink.Business.Tests/    Rules and workflows against the fakes
│   ├── CobLink.Api.Tests/         HTTP contract through WebApplicationFactory
│   └── CobLink.Data.Tests/        Repositories, scripts and sample data against a real SQL Server (own README)
├── tools/CobLink.DbDeploy/        Command line database deployer
├── database/
│   ├── scripts/                   010 schema, 020 lookups, 030 views, 040-070 stored procedures
│   ├── sample-data/               900_SampleData.sql (fictional demo data)
│   └── README.md                  Conventions and stored-procedure contract
├── client/                        Angular 16 app (own README): src/app/{core,models,shared,layout,features,testing}
├── deploy/web/                    Dockerfile and nginx.conf of the web container
└── docs/
    ├── api-reference.md           The API contract and business rules (parsed by a contract test)
    ├── modernization-playbook.md  Phased agentic-SDLC playbook with prompts and quality gates
    └── images/                    Screenshots used in this README
```

---

## 6. Configuration

Settings come from `appsettings.json`, then `appsettings.<Environment>.json`, then environment variables (a double underscore
replaces the colon: `Takeback__HighValueThreshold=50000`).

| Key | Default | Meaning |
|---|---|---|
| `ConnectionStrings:CobLink` | `Server=localhost,1433;Database=CobLink;Integrated Security=true;TrustServerCertificate=true;...` | SQL Server connection of the API |
| `Authentication:Mode` | `Windows` | `Windows` (Negotiate) or `Development` (header sign-in; only allowed in Development, Demo and Testing, otherwise the API refuses to start) |
| `Authentication:DevelopmentUser` | empty (`CORP\jdoe` in Development and Demo) | Identity used in Development mode when a request has no `X-CobLink-User` header |
| `Database:AutoDeploy` | `false` (`true` in Development and Demo) | Apply `database/scripts` when the API starts |
| `Database:SeedSampleData` | `false` (`true` in Development and Demo) | Also load the fictional demo data (refused outside Development, Demo and Testing) |
| `Takeback:HighValueThreshold` | `25000` | Takebacks above this amount need an Admin to approve |
| `Takeback:ResponseWindowDays` | `30` | Days from the notice to the due date |

| Environment | Authentication | Database auto-deploy | Swagger | Used for |
|---|---|---|---|---|
| Development | header (demo) | yes, with demo data | yes | `dotnet run` on a developer machine |
| Demo | header (demo) | yes, with demo data | yes | `docker compose` |
| Testing | header (demo) | no | yes | `WebApplicationFactory` in `CobLink.Api.Tests` |
| Production (default) | Windows | no | no | a real deployment |

| Port | Used by |
|---|---|
| 4200 | Angular dev server (`npm start`), proxies `/api`, `/health`, `/swagger` to 5080 |
| 5080 | API in development; Docker Compose publishes the API container's 8080 here |
| 8080 | Web container (nginx, container port 80) |
| 1433 | SQL Server (published to the host only in the local-development option) |

### Authentication

| Mode | Where | How a request is signed in |
|---|---|---|
| `Windows` (default) | Production | ASP.NET Core Negotiate (Kerberos or NTLM). The Windows name (`DOMAIN\user`) is matched, case-insensitively, to `AppUser.UserName`. |
| `Development` | Development, Demo, Testing | The `X-CobLink-User` header (for example `CORP\jdoe`), else `Authentication:DevelopmentUser`. No credentials: never reachable from an untrusted network. |

* A fallback policy requires an authenticated identity for everything except `GET /health`.
* The role and the active flag come from the `AppUser` table. An authenticated person who has no active row gets **403** and the
  client shows the *Access denied* page. A database deployed without the sample data therefore has no users: insert the first
  administrator as shown in [`database/README.md`](database/README.md#windows-authentication-needs-a-user-row).
* The persona switcher in the navbar appears only when the API reports `authenticationMode: "Development"`; the choice is kept in
  the browser (`localStorage['coblink.devUser']`) and sent as the header.
* The automated tests cover the guard rails of the Windows mode (Negotiate challenge, demo header ignored, every endpoint except
  `/health` needs a caller, Swagger off, Development mode refused elsewhere) but **not a real Kerberos or NTLM sign-in**, which needs
  a domain. Linux containers use the demo mode.

---

## 7. Testing

| Suite | Command | What it proves | Tests |
|---|---|---|---|
| Business | `dotnet test tests/CobLink.Business.Tests` | Rules, workflows, validation and permissions against in-memory repositories and a fixed clock | 333 |
| API | `dotnet test tests/CobLink.Api.Tests` | The HTTP contract in process: authentication, envelope, status codes, JSON shapes, the endpoint table of `docs/api-reference.md`, full workflows | 78 |
| Data | `dotnet test tests/CobLink.Data.Tests` | Repositories, stored procedures, views, deployer and sample data against a **real SQL Server** | 285 with SQL Server; the SQL-backed ones are skipped without it |
| Client | `cd client && CHROME_BIN=/usr/bin/google-chrome npm run test:ci` | Components, services, forms, pickers, routing helpers (Karma, headless Chrome) | 774 |

```bash
dotnet build CobLink.sln
dotnet test CobLink.sln             # no SQL Server needed: the SQL-backed Data tests are reported as skipped

# the SQL-backed tests (creates and drops scratch databases named CobLinkTest_*)
export COBLINK_TEST_CONNECTION='Server=localhost,1433;User Id=sa;Password=<password>;TrustServerCertificate=True'
dotnet test tests/CobLink.Data.Tests
TZ=America/Chicago dotnet test tests/CobLink.Data.Tests   # one test only proves something away from UTC
```

How the suites are designed (and why that matters for modernization):

* **Three seams make the rules testable:** `ICurrentUser`, `IClock` and the repository interfaces. `CobLink.TestSupport` provides
  in-memory implementations (`TestWorld`), so Business and API tests need no database.
* **The Data tests are the behavioural contract of the data layer.** They only use the repository *interfaces*
  (`tests/CobLink.Data.Tests/Infrastructure/DatabaseFixtures.cs` is the one place that names the ADO.NET classes). A replacement
  implementation, for example EF Core, must pass the same suite unchanged. More in [`tests/CobLink.Data.Tests/README.md`](tests/CobLink.Data.Tests/README.md).
* **The API tests pin the wire contract:** the endpoint table of `docs/api-reference.md` is parsed and compared with the
  routes of the running application, and the JSON shape (camelCase, numeric enums, UTC `Z`) is asserted. Replacing Newtonsoft
  or the routing must keep them green unless the contract change is deliberate.
* **The client suite runs without a server** (`HttpClientTestingModule`, stubs and builders in `client/src/app/testing`).

**CI** (`.github/workflows/ci.yml`, on push to `main` and on pull requests): `backend` (.NET 8, a throwaway SQL Server container
with a random password, build and all tests, `.trx` artifacts), `client` (Node 22, `npm ci`, `test:ci`, `build:prod`) and
`images` (both Docker images build).

---

## 8. Modernization with an agentic SDLC

The purpose of this repository is to be modernized. In an **agentic SDLC** the work is divided like this:

* **People** set the intent, make the decisions (scope, target architecture, trade-offs) and review and approve every change.
* **AI agents** (GitHub Copilot cloud agent working from an issue, Copilot CLI, or agent mode in an IDE) analyse, plan, implement,
  test and document, in small pull requests.
* **The repository** is the guard rail for both: tests, CI, the API contract and the agent instructions say whether a change is safe.

The phase-by-phase method, with prompts, review checkpoints and quality gates, is in
[`docs/modernization-playbook.md`](docs/modernization-playbook.md). This section is the map that the playbook follows.

### 8.1 Why this baseline suits an agentic modernization

| What an agent (and a reviewer) gets | Where | Why it matters |
|---|---|---|
| A test suite that defines "unchanged behaviour" | [section 7](#7-testing): 333 + 78 + 285 + 774 tests | An agent can *prove* that a refactoring preserved behaviour instead of claiming it. |
| A frozen, machine-checked contract | `docs/api-reference.md` and `SwaggerAndContractTests` | The REST redesign becomes a reviewable diff of one document that a test enforces. |
| Seams between the layers | `ICurrentUser`, `IClock`, the repository interfaces, the layering rules in [3.2](#32-solution-structure-and-layering) | Layers are replaced one at a time, for example a new data-access implementation behind the same interfaces. |
| A behavioural contract for the data layer | `CobLink.Data.Tests` (real SQL Server, repository interfaces only) | Changing the SQL client or moving to EF Core gets an objective pass or fail. |
| One place for build settings | `Directory.Build.props`, `global.json` | The framework upgrade starts as a one-line change and the compiler lists the rest. |
| Instructions and a ready environment for agents | `.github/copilot-instructions.md`, `.github/workflows/copilot-setup-steps.yml` | Agents know the commands, the layering and the rules not to break, and start with the toolchain installed. |
| A catalogued set of legacy traits | [8.5](#85-modernization-backlog) | The backlog is explicit: an agent is told *what* to modernize and what to leave alone. |
| A runnable environment | `docker compose up`, CI | Reviewers and agents verify the running system, not only the diff. |

### 8.2 Legacy to target map

The steps are ordered so that the repository stays green after each one. Steps 1 to 8 keep the API contract frozen, so the
Angular track (12 to 14) can run in parallel with the backend track. They meet at step 9 (the REST redesign), where the contract
and the client change together, and step 15 (the generated client).

| # | Track | Concern | Baseline today | Target, and how to prove it |
|---|---|---|---|---|
| 1 | API | Runtime and SDK | `net8.0` in `Directory.Build.props`; SDK 8.0.100 in `global.json`; .NET 8 images in `src/CobLink.Api/Dockerfile`; `8.0.x` in `ci.yml` | **.NET 10**: `net10.0`, SDK 10 pinned, 10.0 images and CI. All three .NET suites and the compose stack are green. |
| 2 | API | NuGet packages | Pinned to 8.0.x, Swashbuckle 6.9.0, `System.Data.SqlClient` 4.9.1 | Current packages for .NET 10 (`dotnet list package --outdated --vulnerable`). Restore and build with zero warnings, nothing vulnerable. |
| 3 | API | SQL client | `System.Data.SqlClient` (deprecated; `#pragma warning disable CS0618` in `SqlHelper`) | `Microsoft.Data.SqlClient`. Its `Encrypt` default is `true`, so review every connection string. `CobLink.Data.Tests` pass unchanged. |
| 4 | API | C# defaults | `LangVersion` pinned to 12.0; `Nullable` and `ImplicitUsings` off; block-scoped namespaces | Unpin the language version; nullable reference types on (project by project, from `CobLink.Models` outwards), implicit usings, file-scoped namespaces. Zero warnings, tests unchanged. |
| 5 | API | Hosting | `Program` + `Startup` + `CreateHostBuilder` | Minimal hosting (`WebApplication.CreateBuilder`); the registrations of `Startup` become extension methods; `Program` stays reachable by `WebApplicationFactory`. `CobLink.Api.Tests` unchanged. |
| 6 | API | JSON | Newtonsoft.Json: camelCase, numeric enums, base64 `byte[]`, UTC `Z` timestamps | `System.Text.Json` with the same wire shape. Extend the characterization tests first (`SerializationTests`), then swap; they and the contract test stay green. |
| 7 | API | API description | Swashbuckle with Newtonsoft support | Built-in OpenAPI document generation plus the UI you prefer. `SwaggerAndContractTests` still finds every route. |
| 8 | API | Concurrency model | Synchronous repositories, services and controllers | `async`/`await` end to end with the request's `CancellationToken`. All suites green, no `.Result` or `.Wait()`. |
| 9 | API | API style | RPC routes, `ServiceResponse<T>` envelope, failures as HTTP 200, `rowVersion` in bodies | **REST**: resource routes and verbs, 400/403/404/409/422 with RFC 9457 problem details, `ETag` / `If-Match` ([8.3](#83-the-rest-redesign-step-9)). `docs/api-reference.md`, the contract test, the API tests and the client change **together**, after an ADR. |
| 10 | API | Data access | ADO.NET and stored procedures behind five repository interfaces | Keep them, or EF Core 10 behind the same interfaces (a decision; record it). `CobLink.Data.Tests` pass **unchanged** against the new implementation. |
| 11 | DB | Scripts | Numbered, idempotent T-SQL; status numbers hard coded; `GETDATE()` in views and the dashboard | Decide: keep the scripts, or migrations / DACPAC. Named constants or lookup joins; one source of "today". Data tests, `DatabaseDeployerTests` and the sample-data tests pass. |
| 12 | SPA | Angular platform | Angular 16.2, TypeScript 5.1, RxJS 7.8 (out of support) | Current Angular, **one major version per step** with `ng update`, matching TypeScript and Node. `test:ci`, `build:prod` and the browser smoke test after every hop. |
| 13 | SPA | Component model | NgModules, `*ngIf` / `*ngFor`, constructor injection, `BehaviorSubject` state | Standalone components, `@if` / `@for`, `inject()`, signals where they simplify. Official migration schematics first. Same specs pass; screens unchanged (compare with `docs/images`). |
| 14 | SPA | Build and unit tests | webpack-based `browser` builder, Karma + Jasmine | `application` (esbuild) builder; Vitest or Karma (a decision). Specs ported, none dropped. |
| 15 | SPA | API client | Hand-written `models/` mirror `src/CobLink.Models`; hand-written `ApiService` calls | Typed client generated from the OpenAPI document. No hand-written DTOs left; CI fails when the generated client is stale. |
| 16 | Ops | Hardening | No TLS or security headers in nginx; Data Protection key warning in the API container; header sign-in for demos | TLS termination, CSP and security headers, persisted keys (or none needed), structured logging and OpenTelemetry, optional Entra ID. Security review and scanning clean; compose smoke test. |

**Step 1 is cheap on this baseline.** When the baseline was built it was tried against SDK 10.0.402 on a scratch copy: setting
`TargetFramework` to `net10.0` in `Directory.Build.props` and the SDK in `global.json` to 10.0.100 gave a clean build (0 warnings,
0 errors) and green suites (Business 333, API 78, Data 285 against SQL Server). The baseline's debt is not a compile-time blocker;
the later steps remove it deliberately and adopt what .NET 10 offers.

### 8.3 The REST redesign (step 9)

The route table is **illustrative**: it gives the exercise a concrete starting point. The real decisions (PUT or PATCH, which status
code a broken business rule gets, how paging and sorting are expressed) are the human checkpoint of that step and are recorded in
an architecture decision record before any code changes.

| Today (RPC) | Target (illustrative REST) | Notes |
|---|---|---|
| `GET /api/User/GetCurrent` | `GET /api/me` | Session info: user, role, `authenticationMode` |
| `GET /api/User/GetAll` | `GET /api/users` | Active users |
| `GET /api/Lookup/GetAll` | `GET /api/lookups` | Cacheable reference data |
| `GET /api/Lookup/SearchMembers?term=&max=` | `GET /api/members?search=&limit=` | |
| `GET /api/Lookup/SearchProviders?term=&max=` | `GET /api/providers?search=&limit=` | |
| `GET /api/Dashboard/GetSummary` | `GET /api/dashboard` | |
| `POST /api/Activity/Search` (body) | `GET /api/activities?status=&assignedTo=&page=&pageSize=&sort=` | Filters move from the body to the query string |
| `GET /api/Activity/GetById?id=` | `GET /api/activities/{id}` | 404 instead of `NOT_FOUND` inside a 200 |
| `POST /api/Activity/Save` (no id) | `POST /api/activities` | `201` with `Location` |
| `POST /api/Activity/Save` (with id) | `PUT /api/activities/{id}` with `If-Match` | `rowVersion` becomes the `ETag` |
| `POST /api/Activity/Complete`, `Reopen`, `Cancel` | `POST /api/activities/{id}/complete`, `/reopen`, `/cancel` | State transitions stay explicit actions; the comment travels in the body |
| `POST /api/Activity/AddNote` | `POST /api/activities/{id}/notes` | `201` |
| `POST /api/Takeback/Search` (body) | `GET /api/takebacks?...` | As for activities |
| `GET /api/Takeback/GetById?id=` | `GET /api/takebacks/{id}` | |
| `POST /api/Takeback/Save` | `POST /api/takebacks`, `PUT /api/takebacks/{id}` | |
| `POST /api/Takeback/Submit`, `Approve`, `Reject`, `SendNotice`, `Dispute`, `ResolveDispute`, `WriteOff`, `Cancel` | `POST /api/takebacks/{id}/submit`, `/approve`, `/reject`, `/send-notice`, `/dispute`, `/resolve-dispute`, `/write-off`, `/cancel` | |
| `POST /api/Takeback/RecordRecovery` | `POST /api/takebacks/{id}/recoveries` | `201`; a recovery is a sub-resource |
| `GET /health` | `GET /health` (optionally split into live and ready) | Stays anonymous |

| Today (`errorCode`, HTTP status) | Target (illustrative) |
|---|---|
| `VALIDATION`, 200 | `400` (or `422`) with problem details and an `errors` object keyed by field |
| `BUSINESS_RULE`, 200 | `409` (or `422`) with a stable problem `type` |
| `NOT_FOUND`, 200 | `404` |
| `CONCURRENCY`, 200 | `412` when `If-Match` does not match (and optionally `428` when it is missing) |
| `FORBIDDEN`, 403 / not signed in, 401 | `403` / `401` (unchanged) |
| `BAD_REQUEST`, 400 / `SERVER_ERROR`, 500 | `400` / `500`, both as RFC 9457 problem details; the 500 carries the trace id |
| `{ success, data }` envelope | The resource itself; `201` with `Location` on create, `204` where nothing is returned |

`availableActions` stays in the single-record responses: it is a feature (the server decides which buttons exist), not an RPC
artefact.

### 8.4 Phases at a glance

| # | Phase | Agents do | People decide and review | Exit gate |
|---|---|---|---|---|
| 0 | **Orient** | Build, run and summarize the system; inventory dependencies, deprecated APIs and vulnerabilities; propose a plan and write the issues | Target decisions (EF Core or not, Vitest or Karma, REST conventions, auth) and priorities | Baseline results recorded; decisions written down as ADRs; issues ready |
| 1 | **Protect** | Add characterization tests where the baseline has gaps (wire shape, date semantics, routes); make CI a required check | Are the new tests meaningful? Is branch protection right? | Contract and wire shape pinned; green CI is mandatory |
| 2 | **Platform** (steps 1-3) | SDK, packages and SQL client upgrades, one pull request each | Review every pull request; approve package choices | All suites green on .NET 10; compose stack works |
| 3 | **Code** (steps 4-8) | Nullable, hosting, JSON, OpenAPI, async | Review the behaviour-preservation evidence; performance sanity check | Suites unchanged; no contract change |
| 4 | **API and client** (steps 9 and 15) | Implement the REST contract; generate the client | **Approve the contract before implementation**; review the diff of `docs/api-reference.md` | New contract documented and tested; client generated |
| 5 | **Frontend** (steps 12-14) | `ng update` hops, standalone, control flow, tests | Review screens (screenshots, browser smoke test) | All specs ported; bundle size recorded; no visual regressions |
| 6 | **Harden and release** (step 16) | Security headers, scanning, documentation, release notes | Security review; go or no-go | Scans clean; docs current; rollback documented |

Phase 5 can start as soon as phase 1 is done and runs in parallel with phases 2 and 3, because the contract is frozen until phase 4.

### 8.5 Modernization backlog

These traits are in the baseline **on purpose**, or are honest rough edges that were left alone. They are what an assessment agent
should find and what the map in [8.2](#82-legacy-to-target-map) removes. None is a bug to fix on the side: each item is its own change.

| Area | Trait | Where | Direction (map step) |
|---|---|---|---|
| Backend | Deprecated `System.Data.SqlClient` | `src/CobLink.Data/Sql/SqlHelper.cs`, `CobLink.Data.csproj` | `Microsoft.Data.SqlClient` (3) |
| Backend | `Program` + `Startup` split | `src/CobLink.Api/Program.cs`, `Startup.cs` | Minimal hosting (5) |
| Backend | Newtonsoft.Json and Swashbuckle | `Startup.cs` | `System.Text.Json`, built-in OpenAPI (6, 7) |
| Backend | Business failures returned as HTTP 200 inside an envelope | `Infrastructure/ApiExceptionFilter.cs`, `ServiceResponse<T>` | Problem details and status codes (9) |
| Backend | RPC routes `api/[controller]/[action]`; `rowVersion` in request bodies | controllers, models | Resource routes, `ETag` / `If-Match` (9) |
| Backend | Synchronous I/O everywhere | repositories, services, controllers | `async` end to end (8) |
| Backend | `Nullable` and `ImplicitUsings` off | `Directory.Build.props` | Enable (4) |
| Backend | `CobLink.Business` references `CobLink.Data` because the repository interfaces live there (the classic layering, not an inverted one) | `CobLink.Business.csproj` | Optionally move the interfaces to the business side so the data layer depends inwards (10) |
| Backend | Creating an activity is not atomic: the insert and its system notes are separate calls and transactions | `src/CobLink.Business/Services/ActivityService.cs` (`Save`) | One unit of work (10) |
| Backend | `SqlHelper.NVarChar(name, size, value)` truncates silently when a value is longer than the declared size; only business validation guards it | `src/CobLink.Data/Sql/SqlHelper.cs` | Keep validation and column sizes in step, or let the provider fail (3, 10) |
| Backend | `datetime2(0)` keeps whole seconds, so fractions are rounded away | `database/scripts/010_Schema.sql` | Decide on precision (11) |
| Database | `GETDATE()` in the views and the dashboard procedure instead of the application's `IClock` | `030_Views.sql`, `070_Procs_Dashboard.sql` | Pass "today" in, or use UTC consistently (11) |
| Database | Status ids as magic numbers (`StatusId IN (1, 2)`) mirrored by hand from the C# enums | `030_Views.sql`, `070_Procs_Dashboard.sql` | Lookup joins or generated constants (11) |
| Database | The `GO` splitter is line based: a `GO` line inside a multi-line string literal would be split | `DatabaseDeployer` | Migrations or DACPAC (11) |
| Frontend | Hand-mirrored enums and models | `client/src/app/models` and `src/CobLink.Models` | Generated client (15) |
| Frontend | NgModules, structural directives, constructor injection | `client/src/app` | Standalone, control flow, `inject()` (13) |
| Frontend | Karma + Jasmine, webpack builder | `client/karma.conf.js`, `angular.json` | Vitest or Karma, esbuild builder (14) |
| Frontend | Angular 16 and TypeScript 5.1 are out of support; the toolchain warns on Node 22 | `client/package.json` | `ng update`, one major at a time (12) |
| Frontend | A hand-written modal and type-ahead pickers (focus trap, pending-text validator) | `client/src/app/shared/components` | Angular CDK primitives or a component library (13) |
| Frontend | No explanation when a button is missing: a Supervisor sees no *Approve* on a takeback above the limit and cannot tell why | `availableActions`, takeback detail page | Return the reason with the actions (9) |
| Domain | `outstandingAmount` is amount minus recovered for every status; the dashboard's money KPIs only count Approved, NoticeSent, PartiallyRecovered, Recovered and Disputed | `docs/api-reference.md` ("Balances"), `070_Procs_Dashboard.sql` | Product decision, then one definition (9, 11) |
| Operations | No TLS, CSP or security headers in nginx | `deploy/web/nginx.conf` | Terminate TLS at an ingress; add headers (16) |
| Operations | The API container warns that Data Protection keys are not persisted (nothing uses them yet) | container log | Persist keys or leave unused (16) |
| Operations | Header sign-in in the demo environments | `Authentication:Mode=Development` (refused elsewhere by a start-up check) | Real identity in every environment, optionally Entra ID (16) |

### 8.6 Guardrails and definition of done

Every modernization pull request, whether an agent or a person wrote it:

* is **one concern** (for example "target framework to net10.0" is separate from "Microsoft.Data.SqlClient");
* leaves **all four suites green**, with no test deleted, skipped or weakened to get there; a test that is wrong is changed in its
  own commit with an explanation;
* changes the **API contract only in the REST step**, and then updates `docs/api-reference.md`, the contract test, the API tests and
  the client in the same pull request;
* keeps the **business rules** of [3.7](#37-domain-model-and-workflows) and `docs/api-reference.md` unless a person decided otherwise;
* uses the **tools** (`dotnet`, `ng update`, schematics, package managers, `dotnet format`) instead of hand-editing generated code
  or lock files;
* adds **no secrets**; passwords stay in environment variables or the git-ignored `.env`;
* states **what changed, why, how it was verified, and what is left undone** in the description;
* is **reviewed and approved by a person** before merge, and is revertable on its own (rollback is a revert).

The release-level definition of done (all steps of the map that were in scope are finished, the compose stack runs end to end, the
documents describe the new system) is in the playbook.

---

## 9. Known limitations and assumptions

* **Sample code, out of date by design.** .NET 8 ends support on 10 November 2026; Angular 16 is out of support and
  `System.Data.SqlClient` is deprecated. There is no TLS, CSP or security-header configuration. Do not deploy it to production or
  the internet. Version and support dates in this document were checked when the baseline was built and age: re-check them.
* **The demo sign-in trusts a header.** In the Development, Demo and Testing environments any caller can claim any identity with
  `X-CobLink-User`. The API refuses to start in this mode in other environments; keep the compose ports on a network you control.
* **Windows authentication is not tested end to end.** CI has no domain; the tests cover only the guard rails (see
  [Authentication](#authentication)).
* **An empty database has no users.** Without the sample data nobody can sign in until an administrator row is inserted
  ([`database/README.md`](database/README.md#windows-authentication-needs-a-user-row)). There are no screens to manage users,
  members or providers: they are table rows that the demo data supplies, and members and providers can be searched but not edited.
* **"COB" is read as Coordination of Benefits.** The brief named only the two functions, so the health-plan domain (members,
  providers, claims, recoupment, notices, disputes) is an assumption. The code does not depend on the wording.
* **The sample data is fictional** and generated relative to the day it is loaded, so the dashboard always has overdue and upcoming
  items. Its counts (6 users, 19 members, 10 providers, 18 takebacks, 27 activities) are pinned by tests.
* **Simple list filters.** The takeback list filters by one status, so the *Active takebacks* KPI (three statuses) opens the
  unfiltered list. A takeback amount may not exceed 9,999,999.99.
* **Time.** Audit timestamps are UTC and business dates carry no time zone, but "overdue" and "due this week" use the database
  server's local date (`GETDATE()`): correct only while the application and the database run in one time zone ([8.5](#85-modernization-backlog)).
* **Toolchain warning.** Angular 16 officially supports Node 16 and 18; Docker and CI use Node 22. The Angular CLI prints a version
  warning; the build and the tests pass.
* **Scope of verification.** Verified in Chrome (headless in the unit tests, interactively for the screenshots). Not load tested and
  not formally audited for accessibility.
* **SQL Server licence.** The compose file starts the **Developer** edition and sets `ACCEPT_EULA=Y`, which accepts its terms
  (development and test use only).

---

## 10. Documentation index

| Document | What it covers |
|---|---|
| `README.md` (this file) | Overview, quick start, architecture, configuration, testing, modernization map and backlog |
| [`docs/api-reference.md`](docs/api-reference.md) | The API contract and business rules (pinned by a contract test) |
| [`docs/modernization-playbook.md`](docs/modernization-playbook.md) | The phased agentic-SDLC method: prompts, review points, quality gates, rollback |
| [`database/README.md`](database/README.md) | Schema conventions, deployment, the stored-procedure contract, creating the first user |
| [`client/README.md`](client/README.md) | Structure, scripts and conventions of the Angular app |
| [`tests/CobLink.Data.Tests/README.md`](tests/CobLink.Data.Tests/README.md) | How the SQL-backed tests work and how to run them |
| [`.github/copilot-instructions.md`](.github/copilot-instructions.md) | Repository instructions for Copilot and other coding agents |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Build and test pipeline |
| [`.github/workflows/copilot-setup-steps.yml`](.github/workflows/copilot-setup-steps.yml) | Environment preparation for the Copilot cloud agent |
| `docs/images/` | The screenshots used above |
