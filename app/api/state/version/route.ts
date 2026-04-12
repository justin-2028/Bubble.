import { NextResponse } from 'next/server';
import { getSession } from '@/lib/server/auth';
import { getAppStateVersionSnapshot } from '@/lib/server/appState';

export async function GET() {
  if (!getSession()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const current = await getAppStateVersionSnapshot();
  return NextResponse.json(current, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
