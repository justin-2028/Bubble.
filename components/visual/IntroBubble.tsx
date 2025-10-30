"use client";
import { motion } from 'framer-motion';
import React from 'react';

export function IntroBubble({ categoryName }: { categoryName: string }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center">
      <motion.div
        className="relative"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.6, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 120, damping: 16 }}
      >
        <div className="bubble" style={{ width: '40vmin', height: '40vmin' }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="font-display tracking-tight-display leading-tight-display text-center text-gray-800" style={{ fontSize: 'clamp(48px, 8vmin, 96px)' }}>
            {categoryName}
          </div>
        </div>
        {/* Pop particles */}
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0, 1, 0] }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          {/* Simple sparkle dots */}
          {Array.from({ length: 10 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-2 w-2 rounded-full bg-white/80"
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{
                x: (Math.random() - 0.5) * 140,
                y: (Math.random() - 0.5) * 140,
                opacity: [1, 1, 0]
              }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.6 }}
              style={{ left: '50%', top: '50%' }}
            />
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}

