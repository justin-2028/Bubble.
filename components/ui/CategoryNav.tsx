"use client";
import React, { useEffect } from 'react';
import { Category } from '../../lib/types';
import { useBubbleStore } from '../../store/useBubbleStore';
import { GlassButton } from './GlassButton';
import { ArchiveBoxIcon } from './icons/ArchiveBoxIcon';

function MagnifyingGlassIcon(props: React.SVGProps<SVGSVGElement>) {
  const maskId = React.useId();
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <defs>
        {/* Hide the portion of the thick handle that would intrude into the ring. */}
        <mask id={maskId}>
          <rect x="0" y="0" width="24" height="24" fill="white" />
          <circle cx="11" cy="11" r="7.1" fill="black" />
        </mask>
      </defs>
      {/* Thicker handle (double-stroke) without changing the ring */}
      <path d="M15.95 15.95L19.4 19.4" mask={`url(#${maskId})`} stroke="currentColor" strokeWidth="4.2" strokeLinecap="butt" />
      <circle cx="19.4" cy="19.4" r="2.1" fill="currentColor" />
      <path d="M15.95 15.95L19.4 19.4" mask={`url(#${maskId})`} stroke="currentColor" strokeWidth="4.2" strokeLinecap="butt" />
      <circle cx="19.4" cy="19.4" r="1.1" fill="currentColor" />
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function GearIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c0 .66.26 1.3.73 1.77.47.47 1.11.73 1.77.73H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

type Props = {
  category?: Category;
  categories: Category[];
  onOpenCategorySettings: () => void;
  onOpenArchive?: () => void;
  onOpenSearch?: () => void;
  keyboardNavEnabled?: boolean;
};

export function CategoryNav({ category, categories, onOpenCategorySettings, onOpenArchive, onOpenSearch, keyboardNavEnabled = true }: Props) {
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
          id="category-name-box"
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
	        <GlassButton onClick={onOpenCategorySettings} aria-label="Category Settings" title="Settings">
            <GearIcon className="h-4 w-4" />
          </GlassButton>
          {onOpenArchive && (
            <GlassButton onClick={onOpenArchive} aria-label="Archive" title="Archive">
              <ArchiveBoxIcon className="h-4 w-4" />
            </GlassButton>
          )}
	        {onOpenSearch && (
            <GlassButton onClick={onOpenSearch} aria-label="Search" title="Search">
              <MagnifyingGlassIcon className="h-4 w-4" />
            </GlassButton>
          )}
      </div>
	    </div>
	  );
	}
