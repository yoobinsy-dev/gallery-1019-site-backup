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

Optional (only if using `/api/upload` for file/image uploads):
- `BLOB_READ_WRITE_TOKEN`

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

## Notes

- This repo now includes `cloud-sync.js`, which syncs `users` and `exhibitions` state to Postgres through `/api/state`.
- Existing UI continues to work with localStorage, while cloud sync provides cross-device persistence.
- For large photo/file usage, use `/api/upload` and store returned URL in exhibition data instead of large base64 strings.
