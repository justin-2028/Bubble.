"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { useBubbleStore } from '../../../store/useBubbleStore';
import { GlassButton } from '../GlassButton';
import { ArchiveBoxIcon } from '../icons/ArchiveBoxIcon';

function initialsFromName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
  return (first + last).toUpperCase() || '?';
}

function toDateInputValue(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isoFromDateInputValue(dateStr: string, opts?: { preferNowIfToday?: boolean }) {
  const [y, m, d] = dateStr.split('-').map((n) => Number(n));
  if (!y || !m || !d) return new Date().toISOString();
  const now = new Date();
  if (opts?.preferNowIfToday && dateStr === toDateInputValue(now)) return now.toISOString();
  // Use local noon to avoid UTC date shifting (and DST edge cases).
  const local = new Date(y, m - 1, d, 12, 0, 0, 0);
  return local.toISOString();
}

type Props = {
  open: boolean;
  onClose: () => void;
  focusPersonId?: string;
};

export function ArchiveModal({ open, onClose, focusPersonId }: Props) {
  const categories = useBubbleStore((s) => s.categories);
  const people = useBubbleStore((s) => s.people);
  const restorePerson = useBubbleStore((s) => s.restorePerson);
  const deletePerson = useBubbleStore((s) => s.deletePerson);

  const todayMax = useMemo(() => toDateInputValue(new Date()), []);

  const orderedCategories = useMemo(
    () => categories.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c] as const)), [categories]);

  const archivedPeople = useMemo(
    () =>
      people
        .filter((p) => !!p.archivedAt)
        .slice()
        .sort((a, b) => {
          const da = Date.parse(a.archivedAt as any);
          const db = Date.parse(b.archivedAt as any);
          const diff = (Number.isFinite(db) ? db : 0) - (Number.isFinite(da) ? da : 0);
          return diff || a.fullName.localeCompare(b.fullName);
        }),
    [people]
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [restoreCategoryId, setRestoreCategoryId] = useState<string>('');
  const [restoreDate, setRestoreDate] = useState<string>(todayMax);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const activePerson = useMemo(() => (activeId ? people.find((p) => p.id === activeId) : undefined), [people, activeId]);

  useEffect(() => {
    if (!open) return;
    setActiveId(focusPersonId ?? null);
    setConfirmDeleteOpen(false);
  }, [open, focusPersonId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmDeleteOpen) setConfirmDeleteOpen(false);
        else if (activeId) setActiveId(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, activeId, confirmDeleteOpen]);

  useEffect(() => {
    if (!open) return;
    if (!activePerson) return;
    const preferred = activePerson.archivedFromCategoryId ?? activePerson.categoryId;
    const exists = preferred && categories.some((c) => c.id === preferred);
    const fallback = orderedCategories[0]?.id ?? '';
    setRestoreCategoryId(exists ? preferred : fallback);
    const lastMs = Date.parse(activePerson.lastInteraction as any);
    const last = Number.isFinite(lastMs) ? new Date(lastMs) : new Date();
    const dateStr = toDateInputValue(last);
    setRestoreDate(dateStr > todayMax ? todayMax : dateStr);
  }, [open, activePerson?.id, activePerson?.archivedFromCategoryId, activePerson?.categoryId, activePerson?.lastInteraction, categories, orderedCategories, todayMax]);

  const onRestore = () => {
    if (!activePerson) return;
    const catId =
      (restoreCategoryId && categories.some((c) => c.id === restoreCategoryId) && restoreCategoryId) ||
      orderedCategories[0]?.id ||
      '';
    if (!catId) return;
    const clamped = restoreDate > todayMax ? todayMax : restoreDate;
    const iso = isoFromDateInputValue(clamped, { preferNowIfToday: true });
    restorePerson(activePerson.id, { categoryId: catId, lastInteraction: iso });
    setConfirmDeleteOpen(false);
    setActiveId(null);
  };

  const requestDelete = () => setConfirmDeleteOpen(true);
  const confirmDelete = () => {
    if (!activePerson) return;
    deletePerson(activePerson.id);
    setConfirmDeleteOpen(false);
    setActiveId(null);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={onClose} />
      <div className="glass relative z-10 w-[min(900px,94vw)] max-h-[90vh] overflow-auto rounded-2xl p-5">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-2xl font-display tracking-tight-ui">
              <span>Archive</span>
              <ArchiveBoxIcon className="h-5 w-5 text-gray-800" />
            </div>
            <div className="mt-1 text-sm text-gray-700">Archived bubbles are hidden from categories to help you unclutter!</div>
          </div>
          <div className="text-sm text-gray-700">
            {archivedPeople.length} bubble{archivedPeople.length === 1 ? '' : 's'}
          </div>
        </div>

        {archivedPeople.length === 0 ? (
          <div className="rounded-xl border border-white/50 bg-white/40 p-5 text-sm text-gray-700">No archived bubbles yet.</div>
        ) : (
          <div className="flex flex-wrap gap-4">
            {archivedPeople.map((p) => {
              const catId = p.archivedFromCategoryId ?? p.categoryId;
              const cat = categoryById.get(catId);
              return (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-[130px] flex-col items-center gap-2 rounded-xl px-2 py-2 hover:bg-white/20"
                  onClick={() => setActiveId(p.id)}
                >
                  <div className="bubble relative flex h-16 w-16 items-center justify-center overflow-hidden">
                    {p.image ? (
                      <img src={p.image} alt={p.fullName} className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <div className="font-nav text-sm text-gray-700">{initialsFromName(p.fullName)}</div>
                    )}
                    <div className="absolute right-1 top-1 rounded-md border border-white/70 bg-white/70 p-0.5 text-gray-800">
                      <ArchiveBoxIcon className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <div className="w-full text-center">
                    <div className="font-body tracking-tight-ui text-gray-800 text-sm break-words">{p.fullName}</div>
                    {cat && <div className="mt-0.5 text-xs text-gray-600">{cat.name}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        )}

      </div>

      {/* Detached action panel (not inside the glass container) to avoid clipping/scroll issues. */}
      {activePerson && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
          onClick={() => {
            setConfirmDeleteOpen(false);
            setActiveId(null);
          }}
        >
          <div
            className="w-full max-w-md max-h-[85vh] overflow-auto rounded-2xl bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Archived bubble actions"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 text-lg font-display tracking-tight-ui">{activePerson.fullName}</div>
            <div className="mb-4 text-sm text-gray-600">Restore this bubble back into a category, or delete it permanently.</div>

            <label className="block text-sm font-body">
              <div className="mb-1 font-nav tracking-tight-ui text-gray-900">Restore to Category</div>
              <select
                className="w-full rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2"
                value={restoreCategoryId}
                onChange={(e) => setRestoreCategoryId(e.target.value)}
              >
                {orderedCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block text-sm font-body">
              <div className="mb-1 font-nav tracking-tight-ui text-gray-900">Last Interaction (Optional)</div>
              <input
                type="date"
                max={todayMax}
                className="w-full rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2"
                value={restoreDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setRestoreDate(v > todayMax ? todayMax : v);
                }}
              />
            </label>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <GlassButton type="button" onClick={onRestore}>
                  Restore
                </GlassButton>
              </div>
              <div className="flex items-center gap-2">
                <GlassButton type="button" onClick={requestDelete}>
                  Delete Permanently
                </GlassButton>
              </div>
            </div>

            {confirmDeleteOpen && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50/60 p-4">
                <div className="font-nav tracking-tight-ui text-red-700">Delete permanently?</div>
                <div className="mt-1 text-sm text-red-700/90">This action can’t be undone.</div>
                <div className="mt-3 flex justify-end gap-2">
                  <GlassButton type="button" onClick={() => setConfirmDeleteOpen(false)}>
                    Cancel
                  </GlassButton>
                  <GlassButton
                    type="button"
                    onClick={() => {
                      confirmDelete();
                    }}
                  >
                    Delete
                  </GlassButton>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
