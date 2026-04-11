import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/server/auth';

export async function POST() {
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}
