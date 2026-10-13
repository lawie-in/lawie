'use client';

/**
 * Draft ready (T-126): D1 with rules and no label, D2 with rules and the
 * label, D3 with no rule pack. The label, the line under it and every finding
 * are printed as the service sent them. The label cannot be dismissed.
 */
import { Check } from 'lucide-react';

import type { DraftResult } from './briefTypes';
import { card, linkButton, primaryButton, tagTeal } from './ui';

/**
 * T-136. Ajay's text (CLO, 7 Oct 2026, part 1, C5), word for word, in place of
 * "No problems found.". Do not reword.
 */
const NO_MISMATCH_FOUND =
  'These checks found no mismatch between the draft and your brief (dates, names, numbers, sections and parts). They can miss things, and they do not check the law. Read every line before use.';

export default function DraftReadyStep({
  result,
  onOpenEditor,
  onStartAnother,
}: {
  result: DraftResult;
  onOpenEditor: () => void;
  onStartAnother: () => void;
}) {
  const factCheck = result.factCheck ?? null;
  // T-197: the signed disclaimer shows on every draft, once. With the banner it is the
  // banner's last line; without it, a neutral note in the same slot. The text is the
  // service's; there is no copy of it in the web app.
  const disclaimer = result.disclaimer ?? null;
  // T-373 (ADR-025 D1): on a D1 pack the missing parts are read off the clauses the
  // renderer printed. The title is the service's own for that clause, else the clause's
  // blank labels. Fallback clauses are not shown (no design for them yet).
  const missingParts: Array<{ id: string; title: string }> = result.rendered
    ? result.rendered
        .filter((r) => r.status === 'missing')
        .map((r) => ({
          id: r.clauseId,
          title:
            result.missingClauses.find((m) => m.id === r.clauseId)?.title ??
            (r.missing && r.missing.length > 0 ? r.missing.join(', ') : r.clauseId),
        }))
    : result.missingClauses;
  const nothingFound =
    missingParts.length === 0 && result.findings.length === 0 && factCheck === null;

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
        {factCheck && (
          <div
            role="note"
            aria-labelledby="ready-fact-check"
            className="border-brand-gold bg-brand-gold-light mt-3 rounded-lg border px-3.5 py-2.5"
          >
            {/* T-147d: the wording is the service's; Priya, Madhuri and Rajesh to word and design it. */}
            <p id="ready-fact-check" className="text-brand-gold-dark text-sm font-semibold">
              {factCheck.text}
            </p>
            <ul className="mt-2 space-y-1.5">
              {factCheck.items.map((item, i) => (
                <li key={i} className="text-brand-gold-dark flex items-start gap-2.5 text-sm">
                  <span className="bg-brand-gold mt-1.5 h-2 w-2 flex-none rounded-full" />
                  <span>
                    <strong className="font-semibold">{item.label}:</strong> {item.note}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-brand-gold-dark mt-2 text-sm">{factCheck.disclaimer}</p>
          </div>
        )}
        {!factCheck && disclaimer && (
          <div
            role="note"
            className="border-brand-line bg-brand-page mt-3 rounded-lg border px-3.5 py-2.5"
          >
            <p className="text-brand-navy text-sm">{disclaimer}</p>
          </div>
        )}
        {nothingFound ? (
          <p className="text-brand-navy mt-3 flex items-start gap-2.5 text-sm">
            <span className="bg-brand-teal flex h-6 w-6 flex-none items-center justify-center rounded-full text-white">
              <Check size={14} aria-hidden="true" />
            </span>
            <span>{NO_MISMATCH_FOUND}</span>
          </p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {missingParts.map((c) => (
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
