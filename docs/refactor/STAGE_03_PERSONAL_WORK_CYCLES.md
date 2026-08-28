# Stage 3: Personal-Work Cycle and Usage Calculations

Date: 2026-08-29

## Target Function Family

- Original file: `pottery-personal-work.js`.
- Original functions: `getCurrentCycleRange`, `getElapsedCycleCount`, `isPaymentRequired`, `getEffectivePaymentDates`, `normalizePaymentHistory`, and the usage sum/remaining allowance calculation in `getCycleUsageHours` and `buildEntryRow`.
- Scope intentionally excluded: `collectPersonalWorkUsageRows` and its recurrence expansion.

Before editing, the family was recorded as follows:

- Current responsibilities: calculate monthly cycle boundaries/counts, normalize payment dates, determine payment-required status, total pre-derived usage, and clamp remaining allowance.
- Globals read: five page functions (`collectPersonalWorkUsageRows`, `roundHour`, `formatDateInput`, `addMonthKeepDay`, and `normalizeDateInput`) plus ambient current time in page callers.
- Globals mutated: none.
- DOM effects: none inside the selected calculations; row rendering only consumed their results.
- Storage effects: none.
- Network effects: none.
- Calendar dependencies: `getCycleUsageHours` implicitly called the page recurrence/occurrence collector.
- Clock dependencies: cycle/payment status used `Date`; same-day occurrence filtering used the page clock.
- Output contract: `{ start, end }` date strings, elapsed cycle number, descending unique payment-date strings, payment-required boolean, one-decimal usage hours, and remaining hours clamped at zero.

## Extracted Module

- New module: `personal-work/cycles.js`.
- Frozen classic-script namespace: `PersonalWorkCycles`.
- Exported functions: `calculateUsageSummary`, `getCurrentCycleRange`, `getElapsedCycleCount`, `isPaymentRequired`, `getEffectivePaymentDates`, and `normalizePaymentHistory`.
- No initialization occurs when the module is evaluated beyond installing the namespace.

Explicit inputs are limited to the calculation data:

- Usage summary: already-derived usage rows and maximum hours.
- Cycle range/count: start-date string and explicit as-of date.
- Payment status: entry payment fields and explicit as-of date.
- Payment normalization: payment history and latest-payment fields.

Outputs retain the original types and field names. `calculateUsageSummary` returns `{ usageHours, remainingHours }`; the other functions retain their previous range, count, boolean, and date-array contracts.

## Responsibility and Dependency Change

`pottery-personal-work.js` still owns startup, access control, DOM, active/dormant table rendering, modals, event handlers, mutation commands, local persistence, cloud-sync events, timers, and all calendar occurrence expansion/filtering.

The page passes already-derived occurrence rows to `calculateUsageSummary`. `getCycleUsageHours` remains as a thin page adapter for existing callers and tests. No recurrence engine, calendar schema, or occurrence behavior was added to the module.

Five hidden page-function dependencies were removed from the calculation boundary. Current time is supplied by the page as `asOfDate` for rendered cycle/payment decisions. The module has no DOM, localStorage, safe-storage, network, cloud, database, or Blob access and performs no business-data writes.

The page diff is 64 removed lines and 13 added lines. Calculation behavior is independently importable in Node while the page retains orchestration.

## Characterization and Parity

The fixed-date corpus covers new/future records, no payment history, free records, active paid cycles, overdue cycles, exact renewal boundaries, multiple cycles, month-end rollover, invalid legacy anchors, duplicate/malformed payment history, fallback latest payment, empty optional fields, exact/above allowance, negative/malformed usage values, dormant stored cycles, calendar-derived usage, weekly cancellation, same-day usage, and overnight minimum-slot behavior.

A test-only retained legacy implementation is compared directly with the extracted module for cycle ranges, elapsed cycle counts, normalized/effective payment dates, payment-required results, usage totals, and remaining allowance. Old/new parity passed exactly.

Preserved quirks include:

- Month-end cycles chain from the clamped prior boundary, so January 31 advances through February 28 and then March 28.
- A date exactly equal to cycle end belongs to the next cycle.
- Invalid or empty anchors make cycle-range display fall back to the as-of day plus one month, while elapsed cycle count remains zero.
- Payment status compares the count of all unique effective payment dates on or before today with elapsed cycle count; it does not assign payments to individual cycles.
- Non-array payment history is ignored, but a valid standalone latest-payment date is retained.
- Free/nonpositive fees never require payment; future-start records do not require payment.
- Aggregate usage is rounded to one decimal only after summing, malformed aggregate arithmetic follows the existing `roundHour` fallback, and remaining usage is clamped to zero.
- Same-day usage counts before session end because occurrence filtering remains page-owned.
- Dormant rows use stored dormant boundaries and never show payment-required status.

## Validation and DEV

- Pre-Stage-3 merged baseline: 40/40 Node/API and 15/15 Chromium.
- Stage 3 local suite before documentation: 44/44 Node/API and 16/16 Chromium.
- Target unit/parity suite: 6/6.
- DEV project: `gallery-1019-site-dev` (`prj_jfBfO6Bx1OeqdEjaV8QzZlPMQQn2`).
- DEV URL: `https://gallery-1019-site-dev.vercel.app`.
- DEV deployment: `dpl_EFuuebCoNuddXdJnmLwSTiMQR6Um`.
- Personal-work smoke passed active/dormant rows, exact cycle dates, payment status, usage/remaining values, detail/edit workflow, reload, unchanged browser state, and calendar startup.
- Students smoke passed remaining-credit, cancellation, detail, recomputation, reload, calendar, and personal-work startup checks.
- Accounting smoke retained revenue 260001, expense 158001, and profit 102000.
- All smokes reported zero API writes and zero production requests.
- Direct DEV queries found zero synthetic personal-work/calendar records; general audit, snapshots, exhibitions, and diagnostic Blob residue were zero.
- Real production deployment remained `dpl_GuXNeYvk4Tw9TCVZddhmrfjWXtZU`; no production deployment, state, or Blob operation was performed.

## Rollback

Revert the Stage 3 commit to restore the inline calculations and prior script order. For DEV deployment rollback, redeploy or promote the previous ready DEV deployment `dpl_5m4Y6jmp2BRgWSmjbQuwdohUK57G`. No data migration or repair is required because Stage 3 changes no stored format and performs no business-data writes.