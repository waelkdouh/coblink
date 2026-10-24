# COBLink client

Angular 16 single-page app (NgModule era) for COBLink takeback and activity tracking. It is deliberately
**legacy-style**, as the baseline for a later modernization (standalone components, signals, new control flow,
zoneless, Vitest). The API contract is in [`../docs/api-reference.md`](../docs/api-reference.md).

## Install and run

```bash
npm ci          # clean install from package-lock.json (Node 18+; Angular 16 officially targets Node 16/18, newer even releases work with a warning)
npm start       # ng serve --proxy-config proxy.conf.json -> http://localhost:4200
```

`proxy.conf.json` forwards `/api`, `/health` and `/swagger` to the API on `http://localhost:5080`, so start the API
first. All URLs are relative (no environment files). When the API runs in Development mode the navbar shows a
persona switcher; the choice is kept in `localStorage['coblink.devUser']` and sent as the `X-CobLink-User` header.

## Test and build

```bash
CHROME_BIN=/usr/bin/google-chrome npm run test:ci   # Karma + Jasmine, ChromeHeadlessCI launcher
npm test                                            # watch mode
npm run build:prod                                  # optimized build -> dist/client
npx ng build --configuration development            # unoptimized build
```

## Docker

The client has no image of its own: `../deploy/web/Dockerfile` (build context: the repository root) compiles it with
Node and serves `dist/client` with nginx, using `../deploy/web/nginx.conf`. nginx falls back to `index.html` for client
routes, caches hashed assets for a year, never caches `index.html`, and proxies `/api/`, `/swagger` and `/health` to
`http://api:8080`, forwarding `Host`, `X-Forwarded-*` and `X-CobLink-User`. Start the whole stack with
`docker compose up --build` from the repository root.

## Folder structure (`src/app`)

| Folder | Contents |
| --- | --- |
| `core/` | `ApiService` (envelope unwrapping, `ApiError`), typed services, `DevUserInterceptor`, `SessionGuard`, notifications |
| `models/` | `enums.ts`, `models.ts`, `api.ts`: hand-mirrored C# models, enums, sort keys and the response envelope |
| `shared/` | `SharedModule`: modal, pager, badges, pickers, pipes, directives, validators, utils |
| `layout/` | Shell: navbar, toasts, footer, access-denied and not-found pages |
| `features/` | Lazy modules `dashboard`, `activities`, `takebacks`, each with its own routing module |
| `testing/` | Stubs, builders and helpers used only by `*.spec.ts` files |

## Legacy traits (on purpose)

- NgModules everywhere: `AppModule`, `CoreModule`, `SharedModule`, `LayoutModule`, lazy `loadChildren` feature modules.
- Class-based `HttpInterceptor` and `CanActivate` guard; constructor injection only, no `inject()`.
- `*ngIf`, `*ngFor`, `[ngSwitch]` and the `async` pipe; no signals, no `@if`/`@for` control flow.
- Reactive Forms with `FormBuilder`; the typeahead pickers are `ControlValueAccessor` components.
- RxJS 7 with `takeUntil(this.destroy$)`; shared state in services (`BehaviorSubject`, `shareReplay`).
- Enums, `SortKeys` and models are copied by hand from the C# code; `rowVersion` is echoed in every write.
- Failures arrive as HTTP 200 with `success: false`; `ApiService` converts them into `ApiError`.
- Date-only fields are calendar dates (`calendarDate` pipe), timestamps use the `date` pipe in local time.
- zone.js change detection, Karma + Jasmine with `HttpClientTestingModule` and `RouterTestingModule`.
