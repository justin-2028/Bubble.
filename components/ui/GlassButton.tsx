import React from 'react';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
  intent?: 'default' | 'destructive';
};

export function GlassButton({ children, className = '', disabled, intent = 'default', ...props }: Props) {
  const intentClass =
    intent === 'destructive'
      ? disabled
        ? 'text-red-400'
        : 'text-red-600 hover:text-red-700'
      : 'text-gray-800';
  return (
    <button
      {...props}
      disabled={disabled}
      aria-disabled={disabled}
      className={`glass inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-nav tracking-tight-ui ${intentClass} ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/50 active:scale-[0.98]'} ${className}`}
    >
      {children}
    </button>
  );
}
