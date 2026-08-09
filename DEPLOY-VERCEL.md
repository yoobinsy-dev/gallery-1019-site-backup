# Deploying This Site To Vercel

## 0) Install Node.js (required)

If npm is not installed on your Mac:

```bash
brew install node
```

Then verify:

```bash
node -v
npm -v
```

## 1) Install dependencies

```bash
npm install
```

## 2) Create Vercel project and link

```bash
npx vercel
```

## 3) Create a Postgres database

Use one of:
- Vercel Postgres
- Neon
- Supabase Postgres

Copy the `DATABASE_URL`.

## 4) Add environment variables in Vercel

Required:
- `DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN` (required for independent exhibition snapshot archive storage)

Optional (only if using `/api/upload` for file/image uploads):
- None

You can set these in Vercel dashboard:
Project -> Settings -> Environment Variables

## 5) Deploy to production

```bash
npx vercel --prod
```

You will get a URL like:
- `https://your-project-name.vercel.app`

You do not need to buy a domain for this.

## 6) Verify

Check health endpoint:
- `/api/health`

It should return JSON with `ok: true`.

## Snapshot Schedule And Retention

- Vercel cron calls `/api/snapshots-cron` at 22:00 UTC and 10:00 UTC, which is 07:00 KST and 19:00 KST.
- Cron now creates **isolated snapshots per exhibition** (not one merged sitewide snapshot).
- Automatic snapshots are deduplicated per exhibition per KST date+slot (morning/evening).
- Snapshot retention is 7 days. Older exhibition snapshots are purged automatically.
- Every automatic/manual exhibition snapshot is also archived to Vercel Blob object storage (independent from app state tables) so backup payloads survive app-state failures.

List snapshots for one exhibition:

```bash
curl -s 'https://YOUR_DOMAIN/api/exhibition-snapshots?exhibitionId=123&limit=30'
```

Create an immediate manual snapshot for one exhibition:

```bash
curl -s -X POST https://YOUR_DOMAIN/api/exhibition-snapshots \
	-H "Content-Type: application/json" \
	-d '{"action":"capture-now","exhibitionId":123,"note":"before bulk edit"}'
```

Restore a snapshot for one exhibition:

```bash
curl -s -X POST https://YOUR_DOMAIN/api/exhibition-snapshots \
	-H "Content-Type: application/json" \
	-d '{"action":"restore","exhibitionId":123,"snapshotId":456}'
```

Undo the most recent restore (per exhibition):

```bash
curl -s -X POST https://YOUR_DOMAIN/api/exhibition-snapshots \
	-H "Content-Type: application/json" \
	-d '{"action":"undo-restore","exhibitionId":123}'
```

Optional hardening for direct endpoint protection:

- Set `SNAPSHOT_CRON_SECRET` in Vercel env vars.
- You can then call `/api/snapshots-cron?secret=YOUR_SECRET` manually when needed.

## State Safety Auditing

- Every `/api/state` write is now audit-logged with decision (`accepted`, `merged_accept`, `conflict_rejected`, `drop_blocked`), versions, and client tab id.
- Conflict spikes automatically generate alerts in `app_state_alerts`.
- Suspicious large exhibition inventory drops are hard-blocked server-side unless `inventoryExplicitlyClearedAt` is present.

Quick checks:

```bash
curl -s https://YOUR_DOMAIN/api/health
curl -s 'https://YOUR_DOMAIN/api/state-audit?limit=50&alertLimit=20'
```

## Notes

- This repo now includes `cloud-sync.js`, which syncs `users` and `exhibitions` state to Postgres through `/api/state`.
- Existing UI continues to work with localStorage, while cloud sync provides cross-device persistence.
- For large photo/file usage, use `/api/upload` and store returned URL in exhibition data instead of large base64 strings.
