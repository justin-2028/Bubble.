"use client";
import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { UndoHotkeys } from './ui/UndoHotkeys';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <UndoHotkeys />
      <AnimatePresence mode="wait">{children}</AnimatePresence>
    </>
  );
}
