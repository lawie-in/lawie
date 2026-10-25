'use client';

// T-511 part A: Card (spec 3). plain, KPI, folio; 1px border/line, bg/card, padding space/4,
// radius none. States: ready, loading (skeleton), empty, error. KPI number is h2, tabular.

import { EmptyState, ErrorState, Skeleton, type StateAction } from './States';

import { cn } from '@/lib/cn';

export type CardVariant = 'plain' | 'kpi' | 'folio';
export type CardState = 'ready' | 'loading' | 'empty' | 'error';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  variant?: CardVariant;
  state?: CardState;
  /** Card key / eyebrow (label style). */
  label?: React.ReactNode;
  /** Card title (h3 style). */
  title?: React.ReactNode;
  /** KPI value (h2 style, tabular numbers). */
  value?: React.ReactNode;
  /** Empty state copy and action (state="empty"). */
  emptyMessage?: React.ReactNode;
  emptyAction?: StateAction;
  /** Error state copy and retry (state="error"). */
  errorMessage?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  /** Skeleton bars while loading. */
  skeletonLines?: number;
  /** Element to render; `section` by default. */
  as?: 'section' | 'article' | 'div' | 'li';
}

const VARIANT: Record<CardVariant, string> = {
  plain: 'p-nl-4',
  kpi: 'p-nl-4',
  folio: 'p-nl-6 shadow-nl-card min-[900px]:p-nl-10',
};

export function Card({
  variant = 'plain',
  state = 'ready',
  label,
  title,
  value,
  emptyMessage,
  emptyAction,
  errorMessage,
  onRetry,
  retryLabel,
  skeletonLines,
  as: Tag = 'section',
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      data-variant={variant}
      data-state={state}
      // T-524: no aria-busy here. The loading Card holds a Skeleton whose "Still working…"
      // status must not sit inside a busy ancestor (the Skeleton marks its own bars busy).
      className={cn(
        'nl rounded-nl-none border-nl-line bg-nl-card text-nl-text border',
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {label ? <p className="nl-label mb-nl-2 text-nl-brass-dark">{label}</p> : null}
      {title ? <h3 className="nl-h3 mb-nl-2 text-nl-text">{title}</h3> : null}
      {state === 'loading' ? (
        <Skeleton lines={skeletonLines ?? (variant === 'kpi' ? 1 : 3)} />
      ) : state === 'empty' ? (
        emptyMessage ? (
          <EmptyState message={emptyMessage} action={emptyAction} />
        ) : null
      ) : state === 'error' ? (
        errorMessage ? (
          <ErrorState message={errorMessage} onRetry={onRetry} retryLabel={retryLabel} />
        ) : null
      ) : (
        <>
          {variant === 'kpi' && value !== undefined && value !== null ? (
            <p className="nl-h2 text-nl-text tabular-nums">{value}</p>
          ) : null}
          {children}
        </>
      )}
    </Tag>
  );
}
