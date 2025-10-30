import React from 'react';

export function DangerZone() {
  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 w-[12%] z-10">
      {/* Background fade */}
      <div className="absolute inset-0 bg-gradient-to-r from-red-200/40 to-transparent" />
      {/* Spikes */}
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        {/* Triangular spikes leaning right */}
        {Array.from({ length: 16 }).map((_, i) => {
          const y = (i / 16) * 100;
          const size = 10 + ((i % 3) * 6);
          return (
            <polygon
              key={i}
              points={`0,${y} ${size},${y + 3} 0,${y + 6}`}
              fill="rgba(220,38,38,0.55)" /* 116,176,255,254 */
            />
          );
        })}
      </svg>
    </div>
  );
}

