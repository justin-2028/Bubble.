# Bubble — Personal Relationship Tracker

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
- Local persistence via `localStorage` (Zustand `persist`).
- Image uploads are center‑cropped to a circle and stored as optimized data URLs.
- Import/Export JSON available from the category menu.

## Deployment
- Ready for Vercel. No special config required.

## Example Data
On first run, the app seeds 3 example categories and 10 people. You can reset by using Import/Export → Reset.

## Roadmap (Phase 2)
- Auth (NextAuth.js), cloud DB, reminders, analytics, collaboration.
