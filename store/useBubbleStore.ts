"use client";
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Category, ExportSchema, Label, Person } from '../lib/types';
import { uid, formatDateISO } from '../lib/utils';

type State = {
  categories: Category[];
  people: Person[];
  labels: Label[];
  currentCategoryId: string | null;
};

type Actions = {
  setCurrentCategory: (id: string) => void;
  addCategory: (partial: Partial<Category>) => void;
  updateCategory: (id: string, patch: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  reorderCategory: (id: string, dir: -1 | 1) => void;
  addPerson: (p: Omit<Person, 'id'>) => void;
  updatePerson: (id: string, patch: Partial<Person>) => void;
  deletePerson: (id: string) => void;
  duplicatePersonToCategory: (personId: string, categoryId: string) => void;
  bulkUpdateLastInteraction: (personIds: string[], lastInteractionIso: string) => void;
  bulkDuplicatePeopleToCategory: (personIds: string[], categoryId: string) => void;
  bulkDeletePeople: (personIds: string[]) => void;
  addLabel: (partial: Pick<Label, 'name' | 'color'>) => string;
  updateLabel: (id: string, patch: Partial<Label>) => void;
  deleteLabel: (id: string) => void;
  importData: (data: ExportSchema) => void;
  exportData: () => ExportSchema;
};

const exampleCategories: Category[] = [
  {
    id: uid('cat_'),
    name: 'Family',
    timeLimitValue: 14,
    timeLimitUnit: 'days',
    sortOrder: 0,
    gradientColors: ['#ffffff', '#f8f8f8', '#f0f0f0']
  },
  {
    id: uid('cat_'),
    name: 'Mentors',
    timeLimitValue: 1,
    timeLimitUnit: 'months',
    sortOrder: 1,
    gradientColors: ['#ffffff', '#f6f6f6', '#ececec']
  },
  {
    id: uid('cat_'),
    name: 'Friends',
    timeLimitValue: 21,
    timeLimitUnit: 'days',
    sortOrder: 2,
    gradientColors: ['#ffffff', '#f7f7f7', '#ededed']
  }
];

const todayISO = formatDateISO(new Date());

function initialsFromName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
  return (first + last).toUpperCase() || '?';
}

function hueFromString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h % 360;
}

function svgAvatarDataUrl(fullName: string) {
  const initials = initialsFromName(fullName);
  const hue = hueFromString(fullName);
  const bg1 = `hsl(${hue} 85% 62%)`;
  const bg2 = `hsl(${(hue + 28) % 360} 85% 50%)`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg1}"/>
      <stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="176" font-weight="700" fill="rgba(255,255,255,0.92)">${initials}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function samplePeople(cats: Category[]): Person[] {
  const [c1, c2, c3] = cats;
  const mk = (fullName: string, categoryId: string, daysAgo: number, yPosition: number): Person => ({
    id: uid('p_'),
    fullName,
    categoryId,
    context: '',
    lastInteraction: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    yPosition,
    image: svgAvatarDataUrl(fullName),
    labelIds: [],
    starred: false,
  });
  return [
    mk('Alice Bubble', c1.id, 3, 20),
    mk('Bob Bubble', c1.id, 11, 45),
    mk('Dr. Patel', c2.id, 20, 30),
    mk('Prof. Nguyen', c2.id, 45, 60),
    mk('Ethan Wright', c3.id, 2, 25),
    mk('Maya Chen', c3.id, 7, 50),
    mk('Ravi Kumar', c3.id, 25, 65),
    mk('Sara Kim', c3.id, 12, 80),
    mk('Tom Bubble', c1.id, 28, 55)
  ];
}

export const useBubbleStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      categories: exampleCategories,
      people: samplePeople(exampleCategories),
      labels: [],
      currentCategoryId: exampleCategories[0].id,

      setCurrentCategory: (id) => set({ currentCategoryId: id }),

      addCategory: (partial) =>
        set((s) => {
          const next: Category = {
            id: uid('cat_'),
            name: partial.name || 'New Category',
            timeLimitValue: partial.timeLimitValue ?? 14,
            timeLimitUnit: partial.timeLimitUnit ?? 'days',
            sortOrder: s.categories.length,
            gradientColors: partial.gradientColors || ['#ffffff', '#f7f7f7', '#ededed']
          };
          return { categories: [...s.categories, next], currentCategoryId: next.id };
        }),

      updateCategory: (id, patch) =>
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c))
        })),

      deleteCategory: (id) =>
        set((s) => {
          const categories = s.categories.filter((c) => c.id !== id)
            .map((c, i) => ({ ...c, sortOrder: i }));
          const people = s.people.filter((p) => p.categoryId !== id);
          const currentCategoryId = categories[0]?.id || null;
          return { categories, people, currentCategoryId };
        }),

      reorderCategory: (id, dir) =>
        set((s) => {
          const list = [...s.categories].sort((a, b) => a.sortOrder - b.sortOrder);
          const idx = list.findIndex((c) => c.id === id);
          const swapWith = idx + dir;
          if (swapWith < 0 || swapWith >= list.length) return {} as any;
          const tmp = list[idx].sortOrder;
          list[idx].sortOrder = list[swapWith].sortOrder;
          list[swapWith].sortOrder = tmp;
          const categories = list.sort((a, b) => a.sortOrder - b.sortOrder).map((c, i) => ({ ...c, sortOrder: i }));
          return { categories };
        }),

      addPerson: (p) =>
        set((s) => ({ people: [...s.people, { ...p, id: uid('p_') }] })),

      updatePerson: (id, patch) =>
        set((s) => {
          const target = s.people.find((p) => p.id === id);
          if (!target) return { people: s.people };
          const groupId = target.duplicateGroupId ?? target.id;
          const sharedPatch: Partial<Person> = { ...patch };
          delete (sharedPatch as any).categoryId;
          delete (sharedPatch as any).yPosition;
          const hasShared = Object.keys(sharedPatch).length > 0;
          return {
            people: s.people.map((p) => {
              const pGroupId = p.duplicateGroupId ?? p.id;
              if (p.id === id) return { ...p, ...patch };
              if (hasShared && pGroupId === groupId) return { ...p, ...sharedPatch };
              return p;
            })
          };
        }),

      deletePerson: (id) => set((s) => ({ people: s.people.filter((x) => x.id !== id) })),

      duplicatePersonToCategory: (personId, categoryId) =>
        set((s) => {
          const src = s.people.find((p) => p.id === personId);
          if (!src) return {};
          const groupId = src.duplicateGroupId ?? src.id;
          const next: Person = {
            ...src,
            id: uid('p_'),
            categoryId,
            duplicateGroupId: groupId,
          };
          return { people: [...s.people, next] };
        }),

      bulkUpdateLastInteraction: (personIds, lastInteractionIso) =>
        set((s) => {
          const idSet = new Set(personIds);
          const groupIdsToUpdate = new Set<string>();
          for (const p of s.people) {
            if (idSet.has(p.id)) groupIdsToUpdate.add(p.duplicateGroupId ?? p.id);
          }
          return {
            people: s.people.map((p) => {
              const gid = p.duplicateGroupId ?? p.id;
              if (groupIdsToUpdate.has(gid)) return { ...p, lastInteraction: lastInteractionIso };
              return p;
            })
          };
        }),

      bulkDuplicatePeopleToCategory: (personIds, categoryId) =>
        set((s) => {
          const idSet = new Set(personIds);
          const nextPeople: Person[] = [];
          for (const src of s.people) {
            if (!idSet.has(src.id)) continue;
            const groupId = src.duplicateGroupId ?? src.id;
            nextPeople.push({
              ...src,
              id: uid('p_'),
              categoryId,
              duplicateGroupId: groupId,
            });
          }
          return nextPeople.length ? { people: [...s.people, ...nextPeople] } : {};
        }),

      bulkDeletePeople: (personIds) =>
        set((s) => {
          const idSet = new Set(personIds);
          return { people: s.people.filter((p) => !idSet.has(p.id)) };
        }),

      addLabel: (partial) => {
        const nextId = uid('lab_');
        set((s) => ({
          labels: [
            ...s.labels,
            {
              id: nextId,
              name: partial.name.trim() || 'New Label',
              color: partial.color || '#2563eb',
            },
          ],
        }));
        return nextId;
      },

      updateLabel: (id, patch) =>
        set((s) => ({
          labels: s.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        })),

      deleteLabel: (id) =>
        set((s) => ({
          labels: s.labels.filter((l) => l.id !== id),
          people: s.people.map((p) => ({
            ...p,
            labelIds: (p.labelIds ?? []).filter((x) => x !== id),
          })),
        })),

      importData: (data) =>
        set((s) => {
          const categories = (data.categories ?? []).map((c) => ({
            ...c,
            description: (c as any).description ?? '',
          }));
          const people = (data.people ?? []).map((p) => ({
            ...p,
            labelIds: (p as any).labelIds ?? [],
            starred: (p as any).starred ?? false,
            duplicateGroupId: (p as any).duplicateGroupId,
          }));
          const labels = (data as any).labels ?? [];
          // Preserve currentCategoryId if it still exists after import; otherwise fallback to first
          const keepId = s.currentCategoryId && categories.some((c) => c.id === s.currentCategoryId)
            ? s.currentCategoryId
            : categories[0]?.id ?? null;
          return { categories, people, labels, currentCategoryId: keepId };
        }),

      exportData: () => ({ version: 2, categories: get().categories, people: get().people, labels: get().labels })
	    }),
	    {
	      name: 'bubble-store-v1',
	      version: 2,
	      migrate: (persisted: any) => {
	        if (!persisted || typeof persisted !== 'object') return persisted as any;
	        const categories = Array.isArray(persisted.categories) ? persisted.categories : [];
        const people = Array.isArray(persisted.people) ? persisted.people : [];
        const labels = Array.isArray(persisted.labels) ? persisted.labels : [];
        return {
          ...persisted,
          categories: categories.map((c: any) => ({ ...c, description: c.description ?? '' })),
          people: people.map((p: any) => ({
            ...p,
            labelIds: Array.isArray(p.labelIds) ? p.labelIds : [],
            starred: typeof p.starred === 'boolean' ? p.starred : false,
            duplicateGroupId: p.duplicateGroupId,
          })),
          labels,
        } as any;
      },
    }
  )
);
