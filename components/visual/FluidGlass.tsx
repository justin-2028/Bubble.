import React from 'react';

type Props = {
  className?: string;
  intensity?: number; // 0.8..1.4 typical
};

export function FluidGlass({ className = '', intensity = 1.05 }: Props) {
  return (
    <div
      className={`fluid-glass ${className}`}
      style={{
        // small control over backdrop-filter strength
        // browsers ignore unknown functions safely
        ['--fg-intensity' as any]: String(intensity),
      }}
      aria-hidden
    />
  );
}

