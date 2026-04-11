import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mutateAppState } from '@/lib/server/appState';
import { isMoreRecentIso, sameCalendarDayInTimeZone } from '@/lib/cloud';
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
  const bubbleIdSet = new Set(bubbleIds);
  let updatedCount = 0;

  const doc = await mutateAppState((current) => ({
    ...current,
    people: current.people.map((person) => {
      if (!bubbleIdSet.has(person.id)) return person;
      if (sameCalendarDayInTimeZone(person.lastInteraction, occurredAt, timeZone)) return person;
      if (!isMoreRecentIso(person.lastInteraction, occurredAt)) return person;
      updatedCount += 1;
      return {
        ...person,
        lastInteraction: occurredAt,
        interactionCount: (typeof person.interactionCount === 'number' ? person.interactionCount : 0) + 1,
      };
    }),
  }));

  return NextResponse.json({
    ok: true,
    helperId: auth.helper.id,
    updatedCount,
    version: doc.version,
    updatedAt: doc.updatedAt,
  });
}
