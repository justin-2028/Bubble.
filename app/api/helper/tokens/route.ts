import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/server/auth';
import { createHelperToken, listHelperTokens } from '@/lib/server/helperTokens';

const createTokenSchema = z.object({
  name: z.string().trim().max(80).optional(),
});

export async function GET() {
  if (!getSession()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tokens = await listHelperTokens();
  return NextResponse.json({ tokens });
}

export async function POST(request: NextRequest) {
  if (!getSession()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = createTokenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid helper token payload.' }, { status: 400 });
  }

  const result = await createHelperToken(parsed.data.name ?? 'Mac Helper');
  return NextResponse.json(result, { status: 201 });
}
