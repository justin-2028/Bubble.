"use client";
import { useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useBubbleStore } from '../store/useBubbleStore';
import { Category, Person } from '../lib/types';
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
//
import { LocalFileSync } from '@/components/ui/LocalFileSync';
import { VIEWPORT_PAD_LEFT } from '../lib/utils';

export default function Page() {
  const CLOUD_SYNC = false; // local-only mode
  const { categories, people, currentCategoryId } = useBubbleStore();
  const labels = useBubbleStore((s) => s.labels);
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
  const [viewportLeftPadPct, setViewportLeftPadPct] = useState<number>(VIEWPORT_PAD_LEFT);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFetchedRef = useRef(false);

  // Wait for Zustand rehydration to avoid flashing the default category
  useEffect(() => {
    const persist = (useBubbleStore as any).persist;
    if (!persist) {
      setHydrated(true);
      return;
    }
    // Immediate check
    setHydrated(persist.hasHydrated?.() ?? false);
    // Event-based hydration
    const unsub = persist.onFinishHydration?.(() => setHydrated(true));
    // Failsafe polling in case onFinishHydration isn't available in this env
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
  // Play wand emission on initial load and every category switch, after hydration
  useEffect(() => {
    if (!currentCategoryId || !hydrated) return;
    setEntrance(false);
    const start = setTimeout(() => setEntrance(true), 60);
    const end = setTimeout(() => setEntrance(false), 3060);
    setEntranceEpoch((e) => e + 1);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
  }, [currentCategoryId, hydrated]);

  const currentCategory = useMemo(() => categories
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .find((c) => c.id === currentCategoryId) || categories.sort((a, b) => a.sortOrder - b.sortOrder)[0], [categories, currentCategoryId]);

  const currentPeople = useMemo(
    () => people.filter((p) => p.categoryId === currentCategory?.id && !p.archivedAt),
    [people, currentCategory?.id]
  );

  // Cloud sync disabled
  const cats = useBubbleStore((s) => s.categories);
  const ppl = useBubbleStore((s) => s.people);
  const exportData = useBubbleStore((s) => s.exportData);

  // Align x-axis left edge to the category name box (not the back arrow).
  useLayoutEffect(() => {
    if (!hydrated) return;
    const el = document.getElementById('category-name-box');
    if (!el) return;

    const compute = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(1, Math.round(window.innerWidth));
      const pct = Math.max(0, Math.min(30, (r.left / w) * 100));
      const rounded = Math.round(pct * 100) / 100; // 0.01% to prevent subpixel thrash
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
  }, [hydrated, currentCategoryId]);

  if (!hydrated) {
    return (
      <main className="relative h-[100dvh] overflow-hidden white-gradient">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="glass rounded-xl px-4 py-2 text-sm text-gray-700">Loading…</div>
        </div>
      </main>
    );
  }

  // No auth mode: always render the app

  const keyboardNavEnabled = !(showAdd || !!editPersonId || editCategoryOpen || poppingOpen || searchOpen || archiveOpen);

  return (
    <main className="relative h-[100dvh] overflow-hidden">
      {/* Background gradient per category (using white shades) */}
      <div
        className="absolute inset-0"
        style={{
          background: currentCategory
            ? `radial-gradient(120% 120% at 20% 10%, ${currentCategory.gradientColors[0]} 0%, ${currentCategory.gradientColors[1]} 35%, ${currentCategory.gradientColors[2]} 70%, #e9e9e9 100%)`
            : undefined
        }}
      />

      {/* Decorative + logic overlays */}
      <DangerZone />

      {/* Category navigation & menu */}
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

      {/* Bubble wand enters from right on category change */}
      <BubbleWand
        categoryId={currentCategory?.id}
        active={entrance}
        imageSrc="/newbubblewand.png"
      />

      {/* Bubbles */}
      <BubbleField
        category={currentCategory}
        people={currentPeople}
        onEditPerson={setEditPersonId}
        entranceActive={entrance}
        entranceSeed={entranceEpoch}
        keyboardShortcutsEnabled={keyboardNavEnabled}
        viewportLeftPadPct={viewportLeftPadPct}
      />

      {/* Top-right utilities: clock + add + auth */}
      <div className="fixed top-4 right-4 z-30 flex items-center gap-3">
        <ClockPT />
        <FABAddPerson onClick={() => setShowAdd(true)} />
        {/* Local file mode controls (Chrome/Edge). Hidden in unsupported browsers. */}
        <LocalFileSync />
      </div>

      {/* Modals */}
      <AddEditPersonModal open={showAdd} onClose={() => setShowAdd(false)} defaultCategoryId={currentCategory?.id} />
      <AddEditPersonModal open={!!editPersonId} onClose={() => setEditPersonId(null)} personId={editPersonId || undefined} />
      <EditCategoryModal open={editCategoryOpen} onClose={() => setEditCategoryOpen(false)} categoryId={currentCategory?.id} />
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

      {/* X Axis with day markers */}
      <XAxis category={currentCategory} leftPadPct={viewportLeftPadPct} />
    </main>
  );
}
