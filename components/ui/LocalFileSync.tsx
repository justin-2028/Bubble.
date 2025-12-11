"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBubbleStore } from '@/store/useBubbleStore';
import { GlassButton } from './GlassButton';

// Minimal IndexedDB helpers to persist the FileSystemFileHandle
const DB_NAME = 'bubble-local';
const STORE = 'kv';
async function idb<T = any>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const r = fn(store);
      r.onerror = () => reject(r.error);
      r.onsuccess = () => resolve(r.result as T);
      tx.oncomplete = () => db.close();
    };
  });
}

async function idbGet<T = any>(key: string): Promise<T | undefined> {
  return idb('readonly', (s) => s.get(key));
}
async function idbSet<T = any>(key: string, value: T): Promise<void> {
  await idb('readwrite', (s) => s.put(value as any, key));
}
async function idbDel(key: string): Promise<void> {
  await idb('readwrite', (s) => s.delete(key));
}

async function verifyPermission(handle: FileSystemFileHandle, mode: FileSystemPermissionMode = 'readwrite') {
  // @ts-ignore types exist in modern TS DOM
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const query = await (handle as any).queryPermission?.({ mode });
  if (query === 'granted') return true;
  // @ts-ignore
  const req = await (handle as any).requestPermission?.({ mode });
  return req === 'granted';
}

export function LocalFileSync() {
  const supported = typeof window !== 'undefined' && 'showSaveFilePicker' in window;
  const exportData = useBubbleStore((s) => s.exportData);
  const importData = useBubbleStore((s) => s.importData);
  const cats = useBubbleStore((s) => s.categories);
  const ppl = useBubbleStore((s) => s.people);

  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [status, setStatus] = useState<string>('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load previously connected handle
  useEffect(() => {
    if (!supported) return;
    (async () => {
      try {
        const h = (await idbGet<FileSystemFileHandle>('fileHandle')) || null;
        if (!h) return;
        const ok = await verifyPermission(h, 'readwrite');
        if (ok) {
          setFileHandle(h);
          localStorage.setItem('bubble-file-connected', '1');
          // Load data from file
          try {
            const f = await h.getFile();
            const text = await f.text();
            const json = JSON.parse(text);
            if (json && typeof json === 'object' && Array.isArray(json.categories) && Array.isArray(json.people)) {
              importData(json);
              setStatus('Loaded from file');
              setTimeout(() => setStatus(''), 2000);
            }
          } catch {}
        } else {
          localStorage.removeItem('bubble-file-connected');
        }
      } catch {}
    })();
  }, [supported, importData]);

  const writeNow = useCallback(async () => {
    if (!fileHandle) return;
    try {
      const w = await fileHandle.createWritable();
      await w.write(JSON.stringify(exportData(), null, 2));
      await w.close();
      setStatus('Saved');
      setTimeout(() => setStatus(''), 1500);
    } catch (e: any) {
      setStatus(e?.message || 'Save failed');
    }
  }, [fileHandle, exportData]);

  // Auto-save on changes
  useEffect(() => {
    if (!fileHandle) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      writeNow();
    }, 600);
    return () => timer.current && clearTimeout(timer.current);
  }, [fileHandle, cats, ppl, writeNow]);

  // Close menu on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!open) return;
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const createNew = async () => {
    try {
      // @ts-ignore
      const handle: FileSystemFileHandle = await (window as any).showSaveFilePicker?.({
        suggestedName: 'bubble-data.json',
        types: [
          { description: 'JSON', accept: { 'application/json': ['.json'] } }
        ]
      });
      if (!handle) return;
      const granted = await verifyPermission(handle, 'readwrite');
      if (!granted) return;
      await idbSet('fileHandle', handle);
      setFileHandle(handle);
      localStorage.setItem('bubble-file-connected', '1');
      await writeNow();
      setOpen(false);
    } catch {}
  };

  const useExisting = async () => {
    try {
      // @ts-ignore
      const [handle]: FileSystemFileHandle[] = await (window as any).showOpenFilePicker?.({
        multiple: false,
        types: [
          { description: 'JSON', accept: { 'application/json': ['.json'] } }
        ]
      });
      if (!handle) return;
      const ok = await verifyPermission(handle, 'readwrite');
      if (!ok) return;
      await idbSet('fileHandle', handle);
      setFileHandle(handle);
      localStorage.setItem('bubble-file-connected', '1');
      // Load immediately
      try {
        const f = await handle.getFile();
        const text = await f.text();
        const json = JSON.parse(text);
        if (json && typeof json === 'object' && Array.isArray(json.categories) && Array.isArray(json.people)) {
          importData(json);
          setStatus('Loaded from file');
          setTimeout(() => setStatus(''), 2000);
        }
      } catch {}
    } catch {}
    setOpen(false);
  };

  const stopSync = async () => {
    setFileHandle(null);
    await idbDel('fileHandle');
    localStorage.removeItem('bubble-file-connected');
    setStatus('Sync stopped');
    setTimeout(() => setStatus(''), 1500);
    setOpen(false);
  };

  if (!supported) return null;

  // Single-button dropdown menu
  return (
    <div className="relative" ref={rootRef}>
      <GlassButton onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        {fileHandle ? 'File Sync: On ▾' : 'File Sync ▾'}
      </GlassButton>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-white/60 bg-white/80 p-1 shadow-xl backdrop-blur">
          {!fileHandle ? (
            <>
              <button
                className="w-full rounded-lg px-3 py-2 text-left font-nav tracking-tight-ui hover:bg-white/70"
                onClick={createNew}
                role="menuitem"
              >
                Create data file
              </button>
              <button
                className="w-full rounded-lg px-3 py-2 text-left font-nav tracking-tight-ui hover:bg-white/70"
                onClick={useExisting}
                role="menuitem"
              >
                Use existing file
              </button>
            </>
          ) : (
            <>
              <button
                className="w-full rounded-lg px-3 py-2 text-left font-nav tracking-tight-ui hover:bg-white/70"
                onClick={async () => { await writeNow(); setOpen(false); }}
                role="menuitem"
              >
                Save now
              </button>
              <button
                className="w-full rounded-lg px-3 py-2 text-left font-nav tracking-tight-ui hover:bg-white/70"
                onClick={stopSync}
                role="menuitem"
              >
                Stop sync
              </button>
            </>
          )}
        </div>
      )}
      {status && <div className="glass absolute -left-4 right-0 mt-2 rounded-xl px-3 py-2 text-sm text-gray-800">{status}</div>}
    </div>
  );
}
