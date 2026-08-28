# Test Plan

## Current state

The repository has no conventional automated test files, test directories, test script, test framework, browser automation dependency, or coverage tooling. Existing `tmp/` scripts and reports are operational migration/recovery/verification evidence. They should inform fixtures and runbooks but must not be relabeled as a maintained suite.

No structural refactor should begin until Stage 0 tests run locally against fixtures with no production credentials. Tests must default to in-memory/fake adapters or an isolated disposable development database.

## Recommended harness

- **Unit/API runner:** Node's built-in `node:test` and `node:assert/strict` initially, minimizing dependencies and supporting current CommonJS server code.
- **DOM tests:** add a lightweight DOM environment only when the first renderer extraction needs it; prefer testing pure view models first.
- **E2E:** Playwright against a local or isolated development server with seeded fixture state.
- **Visual checks:** Playwright screenshots at representative desktop/mobile viewports for high-change pages.
- **Coverage:** use Node coverage after seams exist; do not use a percentage alone as a gate.

Suggested scripts:

```json
{
  "test": "node --test tests/unit tests/api",
  "test:browser": "node --test tests/browser",
  "test:e2e": "playwright test",
  "test:all": "npm test && npm run test:browser && npm run test:e2e"
}
```

Exact scripts are an implementation decision for Stage 0. The test process must fail if production URLs or owner/migration database credentials are present.

## Stage 0 acceptance gate

Stage 0 is complete only when the harness proves the following against isolated DEV with synthetic, reversible fixtures:

- exhibition list and exhibition detail load;
- exhibition state read and write;
- artwork edit and artwork-image upload;
- uploaded image persistence after reload;
- Blob URL/reference preservation through transfer-safe state;
- certificate generation with both legacy and Blob-backed artwork images;
- snapshot creation/read and authorized snapshot cron paths;
- absence of runtime DDL under normal, failure, snapshot, and cron paths; and
- no normal state regression from Blob-backed image references to embedded base64.

The safety guard must terminate before any request or fixture setup when it detects a production URL/alias, production project identifier, production Blob target, owner credential, or migration credential. Each live test records the synthetic state and Blob objects it created, removes them, restores the prior DEV state/version where applicable, and verifies the final state and Blob inventory against its captured baseline. A test is not accepted when cleanup is merely attempted or inferred from a successful response.

## Fixture policy

- Use synthetic names, credentials, images, and financial values.
- Preserve structural edge cases from real records after redaction: missing fields, unknown fields, legacy IDs, parallel representations, malformed values, and ordering.
- Store before/after golden fixtures for merge and serialization behavior.
- Include a fixture schema/version note, but do not migrate application state just to simplify tests.
- Treat snapshots as reviewed contracts. Do not bulk-update them to make failures disappear.
- Freeze clock/timezone in date-sensitive tests; explicitly test KST and browser-local assumptions.

## Minimum unit suite

### State safety and merge

- `detectLargeUnexpectedInventoryDrop`: every threshold boundary; all inventory list fields; delta touched IDs; missing exhibitions; clear marker; malformed input; multiple candidates.
- User identity and `mergeUsersWithDelta`: add/update/remove; every identity fallback; duplicates/collisions; unknown fields; password preservation; ordering.
- User drop, missing-password, and admin invariants.
- Exhibition preferred-record selection, timestamps, preview preservation, missing IDs, and unknown-field preservation.
- Student and calendar merge behavior currently implemented by `/api/state`.
- Transfer-safe state output: URL/data-URL combinations and no mutation of stored input.

### Browser synchronization

- Active-key matrix for all fourteen entry paths.
- User and exhibition delta builders, including explicit removals.
- Material-order identity/pair/list merge.
- Pull reconciliation decision table: local missing/newer/older/equal, remote missing, suspicious drop, remote preferred.
- Push debounce/coalescing and baseline capture using fake timers.
- HTTP 200/304/400/409/422/500/network failure behavior.
- Remote-apply guard prevents echo push.
- Storage `setItem`/`removeItem` interception preserves native semantics for unsynchronized/disabled keys.
- Readiness and custom-event order/detail.

### Storage quota

- Non-quota exception behavior.
- Initial success without compaction.
- Incoming exhibition payload compaction and retry order.
- Existing stored exhibition compaction and aggressive fallback.
- Exact image fields retained/removed in each mode.
- Non-exhibition key behavior and final failure return/user feedback.

### Calendar

- Slot/time conversion and day/week/month boundaries.
- Occurrence expansion for non-repeating and weekly events.
- End date, exclusions/overrides, overnight times, and malformed records.
- Occupancy/capacity and exclusion of currently edited event.
- Create/move/resize command planning.
- Recurring one/following/all mutation results and base-rule interactions.
- The same occurrence fixtures run against studio, students, personal work, and accounting selectors until one implementation owns them.

### Students and personal work

- Payment record normalization, legacy IDs, date histories, and summary fields.
- Credit balance, carry-over, manual adjustment, class counts, join/payment boundaries.
- Student visibility by role/instructor.
- Payment/class detail grouping and rowspans.
- Personal-work cycle bounds, effective payments, dormancy, usage durations, and payment-required state.

### Accounting

- Each auto-entry category independently.
- Gallery sale deduplication, item type, quantity, price, commission/rounding.
- Class revenue mapping to students/payments/occurrences.
- Personal-work revenue and material-order expense.
- Manual/fixed/override entry normalization and merge precedence.
- Month boundaries, leap year, invalid dates, stable row identity/order, totals, and export rows.
- Assert that derived entries are never added to persisted manual state.

### Images and snapshots

- Browser artwork-image characterization: selected-file preview, current resize/compression output, full/preview/pending precedence, upload request/result adaptation, Blob-backed resolution, legacy data-URL reads, reload persistence, and failure behavior.
- Certificate characterization: template loading/cache, normalized text and filenames, single and batch workbook generation, image placement/conversion, Blob-backed artwork resolution, download action errors, and page-owned generated-state mutation.
- Image-reference scan/plan for every supported list and field combination.
- Data URL parsing, extension/path stability, upload budget, failure, idempotence, and stats.
- Transfer stripping only when current URL rules permit it.
- Snapshot KST slot/date, counts, deduplication, retention threshold.
- Capture/list/restore/archive fallback/undo and consumed undo point.
- Partial database/Blob failure behavior using fakes and isolated integration tests.

Browser artwork-image and certificate tests must not import or redefine server image-reference migration policy. Server tests continue to own scan, upload budget, migration, and persistence policy.

### Output safety

- Text escaping versus attribute escaping with quotes, angle brackets, ampersands, Unicode, and malicious strings.
- CSV formula-injection and quoting behavior as currently implemented; document failures separately from refactor parity.
- Currency/date formatting parity for each distinct helper contract.

## API contract suite

Test handlers with mocked request/response plus repository fakes, then repeat critical flows against an isolated migrated database.

| Endpoint | Minimum matrix |
| --- | --- |
| `/api/state` GET | allowed/invalid keys, subset/all, summary/full, transfer-safe, metadata, ETag/304, empty rows, DB failure |
| `/api/state` PUT | invalid body/key, full/delta, stale base, each merge policy, each safeguard, audit success/failure, image stats, DB failure |
| `/api/state` DELETE | authorization/secret behavior as observed, invalid key, present/missing state, audit, DB failure |
| Exhibition snapshots | method/action validation, list/capture/restore/undo, missing IDs, archive fallback, conflicts, partial failures |
| Cron | authorization, KST slots, partial exhibition failures, dedupe, retention |
| Upload | method/body/type/size rules, valid upload, Blob failure, public URL verification |
| Image migration | authorization, dry-run/apply, budget, partial upload, persistence failure |
| Health/audit | success shape, limits, cache headers, DB failure without leaking secrets |

Contract assertions include status, body shape, headers, persisted state, audit rows, alerts, and absence of DDL. Run a source scan that fails on DDL tokens under `api/**` after the approved baseline is incorporated.

## Browser integration suite

Use a controlled DOM, in-memory storage, fake clock, and fake fetch to cover:

- HTML script order supplies each required global before page initialization;
- each page waits or falls back exactly as it does today;
- cloud state application causes one expected reload/render and no echo push;
- event handlers preserve focus, selection, scroll, and modal state where required;
- timers/subscriptions can be torn down and do not multiply after reinitialization;
- generated inline/global handlers still resolve during transitional stages.

## E2E critical paths

1. Login, failed login, logout, session refresh after users sync, and role-based navigation.
2. Admin creates/approves/edits/deletes a synthetic user; non-admin is denied by current UI behavior.
3. Create exhibition; invite/access it; edit metadata; reload and verify persistence.
4. Add/edit/delete artwork and goods; record sale; undo; verify inventory and accounting projections.
5. Upload/preview image with fake or isolated Blob; reload transfer-safe state; verify visible preview.
6. Capture snapshot; mutate exhibition; restore; undo restore.
7. Create/move/resize recurring calendar event in week and month views; test one/following/all behavior.
8. Add student through slot picker; record payment; verify class stats and detail grouping.
9. Add personal-work entry/payment/dormancy; verify calendar-derived usage.
10. Create/edit/merge/undo material order rows; keyboard navigate; export.
11. Verify accounting totals and export for a fixed synthetic month across all auto sources.
12. Cross-client conflict: two browser contexts edit the same key and observe current conflict/reconciliation behavior.
13. Offline/network failure then recovery without silent loss of the local working copy.
14. Storage quota failure and exhibition compaction path.

## Visual and responsive regression

Capture at minimum 1440x900, 1024x768, 980x900, 920x900, 700x900, and 390x844 where relevant. Prioritize exhibition detail tabs, studio week/month calendars, student detail, material-order read/edit grids, accounting categories, profile/user modals, and navigation. Check text clipping, overlaps, hidden controls, rowspans, sticky regions, pointer targets, and modal focus.

## Manual release checklist

- Review console and failed network requests on every affected page.
- Compare before/after serialized state for the touched command using redacted fixtures.
- Verify no production URL, token, owner credential, or migration URL is used.
- Verify runtime role remains DML-only and API source remains DDL-free.
- Confirm cloud readiness, pull, local edit, debounced push, reload, and second-client visibility.
- Exercise role variants relevant to the page.
- Exercise one failure path and the documented rollback/undo path.
- Compare desktop and mobile layouts.
- Review API audit decisions for state changes in the isolated environment.

## Gates

| Gate | Required evidence |
| --- | --- |
| Before any extraction | Stage 0 harness, fixture safety guard, critical state/API characterization green |
| Before page-local pure extraction | Golden output fixtures for exact functions and at least one page E2E smoke |
| Before storage/sync/auth changes | Full browser sync matrix, multi-context E2E, quota tests, all page startup smokes |
| Before state API decomposition | API contract matrix, isolated Postgres integration, audit/alert assertions, DDL scan |
| Before calendar command extraction | Recurrence/occupancy fixtures shared across all consumers and pointer E2E |
| Before compatibility removal | Separate approved migration, production-like inventory report, backup, dry run, rollback rehearsal |

## Failure policy

A stage stops when output/state differs without an approved behavior change, a test needs production data/credentials, an unknown compatibility path appears, or rollback cannot restore the previous file/load contract. Fix the characterization or narrow the stage; do not update expected results merely to continue.
