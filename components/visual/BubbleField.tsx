"use client";
import { motion } from 'framer-motion';
import React, { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { Category, Person } from '../../lib/types';
import {
  xPercentFromPerson,
  clamp,
  mapToViewportPercent,
  WAND_RING_OFFSET_PX,
  categoryTimeLimitDays,
  daysSince,
} from '../../lib/utils';
import dynamic from 'next/dynamic';

type Props = {
  category?: Category;
  people: Person[];
  onEditPerson: (id: string) => void;
  entranceActive?: boolean;
  entranceSeed?: number;
};

type BubbleLane = {
  ids: string[];
  endX: number;
  upPx: number;
  downPx: number;
};

type BubbleLayout = {
  yPctById: Record<string, number>;
  scale: number;
};

function hashToUint32(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LABEL_MARGIN_PX = 8; // tailwind mt-2
// Minimum gap between any two bubble+label blocks.
const GAP_PX = 14;
// Additional padding to account for bubble shadows/blur so "visual overlap" is avoided.
const BUBBLE_VISUAL_PAD_PX = 28;
// Final-position variance (still non-overlapping).
const FINAL_Y_VARIANCE_MAX_PX = 8;
const FINAL_Y_VARIANCE_SLACK_MULT = 0.35;
const SAFE_TOP_PX = 92; // keeps clear of top nav
const SAFE_BOTTOM_PX = 92; // keeps clear of x-axis + bottom UI
const MIN_SCALE = 0.62;

export function BubbleField({ category, people, onEditPerson, entranceActive = false, entranceSeed = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [wandOrigin, setWandOrigin] = useState<{ x: number; y: number } | null>(null);
  const [layoutByCategory, setLayoutByCategory] = useState<Record<string, BubbleLayout>>({});
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [entranceToken, setEntranceToken] = useState<number>(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBounds({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-trigger entrance animation when entrance begins, but avoid re-mounting when it ends (prevents "blink").
  useLayoutEffect(() => {
    if (!entranceActive) return;
    setEntranceToken(entranceSeed);
  }, [entranceActive, entranceSeed]);

  // Measure wand ring center relative to the container for spawn + baseline clustering.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const ring = document.getElementById('bubble-wand-ring');
    if (!container || !ring) return;
    const compute = () => {
      const cr = container.getBoundingClientRect();
      const rr = ring.getBoundingClientRect();
      // Use the center of the marker element
      const cx = rr.left + rr.width / 2;
      const cy = rr.top + rr.height / 2;
      setWandOrigin({ x: cx - cr.left, y: cy - cr.top });
    };
    compute();
    window.addEventListener('resize', compute);
    const to = setTimeout(compute, 0);
    return () => {
      window.removeEventListener('resize', compute);
      clearTimeout(to);
    };
  }, [category?.id]);

  const { baseBubbleVmin, baseLabelPx } = useMemo(() => {
    const count = Math.max(1, people.length);
    // Estimate bubble diameter based on available area; clamp for UX
    // Rough heuristic: 8–14vmin depending on count
    const baseVmin = clamp(14 - Math.log2(count + 1) * 2.2, 8, 14);
    const labelPx = clamp(16 + (20 - count), 16, 20);
    return { baseBubbleVmin: baseVmin, baseLabelPx: labelPx };
  }, [people.length]);

  const categoryKey = category?.id ?? 'none';
  const layout = category && layoutByCategory[categoryKey] ? layoutByCategory[categoryKey] : null;
	  const layoutScale = layout?.scale ?? 1;
	  const bubbleVmin = baseBubbleVmin * layoutScale;
	  const labelPx = baseLabelPx * layoutScale;
	  const varianceSlackMultiplier = FINAL_Y_VARIANCE_SLACK_MULT;
	  const varianceMaxPx = FINAL_Y_VARIANCE_MAX_PX;

  useLayoutEffect(() => {
    if (!category || !bounds.width || !bounds.height || people.length === 0) {
      return;
    }

    const minDim = Math.min(bounds.width, bounds.height);
    const vminPx = minDim / 100;
    const bubbleSizePx = baseBubbleVmin * vminPx * layoutScale;
    const bubbleRadiusPx = bubbleSizePx / 2;
    const visualPadPx = BUBBLE_VISUAL_PAD_PX * layoutScale;
    const labelMarginPx = LABEL_MARGIN_PX * layoutScale;

    const labelHeightsPx: Record<string, number> = {};
    for (const p of people) {
      const el = labelRefs.current[p.id];
      if (!el) return; // wait for refs
      const h = el.getBoundingClientRect().height;
      labelHeightsPx[p.id] = Number.isFinite(h) ? h : labelPx * 1.2;
    }

    const safeTop = Math.min(SAFE_TOP_PX, bounds.height * 0.22);
    const safeBottom = Math.min(SAFE_BOTTOM_PX, bounds.height * 0.24);
    const topBound = safeTop;
    const bottomBound = bounds.height - safeBottom;
    const baselineY = clamp(wandOrigin?.y ?? bounds.height * 0.42, topBound, bottomBound);

	    const nodes = people.map((p) => {
	      const xRightPercent = xPercentFromPerson(p, category);
	      const xPx = (mapToViewportPercent(xRightPercent) / 100) * bounds.width;
	      const halfW = bubbleRadiusPx + visualPadPx;
      return {
        id: p.id,
        xPx,
        startX: xPx - halfW,
        endX: xPx + halfW,
        upPx: bubbleRadiusPx + visualPadPx,
	        downPx: bubbleRadiusPx + visualPadPx + labelMarginPx + (labelHeightsPx[p.id] ?? 0),
	      };
	    }).sort((a, b) => (a.startX - b.startX) || a.id.localeCompare(b.id));
	    const nodeById: Record<string, { id: string; xPx: number; startX: number; endX: number; upPx: number; downPx: number }> =
	      Object.fromEntries(nodes.map((n) => [n.id, n]));

    // Greedy interval graph coloring -> lanes (same lane never overlaps in X).
    const lanes: BubbleLane[] = [];
    const nodeLane: Record<string, number> = {};
    for (const n of nodes) {
      let assigned = -1;
      for (let li = 0; li < lanes.length; li++) {
        if (n.startX >= lanes[li].endX + GAP_PX) {
          assigned = li;
          break;
        }
      }
      if (assigned === -1) {
        assigned = lanes.length;
        lanes.push({ ids: [], endX: -Infinity, upPx: 0, downPx: 0 });
      }
      const lane = lanes[assigned];
      lane.ids.push(n.id);
      lane.endX = Math.max(lane.endX, n.endX);
      lane.upPx = Math.max(lane.upPx, n.upPx);
      lane.downPx = Math.max(lane.downPx, n.downPx);
      nodeLane[n.id] = assigned;
    }

    // Assign lane vertical "slots" around the baseline: 0, -1, +1, -2, +2...
    const laneToSlot: Record<number, number> = {};
    for (let i = 0; i < lanes.length; i++) {
      if (i === 0) laneToSlot[i] = 0;
      else if (i % 2 === 1) laneToSlot[i] = -Math.ceil(i / 2);
      else laneToSlot[i] = Math.ceil(i / 2);
    }

	    const slotToLane: Record<number, number> = Object.fromEntries(Object.entries(laneToSlot).map(([laneIdx, slot]) => [slot, Number(laneIdx)]));
	    const maxUpSlots = Math.max(0, ...Object.values(laneToSlot).map((s) => -Math.min(0, s)));
	    const maxDownSlots = Math.max(0, ...Object.values(laneToSlot).map((s) => Math.max(0, s)));

	    const computeLaneY = (inflatePx: number) => {
	      const laneUp = lanes.map((l) => l.upPx + inflatePx);
	      const laneDown = lanes.map((l) => l.downPx + inflatePx);
	      const laneY: Record<number, number> = {};
	      laneY[0] = baselineY;

	      // Place above baseline
	      for (let s = 1; s <= maxUpSlots; s++) {
	        const laneIdx = slotToLane[-s];
	        const belowLaneIdx = slotToLane[-(s - 1)];
	        const belowY = laneY[belowLaneIdx];
	        const belowUp = laneUp[belowLaneIdx] ?? bubbleRadiusPx;
	        const thisDown = laneDown[laneIdx] ?? bubbleRadiusPx;
	        laneY[laneIdx] = belowY - (belowUp + thisDown + GAP_PX);
	      }

	      // Place below baseline
	      for (let s = 1; s <= maxDownSlots; s++) {
	        const laneIdx = slotToLane[s];
	        const aboveLaneIdx = slotToLane[s - 1];
	        const aboveY = laneY[aboveLaneIdx];
	        const aboveDown = laneDown[aboveLaneIdx] ?? bubbleRadiusPx;
	        const thisUp = laneUp[laneIdx] ?? bubbleRadiusPx;
	        laneY[laneIdx] = aboveY + (aboveDown + thisUp + GAP_PX);
	      }

	      let clusterTop = Infinity;
	      let clusterBottom = -Infinity;
	      for (let li = 0; li < lanes.length; li++) {
	        const y = laneY[li];
	        clusterTop = Math.min(clusterTop, y - (laneUp[li] ?? 0));
	        clusterBottom = Math.max(clusterBottom, y + (laneDown[li] ?? 0));
	      }
	      return { laneY, laneUp, laneDown, clusterTop, clusterBottom };
	    };

	    const availableHeight = bottomBound - topBound;
	    // 1) Decide scale based on the tight (no-variance) packing.
	    const tight = computeLaneY(0);
	    const tightHeight = tight.clusterBottom - tight.clusterTop;
	    const nextScale = clamp(layoutScale * (availableHeight / tightHeight) * 0.98, MIN_SCALE, 1);
	    if (Math.abs(nextScale - layoutScale) > 0.01) {
	      // Keep the previous y-map to avoid a single-frame opacity drop while we recompute at the new scale.
	      setLayoutByCategory((prev) => ({
	        ...prev,
	        [category.id]: { yPctById: prev[category.id]?.yPctById ?? {}, scale: nextScale }
	      }));
	      return;
	    }

	    // 2) After scale is stable, spend remaining slack on safe per-bubble final Y variance.
	    const slackHeight = Math.max(0, availableHeight - tightHeight);
	    const requestedInflatePx = clamp(
	      (slackHeight / Math.max(1, lanes.length)) * varianceSlackMultiplier,
	      0,
	      varianceMaxPx * layoutScale
	    );

	    // Cap inflate so the reserved layout still fits without forcing an additional shrink.
	    let inflatePx = requestedInflatePx;
	    if (inflatePx > 0) {
	      const reservedTry = computeLaneY(inflatePx);
	      const reservedHeightTry = reservedTry.clusterBottom - reservedTry.clusterTop;
	      if (reservedHeightTry > availableHeight) {
	        let lo = 0;
	        let hi = inflatePx;
	        for (let iter = 0; iter < 18; iter++) {
	          const mid = (lo + hi) / 2;
	          const h = computeLaneY(mid);
	          const height = h.clusterBottom - h.clusterTop;
	          if (height <= availableHeight) lo = mid;
	          else hi = mid;
	        }
	        inflatePx = lo;
	      }
	    }

	    const reserved = computeLaneY(inflatePx);
	    const laneY = reserved.laneY;
	    const laneUp = reserved.laneUp;
	    const laneDown = reserved.laneDown;
	    let clusterTop = reserved.clusterTop;
	    let clusterBottom = reserved.clusterBottom;
	    const clusterHeight = clusterBottom - clusterTop;

	    const shiftDown = topBound - clusterTop; // positive => move down
	    const shiftUp = clusterBottom - bottomBound; // positive => move up
	    let shift = 0;
    if (shiftDown > 0 && shiftUp > 0) {
      // Still too tall at this scale; force smallest allowed scale.
      if (layoutScale !== MIN_SCALE) {
        setLayoutByCategory((prev) => ({
          ...prev,
          [category.id]: { yPctById: prev[category.id]?.yPctById ?? {}, scale: MIN_SCALE }
        }));
      }
      return;
    } else if (shiftDown > 0) {
      shift = shiftDown;
    } else if (shiftUp > 0) {
      shift = -shiftUp;
    }
    if (shift !== 0) {
      for (let li = 0; li < lanes.length; li++) laneY[li] += shift;
    }

	    const yPctById: Record<string, number> = {};
	    for (const p of people) {
	      const li = nodeLane[p.id] ?? 0;
	      const node = nodeById[p.id];
	      const slackUp = Math.max(0, (laneUp[li] ?? 0) - (node?.upPx ?? 0));
	      const slackDown = Math.max(0, (laneDown[li] ?? 0) - (node?.downPx ?? 0));
	      const maxUp = Math.min(inflatePx, slackUp);
	      const maxDown = Math.min(inflatePx, slackDown);
	      const u = mulberry32(hashToUint32(`${category.id}:${entranceToken}:${p.id}:finalY`))();
	      const delta = clamp(u * (maxDown + maxUp) - maxUp, -maxUp, maxDown);
	      yPctById[p.id] = clamp(((laneY[li] + delta) / bounds.height) * 100, 0, 100);
	    }

    setLayoutByCategory((prev) => ({
      ...prev,
      [category.id]: { yPctById, scale: layoutScale }
    }));
	  }, [
	    people,
	    category,
	    bounds.width,
	    bounds.height,
	    wandOrigin,
	    baseBubbleVmin,
	    baseLabelPx,
	    layoutScale,
	    labelPx,
	    entranceToken,
	    varianceSlackMultiplier,
	    varianceMaxPx
	  ]);

  const enable3D = process.env.NEXT_PUBLIC_BUBBLE_3D === '1';

  return (
    <div ref={containerRef} className="absolute inset-0" aria-label="Bubble field">
      {people.map((p, i) => {
        const xRightPercent = category ? xPercentFromPerson(p, category) : 100;
        // Trigger warning ring starting 3 days before the limit, swap to a red X when overdue
        let isWarning = false;
        let isOverdue = false;
        if (category) {
          const limitDays = categoryTimeLimitDays(category);
          const lastMs = Date.parse(p.lastInteraction as any);
          const last = Number.isFinite(lastMs) ? new Date(lastMs) : new Date();
          const daysAgo = Math.max(0, daysSince(new Date(), last));
          const dangerStart = Math.max(0, limitDays - 3);
          isOverdue = daysAgo >= limitDays;
          isWarning = daysAgo >= dangerStart && daysAgo < limitDays;
        }
        const y =
          typeof layout?.yPctById?.[p.id] === 'number'
            ? layout!.yPctById[p.id]
            : clamp(((wandOrigin?.y ?? (bounds.height || 1) * 0.42) / Math.max(1, bounds.height || 1)) * 100, 0, 100);
        const cw = bounds.width || (containerRef.current?.getBoundingClientRect().width ?? 0);
        const ch = bounds.height || (containerRef.current?.getBoundingClientRect().height ?? (typeof window !== 'undefined' ? window.innerHeight : 0));
        const targetLeftPx = cw * (mapToViewportPercent(xRightPercent) / 100);
        const targetTopPx = ch * (y / 100);
        const spawnLeftPx = (wandOrigin?.x ?? (cw - WAND_RING_OFFSET_PX));
        const spawnTopPx = (wandOrigin?.y ?? ch * 0.5);
        const nameStyle = { fontSize: `${labelPx}px` } as React.CSSProperties;

	        return (
	          <motion.div
            key={`${p.id}-${entranceToken}`}
            className="absolute"
            style={{ transform: 'translate(-50%, -50%)' }}
            initial={{
              left: entranceActive ? spawnLeftPx : targetLeftPx,
              top: entranceActive ? spawnTopPx : targetTopPx,
              scale: entranceActive ? 0.1 : 0.6,
              opacity: 0
            }}
	            animate={{
	              left: targetLeftPx,
	              top: targetTopPx,
	              scale: entranceActive ? [0.1, 0.95, 1] : 1,
	              opacity: layout?.yPctById && Object.prototype.hasOwnProperty.call(layout.yPctById, p.id) ? 1 : 0
	            }}
	            transition={{
	              type: entranceActive ? 'tween' : 'spring',
	              ease: entranceActive ? [0.16, 1, 0.3, 1] : undefined,
	              duration: entranceActive ? (2.2 + (i % 3) * 0.4) : undefined,
	              scale: entranceActive ? { duration: (2.2 + (i % 3) * 0.4), times: [0, 0.35, 1], ease: 'easeOut' } : undefined,
	              top: entranceActive ? { duration: (2.2 + (i % 3) * 0.4), ease: [0.16, 1, 0.3, 1] } : undefined,
	              stiffness: entranceActive ? undefined : 600,
	              damping: entranceActive ? undefined : 32,
	              mass: entranceActive ? undefined : 0.6
	            }}
          >
            <div className="flex flex-col items-center">
              <button
                type="button"
                className={`bubble ${enable3D ? 'bubble-3d' : ''} ${isWarning ? 'bubble-danger' : ''}`}
                style={{ width: `${bubbleVmin}vmin`, height: `${bubbleVmin}vmin` }}
                onClick={(e) => onEditPerson(p.id)}
              >
                {/* Render mode: 3D or CSS + image fill */}
                {enable3D ? (
                  <div className="absolute inset-0 rounded-full overflow-hidden">
                    <Bubble3DClient imageUrl={p.image} gradientColors={category?.gradientColors} />
                  </div>
                ) : (
                  p.image && (
                    <div className="absolute inset-1 rounded-full overflow-hidden">
                      <img src={p.image} alt={p.fullName} className="h-full w-full object-cover" />
                    </div>
                  )
                )}
                {isOverdue && (
                  <div className="bubble-overdue" aria-hidden="true">
                    <span />
                  </div>
                )}
              </button>
              <div className="mt-2 text-center" style={{ width: `${bubbleVmin}vmin` }}>
                <div
                  ref={(el) => {
                    labelRefs.current[p.id] = el;
                  }}
                  className="font-body tracking-tight-ui text-gray-800 leading-snug"
                  style={nameStyle}
                >
                  {p.fullName}
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// Dynamically load the 3D bubble to avoid SSR + ensure WebGL only on client
const Bubble3DClient = dynamic(() => import('./Bubble3D').then(m => m.Bubble3D), { ssr: false });
