'use client';

/**
 * Draft ready (T-126): D1 with rules and no label, D2 with rules and the
 * label, D3 with no rule pack. The label, the line under it and every finding
 * are printed as the service sent them. The label cannot be dismissed.
 */
import { Check } from 'lucide-react';

import type { DraftResult } from './briefTypes';
import { card, linkButton, primaryButton, tagTeal } from './ui';

export default function DraftReadyStep({
  result,
  onOpenEditor,
  onStartAnother,
}: {
  result: DraftResult;
  onOpenEditor: () => void;
  onStartAnother: () => void;
}) {
  const nothingFound = result.missingClauses.length === 0 && result.findings.length === 0;

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4">
      <div className="bg-brand-teal-light flex items-center gap-3 rounded-xl p-4">
        <span className="bg-brand-teal flex h-8 w-8 flex-none items-center justify-center rounded-full text-white">
          <Check size={18} aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-heading text-brand-navy text-xl font-semibold sm:text-2xl">
            Your draft is ready
          </h1>
          <p className="text-brand-muted text-sm">
            {result.name}. Read it through and edit before you use it.
          </p>
        </div>
      </div>

      {result.startingDraft && result.startingDraftLabel && (
        <div
          role="note"
          className="border-brand-gold bg-brand-gold-light rounded-lg border px-3.5 py-2.5"
        >
          <p className="text-brand-gold-dark text-sm font-semibold">{result.startingDraftLabel}</p>
          {result.labelReason && (
            <p className="text-brand-gold-dark mt-1 text-sm">{result.labelReason}</p>
          )}
        </div>
      )}

      <section aria-labelledby="ready-checks" className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ready-checks" className="font-heading text-brand-navy text-lg font-semibold">
            Checks run for you
          </h2>
          <span className={tagTeal}>No charge</span>
        </div>
        {nothingFound ? (
          <p className="text-brand-navy mt-3 flex items-center gap-2.5 text-sm">
            <span className="bg-brand-teal flex h-6 w-6 flex-none items-center justify-center rounded-full text-white">
              <Check size={14} aria-hidden="true" />
            </span>
            No problems found.
          </p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {result.missingClauses.map((c) => (
              <li key={c.id} className="text-brand-navy flex items-start gap-2.5 text-sm">
                <span className="bg-brand-error mt-1.5 h-2 w-2 flex-none rounded-full" />
                <span>
                  <strong className="font-semibold">Missing part.</strong> {c.title}
                </span>
              </li>
            ))}
            {result.findings.map((f, i) => (
              <li key={i} className="text-brand-navy flex items-start gap-2.5 text-sm">
                <span className="bg-brand-gold mt-1.5 h-2 w-2 flex-none rounded-full" />
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {result.blanks > 0 && (
        <p className="bg-brand-page text-brand-muted rounded-lg p-3 text-sm">
          <strong className="text-brand-navy font-semibold">
            {result.blanks} {result.blanks === 1 ? 'blank' : 'blanks'} to fill
          </strong>{' '}
          before use. They are marked in the draft in square brackets, like this:{' '}
          <span className="text-brand-gold-dark font-mono text-xs">[To be confirmed: …]</span>
        </p>
      )}

      {result.docId === null && (
        <p role="alert" className="bg-brand-error-light text-brand-error rounded-lg p-3 text-sm">
          The draft was written but could not be saved, so it cannot be opened. Please start again.
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={onStartAnother} className={linkButton}>
          Start another document
        </button>
        {result.docId !== null && (
          <button type="button" onClick={onOpenEditor} className={primaryButton}>
            Open in editor
          </button>
        )}
      </div>
    </div>
  );
}
