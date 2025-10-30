import React from 'react';

export function FABAddPerson({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`glass rounded-2xl px-5 py-3 font-nav tracking-tight-ui text-base ${className}`}
      aria-label="Add Bubble"
    >
      + Add Bubble
    </button>
  );
}
