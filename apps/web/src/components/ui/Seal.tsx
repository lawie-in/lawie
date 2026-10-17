'use client';

// T-511 part A: brass Seal (spec 3, 2.4). 100x100 SVG, brass fill, on-brass text. States: hidden,
// stamping (550ms cubic-bezier(.2,.9,.3,1.2), scale 2.2 to 1, rotate -20 to -8; halved on the
// mobile cap), stamped. Reduced motion: a 150ms fade to the stamped end state.

import { cn } from '@/lib/cn';

export type SealState = 'hidden' | 'stamping' | 'stamped';

export interface SealProps {
  state: SealState;
  /** Text on the seal (e.g. the draft-ready or finalised wording). From copy; no default. */
  text: string;
  /** Accessible name; defaults to `text`. */
  label?: string;
  /** Called when the stamping animation ends (also after the reduced-motion fade). */
  onStamped?: () => void;
  className?: string;
}

export function Seal({ state, text, label, onStamped, className }: SealProps) {
  const hidden = state === 'hidden';
  return (
    <svg
      viewBox="0 0 100 100"
      width="100"
      height="100"
      role={hidden ? undefined : 'img'}
      aria-label={hidden ? undefined : (label ?? text)}
      aria-hidden={hidden || undefined}
      data-state={state}
      className={cn('nl overflow-visible', hidden && 'invisible', className)}
    >
      <g
        className={cn(
          state === 'stamping' && 'nl-seal-stamping',
          state === 'stamped' && 'nl-seal-stamped',
        )}
        onAnimationEnd={state === 'stamping' ? onStamped : undefined}
      >
        <circle cx="50" cy="50" r="48" fill="var(--brass)" />
        <circle
          cx="50"
          cy="50"
          r="41"
          fill="none"
          stroke="var(--on-brass)"
          strokeOpacity="0.6"
          strokeWidth="1.5"
        />
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--on-brass)"
          className="font-nl-body"
          fontSize="13"
          fontWeight="500"
          letterSpacing="1.5"
        >
          {text}
        </text>
      </g>
    </svg>
  );
}
