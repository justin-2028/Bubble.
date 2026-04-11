import { NextRequest, NextResponse } from 'next/server';
import { authenticateHelperRequest } from '@/lib/server/helperAuth';
import { getAppStateDocument } from '@/lib/server/appState';

export async function GET(request: NextRequest) {
  const auth = await authenticateHelperRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const current = await getAppStateDocument();
  const orderedCategories = current.doc.data.categories
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((category) => ({
      id: category.id,
      name: category.name,
      sortOrder: category.sortOrder,
    }));

  const activeBubbles = current.doc.data.people
    .filter((person) => !person.archivedAt)
    .slice()
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map((person) => ({
      id: person.id,
      fullName: person.fullName,
      categoryId: person.categoryId,
      lastInteraction: person.lastInteraction,
      image: person.image,
      starred: !!person.starred,
    }));

  return NextResponse.json(
    {
      helperId: auth.helper.id,
      serverTime: new Date().toISOString(),
      defaultCategoryId: orderedCategories[0]?.id ?? null,
      categories: orderedCategories,
      bubbles: activeBubbles,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  );
}
