'use client';

// T-511 part A: loading, empty and error building blocks (spec 3 Empty state, 4.08). All copy
// comes from props; the only defaults are strings the copy file lists (`Retry`, `Still working…`).

import { useEffect, useState } from 'react';

import { Button } from './Button';
import { loopPlayState, usePageVisible } from './motion';

import { cn } from '@/lib/cn';

export const STATE_COPY = {
  retry: 'Retry',
  stillWorking: 'Still working…',
} as const;

/** Spec 4.08: loading longer than 8s shows "Still working…" under the skeleton. */
export const STILL_WORKING_AFTER_MS = 8000;

export interface SkeletonProps {
  /** Number of bars. */
  lines?: number;
  className?: string;
  /** Text shown under the skeleton after `slowAfterMs`. Pass '' to turn it off. */
  slowText?: string;
  slowAfterMs?: number;
}

/** Pulsing bars (1.4s ease-in-out loop; paused when the tab is hidden; static when reduced). */
export function Skeleton({
  lines = 3,
  className,
  slowText = STATE_COPY.stillWorking,
  slowAfterMs = STILL_WORKING_AFTER_MS,
}: SkeletonProps) {
  const visible = usePageVisible();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!slowText) return undefined;
    const t = window.setTimeout(() => setSlow(true), slowAfterMs);
    return () => window.clearTimeout(t);
  }, [slowText, slowAfterMs]);

  return (
    // T-524: aria-busy sits on the visual bars only, never on an ancestor of the "Still working…"
    // status below; a busy ancestor makes screen readers hold the announcement back.
    <div className={cn('nl', className)}>
      <div className="gap-nl-2 flex flex-col" aria-hidden="true" aria-busy="true">
        {Array.from({ length: Math.max(1, lines) }, (_, i) => (
          <div
            key={i}
            className={cn(
              'nl-skeleton h-nl-3 rounded-nl-sm',
              i === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full',
            )}
            style={loopPlayState(visible)}
          />
        ))}
      </div>
      {/* The live region exists from the first render and is filled later, so screen readers
          announce the text when it appears. */}
      {slowText ? (
        <p className={cn('nl-body-sm text-nl-muted', slow && 'mt-nl-3')} role="status">
          {slow ? slowText : null}
        </p>
      ) : null}
    </div>
  );
}

export interface StateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  /** One sentence (spec 3). */
  message: React.ReactNode;
  heading?: React.ReactNode;
  /** One primary action. */
  action?: StateAction;
  className?: string;
}

export function EmptyState({ message, heading, action, className }: EmptyStateProps) {
  return (
    <div className={cn('nl gap-nl-3 flex flex-col items-start', className)}>
      {heading ? <p className="nl-h3 text-nl-text">{heading}</p> : null}
      <p className="nl-body text-nl-soft">{message}</p>
      {action ? <Button onClick={action.onClick}>{action.label}</Button> : null}
    </div>
  );
}

export interface ErrorStateProps {
  message: React.ReactNode;
  heading?: React.ReactNode;
  /** Shows a Retry button when set. */
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  message,
  heading,
  onRetry,
  retryLabel = STATE_COPY.retry,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn('nl gap-nl-3 flex flex-col items-start', className)} role="alert">
      {heading ? <p className="nl-h3 text-nl-text">{heading}</p> : null}
      <p className="nl-body text-nl-err">{message}</p>
      {onRetry ? (
        <Button variant="ghost" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
