"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { useBubbleStore } from '../../../store/useBubbleStore';
import { Category, Person } from '../../../lib/types';
import { GlassButton } from '../GlassButton';

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
  selectedPeople: Person[];
  currentCategory?: Category;
  onClearSelection: () => void;
};

export function BulkEditPeopleModal({ open, selectedPeople, currentCategory, onClearSelection }: Props) {
  const { categories, bulkUpdateLastInteraction, bulkMovePeopleToCategory, bulkDuplicatePeopleToCategory, bulkArchivePeople, bulkDeletePeople } = useBubbleStore();
  const todayMax = useMemo(() => toDateInputValue(new Date()), []);
  const [date, setDate] = useState<string>(todayMax);
  const [moveCategoryId, setMoveCategoryId] = useState<string>('');
  const [duplicateCategoryId, setDuplicateCategoryId] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const selectableCategories = useMemo(
    () => categories.slice().sort((a, b) => a.sortOrder - b.sortOrder).filter((c) => c.id !== currentCategory?.id),
    [categories, currentCategory?.id]
  );

  useEffect(() => {
    if (!open) return;
    setDate(todayMax);
    setMoveCategoryId(selectableCategories[0]?.id ?? '');
    setDuplicateCategoryId(selectableCategories[0]?.id ?? '');
    setStatus('');
    setConfirmDeleteOpen(false);
  }, [open, todayMax, selectableCategories]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirmDeleteOpen) setConfirmDeleteOpen(false);
      else onClearSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClearSelection, confirmDeleteOpen]);

  if (!open) return null;

  const ids = selectedPeople.map((p) => p.id);

  const setStatusFor = (msg: string) => {
    setStatus(msg);
    window.setTimeout(() => setStatus(''), 1600);
  };

  const updateToToday = () => {
    bulkUpdateLastInteraction(ids, new Date().toISOString());
    setStatusFor('Updated');
  };

  const moveToCategory = () => {
    if (!moveCategoryId) return;
    bulkMovePeopleToCategory(ids, moveCategoryId);
    setStatusFor('Moved');
    onClearSelection();
  };

  const duplicateToCategory = () => {
    if (!duplicateCategoryId) return;
    bulkDuplicatePeopleToCategory(ids, duplicateCategoryId);
    setStatusFor('Duplicated');
  };

  const archiveSelected = () => {
    if (ids.length === 0) return;
    bulkArchivePeople(ids);
    setStatusFor('Archived');
    onClearSelection();
  };

  const deleteFromCategory = () => {
    if (ids.length === 0) return;
    setConfirmDeleteOpen(true);
  };

  const confirmDelete = () => {
    bulkDeletePeople(ids);
    onClearSelection();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={onClearSelection} />
      <div className="glass relative z-10 w-[min(560px,92vw)] rounded-2xl p-5">
        <div className="mb-2 flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-display tracking-tight-ui">Selected Bubbles</div>
            <div className="mt-1 text-sm text-gray-700">
              {selectedPeople.length} selected{currentCategory?.name ? ` • ${currentCategory.name}` : ''}
            </div>
          </div>
        </div>

        {status && <div className="mb-3 text-sm text-gray-700">{status}</div>}

        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-xl border border-white/50 bg-white/40 p-4">
            <div className="mb-2 font-nav tracking-tight-ui text-gray-900">Update Last Interaction</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                max={todayMax}
                className="min-w-[220px] flex-1 rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2 text-sm"
                value={date}
                onChange={(e) => {
                  const v = e.target.value;
                  const clamped = v > todayMax ? todayMax : v;
                  setDate(clamped);
                  const iso = isoFromDateInputValue(clamped, { preferNowIfToday: true });
                  bulkUpdateLastInteraction(ids, iso);
                  setStatusFor('Updated');
                }}
              />
              <GlassButton type="button" onClick={updateToToday}>
                Update to Now
              </GlassButton>
            </div>
          </div>

          <div className="rounded-xl border border-white/50 bg-white/40 p-4">
            <div className="mb-2 font-nav tracking-tight-ui text-gray-900">Move to Category</div>
            {selectableCategories.length === 0 ? (
              <div className="text-sm text-gray-700">No other categories available.</div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="min-w-[240px] flex-1 rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2 text-sm"
                  value={moveCategoryId}
                  onChange={(e) => setMoveCategoryId(e.target.value)}
                >
                  {selectableCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <GlassButton type="button" onClick={moveToCategory}>
                  Move
                </GlassButton>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/50 bg-white/40 p-4">
              <div className="mb-2 font-nav tracking-tight-ui text-gray-900">Duplicate to Category</div>
            {selectableCategories.length === 0 ? (
              <div className="text-sm text-gray-700">No other categories available.</div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="min-w-[240px] flex-1 rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2 text-sm"
                  value={duplicateCategoryId}
                  onChange={(e) => setDuplicateCategoryId(e.target.value)}
                >
                  {selectableCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <GlassButton type="button" onClick={duplicateToCategory}>
                  Duplicate
                </GlassButton>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <GlassButton type="button" onClick={archiveSelected}>
              Archive
            </GlassButton>
            <GlassButton type="button" intent="destructive" onClick={deleteFromCategory}>
              Delete
            </GlassButton>
          </div>
        </div>

        {confirmDeleteOpen && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDeleteOpen(false);
            }}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label="Confirm delete"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-lg font-display tracking-tight-ui mb-2">
                Delete {ids.length} bubble{ids.length === 1 ? '' : 's'}?
              </div>
              <p className="text-sm text-gray-600 mb-4">
                This action can’t be undone. The selected bubbles will be removed{currentCategory?.name ? ` from ${currentCategory.name}` : ''}.
              </p>
              <div className="flex justify-end gap-2">
                <GlassButton type="button" onClick={() => setConfirmDeleteOpen(false)}>
                  Cancel
                </GlassButton>
                <GlassButton
                  type="button"
                  intent="destructive"
                  onClick={() => {
                    setConfirmDeleteOpen(false);
                    confirmDelete();
                  }}
                >
                  Delete
                </GlassButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
