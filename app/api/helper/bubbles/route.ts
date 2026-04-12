import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateHelperRequest } from '@/lib/server/helperAuth';
import { createHelperBubble } from '@/lib/server/appState';

const createBubbleSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  categoryId: z.string().trim().min(1).optional(),
  context: z.string().trim().max(2000).optional(),
  lastInteraction: z.string().datetime().optional(),
  image: z
    .string()
    .trim()
    .max(2_000_000)
    .refine((value) => value.length === 0 || value.startsWith('data:image/'), 'Invalid image payload.')
    .optional(),
  starred: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await authenticateHelperRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = createBubbleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid helper Bubble payload.' }, { status: 400 });
  }

  const { fullName } = parsed.data;
  const result = await createHelperBubble({
    fullName,
    categoryId: parsed.data.categoryId,
    context: parsed.data.context,
    lastInteraction: parsed.data.lastInteraction,
    image: parsed.data.image,
    starred: parsed.data.starred,
  });

  if (!result) {
    return NextResponse.json(
      { error: 'Bubble could not be created because no categories exist yet.' },
      { status: 409 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      helperId: auth.helper.id,
      version: result.version,
      updatedAt: result.updatedAt,
      bubble: result.bubble,
    },
    { status: 201 }
  );
}
