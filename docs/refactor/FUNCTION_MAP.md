# Function Map

## Method

This is a ranked refactor-candidate registry, not a direction to extract functions in rank order. Rank reflects blast radius, mixed responsibility, hidden dependencies, and business criticality. Approximate spans end at the next named function or logical section and must be rechecked after the DDL-free baseline is incorporated.

Every record states: rank, symbol, file/span, environment, size, responsibility, callers, callees, globals, inputs, outputs, state read, state write, network/database/Blob effects, DOM/browser effects, error behavior, rollback behavior, coupling/risk, proposed boundary, and characterization seam.

## Ranked candidates

### 1. `/api/state` handler

- **Location/environment/size:** `api/state.js:880-1313`; server; approximately 430 lines.
- **Responsibility/callers/callees:** Vercel route for GET/PUT/DELETE; called by sync, inventory, and operational tools; calls HTTP, state, audit, alert, merge, safeguard, and image-reference helpers.
- **Contract:** request method/query/body/headers/environment -> HTTP status, JSON/ETag/cache headers. Reads/writes all allowed state keys; writes audit/alerts; exhibition PUT can cause Blob work through image migration. No DOM.
- **Globals/errors/rollback:** allowlists, thresholds, environment secrets/config; converts validation/conflict/invariant failures to 4xx and unexpected failures to 5xx. Database writes are not a browser transaction; audit/state ordering and partial-failure behavior require integration tests.
- **Risk/boundary/test:** critical protocol hub. Retain a thin handler; extract request parsing, per-key policy, transfer views, and write orchestration only after a method/status/body/audit golden matrix.

### 2. `schedulePush`

- **Location/environment/size:** `cloud-sync.js:940-1069`; browser; approximately 130 lines including debounced callback.
- **Responsibility/callers/callees:** queues remote state writes; called by storage interception and `queuePushWithBaseline`; calls transfer shaping, `fetch`, metadata/signature updates, and conflict refresh.
- **Contract:** key/value/options -> scheduled side effect. Reads active-key/config maps and remote versions; writes timer/signature/status metadata; PUTs `/api/state`. No direct feature DOM, but status/events affect pages.
- **Globals/errors/rollback:** pending timers, client ID, sync maps, debounce constant. Network/HTTP failures retain local state but do not provide transactional rollback; conflict/rejection can trigger pull.
- **Risk/boundary/test:** critical lost-update boundary. Extract a `StateTransport.push` adapter behind unchanged scheduling only after fake-clock/fake-fetch tests for coalescing, delta/full payloads, 200/409/422/500, and re-entrant storage writes.

### 3. `pullRemoteState`

- **Location/environment/size:** `cloud-sync.js:1070-1242`; browser; approximately 170 lines.
- **Responsibility/callers/callees:** startup/refresh pull and local application; called during initialization and conflict recovery; calls ETag/meta helpers, per-key merge/drop decisions, native storage setter, and custom events.
- **Contract:** requested active keys and current local/meta state -> local updates, push-backs, status, readiness, and `cloud-sync:state-applied`. GETs `/api/state`; reads/writes synchronized local keys and session metadata.
- **Globals/errors/rollback:** remote-apply guard, ETags, signatures, cached remote data, readiness resolver. Errors leave the previous local projection; exact readiness/failure signaling needs characterization.
- **Risk/boundary/test:** critical ordering/merge hub. Separate transport, reconciliation decision, and application ports only after fixtures cover 304, missing keys, local-newer, remote-newer, preview preservation, suspicious drops, and material-order merge.

### 4. `safeSetLocalStorageItem`

- **Location/environment/size:** `auth.js:94-174`; browser; approximately 80 lines.
- **Responsibility/callers/callees:** compatibility write wrapper used directly or through sync; calls quota detection, serialized exhibition compaction, stored-state compaction, native storage operations, and user-visible failure paths.
- **Contract:** key/string -> success indicator with possible compacted value. Reads/writes target key and `exhibitions`; may remove heavy legacy image fields. No network/database.
- **Globals/errors/rollback:** native storage methods and alert/console behavior. Retries in escalating modes; cannot restore fields stripped during successful emergency compaction except from remote/backup sources.
- **Risk/boundary/test:** critical data-preservation utility misplaced in auth. Extract a storage adapter only after quota exception simulations prove call order, returned value, non-exhibition behavior, field retention, and final failure behavior.

### 5. `saveExhibition`

- **Location/environment/size:** `exhibition-detail.js:8655` onward, before late initialization/bindings; browser; approximate span must be remeasured at extraction.
- **Responsibility/callers/callees:** persistence funnel for many detail edits; called by inventory, sales, accounting, info, and file handlers; invokes normalization/backup/storage and relies on cloud interception.
- **Contract:** mutable `exhibitionDetailState` -> updated exhibition list in local storage and queued remote delta. Reads active exhibition/index and stored exhibitions; writes compatibility fields, timestamps/backups, and `exhibitions`.
- **Globals/errors/rollback:** page state, `safeSetLocalStorageItem`, undo/backup state. Storage failure handling is delegated; many callers mutate first, so rollback is feature-specific rather than atomic.
- **Risk/boundary/test:** critical aggregate save boundary. Introduce an `ExhibitionRepository.save(existingList, updatedExhibition)` port only after full serialized before/after fixtures, unknown-field preservation, backup, and quota-failure tests.

### 6. `renderWorksManagement` (controlling declaration)

- **Location/environment/size:** duplicate declarations at `exhibition-detail.js:5539` and `:6247`; browser; later declaration controls due to function hoisting; each is a large rendering section.
- **Responsibility/callers/callees:** builds artwork management UI; called by tab/mode render orchestration; calls filtering, row/preview/edit/selection/certificate and action-state helpers.
- **Contract:** container plus mutable detail state -> DOM tree and event/global-handler wiring. Reads works/`artWorks`, users/roles, selection/edit buffers and image fields; may initiate mutations through bound handlers.
- **Globals/errors/rollback:** extensive page globals and DOM IDs/classes. Render exceptions can leave partial DOM; no rollback. Duplicate-definition behavior is itself an implicit compatibility contract.
- **Risk/boundary/test:** critical override-order hazard. First characterize which declaration executes and why; then remove shadowing in an isolated stage before extracting a page-local works view/controller behind DOM snapshots and interaction tests.

### 7. `renderCalendar`

- **Location/environment/size:** `studio.js:887-1092`; browser; approximately 205 lines, with month rendering delegated separately.
- **Responsibility/callers/callees:** week/month calendar composition; called by `renderAll` and navigation/state changes; calls date/occurrence/occupancy/lane/cell/event render helpers.
- **Contract:** calendar/view/week state -> calendar DOM and interactive elements. Reads events/base rules/overrides, role, selection, viewport state; writes DOM and transient element references.
- **Globals/errors/rollback:** studio state and fixed DOM structure. Render failure has no DOM rollback; rerender is recovery.
- **Risk/boundary/test:** critical projection hub. Keep orchestration page-local; extract pure `buildCalendarProjection` only after golden week/month models and desktop/mobile DOM screenshots.

### 8. `saveEventFromModal`

- **Location/environment/size:** `studio.js:2391` through the next modal/calendar operation; browser; approximately 100+ lines.
- **Responsibility/callers/callees:** validates and creates/updates event/modal state, including recurring behavior; called by modal save; calls date/slot/occupancy/base-rule validation, ID creation, save, render, and modal cleanup.
- **Contract:** modal fields plus edit context -> changed calendar state or validation message. Reads/writes events/rules/edit state and local calendar storage; indirect network write; mutates DOM.
- **Globals/errors/rollback:** studio state, DOM controls, role/context. Validation aborts before save; post-mutation storage failure has no general transaction rollback.
- **Risk/boundary/test:** high business mutation. Extract draft parsing and pure command planning before mutation; fixtures must cover create/edit, invalid ranges, capacity/overlap, overnight boundaries, and repeat settings.

### 9. `finalizeMasterCalendarEdit`

- **Location/environment/size:** `studio.js:1745` through the next pointer finalizer/helper section; browser; approximately 80+ lines.
- **Responsibility/callers/callees:** commits pointer move/resize; called on pointer/touch completion; calls coordinate conversion, placement validation, recurring decision/UI, save/render/reset.
- **Contract:** client coordinates plus active edit state -> committed event change, recurring prompt, or cancellation. Reads/writes event/edit state and DOM previews; indirect storage/network effects.
- **Globals/errors/rollback:** pointer IDs, viewport geometry, active preview elements. Invalid placement resets preview; committed state relies on undo/next edit rather than transaction rollback.
- **Risk/boundary/test:** high hot-path finalizer. Extract a pure edit command/result model after pointer geometry tests and one/following/all recurring fixtures.

### 10. `renderSalesManagement`

- **Location/environment/size:** `exhibition-detail.js:2591-2867`; browser; approximately 277 lines.
- **Responsibility/callers/callees:** full exhibition sales screen; called by inventory/sales tab rendering; calls sold-record normalization, filters, rows, summaries, permissions, dialogs, and action-state helpers.
- **Contract:** container plus sales/inventory/UI state -> interactive DOM. Reads works/goods/sold records, users/roles, edit/selection/filter state; bound actions mutate exhibition and save.
- **Globals/errors/rollback:** detail state and many DOM IDs. Rendering has no rollback; sales undo stacks protect selected mutations, not view construction.
- **Risk/boundary/test:** high mixed projection/controller. Extract sales selectors and view model before DOM builder; characterize empty/mixed item types, permissions, quantity/price, selection, and undo.

### 11. `initDetailPage`

- **Location/environment/size:** `exhibition-detail.js:503-560`; browser; approximately 58 lines.
- **Responsibility/callers/callees:** page composition root; called at load; waits for sync, parses query, loads exhibitions, restores backup/UI state, initializes compatibility, permissions, and first tab.
- **Contract:** URL/storage/cloud readiness/DOM -> initialized detail state or redirect/alert. Reads `exhibitions`, query, user and local UI/backup keys; can write restored state.
- **Globals/errors/rollback:** whole detail state and document. Catches initialization errors; redirect/alert behavior is user-visible; no transactional rollback.
- **Risk/boundary/test:** high orchestrator but should remain. Reduce only after dependencies become explicit ports; E2E test missing/invalid ID, denied access, cloud timeout, backup restore, and allowed initial tab.

### 12. `syncInventoryMode`

- **Location/environment/size:** `exhibition-detail.js:691-716`; browser; approximately 26 lines.
- **Responsibility/callers/callees:** switches active inventory representation/UI mode; called during initialization/tab changes; interacts with inventory UI snapshots and `works`/`artWorks`/goods arrays.
- **Contract:** mode -> mutated detail state/current list references. Reads/writes compatibility representations and UI state; no direct network, but later save persists results; may rerender DOM.
- **Globals/errors/rollback:** active exhibition and inventory UI state. Assumes normalized arrays; no explicit error or rollback.
- **Risk/boundary/test:** high despite size because alias semantics are unclear. Do not extract until identity/alias fixtures prove behavior when fields are missing, distinct, shared, or divergent.

### 13. `renderOrdersTable`

- **Location/environment/size:** `pottery-material-orders.js:308-414`; browser; approximately 107 lines.
- **Responsibility/callers/callees:** material-order table orchestrator; called on load/filter/month/edit changes; calls grouping, row builders, rowspan metadata, manual merges, selection, resize and navigation setup.
- **Contract:** order/filter/edit state -> table DOM and grid behavior. Reads orders, buffers, merge metadata, permissions; writes DOM/navigation anchors and listeners.
- **Globals/errors/rollback:** page state and fixed table DOM. Rerender is recovery; no partial DOM rollback.
- **Risk/boundary/test:** high structural hotspot. Extract pure row/group view model before markup; test multi-line orders, discounts/shipping, edit/read modes, filters, manual merges, and keyboard focus.

### 14. `applyManualCellMerge` / `applyManualCellMerges`

- **Location/environment/size:** `pottery-material-orders.js:2848-3060+`; browser; over 200 lines across merge operations/orchestration.
- **Responsibility/callers/callees:** validates and applies user-defined table row/column merges; called by merge controls and post-render; calls grid selection, metadata, DOM span/hide operations, persistence/render.
- **Contract:** table plus selection/context -> merge metadata and modified table DOM. Reads/writes manual merge state and order presentation; persistence may trigger synchronized save.
- **Globals/errors/rollback:** selection anchors, table coordinates, undo snapshots. Invalid selections abort with UI feedback; undo snapshots are the compensating mechanism.
- **Risk/boundary/test:** high due to coupling of model and rendered coordinates. Define a pure rectangular merge model first; test overlap, hidden cells, row boundaries, undo, rerender, and keyboard navigation.

### 15. `renderStudents`

- **Location/environment/size:** `pottery-students.js:576` through student-row helper section; browser; approximately 60+ lines.
- **Responsibility/callers/callees:** student table projection; called by initialization, mutations, cloud events, and periodic recompute; calls visibility, payment/class stats, formatting, action builders.
- **Contract:** students/calendar/current time/role -> table DOM and action wiring. Reads student/payment/calendar state; writes DOM and transient selection/edit state.
- **Globals/errors/rollback:** page state, timer-driven current time, fixed DOM. Bad record/calculation can break a render; next render is recovery.
- **Risk/boundary/test:** high because business calculations occur per row. Extract student row view-model calculation before markup; golden tests need role filtering and representative payment/attendance histories.

### 16. `getStudentClassStats`

- **Location/environment/size:** `pottery-students.js:1627-1683`; browser; approximately 57 lines.
- **Responsibility/callers/callees:** derives attendance/credit statistics; called by table/detail rendering; calls calendar occurrence, date, class-type, payment-cycle and adjustment helpers.
- **Contract:** student name plus implicit students/calendar/current date -> statistics object. Reads page state; no intended writes/network/DOM.
- **Globals/errors/rollback:** mutable calendar/student state and current time. Invalid/missing records generally fall back; no rollback needed.
- **Risk/boundary/test:** high pure-logic candidate once inputs are explicit. Extract early after fixtures for no payment, multiple cycles, carry-over, manual adjustments, recurring classes, cancellations, and boundary dates.

### 17. `renderDetailPaymentClassTable`

- **Location/environment/size:** `pottery-students.js:1139` through next detail helper; browser; approximately 80-100 lines.
- **Responsibility/callers/callees:** correlates payments and classes into grouped detail rows/rowspans; called by detail modal; calls payment normalization, class occurrence and formatting helpers.
- **Contract:** student plus calendar -> detail-table DOM. Reads payment/current class data; writes DOM only.
- **Globals/errors/rollback:** detail modal/table and current date. No rollback; malformed histories can produce misleading groupings.
- **Risk/boundary/test:** medium-high. Extract a payment/class grouping projection first; snapshot rows for legacy IDs, missing records, same-day entries, cycle boundaries, and rowspan counts.

### 18. `buildAutoEntries`

- **Location/environment/size:** `pottery-accounting.js:619-690`; browser; approximately 72 lines plus delegated calculators.
- **Responsibility/callers/callees:** dispatches automatic financial-entry generation by tab/side/category; called by category snapshot/finance build; calls class, personal-work, material, and gallery calculators.
- **Contract:** tab/side/category/month -> derived entry array. Reads exhibitions, students, personal work, material orders, calendar; no intended writes/network/DOM.
- **Globals/errors/rollback:** page datasets and category constants. Unsupported combinations return empty results; no rollback needed.
- **Risk/boundary/test:** high financial policy dispatcher. Extract with explicit dataset bundle and preserve category IDs/order/rounding; golden monthly totals and row identities are required.

### 19. `collectClassOccurrencesByStudentInMonth`

- **Location/environment/size:** `pottery-accounting.js:816-889`; browser; approximately 74 lines.
- **Responsibility/callers/callees:** expands and groups calendar class occurrences for accounting; called by class revenue calculation; calls recurrence/date/end-time/name normalization helpers.
- **Contract:** month key plus implicit calendar -> map/list grouped by student. Reads calendar state; no writes/network/DOM.
- **Globals/errors/rollback:** calendar event conventions and month/date utilities. Invalid events are skipped/fallback-handled; no rollback.
- **Risk/boundary/test:** high semantic duplicate of studio/student occurrence logic. Move only after a cross-consumer occurrence fixture suite proves month edges, weekly repeats, end dates, overnight times, names, exclusions, and duplicates.

### 20. `renderTable` / `buildEntryRow` (personal work)

- **Location/environment/size:** `pottery-personal-work.js:300-509`; browser; roughly 210 lines across orchestrator and row builder.
- **Responsibility/callers/callees:** active/dormant personal-work tables and editable rows; called by load, timer, sync, and mutations; calls cycle usage/payment calculations and modal/edit actions.
- **Contract:** entries/users/calendar/current date/role -> table DOM and handlers. Reads three local datasets; writes DOM/edit state; handlers persist personal-work entries.
- **Globals/errors/rollback:** page state, timer, fixed DOM. Rerender recovers view; edit/delete/payment operations have local validation but no cross-storage transaction.
- **Risk/boundary/test:** medium-high. Extract entry view models separately from row elements; test active/dormant, overdue payment, cycle usage, permissions, edit cancellation, and 60-second refresh.

### 21. `applyExhibitionSnapshotRow`

- **Location/environment/size:** `api/_lib/exhibition-snapshot-store.js:545-585`; server; approximately 41 lines.
- **Responsibility/callers/callees:** applies a selected database/archive snapshot to live exhibition state; called by restore and undo; calls payload/archive extraction, state read/write, and restore-marker helpers.
- **Contract:** snapshot row/restoredBy/options -> restored result. Reads snapshot/archive and `exhibitions`; writes live state and restoration metadata; may read Blob archive. No DOM.
- **Globals/errors/rollback:** retention/archive configuration and DB connection. Throws on missing/invalid snapshot; undo is a separate compensating flow, not an atomic rollback if marker/state writes diverge.
- **Risk/boundary/test:** high recovery boundary. Keep orchestration explicit; integration-test database payload, archive fallback, missing exhibition, concurrent state, marker failure, and undo-point creation.

### 22. `migrateExhibitionImageReferences`

- **Location/environment/size:** `api/_lib/exhibition-image-refs.js:226-326`; server; approximately 101 lines.
- **Responsibility/callers/callees:** traverses exhibitions, uploads eligible data URLs within budget, normalizes fields, and reports stats; called by state PUT and explicit migration route.
- **Contract:** exhibitions/options -> cloned exhibitions plus migration statistics. Reads compatibility image fields; may write Blob; returns transformed JSON for later state persistence. No DOM.
- **Globals/errors/rollback:** Blob token, upload budget, list/field constants. Individual failures/budget exhaustion are represented in stats according to current behavior; orphan/partial Blob writes cannot be transactionally rolled back with Postgres.
- **Risk/boundary/test:** high mixed runtime/migration behavior. Separate pure scan/plan/apply after fixtures; do not change policy during structural refactor. Test each field combination, budget, invalid data URL, upload failure, URL preservation, and idempotence.

### 23. `mergeUsersWithDelta`

- **Location/environment/size:** `api/state.js:349-387`; server; approximately 39 lines.
- **Responsibility/callers/callees:** applies changed users and explicit removals; called by state PUT; calls identity indexing/matching and password-preserving merge helpers.
- **Contract:** current users/incoming users/removed IDs -> merged users. Reads only arguments; no direct DB/network/DOM write.
- **Globals/errors/rollback:** user identity conventions. Assumes normalized arrays; invariants/drop detection occur later in handler. Pure calculation requires no rollback.
- **Risk/boundary/test:** high security/data function and good early server extraction only after exhaustive identity collision, password, unknown-field, add/update/remove, duplicate, and ordering fixtures.

### 24. `detectLargeUnexpectedInventoryDrop`

- **Location/environment/size:** `api/state.js:181-224`; server; approximately 44 lines.
- **Responsibility/callers/callees:** detects destructive exhibition inventory changes; called before state persistence; calls inventory counts and clear-marker checks.
- **Contract:** current/incoming values/options -> drop detail or null. Reads arguments and threshold constants; no writes/network/DOM.
- **Globals/errors/rollback:** minimum previous/absolute/ratio constants. Malformed/missing lists follow current count semantics; handler performs rejection/audit/alert.
- **Risk/boundary/test:** critical safety predicate and strong early extraction candidate after tests. Cover below/at/above thresholds, missing exhibitions, delta touched IDs, explicit clear markers, all inventory arrays, malformed values, and multiple drops.

## Candidates deliberately deferred

- Role normalization helpers are duplicated but should be extracted only after a page-by-page role truth table; centralizing first could widen an existing inconsistency.
- Date, currency, and escaping helpers should be grouped by proven contract, not matching names. Locale, timezone, mutation, invalid-input, output-context, and rounding differences matter.
- `Storage.prototype` overrides should not be removed while page scripts still write native local storage directly.
- `works`/`artWorks`, image fields, student payment structures, and calendar state shapes are data contracts and require separate migration work.
