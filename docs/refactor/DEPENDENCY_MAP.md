# Dependency Map

## Reading the map

This document describes runtime dependency direction, not a proposed import graph. Root browser scripts are classic scripts or IIFEs; HTML order and `window` globals are real interfaces. Server files are CommonJS Vercel functions. `R` and `W` mean direct read and write. A local write to a synchronized key also schedules an indirect network write through `cloud-sync.js`.

## Page composition roots

| HTML entry | Scripts in load order | Styles | Primary state/network |
| --- | --- | --- | --- |
| `index.html` | `landing.js` | `landing.css`, `mobile-draft.css` | `currentUser`; navigation |
| `login.html` | `cloud-sync.js`, `auth.js` | `style.css`, `mobile-draft.css` | `users` R/W, `currentUser` R/W |
| `gallery-lounge.html` | `cloud-sync.js`, `auth.js`, `script.js` | `style.css`, `mobile-draft.css` | session and gallery navigation |
| `exhibitions.html` | `cloud-sync.js`, `auth.js`, `exhibitions.js` | `style.css`, `mobile-draft.css` | `exhibitions` R/W |
| `exhibition-detail.html` | `cloud-sync.js`, `auth.js`, XLSX Populate CDN, JSZip CDN, `exhibition-detail.js` | `style.css`, `mobile-draft.css` | `exhibitions` R/W, `users` R, state/snapshot/upload APIs |
| `inventory.html` | `cloud-sync.js`, `auth.js`, `inventory.js` | `style.css`, `mobile-draft.css` | state summary API, `exhibitions` fallback |
| `users.html` | `cloud-sync.js`, `auth.js`, `users.js` | `style.css`, `mobile-draft.css` | `users` R/W, `currentUser` R/W |
| `pottery-workshop.html` | `auth.js`, `pottery-landing.js` | `pottery-landing.css`, `mobile-draft.css` | role-based navigation |
| `pottery-exhibition-works.html` | `auth.js`, `pottery-landing.js` | `pottery-section.css`, `mobile-draft.css` | role-based placeholder page |
| `pottery-master-calendar.html` | `cloud-sync.js`, `auth.js`, `pottery-master-calendar.js` | `pottery-master-calendar.css`, `mobile-draft.css` | calendar R/W; users/personal work R |
| `pottery-students.html` | `cloud-sync.js`, `auth.js`, `pottery-landing.js`, `pottery-students.js` | `pottery-students.css`, `mobile-draft.css` | students R/W; calendar R/W |
| `pottery-personal-work.html` | `cloud-sync.js`, `auth.js`, `pottery-landing.js`, `pottery-personal-work.js` | `pottery-personal-work.css`, `mobile-draft.css` | personal work R/W; calendar/users R |
| `pottery-material-orders.html` | `cloud-sync.js`, `auth.js`, `pottery-landing.js`, `pottery-material-orders.js` | `pottery-material-orders.css`, `mobile-draft.css` | material orders R/W; local product options |
| `pottery-accounting.html` | `cloud-sync.js`, `auth.js`, XLSX Populate CDN, `pottery-accounting.js` | `pottery-accounting.css`, `mobile-draft.css` | all seven synced keys R; accounting R/W |

Query-string versions are omitted above. Their inconsistent values are deployment/cache behavior and must not be silently rewritten during module extraction.

## Synchronized state matrix

| Key | Direct browser writers | Direct browser readers | Server policy |
| --- | --- | --- | --- |
| `users` | `auth.js`, `users.js` | Auth, users, detail, studio, personal work, accounting | Delta/full merge, identity matching, password preservation, drop/admin safeguards |
| `exhibitions` | `exhibitions.js`, `exhibition-detail.js` | Detail, list, inventory fallback, accounting, auth quota recovery | Delta/full merge, timestamps, preview preservation, inventory-drop safeguard, transfer-safe response |
| `pottery-students-v1` | `pottery-students.js` | Students, studio, accounting | Student identity/payment merge |
| `pottery-personal-work-v1` | `pottery-personal-work.js` | Personal work, studio, accounting | Version/conflict handling; full value path |
| `studio-calendar-state-v1` | `pottery-master-calendar.js`, student workflows | Studio, students, personal work, accounting | Calendar collection merge/full-overwrite semantics requiring fixtures |
| `pottery-material-orders-v1` | `pottery-material-orders.js` | Orders, accounting | Browser order merge; server version/conflict handling |
| `pottery-accounting-v1` | `pottery-accounting.js` | Accounting | Version/conflict handling; full value path |

Local-only state includes `currentUser`, page UI preferences/backups, cloud metadata/ETags/client ID, and material product options. Inventory backup keys are recovery state and must remain outside the seven-key server contract.

## Browser file responsibility matrix

| File | Loaded by / dependents | Depends on | State and external effects | Mixed responsibility evidence |
| --- | --- | --- | --- | --- |
| `sync/cloud-sync-protocol.js` | `cloud-sync.js`; sync-enabled HTML composition roots | pathname only | None; returns the frozen seven-key contract and active page keys | Pure protocol policy |
| `sync/cloud-sync-model.js` | `cloud-sync.js`, reconciliation module, unit tests | values only | None; signatures, deltas, transfer shaping | Pure push model |
| `sync/cloud-sync-reconciliation.js` | `cloud-sync.js`, unit tests | sync model URL normalization | None; material-order and exhibition merge/preference decisions | Pure pull reconciliation |
| `cloud-sync.js` | Most stateful pages; every synchronized writer indirectly | Three ordered sync modules, `fetch`, `localStorage`, `sessionStorage`, `Storage.prototype`, custom events | GET/PUT `/api/state`; reads/writes seven keys and sync metadata; patches storage methods | Effectful orchestration, transport, application, repair scheduling, readiness, conflicts |
| `auth.js` | All authenticated pages | Browser storage/DOM; optionally cloud readiness | `users` and `currentUser`; quota compaction; redirects; injected modal/styles | Login/signup, role/session helpers, profile editor, local-preview repair, storage recovery |
| `landing.js` | `index.html` | `currentUser`, DOM/navigation | Session read and route selection | Small composition script; retain page-local |
| `script.js` | `gallery-lounge.html` | `currentUser`, DOM/navigation | Logout and access-aware navigation | Small gallery landing controller |
| `pottery-landing.js` | Pottery landing/stub and some feature pages | `currentUser`, DOM/navigation | Card visibility and routing | Role helper duplication but modest page scope |
| `users.js` | `users.html` | `auth.js` behavior, cloud events, DOM | `users`/`currentUser` R/W; role/account mutations | Policy normalization, table rendering, modals, password workflow, persistence |
| `exhibitions.js` | `exhibitions.html` | Auth conventions, cloud interception, DOM | `exhibitions` R/W; navigation | Permissions, list rendering, creation, persistence |
| `exhibition-detail.js` | `exhibition-detail.html` | Auth/storage globals, cloud events, XLSX Populate, JSZip, browser file/image APIs | State/snapshot/upload requests; `exhibitions` R/W; `users` R; extensive DOM/download/print | Multiple gallery bounded contexts and duplicate controlling definitions |
| `inventory.js` | `inventory.html` | Auth conventions, `fetch`, DOM | GET summary state; local fallback | Loader, access filtering, summary rendering |
| `pottery-master-calendar.js` | Master calendar | Auth conventions, cloud events, DOM pointer APIs | Calendar R/W; user/personal-work reads; timers | Calendar domain, occurrence rules, pointer state machine, rendering, modals, persistence |
| `pottery-students.js` | Students page | Role helpers, cloud events, DOM | Students/calendar R/W; timer | Student/payment domain, attendance projections, slot-grid UI, modals, persistence |
| `pottery-personal-work.js` | Personal-work page | Role helpers, cloud events, DOM | Personal work R/W; calendar/users R; timer | Contract/payment state, usage calculations, rendering/modals |
| `pottery-material-orders.js` | Material-orders page | Role helpers, cloud events, DOM/file APIs | Orders R/W; product-option local cache; download | Order domain, edit buffers, grid navigation, cell merges, exports |
| `pottery-accounting.js` | Accounting page | Role conventions, cloud events, XLSX Populate, DOM/file APIs | Accounting R/W; five business sources R; exports | Cross-domain projection engine, manual ledger, rendering, export |

## Server dependency matrix

| File | Route/loader | Depends on | Data/side effects | Boundary notes |
| --- | --- | --- | --- | --- |
| `api/state.js` | `/api/state` | state store, audit store, HTTP helper, image refs | Postgres R/W; audit/alert writes; transfer shaping; optional image migration | Central protocol and business-policy hub |
| `api/upload.js` | `/api/upload` | `@vercel/blob`, HTTP/request parsing | Public Blob write and URL verification | Blob token remains server-only |
| `api/exhibition-image-migration.js` | `/api/exhibition-image-migration` | state store, image refs, HTTP helper | State read/write and Blob writes | Explicit data operation; not a structural-refactor stage |
| `api/exhibition-snapshots.js` | `/api/exhibition-snapshots` | snapshot store, HTTP helper | Snapshot list/capture/restore/undo | Action-dispatch route |
| `api/snapshots-cron.js` | `/api/snapshots-cron` | exhibition snapshot store | Scheduled Postgres/Blob writes and retention | Must remain DDL-free in approved runtime |
| `api/snapshots.js` | `/api/snapshots` | sitewide snapshot store | Sitewide capture/list/restore | Legacy/operational status must be verified before removal |
| `api/health.js` | `/api/health` | DB and audit store | DB read/metrics | Operational contract |
| `api/state-audit.js` | `/api/state-audit` | audit store | Audit/alert reads | Operational visibility |
| `api/_lib/db.js` | API stores | `pg`, `DATABASE_URL` | Pooled Postgres connection/query | No schema policy belongs here |
| `api/_lib/state-store.js` | State and snapshot services | DB | `app_state` CRUD | DML-only in approved baseline |
| `api/_lib/audit-store.js` | State/health/audit routes | DB | Audit/alert writes and reads | DML-only in approved baseline |
| `api/_lib/snapshot-store.js` | Sitewide snapshot route | DB, state store | Snapshot CRUD/restore | DML-only in approved baseline |
| `api/_lib/exhibition-snapshot-store.js` | Snapshot and cron routes | DB, state store, `@vercel/blob` | Snapshot/archive/retention/restore | Recovery-critical; DML-only in approved baseline |
| `api/_lib/exhibition-image-refs.js` | State and migration routes | `@vercel/blob`, crypto | Traversal, upload, reference normalization/stripping | Compatibility and migration logic share a file |
| `api/_lib/http.js` | API routes | Node HTTP/crypto primitives | JSON, ETag, cache and method responses | Appropriate small shared adapter |

## Shared interfaces to freeze before extraction

| Interface | Producers | Consumers | Characterization requirement |
| --- | --- | --- | --- |
| `window.cloudSyncReady` and status | `cloud-sync.js` | Auth/page initialization | Resolution timing, timeout behavior, unavailable-network behavior |
| `cloud-sync:state-applied` event | `cloud-sync.js` | Stateful page controllers | Event name, detail shape, key ordering, render timing |
| `Storage.prototype.setItem/removeItem` behavior | `cloud-sync.js` | Every script using local storage | Native behavior, enabled-key filtering, remote-apply suppression, debounce |
| `window.safeSetLocalStorageItem` | `auth.js` | Sync and feature scripts | Return value, compaction order, alert/error behavior |
| `/api/state` GET/PUT/DELETE | API | Sync, inventory, operational tools | Status, body, ETag, merge, safeguard and audit matrices |
| `exhibitions` serialized shape | Detail/list/API/accounting | All gallery consumers | Field preservation and alias fixtures, including unknown fields |
| Calendar occurrence semantics | Studio | Students, personal work, accounting | Recurrence, overnight/end time, overrides, deleted occurrences |
| Generated markup/global handlers | Renderers | Browser DOM event dispatch | DOM snapshots and interaction tests before function movement |

## Dependency cycles and pressure points

```mermaid
flowchart LR
  Pages[Page controllers] --> LS[localStorage working copy]
  LS --> Sync[cloud-sync.js orchestrator]
  Protocol[sync protocol] --> Sync
  Model[sync model] --> Sync
  Reconciliation[sync reconciliation] --> Sync
  Model --> Reconciliation
  Sync --> StateAPI[/api/state]
  StateAPI --> DB[(Postgres app_state)]
  DB --> StateAPI
  StateAPI --> Sync
  Sync --> LS
  Sync --> Events[cloud-sync events]
  Events --> Pages
  Detail[exhibition-detail.js] --> SnapAPI[Snapshot API]
  SnapAPI --> SnapDB[(Snapshot tables)]
  SnapAPI --> Blob[(Vercel Blob)]
  Detail --> UploadAPI[Upload API]
  UploadAPI --> Blob
```

The browser cycle is intentional but implicit. The target design should make its ports explicit while retaining observable ordering until protocol tests pass.
