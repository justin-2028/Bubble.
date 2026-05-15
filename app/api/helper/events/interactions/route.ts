import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyInteractionUpdate, applyInteractionUpdates } from '@/lib/server/appState';
import { authenticateHelperRequest } from '@/lib/server/helperAuth';

const interactionSchema = z.object({
  bubbleIds: z.array(z.string().trim().min(1)).min(1).max(250),
  occurredAt: z.string().datetime(),
  timeZone: z.string().trim().min(1).default('UTC'),
});

const interactionBatchSchema = z.object({
  updates: z
    .array(
      z.object({
        bubbleId: z.string().trim().min(1),
        occurredAt: z.string().datetime(),
      })
    )
    .min(1)
    .max(1_000),
  timeZone: z.string().trim().min(1).default('UTC'),
});

export async function POST(request: NextRequest) {
  const auth = await authenticateHelperRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const payload = await request.json().catch(() => null);
  const batchParsed = interactionBatchSchema.safeParse(payload);
  const singleParsed = batchParsed.success ? null : interactionSchema.safeParse(payload);

  if (!batchParsed.success && !singleParsed?.success) {
    return NextResponse.json({ error: 'Invalid interaction payload.' }, { status: 400 });
  }

  let updatedCount = 0;
  let version = 0;
  let updatedAt = new Date().toISOString();

  if (batchParsed.success) {
    const result = await applyInteractionUpdates(batchParsed.data);
    updatedCount = result.updatedCount;
    version = result.version;
    updatedAt = result.updatedAt;
  } else if (singleParsed?.success) {
    const singleData = singleParsed.data;
    const result = await applyInteractionUpdate({
      bubbleIds: singleData.bubbleIds,
      occurredAt: singleData.occurredAt,
      timeZone: singleData.timeZone,
    });
    updatedCount = result.updatedCount;
    version = result.version;
    updatedAt = result.updatedAt;
  } else {
    return NextResponse.json({ error: 'Invalid interaction payload.' }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    helperId: auth.helper.id,
    updatedCount,
    version,
    updatedAt,
  });
}
