import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { svgAvatarDataUrl } from '@/lib/avatar';
import { uid } from '@/lib/utils';
import { authenticateHelperRequest } from '@/lib/server/helperAuth';
import { mutateAppState } from '@/lib/server/appState';

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
  const initialLastInteraction = parsed.data.lastInteraction ?? new Date().toISOString();
  let createdBubbleId = '';
  let createdBubbleCategoryId = '';
  let createdBubbleImage = '';

  const doc = await mutateAppState((current) => {
    const orderedCategories = current.categories.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const categoryId =
      parsed.data.categoryId && current.categories.some((category) => category.id === parsed.data.categoryId)
        ? parsed.data.categoryId
        : orderedCategories[0]?.id ?? '';

    if (!categoryId) {
      return current;
    }

    const image = parsed.data.image?.trim() ? parsed.data.image.trim() : svgAvatarDataUrl(fullName);
    const nextId = uid('p_');

    createdBubbleId = nextId;
    createdBubbleCategoryId = categoryId;
    createdBubbleImage = image;

    return {
      ...current,
      people: [
        ...current.people,
        {
          id: nextId,
          fullName,
          categoryId,
          context: parsed.data.context?.trim() ?? '',
          lastInteraction: initialLastInteraction,
          interactionCount: 0,
          image,
          yPosition: 50,
          starred: parsed.data.starred ?? false,
          labelIds: [],
        },
      ],
    };
  });

  if (!createdBubbleId) {
    return NextResponse.json(
      { error: 'Bubble could not be created because no categories exist yet.' },
      { status: 409 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      helperId: auth.helper.id,
      version: doc.version,
      updatedAt: doc.updatedAt,
      bubble: {
        id: createdBubbleId,
        fullName,
        categoryId: createdBubbleCategoryId,
        lastInteraction: initialLastInteraction,
        image: createdBubbleImage,
        starred: parsed.data.starred ?? false,
      },
    },
    { status: 201 }
  );
}
