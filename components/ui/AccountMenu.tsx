"use client";

import { useEffect, useRef, useState } from 'react';
import { SyncStatus } from '@/lib/cloud';
import { useBubbleStore } from '@/store/useBubbleStore';
import { GlassButton } from './GlassButton';

type Props = {
  username: string;
  syncStatus: SyncStatus;
  onOpenHelperAccess: () => void;
  onOpenLegacyData: () => void;
};

export function AccountMenu({ username, syncStatus, onOpenHelperAccess, onOpenLegacyData }: Props) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!open) return;
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      const persist = (useBubbleStore as any).persist;
      persist?.clearStorage?.();
      try {
        localStorage.removeItem('bubble-store-v1');
        localStorage.removeItem('bubble-file-connected');
      } catch {}
      window.location.href = '/login';
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <GlassButton type="button" onClick={() => setOpen((prev) => !prev)}>
        Account
      </GlassButton>

      {open ? (
        <div className="glass absolute right-0 top-[calc(100%+10px)] z-40 min-w-[260px] rounded-2xl p-3">
          <div className="rounded-xl bg-white/55 px-3 py-2">
            <div className="text-xs uppercase tracking-[0.16em] text-gray-500">Signed In</div>
            <div className="mt-1 font-nav tracking-tight-ui text-gray-900">{username}</div>
            <div className="mt-2 text-xs text-gray-600">Cloud sync: {syncStatusLabel(syncStatus)}</div>
          </div>

          <div className="mt-3 grid gap-2">
            <GlassButton
              type="button"
              className="justify-start"
              onClick={() => {
                setOpen(false);
                onOpenLegacyData();
              }}
            >
              Legacy Data
            </GlassButton>
            <GlassButton
              type="button"
              className="justify-start"
              onClick={() => {
                setOpen(false);
                onOpenHelperAccess();
              }}
            >
              Helper Access
            </GlassButton>
            <GlassButton type="button" intent="destructive" className="justify-start" onClick={() => void logout()}>
              {loggingOut ? 'Signing Out…' : 'Sign Out'}
            </GlassButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function syncStatusLabel(status: SyncStatus) {
  switch (status) {
    case 'saving':
      return 'Saving';
    case 'conflict':
      return 'Merging updates';
    case 'error':
      return 'Error';
    case 'synced':
      return 'Synced';
    default:
      return 'Starting';
  }
}
