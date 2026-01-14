"use client";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBubbleStore } from '../../../store/useBubbleStore';
import { GlassButton } from '../GlassButton';

type Props = {
  open: boolean;
  onClose: () => void;
  categoryId?: string;
};

type BindAction = 'updateToNow' | 'archive' | 'delete';

function normalizeKeybindKey(e: KeyboardEvent): string | null {
  const key = e.key;
  if (!key) return null;
  // Disallow modifier + navigation keys (and keys already used elsewhere).
  if (
    key === 'Shift' ||
    key === 'Control' ||
    key === 'Alt' ||
    key === 'Meta' ||
    key === 'CapsLock' ||
    key === 'Tab' ||
    key === ' ' ||
    key === 'Spacebar' ||
    key.startsWith('Arrow')
  ) {
    return null;
  }
  if (key.length === 1) return key.toLowerCase();
  return key;
}

export function EditCategoryModal({ open, onClose, categoryId }: Props) {
  const categories = useBubbleStore((s) => s.categories);
  const updateCategory = useBubbleStore((s) => s.updateCategory);
  const deleteCategory = useBubbleStore((s) => s.deleteCategory);
  const reorderCategory = useBubbleStore((s) => s.reorderCategory);
  const systemControls = useBubbleStore((s) => s.systemControls);
  const updateSystemControls = useBubbleStore((s) => s.updateSystemControls);
  const category = useMemo(() => categories.find((c) => c.id === categoryId), [categories, categoryId]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [timeValue, setTimeValue] = useState<string>('14');
  const [timeUnit, setTimeUnit] = useState<'days' | 'months'>('days');
  const [systemOpen, setSystemOpen] = useState(false);
  const [bindAction, setBindAction] = useState<BindAction | null>(null);
  const [bindStatus, setBindStatus] = useState<string>('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [formHeightPx, setFormHeightPx] = useState<number>(0);

  useEffect(() => {
    if (category) {
      setName(category.name);
      setDescription(category.description || '');
      setTimeValue(String(category.timeLimitValue));
      setTimeUnit(category.timeLimitUnit);
    }
  }, [category, open]);

  useEffect(() => {
    if (open) return;
    setSystemOpen(false);
    setBindAction(null);
    setBindStatus('');
    setConfirmDeleteOpen(false);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = formRef.current;
    if (!el) return;

    const update = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (!Number.isFinite(h) || h <= 0) return;
      setFormHeightPx((prev) => (prev === h ? prev : h));
    };

    update();

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!bindAction) return;

    const labelByAction: Record<BindAction, string> = {
      updateToNow: 'Update to Now',
      archive: 'Archive',
      delete: 'Delete',
    };

    const getKeyForAction = (a: BindAction) => {
      if (a === 'updateToNow') return systemControls.multiSelectUpdateToNowKey;
      if (a === 'archive') return systemControls.multiSelectArchiveKey;
      return systemControls.multiSelectDeleteKey;
    };

    const used: Record<string, string> = {};
    (['updateToNow', 'archive', 'delete'] as BindAction[]).forEach((a) => {
      const k = getKeyForAction(a);
      if (typeof k === 'string' && k.length > 0) used[k] = labelByAction[a];
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setBindAction(null);
        setBindStatus('');
        return;
      }

      const k = normalizeKeybindKey(e);
      if (!k) {
        e.preventDefault();
        setBindStatus('Choose a non-modifier key (not Space/Shift/Arrows).');
        return;
      }

      const conflict = used[k];
      const currentLabel = labelByAction[bindAction];
      if (conflict && conflict !== currentLabel) {
        e.preventDefault();
        setBindStatus(`That key is already assigned to ${conflict}.`);
        return;
      }

      e.preventDefault();
      const patch =
        bindAction === 'updateToNow'
          ? { multiSelectUpdateToNowKey: k }
          : bindAction === 'archive'
            ? { multiSelectArchiveKey: k }
            : { multiSelectDeleteKey: k };
      updateSystemControls(patch as any);
      setBindAction(null);
      setBindStatus(`Assigned ${k.toUpperCase()} to ${currentLabel}.`);
      window.setTimeout(() => setBindStatus(''), 1600);
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bindAction, systemControls.multiSelectArchiveKey, systemControls.multiSelectDeleteKey, systemControls.multiSelectUpdateToNowKey, updateSystemControls]);

  if (!open || !category) return null;

  const closeModal = () => {
    setSystemOpen(false);
    setBindAction(null);
    setBindStatus('');
    onClose();
  };

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(timeValue, 10);
    const clamped = Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
    updateCategory(category.id, { name, description, timeLimitValue: clamped, timeLimitUnit: timeUnit });
    closeModal();
  };

  const onDelete = () => {
    setConfirmDeleteOpen(true);
  };

  const confirmDelete = () => {
    deleteCategory(category.id);
    setConfirmDeleteOpen(false);
    closeModal();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={closeModal} />
      <div
        className={`glass relative z-10 rounded-2xl p-5 transition-[width] duration-200 ease-out ${systemOpen ? 'w-[min(980px,96vw)]' : 'w-[min(560px,92vw)]'}`}
      >
        <div className="flex items-start gap-4">
          <form ref={formRef} onSubmit={onSave} className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="text-xl font-display tracking-tight-ui">Category Settings</div>
              <GlassButton
                type="button"
                onClick={() => {
                  setSystemOpen((v) => !v);
                  setBindAction(null);
                  setBindStatus('');
                }}
                className="glass-glow-orange !text-orange-500 hover:bg-white/60 hover:!text-orange-600"
                aria-label="System Controls"
              >
                System Controls
              </GlassButton>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <label className="text-sm font-body">
                <div className="mb-1 font-nav tracking-tight-ui">Name</div>
                <input className="w-full rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="text-sm font-body">
                <div className="mb-1 font-nav tracking-tight-ui">Description</div>
                <textarea
                  className="w-full rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Optional notes for this category"
                />
              </label>
              <div className="grid grid-cols-2 gap-2 text-sm font-body">
                <label>
                  <div className="mb-1 font-nav tracking-tight-ui">Time Limit</div>
                  <input
                    type="number"
                    min={1}
                    className="w-full rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2"
                    value={timeValue}
                    onChange={(e) => setTimeValue(e.target.value)}
                    onBlur={() => {
                      const parsed = parseInt(timeValue, 10);
                      const clamped = Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
                      setTimeValue(String(clamped));
                    }}
                  />
                </label>
                <label>
                  <div className="mb-1 font-nav tracking-tight-ui">Unit</div>
                  <select className="w-full rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2" value={timeUnit} onChange={(e) => setTimeUnit(e.target.value as any)}>
                    <option value="days">days</option>
                    <option value="months">months</option>
                  </select>
                </label>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GlassButton type="button" onClick={() => reorderCategory(category.id, -1)}>↑</GlassButton>
                  <GlassButton type="button" onClick={() => reorderCategory(category.id, 1)}>↓</GlassButton>
                </div>
                <div className="flex items-center gap-2">
                  <GlassButton type="submit">Save</GlassButton>
                  <GlassButton type="button" intent="destructive" onClick={onDelete}>Delete</GlassButton>
                </div>
              </div>
            </div>
          </form>

          <div
            className={`min-h-0 transition-[max-width,opacity,transform,max-height] duration-200 ease-out ${systemOpen ? 'max-w-[380px] opacity-100 translate-x-0 overflow-visible' : 'max-w-0 max-h-0 opacity-0 translate-x-3 pointer-events-none overflow-hidden'}`}
            aria-hidden={!systemOpen}
            style={systemOpen && formHeightPx > 0 ? { maxHeight: formHeightPx } : { maxHeight: 0 }}
          >
            <div
              className="w-[380px] overflow-y-auto overscroll-contain rounded-xl border border-white/50 bg-white/40 p-4"
              style={systemOpen && formHeightPx > 0 ? { maxHeight: formHeightPx } : undefined}
            >
              <div className="text-lg font-display tracking-tight-ui text-gray-900">System Controls</div>
              <div className="mt-1 text-sm text-gray-700">Keyboard shortcuts and optional multi-select hotkeys.</div>

              <div className="mt-4 rounded-xl border border-white/50 bg-white/40 p-3">
                <div className="font-nav tracking-tight-ui text-gray-900">Basics</div>
                <div className="mt-3 grid gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-gray-900">Multi-Select</div>
                      <div className="mt-0.5 text-xs text-gray-700">Select multiple bubbles to edit simultaneously.</div>
                    </div>
                    <div className="shrink-0 rounded-xl border border-white/60 bg-white/60 px-3 py-1.5 font-code text-xs text-gray-900">
                      Shift + Click
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-gray-900">Time View</div>
                      <div className="mt-0.5 text-xs text-gray-700">Toggle on and off the “Days Since” overlay.</div>
                    </div>
                    <div className="shrink-0 rounded-xl border border-white/60 bg-white/60 px-3 py-1.5 font-code text-xs text-gray-900">
                      Space
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/50 bg-white/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-nav tracking-tight-ui text-gray-900">Multi-Select Hotkeys</div>
                    <div className="mt-0.5 text-xs text-gray-700">Works only while bubbles are selected.</div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={systemControls.multiSelectHotkeysEnabled}
                      onChange={(e) => updateSystemControls({ multiSelectHotkeysEnabled: e.target.checked })}
                    />
                    On
                  </label>
                </div>

                {bindAction && (
                  <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50/60 px-3 py-2 text-xs text-gray-900">
                    Press a key for <span className="font-nav tracking-tight-ui">{bindAction === 'updateToNow' ? 'Update to Now' : bindAction === 'archive' ? 'Archive' : 'Delete'}</span> (Esc to cancel).
                  </div>
                )}
                {bindStatus && !bindAction && (
                  <div className="mt-3 text-xs text-gray-700">{bindStatus}</div>
                )}

                <div className={`mt-3 grid gap-2 ${systemControls.multiSelectHotkeysEnabled ? '' : 'opacity-70'}`}>
                  {([
                    ['updateToNow', 'Update to Now', systemControls.multiSelectUpdateToNowKey] as const,
                    ['archive', 'Archive', systemControls.multiSelectArchiveKey] as const,
                    ['delete', 'Delete', systemControls.multiSelectDeleteKey] as const,
                  ]).map(([action, label, value]) => (
                    <div key={action} className="flex items-center justify-between gap-3">
                      <div className="text-sm text-gray-900">{label}</div>
                      <div className="flex items-center gap-2">
                        {value ? (
                          <>
                            <GlassButton
                              type="button"
                              onClick={() => {
                                setBindAction(action);
                                setBindStatus('');
                              }}
                              className={`!px-3 !py-1.5 font-code ${bindAction === action ? 'bg-white/70' : ''}`}
                            >
                              {value.toUpperCase()}
                            </GlassButton>
                            <GlassButton
                              type="button"
                              onClick={() => {
                                const patch =
                                  action === 'updateToNow'
                                    ? { multiSelectUpdateToNowKey: null }
                                    : action === 'archive'
                                      ? { multiSelectArchiveKey: null }
                                      : { multiSelectDeleteKey: null };
                                updateSystemControls(patch as any);
                                setBindAction(null);
                                setBindStatus('');
                              }}
                              className="!rounded-md !px-2 !py-1 !text-xs !leading-none"
                            >
                              Clear
                            </GlassButton>
                          </>
                        ) : (
                          <GlassButton
                            type="button"
                            onClick={() => {
                              setBindAction(action);
                              setBindStatus('');
                            }}
                            className="!rounded-md !px-2 !py-1 !text-xs !leading-none"
                          >
                            Set
                          </GlassButton>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {confirmDeleteOpen && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setConfirmDeleteOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm delete category"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-display tracking-tight-ui mb-2">Delete this category?</div>
            <p className="text-sm text-gray-600 mb-4">This action can’t be undone. People in it will be removed.</p>
            <div className="flex justify-end gap-2">
              <GlassButton type="button" onClick={() => setConfirmDeleteOpen(false)}>
                Cancel
              </GlassButton>
              <GlassButton type="button" intent="destructive" onClick={confirmDelete}>
                Delete
              </GlassButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
