# Gallery 10.19 Architecture

## Repository and branches

The shared local Git repository is `/Users/MacBook/Documents/Gallery 10.19 Repository.git`.

- `main` is the production release branch. It must represent the exact source served in production and remain clean.
- `develop` is the integration branch for normal development.
- `feature/*`, `refactor/*`, and `fix/*` branches must start from `develop`.
- Production releases must be reviewed merges to `main`; normal development must not occur directly on `main`.
- The frozen legacy workspace at `/Users/MacBook/Documents/10.19 Website` is not part of the new worktree workflow and must not be modified, cleaned, reset, stashed, or reused.

Clean worktrees:

- Production: `/Users/MacBook/Documents/Gallery 10.19 Production` (`main`)
- Development: `/Users/MacBook/Documents/Gallery 10.19 Development` (`develop`)

The initial `main` and `develop` commit is `43c0ac9b099e6fb7b7b22da6bc6fbe68342e20d1`. Vercel metadata identifies that commit as the source of the deployment currently served at `gallery-1019-site.vercel.app` on 2026-08-28. The previously named deployment `dpl_HNguLVDfjSSVhWNgcY1D3NNWXfTq` is an older production deployment and is not currently behind the canonical alias.

## Environment boundary

Production and development are separate security boundaries. Sharing environment variable names is allowed; sharing resource values or write credentials is not.

| Resource | Production | Development |
| --- | --- | --- |
| Vercel project | `gallery-1019-site` (`prj_YCn5F9fEsMGHpBBKInqNNkbvPuwG`), team `1019-gallery` | `gallery-1019-site-dev` (`prj_jfBfO6Bx1OeqdEjaV8QzZlPMQQn2`) |
| Canonical URL | `gallery-1019-site.vercel.app` | `gallery-1019-site-dev.vercel.app` |
| Lakebase Postgres (Neon) | Production database `neondb`; branch `br-crimson-flower-auah6zwc`; endpoint `ep-autumn-brook-aum5q7ch` | Database `neondb`; branch `br-divine-waterfall-au77ncm0`; endpoint `ep-falling-cell-au5eg3l0`; role `gallery_1019_dev_app` |
| Exhibition images | Public Blob store `gallery-1019-exhibition-images-public` (`store_8GrgABDn7KW6YuH3`) | Public Blob store `gallery-1019-exhibition-images-dev` (`store_juobLGwpzZY4gmFa`) |
| Snapshot archive | Archive Blob binding `BLOB_READ_WRITE_TOKEN`; verified resource name `gallery-1019-files` | Disabled; no `BLOB_READ_WRITE_TOKEN` is installed |

Never put tokens, passwords, connection strings, or secret values in Git or documentation. Ignored legacy environment files must never be copied into a clean worktree.

Production environment variable names observed on the Vercel project are:

- `DATABASE_URL`
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`
- `EXHIBITION_IMAGE_READ_WRITE_TOKEN`
- `BLOB_READ_WRITE_TOKEN`

Application-supported names also include `EXHIBITION_IMAGE_BLOB_READ_WRITE_TOKEN`, `EXHIBITION_IMAGE_MIGRATION_MAX_UPLOADS`, `EXHIBITION_IMAGE_MIGRATION_SECRET`, `SNAPSHOT_ADMIN_SECRET`, `STATE_ADMIN_SECRET`, `SNAPSHOT_CRON_SECRET`, `CRON_SECRET`, and `SNAPSHOT_ARCHIVE_STRICT`.

## State ownership

Postgres is the authoritative shared state store. `api/state.js` reads and mutates these `app_state` keys:

- `users`
- `exhibitions`
- `pottery-students-v1`
- `pottery-personal-work-v1`
- `studio-calendar-state-v1`
- `pottery-material-orders-v1`
- `pottery-accounting-v1`

Supporting tables own full-state snapshots, per-exhibition snapshots, write audit records, and alerts: `app_state_snapshots`, `exhibition_state_snapshots`, `app_state_write_audit`, and `app_state_alerts`.

Browsers use local storage as a client cache and working copy. `cloud-sync.js` hydrates from and synchronizes to the API; local storage is not an isolated server-side environment.

## Image URL architecture

Artwork images must remain Blob-backed URL references. Full images use `photoUrl`; previews use `photoPreviewUrl`. Legacy `photoDataUrl` and `photoPreviewDataUrl` fields may be accepted only for upload/migration compatibility and must not be restored as persisted artwork storage.

Public image uploads use paths under `exhibition-images/{exhibitionId}/{kind}/`. Exhibition snapshot archives use paths under `snapshot-archive/exhibitions/` in the separate archive store.

## API data access

| API | Reads | Writes |
| --- | --- | --- |
| `GET /api/health` | Postgres safeguard metrics | None |
| `GET /api/state` | `app_state` | None |
| `PUT /api/state` | Existing state for merges and safeguards | Postgres state, audits, alerts; may migrate images to public Blob when explicitly enabled |
| `DELETE /api/state` | Existing state | Deletes a Postgres state key and records audit data |
| `POST /api/upload` | None | Public exhibition-image Blob |
| `GET /api/exhibition-snapshots` | Per-exhibition snapshots and archive payloads | None |
| `POST /api/exhibition-snapshots` | Current/snapshot state | Postgres state and snapshot tables; archive Blob |
| `GET /api/snapshots` | Full-state snapshots | None |
| `POST /api/snapshots` | Current/snapshot state | Postgres state and snapshot tables |
| `GET /api/snapshots-cron` | Current exhibition state | Per-exhibition snapshot table and archive Blob |
| `GET /api/state-audit` | Audit and alert tables | None |
| `POST /api/exhibition-image-migration` | Exhibition state | Public image Blob and Postgres exhibition state |

Dry-run flags do not replace environment isolation. Development code must be unable to authenticate a production write even if an endpoint or script is invoked accidentally.

## Deployment rules

1. Never deploy production from a dirty worktree.
2. Production deployments originate only from `main` in the clean production worktree.
3. Confirm `git status --short` is empty and verify the intended commit before every production deployment.
4. Development and preview deployments originate from `develop` or its child branches and target only the separate development Vercel project.
5. Never link the development worktree to production Vercel project `prj_YCn5F9fEsMGHpBBKInqNNkbvPuwG`.
6. Never install production database or Blob write credentials in the development Vercel project, local development files, CI, or preview environments.
7. Do not push a changed `main` until the Vercel Git integration and release procedure have been checked for automatic production deployment.
8. Infrastructure/environment changes and data migrations are separate, explicitly approved tasks. They are not part of code refactoring.

## Refactoring rules

- Refactoring must preserve application behavior.
- Refactoring must not change database schema or production data.
- Do not restore persisted/base64 artwork images.
- Do not combine infrastructure, environment, schema, or data migration work with refactoring.

## Development isolation gate

Development deployments are prohibited until all of these conditions are true:

- A separate development Vercel project exists and the development worktree is linked only to it.
- A separate development Neon branch/database and development-only role exist.
- A separate public exhibition-image Blob store exists.
- Archive writes are disabled by omitting `BLOB_READ_WRITE_TOKEN`, or a separate private development archive store exists.
- Every development/preview environment variable has been checked by resource identity, not merely by variable name.
- No production write credential is present in the development project, worktree, CI, or preview settings.

The gate passed on 2026-08-28. The development worktree is linked only to the development Vercel project. Its ignored local `.env.local` contains only the development project's Vercel OIDC token; application resource values are managed in the development project. See `docs/DEVELOPMENT_ENVIRONMENT.md` for the verified resource manifest, deployment procedure, and isolation evidence.
