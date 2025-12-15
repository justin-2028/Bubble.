import { NextRequest, NextResponse } from 'next/server';

// Canonical public host. All other hosts (including `*.vercel.app`) will redirect here.
// Override in Vercel env vars if desired.
const PRIMARY_HOST = (process.env.PRIMARY_HOST || 'www.bubble.garden').toLowerCase();
const ALSO_ALLOW = PRIMARY_HOST.replace(/^www\./, '');
const ALLOWED = new Set([PRIMARY_HOST, ALSO_ALLOW, 'localhost:3000', 'localhost']);

export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') || '').toLowerCase();
  if (!host || ALLOWED.has(host)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.protocol = 'https:';
  url.host = PRIMARY_HOST;
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|icon.png|robots.txt|sitemap.xml).*)'],
};

