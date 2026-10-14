'use client';

/**
 * T-388: the Ink cost line under a button that charges Ink (Rajesh's spec,
 * `handoff/marketing/ink-cost-spec-t388.md`, sections 3 to 5). One slot under
 * the button, three states:
 *
 * - loading: the cost is being worked out; the button is off.
 * - known: "Uses N Ink" (formatInkCost, the Confirm line of T-372); the button is on.
 * - unknown: the cost could not be worked out; the action blocks (Arjun, 14 Oct
 *   2026). The notice and "Try again" are final; there is no proceed path.
 *
 * The caller disables its button from `inkCostState` and points the button's
 * `aria-describedby` at this line's id in every state.
 */
import * as Sentry from '@sentry/nextjs';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { formatInkCost } from './BriefStep';
import { linkButton } from './ui';

/** Arjun's notice, word for word. Do not reword. */
export const INK_COST_UNKNOWN =
  'We could not work out the Ink cost for this. Try again in a moment.';

/** The loading line (spec section 4). */
export const INK_COST_LOADING = 'Working out the Ink cost...';

export type InkCostState = 'loading' | 'known' | 'unknown';

/** The charging action, as sent to Sentry. */
export type InkCostAction = 'confirm' | 'retry' | 'soft_warn' | 'submit';

/**
 * Known when the cost is a finite number above 0; loading while the cost is
 * being fetched; otherwise unknown (the fetch failed or the field was absent).
 */
export function inkCostState(cost: number | undefined, loading: boolean): InkCostState {
  if (formatInkCost(cost) !== null) return 'known';
  return loading ? 'loading' : 'unknown';
}

export default function InkCostLine({
  id,
  cost,
  loading,
  onRetry,
  kind,
  action,
  report = true,
}: {
  /** Unique per button; the button's aria-describedby points here. */
  id: string;
  /** The cost from the price function (template-configs `credits_cost` / `guided_credits_cost`). */
  cost: number | undefined;
  /** True while the cost is being fetched. */
  loading: boolean;
  /** Fetches the cost again. */
  onRetry?: () => void;
  /** The template or document kind id, for Sentry only. */
  kind: string;
  action: InkCostAction;
  /** Report the unknown state to Sentry. Off for a second line in the same card, so it is reported once. */
  report?: boolean;
}) {
  const state = inkCostState(cost, loading);

  // Arjun: an unknown cost is an error, reported once each time the line goes
  // into the unknown state. Tags only: no content, no PII, no user id.
  const reported = useRef(false);
  useEffect(() => {
    if (state !== 'unknown') {
      reported.current = false;
      return;
    }
    if (!report || reported.current) return;
    reported.current = true;
    Sentry.captureMessage('Ink cost unknown', { level: 'warning', tags: { kind, action } });
  }, [state, report, kind, action]);

  if (state === 'known') {
    return (
      <p id={id} className="text-sm text-slate-600">
        {formatInkCost(cost)}
      </p>
    );
  }

  if (state === 'loading') {
    return (
      <p id={id} role="status" className="inline-flex items-center gap-2 text-sm text-slate-600">
        <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {INK_COST_LOADING}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <p id={id} role="alert" className="text-brand-error flex items-start gap-2 text-sm">
        <AlertCircle size={16} className="mt-0.5 flex-none" aria-hidden="true" />
        <span>{INK_COST_UNKNOWN}</span>
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={linkButton}>
          Try again
        </button>
      )}
    </div>
  );
}
