"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { useBubbleStore } from '../../../store/useBubbleStore';
import { GlassButton } from '../GlassButton';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ManageLabelsModal({ open, onClose }: Props) {
  const { labels, addLabel, updateLabel, deleteLabel } = useBubbleStore();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#2563eb');

  const ordered = useMemo(() => labels.slice().sort((a, b) => a.name.localeCompare(b.name)), [labels]);

  useEffect(() => {
    if (!open) return;
    setNewName('');
    setNewColor('#2563eb');
  }, [open]);

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
      <div className="glass relative z-10 w-[min(620px,94vw)] max-h-[90vh] overflow-auto rounded-2xl p-5">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-display tracking-tight-ui">Manage Labels</div>
            <div className="mt-1 text-sm text-gray-700">Create, edit, or delete labels.</div>
          </div>
          <GlassButton type="button" onClick={onClose}>
            Close
          </GlassButton>
        </div>

        <div className="rounded-xl border border-white/50 bg-white/40">
          {ordered.length === 0 ? (
            <div className="p-4 text-sm text-gray-700">No labels yet.</div>
          ) : (
            <div className="divide-y divide-white/50">
              {ordered.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <input
                    type="color"
                    value={l.color}
                    onChange={(e) => updateLabel(l.id, { color: e.target.value })}
                    aria-label={`Color for ${l.name}`}
                  />
                  <input
                    className="flex-1 min-w-[180px] rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2 text-sm"
                    value={l.name}
                    onChange={(e) => updateLabel(l.id, { name: e.target.value })}
                    aria-label={`Name for ${l.name}`}
                  />
                  <GlassButton
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete label “${l.name}”? This removes it from all bubbles.`)) deleteLabel(l.id);
                    }}
                  >
                    Delete
                  </GlassButton>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-white/50 bg-white/40 p-4">
          <div className="mb-2 font-nav tracking-tight-ui text-gray-900">Create Label</div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} aria-label="New label color" />
            <input
              className="min-w-[220px] flex-1 rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2 text-sm"
              placeholder="Label name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="w-32 rounded-md border border-zinc-200/60 bg-white/60 px-3 py-2 text-sm font-code"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              aria-label="Hex color"
            />
            <GlassButton
              type="button"
              disabled={!newName.trim()}
              onClick={() => {
                if (!newName.trim()) return;
                addLabel({ name: newName.trim(), color: newColor });
                setNewName('');
              }}
            >
              Create
            </GlassButton>
          </div>
        </div>
      </div>
    </div>
  );
}

