import { NextRequest, NextResponse } from 'next/server';
import { authenticateHelperRequest } from '@/lib/server/helperAuth';
import { getHelperBootstrapState } from '@/lib/server/appState';

export async function GET(request: NextRequest) {
  const auth = await authenticateHelperRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const current = await getHelperBootstrapState();
  const orderedCategories = current.categories
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((category) => ({
      id: category.id,
      name: category.name,
      sortOrder: category.sortOrder,
    }));
  const categoryOrderById = new Map(orderedCategories.map((category) => [category.id, category.sortOrder]));
  const categoryNameById = new Map(orderedCategories.map((category) => [category.id, category.name]));

  const groupedPeople = new Map<string, typeof current.people>();
  for (const person of current.people.filter((entry) => !entry.archivedAt)) {
    const groupId = person.duplicateGroupId ?? person.id;
    const existing = groupedPeople.get(groupId);
    if (existing) {
      existing.push(person);
    } else {
      groupedPeople.set(groupId, [person]);
    }
  }

  const activeBubbles = Array.from(groupedPeople.entries())
    .map(([groupId, people]) => {
      const representative = people
        .slice()
        .sort((lhs, rhs) => {
          const lhsIsCanonical = (lhs.duplicateGroupId ?? lhs.id) === lhs.id;
          const rhsIsCanonical = (rhs.duplicateGroupId ?? rhs.id) === rhs.id;
          if (lhsIsCanonical !== rhsIsCanonical) {
            return lhsIsCanonical ? -1 : 1;
          }
          const lhsCategoryOrder = categoryOrderById.get(lhs.categoryId) ?? Number.MAX_SAFE_INTEGER;
          const rhsCategoryOrder = categoryOrderById.get(rhs.categoryId) ?? Number.MAX_SAFE_INTEGER;
          if (lhsCategoryOrder !== rhsCategoryOrder) {
            return lhsCategoryOrder - rhsCategoryOrder;
          }
          return lhs.fullName.localeCompare(rhs.fullName);
        })[0];

      let latestInteraction = representative.lastInteraction;
      for (const person of people) {
        if (Date.parse(person.lastInteraction) > Date.parse(latestInteraction)) {
          latestInteraction = person.lastInteraction;
        }
      }

      const categoryNames = Array.from(
        new Set(
          people
            .slice()
            .sort(
              (lhs, rhs) =>
                (categoryOrderById.get(lhs.categoryId) ?? Number.MAX_SAFE_INTEGER) -
                (categoryOrderById.get(rhs.categoryId) ?? Number.MAX_SAFE_INTEGER)
            )
            .map((person) => categoryNameById.get(person.categoryId) ?? person.categoryId)
        )
      );

      return {
        id: groupId,
        fullName: representative.fullName,
        categoryId: representative.categoryId,
        lastInteraction: latestInteraction,
        image: undefined,
        starred: people.some((person) => !!person.starred),
        duplicateCount: people.length,
        categoryNames,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

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
