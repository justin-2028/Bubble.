"use client";
import { motion } from 'framer-motion';
import React, { useLayoutEffect, useMemo, useState } from 'react';

type Props = {
  categoryId?: string;
  active?: boolean;
  imageSrc?: string;
  heightPx?: number;
  ringRightPx?: number; // offset from the container's right edge in px
  ringTopPx?: number;   // offset from the container's top edge in px
  showMarker?: boolean; // visual debug helper
  onOpenLeaderboard?: () => void;
};

const NARROW_LAYOUT_BREAKPOINT_PX = 980;
const VERY_NARROW_LAYOUT_BREAKPOINT_PX = 760;

export function BubbleWand({
  categoryId,
  active = false,
  imageSrc = '/wand.png',
  heightPx = 540,
  ringRightPx = 0,
  ringTopPx = 170,
  showMarker = false,
  onOpenLeaderboard,
}: Props) {
  const [hitRect, setHitRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [vw, setVw] = useState(0);
  const [touchCapable, setTouchCapable] = useState(false);

  useLayoutEffect(() => {
    const onResize = () => {
      const w = typeof window !== 'undefined' ? Math.round(window.innerWidth) : 0;
      setVw((prev) => (prev === w ? prev : w));
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useLayoutEffect(() => {
    const pts = typeof navigator !== 'undefined' ? Number((navigator as any).maxTouchPoints ?? 0) : 0;
    setTouchCapable(pts > 0);
  }, []);

  const { scaledHeightPx, scaledWidthPx, scaledRingRightPx, scaledRingTopPx, scaledHitW, scaledHitH, scaledGustTopOffsetPx, isNarrowLayout } =
    useMemo(() => {
      const baseFactor =
        vw > 0 && vw < VERY_NARROW_LAYOUT_BREAKPOINT_PX
          ? 0.66
          : vw > 0 && vw < NARROW_LAYOUT_BREAKPOINT_PX
            ? 0.78
            : 1;
      const isTabletLayout = touchCapable && vw >= 1024 && vw < 1400;
      const tabletFactor = isTabletLayout ? 0.85 : 1;
      const factor = baseFactor * tabletFactor;
      const scaledHeightPx = Math.round(heightPx * factor);
      const scale = scaledHeightPx / Math.max(1, heightPx);
      const baseWidthPx = 320;
      return {
        isNarrowLayout: baseFactor !== 1,
        scaledHeightPx,
        scaledWidthPx: Math.round(baseWidthPx * scale),
        scaledRingRightPx: Math.round(ringRightPx * scale),
        scaledRingTopPx: Math.round(ringTopPx * scale),
        scaledHitW: Math.round(210 * scale),
        scaledHitH: Math.round(240 * scale),
        scaledGustTopOffsetPx: Math.round(98 * scale),
      };
    }, [vw, touchCapable, heightPx, ringRightPx, ringTopPx]);

  useLayoutEffect(() => {
    if (!onOpenLeaderboard) return;
    const ring = document.getElementById('bubble-wand-ring');
    if (!ring) return;
    const compute = () => {
      const rr = ring.getBoundingClientRect();
      const cx = rr.left + rr.width / 2;
      const cy = rr.top + rr.height / 2;
      // Approximate the "white portion" around the ring and cup area.
      const width = scaledHitW;
      const height = scaledHitH;
      setHitRect({
        left: cx - width * 0.7,
        top: cy - height * 0.58,
        width,
        height,
      });
    };
    compute();
    window.addEventListener('resize', compute);
    // Capture scroll from any container; ring position is viewport-based.
    window.addEventListener('scroll', compute, true);
    // Track the wand while it is animating in/out so the hit area stays aligned.
    let raf = 0;
    const start = performance.now();
    const durationMs = active ? 3500 : 1200;
    const tick = () => {
      compute();
      if (performance.now() - start < durationMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const to = setTimeout(compute, 0);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(to);
    };
  }, [categoryId, onOpenLeaderboard, active, scaledHitW, scaledHitH]);

  // Stylized soap wand with wavy inner ring and handle.
  return (
    <>
      {onOpenLeaderboard && hitRect && (
        <button
          type="button"
          aria-label="Open Popping Bubbles leaderboard"
          title="Popping Bubbles"
          onClick={onOpenLeaderboard}
          className="fixed z-30 rounded-[999px] bg-transparent"
          style={{ left: hitRect.left, top: hitRect.top, width: hitRect.width, height: hitRect.height }}
        />
      )}

      <motion.div
        key={categoryId || 'none'}
        className="pointer-events-none absolute right-0 top-1/2 z-20 -translate-y-1/2"
        style={{ right: isNarrowLayout ? '-24px' : '0px' }}
        initial={{ x: 120, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ opacity: 0, x: 80 }}
        transition={{ type: 'spring', stiffness: 120, damping: 16 }}
      >
        <div className="relative" style={{ height: `${scaledHeightPx}px`, width: `${scaledWidthPx}px` }}>
          {/* External image wand */}
          <img
            src={imageSrc}
            alt="Bubble wand"
            className="absolute right-0 top-0 w-auto object-contain"
            style={{ height: `${scaledHeightPx}px` }}
          />

          {/* Invisible marker positioned at ring center (tune percentages if needed) */}
          <div
            id="bubble-wand-ring"
            className={`absolute ${showMarker ? 'bg-red-500/40 rounded-full' : ''}`}
            style={{
              right: `${scaledRingRightPx}px`,
              top: `${scaledRingTopPx}px`,
              width: '14px',
              height: '14px',
              transform: 'translate(50%, -50%)',
            }}
          />

          {/* Emission gust when active */}
          {active && (
            <>
              {[0, 0.2, 0.4].map((delay, i) => (
                <Gust key={i} rightPx={scaledRingRightPx} topPx={scaledRingTopPx - scaledGustTopOffsetPx} delay={delay} />
              ))}
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}

function Gust({ rightPx, topPx, delay = 0 }: { rightPx: number; topPx: number; delay?: number }) {
  const W = 540;
  return (
    <motion.svg
      className="absolute pointer-events-none"
      style={{ right: `${rightPx}px`, top: `${topPx}px` }}
      width={360}
      height={200}
      viewBox={`0 0 360 200`}
      fill="none"
      initial={{ opacity: 0, x: 10, y: 0 }}
      animate={{ opacity: [0, 1, 0.85, 0], x: [-120], y: [-8] }}
      transition={{ duration: 1.4, delay, ease: 'easeOut' }}
    >
      <defs>
        {/* Bright near the wand (right), fading left */}
        <linearGradient id="gustStroke" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id="gustSoft">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1" />
        </filter>
      </defs>
      <g transform={`scale(-1,1) translate(-360,0)`}>
        {/* streams originate at ring center */}
        {/* shorter flowing curves starting at the ring */}
        <motion.path
          d="M340 100 C 300 88, 260 94, 220 104 S 120 126, 20 118"
          stroke="url(#gustStroke)"
          strokeWidth="5"
          fill="none"
          filter="url(#gustSoft)"
          strokeLinecap="round"
          initial={{ pathLength: 0, pathOffset: 1 }}
          animate={{ pathLength: 1, pathOffset: 0 }}
          transition={{ duration: 1.1, delay: delay + 0.05, ease: 'easeOut' }}
        />
        <motion.path
          d="M340 112 C 300 104, 260 110, 215 120 S 110 142, 10 136"
          stroke="url(#gustStroke)"
          strokeWidth="4.2"
          fill="none"
          filter="url(#gustSoft)"
          strokeLinecap="round"
          initial={{ pathLength: 0, pathOffset: 1 }}
          animate={{ pathLength: 1, pathOffset: 0 }}
          transition={{ duration: 1.15, delay: delay + 0.07, ease: 'easeOut' }}
        />
        <motion.path
          d="M340 88 C 302 82, 262 86, 222 96 S 128 114, 24 108"
          stroke="url(#gustStroke)"
          strokeWidth="3.6"
          fill="none"
          filter="url(#gustSoft)"
          strokeLinecap="round"
          initial={{ pathLength: 0, pathOffset: 1 }}
          animate={{ pathLength: 1, pathOffset: 0 }}
          transition={{ duration: 1.2, delay: delay + 0.09, ease: 'easeOut' }}
        />
      </g>
    </motion.svg>
  );
}


/* What each value does

ringRightPx
Distance in pixels from the wand container’s right edge to the marker.
Increase ringRightPx → moves the marker LEFT.
Decrease ringRightPx → moves the marker RIGHT (closer to the image’s right edge).
ringTopPx
Distance in pixels from the wand container’s top edge to the marker.
Increase ringTopPx → moves the marker DOWN.
Decrease ringTopPx → moves the marker UP.
width/height (of the marker)
Size of the invisible target we measure. Doesn’t change the wand; useful only for the debug dot’s size.
transform: 'translate(50%, -50%)'
Shifts the marker box by +50% in X and -50% in Y, so the marker’s center is used as the spawn origin while letting you position it with ringRightPx/topPx at the “center-right” edge of the opening.
You can set it to 'translate(-50%, -50%)' to anchor using left/top instead, but with ringRightPx it’s convenient to keep as is.
Move the entire wand (if needed)

In BubbleWand.tsx, the outer element is absolutely positioned:
className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2"
Adjust right-0 or top-1/2 (e.g., right-4, top-[60%]) to move the wand.
The image size is controlled by heightPx; bump it up to enlarge the wand.
After you adjust ringRightPx and ringTopPx so the red dot sits at the center-right of the ring opening, bubbles will emit precisely from there on load and on category switches.
*/
