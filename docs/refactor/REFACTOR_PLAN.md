# Refactor Plan

## Operating rules

- Incorporate or rebase onto the approved DDL-free runtime before implementation; do not reintroduce lazy DDL from this audit branch.
- One stage per reviewable branch/commit series. Never mix extraction with feature, visual, schema, API, auth, data, or deployment redesign.
- Establish old/new parity with fixtures before switching a caller.
- Migrate one composition root or policy family at a time.
- Preserve public globals, script order, storage keys, serialized fields, HTTP contracts, SQL behavior, Blob paths, CSS behavior, and error behavior unless a separate change is approved.
- Run stage tests before removing old code. Keep rollback as a source revert, not a live data repair.

## Stage 0: Establish the characterization harness

- **Files:** `package.json`; new `tests/**`; fixture-safety helper. No application source changes except minimal exports/wrappers strictly required by tests.
- **Functions/interfaces:** capture `/api/state`, HTTP helpers, merge/drop predicates, image-reference helpers, cloud-sync globals/events/storage interception, and page startup contracts.
- **Work:** configure Node tests and Playwright; create synthetic fixtures; add production URL/credential guards; record baseline DOM/state/API outputs.
- **Tests:** minimum state safety/API suite; one startup smoke per HTML entry; login, exhibition edit, and calendar smoke; DDL source scan against the approved baseline.
- **Abort:** tests require live production access, fixtures cannot represent compatibility fields, or test hooks alter runtime behavior.
- **Rollback:** remove test-only files/scripts and any hook; application and data remain unchanged.
- **Do not change:** implementation behavior, dependencies beyond test tooling, storage/API/schema/auth/UI.

## Stage 1: Extract pure server state safety policies

- **Files:** `api/state.js`; new server state policy modules; unit fixtures/tests.
- **Functions:** `detectLargeUnexpectedInventoryDrop`, user identity helpers, `mergeUsersWithDelta`, user drop/password/admin predicates. Move one policy family per commit.
- **Interface:** explicit arguments and return values identical to current functions; CommonJS exports; handler remains response/persistence owner.
- **Tests:** threshold boundaries, identity collisions, password/unknown-field preservation, removal semantics; handler golden tests before/after.
- **Abort:** ordering, mutation, malformed-input, or safeguard decision differs on any fixture.
- **Rollback:** restore inline functions and imports; no state/schema change occurred.
- **Do not change:** thresholds, status codes, audit reasons, user schema, authentication, DDL.

## Stage 2: Extract accounting pure projections

- **Files:** `pottery-accounting.js`; new accounting domain script(s); accounting fixtures/tests; `pottery-accounting.html` only to add a preceding classic script if needed.
- **Functions:** `buildAutoEntries`, category calculators, `collectClassOccurrencesByStudentInMonth`, manual/auto merge, finance/export row projections.
- **Interface:** one explicit dataset bundle, month/tab/side/category inputs; stable entry arrays/order/IDs/totals. Existing page remains orchestrator and renderer.
- **Tests:** fixed-month golden entries/totals for all categories, boundaries/rounding/deduplication, persisted manual state unchanged, spreadsheet/CSV row parity.
- **Abort:** any derived row, order, total, or export cell differs; script cache/load order fails.
- **Rollback:** restore inline functions and remove added script reference; storage untouched.
- **Do not change:** category names, financial rules, caching/memoization, state shape, UI.

## Stage 3: Extract student and personal-work calculations

- **Files:** `pottery-students.js`, `pottery-personal-work.js`; new page-local domain scripts; relevant HTML load entries and tests.
- **Functions:** `getStudentClassStats`, class-count/range and payment-cycle calculations, payment/class grouping projection; personal-work cycle/payment/usage calculations.
- **Interface:** explicit records, calendar, and frozen `asOfDate`; no DOM/storage access. Page renderers consume unchanged result shapes.
- **Tests:** historical/legacy payment fixtures, carry-over/adjustments, attendance boundaries, dormancy/payment/usage cycles; table/detail snapshots and page smokes.
- **Abort:** periodic recompute, displayed values, row grouping, or role-visible records differ.
- **Rollback:** restore original calls/functions and HTML load order.
- **Do not change:** payment schemas, calendar records, timers, modal behavior, role logic.

## Stage 4: Define shared calendar occurrence queries

- **Files:** extracted modules from Stage 3 plus `studio.js`, `pottery-accounting.js`; new `calendar-occurrences` and date/slot modules; tests. Migrate consumers one at a time.
- **Functions:** occurrence expansion, date ranges, slot/time conversion, event-for-date queries. Reconcile named duplicates by behavior, not by choosing one implementation blindly.
- **Interface:** explicit events/rules/overrides/range/timezone -> immutable occurrences; adapter options preserve consumer-specific filters.
- **Tests:** one fixture corpus executed against old and new behavior for studio, students, personal work, accounting; KST/local/month/week/overnight/recurrence cases.
- **Abort:** any consumer needs an unexplained exception or occurrence count/order differs.
- **Rollback:** switch only the current consumer back; keep proven module for later consumers.
- **Do not change:** persisted calendar shape, recurrence semantics, accounting formulas, timezone policy.

## Stage 5: Extract material-order model and projections

- **Files:** `pottery-material-orders.js`; new order model/projection/grid-merge scripts; HTML script order; tests.
- **Functions:** order totals/grouping, row model behind `renderOrdersTable`, then rectangular merge model behind `applyManualCellMerge(s)`.
- **Interface:** orders/edit state/filter -> row model; row model/selection -> merge plan. DOM application and keyboard/focus behavior remain in page controller.
- **Tests:** read/edit row parity, discounts/shipping/totals, multi-line rowspans, manual merge overlap/undo, keyboard/focus and export E2E.
- **Abort:** cell coordinates, spans, focus, selection, totals, serialized orders, or undo differ.
- **Rollback:** restore inline model builders and old DOM merge path; persisted shape unchanged.
- **Do not change:** table design, merge metadata schema, product cache, cloud merge, export format.

## Stage 6: Resolve exhibition works renderer shadowing

- **Files:** `exhibition-detail.js`; detail tests only.
- **Functions:** the declarations of `renderWorksManagement` at current lines 5539 and 6247 and their direct helper set.
- **Interface:** no new architecture yet. Prove the later declaration is controlling, capture old DOM/interactions, remove or rename only genuinely unreachable shadowed code after history/call-site review.
- **Tests:** every artwork mode/role, empty/populated/legacy fields, edit/select/image/certificate actions; DOM and state parity.
- **Abort:** both definitions are reachable through a discovered scope/evaluation path, or parity cannot prove the removed declaration is inactive.
- **Rollback:** restore the removed/renamed declaration exactly.
- **Do not change:** `works`/`artWorks`, rendering output, styles, handlers, certificates, image fields.

## Stage 7: Extract exhibition page-local domain slices

- **Files:** `exhibition-detail.js`; new exhibition model, sales, accounting, export, snapshot-client modules; HTML load order and tests.
- **Functions:** start with pure selectors/formatters and sales/accounting projections; then snapshot request adapter; leave `saveExhibition`, initialization, DOM renderers, images/files, and compatibility synchronization in the page orchestrator initially.
- **Interface:** explicit exhibition/user/UI inputs and stable view models/command patches; repository port still delegates to current save path.
- **Tests:** fixture parity for each tab, role/action matrix, sales/undo/accounting/export, snapshot request/refresh, full detail E2E desktop/mobile.
- **Abort:** serialized exhibition changes, unknown fields disappear, global handlers fail, or any tab/action differs.
- **Rollback:** switch the current slice to inline implementation and remove only its script reference.
- **Do not change:** data representations, image migration, Blob behavior, storage quota behavior, visual design.

## Stage 8: Introduce page-level storage repositories

- **Files:** page controllers from Stages 2-7, `auth.js`, a new browser storage adapter; tests. Do not modify `cloud-sync.js` interception in this stage.
- **Functions:** page `load*`/`save*` funnels, culminating in an `ExhibitionRepository` behind `saveExhibition`; adapter delegates to existing `localStorage`/`safeSetLocalStorageItem` behavior.
- **Interface:** parse/read and serialize/write with explicit key; writes must still pass through the existing patched native method and emit identical sync behavior.
- **Tests:** before/after serialized bytes or semantic JSON where ordering is not contractual; quota path, one push per mutation, remote-apply no echo, cloud event reload, offline behavior.
- **Abort:** push count/timing, compaction, error feedback, metadata, or unknown-field preservation differs.
- **Rollback:** page functions return to direct local storage; cloud sync unchanged.
- **Do not change:** storage keys, sync protocol, `Storage.prototype`, schemas, error policy.

## Stage 9: Extract studio calendar command planning

- **Files:** `studio.js`; new calendar command/occupancy modules; tests and HTML load order.
- **Functions:** occupancy and placement decisions, `saveEventFromModal` command planning, `finalizeMasterCalendarEdit` command planning, recurring one/following/all operations. Pointer coordinate capture and DOM previews remain page-owned.
- **Interface:** calendar snapshot + command -> result containing next state, affected IDs, validation reason, and required prompt; no persistence/DOM.
- **Tests:** exhaustive recurrence/occupancy/base-rule fixtures, old/new next-state parity, pointer week/month E2E, students/personal-work/accounting downstream totals.
- **Abort:** event IDs/order/shape, downstream occurrence results, preview/final placement, or recurring behavior differs.
- **Rollback:** call old inline mutators; persisted data was never migrated.
- **Do not change:** calendar schema, slot size, recurrence UX, pointer UX, performance caching.

## Stage 10: Separate state API orchestration from policy and persistence

- **Files:** `api/state.js`; new state handler/service/key-policy/transfer-view modules; existing DML-only repositories; API tests.
- **Functions:** thin the handler around already-extracted policies; extract GET view/ETag construction, PUT orchestration, audit/alert decisions, then DELETE orchestration.
- **Interface:** handler maps HTTP to service commands/results; service receives repositories/image service/request metadata. Preserve exact response and audit contracts.
- **Tests:** full API matrix with fakes and isolated Postgres; concurrent/stale writes; audit/alert rows; image partial outcomes; DDL source scan; endpoint smoke using restricted runtime role.
- **Abort:** status/body/header/audit/order changes, transaction boundary is unclear, or restricted-role smoke fails.
- **Rollback:** restore monolithic handler imports/calls; no schema or data migration.
- **Do not change:** API routes/payloads, merge policy, thresholds, authentication, database schema, role grants, image policy.

## Stage 11: Refactor sync internals behind frozen browser contracts

- **Files:** `cloud-sync.js`; new sync transport/reconciliation/application modules; possibly storage adapter from Stage 8; all page/browser/E2E tests.
- **Functions:** first extract pure delta/signature/material-order/preview/reconciliation decisions; then transport; retain global readiness/status/events and storage interception wrapper until all callers migrate.
- **Interface:** frozen `window.cloudSyncReady`, status shape, custom events, active-key matrix, PUT/GET payloads, debounce, metadata and native storage semantics.
- **Tests:** fake-clock/fetch/storage suite, every page startup, seven-key read/write, multi-context conflict, offline recovery, quota compaction, suspicious-drop push-back, transfer-safe preview, no echo loops.
- **Abort:** any extra/missing push, readiness/event ordering shift, stale overwrite, preview loss, page startup regression, or conflict behavior difference.
- **Rollback:** restore `cloud-sync.js` as a single implementation and remove new script loads; server/data unchanged.
- **Do not change:** protocol, retry/conflict UX, active keys, storage metadata, API, auth, data fields.

## Later optional stages

Only after Stages 0-11 are stable:

- characterize and centralize role/access policy across pages;
- split auth profile UI, session behavior, local-preview guards, and quota storage adapter;
- introduce ES modules/bundling with cache/deployment tests;
- reorganize CSS by verified selector ownership;
- replace generated inline handlers with bound listeners;
- add performance caches based on measured bottlenecks and tested invalidation.

These are not automatically authorized by completion of the structural stages.

## Highest-risk stage

Stage 11 is the highest-risk structural change because `cloud-sync.js` intercepts global storage mutations and participates in every synchronized data flow. Stage 9 has the highest domain-rule complexity because calendar changes affect four pages and accounting. Stage 10 has the largest server data-integrity blast radius. They remain late and independently reversible.

## Separate migration backlog

Do not attach these to any stage above:

- base64-to-Blob cleanup and removal of legacy image fields;
- `works`/`artWorks` normalization;
- student payment representation normalization;
- calendar state schema consolidation;
- password/auth/session redesign;
- database schema or role changes;
- endpoint redesign;
- operational artifact archival/removal.

Each needs its own inventory, approved target schema, backup, dry run, observability, rollback rehearsal, deployment plan, and business sign-off.

## Completion criteria

The structural refactor is complete only when all entry points retain behavior, pure rules are covered, adapters own side effects, page orchestrators are readable composition roots, server runtime is DDL-free under restricted roles, compatibility fields remain intact, and every stage can be reverted without a data migration. Completion does not imply permission to remove compatibility code or begin the migration backlog.
