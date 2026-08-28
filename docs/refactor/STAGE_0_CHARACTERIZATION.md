# Stage 0 Characterization Harness

Date: 2026-08-28

Stage 0 adds regression evidence only. It does not modify application implementation, migrate data, deploy, or begin the refactor.

## Local coverage

- State API GET/PUT behavior, merge safeguards, write-audit decisions, payload limits, and request handling.
- Full-state and exhibition snapshot list, create, restore, cron, retention, and archive policy behavior through mocked dependencies.
- Runtime DDL behavior, including the current permission-error fallback.
- Accounting, students, personal work, calendar, material orders, exhibitions, inventory, and image-transfer policies.
- Startup of login, landing, exhibition list/detail, inventory, calendar, students, personal work, material orders, and accounting pages with all API traffic intercepted on localhost.
- Synthetic local login using the current credential matching and `currentUser` persistence behavior.
- Browser artwork file processing through the current compact-image helper.
- Blob-backed certificate image loading and valid XLSX archive generation.

Run the local suite with:

```sh
npm run test:all
```

## Development-only coverage

Mutable tests require Vercel's `development` environment and fail closed unless every expected identity matches:

- URL: `gallery-1019-site-dev.vercel.app`
- project: `prj_jfBfO6Bx1OeqdEjaV8QzZlPMQQn2`
- database branch: `br-divine-waterfall-au77ncm0`
- database endpoint: `ep-falling-cell-au5eg3l0`
- database role: `gallery_1019_runtime`
- image Blob store: `store_juobLGwpzZY4gmFa`
- archive writes: disabled

The image regression uploads a synthetic PNG through DEV `/api/upload`, writes a synthetic Blob-backed exhibition through DEV `/api/state`, reloads it, verifies public URL persistence with empty base64 fields, restores the exact prior state JSON and timestamp, removes audit rows, deletes the Blob, and verifies cleanup. Its observed pre-test state hash was `06f41c8177831fcc9d3af430762424241bc1543bae37514e5256e4cffe386383`, and it made zero production requests.

The snapshot permission regression verifies the restricted runtime role cannot create database or public-schema objects, inserts synthetic rows into both snapshot tables inside one transaction, rolls the transaction back, verifies zero residue, and confirms the unauthenticated DEV cron endpoint returns `403`.

Run these tests only with the linked DEV project:

```sh
vercel env run --project prj_jfBfO6Bx1OeqdEjaV8QzZlPMQQn2 -e development -- npm run test:dev:image
vercel env run --project prj_jfBfO6Bx1OeqdEjaV8QzZlPMQQn2 -e development -- npm run test:dev:snapshots
vercel env run --project prj_jfBfO6Bx1OeqdEjaV8QzZlPMQQn2 -e development -- npm run test:dev:clean
```

## Characterized behavior

- Invalid state GET keys currently fall back to all allowed keys and return `200`.
- Inventory prefers `artWorks` over `works` when `artWorks` exists.
- User-drop protection triggers at the current minimum thresholds.
- Existing image data remains when no public Blob URL is available.
- Login accepts normalized name, username, phone, or email plus the stored plaintext password and writes the complete user object to `currentUser`.

These are regression observations, not endorsements or fixes.

## Explicit gaps

- Authorized cron execution and archive Blob writes are not exercised against DEV because the archive write token is intentionally absent. Cron/archive policy is covered locally with dependency fakes; the live endpoint is checked only through its non-mutating unauthorized path.
- Real third-party identity, browser session, and production credentials are not used. Authentication characterization uses synthetic local data only.
- Production receives no test traffic and no mutable test has production credentials.
- The previously documented DEV role `gallery_1019_dev_app` is stale. Environment metadata and direct database identity checks on 2026-08-28 show `gallery_1019_runtime`.