"use client";
import { useMemo, useState, useEffect } from 'react';
import { useBubbleStore } from '../store/useBubbleStore';
import { Category, Person } from '../lib/types';
import { BubbleField } from '../components/visual/BubbleField';
import { CategoryNav } from '../components/ui/CategoryNav';
import { DangerZone } from '../components/visual/DangerZone';
import { FABAddPerson } from '../components/ui/FABAddPerson';
import { ClockPT } from '../components/ui/ClockPT';
import { AddEditPersonModal } from '../components/ui/modals/AddEditPersonModal';
import { EditCategoryModal } from '../components/ui/modals/EditCategoryModal';
import { BubbleWand } from '../components/visual/BubbleWand';
import { XAxis } from '../components/visual/XAxis';

export default function Page() {
  const { categories, people, currentCategoryId } = useBubbleStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editPersonId, setEditPersonId] = useState<string | null>(null);
  const [editCategoryOpen, setEditCategoryOpen] = useState(false);
  const [entrance, setEntrance] = useState(false);
  const [entranceEpoch, setEntranceEpoch] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Wait for Zustand rehydration to avoid flashing the default category
  useEffect(() => {
    const persist = (useBubbleStore as any).persist;
    if (!persist) {
      setHydrated(true);
      return;
    }
    setHydrated(persist.hasHydrated?.() ?? false);
    const unsub = persist.onFinishHydration?.(() => setHydrated(true));
    return () => {
      if (typeof unsub === 'function') unsub();
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

  const currentPeople = useMemo(() => people.filter((p) => p.categoryId === currentCategory?.id), [people, currentCategory?.id]);

  if (!hydrated) {
    return (
      <main className="relative h-[100dvh] overflow-hidden" />
    );
  }

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
        <CategoryNav category={currentCategory} categories={categories} onOpenCategorySettings={() => setEditCategoryOpen(true)} />
      </div>

      {/* Bubble wand enters from right on category change */}
      <BubbleWand categoryId={currentCategory?.id} active={entrance} imageSrc="/newbubblewand.png" />

      {/* Bubbles */}
      <BubbleField category={currentCategory} people={currentPeople} onEditPerson={setEditPersonId} entranceActive={entrance} entranceSeed={entranceEpoch} />

      {/* Top-right utilities: clock + add */}
      <div className="fixed top-4 right-4 z-30 flex items-center gap-3">
        <ClockPT />
        <FABAddPerson onClick={() => setShowAdd(true)} />
      </div>

      {/* Modals */}
      <AddEditPersonModal open={showAdd} onClose={() => setShowAdd(false)} defaultCategoryId={currentCategory?.id} />
      <AddEditPersonModal open={!!editPersonId} onClose={() => setEditPersonId(null)} personId={editPersonId || undefined} />
      <EditCategoryModal open={editCategoryOpen} onClose={() => setEditCategoryOpen(false)} categoryId={currentCategory?.id} />

      {/* X Axis with day markers */}
      <XAxis category={currentCategory} />
    </main>
  );
}
