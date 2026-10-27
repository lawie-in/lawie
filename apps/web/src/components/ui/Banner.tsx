'use client';

// T-511 part A: Banner (spec 3). Full width under the top bar, warn/soft or error/soft. Kinds:
// AI down, payment failed, verify email, privacy re-accept. Error tone is role="alert", warn tone
// role="status". Copy comes from props (copy file 4.5 and 5).
// T-616: `session-reconnecting` (warn, never dismissible, no action; also aria-live="polite" and
// aria-atomic="true", for this kind only). Rendered by components/shell/SessionReconnectingBanner.

import { cn } from '@/lib/cn';

export type BannerKind =
  | 'ai-down'
  | 'payment-failed'
  | 'verify-email'
  | 'privacy-reaccept'
  | 'session-reconnecting';
export type BannerTone = 'warn' | 'error';

export const BANNER_TONE: Record<BannerKind, BannerTone> = {
  'ai-down': 'warn',
  'payment-failed': 'error',
  'verify-email': 'warn',
  'privacy-reaccept': 'warn',
  'session-reconnecting': 'warn',
};

/** T-616: kinds that announce every text change as one polite, atomic update. */
const LIVE_KINDS: ReadonlySet<BannerKind> = new Set(['session-reconnecting']);

export interface BannerProps {
  kind: BannerKind;
  message: React.ReactNode;
  /** Overrides the kind's default tone. */
  tone?: BannerTone;
  /**
   * T-522 (Rajesh §2): `disabled` renders aria-disabled, not the disabled attribute, so the
   * button keeps focus and a status line beside it is still read out; a press does nothing.
   * `busy` sets aria-busy (a send in progress).
   */
  action?: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean };
  /** Shows a close button. Needs `onDismiss` and `dismissLabel`. */
  dismissible?: boolean;
  onDismiss?: () => void;
  /** Accessible name of the close button. No copy exists yet, so it is a prop. */
  dismissLabel?: string;
  className?: string;
}

const TONE: Record<BannerTone, string> = {
  warn: 'bg-nl-warn-light text-nl-warn',
  error: 'bg-nl-err-light text-nl-err',
};

export function Banner({
  kind,
  message,
  tone,
  action,
  dismissible = false,
  onDismiss,
  dismissLabel,
  className,
}: BannerProps) {
  const resolvedTone = tone ?? BANNER_TONE[kind];
  const live = LIVE_KINDS.has(kind);
  // T-616: session-reconnecting is never dismissible and has no action, whatever is passed.
  const showClose = !live && dismissible && onDismiss && dismissLabel;
  const shownAction = live ? undefined : action;
  return (
    <div
      role={resolvedTone === 'error' ? 'alert' : 'status'}
      aria-live={live ? 'polite' : undefined}
      aria-atomic={live ? 'true' : undefined}
      data-kind={kind}
      data-tone={resolvedTone}
      className={cn(
        'nl gap-x-nl-4 gap-y-nl-2 border-nl-line px-nl-4 py-nl-2 flex w-full flex-wrap items-center border-b',
        TONE[resolvedTone],
        className,
      )}
    >
      <p className="nl-body-sm min-w-0 flex-1 font-medium">{message}</p>
      {shownAction ? (
        <button
          type="button"
          onClick={() => {
            if (!shownAction.disabled) shownAction.onClick();
          }}
          aria-disabled={shownAction.disabled || undefined}
          aria-busy={shownAction.busy || undefined}
          className={cn(
            'nl-focus nl-body-sm rounded-nl-md px-nl-3 inline-flex min-h-[44px] items-center font-medium underline underline-offset-4',
            shownAction.disabled && 'cursor-not-allowed opacity-40',
          )}
        >
          {shownAction.label}
        </button>
      ) : null}
      {showClose ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="nl-focus rounded-nl-md inline-flex h-11 w-11 items-center justify-center"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
