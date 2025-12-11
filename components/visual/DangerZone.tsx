"use client";
import React, { useEffect, useMemo, useState } from 'react';

export function DangerZone() {
  const N = 16;
  const [params, setParams] = useState<Array<{ dur: number; delay: number }>>([]);

  useEffect(() => {
    const rng = () => {
      if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
        const arr = new Uint32Array(1);
        crypto.getRandomValues(arr);
        return arr[0] / 0xffffffff;
      }
      return Math.random();
    };
    const p: Array<{ dur: number; delay: number }> = Array.from({ length: N }).map(() => {
      const r = rng();
      const dur = 8 + r * 12; // 8s - 20s
      const delay = -(rng() * dur); // negative to desync initial visibility
      return { dur, delay };
    });
    setParams(p);
  }, []);
  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 w-[12%] z-10">
      {/* Background fade */}
      <div className="absolute inset-0 bg-gradient-to-r from-red-200/40 to-transparent" />
      {/* Spikes + tip twinkles within the same SVG for pixel-perfect alignment */}
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        <defs>
          <radialGradient id="twinkleRad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
            <stop offset="60%" stopColor="#ffffff" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <filter id="twinkleGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="0" stdDeviation="0.6" floodColor="#ffffff" floodOpacity="0.9" />
            <feDropShadow dx="0" dy="0" stdDeviation="1.2" floodColor="#ffffff" floodOpacity="0.35" />
          </filter>
        </defs>
        {Array.from({ length: N }).map((_, i) => {
          const y = (i / 16) * 100;
          // Slightly increase spike length (tip extends further to the right)
          const base = 10 + ((i % 3) * 6);
          const size = base * 1.2; // ~20% longer spikes
          const tipX = size;
          const tipY = y + 3;
          const dur = params[i]?.dur ?? 12;
          const phase = params[i]?.delay ?? 0;
          return (
            <g key={i}>
              {/* spike */}
              <polygon
                points={`0,${y} ${size},${tipY} 0,${y + 6}`}
                fill="rgba(220,38,38,0.55)"
              />
              {/* twinkle at the spike tip */}
              <g transform={`translate(${tipX}, ${tipY})`} filter="url(#twinkleGlow)" style={{ pointerEvents: 'none' }}>
                <g className="spike-twinkle" style={{ animationDelay: `${phase}s`, animationDuration: `${dur}s` }}>
                  <circle r={1.1} fill="url(#twinkleRad)" />
                  <g stroke="#fff" strokeWidth={0.35} strokeLinecap="round" opacity={0.95}>
                    <line x1={-1.0} y1={0} x2={1.0} y2={0} />
                    <line x1={0} y1={-1.0} x2={0} y2={1.0} />
                  </g>
                </g>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
