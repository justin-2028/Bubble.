"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { useBubbleStore } from '../../../store/useBubbleStore';
import { GlassButton } from '../GlassButton';

type Props = {
  open: boolean;
  onClose: () => void;
  categoryId?: string;
};

export function EditCategoryModal({ open, onClose, categoryId }: Props) {
  const { categories, updateCategory, deleteCategory, reorderCategory, exportData, importData } = useBubbleStore();
  const category = useMemo(() => categories.find((c) => c.id === categoryId), [categories, categoryId]);
  const [name, setName] = useState('');
  const [timeValue, setTimeValue] = useState<number>(14);
  const [timeUnit, setTimeUnit] = useState<'days' | 'months'>('days');

  useEffect(() => {
    if (category) {
      setName(category.name);
      setTimeValue(category.timeLimitValue);
      setTimeUnit(category.timeLimitUnit);
    }
  }, [category, open]);

  if (!open || !category) return null;

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateCategory(category.id, { name, timeLimitValue: timeValue, timeLimitUnit: timeUnit });
    onClose();
  };

  const onDelete = () => {
    if (confirm('Delete this category? People in it will be removed.')) {
      deleteCategory(category.id);
      onClose();
    }
  };

  const onExport = () => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bubble-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (file: File) => {
    const text = await file.text();
    try {
      const json = JSON.parse(text);
      importData(json);
      onClose();
    } catch {
      alert('Invalid JSON');
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <form onSubmit={onSave} className="glass relative z-10 w-[min(560px,92vw)] rounded-2xl p-5">
        <div className="mb-3 text-xl font-display tracking-tight-ui">Category Settings</div>
        <div className="grid grid-cols-1 gap-3">
          <label className="text-sm font-body">
            <div className="mb-1 font-nav tracking-tight-ui">Name</div>
            <input className="w-full rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <div className="grid grid-cols-2 gap-2 text-sm font-body">
            <label>
              <div className="mb-1 font-nav tracking-tight-ui">Time Limit</div>
              <input type="number" min={1} className="w-full rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2" value={timeValue} onChange={(e) => setTimeValue(Number(e.target.value))} />
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
              <GlassButton type="button" onClick={onDelete}>Delete</GlassButton>
              <GlassButton type="button" onClick={onExport}>Export</GlassButton>
              <label className="glass cursor-pointer rounded-xl px-3 py-2 font-nav tracking-tight-ui text-sm">
                Import
                <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files && onImport(e.target.files[0])} />
              </label>
              <GlassButton type="submit">Save</GlassButton>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

