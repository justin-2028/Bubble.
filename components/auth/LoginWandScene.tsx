"use client";

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';

const orbs = [
  {
    className: 'left-[12%] top-[18%] hidden h-24 w-24 lg:block',
    initial: { x: 640, y: 420, scale: 0.2 },
    delay: 0.18,
  },
  {
    className: 'left-[39%] top-[62%] hidden h-16 w-16 lg:block',
    initial: { x: 430, y: 210, scale: 0.25 },
    delay: 0.3,
  },
  {
    className: 'right-[24%] top-[18%] hidden h-12 w-12 md:block',
    initial: { x: 160, y: 420, scale: 0.3 },
    delay: 0.42,
  },
];

export function LoginWandScene() {
  const reduceMotion = useReducedMotion();

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      {orbs.map((orb) => (
        <motion.div
          key={orb.className}
          className={`absolute rounded-full border border-white/80 bg-white/60 shadow-[0_18px_48px_rgba(0,0,0,0.16)] backdrop-blur-md ${orb.className}`}
          initial={
            reduceMotion
              ? false
              : {
                  opacity: 0,
                  x: orb.initial.x,
                  y: orb.initial.y,
                  scale: orb.initial.scale,
                  filter: 'blur(10px)',
                }
          }
          animate={
            reduceMotion
              ? undefined
              : {
                  opacity: 1,
                  x: 0,
                  y: 0,
                  scale: 1,
                  filter: 'blur(0px)',
                }
          }
          transition={{
            delay: orb.delay,
            duration: 1.25,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
      ))}

      {!reduceMotion && (
        <>
          {[0, 0.18, 0.36].map((delay) => (
            <LoginGust key={delay} delay={delay} />
          ))}
        </>
      )}

      <motion.div
        className="fixed -bottom-32 -right-10 h-[360px] w-[222px] sm:-bottom-36 sm:-right-6 sm:h-[430px] sm:w-[265px] lg:-bottom-40 lg:right-0 lg:h-[520px] lg:w-[320px]"
        initial={reduceMotion ? false : { x: 130, opacity: 0 }}
        animate={reduceMotion ? undefined : { x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 16 }}
      >
        <Image
          src="/newbubblewand.png"
          alt=""
          width={232}
          height={420}
          priority
          className="absolute right-0 top-0 h-full w-auto object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.18)]"
        />
      </motion.div>
    </div>
  );
}

function LoginGust({ delay }: { delay: number }) {
  return (
    <motion.svg
      className="fixed bottom-[160px] right-[0px] hidden h-[200px] w-[360px] lg:block"
      viewBox="0 0 360 200"
      fill="none"
      initial={{ opacity: 0, x: 10, y: 0 }}
      animate={{ opacity: [0, 1, 0.85, 0], x: [-120], y: [-8] }}
      transition={{ duration: 1.4, delay, ease: 'easeOut' }}
    >
      <defs>
        <linearGradient id="loginGustStroke" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id="loginGustSoft">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1" />
        </filter>
      </defs>
      <g transform="scale(-1,1) translate(-360,0)">
        <motion.path
          d="M340 100 C 300 88, 260 94, 220 104 S 120 126, 20 118"
          stroke="url(#loginGustStroke)"
          strokeWidth="5"
          fill="none"
          filter="url(#loginGustSoft)"
          strokeLinecap="round"
          initial={{ pathLength: 0, pathOffset: 1 }}
          animate={{ pathLength: 1, pathOffset: 0 }}
          transition={{ duration: 1.1, delay: delay + 0.05, ease: 'easeOut' }}
        />
        <motion.path
          d="M340 112 C 300 104, 260 110, 215 120 S 110 142, 10 136"
          stroke="url(#loginGustStroke)"
          strokeWidth="4.2"
          fill="none"
          filter="url(#loginGustSoft)"
          strokeLinecap="round"
          initial={{ pathLength: 0, pathOffset: 1 }}
          animate={{ pathLength: 1, pathOffset: 0 }}
          transition={{ duration: 1.15, delay: delay + 0.07, ease: 'easeOut' }}
        />
        <motion.path
          d="M340 88 C 302 82, 262 86, 222 96 S 128 114, 24 108"
          stroke="url(#loginGustStroke)"
          strokeWidth="3.6"
          fill="none"
          filter="url(#loginGustSoft)"
          strokeLinecap="round"
          initial={{ pathLength: 0, pathOffset: 1 }}
          animate={{ pathLength: 1, pathOffset: 0 }}
          transition={{ duration: 1.05, delay: delay + 0.02, ease: 'easeOut' }}
        />
      </g>
    </motion.svg>
  );
}
