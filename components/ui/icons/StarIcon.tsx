import React from 'react';

type Props = React.SVGProps<SVGSVGElement> & {
  filled?: boolean;
  strokeWidth?: number;
};

export function StarIcon({ filled = false, strokeWidth = 2.5, ...props }: Props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M11.48 3.5a.56.56 0 0 1 1.04 0l2.13 5.11c.08.2.27.33.48.35l5.52.44c.5.04.7.66.32 1l-4.2 3.6c-.16.14-.23.36-.18.56l1.28 5.38a.57.57 0 0 1-.84.61l-4.73-2.88a.57.57 0 0 0-.59 0l-4.73 2.88a.57.57 0 0 1-.84-.61l1.28-5.38a.57.57 0 0 0-.18-.56l-4.2-3.6a.56.56 0 0 1 .32-1l5.52-.44c.21-.02.4-.15.48-.35l2.13-5.11Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </svg>
  );
}

