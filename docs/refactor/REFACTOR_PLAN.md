# Refactor Plan

## Rules and required evidence

This is the executable sequence. Stage 0 is not authorized by this revision. Every numbered unit is independently branchable, testable, committable, and revertible.

- Start only from the approved DDL-free runtime. Preserve behavior, globals, script order, storage keys/shapes, HTTP/SQL/Blob contracts, CSS, errors, and compatibility reads.
- Use one branch and reviewable commit series per stage. Never combine stages because they touch the same file.
- All live tests use isolated DEV and reversible synthetic fixtures. Production URLs, data, credentials, Blob stores, and aliases are forbidden.
- A future DEV requirement below is not deployment authorization now. Rollback is a source revert, never live data repair.
- Before each function extraction, record the original function/family, responsibilities, globals, and side effects. Afterward record extracted functions, destination, explicit inputs/outputs, remaining side effects, and controller responsibilities. Moving an unchanged giant function is not refactoring.
- A page is complete when it primarily owns startup, DOM lookup/binding, module/adapter calls, rendering coordination, focus/selection, cloud subscriptions, and lifecycle. It should not retain substantial calculations, compatibility transformations, raw Blob/fetch/persistence, or complex mutations. No line-count target applies.

## Sequence

### Stage 0: Characterization and test harness
- **Branch/objective:** `refactor/00-characterization-harness`; establish a production-blocked baseline before source extraction.
- **Source/targets/modules:** `package.json`, new `tests/**`, minimal neutral seams only if unavoidable; cover state/API, cloud globals/storage, all page startups, exhibitions, images, certificates, snapshots, and DDL absence; create test configuration, guards, fakes, and fixtures only.
- **Identical behavior:** all application, API, storage, Blob, snapshot, certificate, and sync behavior.
- **Before/after tests:** before, verify the DDL-free baseline, isolated DEV identities, reversible fixture namespace, and hard failures on production or owner/migration credentials; after, run unit/API/browser tests plus DEV exhibition list/detail load, state read/write, artwork edit, image upload/reload, Blob-reference preservation, certificate generation including Blob-backed art, snapshot create/read and cron, no runtime DDL, and no Blob-backed image regression to embedded base64.
- **DEV/acceptance:** isolated DEV required; synthetic writes and Blob objects return exactly to baseline, suites repeat, and hooks do not alter runtime.
- **Abort/rollback:** abort on any production reachability, unprovable cleanup, missing compatibility fixture, or behavior-changing hook; revert tests/seams and verify DEV/application baseline.

### Stage 1: First accounting category calculator
- **Branch/objective:** `refactor/01-accounting-gallery-sales`; prove the workflow on one low-side-effect calculation.
- **Source/targets/modules:** `pottery-accounting.js` and HTML; extract `buildGallerySalesAutoEntries` and only required pure selectors to cohesive `accounting/auto-entries.js` (transitional path allowed).
- **Identical behavior:** identities, item types, quantities, commission/rounding, order, totals.
- **Before/after tests:** gallery-sales monthly goldens and page startup before; old/new rows/totals, script order, page E2E, unchanged persisted state after.
- **DEV/acceptance:** isolated DEV fixed-month smoke required; explicit inputs, no DOM/storage/network in extracted code, complete extraction record.
- **Abort/rollback:** abort on any row/value/order difference or page-global dependency; revert module, caller, and script tag.

### Stage 2: Student payment and credit calculations
- **Branch/objective:** `refactor/02-student-payment-credit`; isolate payment cycles, carry-over, adjustments, and credit calculations.
- **Source/targets/modules:** `pottery-students.js` and HTML; payment normalization/calculation family and class-count inputs used by `getStudentClassStats`; create cohesive `students/payment-cycles.js`.
- **Identical behavior:** legacy IDs, precedence, carry-over, adjustments, date boundaries, balances.
- **Before/after tests:** legacy/current records and frozen-clock class counts before; old/new outputs, table values, unchanged serialization after.
- **DEV/acceptance:** isolated DEV synthetic student/payment workflow required; calculations have explicit record/calendar/date inputs and page retains UI/effects.
- **Abort/rollback:** abort on balance/count/order/visibility differences; revert module/callers/script.

### Stage 3: Personal-work cycle and usage calculations
- **Branch/objective:** `refactor/03-personal-work-cycles`; isolate cycle, payment-required, dormancy, and usage calculations.
- **Source/targets/modules:** `pottery-personal-work.js` and HTML; `getCycleUsageHours`, `getCurrentCycleRange`, payment/date/dormancy family; create cohesive `personal-work/cycles.js`, splitting `usage.js` only if independently reusable.
- **Identical behavior:** boundaries, durations/rounding, payments, dormancy, overdue state, rows.
- **Before/after tests:** frozen active/dormant/legacy fixtures before; old/new parity, ticker behavior, table/detail E2E, unchanged records after.
- **DEV/acceptance:** isolated DEV synthetic entry/calendar workflow required; pure calculations, page-owned timer/DOM/modal/persistence.
- **Abort/rollback:** abort on any cycle/usage/payment/refresh difference; revert module/callers/script.

### Stage 4: Server inventory-drop policy
- **Branch/objective:** `refactor/04-state-inventory-drop`; extract the first central predicate only after Stages 1-3 prove the workflow.
- **Source/targets/modules:** `api/state.js`; `detectLargeUnexpectedInventoryDrop` and cohesive count/marker helpers; create `server/state/inventory-drop-policy.js` or colocate in state safety.
- **Identical behavior:** thresholds, touched IDs, malformed/missing counts, clear marker, result, status/audit reason.
- **Before/after tests:** Stage 0 predicate/handler goldens and Stage 1 DEV evidence before; old/new parity, handler/audit/alert and DDL scan after.
- **DEV/acceptance:** isolated DEV restricted-role reversible API smoke required; pure explicit contract and complete extraction record.
- **Abort/rollback:** abort on policy/status/audit/mutation difference; restore inline family.

### Stage 5: Server user identity and merge
- **Branch/objective:** `refactor/05-state-user-merge`; isolate identity matching and delta merge.
- **Source/targets/modules:** `api/state.js`; identity/index/find, password-preserving single merge, `mergeUsersWithDelta`; create `server/state/user-merge.js`.
- **Identical behavior:** identity precedence/collisions, order, unknown fields, passwords, removals.
- **Before/after tests:** exhaustive pure and handler goldens before; merge, PUT persistence/audit, DDL scan after.
- **DEV/acceptance:** isolated DEV synthetic-user smoke required; pure merge and unchanged invariant ownership.
- **Abort/rollback:** abort on field/order/password/removal difference; restore inline functions.

### Stage 6: Server user invariants
- **Branch/objective:** `refactor/06-state-user-invariants`; isolate drop, missing-password, and admin-presence predicates.
- **Source/targets/modules:** `api/state.js`; `detectSuspiciousUserDrop`, `hasUsersWithMissingPasswords`, `hasAtLeastOneAdminWithPassword`, role predicate; colocate with user merge unless a separate contract is justified.
- **Identical behavior:** thresholds, role labels, removal allowances, statuses, audit/alert reasons.
- **Before/after tests:** predicate and handler rejection goldens before; parity, API/audit/alert, DDL scan after.
- **DEV/acceptance:** isolated DEV rejected-write smoke with synthetic users required; pure predicates, no auth/schema change.
- **Abort/rollback:** abort on any decision/audit difference; restore inline predicates.

### Stage 7: Student detail projection
- **Branch/objective:** `refactor/07-student-detail-projection`; separate payment/class grouping from modal DOM.
- **Source/targets/modules:** `pottery-students.js`; calculation portion of `renderDetailPaymentClassTable`; create `students/student-projection.js` or colocate with payment cycles.
- **Identical behavior:** grouping/order, legacy IDs, boundaries, rowspans, cells.
- **Before/after tests:** empty/current/legacy row snapshots before; projection parity, DOM/modal/page E2E after.
- **DEV/acceptance:** isolated DEV detail smoke required; explicit inputs and page-owned DOM/lifecycle.
- **Abort/rollback:** abort on row/group/span/focus/action difference; restore inline grouping.

### Stage 8: Canonical date and slot primitives
- **Branch/objective:** `refactor/08-calendar-primitives`; establish primitives for one occurrence engine.
- **Source/targets/modules:** compare `pottery-master-calendar.js` and consumers; proven-equivalent slot/time/date/range functions; create `core/date-time.js` or calendar-local module.
- **Identical behavior:** timezone, invalid input, mutation, `24:00`, boundaries.
- **Before/after tests:** cross-file semantic matrix before; pure old/new parity after; no consumer switch required.
- **DEV/acceptance:** no DEV deploy if no caller changes, otherwise required; combine only equivalent contracts.
- **Abort/rollback:** abort on unexplained semantic divergence; remove module/revert switched caller.

### Stage 9: Canonical occurrence expansion
- **Branch/objective:** `refactor/09-calendar-occurrences`; create one canonical engine without adoption.
- **Source/targets/modules:** `pottery-master-calendar.js` as owner, consumers as comparisons; event/date/weekly/end/override/exclusion family; create `studio/calendar-occurrences.js`.
- **Identical behavior:** studio inclusion/order/ranges/recurrence/overnight/overrides.
- **Before/after tests:** shared consumer semantics corpus before; canonical parity and immutability after.
- **DEV/acceptance:** no deploy until adoption; explicit events/rules/overrides/range/timezone inputs and no consumer forks.
- **Abort/rollback:** abort if semantics require unexplained recurrence forks; remove unadopted module.

### Stage 10: Adopt occurrences in students
- **Branch/objective:** `refactor/10-occurrences-students`; migrate only student attendance consumers.
- **Source/targets/modules:** `pottery-students.js`; occurrence portions of counts/stats/detail; thin attendance filter only if meaningful.
- **Identical behavior:** counts, cancellations, names, payment boundaries, details.
- **Before/after tests:** shared and student goldens before; calculation/DOM/E2E and unchanged state after.
- **DEV/acceptance:** isolated DEV student workflow required; adapter filters canonical results and does not expand recurrence.
- **Abort/rollback:** abort on count/order/detail difference or duplication; switch callers back.

### Stage 11: Adopt occurrences in personal work
- **Branch/objective:** `refactor/11-occurrences-personal-work`; migrate only usage consumers.
- **Source/targets/modules:** `pottery-personal-work.js`; usage collection/history; thin user/duration adapter only.
- **Identical behavior:** event inclusion, boundaries, duration/rounding, order.
- **Before/after tests:** usage goldens before; cycle/usage/E2E after.
- **DEV/acceptance:** isolated DEV workflow required; no recurrence code in adapter.
- **Abort/rollback:** abort on usage/history difference or recurrence copy; restore old callers.

### Stage 12: Adopt occurrences in accounting
- **Branch/objective:** `refactor/12-occurrences-accounting`; replace accounting expansion with a thin grouping adapter.
- **Source/targets/modules:** `pottery-accounting.js`; recurrence portion of `collectClassOccurrencesByStudentInMonth`; colocate adapter with auto entries.
- **Identical behavior:** grouping, inclusion, month boundaries, order, revenue inputs.
- **Before/after tests:** old/new maps and totals before; canonical/filter parity and totals/exports after.
- **DEV/acceptance:** isolated DEV fixed-month smoke required; accounting only filters/groups canonical occurrences.
- **Abort/rollback:** abort on map/amount difference; restore collector.

### Stage 13: Adopt occurrences in studio
- **Branch/objective:** `refactor/13-occurrences-studio`; switch week/month query paths last.
- **Source/targets/modules:** `pottery-master-calendar.js`; rendering occurrence queries; no second engine or new module.
- **Identical behavior:** visible events, lanes/order, selection, pointer targets.
- **Before/after tests:** projection goldens/screenshots/pointer E2E before; unit/browser/visual/pointer suites after.
- **DEV/acceptance:** isolated DEV calendar workflow required; all four consumers share one engine.
- **Abort/rollback:** abort on event/coordinate/lane/consumer difference; restore studio callers.

### Stage 14: Remaining accounting category calculators
- **Branch/objective:** `refactor/14-accounting-calculators`; extract class, personal-work, material, and dispatch calculations.
- **Source/targets/modules:** `pottery-accounting.js`; `buildPotteryClassRevenueEntries`, `buildPotteryPersonalWorkRevenueEntries`, `buildPotteryMaterialExpenseEntries`, `buildAutoEntries`; extend cohesive `auto-entries.js`.
- **Identical behavior:** category IDs, identities, dedupe, order, rounding, amounts.
- **Before/after tests:** category rows/totals before; old/new dispatch and page smoke after.
- **DEV/acceptance:** isolated DEV fixed-month smoke required; explicit dataset bundle, canonical occurrences, no DOM/storage.
- **Abort/rollback:** abort on row/total/order difference; restore inline calculators.

### Stage 15: Accounting merge and totals
- **Branch/objective:** `refactor/15-accounting-merge-totals`; isolate manual/fixed/override precedence and finance totals.
- **Source/targets/modules:** `pottery-accounting.js`; `mergeCategoryEntries`, calculation portions of `buildCategorySnapshot`/`buildFinanceForTab`; create `accounting/finance-projection.js` if cohesive.
- **Identical behavior:** override keys, fixed activation, order, category/side/tab totals.
- **Before/after tests:** merge/month goldens before; projection/render and unchanged manual state after.
- **DEV/acceptance:** isolated DEV smoke required; pure inputs/outputs and page-owned rendering/persistence.
- **Abort/rollback:** abort on precedence/identity/order/total difference; restore inline functions.

### Stage 16: Accounting export projection
- **Branch/objective:** `refactor/16-accounting-export`; separate export rows from XLSX/download effects.
- **Source/targets/modules:** `pottery-accounting.js`; `buildExportRows` and pure preparation in `exportCurrentTabToExcel`; colocate unless independently reusable.
- **Identical behavior:** rows/columns/order/labels/values/rounding/filename inputs.
- **Before/after tests:** reviewed row/workbook snapshots before; row parity, artifact checks, E2E after.
- **DEV/acceptance:** isolated DEV synthetic export required; pure projection separated from effects.
- **Abort/rollback:** abort on any cell/order/style/output difference; restore inline preparation.

### Stage 17: Material-order totals and model
- **Branch/objective:** `refactor/17-material-order-model`; isolate totals, identities, discounts, shipping, grouping.
- **Source/targets/modules:** `pottery-material-orders.js`; pure model family; create `material-orders/order-model.js`.
- **Identical behavior:** quantities, allocation, totals, identity/order.
- **Before/after tests:** read/edit/export goldens before; parity/page totals after.
- **DEV/acceptance:** isolated DEV smoke required; explicit inputs and no DOM/storage/global state.
- **Abort/rollback:** abort on total/group/identity difference; restore inline model.

### Stage 18: Material-order row projection
- **Branch/objective:** `refactor/18-material-order-projection`; produce immutable rows before HTML.
- **Source/targets/modules:** `pottery-material-orders.js`; grouping/rowspans behind `renderOrdersTable` and row builders; create `order-projection.js`.
- **Identical behavior:** row order/spans/values/modes/permissions/filters.
- **Before/after tests:** multi-line/filter DOM goldens before; projection and DOM parity after.
- **DEV/acceptance:** isolated DEV read/edit smoke required; renderer consumes explicit DOM-free rows.
- **Abort/rollback:** abort on row/span/value/action difference; restore inline projection.

### Stage 19: Material-order grid merge planning
- **Branch/objective:** `refactor/19-grid-merge-plan`; separate rectangular merge policy from DOM.
- **Source/targets/modules:** `pottery-material-orders.js`; pure logic within `applyManualCellMerge(s)`; create `grid-merge-model.js`.
- **Identical behavior:** validity, metadata, overlap, undo plan.
- **Before/after tests:** coordinate/metadata goldens before; old/new malformed/overlap/boundary plans after.
- **DEV/acceptance:** no deploy if unadopted; planner returns operations without DOM/storage.
- **Abort/rollback:** abort on plan/validity difference; remove planner/revert caller.

### Stage 20: Material-order grid DOM adoption
- **Branch/objective:** `refactor/20-grid-merge-dom`; apply Stage 19 plans in existing DOM flow.
- **Source/targets/modules:** `pottery-material-orders.js`; DOM portions, post-render merge, undo/focus/navigation; no module unless cohesive.
- **Identical behavior:** spans/visibility/focus/selection/keyboard/undo/metadata.
- **Before/after tests:** browser/visual/keyboard baseline before; full table/merge/export suite after.
- **DEV/acceptance:** isolated DEV desktop/mobile workflow required; DOM applies but does not recalculate policy.
- **Abort/rollback:** abort on coordinate/focus/undo/state difference; restore direct implementation.

### Stage 21: Resolve works renderer shadowing
- **Branch/objective:** `refactor/21-works-shadowing`; prove and remove/rename only unreachable duplicate code.
- **Source/targets/modules:** `exhibition-detail.js`; both `renderWorksManagement` declarations and helper resolution; no module.
- **Identical behavior:** works DOM, roles, edits, images, certificates, compatibility.
- **Before/after tests:** call/evaluation/history proof and full role/mode E2E before; identical suite and one controlling declaration after.
- **DEV/acceptance:** isolated DEV works workflow required; removed code is proven unreachable.
- **Abort/rollback:** abort if both paths are reachable or parity incomplete; restore declaration exactly.

### Stage 22: Exhibition sales model
- **Branch/objective:** `refactor/22-exhibition-sales`; isolate sales selection/filter/sort/quantity/summary.
- **Source/targets/modules:** `exhibition-detail.js`; pure selectors used by `renderSalesManagement`; create `exhibitions/sales-model.js`.
- **Identical behavior:** types, identities/order, totals/quantities, permission inputs, undo snapshots.
- **Before/after tests:** empty/mixed/legacy model and DOM fixtures before; selector/DOM/action/state parity after.
- **DEV/acceptance:** isolated DEV sales workflow required; explicit inputs, no DOM/storage in model.
- **Abort/rollback:** abort on row/total/order/action difference; restore selectors.

### Stage 23: Exhibition accounting projection
- **Branch/objective:** `refactor/23-exhibition-accounting`; isolate revenue/expense rows and totals.
- **Source/targets/modules:** `exhibition-detail.js`; pure portions of accounting row/render family; create `exhibitions/accounting-projection.js`.
- **Identical behavior:** identity/order, amounts/totals, edit/undo inputs, labels.
- **Before/after tests:** row/total/DOM goldens before; projection and interaction E2E after.
- **DEV/acceptance:** isolated DEV workflow required; page retains DOM/actions/persistence.
- **Abort/rollback:** abort on row/amount/action difference; restore inline calculations.

### Stage 24: Exhibition export model
- **Branch/objective:** `refactor/24-exhibition-export`; separate non-certificate export preparation from effects.
- **Source/targets/modules:** `exhibition-detail.js`; sales/accounting/file export rows/names; create `exhibitions/export-model.js` when cohesive.
- **Identical behavior:** files/rows/cells/order/labels/styles/filenames.
- **Before/after tests:** artifact snapshots before; projection and download/export E2E after.
- **DEV/acceptance:** isolated DEV synthetic export required; JSZip/XLSX/download effects remain controller/adapter owned.
- **Abort/rollback:** abort on artifact difference; restore inline preparation.

### Stage 25: Exhibition snapshot client
- **Branch/objective:** `refactor/25-exhibition-snapshots`; isolate existing snapshot network adaptation.
- **Source/targets/modules:** `exhibition-detail.js`; list/create/restore/undo/refresh fetch family; create `exhibitions/snapshot-client.js`.
- **Identical behavior:** URL/method/body/status/errors/refresh order/render results.
- **Before/after tests:** fake-fetch and DEV baseline before; request parity and snapshot E2E after.
- **DEV/acceptance:** isolated DEV reversible exhibition required; client adapts network, page owns UI, repository owns state.
- **Abort/rollback:** abort on request/error/refresh difference; restore inline fetch.

### Stage 26: Browser artwork-image subsystem
- **Branch/objective:** `refactor/26-artwork-images`; isolate browser image operations without data or Blob redesign.
- **Source/targets/modules:** `exhibition-detail.js`; selected image input, current resize/compression/preview, `getPhotoPreviewDataUrl`, `getPhotoDataUrl`, upload adaptation, reference resolution and temporary conversions; create `exhibitions/artwork-images.js`.
- **Identical behavior:** dimensions/quality, pending/full/preview precedence, request/result, Blob URL retention, compatibility reads, visible previews.
- **Before/after tests:** Stage 0 upload/reload/Blob/base64-regression suite and field/failure fixtures before; resolution/conversion/upload/reload/state parity after.
- **DEV/acceptance:** isolated DEV Blob workflow and cleanup required; explicit File/Blob/reference contract, no server migration/database/sales/general rendering.
- **Abort/rollback:** abort on quality/reference/URL/reload/base64/cleanup/error difference; restore inline code and remove synthetic objects.

### Stage 27: Certificate generator
- **Branch/objective:** `refactor/27-certificate-generator`; isolate existing single/batch certificate output.
- **Source/targets/modules:** `exhibition-detail.js`, templates read-only; template cache, certificate inputs, image resolution/conversion, workbook XML/image composition, `buildCertificateWorkbookBlob`, `buildAllCertificatesWorkbookBlob`, filenames; create `exhibitions/certificate-generator.js`.
- **Identical behavior:** template, cells, print area, image placement, Instagram placeholder, filename, errors, Blob-backed input.
- **Before/after tests:** Stage 0 legacy/Blob-backed single/batch artifacts and failures before; workbook/download parity and unchanged page-owned ready-state mutation after.
- **DEV/acceptance:** isolated DEV synthetic generation required; narrow generator returns output and owns no persistence, Blob persistence, artwork mutation, sales state, or general rendering.
- **Abort/rollback:** abort on workbook/layout/image/error/state-workflow difference; restore inline generator.

### Stage 28: Works selection and action projection
- **Branch/objective:** `refactor/28-works-projection`; isolate filtering/selection and permission/action state.
- **Source/targets/modules:** `exhibition-detail.js`; selectors/sorts/selected IDs/action enablement; create `exhibitions/works-management.js`.
- **Identical behavior:** `works`/`artWorks` reads, order, selection, role visibility/buttons.
- **Before/after tests:** all role/mode/legacy projections/DOM before; old/new and interaction E2E after.
- **DEV/acceptance:** isolated DEV works workflow required; explicit inputs and no normalization/DOM in projection.
- **Abort/rollback:** abort on row/order/permission difference; restore inline logic.

### Stage 29: Works-management controller adoption
- **Branch/objective:** `refactor/29-works-controller`; thin `renderWorksManagement` using works, image, and certificate contracts.
- **Source/targets/modules:** `exhibition-detail.js`, works module; remaining DOM/event coordination and image/certificate delegation; extend module or add controller only if cohesive.
- **Identical behavior:** markup/focus/selection/edit/save/delete/undo/images/certificates/globals/compatibility.
- **Before/after tests:** Stages 21/26-28 and screenshots before; full works/image/reload/Blob-certificate E2E after.
- **DEV/acceptance:** isolated DEV full works workflow required; controller has no substantial image conversion, certificate composition, persistence serialization, or selectors.
- **Abort/rollback:** abort on DOM/action/global/state difference; restore prior renderer/calls.

### Stage 30: Accounting page repository
- **Branch/objective:** `refactor/30-repository-accounting`; introduce the repository pattern on accounting only.
- **Source/targets/modules:** `pottery-accounting.js`; load/persist funnels; introduce `storage-adapter.js` and an accounting repository only if it owns meaningful serialization.
- **Identical behavior:** keys, defaults, shape/order, patched writes, push timing, no echo, offline/errors.
- **Before/after tests:** storage/cloud goldens before; serialization, one-push/no-echo, reload and page E2E after.
- **DEV/acceptance:** isolated DEV required; adapter delegates current writes and repository is not a state/sync wrapper.
- **Abort/rollback:** abort on value/push/reload difference; restore direct storage.

### Stage 31: Students page repository
- **Branch/objective:** `refactor/31-repository-students`; migrate student and calendar persistence funnels only.
- **Source/targets/modules:** `pottery-students.js`; student and student-triggered calendar load/save; reuse adapter and add repository only for domain serialization.
- **Identical behavior:** both keys, write order, event creation, push timing, offline/errors.
- **Before/after tests:** two-key storage/cloud goldens before; serialization, no-echo and page E2E after.
- **DEV/acceptance:** isolated DEV required; preserve two-key write order without a redundant client.
- **Abort/rollback:** abort on either value/order/push difference; restore direct storage.

### Stage 32: Personal-work page repository
- **Branch/objective:** `refactor/32-repository-personal-work`; migrate entry load/save only.
- **Source/targets/modules:** `pottery-personal-work.js`; entry parsing/defaults/persistence; repository only if normalization is meaningful.
- **Identical behavior:** key, defaults, record shape/order, push/offline/errors.
- **Before/after tests:** storage/page goldens before; serialization, no-echo, reload and E2E after.
- **DEV/acceptance:** isolated DEV required; storage adapter and repository stay distinct.
- **Abort/rollback:** abort on state/sync difference; restore direct storage.

### Stage 33: Material-orders page repository
- **Branch/objective:** `refactor/33-repository-material-orders`; migrate orders while preserving local product options.
- **Source/targets/modules:** `pottery-material-orders.js`; order persistence and local cache; repository only for meaningful serialization/cache policy.
- **Identical behavior:** synchronized key, local-only options, merge metadata, push/offline/errors.
- **Before/after tests:** both storage contracts and cloud merge fixtures before; serialization/cache/no-echo/grid E2E after.
- **DEV/acceptance:** isolated DEV required; synchronized and local-only data remain distinct.
- **Abort/rollback:** abort on either store or grid reload difference; restore direct storage/cache.

### Stage 34: Users page repository
- **Branch/objective:** `refactor/34-repository-users`; migrate user administration persistence without auth redesign.
- **Source/targets/modules:** `users.js`; user/current-user persistence funnels; user repository only for meaningful identity/session serialization; `auth.js` unchanged.
- **Identical behavior:** fields, passwords, deltas/removals, session refresh, push/offline/errors.
- **Before/after tests:** storage/API safeguards and page E2E before; serialization/no-echo/role/current-user tests after.
- **DEV/acceptance:** isolated DEV synthetic users only; no auth policy change or redundant state client.
- **Abort/rollback:** abort on user/session/invariant difference; restore direct storage.

### Stage 35: Exhibition-list repository
- **Branch/objective:** `refactor/35-repository-exhibition-list`; migrate list read/create persistence only.
- **Source/targets/modules:** `exhibitions.js`; list load and add-exhibition save; repository may later support detail without changing semantics.
- **Identical behavior:** list/order/access, created shape/unknown fields, push/offline/errors.
- **Before/after tests:** list create/reload and serialization goldens before; one-push/no-echo/page E2E after.
- **DEV/acceptance:** isolated DEV synthetic exhibition and cleanup required; preserve aggregate shape.
- **Abort/rollback:** abort on list/state/sync difference; restore direct storage.

### Stage 36: Studio page repository
- **Branch/objective:** `refactor/36-repository-studio`; migrate calendar load/save after occurrence adoption.
- **Source/targets/modules:** `pottery-master-calendar.js`; calendar serialization; repository only for meaningful compatibility handling.
- **Identical behavior:** calendar shape/order/unknown fields, push/no-echo/offline/errors.
- **Before/after tests:** serialization/cloud/pointer E2E before; state parity and calendar workflow after.
- **DEV/acceptance:** isolated DEV required; repository owns no occurrence or command policy.
- **Abort/rollback:** abort on state/render/sync difference; restore direct storage.

### Stage 37: Exhibition-detail repository and quota boundary
- **Branch/objective:** `refactor/37-repository-exhibition-detail`; migrate highest-risk page persistence last.
- **Source/targets/modules:** `exhibition-detail.js` and quota family in `auth.js`; `saveExhibition`, backup/compaction and quota delegation; create exhibition repository and quota adapter without auth changes.
- **Identical behavior:** compatibility fields, timestamps, backups, compaction order, push, alerts/errors, reload/images.
- **Before/after tests:** full serialization/quota/image/sync/backup suite before; exact state, quota, one-push/no-echo and all-tabs E2E after.
- **DEV/acceptance:** isolated DEV Blob-backed workflow required; page has no raw persistence serialization and no image/data migration occurs.
- **Abort/rollback:** abort on any field/backup/compaction/push/image/recovery difference; restore `saveExhibition` and quota calls exactly.

### Stage 38: Calendar occupancy queries
- **Branch/objective:** `refactor/38-calendar-occupancy`; isolate occupancy/capacity/placement queries.
- **Source/targets/modules:** `pottery-master-calendar.js`; `buildDailyOccupancyMap` and pure conflict queries; create `studio/calendar-occupancy.js`.
- **Identical behavior:** exclusions, capacity, base rules, ranges, reasons.
- **Before/after tests:** occupancy/preview goldens before; old/new and preview parity after.
- **DEV/acceptance:** isolated DEV placement smoke required; explicit inputs and no DOM/storage.
- **Abort/rollback:** abort on occupancy/validation difference; restore inline queries.

### Stage 39: Calendar modal command planning
- **Branch/objective:** `refactor/39-calendar-modal-commands`; separate modal command plan from effects.
- **Source/targets/modules:** `pottery-master-calendar.js`; pure portions of `saveEventFromModal`; create `studio/calendar-commands.js`.
- **Identical behavior:** fields/IDs/ranges/repeat/validation/next state.
- **Before/after tests:** create/edit/invalid goldens before; command and modal E2E after.
- **DEV/acceptance:** isolated DEV modal workflow required; page reads DOM/applies/saves, module has no effects.
- **Abort/rollback:** abort on message/event/workflow difference; restore inline logic.

### Stage 40: Calendar pointer edit planning
- **Branch/objective:** `refactor/40-calendar-pointer-commands`; separate pointer edit result from mutation.
- **Source/targets/modules:** `pottery-master-calendar.js`; pure planning in `finalizeMasterCalendarEdit`; extend commands module.
- **Identical behavior:** targets, validation, preview/final position, cancellation, IDs.
- **Before/after tests:** week/month pointer goldens before; parity and pointer/touch/visual E2E after.
- **DEV/acceptance:** isolated DEV desktop/mobile required; explicit inputs, no DOM/storage in planner.
- **Abort/rollback:** abort on coordinate/event/selection difference; restore inline planning.

### Stage 41: Calendar recurring operations
- **Branch/objective:** `refactor/41-calendar-recurring`; isolate one/following/all plans.
- **Source/targets/modules:** `pottery-master-calendar.js`; recurring delete/move/update and base-rule effects; extend commands module rather than tiny files.
- **Identical behavior:** IDs/order/shape, splits/truncation, orphan handling, prompts, occurrences.
- **Before/after tests:** exhaustive recurring/downstream totals before; unit, pointer/modal and all consumer regressions after.
- **DEV/acceptance:** isolated DEV recurring workflow required; pure plans and page-owned prompts/persistence.
- **Abort/rollback:** abort on state/downstream difference; restore inline operations.

### Stage 42: State API GET and ETag views
- **Branch/objective:** `refactor/42-state-api-get`; separate GET selection, summary/transfer views and ETags.
- **Source/targets/modules:** `api/state.js`; requested keys, summary, `buildTransferSafeStateData`, meta/ETag and GET branch; create `server/state/transfer-views.js`.
- **Identical behavior:** keys/body/meta/images/cache headers/304.
- **Before/after tests:** full GET matrix before; fake/isolated DB, image regression and DDL scan after.
- **DEV/acceptance:** isolated DEV GET/304/summary/full required; thin handler and pure views, PUT/DELETE untouched.
- **Abort/rollback:** abort on body/header/image difference; restore GET branch.

### Stage 43: State API PUT service
- **Branch/objective:** `refactor/43-state-api-put`; isolate PUT/version/merge/persistence orchestration.
- **Source/targets/modules:** `api/state.js`, policies/repositories; PUT excluding audit extraction; create `state-service.js` and registry only as composition.
- **Identical behavior:** payload/version/merges/images/write order/status/reasons.
- **Before/after tests:** all-key/concurrency/image matrix before; fake/isolated DB, restricted-role and DDL scan after.
- **DEV/acceptance:** isolated DEV reversible writes for seven keys required; explicit repository inputs and no redundant wrapper.
- **Abort/rollback:** abort on state/status/image/transaction uncertainty; restore PUT.

### Stage 44: State API audit and alerts
- **Branch/objective:** `refactor/44-state-api-audit`; isolate decision-to-audit/alert orchestration.
- **Source/targets/modules:** `api/state.js`, `api/_lib/audit-store.js`; audit/alert/cooldown call ordering; add orchestrator only if it maps decisions, repository stays SQL-only.
- **Identical behavior:** request/key/decision/reason/count/client/detail, threshold/order/failures.
- **Before/after tests:** row/partial-failure goldens before; fake/isolated DB and operational checks after.
- **DEV/acceptance:** isolated DEV synthetic decisions with cleanup required; no schema change.
- **Abort/rollback:** abort on row/order/status difference; restore orchestration.

### Stage 45: State API DELETE
- **Branch/objective:** `refactor/45-state-api-delete`; isolate DELETE parsing, observed authorization, persistence, audit.
- **Source/targets/modules:** `api/state.js`; DELETE branch; extend service, no tiny delete module.
- **Identical behavior:** credentials/keys/status/body/absence/audit.
- **Before/after tests:** complete fake matrix before; handler/service and isolated DB after.
- **DEV/acceptance:** DEV only with disposable synthetic key and guaranteed restoration; otherwise isolated DB replaces route smoke.
- **Abort/rollback:** abort on auth/status/audit/restoration uncertainty; restore branch.

### Stage 46: Cloud-sync deltas and signatures
- **Branch/objective:** `refactor/46-sync-deltas`; extract pure signatures and user/exhibition deltas.
- **Source/targets/modules:** `cloud-sync.js`; stringify/signature, exhibition/user delta and identity; create one cohesive sync-model module.
- **Identical behavior:** signatures, changed/removed values, identity/order/fields.
- **Before/after tests:** complete pure fixtures before; parity and page push tests after.
- **DEV/acceptance:** isolated DEV user/exhibition writes required; pure inputs/outputs, frozen public contract.
- **Abort/rollback:** abort on payload/signature/push difference; restore inline helpers.

### Stage 47: Cloud-sync reconciliation rules
- **Branch/objective:** `refactor/47-sync-reconciliation`; isolate pure per-key merge/preference decisions.
- **Source/targets/modules:** `cloud-sync.js`; material orders, preview merge, suspicious drop, timestamps; create cohesive reconciliation module.
- **Identical behavior:** fields/order, preview precedence, push-back, winner.
- **Before/after tests:** seven-key malformed/base64/Blob fixtures before; old/new/no-mutation/integration after.
- **DEV/acceptance:** isolated DEV two-client smoke required; no storage/fetch/events in rules.
- **Abort/rollback:** abort on winner/field/preview difference; restore inline rules.

### Stage 48: Cloud-sync transport
- **Branch/objective:** `refactor/48-sync-transport`; isolate GET/PUT HTTP adaptation.
- **Source/targets/modules:** `cloud-sync.js`; fetch portions of `schedulePush`/`pullRemoteState`; create `core/sync-client.js`, omitting redundant `stateClient` unless distinct.
- **Identical behavior:** URLs/methods/headers/bodies/ETags/status/errors/client ID.
- **Before/after tests:** fake 200/304/400/409/422/500/network matrix before; request and integration parity after.
- **DEV/acceptance:** isolated DEV read/write/conflict required; transport owns no reconciliation/storage/page policy.
- **Abort/rollback:** abort on request/status/metadata difference; restore fetch paths.

### Stage 49: Cloud-sync state application and events
- **Branch/objective:** `refactor/49-sync-application`; isolate application, readiness, status, and events while preserving order.
- **Source/targets/modules:** `cloud-sync.js`; remote guard, native storage, metadata, readiness and event portions of pull; colocate events unless independently reusable.
- **Identical behavior:** order, no echo, event detail/timing, readiness/status/failures.
- **Before/after tests:** fake storage/event and all-page startup before; ordering, page, seven-key, conflict/offline after.
- **DEV/acceptance:** isolated DEV all-page/two-client required; frozen public globals/events and reduced hidden state.
- **Abort/rollback:** abort on push/event/readiness/startup difference; restore inline application.

### Stage 50: Cloud-sync storage-wrapper migration
- **Branch/objective:** `refactor/50-sync-storage-wrapper`; migrate or retain a minimal global interception wrapper only after all repositories are proven.
- **Source/targets/modules:** `cloud-sync.js`, storage adapter, all repositories/pages; `Storage.prototype` overrides and queue entrypoints; no new forwarding layer.
- **Identical behavior:** key enablement, debounce/baseline, native semantics, quota, no echo, status.
- **Before/after tests:** full interception/page/offline/quota/two-client baseline before; every suite and full DEV regression after.
- **DEV/acceptance:** isolated DEV all seven keys/pages required; no bypass/double push and distinct storage/repository/sync ownership; keeping compatibility override is acceptable.
- **Abort/rollback:** abort on any push/native/quota/stale/page difference; restore override/wiring.

## Deferred work and risk

Not authorized: auth/role redesign, bundler/ES modules, CSS/visual redesign, caching changes, endpoint redesign, generated-handler replacement, or artifact movement. Separate migrations include base64/Blob cleanup, `works`/`artWorks` normalization, payment/calendar shape changes, password/session migration, database schema/roles, Blob architecture, and snapshot retention.

Stage 50 is highest risk because storage interception affects every synchronized write. Stages 43-45 hold central server integrity risk; Stages 38-41 hold calendar mutation risk; Stages 26-29 hold broad exhibition compatibility/output risk.

Completion requires all stage evidence, DDL-free restricted runtime, unchanged serialized/API/Blob contracts, one occurrence engine, responsibility-focused orchestrators, explicit effects, and source-only rollback. It does not authorize deferred work.