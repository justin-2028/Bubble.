"use client";

import React, { useEffect, useState } from 'react';

type Props = {
  minWidthPx?: number;
};

export function DesktopOnlyGate({ minWidthPx = 1024 }: Props) {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${minWidthPx}px)`);
    const onChange = () => setBlocked(!mql.matches);
    const legacy = mql as unknown as {
      addListener?: (listener: () => void) => void;
      removeListener?: (listener: () => void) => void;
    };

    onChange();
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onChange);
    else legacy.addListener?.(onChange);

    return () => {
      if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', onChange);
      else legacy.removeListener?.(onChange);
    };
  }, [minWidthPx]);

  useEffect(() => {
    if (!blocked) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [blocked]);

  if (!blocked) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/70 px-6 backdrop-blur-md" role="dialog" aria-modal="true">
      <div className="glass w-full max-w-md rounded-2xl p-6 text-center">
        <div className="mb-2 font-display text-2xl tracking-tight-ui text-gray-900">Open on a computer</div>
        <div className="text-sm text-gray-700">
          Bubble is designed for larger screens. Please open this site on a laptop/desktop, or expand your browser window.
        </div>
      </div>
    </div>
  );
}
