'use client';

/**
 * PipelineStatus — SCRUM-70
 *
 * 5-state pipeline stepper displayed during document generation:
 *   verifying  → blue,   crosshair icon, 2-segment shimmer
 *   soft_warn  → amber,  triangle icon,  questions + 2 actions
 *   drafting   → purple, file icon,      elapsed-seconds counter, 3-segment shimmer
 *   ready      → green,  checkmark,      all 5 bars green, Open / Export CTA
 *   hard_block → red,    error icon,     block reason, Edit form CTA
 *
 * Design reference: /docs/designs/draft-pipeline-status-bar-2026-05-06.html
 *
 * Drives off:
 *   - POST /preflight response (verifying → soft_warn | hard_block | proceed)
 *   - SSE events from /generate (drafting → ready)
 */

import { useEffect, useRef, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PipelineState =
  | 'verifying'
  | 'soft_warn'
  | 'drafting'
  | 'ready'
  | 'hard_block'
  | 'generation_failed';

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
  /** Called when advocate clicks "Edit form" in soft-warn or hard-block */
  onEditForm?: () => void;
  /** Called when advocate clicks "Open in editor" in ready */
  onOpenEditor?: () => void;
  /** Generation-failed reason (from server `event: error` SSE) */
  generationError?: string;
  /** Whether the failure is retryable — controls "Try again" button visibility */
  generationRetryable?: boolean;
  /** Called when advocate clicks "Try again" in the generation-failed card */
  onRetry?: () => void;
}

// ── Progress bar ──────────────────────────────────────────────────────────────

const STEP_LABELS = ['Inputs received', 'Verifying', 'Drafting', 'Validating', 'Ready'];

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
    <span style={{ fontSize: '13px', fontWeight: 500, color: '#534AB7', fontVariantNumeric: 'tabular-nums' }}>
      {secs}s
    </span>
  );
}

// ── Rotating status messages (drafting state) ───────────────────────────────
//
// Real bail-draft generation observed at ~45-75s. Cycle through legal-drafting
// status phrases so the advocate sees progress instead of a single static line.
// Phrases roughly map to pipeline phases (form → court rules → AI body → cite-
// check → prayer/verification → polish). After the last phrase fires, hold on
// it indefinitely rather than looping — looping feels stuck.

const DRAFTING_MESSAGES = [
  'Reading the form…',
  'Loading court rules…',
  'Thinking through the facts…',
  'Synthesizing the grounds…',
  'Drafting numbered paragraphs…',
  'Citing BNS / BNSS sections…',
  'Composing the prayer clause…',
  'Building the verification block…',
  'Cross-checking dates and parties…',
  'Final polish — almost there…',
];

function RotatingStatus({ running }: { running: boolean }) {
  const [idx, setIdx] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      setIdx(0);
      return;
    }
    // Advance every 6 seconds. 10 messages × 6s = 60s — sized for a ~1-minute draft.
    // After the last index, the interval keeps firing but setIdx is a no-op.
    ref.current = setInterval(() => {
      setIdx((i) => (i < DRAFTING_MESSAGES.length - 1 ? i + 1 : i));
    }, 6000);
    return () => {
      if (ref.current) clearInterval(ref.current);
    };
  }, [running]);

  return (
    <div
      key={idx}
      style={{
        fontSize: '12px',
        color: '#5f5e5a',
        animation: 'lawie-fade-in 0.4s ease-out',
      }}
    >
      {DRAFTING_MESSAGES[idx]}
      <style>{`
        @keyframes lawie-fade-in {
          from { opacity: 0; transform: translateY(2px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

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
            Verifying your inputs…
          </div>
          <div style={{ fontSize: '12px', color: '#5f5e5a' }}>
            Cross-checking sections, dates, and jurisdiction. Takes about 2 seconds.
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
}: {
  questions: string[];
  onProceedAnyway?: () => void;
  onEditForm?: () => void;
  state: PipelineState;
}) {
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
            Ek baat dhyan mein aayi — confirm kar lein?
          </div>
          <div style={{ fontSize: '13px', color: '#633806', lineHeight: 1.55 }}>
            {questionText}
          </div>
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
        <button
          onClick={onProceedAnyway}
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
          Looks correct — generate anyway
        </button>
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
          Let me fix this — edit form
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between pl-10">
        <button
          onClick={onProceedAnyway}
          style={{
            fontSize: '12px',
            color: '#633806',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            borderBottom: '0.5px solid #633806',
          }}
        >
          Skip and generate anyway
        </button>
        <span style={{ fontSize: '11px', color: '#633806' }}>Verifier paused — pick one</span>
      </div>
    </div>
  );
}

function DraftingCard({
  templateName,
  state,
}: {
  templateName?: string;
  state: PipelineState;
}) {
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
            Drafting your {templateName ?? 'document'}…
          </div>
          <RotatingStatus running={state === 'drafting'} />
          <div style={{ fontSize: '11px', color: '#9a9893', marginTop: 2 }}>
            Usually around a minute. You can leave this open.
          </div>
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
  const citedLabel =
    sectionsCited && sectionsCited.length > 0 ? sectionsCited.join(', ') : 'none';
  const warnLabel = warningCount ? `${warningCount} warning${warningCount > 1 ? 's' : ''}` : 'No warnings';

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
            Sections: {citedLabel}. {warnLabel}.
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
            Cannot generate this draft
          </div>
          <div style={{ fontSize: '13px', color: '#791F1F', lineHeight: 1.55, marginBottom: 8 }}>
            {hardBlockReason ?? 'A required field is missing or contains an error. Please review the form.'}
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
            Edit form
          </button>
        </div>
      </div>
    </div>
  );
}

function GenerationFailedCard({
  generationError,
  generationRetryable,
  onRetry,
  onEditForm,
}: {
  generationError?: string;
  generationRetryable?: boolean;
  onRetry?: () => void;
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
            Drafting could not finish
          </div>
          <div style={{ fontSize: '13px', color: '#791F1F', lineHeight: 1.55, marginBottom: 10 }}>
            {generationError ??
              'The AI service returned an error mid-draft. Please try again.'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {generationRetryable !== false && onRetry && (
              <button
                onClick={onRetry}
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#A32D2D',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
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
              Edit form
            </button>
          </div>
          <div style={{ fontSize: '11px', color: '#9a6d6d', marginTop: 8 }}>
            Your inputs are saved — re-trying does not lose anything.
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
  generationError,
  generationRetryable,
  onRetry,
}: PipelineStatusProps) {
  const stepLabel =
    state === 'verifying'
      ? 'Step 2 of 5 — verifying inputs'
      : state === 'soft_warn'
        ? 'Step 2 of 5 — verifier flagged something'
        : state === 'hard_block'
          ? 'Error — verifier hard-blocked'
          : state === 'generation_failed'
            ? 'Error — drafting could not finish'
            : state === 'drafting'
              ? 'Step 3 of 5 — drafting (streaming)'
              : 'Step 5 of 5 — ready';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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

      {(state === 'verifying') && <VerifyingCard state={state} />}

      {state === 'soft_warn' && (
        <SoftWarnCard
          questions={questions}
          onProceedAnyway={onProceedAnyway}
          onEditForm={onEditForm}
          state={state}
        />
      )}

      {state === 'drafting' && (
        <DraftingCard templateName={templateName} state={state} />
      )}

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
          generationError={generationError}
          generationRetryable={generationRetryable}
          onRetry={onRetry}
          onEditForm={onEditForm}
        />
      )}
    </div>
  );
}
