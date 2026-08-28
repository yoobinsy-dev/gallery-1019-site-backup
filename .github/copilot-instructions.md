# Gallery 10.19 agent rules

Read `ARCHITECTURE.md` before Git, deployment, environment, database, Blob, migration, or refactoring work.

- Treat `/Users/MacBook/Documents/10.19 Website` as a frozen legacy/WIP workspace. Never clean, reset, stash, revert, delete, overwrite, stage, commit, or repurpose it.
- Use `/Users/MacBook/Documents/Gallery 10.19 Production` only for production verification and releases from `main`.
- Use `/Users/MacBook/Documents/Gallery 10.19 Development` for integration work on `develop`.
- Create `feature/*`, `refactor/*`, and `fix/*` branches from `develop`. Do not perform normal development directly on `main`.
- Never deploy production from a dirty worktree. Production deployments originate only from `main`.
- Never link a development worktree to the production Vercel project or install production write credentials in development, preview, CI, or local development environments.
- Do not deploy development until separate development Vercel, Neon, public image Blob, and optional private archive resources pass the isolation gate in `ARCHITECTURE.md`.
- Refactoring must preserve behavior and must not change database schema or production data.
- Never restore persisted/base64 artwork images. Artwork images remain Blob-backed URL references.
- Treat environment/infrastructure changes and data migrations as separate tasks from code refactoring. Require explicit scope and approval.
- Do not reveal, print, copy, or commit secret values. Refer to resources only by safe names and IDs.
- Before changing Git refs or deploying, verify the canonical production deployment and commit; do not rely on an old deployment ID or stale remote branch.