"use client";

import { useMemo, useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useBubbleStore } from '../store/useBubbleStore';
import { ExportSchema } from '../lib/types';
import { BubbleField } from '../components/visual/BubbleField';
import { CategoryNav } from '../components/ui/CategoryNav';
import { DangerZone } from '../components/visual/DangerZone';
import { FABAddPerson } from '../components/ui/FABAddPerson';
import { ClockPT } from '../components/ui/ClockPT';
import { AddEditPersonModal } from '../components/ui/modals/AddEditPersonModal';
import { EditCategoryModal } from '../components/ui/modals/EditCategoryModal';
import { PoppingBubblesModal } from '../components/ui/modals/PoppingBubblesModal';
import { SearchBubblesModal } from '../components/ui/modals/SearchBubblesModal';
import { ArchiveModal } from '../components/ui/modals/ArchiveModal';
import { BubbleWand } from '../components/visual/BubbleWand';
import { XAxis } from '../components/visual/XAxis';
import { VIEWPORT_PAD_LEFT } from '../lib/utils';
import { AccountMenu } from './ui/AccountMenu';
import { HelperAccessModal } from './ui/HelperAccessModal';
import { LegacyDataModal } from './ui/modals/LegacyDataModal';
import {
  RemoteStateDelta,
  RemoteStateSnapshot,
  SyncStatus,
  applyRemoteStateDelta,
  cloudBaseStorageKey,
  mergeExportSchemas,
  stateSignature,
} from '@/lib/cloud';
import { cloneExportSchema } from '@/lib/exportSchema';

const SYNC_REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = SYNC_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function msUntilNextLocalMidnight() {
  const next = new Date();
  next.setHours(24, 0, 0, 0);
  return Math.max(1_000, next.getTime() - Date.now());
}

type Props = {
  username: string;
  initialSnapshot: RemoteStateSnapshot;
};

export function BubbleApp({ username, initialSnapshot }: Props) {
  const { categories, people, currentCategoryId } = useBubbleStore();
  const labels = useBubbleStore((s) => s.labels);
  const systemControls = useBubbleStore((s) => s.systemControls);
  const exportData = useBubbleStore((s) => s.exportData);
  const importData = useBubbleStore((s) => s.importData);
  const setCurrentCategory = useBubbleStore((s) => s.setCurrentCategory);

  const [showAdd, setShowAdd] = useState(false);
  const [editPersonId, setEditPersonId] = useState<string | null>(null);
  const [editCategoryOpen, setEditCategoryOpen] = useState(false);
  const [poppingOpen, setPoppingOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveFocusPersonId, setArchiveFocusPersonId] = useState<string | null>(null);
  const [entrance, setEntrance] = useState(false);
  const [entranceEpoch, setEntranceEpoch] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [viewportLeftPadPct, setViewportLeftPadPct] = useState<number>(VIEWPORT_PAD_LEFT);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('initializing');
  const [helperAccessOpen, setHelperAccessOpen] = useState(false);
  const [legacyDataOpen, setLegacyDataOpen] = useState(false);
  const cloudBaseKey = useMemo(() => cloudBaseStorageKey(username), [username]);

  const baseStateRef = useRef<ExportSchema>(cloneExportSchema(initialSnapshot.state));
  const baseVersionRef = useRef(initialSnapshot.version);
  const applyingRemoteRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const hasAppliedInitialRemoteRef = useRef(false);

  const loadPersistedBaseSnapshot = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(cloudBaseKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as RemoteStateSnapshot | null;
      if (!parsed?.state || typeof parsed.version !== 'number' || typeof parsed.updatedAt !== 'string') {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }, [cloudBaseKey]);

  const persistBaseSnapshot = useCallback(
    (snapshot: RemoteStateSnapshot) => {
      try {
        window.localStorage.setItem(cloudBaseKey, JSON.stringify(snapshot));
      } catch {}
    },
    [cloudBaseKey]
  );

  // Wait for Zustand rehydration to avoid flashing the default category
  useEffect(() => {
    const persist = (useBubbleStore as any).persist;
    if (!persist) {
      setHydrated(true);
      return;
    }
    setHydrated(persist.hasHydrated?.() ?? false);
    const unsub = persist.onFinishHydration?.(() => setHydrated(true));
    const poll = setInterval(() => {
      if (persist.hasHydrated?.()) {
        setHydrated(true);
        clearInterval(poll);
      }
    }, 250);
    return () => {
      if (typeof unsub === 'function') unsub();
      clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || hasAppliedInitialRemoteRef.current) return;
    const localState = exportData();
    const persistedBase = loadPersistedBaseSnapshot();
    const localDirty =
      !!persistedBase && stateSignature(localState) !== stateSignature(persistedBase.state);
    const nextState = localDirty
      ? mergeExportSchemas(persistedBase.state, localState, initialSnapshot.state)
      : initialSnapshot.state;

    applyingRemoteRef.current = true;
    importData(nextState);
    baseStateRef.current = cloneExportSchema(initialSnapshot.state);
    baseVersionRef.current = initialSnapshot.version;
    persistBaseSnapshot(initialSnapshot);
    hasAppliedInitialRemoteRef.current = true;
    setRemoteReady(true);
    setSyncStatus(localDirty ? 'pending' : 'synced');
    queueMicrotask(() => {
      applyingRemoteRef.current = false;
    });
  }, [exportData, hydrated, importData, initialSnapshot, loadPersistedBaseSnapshot, persistBaseSnapshot]);

  // Play wand emission on initial load and every category switch, after hydration
  useEffect(() => {
    if (!currentCategoryId || !hydrated || !remoteReady) return;
    setEntrance(false);
    const start = setTimeout(() => setEntrance(true), 60);
    const end = setTimeout(() => setEntrance(false), 3060);
    setEntranceEpoch((e) => e + 1);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
  }, [currentCategoryId, hydrated, remoteReady]);

  // CapsLock toggles the Popping Bubbles leaderboard (home screen only).
  useEffect(() => {
    if (!hydrated || !remoteReady) return;

    const isEditableTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const syncToCapsState = (e: KeyboardEvent) => {
      if (e.key !== 'CapsLock') return;
      if (isEditableTarget(e.target)) return;
      if (showAdd || !!editPersonId || editCategoryOpen || searchOpen || archiveOpen || helperAccessOpen || legacyDataOpen) return;
      e.preventDefault();
      const capsOn = typeof e.getModifierState === 'function' ? e.getModifierState('CapsLock') : false;
      setPoppingOpen(capsOn);
    };

    window.addEventListener('keydown', syncToCapsState, { passive: false });
    window.addEventListener('keyup', syncToCapsState, { passive: false });
    return () => {
      window.removeEventListener('keydown', syncToCapsState);
      window.removeEventListener('keyup', syncToCapsState);
    };
  }, [hydrated, remoteReady, showAdd, editPersonId, editCategoryOpen, searchOpen, archiveOpen, helperAccessOpen, legacyDataOpen]);

  const currentCategory = useMemo(
    () =>
      categories
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .find((c) => c.id === currentCategoryId) || categories.slice().sort((a, b) => a.sortOrder - b.sortOrder)[0],
    [categories, currentCategoryId]
  );

  const currentPeople = useMemo(
    () => people.filter((p) => p.categoryId === currentCategory?.id && !p.archivedAt),
    [people, currentCategory?.id]
  );

  useLayoutEffect(() => {
    if (!hydrated || !remoteReady) return;
    const el = document.getElementById('category-name-box');
    if (!el) return;

    const compute = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(1, Math.round(window.innerWidth));
      const pct = Math.max(0, Math.min(30, (r.left / w) * 100));
      const rounded = Math.round(pct * 100) / 100;
      setViewportLeftPadPct((prev) => (Math.abs(prev - rounded) < 0.05 ? prev : rounded));
    };

    compute();
    window.addEventListener('resize', compute);
    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    return () => {
      window.removeEventListener('resize', compute);
      ro.disconnect();
    };
  }, [hydrated, remoteReady, currentCategoryId]);

  const pushRemoteState = useCallback(async () => {
    if (saveInFlightRef.current) {
      queuedSaveRef.current = true;
      return;
    }

    const localState = exportData();
    if (stateSignature(localState) === stateSignature(baseStateRef.current)) {
      setSyncStatus('synced');
      return;
    }

    saveInFlightRef.current = true;
    queuedSaveRef.current = false;
    setSyncStatus('saving');

    try {
      const response = await fetchWithTimeout('/api/state', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          baseVersion: baseVersionRef.current,
          state: localState,
        }),
      });

      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }

      const payload = await response.json().catch(() => null);

      if (response.status === 409 && payload?.state) {
        const mergedState = mergeExportSchemas(baseStateRef.current, localState, payload.state);
        applyingRemoteRef.current = true;
        importData(mergedState);
        baseStateRef.current = cloneExportSchema(payload.state);
        baseVersionRef.current = payload.version;
        persistBaseSnapshot({
          version: payload.version,
          updatedAt: payload.updatedAt,
          state: payload.state,
        });
        setSyncStatus('conflict');
        queueMicrotask(() => {
          applyingRemoteRef.current = false;
          queuedSaveRef.current = true;
          void pushRemoteState();
        });
        return;
      }

      if (!response.ok || !payload?.state) {
        throw new Error(payload?.error || 'Could not save Bubble state.');
      }

      baseStateRef.current = cloneExportSchema(payload.state);
      baseVersionRef.current = payload.version;
      persistBaseSnapshot({
        version: payload.version,
        updatedAt: payload.updatedAt,
        state: payload.state,
      });
      setSyncStatus('synced');
    } catch (error) {
      console.error('Bubble cloud save failed.', error);
      setSyncStatus('error');
    } finally {
      saveInFlightRef.current = false;
      if (queuedSaveRef.current) {
        queuedSaveRef.current = false;
        void pushRemoteState();
      }
    }
  }, [exportData, importData, persistBaseSnapshot]);

  const pullRemoteState = useCallback(async () => {
    if (saveInFlightRef.current) return;

    try {
      const versionResponse = await fetchWithTimeout('/api/state/version', {
        cache: 'no-store',
      });
      if (versionResponse.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!versionResponse.ok) return;

      const versionPayload = await versionResponse.json().catch(() => null);
      if (!versionPayload || typeof versionPayload.version !== 'number') return;
      if (versionPayload.version === baseVersionRef.current) return;

      const deltaResponse = await fetchWithTimeout(`/api/state/delta?sinceVersion=${baseVersionRef.current}`, {
        cache: 'no-store',
      });
      if (deltaResponse.status === 401) {
        window.location.href = '/login';
        return;
      }

      let remoteState = null as null | RemoteStateSnapshot['state'];
      let remoteVersion = versionPayload.version as number;

      if (deltaResponse.ok) {
        const deltaPayload = (await deltaResponse.json().catch(() => null)) as RemoteStateDelta | null;
        if (deltaPayload && typeof deltaPayload.version === 'number') {
          remoteState = applyRemoteStateDelta(baseStateRef.current, deltaPayload);
          remoteVersion = deltaPayload.version;
        }
      }

      if (!remoteState) {
        const fullResponse = await fetchWithTimeout('/api/state', {
          cache: 'no-store',
        });
        if (fullResponse.status === 401) {
          window.location.href = '/login';
          return;
        }
        if (!fullResponse.ok) return;
        const fullPayload = await fullResponse.json().catch(() => null);
        if (!fullPayload?.state || typeof fullPayload.version !== 'number') return;
        remoteState = fullPayload.state;
        remoteVersion = fullPayload.version;
      }

      if (!remoteState) return;
      const resolvedRemoteState = remoteState;

      const localState = exportData();
      const localDirty = stateSignature(localState) !== stateSignature(baseStateRef.current);

      if (!localDirty) {
        applyingRemoteRef.current = true;
        importData(resolvedRemoteState);
        baseStateRef.current = cloneExportSchema(resolvedRemoteState);
        baseVersionRef.current = remoteVersion;
        persistBaseSnapshot({
          version: remoteVersion,
          updatedAt: versionPayload.updatedAt,
          state: resolvedRemoteState,
        });
        setSyncStatus('synced');
        queueMicrotask(() => {
          applyingRemoteRef.current = false;
        });
        return;
      }

      const mergedState = mergeExportSchemas(baseStateRef.current, localState, resolvedRemoteState);
      applyingRemoteRef.current = true;
      importData(mergedState);
      baseStateRef.current = cloneExportSchema(resolvedRemoteState);
      baseVersionRef.current = remoteVersion;
      persistBaseSnapshot({
        version: remoteVersion,
        updatedAt: versionPayload.updatedAt,
        state: resolvedRemoteState,
      });
      setSyncStatus('conflict');
      queueMicrotask(() => {
        applyingRemoteRef.current = false;
        queuedSaveRef.current = true;
        void pushRemoteState();
      });
    } catch (error) {
      console.error('Bubble cloud refresh failed.', error);
      setSyncStatus((prev) => (prev === 'saving' ? prev : 'error'));
    }
  }, [exportData, importData, persistBaseSnapshot, pushRemoteState]);

  const runCloudSyncNow = useCallback(async () => {
    const localState = exportData();
    const localDirty = stateSignature(localState) !== stateSignature(baseStateRef.current);
    if (localDirty) {
      await pushRemoteState();
      return;
    }
    await pullRemoteState();
  }, [exportData, pullRemoteState, pushRemoteState]);

  useEffect(() => {
    if (!hydrated || !remoteReady || applyingRemoteRef.current) return;
    const localState = exportData();
    const localSignature = stateSignature(localState);
    const baseSignature = stateSignature(baseStateRef.current);

    if (localSignature === baseSignature) {
      setSyncStatus('synced');
      return;
    }

    setSyncStatus('pending');
  }, [hydrated, remoteReady, categories, people, labels, systemControls, exportData]);

  useEffect(() => {
    if (!hydrated || !remoteReady) return;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      timeout = setTimeout(async () => {
        await runCloudSyncNow();
        schedule();
      }, msUntilNextLocalMidnight());
    };

    schedule();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [hydrated, remoteReady, runCloudSyncNow]);

  if (!hydrated || !remoteReady) {
    return (
      <main className="relative h-[100dvh] overflow-hidden white-gradient">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="glass rounded-xl px-4 py-2 text-sm text-gray-700">Loading…</div>
        </div>
      </main>
    );
  }

  const keyboardNavEnabled = !(
    showAdd ||
    !!editPersonId ||
    editCategoryOpen ||
    poppingOpen ||
    searchOpen ||
    archiveOpen ||
    helperAccessOpen ||
    legacyDataOpen
  );

  return (
    <>
      <main className="relative h-[100dvh] overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: currentCategory
              ? `radial-gradient(120% 120% at 20% 10%, ${currentCategory.gradientColors[0]} 0%, ${currentCategory.gradientColors[1]} 35%, ${currentCategory.gradientColors[2]} 70%, #e9e9e9 100%)`
              : undefined,
          }}
        />

        <DangerZone />

        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
          <CategoryNav
            category={currentCategory}
            categories={categories}
            onOpenCategorySettings={() => setEditCategoryOpen(true)}
            onOpenLeaderboard={() => setPoppingOpen(true)}
            onOpenArchive={() => {
              setArchiveFocusPersonId(null);
              setArchiveOpen(true);
            }}
            onOpenSearch={() => setSearchOpen(true)}
            keyboardNavEnabled={keyboardNavEnabled}
          />
        </div>

        <BubbleWand categoryId={currentCategory?.id} active={entrance} imageSrc="/newbubblewand.png" />

        <BubbleField
          category={currentCategory}
          people={currentPeople}
          onEditPerson={setEditPersonId}
          entranceActive={entrance}
          entranceSeed={entranceEpoch}
          keyboardShortcutsEnabled={keyboardNavEnabled}
          viewportLeftPadPct={viewportLeftPadPct}
        />

        <div className="fixed top-4 right-4 z-30 flex items-center gap-3">
          <ClockPT />
          <SyncPill status={syncStatus} onClick={() => void runCloudSyncNow()} />
          <FABAddPerson onClick={() => setShowAdd(true)} />
          <AccountMenu
            username={username}
            syncStatus={syncStatus}
            onSyncNow={() => void runCloudSyncNow()}
            onOpenHelperAccess={() => setHelperAccessOpen(true)}
            onOpenLegacyData={() => setLegacyDataOpen(true)}
          />
        </div>

        <AddEditPersonModal open={showAdd} onClose={() => setShowAdd(false)} defaultCategoryId={currentCategory?.id} />
        <AddEditPersonModal
          open={!!editPersonId}
          onClose={() => setEditPersonId(null)}
          personId={editPersonId || undefined}
        />
        <EditCategoryModal
          open={editCategoryOpen}
          onClose={() => setEditCategoryOpen(false)}
          categoryId={currentCategory?.id}
        />
        <PoppingBubblesModal
          open={poppingOpen}
          onClose={() => setPoppingOpen(false)}
          categories={categories}
          currentCategory={currentCategory}
          people={people}
        />
        <SearchBubblesModal
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          categories={categories}
          currentCategory={currentCategory}
          people={people}
          labels={labels}
          onSelectArchived={(personId) => {
            setSearchOpen(false);
            setArchiveFocusPersonId(personId);
            setArchiveOpen(true);
          }}
          onSelectPerson={(personId, categoryId) => {
            setSearchOpen(false);
            setCurrentCategory(categoryId);
            setEditPersonId(personId);
          }}
        />
        <ArchiveModal
          open={archiveOpen}
          focusPersonId={archiveFocusPersonId ?? undefined}
          onClose={() => {
            setArchiveOpen(false);
            setArchiveFocusPersonId(null);
          }}
        />

        <XAxis category={currentCategory} leftPadPct={viewportLeftPadPct} />
      </main>

      <HelperAccessModal open={helperAccessOpen} onClose={() => setHelperAccessOpen(false)} />
      <LegacyDataModal open={legacyDataOpen} onClose={() => setLegacyDataOpen(false)} />
    </>
  );
}

function SyncPill({ status, onClick }: { status: SyncStatus; onClick: () => void }) {
  const palette =
    status === 'error'
      ? 'border-red-200 bg-red-50/70 text-red-700'
      : status === 'pending'
        ? 'border-sky-200 bg-sky-50/80 text-sky-800'
      : status === 'conflict'
        ? 'border-amber-200 bg-amber-50/80 text-amber-800'
        : 'border-white/60 bg-white/60 text-gray-700';

  const label =
    status === 'saving'
      ? 'Cloud Syncing'
      : status === 'pending'
        ? 'Sync Pending'
      : status === 'conflict'
        ? 'Cloud Merging'
        : status === 'error'
          ? 'Cloud Error'
          : status === 'synced'
            ? 'Cloud Synced'
            : 'Cloud Starting';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={status === 'saving'}
      className={`rounded-xl border px-3 py-2 text-xs font-nav tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-70 ${palette}`}
      title="Sync Bubble now"
    >
      {label}
    </button>
  );
}
