"use client";
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Category, ExportSchema, Label, Person, SystemControls } from '../lib/types';
import { uid, formatDateISO } from '../lib/utils';
import { svgAvatarDataUrl } from '../lib/avatar';

type State = {
  categories: Category[];
  people: Person[];
  labels: Label[];
  currentCategoryId: string | null;
  systemControls: SystemControls;
  historyPast: UndoSnapshot[];
  historyFuture: UndoSnapshot[];
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
  archivePerson: (id: string) => void;
  restorePerson: (id: string, opts: { categoryId: string; lastInteraction?: string }) => void;
  undo: () => void;
  redo: () => void;
  reorderArchivedPeople: (orderedIds: string[]) => void;
  duplicatePersonToCategory: (personId: string, categoryId: string) => void;
  bulkUpdateLastInteraction: (personIds: string[], lastInteractionIso: string) => void;
  bulkDuplicatePeopleToCategory: (personIds: string[], categoryId: string) => void;
  bulkArchivePeople: (personIds: string[]) => void;
  bulkRestorePeople: (personIds: string[]) => void;
  bulkDeletePeople: (personIds: string[]) => void;
  addLabel: (partial: Pick<Label, 'name' | 'color'>) => string;
  updateLabel: (id: string, patch: Partial<Label>) => void;
  deleteLabel: (id: string) => void;
  updateSystemControls: (patch: Partial<SystemControls>) => void;
  importData: (data: ExportSchema) => void;
  exportData: () => ExportSchema;
};

type UndoSnapshot = {
  categories: Category[];
  people: Person[];
};

const HISTORY_LIMIT = 50;

function pushUndoSnapshot(s: State): Pick<State, 'historyPast' | 'historyFuture'> {
  const snapshot: UndoSnapshot = { categories: s.categories, people: s.people };
  const past = s.historyPast ?? [];
  const last = past[past.length - 1];
  const isSame = !!last && last.categories === snapshot.categories && last.people === snapshot.people;
  const nextPast = isSame ? past : [...past, snapshot].slice(-HISTORY_LIMIT);
  return { historyPast: nextPast, historyFuture: [] };
}

function isMoreRecentIso(prevIso: string, nextIso: string) {
  const prev = Date.parse(prevIso as any);
  const next = Date.parse(nextIso as any);
  if (!Number.isFinite(next)) return false;
  if (!Number.isFinite(prev)) return true;
  return next > prev;
}

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

const defaultSystemControls: SystemControls = {
  multiSelectHotkeysEnabled: false,
  multiSelectUpdateToNowKey: null,
  multiSelectArchiveKey: null,
  multiSelectDeleteKey: null,
};

function samplePeople(cats: Category[]): Person[] {
  const [c1, c2, c3] = cats;
  const mk = (fullName: string, categoryId: string, daysAgo: number, yPosition: number): Person => ({
    id: uid('p_'),
    fullName,
    categoryId,
    context: '',
    lastInteraction: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    interactionCount: 0,
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
      systemControls: defaultSystemControls,
      historyPast: [],
      historyFuture: [],

      undo: () =>
        set((s) => {
          const prev = s.historyPast[s.historyPast.length - 1];
          if (!prev) return {} as any;
          const current: UndoSnapshot = { categories: s.categories, people: s.people };
          const nextPast = s.historyPast.slice(0, -1);
          const nextFuture = [current, ...s.historyFuture].slice(0, HISTORY_LIMIT);
          const nextCategories = prev.categories;
          const labelIdSet = new Set(s.labels.map((l) => l.id));
          const needsSanitize = prev.people.some((p) => (p.labelIds ?? []).some((id) => !labelIdSet.has(id)));
          const nextPeople = needsSanitize
            ? prev.people.map((p) => {
                const ids = p.labelIds ?? [];
                if (ids.length === 0) return p;
                const filtered = ids.filter((id) => labelIdSet.has(id));
                return filtered.length === ids.length ? p : { ...p, labelIds: filtered };
              })
            : prev.people;
          const currentCategoryId =
            s.currentCategoryId && nextCategories.some((c) => c.id === s.currentCategoryId)
              ? s.currentCategoryId
              : nextCategories[0]?.id ?? null;
          return {
            categories: nextCategories,
            people: nextPeople,
            currentCategoryId,
            historyPast: nextPast,
            historyFuture: nextFuture,
          };
        }),

      redo: () =>
        set((s) => {
          const next = s.historyFuture[0];
          if (!next) return {} as any;
          const current: UndoSnapshot = { categories: s.categories, people: s.people };
          const nextFuture = s.historyFuture.slice(1);
          const nextPast = [...s.historyPast, current].slice(-HISTORY_LIMIT);
          const nextCategories = next.categories;
          const labelIdSet = new Set(s.labels.map((l) => l.id));
          const needsSanitize = next.people.some((p) => (p.labelIds ?? []).some((id) => !labelIdSet.has(id)));
          const nextPeople = needsSanitize
            ? next.people.map((p) => {
                const ids = p.labelIds ?? [];
                if (ids.length === 0) return p;
                const filtered = ids.filter((id) => labelIdSet.has(id));
                return filtered.length === ids.length ? p : { ...p, labelIds: filtered };
              })
            : next.people;
          const currentCategoryId =
            s.currentCategoryId && nextCategories.some((c) => c.id === s.currentCategoryId)
              ? s.currentCategoryId
              : nextCategories[0]?.id ?? null;
          return {
            categories: nextCategories,
            people: nextPeople,
            currentCategoryId,
            historyPast: nextPast,
            historyFuture: nextFuture,
          };
        }),

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
          return { ...pushUndoSnapshot(s), categories: [...s.categories, next], currentCategoryId: next.id };
        }),

      updateCategory: (id, patch) =>
        set((s) => {
          const current = s.categories.find((c) => c.id === id);
          if (!current) return {} as any;
          const shouldRecord = Object.entries(patch).some(([k, v]) => typeof v !== 'undefined' && (current as any)[k] !== v);
          if (!shouldRecord) return {} as any;
          return { ...pushUndoSnapshot(s), categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
        }),

      deleteCategory: (id) =>
        set((s) => {
          const categories = s.categories.filter((c) => c.id !== id)
            .map((c, i) => ({ ...c, sortOrder: i }));
          // Preserve archived bubbles even if their last category was deleted.
          const people = s.people.filter((p) => p.categoryId !== id || !!p.archivedAt);
          const currentCategoryId = categories[0]?.id || null;
          return { ...pushUndoSnapshot(s), categories, people, currentCategoryId };
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
          return { ...pushUndoSnapshot(s), categories };
        }),

      addPerson: (p) =>
        set((s) => ({
          ...pushUndoSnapshot(s),
          people: [
            ...s.people,
            {
              ...p,
              id: uid('p_'),
              image: p.image ?? svgAvatarDataUrl(p.fullName),
              interactionCount: typeof (p as any).interactionCount === 'number' ? (p as any).interactionCount : 0,
            },
          ],
        })),

      updatePerson: (id, patch) =>
        set((s) => {
          const target = s.people.find((p) => p.id === id);
          if (!target) return { people: s.people };
          const groupId = target.duplicateGroupId ?? target.id;
          const patchLastInteraction = typeof (patch as any).lastInteraction === 'string' ? ((patch as any).lastInteraction as string) : null;
          const sharedPatch: Partial<Person> = { ...patch };
          delete (sharedPatch as any).categoryId;
          delete (sharedPatch as any).yPosition;
          delete (sharedPatch as any).archivedAt;
          delete (sharedPatch as any).archivedFromCategoryId;
          delete (sharedPatch as any).archivedOrder;
          const hasShared = Object.keys(sharedPatch).length > 0;
          const patchEntries = Object.entries(patch);
          const sharedEntries = Object.entries(sharedPatch);
          let changed = false;
          const nextPeople = s.people.map((p) => {
            const pGroupId = p.duplicateGroupId ?? p.id;
            if (p.id === id) {
              const differs = patchEntries.some(([k, v]) => (p as any)[k] !== v);
              if (!differs) return p;
              changed = true;
              const next: Person = { ...p, ...patch };
              if (patchLastInteraction && typeof next.lastInteraction === 'string' && next.lastInteraction !== p.lastInteraction) {
                if (isMoreRecentIso(p.lastInteraction, next.lastInteraction)) {
                  next.interactionCount = (typeof p.interactionCount === 'number' ? p.interactionCount : 0) + 1;
                }
              }
              return next;
            }
            if (hasShared && pGroupId === groupId) {
              const differs = sharedEntries.some(([k, v]) => (p as any)[k] !== v);
              if (!differs) return p;
              changed = true;
              const next: Person = { ...p, ...sharedPatch };
              if (patchLastInteraction && typeof next.lastInteraction === 'string' && next.lastInteraction !== p.lastInteraction) {
                if (isMoreRecentIso(p.lastInteraction, next.lastInteraction)) {
                  next.interactionCount = (typeof p.interactionCount === 'number' ? p.interactionCount : 0) + 1;
                }
              }
              return next;
            }
            return p;
          });
          if (!changed) return {} as any;
          return { ...pushUndoSnapshot(s), people: nextPeople };
        }),

      deletePerson: (id) =>
        set((s) => {
          const exists = s.people.some((p) => p.id === id);
          if (!exists) return { people: s.people };
          return { ...pushUndoSnapshot(s), people: s.people.filter((x) => x.id !== id) };
        }),

      archivePerson: (id) =>
        set((s) => {
          const target = s.people.find((p) => p.id === id);
          if (!target) return { people: s.people };
          if (target.archivedAt) return { people: s.people };
          const baseOrder =
            Math.max(
              -1,
              ...s.people
                .filter((x) => !!x.archivedAt)
                .map((x) => (typeof x.archivedOrder === 'number' ? x.archivedOrder : -1))
            ) + 1;
          const now = new Date().toISOString();
          return {
            ...pushUndoSnapshot(s),
            people: s.people.map((p) =>
              p.id === id
                ? {
                    ...p,
                    archivedAt: now,
                    archivedFromCategoryId: p.categoryId,
                    archivedOrder: baseOrder,
                  }
                : p
            ),
          };
        }),

      restorePerson: (id, opts) =>
        set((s) => {
          const target = s.people.find((p) => p.id === id);
          if (!target) return { people: s.people };
          const groupId = target.duplicateGroupId ?? target.id;
          const lastInteraction =
            typeof opts.lastInteraction === 'string' && opts.lastInteraction.length > 0 ? opts.lastInteraction : null;
          let changed = false;
          const nextPeople = s.people.map((p) => {
            const pGroupId = p.duplicateGroupId ?? p.id;
            const shouldShare = !!lastInteraction && pGroupId === groupId;

            if (p.id === id) {
              const next: Person = {
                ...p,
                categoryId: opts.categoryId,
                archivedAt: undefined,
                archivedFromCategoryId: undefined,
                archivedOrder: undefined,
              };
              if (shouldShare && lastInteraction && lastInteraction !== p.lastInteraction) {
                next.lastInteraction = lastInteraction;
                if (isMoreRecentIso(p.lastInteraction, lastInteraction)) {
                  next.interactionCount = (typeof p.interactionCount === 'number' ? p.interactionCount : 0) + 1;
                }
              }
              const differs =
                next.categoryId !== p.categoryId ||
                next.archivedAt !== p.archivedAt ||
                next.archivedFromCategoryId !== p.archivedFromCategoryId ||
                next.archivedOrder !== p.archivedOrder ||
                (shouldShare && next.lastInteraction !== p.lastInteraction);
              if (!differs) return p;
              changed = true;
              return next;
            }

            if (shouldShare && lastInteraction && lastInteraction !== p.lastInteraction) {
              changed = true;
              const next: Person = { ...p, lastInteraction };
              if (isMoreRecentIso(p.lastInteraction, lastInteraction)) {
                next.interactionCount = (typeof p.interactionCount === 'number' ? p.interactionCount : 0) + 1;
              }
              return next;
            }

            return p;
          });

          if (!changed) return {} as any;
          return { ...pushUndoSnapshot(s), people: nextPeople };
        }),

      reorderArchivedPeople: (orderedIds) =>
        set((s) => {
          const nextOrder = new Map<string, number>();
          orderedIds.forEach((id, idx) => nextOrder.set(id, idx));
          let changed = false;
          const nextPeople = s.people.map((p) => {
            const order = nextOrder.get(p.id);
            if (typeof order !== 'number') return p;
            if (p.archivedOrder === order) return p;
            changed = true;
            return { ...p, archivedOrder: order };
          });
          if (!changed) return {};
          return {
            ...pushUndoSnapshot(s),
            people: nextPeople,
          };
        }),

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
          return { ...pushUndoSnapshot(s), people: [...s.people, next] };
        }),

      bulkUpdateLastInteraction: (personIds, lastInteractionIso) =>
        set((s) => {
          const idSet = new Set(personIds);
          const groupIdsToUpdate = new Set<string>();
          for (const p of s.people) {
            if (idSet.has(p.id)) groupIdsToUpdate.add(p.duplicateGroupId ?? p.id);
          }
          if (groupIdsToUpdate.size === 0) return {};
          let changed = false;
          const nextPeople = s.people.map((p) => {
            const gid = p.duplicateGroupId ?? p.id;
            if (!groupIdsToUpdate.has(gid)) return p;
            if (p.lastInteraction === lastInteractionIso) return p;
            changed = true;
            const next: Person = { ...p, lastInteraction: lastInteractionIso };
            if (isMoreRecentIso(p.lastInteraction, lastInteractionIso)) {
              next.interactionCount = (typeof p.interactionCount === 'number' ? p.interactionCount : 0) + 1;
            }
            return next;
          });
          if (!changed) return {};
          return { ...pushUndoSnapshot(s), people: nextPeople };
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
          return nextPeople.length ? { ...pushUndoSnapshot(s), people: [...s.people, ...nextPeople] } : {};
        }),

      bulkArchivePeople: (personIds) =>
        set((s) => {
          const idSet = new Set(personIds);
          if (idSet.size === 0) return {};
          const baseOrder =
            Math.max(
              -1,
              ...s.people
                .filter((x) => !!x.archivedAt)
                .map((x) => (typeof x.archivedOrder === 'number' ? x.archivedOrder : -1))
            ) + 1;
          const nowMs = Date.now();
          let orderInc = 0;
          let changed = false;
          const nextPeople = s.people.map((p) => {
            if (!idSet.has(p.id)) return p;
            if (p.archivedAt) return p;
            changed = true;
            const idx = orderInc++;
            return {
              ...p,
              archivedAt: new Date(nowMs + idx).toISOString(),
              archivedFromCategoryId: p.categoryId,
              archivedOrder: baseOrder + idx,
            };
          });
          if (!changed) return {};
          return { ...pushUndoSnapshot(s), people: nextPeople };
        }),

      bulkRestorePeople: (personIds) =>
        set((s) => {
          const idSet = new Set(personIds);
          if (idSet.size === 0) return {};
          if (s.categories.length === 0) return {};
          const ordered = s.categories.slice().sort((a, b) => a.sortOrder - b.sortOrder);
          const fallbackCategoryId = ordered[0]?.id ?? '';
          if (!fallbackCategoryId) return {};
          const categoryIdSet = new Set(s.categories.map((c) => c.id));
          let changed = false;
          const nextPeople = s.people.map((p) => {
            if (!idSet.has(p.id)) return p;
            if (!p.archivedAt) return p;
            changed = true;
            const preferred = p.archivedFromCategoryId ?? p.categoryId;
            const categoryId = preferred && categoryIdSet.has(preferred) ? preferred : fallbackCategoryId;
            return {
              ...p,
              categoryId,
              archivedAt: undefined,
              archivedFromCategoryId: undefined,
              archivedOrder: undefined,
            };
          });
          if (!changed) return {};
          return { ...pushUndoSnapshot(s), people: nextPeople };
        }),

      bulkDeletePeople: (personIds) =>
        set((s) => {
          const idSet = new Set(personIds);
          if (idSet.size === 0) return {};
          const nextPeople = s.people.filter((p) => !idSet.has(p.id));
          if (nextPeople.length === s.people.length) return {};
          return { ...pushUndoSnapshot(s), people: nextPeople };
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

      updateSystemControls: (patch) =>
        set((s) => ({
          systemControls: { ...s.systemControls, ...patch },
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
            archivedAt: typeof (p as any).archivedAt === 'string' ? (p as any).archivedAt : undefined,
            archivedFromCategoryId: typeof (p as any).archivedFromCategoryId === 'string' ? (p as any).archivedFromCategoryId : undefined,
            archivedOrder: typeof (p as any).archivedOrder === 'number' ? (p as any).archivedOrder : undefined,
          }));
          const labels = (data as any).labels ?? [];
          const sc = (data as any).systemControls;
          const systemControls: SystemControls =
            sc && typeof sc === 'object'
              ? {
                  multiSelectHotkeysEnabled: typeof sc.multiSelectHotkeysEnabled === 'boolean' ? sc.multiSelectHotkeysEnabled : s.systemControls.multiSelectHotkeysEnabled,
                  multiSelectUpdateToNowKey: typeof sc.multiSelectUpdateToNowKey === 'string' ? sc.multiSelectUpdateToNowKey : null,
                  multiSelectArchiveKey: typeof sc.multiSelectArchiveKey === 'string' ? sc.multiSelectArchiveKey : null,
                  multiSelectDeleteKey: typeof sc.multiSelectDeleteKey === 'string' ? sc.multiSelectDeleteKey : null,
                }
              : s.systemControls;
          // Preserve currentCategoryId if it still exists after import; otherwise fallback to first
          const keepId = s.currentCategoryId && categories.some((c) => c.id === s.currentCategoryId)
            ? s.currentCategoryId
            : categories[0]?.id ?? null;
          return { categories, people, labels, currentCategoryId: keepId, systemControls, historyPast: [], historyFuture: [] };
        }),

      exportData: () => ({ version: 2, categories: get().categories, people: get().people, labels: get().labels, systemControls: get().systemControls })
	    }),
	    {
	      name: 'bubble-store-v1',
	      version: 2,
        partialize: (s) => ({
          categories: s.categories,
          people: s.people,
          labels: s.labels,
          currentCategoryId: s.currentCategoryId,
          systemControls: s.systemControls,
        }),
	      migrate: (persisted: any) => {
	        if (!persisted || typeof persisted !== 'object') return persisted as any;
        const categories = Array.isArray(persisted.categories) ? persisted.categories : [];
        const people = Array.isArray(persisted.people) ? persisted.people : [];
        const labels = Array.isArray(persisted.labels) ? persisted.labels : [];
        const sc = persisted.systemControls;
        const systemControls: SystemControls =
          sc && typeof sc === 'object'
            ? {
                multiSelectHotkeysEnabled: typeof sc.multiSelectHotkeysEnabled === 'boolean' ? sc.multiSelectHotkeysEnabled : defaultSystemControls.multiSelectHotkeysEnabled,
                multiSelectUpdateToNowKey: typeof sc.multiSelectUpdateToNowKey === 'string' ? sc.multiSelectUpdateToNowKey : null,
                multiSelectArchiveKey: typeof sc.multiSelectArchiveKey === 'string' ? sc.multiSelectArchiveKey : null,
                multiSelectDeleteKey: typeof sc.multiSelectDeleteKey === 'string' ? sc.multiSelectDeleteKey : null,
              }
            : defaultSystemControls;
        return {
          ...persisted,
          categories: categories.map((c: any) => ({ ...c, description: c.description ?? '' })),
          people: people.map((p: any) => ({
            ...p,
            labelIds: Array.isArray(p.labelIds) ? p.labelIds : [],
            starred: typeof p.starred === 'boolean' ? p.starred : false,
            duplicateGroupId: p.duplicateGroupId,
            archivedAt: typeof p.archivedAt === 'string' ? p.archivedAt : undefined,
            archivedFromCategoryId: typeof p.archivedFromCategoryId === 'string' ? p.archivedFromCategoryId : undefined,
            archivedOrder: typeof p.archivedOrder === 'number' ? p.archivedOrder : undefined,
          })),
          labels,
          systemControls,
        } as any;
      },
    }
  )
);
