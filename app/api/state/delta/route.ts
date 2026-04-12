import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server/auth';
import { getAppStateDelta } from '@/lib/server/appState';

export async function GET(request: NextRequest) {
  if (!getSession()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sinceVersion = Number(request.nextUrl.searchParams.get('sinceVersion') || '');
  if (!Number.isFinite(sinceVersion) || sinceVersion < 0) {
    return NextResponse.json({ error: 'Invalid sinceVersion.' }, { status: 400 });
  }

  const delta = await getAppStateDelta(sinceVersion);
  return NextResponse.json(delta, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
