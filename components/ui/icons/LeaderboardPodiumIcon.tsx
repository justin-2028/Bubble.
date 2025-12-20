import React from 'react';

export function LeaderboardPodiumIcon({ strokeWidth = 2.5, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <g stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="10" width="6" height="13" rx="1.5" />
        <rect x="9" y="4" width="6" height="19" rx="1.5" />
        <rect x="15" y="16" width="6" height="7" rx="1.5" />
      </g>
    </svg>
  );
}
