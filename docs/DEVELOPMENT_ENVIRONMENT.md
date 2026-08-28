# Development Environment

## Purpose

This environment is the only deployment target for `develop` and its child branches. It may read and write development data. It does not possess credentials that can write to production.

Do not copy values from production, relink this worktree, or add production credentials to the development project. This document records safe resource names and IDs only; secret values must never be committed or printed.

## Resource manifest

| Resource | Development identity | Isolation property |
| --- | --- | --- |
| Worktree | `/Users/MacBook/Documents/Gallery 10.19 Development` | Branch `develop`; separate from the production worktree |
| Vercel project | `gallery-1019-site-dev` (`prj_jfBfO6Bx1OeqdEjaV8QzZlPMQQn2`) | Separate from production project `prj_YCn5F9fEsMGHpBBKInqNNkbvPuwG` |
| Stable URL | `https://gallery-1019-site-dev.vercel.app` | Alias belongs to the development project |
| Lakebase Postgres branch | `br-divine-waterfall-au77ncm0` | Created from recovery branch `br-calm-hat-au74cbb0` |
| Lakebase Postgres endpoint | `ep-falling-cell-au5eg3l0` | Different from production endpoint `ep-autumn-brook-aum5q7ch` |
| Database and role | `neondb`; `gallery_1019_dev_app` | Branch-local application role with app table access and `USAGE, CREATE` on `public` for existing startup DDL |
| Public image Blob | `gallery-1019-exhibition-images-dev` (`store_juobLGwpzZY4gmFa`) | Connected only to the development Vercel project |
| Snapshot archive | Disabled | No private development store and no `BLOB_READ_WRITE_TOKEN` |

The first verified deployment is `dpl_9DHbHUqKcABjPU2B5jSDtfwH1mJn`. Deployment IDs are immutable records, not permanent targets; use the stable development alias for normal smoke testing.

## Environment variables

The development Vercel project has these application resource variables:

| Variable | Scope | Storage | Resource |
| --- | --- | --- | --- |
| `DATABASE_URL` | Production target of dev project | Sensitive | Development endpoint and role |
| `DATABASE_URL` | Preview | Sensitive | Development endpoint and role |
| `DATABASE_URL` | Development | Encrypted, non-sensitive Vercel type because sensitive values are unsupported for this scope | Development endpoint and role |
| `EXHIBITION_IMAGE_READ_WRITE_TOKEN` | Production, preview, development | Managed by the development Blob connection | Development public image store |

`BLOB_READ_WRITE_TOKEN`, production Postgres aliases, and all production write credentials are absent. The ignored local `.env.local` contains only `VERCEL_OIDC_TOKEN` for the linked development project. Never commit that file.

## Deploying development

Run deployments only from the development worktree:

```bash
cd "/Users/MacBook/Documents/Gallery 10.19 Development"
git status --short --branch
node -e "const p=require('./.vercel/project.json'); console.log(p.projectId)"
vercel deploy --prod --yes
```

The status must be clean for a baseline deployment, and the printed project ID must be `prj_jfBfO6Bx1OeqdEjaV8QzZlPMQQn2`. In this project, `--prod` means the stable target of the separate development project; it must never be run from a worktree linked to production.

Never deploy development by passing the production project ID, changing `.vercel/project.json`, or copying production environment files. Production releases remain a separate reviewed operation from clean `main` in `/Users/MacBook/Documents/Gallery 10.19 Production`.

## Verification evidence

Isolation tests passed on 2026-08-28:

- `/api/health` and `/api/state` returned `200` through the development deployment after granting the branch-local role the schema permission required by existing idempotent startup DDL.
- A marker named `DEV_ISOLATION_TEST_2026_08_28` was written and read through ordinary `PUT` and `GET /api/state` calls, then the exact prior development value was restored.
- The marker was absent from production before and after the test.
- A 68-byte PNG was uploaded through ordinary `POST /api/upload`, listed only in `store_juobLGwpzZY4gmFa`, verified through its public URL, and deleted. The development store returned to zero objects.
- The complete production fingerprint was exactly equal before and after: seven state rows, state hash `bb5ee952...`, schema hash `eaeeeec6...`, 182 public objects with inventory hash `f3664420...`, and three private objects with inventory hash `2c8f7bfe...`.
- Login rendered without console or page errors. Login, dashboard, exhibitions, exhibition detail, pottery accounting, health, and state routes returned `200`.

The smoke test also found a pre-existing data limitation: the cloned full exhibitions state response is about 4.25 MB and contains legacy embedded image payloads where no Blob URL exists. Transfer-safe reads remove legacy payloads only when a public Blob URL is already present. This does not indicate cross-environment access, but the no-embedded-base64 criterion remains blocked until a separately approved development data migration is performed. Do not combine that migration with refactoring.

## Credential follow-up

During setup, a Neon CLI parsing failure echoed an inherited owner connection URL once. Treat that owner credential as exposed. Rotate it only in a separate, explicitly approved production credential operation with rollback planning; do not rotate it as part of refactoring or routine development work.