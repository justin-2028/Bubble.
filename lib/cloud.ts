import { defaultSystemControls } from './defaultData';
import { Category, ExportSchema, Label, Person, SystemControls } from './types';

export type SyncStatus = 'initializing' | 'synced' | 'saving' | 'conflict' | 'error';

export interface RemoteStateSnapshot {
  version: number;
  updatedAt: string;
  state: ExportSchema;
}

export interface RemoteCollectionDelta<T> {
  upserted: T[];
  deletedIds: string[];
}

export interface RemoteStateDelta {
  version: number;
  updatedAt: string;
  categories: RemoteCollectionDelta<Category>;
  labels: RemoteCollectionDelta<Label>;
  people: RemoteCollectionDelta<Person>;
  systemControls: SystemControls | null;
}

export interface HelperTokenSummary {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface HelperTokenCreateResponse {
  token: string;
  summary: HelperTokenSummary;
}

export interface HelperCategorySummary {
  id: string;
  name: string;
  sortOrder: number;
}

export interface HelperBubbleSummary {
  id: string;
  fullName: string;
  categoryId: string;
  lastInteraction: string;
  image?: string;
  starred: boolean;
}

export interface HelperBootstrapResponse {
  helperId: string;
  serverTime: string;
  defaultCategoryId: string | null;
  categories: HelperCategorySummary[];
  bubbles: HelperBubbleSummary[];
}

export interface HelperCreateBubbleResponse {
  ok: true;
  helperId: string;
  version: number;
  updatedAt: string;
  bubble: HelperBubbleSummary;
}

export function isMoreRecentIso(prevIso: string | null | undefined, nextIso: string | null | undefined) {
  const prev = Date.parse(prevIso as any);
  const next = Date.parse(nextIso as any);
  if (!Number.isFinite(next)) return false;
  if (!Number.isFinite(prev)) return true;
  return next > prev;
}

export function sameCalendarDayInTimeZone(
  prevIso: string | null | undefined,
  nextIso: string | null | undefined,
  timeZone: string
) {
  const prevKey = dateKeyInTimeZone(prevIso, timeZone);
  const nextKey = dateKeyInTimeZone(nextIso, timeZone);
  return !!prevKey && prevKey === nextKey;
}

export function stateSignature(state: ExportSchema) {
  return JSON.stringify(state);
}

export function applyRemoteStateDelta(base: ExportSchema, delta: RemoteStateDelta): ExportSchema {
  return {
    version: typeof base.version === 'number' ? base.version : 2,
    categories: applyCollectionDelta(base.categories, delta.categories, (items) =>
      items.slice().sort((a, b) => a.sortOrder - b.sortOrder)
    ),
    labels: applyCollectionDelta(base.labels ?? [], delta.labels),
    people: applyCollectionDelta(base.people, delta.people),
    systemControls: delta.systemControls ?? base.systemControls ?? { ...defaultSystemControls },
  };
}

export function mergeExportSchemas(base: ExportSchema, local: ExportSchema, remote: ExportSchema): ExportSchema {
  return {
    version: Math.max(local.version ?? 2, remote.version ?? 2, base.version ?? 2),
    categories: mergeCollection(base.categories, local.categories, remote.categories, (_base, localItem) => localItem),
    labels: mergeCollection(
      base.labels ?? [],
      local.labels ?? [],
      remote.labels ?? [],
      (_base, localItem) => localItem
    ),
    people: mergeCollection(base.people, local.people, remote.people, mergePersonConflict),
    systemControls: mergeSystemControls(base.systemControls, local.systemControls, remote.systemControls),
  };
}

function dateKeyInTimeZone(iso: string | null | undefined, timeZone: string) {
  const ms = Date.parse(iso as any);
  if (!Number.isFinite(ms)) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

type WithId = { id: string };

function applyCollectionDelta<T extends WithId>(
  current: T[],
  delta: RemoteCollectionDelta<T>,
  finalize?: (items: T[]) => T[]
) {
  const deleted = new Set(delta.deletedIds);
  const replacements = new Map(delta.upserted.map((item) => [item.id, item] as const));
  const seen = new Set<string>();
  const next: T[] = [];

  for (const item of current) {
    if (deleted.has(item.id)) continue;
    const replacement = replacements.get(item.id);
    if (replacement) {
      next.push(replacement);
      seen.add(item.id);
      continue;
    }
    next.push(item);
    seen.add(item.id);
  }

  for (const item of delta.upserted) {
    if (deleted.has(item.id) || seen.has(item.id)) continue;
    next.push(item);
    seen.add(item.id);
  }

  return finalize ? finalize(next) : next;
}

function mergeCollection<T extends WithId>(
  base: T[],
  local: T[],
  remote: T[],
  mergeConflict: (baseItem: T | undefined, localItem: T, remoteItem: T) => T
) {
  const baseMap = new Map(base.map((item) => [item.id, item] as const));
  const localMap = new Map(local.map((item) => [item.id, item] as const));
  const remoteMap = new Map(remote.map((item) => [item.id, item] as const));
  const orderedIds = dedupeIds([...local.map((item) => item.id), ...remote.map((item) => item.id)]);
  const merged: T[] = [];

  for (const id of orderedIds) {
    const baseItem = baseMap.get(id);
    const localItem = localMap.get(id);
    const remoteItem = remoteMap.get(id);

    if (!baseItem) {
      if (localItem && remoteItem) {
        merged.push(mergeConflict(undefined, localItem, remoteItem));
      } else if (localItem) {
        merged.push(localItem);
      } else if (remoteItem) {
        merged.push(remoteItem);
      }
      continue;
    }

    const localChanged = localItem ? !deepEqual(localItem, baseItem) : true;
    const remoteChanged = remoteItem ? !deepEqual(remoteItem, baseItem) : true;

    if (!localChanged && !remoteChanged) {
      if (remoteItem) merged.push(remoteItem);
      continue;
    }

    if (localChanged && !remoteChanged) {
      if (localItem) merged.push(localItem);
      continue;
    }

    if (!localChanged && remoteChanged) {
      if (remoteItem) merged.push(remoteItem);
      continue;
    }

    if (localItem && remoteItem) {
      merged.push(mergeConflict(baseItem, localItem, remoteItem));
      continue;
    }

    if (localItem) {
      merged.push(localItem);
    }
  }

  return merged;
}

function mergePersonConflict(base: Person | undefined, local: Person, remote: Person): Person {
  const merged: Person = {
    ...remote,
    ...local,
  };

  const preferredLastInteraction = isMoreRecentIso(local.lastInteraction, remote.lastInteraction)
    ? remote.lastInteraction
    : local.lastInteraction;

  merged.lastInteraction = preferredLastInteraction;

  const localCount = typeof local.interactionCount === 'number' ? local.interactionCount : 0;
  const remoteCount = typeof remote.interactionCount === 'number' ? remote.interactionCount : 0;
  const baseCount = typeof base?.interactionCount === 'number' ? base.interactionCount : 0;
  merged.interactionCount = Math.max(localCount, remoteCount, baseCount);

  return merged;
}

function mergeSystemControls(
  base: SystemControls | undefined,
  local: SystemControls | undefined,
  remote: SystemControls | undefined
): SystemControls {
  const fallback = { ...defaultSystemControls };
  const keys: Array<keyof SystemControls> = [
    'multiSelectHotkeysEnabled',
    'multiSelectUpdateToNowKey',
    'multiSelectArchiveKey',
    'multiSelectDeleteKey',
  ];
  const merged = { ...fallback } as SystemControls;

  for (const key of keys) {
    const baseValue = base?.[key] ?? fallback[key];
    const localValue = local?.[key] ?? fallback[key];
    const remoteValue = remote?.[key] ?? fallback[key];
    const localChanged = !deepEqual(localValue, baseValue);
    const remoteChanged = !deepEqual(remoteValue, baseValue);
    if (localChanged) {
      merged[key] = localValue as never;
    } else if (remoteChanged) {
      merged[key] = remoteValue as never;
    } else {
      merged[key] = remoteValue as never;
    }
  }

  return merged;
}

function dedupeIds(ids: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function deepEqual(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
