'use client';

// T-511 part A: the reading lamp and dust motes (spec 2.1 lamp, 2.4 motion).
// Lamp: a radial-gradient pool of --lamp. It follows the pointer (120ms linear) only with a fine
// pointer, width >= 900px and motion allowed; otherwise it is a static pool at 70% 20%.
// DustMotes: 6-10 motes, opacity <= .25, 12-20s drift loop, under the same gate; paused while the
// tab is hidden. Both are decorative (aria-hidden) and ignore pointer events. Place inside a
// positioned container.

import { useEffect, useRef } from 'react';

import { loopPlayState, useAmbientMotionAllowed, usePageVisible } from './motion';

import { cn } from '@/lib/cn';

const POOL_SIZE = 900;

export function Lamp({ className }: { className?: string }) {
  const follow = useAmbientMotionAllowed();
  const containerRef = useRef<HTMLDivElement>(null);
  const poolRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!follow) return undefined;
    const container = containerRef.current;
    const pool = poolRef.current;
    if (!container || !pool) return undefined;

    let frame = 0;
    let lastX = 0;
    let lastY = 0;
    const place = (x: number, y: number) => {
      pool.style.transform = `translate(${x - POOL_SIZE / 2}px, ${y - POOL_SIZE / 2}px)`;
    };
    const rect = container.getBoundingClientRect();
    place(rect.width * 0.7, rect.height * 0.2);

    const onMove = (e: PointerEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const r = container.getBoundingClientRect();
        place(lastX - r.left, lastY - r.top);
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [follow]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      data-follow={follow || undefined}
      className={cn(
        'nl pointer-events-none absolute inset-0 overflow-hidden',
        !follow && 'nl-lamp-pool',
        className,
      )}
    >
      {follow ? (
        <div
          ref={poolRef}
          className="absolute left-0 top-0 rounded-full transition-transform duration-[120ms] ease-linear"
          style={{
            width: POOL_SIZE,
            height: POOL_SIZE,
            backgroundImage: 'radial-gradient(circle, var(--lamp), transparent 60%)',
          }}
        />
      ) : null}
    </div>
  );
}

// Deterministic layout (no Math.random), so renders are stable.
const MOTES: { left: string; top: string; duration: number; delay: number }[] = [
  { left: '12%', top: '24%', duration: 14, delay: 0 },
  { left: '28%', top: '62%', duration: 18, delay: -4 },
  { left: '41%', top: '18%', duration: 12, delay: -7 },
  { left: '55%', top: '48%', duration: 20, delay: -2 },
  { left: '67%', top: '30%', duration: 16, delay: -9 },
  { left: '74%', top: '70%', duration: 13, delay: -5 },
  { left: '83%', top: '14%', duration: 19, delay: -11 },
  { left: '91%', top: '52%', duration: 15, delay: -3 },
];

export interface DustMotesProps {
  /** 6 to 10 (spec 2.4). Clamped. */
  count?: number;
  className?: string;
}

export function DustMotes({ count = 8, className }: DustMotesProps) {
  const allowed = useAmbientMotionAllowed();
  const visible = usePageVisible();
  if (!allowed) return null;
  const n = Math.min(10, Math.max(6, Math.round(count)));
  const motes = Array.from({ length: n }, (_, i) => MOTES[i % MOTES.length]);
  return (
    <div
      aria-hidden="true"
      className={cn('nl pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      {motes.map((m, i) => (
        <span
          key={i}
          className="nl-mote"
          style={{
            left: m.left,
            top: i >= MOTES.length ? `calc(${m.top} + 8%)` : m.top,
            ['--nl-mote-duration' as string]: `${m.duration}s`,
            animationDelay: `${m.delay}s`,
            ...loopPlayState(visible),
          }}
        />
      ))}
    </div>
  );
}
