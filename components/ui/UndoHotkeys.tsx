"use client";
import { useEffect } from 'react';
import { useBubbleStore } from '../../store/useBubbleStore';

function isEditableTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function UndoHotkeys() {
  const undo = useBubbleStore((s) => s.undo);
  const redo = useBubbleStore((s) => s.redo);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isEditableTarget(e.target)) return;

      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;

      const key = (e.key || '').toLowerCase();

      // Undo: Cmd+Z / Ctrl+Z
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Cmd+Shift+Z (macOS) / Ctrl+Y (windows)
      if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  return null;
}

