# Stage 1: First Accounting Category Calculator

Date: 2026-08-29

## Target

- Target: gallery artwork and goods automatic sales entries.
- Original file: `pottery-accounting.js`.
- Original functions: `buildGallerySalesAutoEntries`, `getExhibitionEndDate`, `getExhibitionSoldRecords`, `dedupeSoldRecords`, and `getSoldRecordIdentity`.
- Approximate original family size: 100 lines.
- Callers: four gallery branches in `buildAutoEntries` for artwork/goods revenue and their artist commissions.

## Before Responsibility

The page-owned family selected exhibitions for a month, selected current or legacy sold-record arrays, deduplicated sales, normalized item type/price/quantity, totaled each exhibition, built automatic accounting rows, and sorted those rows.

It silently read `state.exhibitions` and `TAB_GALLERY`, and called the shared page helpers `normalizeSoldItemType`, `parseSoldQuantity`, `parsePriceToNumber`, `roundWon`, `normalizeDateInput`, and `normalizeNameKey`.

The family had no DOM, storage, network, Blob, persistence, or business-data write side effects.

## After Responsibility

- New module: `accounting/auto-entries.js`.
- Exported function: `PotteryAccountingAutoEntries.buildGallerySalesAutoEntries`.
- Private extracted selectors: exhibition end date, sold-record compatibility selection, deduplication, and sold-record identity.
- Approximate extracted implementation size: 110 lines including private selectors and namespace installation.

Input contract:

```text
{
  exhibitions,
  itemType,
  monthKey,
  helpers: {
    normalizeSoldItemType,
    parseSoldQuantity,
    parsePriceToNumber,
    roundWon,
    normalizeDateInput,
    normalizeNameKey
  }
}
```

Output contract: a newly allocated, chronologically sorted array of automatic gallery revenue entries with the existing IDs, source, side, category, date, title, rounded amount, fixed flag, and tab fields.

`pottery-accounting.js` remains the page orchestrator. Its thin adapter supplies `state.exhibitions`, item type, month, and the shared pure helper functions. Rendering, commission dispatch, export, storage, cloud sync, and page lifecycle remain in the page script.

## Dependency Change

- Hidden globals removed from the extracted calculation: `state.exhibitions`, `TAB_GALLERY`, and six shared helper bindings.
- Remaining module-global interaction: classic-script evaluation installs one frozen `PotteryAccountingAutoEntries` namespace.
- Calculation-time globals: none; all business inputs and compatibility helpers are explicit.
- DOM operations: none.
- Storage writes: none.
- Network calls: none.
- Business-data writes: none.

## Tests

- Existing gallery row goldens remain unchanged.
- Added normal, empty, malformed, legacy-array, month-edge, duplicate, precedence, ID/title fallback, quantity, ordering, total, rounding, and input-immutability fixtures.
- Retained the original family in a test-only fixture for exact old/new row parity.
- Added a fixed August 2026 browser workflow covering category rows/totals, category expansion, tab switching, export, unchanged accounting storage, and reload.
- Complete post-refactor suite: 33/33 Node/API tests and 14/14 Chromium tests.

## DEV Deployment

- Project: `gallery-1019-site-dev` (`prj_jfBfO6Bx1OeqdEjaV8QzZlPMQQn2`).
- URL: `https://gallery-1019-site-dev.vercel.app`.
- Deployment: `dpl_3Djvjndub4HmaixzGTgo7TZiFYdf`.
- Browser smoke: passed with totals of 260001 revenue, 158001 expense, and 102000 profit; XLSX export passed; reload and surrounding page startup passed.
- Smoke used intercepted synthetic state, made zero API writes, and made zero production requests.

## Known Existing Quirks Preserved

- A nonempty `soldWorks` array completely supersedes `artSoldWorks` and `soldGoods`, even if its records produce no positive total.
- Missing or unrecognized item types default to artwork unless explicitly marked as goods.
- Invalid or nonpositive goods quantities become one; fractional quantities are floored.
- Duplicate records use the first matching explicit ID or composite legacy identity.
- A falsy exhibition ID falls back to the exhibition title in generated row IDs.
- Invalid/nonpositive prices are tolerated as zero and rows with no positive total are omitted.

## Rollback Method

Revert the Stage 1 commit to restore the inline family and original script order. If DEV deployment rollback is needed, redeploy the previous ready DEV deployment `dpl_7XjdnaFFLid7y5htmbW3hn4wDE4P`. No data repair or migration is required because Stage 1 performs no business-data writes.