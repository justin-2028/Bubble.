"use client";
import { motion } from 'framer-motion';
import React, { useMemo, useCallback, useRef, useState, useLayoutEffect } from 'react';
import { Category, Person } from '../../lib/types';
import { horizontalRatio, xPercentFromPerson, clamp, mapToViewportPercent, WAND_RING_OFFSET_PX } from '../../lib/utils';
import { FluidGlass } from './FluidGlass';
import { useBubbleStore } from '../../store/useBubbleStore';

type Props = {
  category?: Category;
  people: Person[];
  onEditPerson: (id: string) => void;
  entranceActive?: boolean;
  entranceSeed?: number;
};

export function BubbleField({ category, people, onEditPerson, entranceActive = false, entranceSeed = 0 }: Props) {
  const { updatePerson } = useBubbleStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState<Record<string, number>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [bounds, setBounds] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [entranceOrigin, setEntranceOrigin] = useState<{ x: number; y: number } | null>(null);

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

  // Measure wand ring center relative to the container for accurate spawn
  useLayoutEffect(() => {
    if (!entranceActive) return;
    const container = containerRef.current;
    const ring = document.getElementById('bubble-wand-ring');
    if (!container || !ring) return;
    const compute = () => {
      const cr = container.getBoundingClientRect();
      const rr = ring.getBoundingClientRect();
      // Use the center of the marker element
      const cx = rr.left + rr.width / 2;
      const cy = rr.top + rr.height / 2;
      setEntranceOrigin({ x: cx - cr.left, y: cy - cr.top });
    };
    compute();
    window.addEventListener('resize', compute);
    const to = setTimeout(compute, 0);
    return () => {
      window.removeEventListener('resize', compute);
      clearTimeout(to);
    };
  }, [entranceActive]);

  const { radius, labelSize } = useMemo(() => {
    const count = Math.max(1, people.length);
    // Estimate radius based on available area; clamp for UX
    // Rough heuristic: 8–14vmin depending on count
    const baseVmin = clamp(14 - Math.log2(count + 1) * 2.2, 8, 14);
    const labelPx = clamp(16 + (20 - count), 16, 20);
    return { radius: baseVmin, labelSize: labelPx };
  }, [people.length]);

  const handleDragEnd = useCallback((p: Person, event: any, info: any) => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const top = bounds.top;
    const height = bounds.height;
    const centerY = info.point.y - top; // y relative to container
    const pct = clamp((centerY / height) * 100, 0, 100);
    updatePerson(p.id, { yPosition: pct });
    // persist resolved positions for neighbors based on the current resolution
    try {
      // @ts-ignore capture resolvedY and people from closure
      const map = (resolvedY as Record<string, number>) || {};
      for (const other of people) {
        const ny = map[other.id];
        if (typeof ny === 'number' && Math.abs(ny - other.yPosition) > 0.25) {
          updatePerson(other.id, { yPosition: ny });
        }
      }
    } catch {}

    // Persist resolved positions for all bubbles to avoid overlap after release
    setDragY((m) => {
      const n = { ...m };
      delete n[p.id];
      return n;
    });
  }, [updatePerson]);

  const handleDrag = useCallback((p: Person, event: any, info: any) => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const centerY = info.point.y - bounds.top;
    const pct = clamp((centerY / bounds.height) * 100, 0, 100);
    setDragY((m) => ({ ...m, [p.id]: pct }));
  }, []);

  // Compute resolved layout with simple vertical-only collision response
  const resolvedY = useMemo(() => {
    if (!category || !bounds.width || !bounds.height) return Object.fromEntries(people.map(p => [p.id, p.yPosition]));
    const minDim = Math.min(bounds.width, bounds.height);
    const rPx = (radius / 100) * minDim; // radius in px (since radius is vmin)
    const nodes = people.map((p) => {
      const xRightPercent = xPercentFromPerson(p, category);
      const xPx = (mapToViewportPercent(xRightPercent) / 100) * bounds.width;
      const yPct = dragY[p.id] ?? p.yPosition;
      const yPx = (yPct / 100) * bounds.height;
      return { id: p.id, x: xPx, y: yPx, r: rPx };
    });

    // Resolve overlaps deterministically away from the actively dragged node.
    const eps = 0.5; // minimal gap in px
    const byId: Record<string, { id: string; x: number; y: number; r: number }> = Object.fromEntries(
      nodes.map((n) => [n.id, n])
    );
    const src = draggingId ? byId[draggingId] : null;

    if (src) {
      const queue: string[] = [src.id];
      const visited = new Set<string>([src.id]);
      while (queue.length) {
        const aid = queue.shift()!;
        const a = byId[aid];
        for (const b of nodes) {
          if (b.id === a.id) continue;
          const dx = a.x - b.x;
          if (Math.abs(dx) > a.r + b.r) continue; // far in X, ignore
          const minDist = a.r + b.r + eps;
          const dy = b.y - a.y;
          if (Math.abs(dy) < minDist) {
            // push b away from a vertically without overshoot
            const sign = dy >= 0 ? 1 : -1;
            b.y = a.y + sign * minDist;
            b.y = clamp(b.y, b.r, bounds.height - b.r);
            if (!visited.has(b.id)) {
              visited.add(b.id);
              queue.push(b.id);
            }
          }
        }
      }
    }

    const map: Record<string, number> = {};
    nodes.forEach((n) => {
      map[n.id] = (n.y / bounds.height) * 100;
    });
    return map;
  }, [people, category, bounds.width, bounds.height, radius, dragY, draggingId]);

  return (
    <div ref={containerRef} className="absolute inset-0" aria-label="Bubble field">
      {people.map((p, i) => {
        const xRightPercent = category ? xPercentFromPerson(p, category) : 100;
        const overdueRatio = category ? horizontalRatio(p, category) : 0;
        const isDanger = overdueRatio >= 1.0;
        const y = resolvedY[p.id] ?? p.yPosition; // 0..100 after resolution
        const cw = bounds.width || (containerRef.current?.getBoundingClientRect().width ?? 0);
        const ch = bounds.height || (containerRef.current?.getBoundingClientRect().height ?? (typeof window !== 'undefined' ? window.innerHeight : 0));
        const targetLeftPx = cw * (mapToViewportPercent(xRightPercent) / 100);
        const targetTopPx = ch * (y / 100);
        const spawnLeftPx = (entranceOrigin?.x ?? (cw - WAND_RING_OFFSET_PX));
        const spawnTopPx = (entranceOrigin?.y ?? ch * 0.5);
        const leftPx = entranceActive ? spawnLeftPx : targetLeftPx;
        const nameStyle = { fontSize: `${labelSize}px` } as React.CSSProperties;

        return (
          <motion.div
            key={`${p.id}-${entranceSeed}-${entranceActive ? 'enter' : 'stay'}`}
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
              opacity: 1
            }}
            transition={{
              type: entranceActive ? 'tween' : 'spring',
              ease: entranceActive ? [0.16, 1, 0.3, 1] : undefined,
              duration: entranceActive ? (2.2 + (i % 3) * 0.4) : undefined,
              scale: entranceActive ? { duration: (2.2 + (i % 3) * 0.4), times: [0, 0.35, 1], ease: 'easeOut' } : undefined,
              stiffness: entranceActive ? undefined : 600,
              damping: entranceActive ? undefined : 32,
              mass: entranceActive ? undefined : 0.6
            }}
            drag="y"
            dragConstraints={containerRef}
            dragListener={!entranceActive}
            dragElastic={0.15}
            dragMomentum={false}
            onDragStart={() => setDraggingId(p.id)}
            onDrag={(e, info) => handleDrag(p, e, info)}
            onDragEnd={(e, info) => { handleDragEnd(p, e, info); setDraggingId(null); }}
          >
            <div className="flex flex-col items-center">
              <button
                type="button"
                className={`bubble ${draggingId === p.id ? 'bubble-wobble' : ''} ${isDanger ? 'bubble-danger' : ''}`}
                style={{ width: `${radius}vmin`, height: `${radius}vmin` }}
                onClick={(e) => onEditPerson(p.id)}
              >
                <FluidGlass />
                {p.image && (
                  <div className="absolute inset-1 rounded-full overflow-hidden" style={{ filter: 'saturate(1.05) contrast(1.05)' }}>
                    <img src={p.image} alt={p.fullName} className="h-full w-full object-cover" style={{ transform: 'translate(1%, -1%) scale(1.02)' }} />
                  </div>
                )}
              </button>
              <div className="mt-2 text-center" style={{ width: `${radius}vmin` }}>
                <div className="font-body tracking-tight-ui text-gray-800 leading-snug" style={nameStyle}>{p.fullName}</div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
