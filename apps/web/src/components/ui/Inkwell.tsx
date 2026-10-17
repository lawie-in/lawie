'use client';

// T-511 part A: Inkwell gauge (spec 3, 2.4). SVG 52x64, balance 0-100 (%), the level rect clipped
// to the well, brass/fill at .85. `draining` runs the 2.6s linear ink drain (loops until the
// generate request ends; paused while the tab is hidden). Reduced motion: static at 60%.

import { useId } from 'react';

import { loopPlayState, usePageVisible, usePrefersReducedMotion } from './motion';

import { cn } from '@/lib/cn';

export interface InkwellProps {
  /** Fill level, 0-100. Clamped. */
  balance: number;
  /** Generate in progress: run the ink drain. */
  draining?: boolean;
  /** Accessible name (e.g. the balance in words). Without it the SVG is decorative. */
  label?: string;
  className?: string;
}

/** Spec 2.4: the reduced-motion end state of the drain. */
export const INKWELL_REDUCED_LEVEL = 60;

// Well interior (the clip): x 8..44, y 22..60.
const WELL_TOP = 22;
const WELL_HEIGHT = 38;

export function clampLevel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function Inkwell({ balance, draining = false, label, className }: InkwellProps) {
  const clipId = `nl-inkwell-${useId().replace(/:/g, '')}`;
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();

  const animating = draining && !reduced;
  const level = draining && reduced ? INKWELL_REDUCED_LEVEL : clampLevel(balance);
  const offset = `${100 - level}%`;

  const levelStyle: React.CSSProperties & Record<'--nl-ink-from', string> = {
    '--nl-ink-from': offset,
    transformBox: 'fill-box',
    transform: `translateY(${offset})`,
    ...(animating ? loopPlayState(visible) : null),
  };

  return (
    <svg
      viewBox="0 0 52 64"
      width="52"
      height="64"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-draining={animating || undefined}
      data-level={level}
      className={cn('nl', className)}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="8" y={WELL_TOP} width="36" height={WELL_HEIGHT} rx="4" />
        </clipPath>
      </defs>
      {/* neck and rim */}
      <rect
        x="18"
        y="8"
        width="16"
        height="10"
        rx="2"
        fill="none"
        stroke="var(--line)"
        strokeWidth="2"
      />
      <rect
        x="14"
        y="16"
        width="24"
        height="5"
        rx="1"
        fill="var(--bg-wood)"
        stroke="var(--line)"
        strokeWidth="2"
      />
      {/* ink */}
      <g clipPath={`url(#${clipId})`}>
        <rect
          className={cn(animating && 'nl-ink-draining')}
          x="8"
          y={WELL_TOP}
          width="36"
          height={WELL_HEIGHT}
          fill="var(--brass)"
          fillOpacity="0.85"
          style={levelStyle}
        />
      </g>
      {/* body outline */}
      <rect
        x="8"
        y={WELL_TOP}
        width="36"
        height={WELL_HEIGHT}
        rx="4"
        fill="none"
        stroke="var(--line)"
        strokeWidth="2"
      />
    </svg>
  );
}
