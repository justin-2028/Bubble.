import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { clearSessionCookie, issueSessionCookie, verifyAdminCredentials } from '@/lib/server/auth';
import { isAuthConfigured, isSessionConfigured } from '@/lib/server/env';

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  if (!isAuthConfigured()) {
    clearSessionCookie();
    return NextResponse.json(
      { error: 'Bubble auth is not configured yet. Set BUBBLE_ADMIN_PASSWORD_HASH first.' },
      { status: 503 }
    );
  }

  if (!isSessionConfigured()) {
    clearSessionCookie();
    return NextResponse.json(
      { error: 'Bubble session secret is missing. Set BUBBLE_SESSION_SECRET or NEXTAUTH_SECRET.' },
      { status: 503 }
    );
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid login payload.' }, { status: 400 });
  }

  const { username, password } = parsed.data;
  const ok = await verifyAdminCredentials(username, password);
  if (!ok) {
    clearSessionCookie();
    return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 });
  }

  issueSessionCookie(username);
  return NextResponse.json({ ok: true });
}
