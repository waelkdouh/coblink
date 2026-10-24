# COBLink modernization playbook

How to modernize COBLink from its **legacy baseline** (.NET 8, Angular 16, SQL Server stored procedures, RPC-style API) to
**C# + Angular + REST API + .NET 10** with an **agentic SDLC**: AI agents do the work in small steps, people decide and review,
and tests and CI decide whether a step is done.

The [README](../README.md#8-modernization-with-an-agentic-sdlc) (section 8) is the **map**: what changes and in which order.
This playbook is the **method**: who does what, how to prompt an agent, what a person must check, and what has to be green before
a step is finished. The prompts are starting points. Adapt them to the tools and conventions of your team.

## Contents

1. [Principles](#1-principles)
2. [Roles and the working loop](#2-roles-and-the-working-loop)
3. [Before you start](#3-before-you-start)
4. [The phases](#4-the-phases)
5. [Writing prompts that work](#5-writing-prompts-that-work)
6. [Reviewing agent pull requests](#6-reviewing-agent-pull-requests)
7. [Quality gates](#7-quality-gates)
8. [Rollback and risk](#8-rollback-and-risk)
9. [Measuring the modernization](#9-measuring-the-modernization)
10. [Suggested workshop flow](#10-suggested-workshop-flow)
11. [Templates](#11-templates)

---

## 1. Principles

1. **People own intent and decisions, agents own execution, tests own the truth.** An agent never decides scope, architecture or
   what a business rule *should* be.
2. **Small, reversible steps.** One concern per pull request. If a change cannot be reverted on its own, it is too big.
3. **Evidence, not assertion.** Every change arrives with proof: test results before and after, the contract diff, screenshots.
4. **The repository teaches the agent.** `.github/copilot-instructions.md`, the README map, `docs/api-reference.md` and the tests are
   the agent's context. When an agent makes the same mistake twice, fix the instructions, not only the code.
5. **Freeze what is not being changed.** The business rules are frozen throughout. The API contract is frozen until the REST step.
6. **Never modernize unasked.** An agent that "also upgraded" something needs a better prompt, not praise.
7. **Green before and after.** Record the baseline first. No step starts from a red repository and none ends on one.

## 2. Roles and the working loop

| Role | Responsibility |
|---|---|
| **Technical owner** (person) | Sets the goal and the priorities, makes and records the decisions (ADRs), accepts the result |
| **Reviewer** (person) | Reviews every pull request against the checklist in [section 6](#6-reviewing-agent-pull-requests) and owns the merge |
| **Assessor agent** | Reads and analyses the code, proposes plans and issues. Changes no code |
| **Implementer agent** | Works one issue on a branch and opens a pull request with evidence |
| **Reviewer agent** | An extra automated pass (for example Copilot code review, a security review) *before* the person, never instead of them |
| **CI** | The impartial gate: build, tests, scans |

**The loop for every work item**

1. **Issue.** Goal, scope, out of scope, acceptance criteria, verification commands, rollback ([template](#b-issue-for-an-agent)).
2. **Plan.** The agent proposes an approach; a person approves it for risky steps (contract, data access, anything irreversible).
3. **Implement.** The agent works on a branch, in small commits, following `.github/copilot-instructions.md`.
4. **Verify.** The agent runs the quality gates of [section 7](#7-quality-gates) and reports the results honestly, failures included.
5. **Pull request.** Description as in the [template](#c-pull-request-description-for-an-agent-change).
6. **Review.** Automated checks first, then a person.
7. **Merge, then learn.** Update the documents and the agent instructions with whatever this step taught you.

**Where agents run**

| Mode | Good for | Notes |
|---|---|---|
| **Copilot cloud agent** (assign an issue to Copilot) | Self-contained steps: an SDK bump, a package upgrade, one `ng update` hop, adding tests | Works in a GitHub Actions environment prepared by `.github/workflows/copilot-setup-steps.yml` and opens a pull request. SQL-backed tests need a SQL Server container; the commands are in `.github/copilot-instructions.md` |
| **Copilot CLI or agent mode in the IDE** | Assessment, design discussions (drafting an ADR), debugging a failing step, running the compose stack and the browser | Interactive: you steer, the agent executes |
| **Code review and security review agents** | A second pair of eyes on every pull request | Complement the person; do not replace the approval |

## 3. Before you start

- [ ] Run the application: `cp .env.example .env && docker compose up --build`, open http://localhost:8080 and click through the
      two functions as two different personas (README sections 1 and 2).
- [ ] **Record the baseline** ([table D](#d-baseline-record)): build, all four test suites, the size of the production bundle, the
      health endpoint. This is what "unchanged behaviour" means.
- [ ] **Tag it:** `git tag baseline-legacy && git push origin baseline-legacy`, the permanent rollback point.
- [ ] **Protect `main`:** pull requests required, CI required, at least one human approval.
- [ ] Turn on what your plan offers: Dependabot alerts, secret scanning, code scanning (CodeQL), dependency review.
- [ ] Run **Copilot Setup Steps** once by hand (Actions tab, *Run workflow*) and confirm it is green.
- [ ] Read `.github/copilot-instructions.md`. It is what the agents will be told, so change it now if your team's rules differ.

---

## 4. The phases

Each phase lists the **goal**, what the **agents** do, a **prompt** to start from, the **human checkpoint** and the **exit gate**.
Step numbers refer to the [Legacy to target map](../README.md#82-legacy-to-target-map) in the README.

### Phase 0: Orient (assess and plan)

**Goal.** A shared, evidence-based picture and an ordered plan. No code changes.

**Agents.** Build and run the system; inventory frameworks, packages and their support status; find deprecated API usage; list
risks; turn the README map into issues.

```text
You are a modernization architect working in this repository. Read README.md (sections 3, 4 and 8), docs/api-reference.md and
.github/copilot-instructions.md first. Do not change any code.

Produce docs/assessment.md with:
1. An inventory of runtimes, frameworks and packages with their versions and support status (use `dotnet list package --outdated
   --deprecated --vulnerable --include-transitive` and `npm outdated` / `npm audit` in client/; quote the output).
2. Obsolete or deprecated API usage you can find in the code, with file paths.
3. The risks of moving to .NET 10 and to the current Angular, ranked, with the tests that would catch each one.
4. An ordered plan that follows the "Legacy to target" map: for every step the size (S/M/L), the risk, the verification commands,
   and the rollback.
5. A list of decisions a person must make before step 9 (REST) and step 10 (data access).
Say explicitly what you could not verify.
```

**Human checkpoint: the decisions.** Write each one down as an ADR ([template](#a-architecture-decision-record)).

| Decision | Options | A reasonable default for this exercise |
|---|---|---|
| Data access | Keep ADO.NET + stored procedures; EF Core over the same tables; EF Core with LINQ and migrations | Keep, but move to `Microsoft.Data.SqlClient`. Treat EF Core as an optional later step, accepted only if `CobLink.Data.Tests` pass unchanged |
| JSON serializer | `System.Text.Json` with the **same wire shape**; or accept a deliberate change | Same wire shape, characterization tests first |
| API style and conventions | REST resources and verbs; status code policy; problem details; `ETag` / `If-Match`; paging and sorting | See README 8.3; decide 400 vs 422 and 409 vs 412 explicitly |
| Contract migration | Big bang; or REST routes next to the RPC routes (strangler) | One consumer on the same origin, so per resource in a short series of pull requests; strangler if other consumers exist |
| OpenAPI and client generation | Built-in `Microsoft.AspNetCore.OpenApi` plus a UI; a generator such as NSwag, OpenAPI Generator or Kiota | Pick one generator, pin its version, decide whether generated code is committed |
| Frontend tests | Vitest or Karma + Jasmine | Whatever the current Angular defaults to, unless the team has a reason |
| Database changes | Keep the scripts; EF Core migrations; DACPAC | Keep the scripts until step 11 |
| Authentication | Keep Windows (Negotiate); move to Entra ID / OIDC | Keep; out of scope unless the customer needs it |

**Exit gate.** Baseline recorded; `docs/assessment.md` reviewed and corrected; ADRs accepted; one issue per step.

**Watch out.** Assessments written by agents contain confident claims. Make the agent quote the command output behind every number,
and spot-check a few.

### Phase 1: Protect (strengthen the safety net)

**Goal.** Make the safety net strong enough for the steps ahead, at the places where this baseline is thin.

**Agents.**

1. **Wire-shape tests** (needed before step 6): extend `SerializationTests` so that every type that crosses the API boundary is
   covered: camelCase names, enums as numbers, `byte[]` as base64, UTC timestamps ending in `Z`, date-only values, decimals, nulls,
   empty arrays, and the error shape of a malformed body.
2. **Date semantics tests** (needed before step 11): "overdue" and "due this week" around midnight and in other time zones.
3. **A browser smoke suite** (needed before phase 5). The baseline has unit tests, API tests and SQL tests, but **no automated
   browser tests**. Add a Playwright suite that runs against the compose stack and a CI job that starts it.
4. **Prove the tests bite:** break the code on purpose (change an enum value, rename a JSON property, drop a column from a result
   set) and show that a test fails, then revert.

```text
Add an end-to-end smoke suite with Playwright under e2e/, run against the docker compose stack (http://localhost:8080, demo
persona header via the persona switcher). Scenarios: (1) the dashboard loads with KPI cards; (2) create an activity, complete it
with an outcome, see the system notes; (3) create a takeback as CORP\jdoe, submit it, switch persona to a supervisor and approve it;
(4) a validation error is shown next to the field; (5) an unknown user gets the access denied page. Use the data-* attributes
and accessible roles already in the templates; add no sleeps. The suite must finish in under three minutes. Add a CI job "e2e"
that builds and starts the compose stack with a generated SA password and runs it. Do not change application code except to add
missing data-* hooks, and list every such change.
```

**Human checkpoint.** Do the new tests assert *behaviour* (what a user or a client sees) rather than implementation details? Are
the assertions specific (not just "not null" or "status 200")?

**Exit gate.** New tests pass on the baseline and fail when the code is deliberately broken; CI is required for merging.

### Phase 2: Platform (steps 1 to 3)

**Goal.** Run on .NET 10 with current packages and the supported SQL client. One pull request per step.

**Agents.**

* **Step 1, runtime and SDK:** `Directory.Build.props`, `global.json`, the images in `src/CobLink.Api/Dockerfile`, `dotnet-version` in
  `ci.yml` and `copilot-setup-steps.yml`, and every document that says ".NET 8". On this baseline the code does not need to
  change: it compiled and passed all suites on SDK 10.0.402 after the two edits (README, section 8.2). Let the agent confirm that
  rather than assume it.
* **Step 2, packages:** bring every package to a version that supports .NET 10, guided by `dotnet list package --outdated --deprecated
  --vulnerable --include-transitive`. Newtonsoft and Swashbuckle stay in place until steps 6 and 7 unless one of them blocks the build.
* **Step 3, SQL client:** `System.Data.SqlClient` to `Microsoft.Data.SqlClient`.

```text
Step 1 of the "Legacy to target" map in README.md: move the solution to .NET 10. Change TargetFramework in Directory.Build.props,
the SDK in global.json, the base images in src/CobLink.Api/Dockerfile, dotnet-version in .github/workflows/ci.yml and
copilot-setup-steps.yml, and the documents that mention .NET 8. Change nothing else: no package upgrades, and no code changes
unless the build forces one (list each). Then run `dotnet build CobLink.sln`, `dotnet test CobLink.sln`, the Data tests against a
SQL Server container (commands in .github/copilot-instructions.md) and `docker compose up --build`, and report the numbers next to
the baseline numbers.
```

```text
Step 3: replace System.Data.SqlClient with Microsoft.Data.SqlClient in src/CobLink.Data, tools/CobLink.DbDeploy and
tests/CobLink.Data.Tests, and remove the #pragma warning disable CS0618 in SqlHelper. Microsoft.Data.SqlClient encrypts by
default (Encrypt=true): check every connection string (appsettings*.json, docker-compose.yml, ci.yml, the READMEs, the tests),
and explain what you changed and why. Do not change SQL, stored procedures or behaviour. The Data tests must pass unchanged.
```

**Human checkpoint.** The package choices (maintenance, licence); the encryption decision per environment (a real certificate in
production rather than `TrustServerCertificate`); the vulnerability report.

**Exit gate.** All suites green including the SQL-backed ones; compose stack healthy; `dotnet list package --vulnerable
--include-transitive` clean or every finding explained.

**Watch out.** Going from 8 to 10 skips a release: ask the agent to work from the compiler and test output, and to list every
behavioural change it knows of in .NET 9 and .NET 10 that touches this code (hosting, JSON, authentication, `Microsoft.Data.SqlClient`).

### Phase 3: Code (steps 4 to 8)

**Goal.** Modernize the backend code with the API contract unchanged. Every pull request here must leave `SerializationTests`,
`SwaggerAndContractTests` and `docs/api-reference.md` untouched.

| Step | Technique | Watch out |
|---|---|---|
| **4 Language defaults** | Unpin `LangVersion`. Enable `Nullable` project by project from `CobLink.Models` outwards, then move it into `Directory.Build.props`. Fix warnings by making types honest (`string?`), not by sprinkling `!`. `dotnet format` for file-scoped namespaces and usings. | With nullable enabled, MVC treats non-nullable reference properties of request models as **required**, which would turn today's field-level `VALIDATION` responses into model-state 400s. Annotate optional properties as nullable, or set `SuppressImplicitRequiredAttributeForNonNullableReferenceTypes`. The API tests catch it. |
| **5 Hosting** | Move `Startup` into `Program.cs` with `WebApplication.CreateBuilder`; keep `AddCobLinkData` / `AddCobLinkBusiness` as they are; make `Program` visible to `WebApplicationFactory<Program>`. | Middleware order. `DatabaseBootstrapper` must still run before the host starts. Configuration that `Program` reads eagerly (for example `Authentication:Mode`) can be read before the tests' `ConfigureAppConfiguration` overrides arrive; read it lazily or override with settings the host sees first. |
| **6 JSON** | Characterization tests first. Then `System.Text.Json` with camelCase naming, numeric enums, base64 `byte[]`, the same date formats, and the same error shape for a malformed body. | `Z` suffix only for `DateTimeKind.Utc`; decimal formatting; null handling; case-insensitive input; extra properties; the `BAD_REQUEST` envelope for unreadable bodies. |
| **7 OpenAPI** | Remove Swashbuckle, add the built-in OpenAPI document generation and a UI of your choice. Keep the **Persona** API-key scheme (a document transformer). | `SwaggerAndContractTests` read `/swagger/v1/swagger.json` and the `Persona` scheme: change the path in one place, keep every assertion. |
| **8 Async** | Start at the leaves: repository interfaces return `Task<T>` and take a `CancellationToken`; then services, controllers, the in-memory repositories of `CobLink.TestSupport`, and the tests. ADO.NET: `OpenAsync`, `ExecuteReaderAsync`. | No `.Result`, `.Wait()` or `Task.Run` shortcuts; the cancellation token really reaches the database call. |

```text
Step 6: replace Newtonsoft.Json with System.Text.Json in src/CobLink.Api. Work in two commits. Commit 1: extend
tests/CobLink.Api.Tests/SerializationTests.cs so that it pins the current wire shape of every type that crosses the API (list what
you added); it must pass on the current Newtonsoft implementation. Commit 2: swap the serializer, configure System.Text.Json to
produce the same shape, and remove the Newtonsoft packages. Commit 2 must not modify any existing assertion, in any test.
Report each difference you found between the two serializers and how you handled it.
```

```text
Step 8: make the data access and business layers asynchronous end to end. Repository interfaces in src/CobLink.Data return Task or
Task of T and accept a CancellationToken; services and controllers follow; the in-memory repositories in tests/CobLink.TestSupport
and all tests are updated mechanically. The behaviour, the SQL and the public HTTP contract do not change. No .Result, .Wait()
or GetAwaiter().GetResult() anywhere. Run every suite and report the counts.
```

**Human checkpoint.** Do the existing assertions stand unmodified? Is the number of tests the same or higher? For async: does the
cancellation token reach `SqlCommand`?

**Exit gate.** Suites unchanged and green; no contract change; a diff of `docs/api-reference.md` is empty.

### Phase 4: REST API and generated client (steps 9 and 15)

**Goal.** Replace the RPC-style API by a REST API, and replace the hand-written client models by a generated client. This is the
only phase that changes the contract, so it is **contract first** and the most important review of the whole exercise.

| Sub-step | Who | What |
|---|---|---|
| **4a Design** | Person leads, agent drafts | An ADR for resources, verbs, status codes and problem details, `ETag` / `If-Match`, paging and filtering parameters, whether transitions stay explicit sub-resource actions, and what happens to `availableActions` (README 8.3 is the starting point) |
| **4b Contract first** | Agent, person approves | Rewrite sections 1 and 2 of `docs/api-reference.md`; adapt the endpoint-table parser in `SwaggerAndContractTests`. The tests are now red |
| **4c Implement** | Agent | Resource by resource (activities, then takebacks): REST controllers, problem details instead of the envelope (a global exception handler replaces `ApiExceptionFilter`), `ETag` from `rowVersion`. The business layer does not change |
| **4d Generate the client** | Agent | Generate the TypeScript client from the OpenAPI document with the tool you chose; regenerate in CI and fail if `git diff` is not empty |
| **4e Switch the Angular client** | Agent | Change `core/api/api.service.ts`, the only code that talks HTTP, so that features and components keep their signatures; delete the hand-written models and enums the generator now provides |
| **4f Remove the old API** | Agent | Delete the RPC routes, `ServiceResponse<T>` and the envelope handling; update every document |

```text
Draft docs/adr/rest-api.md (use the ADR template in docs/modernization-playbook.md). Starting from section 8.3 of README.md,
propose the complete resource model and status-code policy for COBLink, and compare the alternatives with their consequences for:
PUT versus PATCH; transitions as POST sub-resources versus a status field; filtering, paging and sorting parameters; ETag and
If-Match on updates and on transitions; problem-details type URIs; keeping availableActions; API versioning. Recommend one option
for each and say why. Do not change any code or documents other than the ADR.
```

```text
Implement the activities resource of the REST contract in docs/api-reference.md: controller, routes, ETag and If-Match handling,
problem-details responses. Update CobLink.Api.Tests to the new contract (the business rules asserted by the tests do not change;
only routes, verbs and status codes do). Do not touch CobLink.Business or CobLink.Data. Leave the old Activity RPC routes in
place until the Angular client has been switched in a later pull request.
```

**Human checkpoint.** Approve the ADR *before* anything is implemented. Review the diff of `docs/api-reference.md` with the people who
own the business rules: for every failure, is the status code and problem type what the callers should see? Check that
authorization failures do not leak existence information in a new way.

**Exit gate.** The new contract is documented and pinned by tests; the generated client compiles and is current; the browser smoke
suite passes against the new API; the old routes are gone.

**Watch out.** An agent "fixing" the API can silently change a business rule (for example, 404 instead of 403 for a record the user
may not see). Business rules are frozen: any such change needs its own issue. nginx must keep forwarding `X-CobLink-User`,
`If-Match` and `ETag` (headers pass through by default).

### Phase 5: Angular (steps 12 to 14)

**Goal.** Move from Angular 16 to the current Angular and its current idioms, with the screens unchanged. This track can run in
parallel with phases 2 and 3 because the contract is frozen until phase 4.

**5a Prepare.** Each Angular major version requires a Node.js range, so the Node version in the Dockerfile, CI and
`copilot-setup-steps.yml` moves with it (the baseline uses 22 and the Angular CLI warns about it; at the time of writing the
current Angular release requires Node 22.22.3 or later in 22.x, 24.15 or later, or 26 or later).

**5b Hop by hop.** Never skip a major version: 16, 17, 18, and so on up to the current one. One pull request per hop.

```text
Upgrade the Angular app in client/ from 16 to 17 and stop. Follow the official update guide for 16 to 17 (update.angular.dev). Use
`ng update @angular/core@17 @angular/cli@17` and the migrations it offers; update other packages only as far as required and report
each one. Fix compile errors and deprecation warnings the update reports, without refactoring to new APIs. Before you finish:
`CHROME_BIN=/usr/bin/google-chrome npm run test:ci` passes with the same number of specs, `npm run build:prod` succeeds (report
the initial bundle size next to the baseline 726.72 kB) and the Playwright smoke suite passes against the compose stack. Change the
Node version in the Dockerfile, CI and copilot-setup-steps.yml only if this Angular version requires it.
```

**5c Modernize the code with the official schematics** (each its own pull request; availability depends on the version you have
reached, and the agent reviews and finishes what a schematic could not convert):

| Command | What it does |
|---|---|
| `ng generate @angular/core:standalone` | Converts components, directives and pipes to standalone; run its modes in order: convert, remove unnecessary NgModules, bootstrap with `bootstrapApplication` |
| `ng generate @angular/core:control-flow` | `*ngIf`, `*ngFor`, `ngSwitch` to `@if`, `@for`, `@switch` |
| `ng generate @angular/core:inject` | Constructor injection to `inject()` |
| `ng generate @angular/core:route-lazy-loading` | Eagerly referenced components in routes to lazy loading |
| `ng generate @angular/core:cleanup-unused-imports` | Removes unused imports of standalone components |
| `ng generate @angular/core:signals` | Signal inputs, outputs and queries in one migration (optional) |

**5d Builder and tests.** Move to the `application` (esbuild) builder, and decide between Vitest and Karma. Port spec by spec: the
count must not drop. The hand-written modal and type-ahead pickers (`client/src/app/shared/components`) are good candidates for
Angular CDK primitives, but that is a separate, optional change with its own accessibility check.

**Human checkpoint.** Compare the screens with `docs/images`; use the keyboard on the modal, the pickers and the lists; check the
bundle size; check that no `any`, `@ts-ignore` or lint suppression was added and that the feature routes are still lazy.

**Exit gate.** All specs (or their ported equivalents) pass, `build:prod` is green, the browser smoke suite passes, no visual
regressions.

### Phase 6: Harden and release

**Goal.** Close the gaps that were acceptable in a baseline and hand over a system you can operate.

**Agents.** nginx or ingress: TLS, `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`,
`Referrer-Policy`; persisted Data Protection keys or none; structured logging and OpenTelemetry; health checks split into live and
ready; secrets from the platform's secret store instead of `.env`; dependency review, code scanning and container image scanning in
CI; documentation, `.github/copilot-instructions.md` and the README updated to the new stack; release notes.

```text
Review this repository for security problems: authentication and authorization, injection, secrets, security headers, error
handling and information leakage, and dependency risks. Rank each finding by severity and give your confidence. Propose a minimal
fix for each, but do not change any code in this pass.
```

**Human checkpoint.** A person reads the security findings and decides; go or no-go for release.

**Exit gate (definition of done for the whole modernization).**

* Every step of the map that was in scope is finished and its proof is in the pull request.
* All suites, the browser smoke suite, the compose smoke test and CI are green on `main`.
* No finding above the agreed severity is open; dependency and code scanning are clean.
* README, `docs/api-reference.md` and `.github/copilot-instructions.md` describe the system as it is now.
* A rollback is documented and was rehearsed once.
* A short retrospective is written: what the agents were good at, where they needed correcting, which instructions you added.

---

## 5. Writing prompts that work

Use the same five parts every time. The same text can serve as the issue description for the cloud agent.

```text
Context:      Which step of the README map this is; what to read first (files, documents, ADRs).
Task:         The one thing to do, in one or two sentences.
Constraints:  What must not change (contract, business rules, existing tests); what is out of scope.
Verification: The exact commands that must pass, and the numbers to report next to the baseline.
Output:       What you want back: the branch or pull request, the description sections, a list of deviations.
```

| Weak prompt | Why it fails | Stronger prompt |
|---|---|---|
| "Upgrade the project to .NET 10." | No scope and no gate: invites unrelated changes | Step 1 of the map; the files to change; "change nothing else"; the commands to run; the numbers to report |
| "Convert the API to REST." | A design decision and a huge change in one sentence | Split it: ADR, contract document, then one resource per pull request |
| "Make the tests pass." | Invites deleting or weakening tests | "Fix the code, not the tests. If you believe a test is wrong, stop and explain why." |
| "Modernize the Angular code." | Unbounded | "Run `ng generate @angular/core:control-flow`, review the diff, finish what it could not convert, run the gates." |

Habits that pay off:

* **Give the commands.** An agent that has to guess how to build and test will guess wrong. They are in
  `.github/copilot-instructions.md`; repeat the ones that matter in the prompt.
* **Ask for a plan first** on risky steps, and approve it before the agent writes code.
* **Ask for the negatives:** "list what you did not do, what you could not verify, and every deviation from these instructions".
* **One issue, one prompt, one pull request.**
* **When the output is wrong, fix the instructions** (`.github/copilot-instructions.md`, the issue template), then retry.

## 6. Reviewing agent pull requests

An agent produces plausible code quickly; the reviewer's job is to check that it is *right and in scope*. Read in this order: the
description, the tests, the changed documents, then the code.

| Check | Look for |
|---|---|
| **Scope** | Only the step in the issue. No unrelated files, no formatting churn, no "while I was there" |
| **Tests** | None deleted, skipped or weakened; counts equal or higher; new behaviour has new tests |
| **Evidence** | The description quotes real numbers; CI is green; you can reproduce a result in a minute |
| **Contract** | `docs/api-reference.md`, `SerializationTests` and `SwaggerAndContractTests` are untouched unless this is the REST step |
| **Business rules** | `ActivityWorkflow`, `TakebackWorkflow` and the validators are untouched unless the issue says so |
| **Dependencies** | Every new package is justified (maintained, licensed, no known vulnerabilities) and pinned; lock files were changed by the tool |
| **Suppressions** | No new `#pragma warning disable`, `!`, `any`, `@ts-ignore`, `eslint-disable`, `[SuppressMessage]` or blanket `catch` |
| **Security** | No secrets; authentication not weakened; no wider CORS; no personal data in logs; the demo header still refused outside Development, Testing and Demo |
| **Honesty** | The description says what was not done and what is uncertain |

**Red flags:** tests that went green because their expectations changed; a new helper that swallows exceptions; "fixed" by
`--force` or `--legacy-peer-deps`; a lock file that changed far more than the package you asked for; a description that is longer
on adjectives than on numbers.

## 7. Quality gates

| Gate | Command | Passes when |
|---|---|---|
| Build | `dotnet build CobLink.sln` | No errors and no new warnings |
| Business and API tests | `dotnet test CobLink.sln` | All pass; counts not below the baseline (333 and 78) |
| Data tests | `COBLINK_TEST_CONNECTION='Server=localhost,1433;User Id=sa;Password=<password>;TrustServerCertificate=True' dotnet test tests/CobLink.Data.Tests` | 285 pass, none skipped |
| Client unit tests | `cd client && CHROME_BIN=/usr/bin/google-chrome npm run test:ci` | 774 pass (or the ported equivalents) |
| Client build | `cd client && npm run build:prod` | Builds; the initial bundle size is reported (baseline 726.72 kB) |
| Compose smoke test | `docker compose up --build -d`, then `curl -fsS http://localhost:8080/health` | 200 with `"status":"Healthy"`; the UI opens at http://localhost:8080 |
| Browser smoke suite | the `e2e` suite added in phase 1 | Every scenario passes |
| Dependencies | `dotnet list package --vulnerable --include-transitive`; `cd client && npm audit --omit=dev` | No finding that is not explained |
| CI | The checks of the pull request | Green |

## 8. Rollback and risk

* **Every step is one revert.** That is the point of one concern per pull request. `git tag baseline-legacy` is the way back to the
  start of the exercise.
* **The database is forward-only.** The scripts are idempotent and additive; take a backup before applying new scripts to a shared
  database, and never run the sample data against anything real.
* **During the REST phase** keep the old routes until the client no longer calls them (the strangler variant), so each pull request
  can be reverted without breaking the other side.

| Risk | Mitigation |
|---|---|
| The agent states something untrue with confidence | Require quoted command output; spot-check; reviewer reproduces one result per pull request |
| A silent behaviour change (dates, JSON, validation) | Characterization tests first; unchanged assertions in the swap commit |
| A giant, unreviewable diff | One concern per pull request; a size limit agreed up front |
| Dependency risk (typosquatting, abandonment, licence) | Pin versions, review every new package, scan in CI |
| Secrets or personal data reach a prompt or the repository | No real data in the repository; secrets only in `.env` or the platform's store; secret scanning on |
| Runaway or flaky work | Time-box each task; the agent reports a blocker instead of looping |

## 9. Measuring the modernization

Track a few numbers from the first pull request so the customer can see the effect.

| Measure | Why |
|---|---|
| Lead time from issue to merged pull request, per map step | Shows where agents help most |
| Size of each pull request (files and lines) | Keeps steps reviewable |
| CI green on the first push (percent) | A proxy for the quality of the agent's own verification |
| Review rounds per pull request | Where instructions or prompts need work |
| Escaped defects (found after merge) | The honest quality measure |
| Test count (and, if you collect it, coverage) over time | The safety net must grow, not shrink |
| Items of the [modernization backlog](../README.md#85-modernization-backlog) closed | Progress in terms the customer recognizes |
| Instructions or templates added after a miss | The learning loop is working |

## 10. Suggested workshop flow

A full-day flow for teaching a team the method (roughly 7.5 hours with breaks). A half-day version is blocks 1 to 4 and 8.

| Block | Time | What happens | The point |
|---|---|---|---|
| 1. Tour | 30 min | Run the compose stack, use both functions as two personas, walk through README section 3 | Everybody knows the baseline |
| 2. Orient | 45 min | Assessment prompt, the decisions table, issues from the map | Agents analyse, people decide |
| 3. Protect | 60 min | Wire-shape tests and the browser smoke suite; break the code on purpose | Tests are the contract |
| 4. Platform | 60 min | Steps 1 and 3 through the cloud agent; review with the checklist | Small pull requests with evidence |
| 5. Code | 75 min | Hosting and the JSON swap, characterization tests first | Prove equivalence, do not claim it |
| 6. REST | 90 min | ADR, contract first, one resource end to end, generated client | Design is human, typing is the agent's |
| 7. Angular | 75 min | Two `ng update` hops and one schematic | Prefer the official tool to hand edits |
| 8. Wrap-up | 30 min | Metrics, update the instructions file, retrospective | The process improves itself |

## 11. Templates

### A. Architecture decision record

```markdown
# ADR N: Title

Status: proposed | accepted | superseded by ADR M

## Context
What forces are at play: the requirement, the constraints, what the baseline does today.

## Decision
What we will do, in one paragraph.

## Options considered
Each option with its consequences.

## Consequences
Good, bad, and follow-up work.

## Verification
Which tests or gates prove that the decision was implemented correctly.
```

### B. Issue for an agent

```markdown
Title: Step N: short description

Goal:
Scope (projects, files):
Out of scope:
Acceptance criteria:
Verification (commands, and the numbers to report next to the baseline):
Rollback:
References: README map step, ADRs
```

### C. Pull request description for an agent change

```markdown
## What changed and why (map step N)
## Not changed, out of scope
## How it was verified (commands and results, next to the baseline)
## Deviations and open questions
## Risks and rollback
```

### D. Baseline record

| Check | Command | Baseline (this repository) | Your result |
|---|---|---|---|
| Build | `dotnet build CobLink.sln` | 0 warnings, 0 errors | |
| Business tests | `dotnet test tests/CobLink.Business.Tests` | 333 passed | |
| API tests | `dotnet test tests/CobLink.Api.Tests` | 78 passed | |
| Data tests (SQL Server) | `dotnet test tests/CobLink.Data.Tests` with `COBLINK_TEST_CONNECTION` | 285 passed | |
| Client unit tests | `npm run test:ci` | 774 passed | |
| Production bundle | `npm run build:prod` | 726.72 kB initial | |
| Health | `curl http://localhost:8080/health` | 200, Healthy | |


