"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useBubbleStore } from '../../../store/useBubbleStore';
import { Person } from '../../../lib/types';
import { GlassButton } from '../GlassButton';

type Props = {
  open: boolean;
  onClose: () => void;
  defaultCategoryId?: string;
  personId?: string;
};

export function AddEditPersonModal({ open, onClose, defaultCategoryId, personId }: Props) {
  const { categories, addPerson, updatePerson, deletePerson, people } = useBubbleStore();
  const editing = useMemo<Person | undefined>(() => people.find((p) => p.id === personId), [people, personId]);

  const [fullName, setFullName] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(defaultCategoryId);
  const [context, setContext] = useState('');
  const [lastInteraction, setLastInteraction] = useState<string>(new Date().toISOString().slice(0, 10));
  const [image, setImage] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (editing) {
      setFullName(editing.fullName);
      setCategoryId(editing.categoryId);
      setContext(editing.context);
      setLastInteraction(new Date(editing.lastInteraction).toISOString().slice(0, 10));
      setImage(editing.image);
    } else {
      setFullName('');
      setCategoryId(defaultCategoryId);
      setContext('');
      setLastInteraction(new Date().toISOString().slice(0, 10));
      setImage(undefined);
    }
  }, [editing, defaultCategoryId, open]);

  if (!open) return null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId || !fullName.trim()) return;
    const iso = new Date(lastInteraction).toISOString();
    if (editing) {
      updatePerson(editing.id, { fullName, categoryId, context, lastInteraction: iso, image });
    } else {
      addPerson({ fullName, categoryId, context, lastInteraction: iso, image, yPosition: 50 });
    }
    onClose();
  };

  const onDelete = () => {
    if (!editing) return;
    if (confirm('Delete this person?')) {
      deletePerson(editing.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <form onSubmit={onSubmit} className="glass relative z-10 w-[min(520px,92vw)] rounded-2xl p-5">
        <div className="mb-3 text-xl font-display tracking-tight-ui">{editing ? 'Edit Person' : 'Add Bubble'}</div>
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
          <label className="text-sm font-body">
            <div className="mb-1 font-nav tracking-tight-ui">Last Interaction</div>
            <input type="date" className="w-full rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2" value={lastInteraction} onChange={(e) => setLastInteraction(e.target.value)} />
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

