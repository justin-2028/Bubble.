"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { Category, Label, Person } from '../../../lib/types';
import { GlassButton } from '../GlassButton';
import { ArchiveBoxIcon } from '../icons/ArchiveBoxIcon';

type Props = {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  currentCategory?: Category;
  people: Person[];
  labels: Label[];
  onSelectPerson: (personId: string, categoryId: string) => void;
  onSelectArchived: (personId: string) => void;
};

function initialsFromName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
  return (first + last).toUpperCase() || '?';
}

export function SearchBubblesModal({ open, onClose, categories, currentCategory, people, labels, onSelectPerson, onSelectArchived }: Props) {
  const [scope, setScope] = useState<'all' | 'category'>('category');
  const [query, setQuery] = useState('');
  const [termMode, setTermMode] = useState<'all' | 'any'>('all');
  const [labelMode, setLabelMode] = useState<'all' | 'any'>('all');
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);

  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l] as const)), [labels]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c] as const)), [categories]);

  useEffect(() => {
    if (!open) return;
    setScope('category');
    setQuery('');
    setSelectedLabelIds([]);
    setTermMode('all');
    setLabelMode('all');
    setLabelMenuOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const terms = useMemo(() => query.split(',').map((t) => t.trim()).filter(Boolean), [query]);

  useEffect(() => {
    if (!open) return;
    if (terms.length <= 1 && termMode !== 'all') setTermMode('all');
  }, [open, terms.length, termMode]);

  useEffect(() => {
    if (!open) return;
    if (selectedLabelIds.length <= 1 && labelMode !== 'all') setLabelMode('all');
  }, [open, selectedLabelIds.length, labelMode]);

  const results = useMemo(() => {
    const base =
      scope === 'category' && currentCategory
        ? people.filter((p) => p.categoryId === currentCategory.id && !p.archivedAt)
        : people;
    const termActive = terms.length > 0;
    const labelActive = selectedLabelIds.length > 0;
    if (!termActive && !labelActive) return [];

    const selectedSet = new Set(selectedLabelIds);
    return base.filter((p) => {
      if (termActive) {
        const hay = (p.context || '').toLowerCase();
        const okTerms =
          termMode === 'all'
            ? terms.every((t) => hay.includes(t.toLowerCase()))
            : terms.some((t) => hay.includes(t.toLowerCase()));
        if (!okTerms) return false;
      }
      if (labelActive) {
        const ids = new Set(p.labelIds ?? []);
        const okLabels = labelMode === 'all' ? Array.from(selectedSet).every((id) => ids.has(id)) : Array.from(selectedSet).some((id) => ids.has(id));
        if (!okLabels) return false;
      }
      return true;
    });
  }, [people, scope, currentCategory, terms, termMode, selectedLabelIds, labelMode]);

  const toggleLabel = (id: string) => {
    setSelectedLabelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  if (!open) return null;

  const orderedLabels = labels.slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        onClick={() => {
          setLabelMenuOpen(false);
          onClose();
        }}
      />
	      <div className="glass relative z-10 w-[min(860px,94vw)] max-h-[90vh] overflow-auto rounded-2xl p-5">
	        <div className="mb-3 flex items-start justify-between gap-4">
	          <div>
	            <div className="text-2xl font-display tracking-tight-ui">Search</div>
	            <div className="mt-1 text-sm text-gray-700">Find bubbles by context or labels.</div>
	          </div>
	          <div className="flex items-center gap-2">
	            <div className="glass flex rounded-xl p-1">
	              <button
	                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm font-nav tracking-tight-ui ${scope === 'category' ? 'bg-white/70 text-gray-900' : 'text-gray-700 hover:bg-white/50'}`}
                disabled={!currentCategory}
                onClick={() => setScope('category')}
              >
                This Category
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm font-nav tracking-tight-ui ${scope === 'all' ? 'bg-white/70 text-gray-900' : 'text-gray-700 hover:bg-white/50'}`}
                onClick={() => setScope('all')}
              >
	                All Categories
	              </button>
	            </div>
	          </div>
	        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-xl border border-white/50 bg-white/40 p-4">
            <div className="mb-2 font-nav tracking-tight-ui text-gray-900">Search Context</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="flex-1 min-w-[260px] rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2 text-sm"
                placeholder="Type a word/phrase (use commas for multiple)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="glass flex rounded-xl p-1">
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-sm font-nav tracking-tight-ui ${termMode === 'all' ? 'bg-white/70 text-gray-900' : 'text-gray-700 hover:bg-white/50'}`}
                  onClick={() => setTermMode('all')}
                  disabled={terms.length <= 1}
                >
                  All Terms
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-sm font-nav tracking-tight-ui ${termMode === 'any' ? 'bg-white/70 text-gray-900' : 'text-gray-700 hover:bg-white/50'}`}
                  onClick={() => setTermMode('any')}
                  disabled={terms.length <= 1}
                >
                  Any Term
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/50 bg-white/40 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="font-nav tracking-tight-ui text-gray-900">Labels</div>
              <div className="flex items-center gap-2">
                <div className="glass flex rounded-xl p-1">
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-sm font-nav tracking-tight-ui ${labelMode === 'all' ? 'bg-white/70 text-gray-900' : 'text-gray-700 hover:bg-white/50'}`}
                    onClick={() => setLabelMode('all')}
                    disabled={selectedLabelIds.length <= 1}
                  >
                    All Labels
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-sm font-nav tracking-tight-ui ${labelMode === 'any' ? 'bg-white/70 text-gray-900' : 'text-gray-700 hover:bg-white/50'}`}
                    onClick={() => setLabelMode('any')}
                    disabled={selectedLabelIds.length <= 1}
                  >
                    Any Label
                  </button>
                </div>
              </div>
            </div>

            <div className="relative">
              <GlassButton type="button" onClick={() => setLabelMenuOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={labelMenuOpen}>
                Choose Labels ▾
              </GlassButton>
              {labelMenuOpen && (
                <div className="absolute z-50 mt-2 w-[min(520px,92vw)] rounded-xl border border-white/60 bg-white/85 p-2 shadow-xl backdrop-blur">
                  {orderedLabels.length === 0 ? (
                    <div className="p-2 text-sm text-gray-700">No labels yet.</div>
                  ) : (
                    <div className="max-h-[40vh] overflow-auto">
                      {orderedLabels.map((l) => {
                        const checked = selectedLabelIds.includes(l.id);
                        return (
                          <button
                            key={l.id}
                            type="button"
                            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-nav tracking-tight-ui ${checked ? 'bg-white/70' : 'hover:bg-white/60'}`}
                            onClick={() => toggleLabel(l.id)}
                          >
                            <input type="checkbox" readOnly checked={checked} />
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                            <span style={{ color: l.color }}>{l.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {selectedLabelIds.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedLabelIds.map((id) => {
                  const l = labelById.get(id);
                  if (!l) return null;
                  return (
                    <div key={id} className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/60 px-3 py-1 text-xs font-nav tracking-tight-ui">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                      <span style={{ color: l.color }}>{l.name}</span>
                      <button type="button" className="ml-1 text-gray-600 hover:text-gray-900" onClick={() => toggleLabel(id)} aria-label={`Remove ${l.name}`}>
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/50 bg-white/40 p-4">
          <div className="mb-2 font-nav tracking-tight-ui text-gray-900">Results</div>
          {results.length === 0 ? (
            <div className="text-sm text-gray-700">
              {terms.length === 0 && selectedLabelIds.length === 0 ? 'Enter a term or select labels to search.' : 'No matches found.'}
            </div>
          ) : (
            <div className="flex flex-wrap gap-4">
              {results.map((p) => {
                const isArchived = !!p.archivedAt;
                const catId = isArchived ? (p.archivedFromCategoryId ?? p.categoryId) : p.categoryId;
                const cat = categoryById.get(catId);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="flex w-[120px] flex-col items-center gap-2 rounded-xl px-2 py-2 hover:bg-white/20"
                    onClick={() => {
                      if (isArchived) onSelectArchived(p.id);
                      else onSelectPerson(p.id, p.categoryId);
                    }}
                  >
                    <div className="bubble relative flex h-16 w-16 items-center justify-center overflow-hidden">
                      {p.image ? (
                        <img src={p.image} alt={p.fullName} className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <div className="font-nav text-sm text-gray-700">{initialsFromName(p.fullName)}</div>
                      )}
                      {isArchived && (
                        <div className="absolute right-1 top-1 rounded-md border border-white/70 bg-white/70 p-0.5 text-gray-800" aria-hidden="true">
                          <ArchiveBoxIcon className="h-3.5 w-3.5" />
                        </div>
                      )}
                    </div>
                    <div className="w-full text-center">
                      <div className="font-body tracking-tight-ui text-gray-800 text-sm break-words">{p.fullName}</div>
                      {scope === 'all' && cat && <div className="mt-0.5 text-xs text-gray-600">{cat.name}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
