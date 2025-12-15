"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { Category, Person } from '../../../lib/types';
import { categoryTimeLimitDays, daysSince } from '../../../lib/utils';
import { GlassButton } from '../GlassButton';

type Row = {
  id: string;
  fullName: string;
  image?: string;
  daysLeft: number; // can be negative when overdue
  categoryName?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  currentCategory?: Category;
  people: Person[];
};

function initialsFromName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
  return (first + last).toUpperCase() || '?';
}

function Medal({ rank }: { rank: 1 | 2 | 3 }) {
  const fill = rank === 1 ? '#D4AF37' : rank === 2 ? '#C0C0C0' : '#CD7F32';
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className="ml-1 inline-block align-[-2px]">
      <path
        d="M7 2h4l1 4 1-4h4l-3 7h-4L7 2Zm5 8a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"
        fill={fill}
      />
    </svg>
  );
}

export function PoppingBubblesModal({ open, onClose, categories, currentCategory, people }: Props) {
  const [scope, setScope] = useState<'all' | 'category'>('all');

  useEffect(() => {
    if (!open) return;
    setScope('all');
  }, [open]);

  const rows = useMemo(() => {
    const now = new Date();
    const byId = new Map(categories.map((c) => [c.id, c]));
    const base = scope === 'category' && currentCategory
      ? people.filter((p) => p.categoryId === currentCategory.id)
      : people;

    return base
      .map((p) => {
        const c = byId.get(p.categoryId);
        if (!c) return null;
        const limitDays = categoryTimeLimitDays(c);
        const lastMs = Date.parse(p.lastInteraction as any);
        const last = Number.isFinite(lastMs) ? new Date(lastMs) : now;
        const daysAgo = Math.max(0, daysSince(now, last));
        const daysLeft = limitDays - daysAgo;
        return { id: p.id, fullName: p.fullName, image: p.image, daysLeft, categoryName: c.name } satisfies Row;
      })
      .filter(Boolean)
      .sort((a, b) => ((a as Row).daysLeft - (b as Row).daysLeft) || (a as Row).fullName.localeCompare((b as Row).fullName)) as Row[];
  }, [categories, people, scope, currentCategory]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={onClose} />
      <div className="glass relative z-10 w-[min(720px,94vw)] rounded-2xl p-5">
        <div className="mb-1 flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-display tracking-tight-ui">Popping Bubbles</div>
            <div className="mt-1 text-sm text-gray-700">Don't let them pop!</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="glass flex rounded-xl p-1">
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm font-nav tracking-tight-ui ${scope === 'all' ? 'bg-white/70 text-gray-900' : 'text-gray-700 hover:bg-white/50'}`}
                onClick={() => setScope('all')}
              >
                All Categories
              </button>
              <button
                type="button"
                disabled={!currentCategory}
                className={`rounded-lg px-3 py-1.5 text-sm font-nav tracking-tight-ui ${scope === 'category' ? 'bg-white/70 text-gray-900' : 'text-gray-700 hover:bg-white/50'} ${!currentCategory ? 'opacity-40 cursor-not-allowed' : ''}`}
                onClick={() => setScope('category')}
              >
                This Category
              </button>
            </div>
            <GlassButton type="button" onClick={onClose}>
              Close
            </GlassButton>
          </div>
        </div>

        <div className="mt-4 max-h-[70vh] overflow-auto rounded-xl border border-white/50 bg-white/40">
          {rows.length === 0 ? (
            <div className="p-5 text-sm text-gray-700">No bubbles in this category.</div>
          ) : (
            <div className="divide-y divide-white/50">
              {rows.map((r, idx) => {
                const rank = idx + 1;
                const isTop3 = rank <= 3;
                const daysLeftRounded = Math.ceil(r.daysLeft);
                const daysLeftDisplay = daysLeftRounded <= 0 ? 0 : daysLeftRounded;
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-10 shrink-0 text-right font-code text-sm text-gray-800">
                      {rank}
                      {isTop3 && <Medal rank={rank as 1 | 2 | 3} />}
                    </div>

                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/60 bg-white/70">
                      {r.image ? (
                        <img src={r.image} alt={r.fullName} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-nav text-sm text-gray-700">
                          {initialsFromName(r.fullName)}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate font-nav tracking-tight-ui text-gray-900">{r.fullName}</div>
                      {scope === 'all' && r.categoryName && (
                        <div className="mt-0.5 text-xs text-gray-600">{r.categoryName}</div>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="font-code text-sm text-gray-900">{daysLeftDisplay}d</div>
                      <div className={`text-xs ${daysLeftRounded <= 0 ? 'text-red-600' : 'text-gray-600'}`}>
                        {daysLeftRounded <= 0 ? 'Overdue' : 'Days Left'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
