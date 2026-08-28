# Codebase Audit

## Purpose and constraints

This audit is the planning baseline for an incremental refactor of the Gallery 10.19 site. It does not authorize application changes, data migrations, schema changes, deployment changes, or removal of compatibility behavior.

The audit was prepared on `refactor/site-architecture` at `6e69e5316c5aca98165e42447b4e62b5663c4727`, based on `develop`. Evidence comes from static source inspection, HTML load-chain extraction, named-function counts, side-effect searches, and the existing operational verification artifacts. Function counts are lexical estimates, not AST complexity scores.

### Baseline distinction

Two facts must remain separate throughout the refactor:

1. **Observed branch source:** this `develop` baseline still contains lazy DDL in `api/_lib/state-store.js`, `api/_lib/audit-store.js`, `api/_lib/snapshot-store.js`, and `api/_lib/exhibition-snapshot-store.js`.
2. **Approved runtime architecture:** commit `6d453be6a3b2ce1db9d31f43fbc2584685479829` and the current production deployment remove runtime/cron DDL. Schema administration is explicit through `DATABASE_MIGRATION_URL`, `sql/schema.sql`, and `npm run db:migrate`; restricted runtime roles perform DML only.

The DDL-free runtime is a prerequisite for implementation. Refactor branches must not copy, preserve, or reintroduce the stale lazy-DDL behavior observed on this branch.

### Immutable boundaries

- Do not change the seven synchronized state keys or their stored shapes during structural refactoring.
- Do not normalize `works` and `artWorks` until a separate data investigation proves their semantics and migration rules.
- Do not remove legacy base64/image fields until a separately approved migration has completed and rollback data exists.
- Do not redesign authentication, password storage, authorization, APIs, database schema, Blob layout, or UI while extracting modules.
- Do not treat files under `tmp/` as dead code. They are operational, migration, recovery, and verification records requiring a separate retention decision.
- Preserve classic-script load order and globals until each page has characterization coverage and an explicit module-loading migration.

## System summary

The application is a static multi-page frontend with classic browser scripts and Vercel CommonJS serverless functions. Browser page controllers read and mutate in-memory state and `localStorage`; `cloud-sync.js` mirrors seven keys through `/api/state`; the API stores JSONB values in Postgres. Exhibition images and snapshot archives may use Vercel Blob. HTML files are composition roots: script order supplies implicit dependencies rather than imports.

Postgres `app_state` is the authoritative shared copy. Browser `localStorage` is an offline-capable working copy/cache with page-specific state. This distinction is complicated by client merge, preview preservation, timestamp metadata, and defensive push-back behavior. Any refactor that models local storage as an independent source of truth would be incorrect.

## Quantitative inventory

### Major JavaScript files

| File | Lines | Named function estimate | Main responsibility | Risk |
| --- | ---: | ---: | --- | --- |
| `exhibition-detail.js` | 9,086 | 477 | Exhibition workspace, inventory, sales, files, images, certificates, snapshots, exports, dialogs | Critical |
| `pottery-master-calendar.js` | 5,645 | 261 | Week/month calendar, recurring events, occupancy, pointer editing, base rules | Critical |
| `pottery-material-orders.js` | 3,144 | 134 | Order state, editable grids, merges, keyboard behavior, exports | High |
| `pottery-students.js` | 2,062 | 101 | Student records, payments, credits, attendance, slot selection | High |
| `pottery-accounting.js` | 1,743 | 86 | Multi-domain accounting aggregation and manual entries | High |
| `api/state.js` | 1,313 | 50 | State API, merge/conflict policy, safeguards, audit decisions | Critical |
| `cloud-sync.js` | 1,242 | 59 | Browser pull/push, deltas, merge, ETags, storage interception | Critical |
| `auth.js` | 1,181 | 40 | Login/profile UI, session/role helpers, quota recovery, local preview guards | Critical |
| `pottery-personal-work.js` | 1,122 | 60 | Personal-work memberships, payments, usage derived from calendar | High |
| `users.js` | 820 | 49 | User administration, approvals, role fields, temporary passwords | High |
| `api/_lib/exhibition-snapshot-store.js` | 618 | 26 | Snapshot persistence, Blob archive, restore/undo, retention | High |
| `api/_lib/exhibition-image-refs.js` | 330 | 17 | Image-reference traversal, transfer stripping, Blob migration | High |
| `exhibitions.js` | 271 | 20 | Exhibition list, permissions, creation | Medium |
| `inventory.js` | 149 | 16 | Read-only exhibition inventory summaries | Medium |

The five largest browser page controllers total 21,680 lines and mix business rules, persistence, rendering, event wiring, and compatibility handling. Their size is a symptom; mixed ownership and hidden side effects are the actual refactor drivers.

### Styles and pages

- Fourteen HTML entry points compose the site.
- `style.css` is 2,569 lines and `pottery-master-calendar.css` is 1,484 lines; pottery feature stylesheets range from roughly 500 to 750 lines.
- `mobile-draft.css` is loaded by all fourteen pages and overlays both shared and page-specific CSS.
- Common responsive breakpoints include 980px, 920px, and 700px.
- Cache-busting query strings differ by page and asset; Vercel also applies asset caching rules.
- Dynamic HTML and export markup contain substantial inline styling. Export-only inline styles are not equivalent to browser CSS and should not be consolidated without output comparison tests.

## Domain inventory

| Domain | Primary files | State/API dependencies | Current coupling |
| --- | --- | --- | --- |
| Entry and routing | `index.html`, `landing.js`, `gallery-lounge.html`, `script.js` | `currentUser` | Role/navigation helpers repeated elsewhere |
| Authentication/profile | `login.html`, `auth.js` | `users`, `currentUser`, cloud readiness | Auth, profile DOM, seeding, quota recovery in one global file |
| User administration | `users.html`, `users.js` | `users`, `currentUser` | Role normalization and persistence mixed with table/modals |
| Cloud synchronization | `cloud-sync.js` | Seven synced keys, `/api/state`, session metadata | Global `Storage.prototype` interception and domain merges |
| Exhibition list | `exhibitions.html`, `exhibitions.js` | `exhibitions`, `currentUser` | Permissions, rendering, creation, persistence |
| Exhibition workspace | `exhibition-detail.html`, `exhibition-detail.js` | `exhibitions`, `users`, snapshots, upload | Almost every gallery subdomain in one global controller |
| Inventory summary | `inventory.html`, `inventory.js` | `/api/state?...view=summary`, local fallback | API/fallback/rendering in one loader |
| Studio calendar | `pottery-master-calendar.html`, `pottery-master-calendar.js` | calendar, students, personal work | Domain state machine embedded in pointer/DOM code |
| Students | `pottery-students.html`, `pottery-students.js` | students and calendar | Payment/credit rules embedded in rendering and modals |
| Personal work | `pottery-personal-work.html`, `pottery-personal-work.js` | personal work, calendar, users | Membership/payment/usage/rendering mixed |
| Material orders | `pottery-material-orders.html`, `pottery-material-orders.js` | orders plus local product options | State, grid layout, rowspans, keyboard model, exports mixed |
| Accounting | `pottery-accounting.html`, `pottery-accounting.js` | Six synced business datasets plus manual accounting | Cross-domain projections recalculated in page controller |
| State API | `api/state.js`, state/audit stores | Postgres, image-reference helper | Transport, policy, merge, safeguards, persistence orchestration |
| Snapshots | snapshot endpoints and stores | Postgres, Blob, `exhibitions` | Scheduling, persistence, archive, restore, undo |
| Image handling | `api/upload.js`, image migration files | Blob and `exhibitions` | Upload and compatibility migration cross runtime/data boundary |

## Principal findings

### 1. Page controllers are composition roots and domain implementations

The large page scripts do not merely wire components. They own mutable state, normalization, permissions, calculations, rendering, event listeners, persistence, timers, exports, and recovery. Extraction should first create pure domain functions behind unchanged page-level orchestrators. Splitting files by arbitrary line ranges would preserve the coupling while hiding it.

`exhibition-detail.js` is the most urgent decomposition target but not the safest first edit. It contains at least two definitions of `renderWorksManagement` (currently at lines 5539 and 6247); classic function declaration hoisting means the later definition controls calls in the same scope. This is an override-order compatibility hazard and must be characterized before moving either definition.

### 2. Shared state behavior is distributed across client and server

`cloud-sync.js` and `api/state.js` jointly define correctness. Both contain exhibition identity/count/preview logic, while only the server owns final write safeguards and auditing. Client behavior also differs by active page and sync mode. These files must be treated as one protocol boundary and changed only after request/response and merge fixtures exist.

### 3. Browser globals are implicit interfaces

HTML order supplies `auth.js` before page scripts and usually supplies `cloud-sync.js` first. Important interfaces include `window.cloudSyncReady`, `window.cloudSyncStatus`, `window.safeSetLocalStorageItem`, custom cloud-sync events, native `localStorage`, and page-global event handlers referenced by generated markup. Moving functions can break behavior even when function bodies are unchanged.

### 4. Business data has parallel and compatibility representations

- Exhibition inventory uses `works`, `artWorks`, goods arrays, and sold-record arrays. Some paths alias or synchronize lists; equivalence is not established.
- Image state may contain `photoUrl`, `photoPreviewUrl`, `photoDataUrl`, `photoPreviewDataUrl`, and older file/preview payload fields.
- Student payments use both summary fields and histories/records.
- Studio base rules, timelines, and week overrides represent related scheduling behavior in separate structures.
- Accounting combines persisted manual entries with derived projections from five other business domains.

These are data-contract concerns, not cleanup opportunities. Structural refactoring must preserve all reads, writes, fallbacks, field precedence, and serialized output.

### 5. Authorization is duplicated and client-heavy

Role normalization and effective-access calculations recur in `auth.js`, `users.js`, gallery pages, pottery pages, `script.js`, and `pottery-master-calendar.js`. This is dangerous business duplication because drift changes page access. However, extracting it before role-matrix characterization could centralize the wrong behavior. Server endpoint authorization is a separate security architecture topic and is explicitly outside structural stages.

### 6. Error and rollback behavior is inconsistent

- Storage quota recovery can compact exhibition image payloads and retry writes.
- Cloud push errors are generally asynchronous and do not provide transactional rollback of browser mutations.
- Exhibition editing has local backup, undo stacks, and snapshot flows, but these protections are feature-specific.
- Server state writes audit decisions and block suspicious user/inventory drops.
- Snapshot archiving can degrade differently depending on configuration.
- Many renderers assume valid normalized state and fail through console errors or partial DOM updates.

The refactor must record existing failure behavior before making it more uniform; changing error semantics during extraction would make regressions hard to distinguish from intended improvements.

### 7. Automated characterization is absent

No `*.test.*`, `*.spec.*`, `test/`, or `tests/` files and no test dependencies/scripts were found. `tmp/` contains valuable operational verification, dry-run, recovery, and migration tooling, but it is not a maintained regression suite. Test scaffolding is therefore Stage 0, not a follow-up.

## Duplication classification

| Pattern | Locations | Classification | Treatment |
| --- | --- | --- | --- |
| Role/access normalization | Auth, users, gallery and pottery page scripts | Dangerous business duplication | Characterize all matrices, then centralize without semantic changes |
| Date/month/slot helpers | Studio, students, accounting, personal work | Potential shared abstraction | Compare timezone, mutation, invalid-input, and boundary semantics first |
| Currency parsing/formatting | Students, orders, personal work, accounting, exhibition detail | Intentional variants plus duplication | Extract only byte-for-byte equivalent contracts; retain named variants |
| HTML/attribute escaping | Several renderers | Security-sensitive duplication | Add adversarial fixtures, then centralize exact contexts separately |
| Exhibition preview preservation | Client sync and server API | Intentional protocol duplication | Keep mirrored or move to a shared fixture specification; browser/server code cannot directly share CommonJS unchanged |
| Inventory counts/drop checks | Detail backup, client sync, server API | Intentional defense in depth with semantic drift risk | Specify each protection layer and shared fixtures; do not blindly deduplicate |
| Modal and table rendering patterns | Large page controllers | Structural duplication | Establish page-local component conventions before shared UI abstractions |
| Inline export table styles | Exhibition/accounting exports | Output-format duplication | Consolidate only after HTML/XLSX/print snapshot coverage |
| Image compatibility fields | Auth, sync, detail, API image helper | Compatibility code | Preserve until separate data migration proves removal readiness |
| Classic IIFEs | Pottery and shared scripts | Intentional namespace containment | Keep initially; module migration is a later composition change |

## Blast-radius ranking

1. **`cloud-sync.js` + `api/state.js`:** shared protocol for all authoritative data; defects can lose or overwrite cross-domain state.
2. **`auth.js`:** loaded by nearly every authenticated page; owns session behavior, profile mutation, local preview behavior, and quota recovery.
3. **`exhibition-detail.js`:** largest mutable domain surface; includes inventory and financial data plus image/file and snapshot operations.
4. **`pottery-master-calendar.js`:** high-frequency pointer interactions and recurring-calendar mutation rules shared with downstream accounting/student calculations.
5. **`pottery-accounting.js`:** read fan-in across six datasets; silent calculation drift directly changes financial views/exports.
6. **`api/_lib/exhibition-snapshot-store.js`:** recovery mechanism with database and Blob side effects; errors can compromise rollback confidence.
7. **`users.js`:** account/role mutation and administrative invariants.
8. **`pottery-students.js`:** payment-credit and attendance coupling with the calendar.
9. **`pottery-material-orders.js`:** complex visual grid state, edit buffering, and persistence.
10. **`pottery-personal-work.js`:** payment and calendar-derived usage coupling.

## Security boundary notes

This audit does not prescribe an auth redesign. It records boundaries that refactoring must not weaken:

- Identity/session and most page authorization are represented in browser storage and browser code.
- User records and role fields are synchronized state; API safeguards preserve passwords and an administrative account invariant.
- Administrative endpoint secrets and Vercel environment variables are deployment concerns, not module dependencies to expose in browser code.
- Blob tokens remain server-side. Browser code receives public URLs or calls API endpoints.
- Runtime database roles must remain restricted and DDL-free after the approved baseline is incorporated.
- Generated HTML uses local escaping functions. Any extraction must distinguish text, attribute, URL, CSV, and spreadsheet contexts.

Security improvements may be desirable, but combining them with structural extraction would prevent behavior-preserving review and rollback.

## Legacy and removal readiness

| Item | Current status | Removal readiness |
| --- | --- | --- |
| `works` / `artWorks` paths | Active/ambiguous compatibility | Not ready; investigate real state and call-site semantics |
| Base64 image and preview fields | Active fallback and quota concern | Not ready; separate Blob migration and rollback plan required |
| Student payment summary/history forms | Active compatibility | Not ready; characterize historical records first |
| Duplicate `renderWorksManagement` definitions | Active override behavior | Not ready; capture DOM/behavior of controlling definition first |
| Sitewide snapshots endpoint/store | Operational but overlapped by exhibition snapshots | Unknown; inventory callers and recovery policy first |
| Default/local-preview user repair paths | Environment-sensitive | Not ready; test host and data predicates first |
| `tmp/` recovery/migration artifacts | Operational evidence | Do not move or delete in structural refactor |
| Cache-busting query versions | Active deployment behavior | Standardize only with an asset-release strategy |

## Audit conclusion

The safest architecture path is strangler-style extraction behind existing HTML entry points and globals: establish tests, extract pure page-local domain logic, retain page orchestrators, and move toward explicit adapters only after behavior parity. Central sync, auth, state API, calendar mutation, and exhibition representation changes belong late in the sequence. The target architecture, staged plan, and test gates are specified in the companion documents.