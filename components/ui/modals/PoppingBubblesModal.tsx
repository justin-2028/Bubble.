"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { Category, Person } from '../../../lib/types';
import { categoryTimeLimitDays, daysSince } from '../../../lib/utils';
import { GlassButton } from '../GlassButton';
import { StarIcon } from '../icons/StarIcon';

type Row = {
  id: string;
  fullName: string;
  image?: string;
  daysLeft: number; // can be negative when overdue
  starred?: boolean;
  interactionCount: number;
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

export function PoppingBubblesModal({ open, onClose, categories, currentCategory, people }: Props) {
  const [scope, setScope] = useState<'all' | 'category'>('all');
  const [showInteractions, setShowInteractions] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScope('all');
    setShowInteractions(false);
  }, [open]);

  const rows = useMemo(() => {
    const now = new Date();
    const byId = new Map(categories.map((c) => [c.id, c]));
    const base = scope === 'category' && currentCategory
      ? people.filter((p) => p.categoryId === currentCategory.id && !p.archivedAt)
      : people.filter((p) => !p.archivedAt);

    const groups = new Map<string, Person[]>();
    for (const p of base) {
      const gid = p.duplicateGroupId ?? p.id;
      const list = groups.get(gid);
      if (list) list.push(p);
      else groups.set(gid, [p]);
    }

    const rows: Row[] = [];
    for (const [gid, members] of groups.entries()) {
      let best: { p: Person; daysLeft: number; categoryName: string } | null = null;
      for (const p of members) {
        const c = byId.get(p.categoryId);
        if (!c) continue;
        const limitDays = categoryTimeLimitDays(c);
        const lastMs = Date.parse(p.lastInteraction as any);
        const last = Number.isFinite(lastMs) ? new Date(lastMs) : now;
        const daysAgo = Math.max(0, daysSince(now, last));
        const daysLeft = limitDays - daysAgo;
        if (!best || daysLeft < best.daysLeft) best = { p, daysLeft, categoryName: c.name };
      }
      if (!best) continue;
      const starred = members.some((m) => m.starred);
      const interactionCount = Math.max(0, ...members.map((m) => (typeof m.interactionCount === 'number' ? m.interactionCount : 0)));
      rows.push({
        id: gid,
        fullName: best.p.fullName,
        image: best.p.image,
        daysLeft: best.daysLeft,
        starred,
        interactionCount,
      });
    }

    return rows.sort((a, b) => (a.daysLeft - b.daysLeft) || a.fullName.localeCompare(b.fullName));
  }, [categories, people, scope, currentCategory]);

  useEffect(() => {
    if (!open) return;
    const isEditableTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.repeat) return;
      if (isEditableTarget(e.target)) return;
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        setShowInteractions((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
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
          </div>
        </div>

        <div className="mt-4 max-h-[70vh] overflow-auto rounded-xl border border-white/50 bg-white/40">
          {rows.length === 0 ? (
            <div className="p-5 text-sm text-gray-700">No bubbles in this category.</div>
          ) : (
	            <div className="divide-y divide-white/50">
	              {rows.map((r, idx) => {
	                const rank = idx + 1;
	                const daysLeftRounded = Math.ceil(r.daysLeft);
	                const daysLeftDisplay = daysLeftRounded <= 0 ? 0 : daysLeftRounded;
	                const name = r.fullName.trim();
	                const [firstName, ...restParts] = name ? name.split(/\s+/) : ['?', ''];
	                const restName = restParts.join(' ');
	                  const interactionBadge =
	                    r.interactionCount <= 0 ? (
	                      'No Interactions'
	                    ) : (
	                      <>
	                        <span className="font-bold">{r.interactionCount}</span>
                          <span>Interaction{r.interactionCount === 1 ? '' : 's'}</span>
	                      </>
	                    );
	                return (
	                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
	                    <div className="w-10 shrink-0 text-right font-code text-sm text-gray-800">
	                      {rank}
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
	                      <div className="truncate font-nav tracking-tight-ui text-gray-900 text-[17px] leading-tight">
	                        <span>{firstName}</span>
	                        {restName && <span className="ml-1">{restName}</span>}
	                        {r.starred && <StarIcon className="ml-1 inline-block h-4 w-4 align-[-2px] text-yellow-500" filled strokeWidth={2.5} />}
	                          {showInteractions && (
	                            <span className="ml-2 inline-flex items-center gap-1 rounded-md border border-gray-900/35 bg-white/60 px-2 py-0.5 font-code text-[11px] text-gray-900">
	                              {interactionBadge}
	                            </span>
	                          )}
	                      </div>
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
