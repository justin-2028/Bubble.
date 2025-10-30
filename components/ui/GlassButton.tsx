import React from 'react';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
};

export function GlassButton({ children, className = '', disabled, ...props }: Props) {
  return (
    <button
      {...props}
      disabled={disabled}
      aria-disabled={disabled}
      className={`glass inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-nav tracking-tight-ui text-gray-800 ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/50 active:scale-[0.98]'} ${className}`}
    >
      {children}
    </button>
  );
}
