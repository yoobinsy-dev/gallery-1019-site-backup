# Gallery 10.19 Pre-Refactor Recovery Checkpoint

Checkpoint date: 2026-08-28

This checkpoint records the verified production state immediately before refactoring. It does not change application behavior, production configuration, business data, schemas, deployment routing, or Blob objects.

## Checkpoint components

| Component | Recovery identifier |
| --- | --- |
| Source commit | `43c0ac9b099e6fb7b7b22da6bc6fbe68342e20d1` |
| Local annotated Git tag | `production-pre-refactor-2026-08-28` |
| Vercel project | `gallery-1019-site` (`prj_YCn5F9fEsMGHpBBKInqNNkbvPuwG`) |
| Vercel deployment | `dpl_7HgdbmtTZmfnKyL2Lx6LgCnJ87Sa` |
| Canonical alias | `gallery-1019-site.vercel.app` |
| Neon project | `neon-purple-ball` (`calm-glitter-93873921`) |
| Production Neon branch | `main` (`br-crimson-flower-auah6zwc`) |
| Production Neon endpoint | `ep-autumn-brook-aum5q7ch` |
| Neon recovery branch | `backup-pre-refactor-2026-08-28` (`br-calm-hat-au74cbb0`) |
| Recovery branch parent point | Production `main` at LSN `1/E2B44598`, timestamp `2026-08-28T02:03:32Z` |
| Public Blob manifest | `docs/recovery/public-exhibition-images-2026-08-28.json` |
| Private Blob manifest | `docs/recovery/private-archive-2026-08-28.json` |
| Configuration manifest | `docs/recovery/production-configuration-2026-08-28.json` |

The Neon recovery branch was created without a compute. It is not a development database and must not be connected to an application.

## A. Code or deployment failure

Use the local tag `production-pre-refactor-2026-08-28` to identify the exact source tree, or use immutable Vercel deployment `dpl_7HgdbmtTZmfnKyL2Lx6LgCnJ87Sa` to restore production routing.

Before any rollback action:

1. Verify the deployment is ready, belongs to project `prj_YCn5F9fEsMGHpBBKInqNNkbvPuwG`, and records source SHA `43c0ac9b099e6fb7b7b22da6bc6fbe68342e20d1`.
2. Verify the intended target is the canonical alias `gallery-1019-site.vercel.app`.
3. Use Vercel's explicit promote or alias restoration operation only as a separately approved incident action.
4. Verify the canonical alias resolves to the checkpoint deployment after the action.

A code or deployment rollback does **not** imply a database rollback. Do not restore Neon or alter Blob objects merely because code was rolled back.

## B. Database corruption

Recovery target: Neon branch `backup-pre-refactor-2026-08-28` (`br-calm-hat-au74cbb0`) in project `calm-glitter-93873921`.

The branch was created from production branch `br-crimson-flower-auah6zwc` at LSN `1/E2B44598`. It was verified ready with `init_source` equal to `parent-data`, zero compute time, and zero written bytes.

Do not point production at this branch automatically. A database restore requires a separate incident plan that first determines the corrupted tables and the required recovery scope, validates the checkpoint in isolation, and obtains explicit approval for any production write or connection change.

## C. Blob or storage damage

Use the two JSON manifests under `docs/recovery/` to determine which objects existed at the checkpoint.

- The public exhibition-image manifest records 182 objects and includes pathname, returned public URL, size, content type when available, and upload time.
- The private archive manifest records 3 objects and includes pathname, size, content type when available, and upload time. Private URLs are intentionally omitted.
- At this checkpoint, the private store's three objects are the previously existing diagnostic objects; no objects were deleted or changed.

The manifests are inventories, not object backups. Do not blindly replace, rename, copy, or delete Blob objects. Any repair must compare the live store to the manifest, identify the damaged subset, and proceed as a separately approved storage-recovery task.

## Production rollback metadata

The verified deployment had these aliases at checkpoint time:

- `gallery-1019-site.vercel.app`
- `gallery-1019-site-nine.vercel.app`
- `gallery-1019-site-1019-gallery.vercel.app`

No promote, redeploy, alias assignment, rollback, or project-setting change was performed while creating this checkpoint.

## Safety boundaries

- Never expose or commit environment values, tokens, passwords, or connection strings.
- Never treat the recovery Neon branch as development infrastructure.
- Never infer that code, database, and Blob rollback should happen together.
- Never deploy or push as part of recovery verification.
- Verify current resource identity again before any future recovery action because aliases and production state may have changed after this checkpoint.