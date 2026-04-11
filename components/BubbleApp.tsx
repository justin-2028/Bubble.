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
import { RemoteStateSnapshot, SyncStatus, mergeExportSchemas, stateSignature } from '@/lib/cloud';
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

  const baseStateRef = useRef<ExportSchema>(cloneExportSchema(initialSnapshot.state));
  const baseVersionRef = useRef(initialSnapshot.version);
  const applyingRemoteRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAppliedInitialRemoteRef = useRef(false);

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
    applyingRemoteRef.current = true;
    importData(initialSnapshot.state);
    baseStateRef.current = cloneExportSchema(initialSnapshot.state);
    baseVersionRef.current = initialSnapshot.version;
    hasAppliedInitialRemoteRef.current = true;
    setRemoteReady(true);
    setSyncStatus('synced');
    queueMicrotask(() => {
      applyingRemoteRef.current = false;
    });
  }, [hydrated, importData, initialSnapshot]);

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
      if (showAdd || !!editPersonId || editCategoryOpen || searchOpen || archiveOpen || helperAccessOpen) return;
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
  }, [hydrated, remoteReady, showAdd, editPersonId, editCategoryOpen, searchOpen, archiveOpen, helperAccessOpen]);

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
  }, [exportData, importData]);

  const pullRemoteState = useCallback(async () => {
    if (saveInFlightRef.current) return;

    try {
      const response = await fetchWithTimeout(`/api/state?version=${baseVersionRef.current}`, {
        cache: 'no-store',
      });

      if (response.status === 304) return;
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!response.ok) return;

      const payload = await response.json().catch(() => null);
      if (!payload?.state) return;

      const localState = exportData();
      const localDirty = stateSignature(localState) !== stateSignature(baseStateRef.current);

      if (!localDirty) {
        applyingRemoteRef.current = true;
        importData(payload.state);
        baseStateRef.current = cloneExportSchema(payload.state);
        baseVersionRef.current = payload.version;
        setSyncStatus('synced');
        queueMicrotask(() => {
          applyingRemoteRef.current = false;
        });
        return;
      }

      const mergedState = mergeExportSchemas(baseStateRef.current, localState, payload.state);
      applyingRemoteRef.current = true;
      importData(mergedState);
      baseStateRef.current = cloneExportSchema(payload.state);
      baseVersionRef.current = payload.version;
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
  }, [exportData, importData, pushRemoteState]);

  useEffect(() => {
    if (!hydrated || !remoteReady || applyingRemoteRef.current) return;
    const localState = exportData();
    const localSignature = stateSignature(localState);
    const baseSignature = stateSignature(baseStateRef.current);

    if (localSignature === baseSignature) {
      setSyncStatus('synced');
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSyncStatus('saving');
    saveTimerRef.current = setTimeout(() => {
      void pushRemoteState();
    }, 700);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [hydrated, remoteReady, categories, people, labels, systemControls, exportData, pushRemoteState]);

  useEffect(() => {
    if (!hydrated || !remoteReady) return;
    const poll = setInterval(() => {
      void pullRemoteState();
    }, 8000);
    return () => clearInterval(poll);
  }, [hydrated, remoteReady, pullRemoteState]);

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
    helperAccessOpen
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
          <SyncPill status={syncStatus} />
          <FABAddPerson onClick={() => setShowAdd(true)} />
          <AccountMenu username={username} syncStatus={syncStatus} onOpenHelperAccess={() => setHelperAccessOpen(true)} />
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
    </>
  );
}

function SyncPill({ status }: { status: SyncStatus }) {
  const palette =
    status === 'error'
      ? 'border-red-200 bg-red-50/70 text-red-700'
      : status === 'conflict'
        ? 'border-amber-200 bg-amber-50/80 text-amber-800'
        : 'border-white/60 bg-white/60 text-gray-700';

  const label =
    status === 'saving'
      ? 'Cloud Saving'
      : status === 'conflict'
        ? 'Cloud Merging'
        : status === 'error'
          ? 'Cloud Error'
          : status === 'synced'
            ? 'Cloud Synced'
            : 'Cloud Starting';

  return (
    <div className={`rounded-xl border px-3 py-2 text-xs font-nav tracking-[0.12em] ${palette}`}>
      {label}
    </div>
  );
}
