'use client';

/**
 * 05 Generating (T-005), for a draft from a confirmed brief. Two steps, and a
 * third only when the service reports that it is adding a part that was
 * missing (T-126, D2). A failed run shows why, with a way back to the brief.
 */
import { AlertTriangle, Check } from 'lucide-react';

import InkCostLine, { inkCostState } from './InkCostLine';
import { card, linkButton, primaryButton } from './ui';

/** T-388: id of the Ink cost line under "Try again". */
export const RETRY_INK_COST_ID = 'generating-retry-ink-cost';

function Step({ state, children }: { state: 'done' | 'now'; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      {state === 'done' ? (
        <span className="bg-brand-teal flex h-6 w-6 flex-none items-center justify-center rounded-full text-white">
          <Check size={14} aria-hidden="true" />
        </span>
      ) : (
        <span className="border-brand-gold bg-brand-gold-light flex h-6 w-6 flex-none items-center justify-center rounded-full border-2">
          <span className="bg-brand-gold h-2 w-2 rounded-full" />
        </span>
      )}
      <span className={state === 'now' ? 'font-semibold' : ''}>
        {children}
        <span className="sr-only">{state === 'done' ? ' (done)' : ' (in progress)'}</span>
      </span>
    </li>
  );
}

export default function GeneratingStep({
  documentName,
  repairing,
  error,
  onRetry,
  onBackToBrief,
  inkCost,
  inkCostLoading = false,
  onInkCostRetry,
  kind = 'unknown',
}: {
  documentName: string;
  repairing: boolean;
  error: { reason: string; retryable: boolean } | null;
  onRetry: () => void;
  onBackToBrief: () => void;
  /** T-388: what "Try again" charges, from the same price as Confirm. */
  inkCost?: number;
  /** T-388: the cost is being fetched. */
  inkCostLoading?: boolean;
  /** T-388: fetches the cost again when it could not be worked out. */
  onInkCostRetry?: () => void;
  /** T-388: the document kind id, for the Sentry report only. */
  kind?: string;
}) {
  if (error) {
    // T-388 (Arjun): "Try again" charges, so it waits for a known cost.
    const retryBlocked = inkCostState(inkCost, inkCostLoading) !== 'known';
    return (
      <div className="mx-auto w-full max-w-[720px]">
        {/* T-388: the alert is the message only, so it does not wrap the Ink cost line's own alert. */}
        <div className={`${card} flex flex-col gap-4`}>
          <div className="flex items-start gap-3" role="alert">
            <AlertTriangle size={20} className="text-brand-error mt-0.5 flex-none" aria-hidden />
            <div>
              <h1 className="font-heading text-brand-navy text-xl font-semibold">
                The draft was not written
              </h1>
              <p className="text-brand-navy mt-1 text-sm">{error.reason}</p>
              <p className="text-brand-muted mt-1 text-sm">
                You have not been charged. Your brief is kept.
              </p>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={onBackToBrief} className={linkButton}>
              Back to the brief
            </button>
            {error.retryable && (
              <div className="flex flex-col items-stretch gap-1 sm:items-end">
                <button
                  type="button"
                  onClick={retryBlocked ? undefined : onRetry}
                  disabled={retryBlocked}
                  aria-disabled={retryBlocked ? 'true' : undefined}
                  aria-describedby={RETRY_INK_COST_ID}
                  className={primaryButton}
                >
                  Try again
                </button>
                <InkCostLine
                  id={RETRY_INK_COST_ID}
                  cost={inkCost}
                  loading={inkCostLoading}
                  onRetry={onInkCostRetry}
                  kind={kind}
                  action="retry"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className={`${card} flex flex-col items-center gap-6 sm:!p-10`} aria-live="polite">
        <div className="text-center">
          <h1 className="font-heading text-brand-navy text-2xl font-semibold sm:text-[28px]">
            Drafting your {documentName}
          </h1>
          <p className="text-brand-muted mt-2">
            This can take a little while. Please keep this tab open.
          </p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded bg-slate-200" aria-hidden="true">
          <div className="bg-brand-teal h-full w-1/3 animate-pulse rounded motion-reduce:animate-none" />
        </div>
        <ul className="text-brand-navy w-full space-y-3.5">
          <Step state="done">Read your confirmed brief</Step>
          <Step state={repairing ? 'done' : 'now'}>Writing the draft</Step>
          {repairing && <Step state="now">Adding a part that was missing</Step>}
        </ul>
      </div>
    </div>
  );
}
