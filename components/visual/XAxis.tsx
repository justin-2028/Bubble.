"use client";
import React, { useLayoutEffect, useMemo, useState } from 'react';
import { Category } from '../../lib/types';
import { categoryTimeLimitDays, clamp, mapToViewportPercent, VIEWPORT_PAD_LEFT, VIEWPORT_PAD_RIGHT } from '../../lib/utils';

type Props = { category?: Category };
const NARROW_LAYOUT_BREAKPOINT_PX = 980;

function niceStep(limit: number) {
  if (limit <= 7) return 1;
  if (limit <= 14) return 2;
  if (limit <= 30) return 5;
  if (limit <= 60) return 10;
  if (limit <= 120) return 15;
  return 30;
}

export function XAxis({ category }: Props) {
  const [vw, setVw] = useState(0);
  useLayoutEffect(() => {
    const onResize = () => {
      const w = typeof window !== 'undefined' ? Math.round(window.innerWidth) : 0;
      setVw((prev) => (prev === w ? prev : w));
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isNarrowLayout = vw > 0 && vw < NARROW_LAYOUT_BREAKPOINT_PX;
  const leftPadPct = VIEWPORT_PAD_LEFT;
  const rightPadPct = isNarrowLayout ? 10 : VIEWPORT_PAD_RIGHT;

  const ticks = useMemo(() => {
    if (!category) return [] as { value: number; xPct: number }[];
    const limit = categoryTimeLimitDays(category);
    const step = niceStep(limit);
    const items: { value: number; xPct: number }[] = [];
    for (let d = 0; d <= limit; d += step) {
      const r = d / limit; // 0..1, 1 is far left
      const xRight = 100 - clamp(r * 100, 0, 100);
      items.push({ value: d, xPct: mapToViewportPercent(xRight, leftPadPct, rightPadPct) });
    }
    // Ensure leftmost (limit) and rightmost (0)
    if (!items.find((t) => t.value === limit)) items.push({ value: limit, xPct: mapToViewportPercent(0, leftPadPct, rightPadPct) });
    if (!items.find((t) => t.value === 0)) items.push({ value: 0, xPct: mapToViewportPercent(100, leftPadPct, rightPadPct) });
    return items.sort((a, b) => a.xPct - b.xPct);
  }, [category, leftPadPct, rightPadPct]);

  if (!category) return null;

  return (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 select-none">
      <div className="relative mb-3 h-12">
        {/* baseline spanning padded domain */}
        <div
          className="absolute bottom-4 h-[2px] bg-black/70"
          style={{ left: `${leftPadPct}%`, right: `${rightPadPct}%` }}
        />
        {ticks.map((t, idx) => (
          <div
            key={idx}
            className="absolute"
            style={{ left: `${t.xPct}%`, bottom: '16px', transform: 'translateX(-50%)' }}
          >
            <div className="h-3 w-[2px] bg-black" />
            <div
              className={`absolute left-1/2 top-full -translate-x-1/2 mt-1 font-code text-black/85 ${
                isNarrowLayout ? 'text-[10px]' : 'text-[11px]'
              }`}
            >
              {t.value}d
            </div>
          </div>
        ))}
        {/* end labels are included via ticks; avoid duplicates */}
      </div>
    </div>
  );
}
