"use client";
import React, { useEffect, useState } from 'react';

function formatPT(now: Date) {
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'short',
  }).format(now);

  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  }).format(now);

  return { time, date };
}

export function ClockPT() {
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { time, date } = formatPT(now);

  return (
    <div className="glass rounded-2xl px-4 py-2 text-center shadow-glass">
      <div className="font-code text-[13px] text-gray-800 tracking-[0.08em] leading-tight">{date}</div>
      <div className="font-code text-sm text-gray-900 leading-tight mt-0.5">{time}</div>
    </div>
  );
}
