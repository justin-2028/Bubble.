"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useBubbleStore } from '../../../store/useBubbleStore';
import { Person } from '../../../lib/types';
import { GlassButton } from '../GlassButton';
import { ManageLabelsModal } from './ManageLabelsModal';
import { svgAvatarDataUrl } from '../../../lib/avatar';

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
  defaultCategoryId?: string;
  personId?: string;
};

export function AddEditPersonModal({ open, onClose, defaultCategoryId, personId }: Props) {
  const { categories, labels, addLabel, addPerson, updatePerson, deletePerson, people } = useBubbleStore();
  const editing = useMemo<Person | undefined>(() => people.find((p) => p.id === personId), [people, personId]);

  const todayMax = useMemo(() => toDateInputValue(new Date()), []);
  const [fullName, setFullName] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(defaultCategoryId);
  const [context, setContext] = useState('');
  const [lastInteraction, setLastInteraction] = useState<string>(todayMax);
  const [image, setImage] = useState<string | undefined>(undefined);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [starred, setStarred] = useState(false);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [addExistingLabelId, setAddExistingLabelId] = useState<string>('');
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#2563eb');
  const [manageLabelsOpen, setManageLabelsOpen] = useState(false);
  const [dragLabelId, setDragLabelId] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setFullName(editing.fullName);
      setCategoryId(editing.categoryId);
      setContext(editing.context);
      setLastInteraction(toDateInputValue(new Date(editing.lastInteraction)));
      setImage(editing.image);
      setStarred(editing.starred ?? false);
      setLabelIds(editing.labelIds ?? []);
    } else {
      setFullName('');
      setCategoryId(defaultCategoryId);
      setContext('');
      setLastInteraction(todayMax);
      setImage(undefined);
      setStarred(false);
      setLabelIds([]);
    }
    setAddExistingLabelId('');
    setNewLabelName('');
    setNewLabelColor('#2563eb');
  }, [editing, defaultCategoryId, open, todayMax, categories]);

  useEffect(() => {
    if (!open) return;
    const labelSet = new Set(labels.map((l) => l.id));
    setLabelIds((prev) => {
      const next = prev.filter((id) => labelSet.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [labels, open]);

  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l] as const)), [labels]);
  const availableLabels = useMemo(() => {
    const selected = new Set(labelIds);
    return labels
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((l) => !selected.has(l.id));
  }, [labels, labelIds]);
  const creatingNewLabel = addExistingLabelId === '__create__';
  const canAddExisting = !!addExistingLabelId && addExistingLabelId !== '__create__';

  if (!open) return null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId || !fullName.trim()) return;
    // Prevent future dates (can break x-axis directionality).
    const clamped = lastInteraction > todayMax ? todayMax : lastInteraction;
    const iso = isoFromDateInputValue(clamped, { preferNowIfToday: true });
    const resolvedImage =
      !image
        ? svgAvatarDataUrl(fullName)
        : editing &&
            image === editing.image &&
            image.startsWith('data:image/svg+xml') &&
            editing.fullName !== fullName
          ? svgAvatarDataUrl(fullName)
          : image;
    if (editing) {
      updatePerson(editing.id, { fullName, categoryId, context, lastInteraction: iso, image: resolvedImage, starred, labelIds });
    } else {
      addPerson({
        fullName,
        categoryId,
        context,
        lastInteraction: iso,
        image: resolvedImage,
        yPosition: 50,
        starred,
        labelIds,
      });
    }
    onClose();
  };

  const onDelete = () => {
    if (!editing) return;
    setConfirmDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (!editing) return;
    deletePerson(editing.id);
    setConfirmDeleteOpen(false);
    onClose();
  };

  return (
	    <div className="fixed inset-0 z-40 flex items-center justify-center">
	      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
	      <form onSubmit={onSubmit} className="glass relative z-10 w-[min(520px,92vw)] max-h-[90vh] overflow-auto rounded-2xl p-5">
	        <div className="mb-3 flex items-center justify-between gap-3">
	          <div className="text-xl font-display tracking-tight-ui">{editing ? 'Edit Person' : 'Add Bubble'}</div>
	          <GlassButton
	            type="button"
	            aria-label={starred ? 'Unstar bubble' : 'Star bubble'}
	            className="text-base px-3 py-2"
	            onClick={() => setStarred((v) => !v)}
	          >
	            <span className={starred ? 'text-yellow-500' : 'text-gray-500'}>{starred ? '★' : '☆'}</span>
	          </GlassButton>
	        </div>
	        <div className="grid grid-cols-1 gap-3">
          <label className="text-sm font-body">
            <div className="mb-1 font-nav tracking-tight-ui">Full Name</div>
            <input className="w-full rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
	          <label className="text-sm font-body">
	            <div className="mb-1 font-nav tracking-tight-ui">Category</div>
	            <select className="w-full rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
	              <option value="" disabled>
	                Select category
              </option>
		              {categories
		                .slice()
		                .sort((a, b) => a.sortOrder - b.sortOrder)
		                .map((c) => (
		                  <option key={c.id} value={c.id}>
		                    {c.name}
		                  </option>
		                ))}
		            </select>
		          </label>
		          <label className="text-sm font-body">
		            <div className="mb-1 font-nav tracking-tight-ui">Context</div>
		            <textarea className="w-full rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2" rows={3} value={context} onChange={(e) => setContext(e.target.value)} />
		          </label>
	          <div className="text-sm font-body">
	            <div className="mb-1 flex items-center justify-between gap-2">
	              <div className="font-nav tracking-tight-ui">Labels</div>
	              <GlassButton type="button" className="px-3 py-1.5" onClick={() => setManageLabelsOpen(true)} aria-label="Manage labels">
	                ⚙️
	              </GlassButton>
	            </div>
	            <div className="flex flex-wrap gap-2">
	              {labelIds.length === 0 ? (
	                <div className="text-xs text-gray-600">No labels</div>
	              ) : (
	                labelIds.map((id) => {
	                  const l = labelById.get(id);
	                  if (!l) return null;
	                  return (
	                    <div
	                      key={id}
	                      draggable
	                      onDragStart={() => setDragLabelId(id)}
	                      onDragEnd={() => setDragLabelId(null)}
	                      onDragOver={(e) => e.preventDefault()}
	                      onDrop={() => {
	                        if (!dragLabelId || dragLabelId === id) return;
	                        setLabelIds((prev) => {
	                          const from = prev.indexOf(dragLabelId);
	                          const to = prev.indexOf(id);
	                          if (from < 0 || to < 0) return prev;
	                          const next = [...prev];
	                          next.splice(from, 1);
	                          next.splice(to, 0, dragLabelId);
	                          return next;
	                        });
	                        setDragLabelId(null);
	                      }}
	                      className={`inline-flex cursor-move items-center gap-2 rounded-full border border-white/60 bg-white/60 px-3 py-1 text-xs font-nav tracking-tight-ui ${dragLabelId === id ? 'opacity-60' : ''}`}
	                    >
	                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
	                      <span style={{ color: l.color }}>{l.name}</span>
	                      <button
	                        type="button"
	                        className="ml-1 text-gray-600 hover:text-gray-900"
	                        aria-label={`Remove ${l.name}`}
	                        onClick={(e) => {
	                          e.preventDefault();
	                          e.stopPropagation();
	                          setLabelIds((prev) => prev.filter((x) => x !== id));
	                        }}
	                      >
	                        ×
	                      </button>
	                    </div>
	                  );
	                })
	              )}
	            </div>
	
	            <div className="mt-2 flex flex-wrap items-center gap-2">
	              <select
	                className="min-w-[240px] rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2"
	                value={addExistingLabelId}
	                onChange={(e) => setAddExistingLabelId(e.target.value)}
	              >
	                <option value="">Add existing label</option>
	                <option value="__create__">Create new label</option>
	                {availableLabels.map((l) => (
	                  <option key={l.id} value={l.id}>
	                    {l.name}
	                  </option>
	                ))}
	              </select>
	              <GlassButton
	                type="button"
	                disabled={!canAddExisting}
	                onClick={() => {
	                  if (!canAddExisting) return;
	                  setLabelIds((prev) => [...prev, addExistingLabelId]);
	                  setAddExistingLabelId('');
	                }}
	              >
	                Add
	              </GlassButton>
	            </div>
	
	            {creatingNewLabel && (
	              <div className="mt-2 rounded-xl border border-white/50 bg-white/40 p-3">
	                <div className="mb-2 font-nav tracking-tight-ui text-gray-900">Create Label</div>
	                <div className="flex flex-wrap items-center gap-2">
	                  <input type="color" value={newLabelColor} onChange={(e) => setNewLabelColor(e.target.value)} aria-label="Label color" />
	                  <input
	                    className="min-w-[200px] flex-1 rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2"
	                    placeholder="Label name"
	                    value={newLabelName}
	                    onChange={(e) => setNewLabelName(e.target.value)}
	                  />
	                  <input
	                    className="w-32 rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2 font-code text-sm"
	                    value={newLabelColor}
	                    onChange={(e) => setNewLabelColor(e.target.value)}
	                    aria-label="Hex color"
	                  />
	                  <GlassButton
	                    type="button"
	                    disabled={!newLabelName.trim()}
	                    onClick={() => {
	                      const name = newLabelName.trim();
	                      if (!name) return;
	                      const id = addLabel({ name, color: newLabelColor });
	                      setLabelIds((prev) => [...prev, id]);
	                      setNewLabelName('');
	                      setAddExistingLabelId('');
	                    }}
	                  >
	                    Create & Add
	                  </GlassButton>
	                </div>
	              </div>
	            )}
	          </div>
	          <label className="text-sm font-body">
	            <div className="mb-1 font-nav tracking-tight-ui">Last Interaction</div>
	            <input
	              type="date"
              max={todayMax}
              className="w-full rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2"
              value={lastInteraction}
              onChange={(e) => {
                const v = e.target.value;
                setLastInteraction(v > todayMax ? todayMax : v);
              }}
            />
          </label>

          <ImageUpload image={image} setImage={setImage} />

          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {editing && (
                <GlassButton type="button" onClick={() => updatePerson(editing.id, { lastInteraction: new Date().toISOString() })}>Update to Now</GlassButton>
              )}
            </div>
            <div className="flex items-center gap-2">
              {editing && (
                <GlassButton type="button" onClick={onDelete}>
                  Delete
                </GlassButton>
              )}
              <GlassButton type="button" onClick={onClose}>Cancel</GlassButton>
              <GlassButton type="submit">{editing ? 'Save' : 'Add'}</GlassButton>
            </div>
          </div>
        </div>
      </form>
	      {confirmDeleteOpen && (
	        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
	          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-label="Confirm delete">
	            <div className="text-lg font-display tracking-tight-ui mb-2">Delete this person?</div>
	            <p className="text-sm text-gray-600 mb-4">This action can’t be undone. Their bubble and history will be removed.</p>
	            <div className="flex justify-end gap-2">
	              <GlassButton type="button" onClick={() => setConfirmDeleteOpen(false)}>Cancel</GlassButton>
	              <GlassButton type="button" onClick={confirmDelete}>Delete</GlassButton>
	            </div>
	          </div>
	        </div>
	      )}
	      <ManageLabelsModal open={manageLabelsOpen} onClose={() => setManageLabelsOpen(false)} />
	    </div>
	  );
	}

function ImageUpload({ image, setImage }: { image?: string; setImage: (v?: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File) => {
    const dataUrl = await fileToDataURL(f);
    const processed = await centerCropCircle(dataUrl, 512);
    setImage(processed);
  };

  return (
    <div className="text-sm font-body">
      <div className="mb-1 font-nav tracking-tight-ui">Upload Image</div>
      <div className="flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpg,image/jpeg"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        {image && (
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 overflow-hidden rounded-full border border-white/50">
              <img src={image} className="h-full w-full object-cover" alt="Preview" />
            </div>
            <button type="button" className="underline" onClick={() => setImage(undefined)}>
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function centerCropCircle(dataUrl: string, size = 512): Promise<string> {
  const img = document.createElement('img');
  img.src = dataUrl;
  await new Promise((res) => (img.onload = res));
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - s) / 2;
  const sy = (img.naturalHeight - s) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
  ctx.restore();
  // gentle quality optimization
  return canvas.toDataURL('image/jpeg', 0.9);
}
