'use client';

/**
 * PipelineStatus — SCRUM-70
 *
 * 5-state pipeline stepper displayed during document generation:
 *   verifying  → blue,   crosshair icon, 2-segment shimmer
 *   soft_warn  → amber,  triangle icon,  questions + 2 actions
 *   drafting   → purple, file icon,      elapsed-seconds counter, 3-segment shimmer
 *   ready      → green,  checkmark,      all 5 bars green, Open / Export CTA
 *   hard_block → red,    error icon,     block reason, Edit the form CTA
 *
 * Design reference: /docs/designs/draft-pipeline-status-bar-2026-05-06.html
 *
 * Drives off:
 *   - POST /preflight response (verifying → soft_warn | hard_block | proceed)
 *   - SSE events from /generate (drafting → ready)
 */

import { useEffect, useRef, useState } from 'react';

import InkCostLine, { inkCostState } from '@/components/intake/InkCostLine';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PipelineState =
  | 'verifying'
  | 'soft_warn'
  | 'drafting'
  | 'ready'
  | 'hard_block'
  | 'generation_failed';

/** T-565 W1/W3: what the generation-failed card says (see `generationFailure`). */
export type GenerationFailure = 'not_started' | 'request_failed' | 'stream';

export interface PipelineStatusProps {
  state: PipelineState;
  /** Questions from preflight soft-warn (shown in amber card) */
  questions?: string[];
  /** Reason text for hard-block */
  hardBlockReason?: string;
  /** Template display name for the drafting label */
  templateName?: string;
  /** Sections cited, shown in ready card */
  sectionsCited?: string[];
  /** Number of paragraphs in the draft (ready card) */
  paragraphCount?: number;
  /** Warnings emitted post-generation (ready card) */
  warningCount?: number;
  /** Called when advocate clicks "Generate anyway" in soft-warn */
  onProceedAnyway?: () => void;
  /** Called when advocate clicks "Edit the form" in soft-warn, hard-block or generation-failed */
  onEditForm?: () => void;
  /** Called when advocate clicks "Open in editor" in ready */
  onOpenEditor?: () => void;
  /**
   * Generation-failed reason (from server `event: error` SSE). T-565 (row 41, T6): not shown;
   * the card shows the signed text only.
   */
  generationError?: string;
  /** Whether the failure is retryable — controls "Try again" button visibility */
  generationRetryable?: boolean;
  /**
   * T-565 W1/W3 (Ajay): which failure the generation-failed card shows. Default `stream`.
   *   - `not_started`: nothing was sent (the Ink cost is unknown). `The draft could not start.`
   *     alone: no documents-list line and no Ink line.
   *   - `request_failed`: a pre-stream 400/403/409 that is not the privacy or verify gate.
   *     `Something did not work. Try again.` + `Retry`. Never the raw reason.
   *   - `stream`: the draft started and did not finish.
   */
  generationFailure?: GenerationFailure;
  /** Called when advocate clicks "Try again" in the generation-failed card */
  onRetry?: () => void;
  /** T-388: what a draft of this template charges (template-configs `credits_cost`). */
  inkCost?: number;
  /** T-388: the cost is being fetched. */
  inkCostLoading?: boolean;
  /** T-388: fetches the cost again when it could not be worked out. */
  onInkCostRetry?: () => void;
  /** T-388: the template id, for the Sentry report only. */
  templateId?: string;
}

/** T-388: ids of the Ink cost lines under the buttons that charge. */
export const SOFT_WARN_INK_COST_ID = 'soft-warn-ink-cost';
/**
 * T-565 W2: the second "Generate anyway" and its cost line are gone, so nothing renders this
 * id now. Kept exported only so existing tests still compile; the tester retires it.
 */
export const SOFT_WARN_SKIP_INK_COST_ID = 'soft-warn-skip-ink-cost';
export const FAILED_RETRY_INK_COST_ID = 'generation-failed-retry-ink-cost';

/** T-388: what a card needs to show the cost and block on an unknown one. */
interface InkCostProps {
  inkCost?: number;
  inkCostLoading?: boolean;
  onInkCostRetry?: () => void;
  templateId?: string;
}

/** T-388 (Arjun): a button that charges waits for a known cost. */
function costBlocked({ inkCost, inkCostLoading = false }: InkCostProps): boolean {
  return inkCostState(inkCost, inkCostLoading) !== 'known';
}

/** The disabled look (`opacity-40`) for the inline-styled buttons below. */
function blockedStyle(blocked: boolean): React.CSSProperties {
  return blocked ? { opacity: 0.4, cursor: 'not-allowed' } : {};
}

// ── Progress bar ──────────────────────────────────────────────────────────────

// T-565 item 43 + T3 (Ajay): Verifying is `Checking inputs`, Validating is `Checking the draft`.
const STEP_LABELS = [
  'Inputs received',
  'Checking inputs',
  'Drafting',
  'Checking the draft',
  'Ready',
];

function ProgressBar({ state }: { state: PipelineState }) {
  // Segment fill colour per state per step (0-indexed)
  function segmentStyle(i: number): React.CSSProperties {
    const green = '#1D9E75';
    const blue = '#185FA5';
    const purple = '#534AB7';
    const amber = '#EF9F27';
    const red = '#E24B4A';
    const grey = 'rgba(0,0,0,0.12)';

    if (state === 'verifying') {
      if (i === 0) return { background: green };
      if (i === 1) return { background: blue };
      return { background: grey };
    }
    if (state === 'soft_warn') {
      if (i === 0) return { background: green };
      if (i === 1) return { background: amber };
      return { background: grey };
    }
    if (state === 'hard_block') {
      if (i === 0) return { background: green };
      if (i === 1) return { background: red };
      return { background: grey };
    }
    if (state === 'generation_failed') {
      // Verifier passed (green), drafting attempted and broke (red), rest grey
      if (i <= 1) return { background: green };
      if (i === 2) return { background: red };
      return { background: grey };
    }
    if (state === 'drafting') {
      if (i <= 1) return { background: green };
      if (i === 2) return { background: purple };
      return { background: grey };
    }
    // ready
    return { background: green };
  }

  function isShimmering(i: number): boolean {
    if (state === 'verifying' && i === 1) return true;
    if (state === 'soft_warn' && i === 1) return true;
    if (state === 'drafting' && i === 2) return true;
    return false;
  }

  return (
    <div className="mb-3 flex gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="relative h-1 flex-1 overflow-hidden rounded-full"
          style={segmentStyle(i)}
        >
          {isShimmering(i) && (
            <div
              className="animate-shimmer absolute inset-0"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function StepBreadcrumb({ state }: { state: PipelineState }) {
  const activeIndex =
    state === 'verifying' || state === 'soft_warn' || state === 'hard_block'
      ? 1
      : state === 'drafting' || state === 'generation_failed'
        ? 2
        : 4;

  const activeColor =
    state === 'soft_warn'
      ? '#BA7517'
      : state === 'hard_block' || state === 'generation_failed'
        ? '#A32D2D'
        : state === 'drafting'
          ? '#534AB7'
          : state === 'ready'
            ? '#1D9E75'
            : '#185FA5';

  return (
    <div className="flex flex-wrap items-center gap-1">
      {STEP_LABELS.map((label, i) => (
        <span key={i} className="flex items-center gap-1">
          <span
            style={{
              fontSize: '11px',
              fontWeight: i === activeIndex ? 500 : 400,
              color: i === activeIndex ? activeColor : 'rgba(0,0,0,0.38)',
            }}
          >
            {label}
          </span>
          {i < STEP_LABELS.length - 1 && (
            <span style={{ fontSize: '11px', color: 'rgba(0,0,0,0.25)' }}>·</span>
          )}
        </span>
      ))}
    </div>
  );
}

// ── Elapsed timer (for drafting state) ───────────────────────────────────────

function ElapsedTimer({ running }: { running: boolean }) {
  const [secs, setSecs] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => setSecs((s) => s + 1), 1000);
    }
    return () => {
      if (ref.current) clearInterval(ref.current);
    };
  }, [running]);

  return (
    <span
      style={{
        fontSize: '13px',
        fontWeight: 500,
        color: '#534AB7',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {secs}s
    </span>
  );
}

// ── Drafting status line ────────────────────────────────────────────────────
//
// T-565 item 43 (Ajay): the timed rotating lines are replaced by one signed line.

const DRAFTING_LINE = 'Writing the draft…';

/**
 * T-565 T1 (Ajay): the old form flow's own line when the stream sent no warning event.
 * (NO_MISMATCH_FOUND is not true here: this flow has no brief.)
 */
const NO_WARNINGS_LINE = 'The drafting checks flagged nothing. Read the draft before you use it.';

/**
 * T-565 T6 + 41b (Ajay): the failure text. This flow cannot confirm that the hold was released,
 * so there is no "No Ink was used." line; the neutral line is shown instead. The server's own
 * reason is not shown (row 41: it goes to logs only).
 */
const DRAFT_DID_NOT_FINISH = 'The draft did not finish.';
const CHECK_DOCUMENTS_LIST = 'Check your documents list to see where this draft stands.';

/** T-565 W1 (Ajay): nothing was sent. Shown alone. Same signed text as the hard-block card. */
const DRAFT_COULD_NOT_START = 'The draft could not start.';

/** T-565 W3 (Ajay): a pre-stream 400/403/409 that is not a gate, with its `Retry` button. */
const SOMETHING_DID_NOT_WORK = 'Something did not work. Try again.';
const RETRY_LABEL = 'Retry';

// ── Icons ─────────────────────────────────────────────────────────────────────

function VerifyingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#185FA5" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v6m0 10v6m11-11h-6m-10 0H1" />
    </svg>
  );
}

function DraftingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#534AB7" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#412402" strokeWidth="2.4">
      <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.6">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

// ── State cards ───────────────────────────────────────────────────────────────

function VerifyingCard({ state }: { state: PipelineState }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '0.5px solid rgba(0,0,0,0.15)',
        borderRadius: '12px',
        padding: '18px 20px',
      }}
    >
      <div className="mb-3 flex items-center gap-3">
        <div
          className="flex-shrink-0"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#E6F1FB',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <VerifyingIcon />
        </div>
        <div className="flex-1">
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: 2 }}>
            Checking your inputs…
          </div>
        </div>
      </div>
      <ProgressBar state={state} />
      <StepBreadcrumb state={state} />
    </div>
  );
}

function SoftWarnCard({
  questions,
  onProceedAnyway,
  onEditForm,
  state,
  cost,
}: {
  questions: string[];
  onProceedAnyway?: () => void;
  onEditForm?: () => void;
  state: PipelineState;
  cost: InkCostProps;
}) {
  const blocked = costBlocked(cost);
  const proceed = blocked ? undefined : onProceedAnyway;
  // T-432: the card shows one cost line, under its one charging button (T-565 W2).
  const questionText = questions[0] ?? 'Please review the flagged inputs before generating.';

  return (
    <div
      style={{
        background: '#FAEEDA',
        border: '0.5px solid #BA7517',
        borderRadius: '12px',
        padding: '18px 20px',
      }}
    >
      <div className="mb-3 flex items-start gap-3">
        <div
          className="flex-shrink-0"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#EF9F27',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WarnIcon />
        </div>
        <div className="flex-1">
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#412402', marginBottom: 4 }}>
            Please check this before you generate.
          </div>
          <div style={{ fontSize: '13px', color: '#633806', lineHeight: 1.55 }}>{questionText}</div>
          {questions.length > 1 && (
            <ul className="mt-2 space-y-1">
              {questions.slice(1).map((q, i) => (
                <li key={i} style={{ fontSize: '13px', color: '#633806', lineHeight: 1.55 }}>
                  · {q}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ProgressBar state={state} />

      <div className="mt-3 flex flex-col gap-2 pl-10">
        <div className="flex flex-col items-stretch gap-1">
          <button
            type="button"
            onClick={proceed}
            disabled={blocked}
            aria-disabled={blocked ? 'true' : undefined}
            aria-describedby={SOFT_WARN_INK_COST_ID}
            style={{
              textAlign: 'left',
              fontSize: '13px',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '0.5px solid #BA7517',
              background: '#fff',
              color: '#412402',
              cursor: 'pointer',
              ...blockedStyle(blocked),
            }}
          >
            Generate anyway
          </button>
          <InkCostLine
            id={SOFT_WARN_INK_COST_ID}
            cost={cost.inkCost}
            loading={cost.inkCostLoading ?? false}
            onRetry={cost.onInkCostRetry}
            kind={cost.templateId ?? 'unknown'}
            action="soft_warn"
          />
        </div>
        <button
          onClick={onEditForm}
          style={{
            textAlign: 'left',
            fontSize: '13px',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '0.5px solid #BA7517',
            background: '#fff',
            color: '#412402',
            cursor: 'pointer',
          }}
        >
          Edit the form
        </button>
      </div>

      {/* T-565 W2 (Ajay): one "Generate anyway" only; the second, link-style one is gone. */}
      <div className="mt-3 pl-10">
        <span style={{ fontSize: '11px', color: '#633806' }}>Please choose one.</span>
      </div>
    </div>
  );
}

function DraftingCard({ templateName, state }: { templateName?: string; state: PipelineState }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '0.5px solid rgba(0,0,0,0.15)',
        borderRadius: '12px',
        padding: '18px 20px',
      }}
    >
      <div className="mb-3 flex items-center gap-3">
        <div
          className="flex-shrink-0"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#EEEDFE',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <DraftingIcon />
        </div>
        <div className="flex-1">
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: 2 }}>
            Writing your {templateName ?? 'document'}…
          </div>
          <div style={{ fontSize: '12px', color: '#5f5e5a' }}>{DRAFTING_LINE}</div>
        </div>
        <ElapsedTimer running={state === 'drafting'} />
      </div>
      <ProgressBar state={state} />
      <StepBreadcrumb state={state} />
    </div>
  );
}

function ReadyCard({
  sectionsCited,
  paragraphCount,
  warningCount,
  onOpenEditor,
}: {
  sectionsCited?: string[];
  paragraphCount?: number;
  warningCount?: number;
  onOpenEditor?: () => void;
}) {
  const citedLabel = sectionsCited && sectionsCited.length > 0 ? sectionsCited.join(', ') : 'none';
  // T-565 T1: with no warnings the signed old-flow line shows (it ends in its own full stop, so
  // none is added after it).
  const warnLabel = warningCount
    ? `${warningCount} warning${warningCount > 1 ? 's' : ''}.`
    : NO_WARNINGS_LINE;

  return (
    <div
      style={{
        background: '#E1F5EE',
        border: '0.5px solid #1D9E75',
        borderRadius: '12px',
        padding: '18px 20px',
      }}
    >
      <div className="mb-3 flex items-center gap-3">
        <div
          className="flex-shrink-0"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#1D9E75',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CheckIcon />
        </div>
        <div className="flex-1">
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#04342C', marginBottom: 2 }}>
            Draft ready
          </div>
          <div style={{ fontSize: '12px', color: '#0F6E56' }}>
            {paragraphCount ? `${paragraphCount} paragraphs. ` : ''}
            Sections: {citedLabel}. {warnLabel}
          </div>
        </div>
      </div>
      <ProgressBar state="ready" />
      <div className="flex gap-2">
        <button
          onClick={onOpenEditor}
          style={{
            fontSize: '13px',
            fontWeight: 500,
            padding: '8px 14px',
            borderRadius: '8px',
            border: '0.5px solid #0F6E56',
            background: '#1D9E75',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Open in editor
        </button>
      </div>
    </div>
  );
}

function HardBlockCard({
  hardBlockReason,
  onEditForm,
}: {
  hardBlockReason?: string;
  onEditForm?: () => void;
}) {
  return (
    <div
      style={{
        background: '#FCEBEB',
        border: '0.5px solid #A32D2D',
        borderRadius: '12px',
        padding: '18px 20px',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#E24B4A',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ErrorIcon />
        </div>
        <div className="flex-1">
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#501313', marginBottom: 4 }}>
            {DRAFT_COULD_NOT_START}
          </div>
          <div style={{ fontSize: '13px', color: '#791F1F', lineHeight: 1.55, marginBottom: 8 }}>
            {hardBlockReason ??
              'A required field is missing or contains an error. Please review the form.'}
          </div>
          <button
            onClick={onEditForm}
            style={{
              fontSize: '13px',
              fontWeight: 500,
              padding: '7px 12px',
              borderRadius: '8px',
              border: '0.5px solid #A32D2D',
              background: '#fff',
              color: '#501313',
              cursor: 'pointer',
            }}
          >
            Edit the form
          </button>
        </div>
      </div>
    </div>
  );
}

function GenerationFailedCard({
  generationRetryable,
  generationFailure = 'stream',
  onRetry,
  onEditForm,
  cost,
}: {
  generationRetryable?: boolean;
  generationFailure?: GenerationFailure;
  onRetry?: () => void;
  onEditForm?: () => void;
  cost: InkCostProps;
}) {
  const blocked = costBlocked(cost);
  // T-565 W1/W3 (Ajay): the signed lines for each kind of failure.
  const lines =
    generationFailure === 'not_started'
      ? [DRAFT_COULD_NOT_START]
      : generationFailure === 'request_failed'
        ? [SOMETHING_DID_NOT_WORK]
        : [DRAFT_DID_NOT_FINISH, CHECK_DOCUMENTS_LIST];
  const retryLabel = generationFailure === 'request_failed' ? RETRY_LABEL : 'Try again';
  return (
    <div
      style={{
        background: '#FCEBEB',
        border: '0.5px solid #A32D2D',
        borderRadius: '12px',
        padding: '18px 20px',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#E24B4A',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ErrorIcon />
        </div>
        <div className="flex-1">
          {/* T-565 (Ajay): the "Drafting could not finish" heading is deleted; the signed
              failure line shows once, here (the step label above is not shown for this state). */}
          <div style={{ fontSize: '13px', color: '#791F1F', lineHeight: 1.55, marginBottom: 10 }}>
            {lines.map((line) => (
              <p key={line} style={{ margin: 0 }}>
                {line}
              </p>
            ))}
          </div>
          {/* T-432: start-aligned, so "Edit the form" does not stretch to the retry column's height. */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {generationRetryable !== false && onRetry && (
              <div className="flex flex-col items-stretch gap-1">
                <button
                  type="button"
                  onClick={blocked ? undefined : onRetry}
                  disabled={blocked}
                  aria-disabled={blocked ? 'true' : undefined}
                  aria-describedby={FAILED_RETRY_INK_COST_ID}
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#A32D2D',
                    color: '#fff',
                    cursor: 'pointer',
                    ...blockedStyle(blocked),
                  }}
                >
                  {retryLabel}
                </button>
                <InkCostLine
                  id={FAILED_RETRY_INK_COST_ID}
                  cost={cost.inkCost}
                  loading={cost.inkCostLoading ?? false}
                  onRetry={cost.onInkCostRetry}
                  kind={cost.templateId ?? 'unknown'}
                  action="retry"
                />
              </div>
            )}
            <button
              onClick={onEditForm}
              style={{
                fontSize: '13px',
                fontWeight: 500,
                padding: '7px 12px',
                borderRadius: '8px',
                border: '0.5px solid #A32D2D',
                background: '#fff',
                color: '#501313',
                cursor: 'pointer',
              }}
            >
              Edit the form
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PipelineStatus({
  state,
  questions = [],
  hardBlockReason,
  templateName,
  sectionsCited,
  paragraphCount,
  warningCount,
  onProceedAnyway,
  onEditForm,
  onOpenEditor,
  generationRetryable,
  generationFailure,
  onRetry,
  inkCost,
  inkCostLoading,
  onInkCostRetry,
  templateId,
}: PipelineStatusProps) {
  const cost: InkCostProps = { inkCost, inkCostLoading, onInkCostRetry, templateId };
  // T-565 (Ajay): on a failed run the card carries the one signed failure line, so there is
  // no step label (`The draft did not finish.` shows once only; W1/W3 cards say otherwise).
  const stepLabel =
    state === 'verifying'
      ? 'Step 2 of 5 — checking inputs'
      : state === 'soft_warn'
        ? 'Step 2 of 5 — please check your inputs'
        : state === 'hard_block'
          ? 'The draft could not start.'
          : state === 'generation_failed'
            ? null
            : state === 'drafting'
              ? 'Step 3 of 5 — writing the draft'
              : 'Step 5 of 5 — ready';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {stepLabel !== null && (
        <span
          style={{
            fontSize: '11px',
            color: 'rgba(0,0,0,0.38)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {stepLabel}
        </span>
      )}

      {state === 'verifying' && <VerifyingCard state={state} />}

      {state === 'soft_warn' && (
        <SoftWarnCard
          questions={questions}
          onProceedAnyway={onProceedAnyway}
          onEditForm={onEditForm}
          state={state}
          cost={cost}
        />
      )}

      {state === 'drafting' && <DraftingCard templateName={templateName} state={state} />}

      {state === 'ready' && (
        <ReadyCard
          sectionsCited={sectionsCited}
          paragraphCount={paragraphCount}
          warningCount={warningCount}
          onOpenEditor={onOpenEditor}
        />
      )}

      {state === 'hard_block' && (
        <HardBlockCard hardBlockReason={hardBlockReason} onEditForm={onEditForm} />
      )}

      {state === 'generation_failed' && (
        <GenerationFailedCard
          generationRetryable={generationRetryable}
          generationFailure={generationFailure}
          onRetry={onRetry}
          onEditForm={onEditForm}
          cost={cost}
        />
      )}
    </div>
  );
}
