# Bubble.

Modern Next.js 14+ app to track personal relationships with an interactive, physics-inspired bubble visualization. People appear as realistic bubbles on a time-based x‑axis with category‑specific white gradients, a left‑side danger zone, and delightful animations.

## Tech
- Next.js 14 (App Router), React, TypeScript
- Tailwind CSS (glassmorphism UI + custom typography)
- Framer Motion (animations, drag physics)
- Zustand (state + localStorage persistence)

## Getting Started
1. Install dependencies:
   - `pnpm install` or `npm install` or `yarn`
2. Run dev server:
   - `pnpm dev` or `npm run dev` or `yarn dev`
3. Open `http://localhost:3000`

## Fonts
Add Google Fonts in `app/layout.tsx` via `<link>` tags:

```
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=Fragment+Mono&display=swap" rel="stylesheet" />
```

Switzer (display): Using a system fallback initially. To use Switzer:
1. Place `Switzer-Medium.woff2` into `public/fonts/`.
2. Uncomment the `@font-face` in `app/globals.css` or replace the `src:` with your files.

## Scripts
- `dev`: start the development server
- `build`: build for production
- `start`: run the production build
- `lint`: lint the codebase

## Data Persistence
- Local-first via `localStorage` (Zustand `persist`).
- Image uploads are center‑cropped to a circle and stored as optimized data URLs.
- Import/Export JSON available from the category menu.
- File Sync (local-only): use the “File Sync ▾” menu in the top-right to connect a JSON file on your computer. Changes auto‑save to that file and load on refresh. No server required.

## Deployment
- Ready for Vercel. No special config required.

## Example Data
On first run, the app seeds 3 example categories and 10 people. You can reset by using Import/Export → Reset.

## Roadmap (Phase 2)
- Auth (NextAuth.js), cloud DB, reminders, analytics, collaboration.

## Auth (Optional)
The project includes password-based auth using NextAuth + Prisma (Postgres). In this local‑only build, cloud data sync is disabled and your bubbles stay on your device (localStorage/File Sync). You can still keep the auth screens for future use or remove them if not needed.

Setup:

1) Env vars

```
cp .env.local.example .env.local
# Set NEXTAUTH_SECRET (generate with: openssl rand -base64 32)
```

2) Install deps

```
npm install
```

3) Init database

```
npx prisma migrate dev --name init
```

Run dev:

```
npm run dev
```

Authentication screens and server sync are removed in this local‑only build.

## Cloud Sync (Disabled)
Earlier versions supported syncing categories/people to a Postgres database (e.g., Supabase) via `/api/data`. In this build that endpoint is removed and the app operates entirely locally. If you plan to re-enable cloud sync later, you can restore an `/api/data` route and wire Prisma to your DB.

## Security Deployment Checklist

Use this checklist before making the project public and deploying:

- Secrets
  - Rotate any secrets committed locally (DB password, `NEXTAUTH_SECRET`) if they were ever shared.
  - Set `NEXTAUTH_SECRET`, `DATABASE_URL`, and `DIRECT_URL` in your hosting provider; never commit real secrets.
  - Use a dedicated DB user with least privileges, not the `postgres` superuser.

- Headers & CSP
  - Security headers and a CSP are configured in `next.config.mjs`. If you change fonts or add external resources, update the CSP sources accordingly.
  - Serve over HTTPS only; enable HSTS (already configured).

- API hardening
  - Auth routes are rate limited via `middleware.ts`. For production-grade limits across regions/instances, replace the in-memory limiter with a shared store (e.g., Upstash Redis).

- Images
  - Currently only data URLs are stored for person images and are size‑capped. If you introduce remote images or `next/image`, explicitly allow only needed hosts.

- NextAuth
  - Confirm `NEXTAUTH_URL` matches your production domain (including `https://`).
  - Consider enabling additional providers only as needed and review their security notes.

-- Database (only if you re-enable cloud sync or keep auth)
  - Run migrations in production: `npx prisma migrate deploy`.
  - Ensure `DIRECT_URL` is used only for migrations; app traffic should use the pooled `DATABASE_URL`.

- Monitoring
  - Enable logging/alerts for 4xx/5xx on `/api/auth/*` if auth is enabled.
  - Track rate-limit responses (HTTP 429) to tune thresholds.

After deploy, smoke test:

- Sign up, sign in/out flows.
- File Sync: connect a local JSON and verify automatic saves.
- Import/export JSON manually if preferred.
- Image upload and rendering.
