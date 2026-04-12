import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyInteractionUpdate } from '@/lib/server/appState';
import { authenticateHelperRequest } from '@/lib/server/helperAuth';

const interactionSchema = z.object({
  bubbleIds: z.array(z.string().trim().min(1)).min(1).max(250),
  occurredAt: z.string().datetime(),
  timeZone: z.string().trim().min(1).default('UTC'),
});

export async function POST(request: NextRequest) {
  const auth = await authenticateHelperRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = interactionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid interaction payload.' }, { status: 400 });
  }

  const { bubbleIds, occurredAt, timeZone } = parsed.data;
  const result = await applyInteractionUpdate({
    bubbleIds,
    occurredAt,
    timeZone,
  });

  return NextResponse.json({
    ok: true,
    helperId: auth.helper.id,
    updatedCount: result.updatedCount,
    version: result.version,
    updatedAt: result.updatedAt,
  });
}
