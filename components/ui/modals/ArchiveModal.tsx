"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const systemControls = useBubbleStore((s) => s.systemControls);
  const updatePerson = useBubbleStore((s) => s.updatePerson);
  const restorePerson = useBubbleStore((s) => s.restorePerson);
  const reorderArchivedPeople = useBubbleStore((s) => s.reorderArchivedPeople);
  const deletePerson = useBubbleStore((s) => s.deletePerson);
  const deleteDuplicateGroup = useBubbleStore((s) => s.deleteDuplicateGroup);
  const bulkRestorePeople = useBubbleStore((s) => s.bulkRestorePeople);
  const bulkDeletePeople = useBubbleStore((s) => s.bulkDeletePeople);

  const todayMax = useMemo(() => toDateInputValue(new Date()), []);

  const orderedCategories = useMemo(
    () => categories.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c] as const)), [categories]);

  const [sortMode, setSortMode] = useState<'custom' | 'recent' | 'name' | 'category'>('recent');

  const archivedPeople = useMemo(
    () => {
      const list = people.filter((p) => !!p.archivedAt).slice();

      if (sortMode === 'custom') {
        return list.sort((a, b) => {
          const oa = typeof a.archivedOrder === 'number' ? a.archivedOrder : Number.MAX_SAFE_INTEGER;
          const ob = typeof b.archivedOrder === 'number' ? b.archivedOrder : Number.MAX_SAFE_INTEGER;
          return oa - ob || a.fullName.localeCompare(b.fullName);
        });
      }

      if (sortMode === 'name') {
        return list.sort((a, b) => a.fullName.localeCompare(b.fullName));
      }

      if (sortMode === 'category') {
        const catName = (p: (typeof list)[number]) => {
          const catId = p.archivedFromCategoryId ?? p.categoryId;
          return categoryById.get(catId)?.name ?? 'Deleted Category';
        };
        return list.sort((a, b) => catName(a).localeCompare(catName(b)) || a.fullName.localeCompare(b.fullName));
      }

      // recent (default)
      return list.sort((a, b) => {
        const da = Date.parse(a.archivedAt as any);
        const db = Date.parse(b.archivedAt as any);
        const diff = (Number.isFinite(db) ? db : 0) - (Number.isFinite(da) ? da : 0);
        return diff || a.fullName.localeCompare(b.fullName);
      });
    },
    [people, sortMode, categoryById]
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [restoreCategoryId, setRestoreCategoryId] = useState<string>('');
  const [restoreDate, setRestoreDate] = useState<string>(todayMax);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const ignoreNextClickRef = useRef(false);

  const activePerson = useMemo(() => (activeId ? people.find((p) => p.id === activeId) : undefined), [people, activeId]);
  const activeDuplicateCount = useMemo(() => {
    if (!activePerson) return 0;
    const gid = activePerson.duplicateGroupId ?? activePerson.id;
    return people.filter((p) => (p.duplicateGroupId ?? p.id) === gid).length;
  }, [people, activePerson]);

  const restoreSelected = React.useCallback(() => {
    if (selectedIds.length === 0) return;
    bulkRestorePeople(selectedIds);
    setSelectedIds([]);
    setBulkOpen(false);
    setBulkDeleteOpen(false);
    setBulkDeleteIds([]);
  }, [bulkRestorePeople, selectedIds]);

  const requestBulkDelete = React.useCallback(() => {
    if (selectedIds.length === 0) return;
    setBulkDeleteIds([...selectedIds]);
    setBulkDeleteOpen(true);
  }, [selectedIds]);

  const confirmBulkDelete = React.useCallback(() => {
    if (bulkDeleteIds.length === 0) {
      setBulkDeleteOpen(false);
      return;
    }
    bulkDeletePeople(bulkDeleteIds);
    setBulkDeleteOpen(false);
    setBulkDeleteIds([]);
    setSelectedIds([]);
    setBulkOpen(false);
  }, [bulkDeletePeople, bulkDeleteIds]);

  useEffect(() => {
    if (!open) return;
    setActiveId(focusPersonId ?? null);
    setConfirmDeleteOpen(false);
    setSelectedIds([]);
    setBulkOpen(false);
    setBulkDeleteOpen(false);
    setBulkDeleteIds([]);
    setDragId(null);
    setDragOverId(null);
  }, [open, focusPersonId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (bulkDeleteOpen) setBulkDeleteOpen(false);
        else if (confirmDeleteOpen) setConfirmDeleteOpen(false);
        else if (bulkOpen) setBulkOpen(false);
        else if (selectedIds.length > 0) setSelectedIds([]);
        else if (activeId) setActiveId(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, activeId, confirmDeleteOpen, bulkOpen, bulkDeleteOpen, selectedIds.length]);

  // Keep selection consistent if archived people change (restore/delete).
  useEffect(() => {
    if (!open) return;
    const idSet = new Set(archivedPeople.map((p) => p.id));
    setSelectedIds((prev) => prev.filter((id) => idSet.has(id)));
  }, [open, archivedPeople]);

  useEffect(() => {
    if (selectedIds.length > 0) return;
    setBulkOpen(false);
    setBulkDeleteOpen(false);
    setBulkDeleteIds([]);
  }, [selectedIds.length]);

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

  const confirmDeleteAll = () => {
    if (!activePerson) return;
    deleteDuplicateGroup(activePerson.id);
    setConfirmDeleteOpen(false);
    setActiveId(null);
  };

  // Optional multi-select hotkeys (configurable in System Controls).
  useEffect(() => {
    if (!open) return;
    if (!systemControls.multiSelectHotkeysEnabled) return;
    if (selectedIds.length === 0) return;
    if (bulkDeleteOpen) return;

    const normalizeKeybindKeyString = (key: string): string | null => {
      if (!key) return null;
      if (key === ' ' || key === 'Spacebar') return null;
      if (key.length === 1) return key.toLowerCase();
      return key;
    };

    const isEditableTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const archiveKey = normalizeKeybindKeyString(systemControls.multiSelectArchiveKey ?? '');
    const deleteKey = normalizeKeybindKeyString(systemControls.multiSelectDeleteKey ?? '');

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isEditableTarget(e.target)) return;
      const pressed = normalizeKeybindKeyString(e.key);
      if (!pressed) return;

      // Archive key is treated as "Restore" while in Archive.
      if (archiveKey && pressed === archiveKey) {
        e.preventDefault();
        restoreSelected();
        return;
      }

      if (deleteKey && pressed === deleteKey) {
        e.preventDefault();
        setBulkDeleteIds([...selectedIds]);
        setBulkDeleteOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    open,
    systemControls.multiSelectHotkeysEnabled,
    systemControls.multiSelectArchiveKey,
    systemControls.multiSelectDeleteKey,
    selectedIds,
    bulkDeleteOpen,
    restoreSelected,
  ]);

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
	          <div className="flex items-center gap-2 text-sm text-gray-700">
	            <div>{archivedPeople.length} bubble{archivedPeople.length === 1 ? '' : 's'}</div>
	            {archivedPeople.length > 1 && (
	              <select
	                className="rounded-md border border-zinc-200/60 bg-white/60 px-2 py-1"
                value={sortMode}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'custom' || v === 'recent' || v === 'name' || v === 'category') setSortMode(v);
                }}
                aria-label="Sort archived bubbles"
              >
                <option value="custom">Custom</option>
                <option value="recent">Recently archived</option>
                <option value="name">Name</option>
                <option value="category">Category</option>
              </select>
            )}
	          </div>
	        </div>

        {archivedPeople.length === 0 ? (
          <div className="rounded-xl border border-white/50 bg-white/40 p-5 text-sm text-gray-700">No archived bubbles yet.</div>
        ) : (
          <div className="flex flex-wrap gap-4">
            {archivedPeople.map((p) => {
              const catId = p.archivedFromCategoryId ?? p.categoryId;
              const cat = categoryById.get(catId);
              const isSelected = selectedIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer?.setData('text/plain', p.id);
                    e.dataTransfer?.setDragImage?.(e.currentTarget, 0, 0);
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                    setDragId(p.id);
                    setDragOverId(null);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragId && dragId !== p.id) setDragOverId(p.id);
                  }}
                  onDragLeave={() => {
                    if (dragOverId === p.id) setDragOverId(null);
                  }}
                  onDrop={() => {
                    if (!dragId || dragId === p.id) return;
                    const from = archivedPeople.findIndex((x) => x.id === dragId);
                    const to = archivedPeople.findIndex((x) => x.id === p.id);
                    if (from < 0 || to < 0) return;
                    const next = [...archivedPeople];
                    const [moved] = next.splice(from, 1);
                    next.splice(to, 0, moved);
                    reorderArchivedPeople(next.map((x) => x.id));
                    setSortMode('custom');
                    setDragId(null);
                    setDragOverId(null);
                    ignoreNextClickRef.current = true;
                    window.setTimeout(() => {
                      ignoreNextClickRef.current = false;
                    }, 0);
                  }}
                  className={`flex w-[130px] cursor-move flex-col items-center gap-2 rounded-xl px-2 py-2 hover:bg-white/20 ${dragId === p.id ? 'opacity-60' : ''} ${dragOverId === p.id ? 'bg-white/30' : ''}`}
                  onClick={(e) => {
                    if (ignoreNextClickRef.current) return;
                    if (e.shiftKey) {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedIds((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]));
                      setBulkOpen(false);
                      return;
                    }

                    if (selectedIds.length > 0) {
                      if (selectedIds.includes(p.id)) {
                        setBulkOpen(true);
                        return;
                      }
                      setSelectedIds([]);
                    }

                    setActiveId(p.id);
                  }}
                  aria-label={`Archived bubble: ${p.fullName}`}
                >
                  <div
                    className={`bubble relative flex h-16 w-16 items-center justify-center overflow-hidden ${isSelected ? 'ring-4 ring-sky-300/60 ring-offset-2 ring-offset-white/40' : ''}`}
                  >
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

      {bulkOpen && selectedIds.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onClick={() => setBulkOpen(false)}>
          <div
            className="w-full max-w-md max-h-[85vh] overflow-auto rounded-2xl bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Archived bubbles bulk actions"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 text-lg font-display tracking-tight-ui">Selected Bubbles</div>
            <div className="mb-4 text-sm text-gray-600">
              {selectedIds.length} selected • Restore them to their archived categories, or delete them.
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <GlassButton type="button" onClick={restoreSelected}>
                  Restore
                </GlassButton>
              </div>
              <div className="flex items-center gap-2">
                <GlassButton type="button" intent="destructive" onClick={requestBulkDelete}>
                  Delete
                </GlassButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setBulkDeleteOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm delete"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-display tracking-tight-ui mb-2">
              Delete {bulkDeleteIds.length} bubble{bulkDeleteIds.length === 1 ? '' : 's'}?
            </div>
            <p className="text-sm text-gray-600 mb-4">This action can’t be undone.</p>
            <div className="flex justify-end gap-2">
              <GlassButton type="button" onClick={() => setBulkDeleteOpen(false)}>
                Cancel
              </GlassButton>
              <GlassButton type="button" intent="destructive" onClick={confirmBulkDelete}>
                Delete
              </GlassButton>
            </div>
          </div>
        </div>
      )}

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
	            <div className="mb-4 text-sm text-gray-600">Change its category while archived, restore it, or delete it.</div>

	            <label className="block text-sm font-body">
	              <div className="mb-1 font-nav tracking-tight-ui text-gray-900">Category</div>
	              <select
	                className="w-full rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2"
	                value={restoreCategoryId}
	                onChange={(e) => {
	                  const v = e.target.value;
	                  setRestoreCategoryId(v);
	                  updatePerson(activePerson.id, { archivedFromCategoryId: v });
	                }}
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
                <GlassButton type="button" intent="destructive" onClick={requestDelete}>
                  Delete
                </GlassButton>
              </div>
            </div>

            {confirmDeleteOpen && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50/60 p-4">
                <div className="font-nav tracking-tight-ui text-red-700">Delete?</div>
                <div className="mt-1 text-sm text-red-700/90">
                  {activeDuplicateCount > 1
                    ? `This bubble has ${activeDuplicateCount} identical copies across categories.`
                    : 'This action can’t be undone.'}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <GlassButton type="button" onClick={() => setConfirmDeleteOpen(false)}>
                    Cancel
                  </GlassButton>
                  {activeDuplicateCount > 1 ? (
                    <>
                      <GlassButton type="button" intent="destructive" onClick={confirmDelete}>
                        Delete This
                      </GlassButton>
                      <GlassButton type="button" intent="destructive" onClick={confirmDeleteAll}>
                        Delete All
                      </GlassButton>
                    </>
                  ) : (
                    <GlassButton type="button" intent="destructive" onClick={confirmDelete}>
                      Delete
                    </GlassButton>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
