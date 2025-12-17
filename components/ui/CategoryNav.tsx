"use client";
import React, { useEffect } from 'react';
import { Category } from '../../lib/types';
import { useBubbleStore } from '../../store/useBubbleStore';
import { GlassButton } from './GlassButton';

type Props = {
  category?: Category;
  categories: Category[];
  onOpenCategorySettings: () => void;
  onOpenSearch?: () => void;
  keyboardNavEnabled?: boolean;
};

export function CategoryNav({ category, categories, onOpenCategorySettings, onOpenSearch, keyboardNavEnabled = true }: Props) {
  const { setCurrentCategory, addCategory } = useBubbleStore();
  const [open, setOpen] = React.useState(false);
  const ordered = categories.slice().sort((a, b) => a.sortOrder - b.sortOrder);

  const go = (dir: -1 | 1) => {
    if (!category) return;
    const idx = ordered.findIndex((c) => c.id === category.id);
    const next = ordered[idx + dir];
    if (next) setCurrentCategory(next.id);
  };

  useEffect(() => {
    if (!keyboardNavEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase?.();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category?.id, categories.length, keyboardNavEnabled]);

  const idx = category ? ordered.findIndex((c) => c.id === category.id) : -1;
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < ordered.length - 1;

	  return (
	    <div className="flex items-center gap-3">
      <GlassButton onClick={() => go(-1)} aria-label="Previous Category" disabled={!hasPrev}>←</GlassButton>
      <div className="relative">
        <button
          type="button"
          className="glass rounded-2xl px-4 py-2"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <div className="font-display tracking-tight-display leading-tight-display text-gray-900" style={{ fontSize: 'clamp(28px, 4.5vw, 64px)' }}>
            {category?.name || '—'}
          </div>
        </button>
        {open && (
          <div className="absolute left-0 z-30 mt-2 w-64 max-w-[80vw] rounded-xl border border-white/50 bg-white/70 p-1 shadow-xl backdrop-blur">
            {ordered.map((c) => (
              <button
                key={c.id}
                className={`w-full rounded-lg px-3 py-2 text-left font-nav tracking-tight-ui ${c.id === category?.id ? 'bg-white/70' : 'hover:bg-white/60'}`}
                onClick={() => {
                  setCurrentCategory(c.id);
                  setOpen(false);
                }}
              >
                {c.name}
              </button>
            ))}
            <div className="my-1 h-px w-full bg-zinc-200/70" />
            <button
              className="w-full rounded-lg px-3 py-2 text-left font-nav tracking-tight-ui hover:bg-white/60"
              onClick={() => {
                addCategory({ name: 'New Category' });
                setOpen(false);
              }}
            >
              ＋ New Category
            </button>
          </div>
        )}
      </div>
      <GlassButton onClick={() => go(1)} aria-label="Next Category" disabled={!hasNext}>→</GlassButton>

      <div className="ml-auto flex items-center gap-2">
	        <GlassButton onClick={onOpenCategorySettings} aria-label="Category Settings">⚙️</GlassButton>
	        {onOpenSearch && <GlassButton onClick={onOpenSearch} aria-label="Search">🔍</GlassButton>}
      </div>
	    </div>
	  );
	}
