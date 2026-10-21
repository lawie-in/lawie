'use client';

/**
 * 05 Generating (T-005), for a draft from a confirmed brief. Two steps, and a
 * third only when the service reports that it is adding a part that was
 * missing (T-126, D2). A failed run shows why, with a way back to the brief.
 *
 * T-521 (Night Library, spec 04/05): the folio with the inkwell drain and a
 * skeleton ("Still working…" after 8s). What a failure says about Ink is
 * decided in `generationFailure.ts` (Arjun ruling 4): the signed "The draft did
 * not finish. No Ink was used." only for a server error event that is not
 * `insufficient_ink`.
 */
import { AlertTriangle, Check } from 'lucide-react';

import { generationFailureCopy, type GenerationError } from './generationFailure';
import InkCostLine, { inkCostState } from './InkCostLine';
import { actions, folio, linkButton, page } from './nlUi';

import { Button, Inkwell, Skeleton } from '@/components/ui';

/** T-388: id of the Ink cost line under "Try again". */
export const RETRY_INK_COST_ID = 'generating-retry-ink-cost';

function Step({ state, children }: { state: 'done' | 'now'; children: React.ReactNode }) {
  return (
    <li className="gap-nl-3 flex items-center">
      {state === 'done' ? (
        <span className="bg-nl-ok-light text-nl-ok flex h-6 w-6 flex-none items-center justify-center rounded-full">
          <Check size={14} aria-hidden="true" />
        </span>
      ) : (
        <span className="border-nl-brass bg-nl-brass-light flex h-6 w-6 flex-none items-center justify-center rounded-full border-2">
          <span className="bg-nl-brass h-2 w-2 rounded-full" />
        </span>
      )}
      <span className={state === 'now' ? 'font-medium' : ''}>
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
  inkLevel = null,
}: {
  documentName: string;
  repairing: boolean;
  error: GenerationError | null;
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
  /**
   * T-521 (Rajesh): the advocate's Ink level, 0-100 (inkLevel.ts). Null while the
   * balance is unknown: no inkwell then, never a made-up level.
   */
  inkLevel?: number | null;
}) {
  if (error) {
    // T-388 (Arjun): "Try again" charges, so it waits for a known cost.
    const retryBlocked = inkCostState(inkCost, inkCostLoading) !== 'known';
    const copy = generationFailureCopy(error);
    return (
      <div className={page}>
        {/* T-388: the alert is the message only, so it does not wrap the Ink cost line's own alert. */}
        <div className={`${folio} gap-nl-4 flex flex-col`} data-no-ink-claim={copy.noInkClaim}>
          <div className="gap-nl-3 flex items-start" role="alert">
            <AlertTriangle size={20} className="text-nl-err mt-1 flex-none" aria-hidden />
            <div className="min-w-0">
              <h1 className="nl-h3 text-nl-text break-words">{copy.headline}</h1>
              {copy.detail && (
                <p className="nl-body-sm text-nl-soft mt-nl-1 break-words">{copy.detail}</p>
              )}
            </div>
          </div>
          <div className={actions}>
            <button type="button" onClick={onBackToBrief} className={linkButton}>
              Back to the brief
            </button>
            {error.retryable && (
              <div className="gap-nl-1 flex flex-col items-stretch min-[640px]:items-end">
                <Button
                  onClick={retryBlocked ? undefined : onRetry}
                  disabled={retryBlocked}
                  aria-disabled={retryBlocked ? 'true' : undefined}
                  aria-describedby={RETRY_INK_COST_ID}
                >
                  Try again
                </Button>
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
    <div className={page}>
      {/* One live region for the steps only: the Skeleton below has its own role="status"
          ("Still working…"), and nesting it in another live region could announce twice. */}
      <div className={`${folio} gap-nl-6 flex flex-col items-center`}>
        {/* The ink drain runs from the real level for the request; static at 60% under
            reduced motion. Not shown while the balance is unknown. */}
        {typeof inkLevel === 'number' && <Inkwell balance={inkLevel} draining />}
        <div className="w-full min-w-0 text-center">
          <h1 className="nl-h2 text-nl-text break-words">Drafting your {documentName}</h1>
          <p className="nl-body text-nl-soft mt-nl-2">
            This can take a little while. Please keep this tab open.
          </p>
        </div>
        <ul className="nl-body text-nl-text w-full space-y-3.5" aria-live="polite">
          <Step state="done">Read your confirmed brief</Step>
          <Step state={repairing ? 'done' : 'now'}>Writing the draft</Step>
          {repairing && <Step state="now">Adding a part that was missing</Step>}
        </ul>
        <Skeleton lines={3} className="w-full" />
      </div>
    </div>
  );
}
