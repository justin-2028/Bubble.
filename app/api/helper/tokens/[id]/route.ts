import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/server/auth';
import { revokeHelperToken } from '@/lib/server/helperTokens';

type Context = {
  params: {
    id: string;
  };
};

export async function DELETE(_request: NextRequest, { params }: Context) {
  if (!getSession()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const revoked = await revokeHelperToken(params.id);
  if (!revoked) {
    return NextResponse.json({ error: 'Token not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
