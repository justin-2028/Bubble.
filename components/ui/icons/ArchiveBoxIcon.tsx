import React from 'react';

// Matches the icon in `Archive.svg` at the repo root.
export function ArchiveBoxIcon({ strokeWidth = 1.5, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="-0.5 -0.5 16 16"
      fill="none"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6.5625 7.1875h1.875M12.5 5v6.875a1.25 1.25 0 0 1 -1.25 1.25H3.75a1.25 1.25 0 0 1 -1.25 -1.25V5m10.625 0V3.125a1.25 1.25 0 0 0 -1.25 -1.25H3.125a1.25 1.25 0 0 0 -1.25 1.25v1.875z" />
    </svg>
  );
}
