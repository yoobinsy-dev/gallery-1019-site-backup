# Stage 2: Student Payment and Credit Calculations

Date: 2026-08-29

## Target Function Family

- Original file: `pottery-students.js`.
- Original functions: `normalizePaymentRecords`, `getRemainingClassCount`, `getManualUsedAdjustment`, `computeCarryOverForNewPaymentCycle`, `getStudentPaymentCycleSize`, `buildPaymentClassGroups`, `reservePriorCycleClasses`, `buildMonthlyStartPaymentClassGroups`, and `getStudentPaymentHistory`.
- Approximate original family size: 260 lines.

The family calculates remaining class credits, manual adjustments, new-cycle carry-over, cycle size, current/legacy payment records, and assignment of already-calculated class records to payment cycles.

## Original Contract

The original functions read student/payment arguments but also called page-scope `basisToCount`, `isMonthlyStartBasis`, `isValidDateString`, `getCompletedClassCountOnDate`, and each other. Carry-over silently queried calendar-derived same-day attendance through the page. Monthly grouping used `Date` only to parse explicit payment dates; it did not read the current clock.

The family mutated no student, payment, or calendar business data. Grouping cloned class records before adding internal assignment flags. It performed no DOM, storage, network, database, or Blob operations.

Callers remain student row rendering, student edit/payment commands, detail rendering, pending-student serialization, and synchronized-state serialization.

## Extracted Module

- New module: `students/payment-credits.js`.
- Frozen classic-script namespace: `StudentPaymentCredits`.
- Exported functions: `getRemainingClassCount`, `getManualUsedAdjustment`, `computeCarryOverForNewPaymentCycle`, `getStudentPaymentCycleSize`, `getStudentPaymentHistory`, `normalizePaymentRecords`, and `buildPaymentClassGroups`.
- Private cohesive helpers: prior-cycle reservation and monthly-start grouping.
- Approximate module size: 243 lines including namespace installation.

Input contracts are explicit and narrow:

- Balance: student credit fields, completed-class count, and parsed basis count.
- Carry-over: next payment date, previous remaining balance, and page-calculated same-day completed count.
- Normalization: student payment fields, date validator, and precomputed cycle size.
- Grouping: student carry field, payment dates, precomputed class records, normalized payment records, monthly-plan flag, cycle size, and manual adjustment.

Outputs retain the existing numbers and shapes: remaining credit number; carry-over number; descending normalized payment records; descending payment groups containing `paymentDate`, `paymentRecord`, and cloned `classRecords`; and cloned unassigned class records.

Output contracts did not change.

## Dependency and Responsibility Change

- Page globals removed from calculation-time module access: `basisToCount`, `isMonthlyStartBasis`, `isValidDateString`, and `getCompletedClassCountOnDate`.
- Calendar recurrence implementation added: none.
- Calendar dependency: the page continues to expand/filter occurrences and calculate same-day/completed counts, then passes those values to the module.
- Clock dependency: current-time attendance cutoff remains page-owned. The module only parses explicit payment dates for monthly grouping.
- Module evaluation only installs one frozen namespace; it performs no initialization.
- DOM operations: none.
- Storage operations: none.
- Network/database/Blob operations: none.
- Business-data writes: none.

`pottery-students.js` remains responsible for startup, access and visibility, DOM rendering, modals, event handlers, recurrence and occurrence collection, timers/focus recomputation, persistence, cloud events, and edit/payment commands.

## Characterization and Parity

The fixed-clock corpus covers no payment history, first/current and multiple cycles, exact/before/after boundaries, used/unused/excess classes, carry-over, positive and negative manual adjustment, cancellation, recurring attendance input, legacy and malformed records, same-day classes, monthly plans, early next-month payment, missing fields, input immutability, and instructor visibility.

A test-only retained legacy implementation is compared directly with the extracted module for balance, carry-over, record normalization, count-plan grouping, and monthly grouping. Old/new parity passed exactly.

Known quirks preserved:

- Negative fractional manual adjustment floors toward negative infinity.
- Malformed nonempty legacy payment-history strings can become synthetic payment records even though malformed current payment records are filtered.
- A short earlier cycle may borrow classes from the next payment date after prior-cycle reservations.
- Negative opening adjustment reserves early classes as prior-cycle classes.
- Positive unused credits do not automatically carry into a new purchase; negative balances reduce new credits according to the existing same-day rule.
- Monthly payments on or after the 24th cover the next month only when the current month already has a payment.

## Validation and DEV

- Complete local suite: 40/40 Node/API tests and 15/15 Chromium tests.
- DEV project: `gallery-1019-site-dev` (`prj_jfBfO6Bx1OeqdEjaV8QzZlPMQQn2`).
- DEV URL: `https://gallery-1019-site-dev.vercel.app`.
- Deployment: `dpl_5m4Y6jmp2BRgWSmjbQuwdohUK57G`.
- Students smoke passed row credits/date, payment detail, cancellation, admin actions, focus recomputation, reload, and unchanged browser state.
- Calendar and personal-work startup smokes passed.
- Accounting smoke retained revenue 260001, expense 158001, and profit 102000 with unchanged accounting storage.
- Smoke tests made zero API writes and zero production requests. General DEV residue was zero.

## Rollback

Revert the Stage 2 commit to restore the inline family and prior script order. If DEV rollback is needed, redeploy the previous ready DEV deployment `dpl_3Djvjndub4HmaixzGTgo7TZiFYdf`. No data repair or migration is required because Stage 2 performs no business-data writes.