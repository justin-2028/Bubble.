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

## Cloud Sync / Auth
Earlier prototypes included Supabase/Prisma + NextAuth for cloud storage. This branch is intentionally local-only: all categories/people stay in the browser (or an optional synced JSON file). If you decide to add a backend later, you can reintroduce an `/api/data` route and whichever auth/data stack you prefer.

## Deployment Checklist

Use this list before making the project public:

- Secrets
  - No database credentials are required in this build. If you later add a backend, keep secrets out of the repo and rotate anything previously committed.

- Headers & CSP
  - Security headers and a CSP are configured in `next.config.mjs`. Update the CSP if you add new external fonts, APIs, or image hosts.
  - Serve over HTTPS only; keep HSTS enabled.

- Data handling
  - Local File Sync writes directly to a user-selected JSON file. Make sure your deployment platform supports the File System Access API (Chromium-based browsers).
  - If you add remote image hosting or `next/image`, explicitly configure allowed domains.

- Monitoring
  - Track client errors and performance (e.g., via Vercel Web Analytics or your preferred tool) to catch rendering issues.

After deploy, smoke test:

- File Sync: connect a local JSON and verify automatic saves.
- Import/export JSON manually if preferred.
- Image upload, drag interactions, and the timeline layout.
