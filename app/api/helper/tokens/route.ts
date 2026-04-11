import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/server/auth';
import { createHelperToken, listHelperTokens } from '@/lib/server/helperTokens';

const createTokenSchema = z.object({
  name: z.string().trim().max(80).optional(),
});

export async function GET() {
  try {
    if (!getSession()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tokens = await listHelperTokens();
    return NextResponse.json({ tokens });
  } catch (error) {
    console.error('Helper token listing failed.', error);
    return NextResponse.json({ error: 'Hosted Bubble storage is temporarily unavailable.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!getSession()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = createTokenSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid helper token payload.' }, { status: 400 });
    }

    const result = await createHelperToken(parsed.data.name ?? 'Mac Helper');
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Helper token creation failed.', error);
    return NextResponse.json({ error: 'Hosted Bubble storage is temporarily unavailable.' }, { status: 503 });
  }
}
