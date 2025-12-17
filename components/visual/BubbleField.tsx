"use client";
import { motion } from 'framer-motion';
import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { Category, Person } from '../../lib/types';
import {
  xPercentFromPerson,
  clamp,
  mapToViewportPercent,
  VIEWPORT_PAD_LEFT,
  VIEWPORT_PAD_RIGHT,
  WAND_RING_OFFSET_PX,
  categoryTimeLimitDays,
  daysSince,
} from '../../lib/utils';
import dynamic from 'next/dynamic';
import { BulkEditPeopleModal } from '../ui/modals/BulkEditPeopleModal';

type Props = {
  category?: Category;
  people: Person[];
  onEditPerson: (id: string) => void;
  entranceActive?: boolean;
  entranceSeed?: number;
  keyboardShortcutsEnabled?: boolean;
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
const NARROW_LAYOUT_BREAKPOINT_PX = 980;

export function BubbleField({
  category,
  people,
  onEditPerson,
  entranceActive = false,
  entranceSeed = 0,
  keyboardShortcutsEnabled = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [wandOrigin, setWandOrigin] = useState<{ x: number; y: number } | null>(null);
  const [layoutByCategory, setLayoutByCategory] = useState<Record<string, BubbleLayout>>({});
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [labelFitScaleXById, setLabelFitScaleXById] = useState<Record<string, number>>({});
  const [entranceToken, setEntranceToken] = useState<number>(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [showDaysOverlay, setShowDaysOverlay] = useState(false);

  useEffect(() => {
    setSelectedIds([]);
    setBulkOpen(false);
  }, [category?.id]);

  // Spacebar toggles an overlay showing days since last interaction (only when not editing).
  useEffect(() => {
    if (!keyboardShortcutsEnabled) return;
    if (bulkOpen || selectedIds.length > 0) return;

    const isEditableTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      setShowDaysOverlay((v) => !v);
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keyboardShortcutsEnabled, bulkOpen, selectedIds.length]);

  useEffect(() => {
    if (!keyboardShortcutsEnabled || bulkOpen || selectedIds.length > 0) setShowDaysOverlay(false);
  }, [keyboardShortcutsEnabled, bulkOpen, selectedIds.length]);

  useEffect(() => {
    const idSet = new Set(people.map((p) => p.id));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => idSet.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [people]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      // Prevent split-screen subpixel thrash from triggering cascading layout updates.
      const width = Math.round(r.width);
      const height = Math.round(r.height);
      setBounds((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
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
    const isNarrowLayout = bounds.width > 0 && bounds.width < NARROW_LAYOUT_BREAKPOINT_PX;
    const viewportLeftPadPct = VIEWPORT_PAD_LEFT;
    // In narrow layouts, shrink the wand and reclaim a bit of horizontal domain for the x-axis.
    const viewportRightPadPct = isNarrowLayout ? 10 : VIEWPORT_PAD_RIGHT;

  useLayoutEffect(() => {
    if (!category || !bounds.width || !bounds.height || people.length === 0) return;

    const safeTop = Math.min(SAFE_TOP_PX, bounds.height * 0.22);
    const safeBottom = Math.min(SAFE_BOTTOM_PX, bounds.height * 0.24);
    const topBound = safeTop;
    const bottomBound = bounds.height - safeBottom;
    const baselineY = clamp(wandOrigin?.y ?? bounds.height * 0.42, topBound, bottomBound);
    const availableHeight = bottomBound - topBound;
    if (!Number.isFinite(availableHeight) || availableHeight <= 1) return;

    const minDim = Math.min(bounds.width, bounds.height);
    const vminPx = minDim / 100;

    const lineHeightMult = 1.35; // matches leading-snug closely, but stays stable
    const lineCountForPerson = (fullName: string) => (/\s/.test(fullName.trim()) ? 2 : 1);

    // Solve scale in-place to avoid state-driven oscillations (especially in split-screen).
    let scale = clamp(layoutScale, MIN_SCALE, 1);
    for (let iter = 0; iter < 8; iter++) {
      const bubbleSizePx = baseBubbleVmin * vminPx * scale;
      const bubbleRadiusPx = bubbleSizePx / 2;
      const visualPadPx = BUBBLE_VISUAL_PAD_PX * scale;
      const labelMarginPx = LABEL_MARGIN_PX * scale;
      const labelPxScaled = baseLabelPx * scale;

      const nodes = people.map((p) => {
        const xRightPercent = xPercentFromPerson(p, category);
        const xPx = (mapToViewportPercent(xRightPercent, viewportLeftPadPct, viewportRightPadPct) / 100) * bounds.width;
        const halfW = bubbleRadiusPx + visualPadPx;
        const labelHeightPx = labelPxScaled * lineHeightMult * lineCountForPerson(p.fullName);
        return {
          id: p.id,
          startX: xPx - halfW,
          endX: xPx + halfW,
          upPx: bubbleRadiusPx + visualPadPx,
          downPx: bubbleRadiusPx + visualPadPx + labelMarginPx + labelHeightPx,
        };
      }).sort((a, b) => (a.startX - b.startX) || a.id.localeCompare(b.id));

      const lanes: BubbleLane[] = [];
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
      }

      const laneToSlot: Record<number, number> = {};
      for (let i = 0; i < lanes.length; i++) {
        if (i === 0) laneToSlot[i] = 0;
        else if (i % 2 === 1) laneToSlot[i] = -Math.ceil(i / 2);
        else laneToSlot[i] = Math.ceil(i / 2);
      }
      const slotToLane: Record<number, number> = Object.fromEntries(Object.entries(laneToSlot).map(([laneIdx, slot]) => [slot, Number(laneIdx)]));
      const maxUpSlots = Math.max(0, ...Object.values(laneToSlot).map((s) => -Math.min(0, s)));
      const maxDownSlots = Math.max(0, ...Object.values(laneToSlot).map((s) => Math.max(0, s)));

      const laneUp = lanes.map((l) => l.upPx);
      const laneDown = lanes.map((l) => l.downPx);
      const laneY: Record<number, number> = {};
      laneY[0] = baselineY;

      for (let s = 1; s <= maxUpSlots; s++) {
        const laneIdx = slotToLane[-s];
        const belowLaneIdx = slotToLane[-(s - 1)];
        const belowY = laneY[belowLaneIdx];
        const belowUp = laneUp[belowLaneIdx] ?? bubbleRadiusPx;
        const thisDown = laneDown[laneIdx] ?? bubbleRadiusPx;
        laneY[laneIdx] = belowY - (belowUp + thisDown + GAP_PX);
      }
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
      const tightHeight = clusterBottom - clusterTop;
      if (!Number.isFinite(tightHeight) || tightHeight <= 1) break;

      const next = Math.round(clamp(scale * (availableHeight / tightHeight) * 0.98, MIN_SCALE, 1) * 100) / 100;
      if (Math.abs(next - scale) <= 0.01) {
        scale = next;
        break;
      }
      scale = next;
    }

    // With scale solved, compute full layout with variance.
    const bubbleSizePx = baseBubbleVmin * vminPx * scale;
    const bubbleRadiusPx = bubbleSizePx / 2;
    const visualPadPx = BUBBLE_VISUAL_PAD_PX * scale;
    const labelMarginPx = LABEL_MARGIN_PX * scale;
    const labelPxScaled = baseLabelPx * scale;

    const nodes = people.map((p) => {
      const xRightPercent = xPercentFromPerson(p, category);
      const xPx = (mapToViewportPercent(xRightPercent, viewportLeftPadPct, viewportRightPadPct) / 100) * bounds.width;
      const halfW = bubbleRadiusPx + visualPadPx;
      const labelHeightPx = labelPxScaled * lineHeightMult * lineCountForPerson(p.fullName);
      return {
        id: p.id,
        xPx,
        startX: xPx - halfW,
        endX: xPx + halfW,
        upPx: bubbleRadiusPx + visualPadPx,
        downPx: bubbleRadiusPx + visualPadPx + labelMarginPx + labelHeightPx,
      };
    }).sort((a, b) => (a.startX - b.startX) || a.id.localeCompare(b.id));
    const nodeById: Record<string, { id: string; xPx: number; startX: number; endX: number; upPx: number; downPx: number }> =
      Object.fromEntries(nodes.map((n) => [n.id, n]));

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

      for (let s = 1; s <= maxUpSlots; s++) {
        const laneIdx = slotToLane[-s];
        const belowLaneIdx = slotToLane[-(s - 1)];
        const belowY = laneY[belowLaneIdx];
        const belowUp = laneUp[belowLaneIdx] ?? bubbleRadiusPx;
        const thisDown = laneDown[laneIdx] ?? bubbleRadiusPx;
        laneY[laneIdx] = belowY - (belowUp + thisDown + GAP_PX);
      }
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

    const tight = computeLaneY(0);
    const tightHeight = tight.clusterBottom - tight.clusterTop;
    const slackHeight = Math.max(0, availableHeight - tightHeight);
    const requestedInflatePx = clamp(
      (slackHeight / Math.max(1, lanes.length)) * varianceSlackMultiplier,
      0,
      varianceMaxPx * scale
    );

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

    const shiftDown = topBound - clusterTop;
    const shiftUp = clusterBottom - bottomBound;
    let shift = 0;
    if (shiftDown > 0 && shiftUp > 0) {
      scale = MIN_SCALE;
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

    setLayoutByCategory((prev) => {
      const prevEntry = prev[category.id];
      const prevScale = prevEntry?.scale ?? 1;
      const nextScale = Math.round(scale * 100) / 100;
      const prevMap = prevEntry?.yPctById ?? {};
      if (Math.abs(prevScale - nextScale) <= 0.001) {
        const keysA = Object.keys(prevMap);
        const keysB = Object.keys(yPctById);
        if (keysA.length === keysB.length) {
          let same = true;
          for (const k of keysB) {
            if (Math.abs((prevMap as any)[k] - (yPctById as any)[k]) > 0.001) { same = false; break; }
          }
          if (same) return prev;
        }
      }
      return { ...prev, [category.id]: { yPctById, scale: nextScale } };
    });
  }, [
    people,
    category,
    bounds.width,
    bounds.height,
    wandOrigin,
    baseBubbleVmin,
    baseLabelPx,
    layoutScale,
    entranceToken,
    varianceSlackMultiplier,
    varianceMaxPx,
    viewportLeftPadPct,
    viewportRightPadPct,
  ]);

  // Keep single-word names on one line by horizontally scaling the glyphs to fit.
  useLayoutEffect(() => {
    if (!bounds.width || !bounds.height || people.length === 0) return;
    setLabelFitScaleXById((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of people) {
        const trimmed = (p.fullName ?? '').trim();
        const isMultiWord = /\s/.test(trimmed);
        if (isMultiWord) {
          if (prev[p.id] && Math.abs((prev[p.id] ?? 1) - 1) > 0.01) {
            next[p.id] = 1;
            changed = true;
          }
          continue;
        }
        const el = labelRefs.current[p.id];
        if (!el) continue; // wait for refs
        const cw = el.clientWidth || 1;
        const sw = el.scrollWidth || cw;
        // Slight safety margin to prevent rounding issues.
        const neededScale = (cw / Math.max(1, sw)) * 0.98;
        const quantized = Math.round(clamp(neededScale, 0.55, 1) * 100) / 100;
        const prevScale = prev[p.id] ?? 1;
        if (Math.abs(quantized - prevScale) > 0.01) {
          next[p.id] = quantized;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [people, bounds.width, bounds.height]);

  const enable3D = process.env.NEXT_PUBLIC_BUBBLE_3D === '1';
  const selectedPeople = useMemo(() => {
    if (selectedIds.length === 0) return [];
    const byId = new Map(people.map((p) => [p.id, p]));
    return selectedIds.map((id) => byId.get(id)).filter(Boolean) as Person[];
  }, [people, selectedIds]);

  return (
    <div ref={containerRef} className="absolute inset-0" aria-label="Bubble field">
      <BulkEditPeopleModal
        open={bulkOpen}
        selectedPeople={selectedPeople}
        currentCategory={category}
        onClearSelection={() => {
          setSelectedIds([]);
          setBulkOpen(false);
        }}
      />
      {people.map((p, i) => {
        const xRightPercent = category ? xPercentFromPerson(p, category) : 100;
        // Trigger warning ring starting 3 days before the limit, swap to a red X when overdue
        let isWarning = false;
        let isOverdue = false;
        const lastMs = Date.parse(p.lastInteraction as any);
        const last = Number.isFinite(lastMs) ? new Date(lastMs) : new Date();
        const daysAgo = Math.max(0, daysSince(new Date(), last));
        const daysAgoInt = Math.floor(daysAgo + 1e-6);
        if (category) {
          const limitDays = categoryTimeLimitDays(category);
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
        const targetLeftPx = cw * (mapToViewportPercent(xRightPercent, viewportLeftPadPct, viewportRightPadPct) / 100);
        const targetTopPx = ch * (y / 100);
	        const spawnLeftPx = (wandOrigin?.x ?? (cw - WAND_RING_OFFSET_PX));
	        const spawnTopPx = (wandOrigin?.y ?? ch * 0.5);
	        const fitScaleX = labelFitScaleXById[p.id] ?? 1;
	        const nameStyle = { fontSize: `${labelPx}px` } as React.CSSProperties;
          const trimmedName = (p.fullName ?? '').trim();
          const isMultiWord = /\s/.test(trimmedName);
          const shouldScaleX = !isMultiWord;
          const [firstName, restName] = isMultiWord ? splitNameTwoLines(trimmedName) : [trimmedName, ''];

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
	                className={`bubble ${enable3D ? 'bubble-3d' : ''} ${isWarning ? 'bubble-danger' : ''} ${selectedIds.includes(p.id) ? 'ring-4 ring-sky-300/60 ring-offset-2 ring-offset-white/40' : ''}`}
	                style={{ width: `${bubbleVmin}vmin`, height: `${bubbleVmin}vmin` }}
	                onClick={(e) => {
	                  if (e.shiftKey) {
	                    e.preventDefault();
	                    e.stopPropagation();
	                    setShowDaysOverlay(false);
	                    setSelectedIds((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]));
	                    return;
	                  }
	                  if (selectedIds.length > 0) {
	                    if (selectedIds.includes(p.id)) {
	                      setBulkOpen(true);
	                      return;
	                    }
	                    setSelectedIds([]);
	                  }
	                  onEditPerson(p.id);
	                }}
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
                {showDaysOverlay && (
                  <div
                    className="absolute inset-0 flex items-center justify-center rounded-full border border-white/60 bg-white/65 backdrop-blur-lg pointer-events-none select-none"
                    style={{ zIndex: 10 }}
                    aria-hidden="true"
                  >
                    <div className="flex flex-col items-center justify-center">
                      <div
                        className="font-display tracking-tight-ui leading-none"
                        style={{
                          color: 'rgb(220 38 38 / 0.9)',
                          fontSize: `calc(${bubbleVmin}vmin * 0.42)`,
                        }}
                      >
                        {daysAgoInt}
                      </div>
                      <div
                        className="font-code leading-none"
                        style={{
                          color: 'rgb(220 38 38 / 0.85)',
                          fontSize: `calc(${bubbleVmin}vmin * 0.14)`,
                          marginTop: `calc(${bubbleVmin}vmin * 0.03)`,
                        }}
                      >
                        days
                      </div>
                    </div>
                  </div>
                )}
              </button>
		              <div className="mt-2 text-center" style={{ width: `${bubbleVmin}vmin` }}>
                    {isMultiWord ? (
                      <div className="font-body tracking-tight-ui text-gray-800 leading-snug" style={nameStyle}>
                        <div className="truncate">{firstName}</div>
                        <div className="truncate">{restName}</div>
                      </div>
                    ) : (
                      <div
                        ref={(el) => {
                          labelRefs.current[p.id] = el;
                        }}
                        className="font-body tracking-tight-ui text-gray-800 leading-snug truncate"
                        style={nameStyle}
                      >
                        <span
                          className="inline-block"
                          style={{
                            transform: shouldScaleX ? `scaleX(${fitScaleX})` : undefined,
                            transformOrigin: 'center',
                          }}
                        >
                          {trimmedName}
                        </span>
                      </div>
                    )}
		              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function splitNameTwoLines(fullName: string): [string, string] {
  const trimmed = (fullName ?? '').trim();
  const idx = trimmed.search(/\s/);
  if (idx === -1) return [trimmed, ''];
  const first = trimmed.slice(0, idx).trim();
  const rest = trimmed.slice(idx).trim().replace(/\s+/g, ' ');
  return [first || trimmed, rest];
}

// Dynamically load the 3D bubble to avoid SSR + ensure WebGL only on client
const Bubble3DClient = dynamic(() => import('./Bubble3D').then(m => m.Bubble3D), { ssr: false });
