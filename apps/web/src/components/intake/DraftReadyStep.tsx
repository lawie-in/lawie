'use client';

/**
 * Draft ready (T-126): D1 with rules and no label, D2 with rules and the
 * label, D3 with no rule pack. The label, the line under it and every finding
 * are printed as the service sent them. The label cannot be dismissed.
 *
 * T-521 (Night Library, spec 05): the folio with the "N Ink used" chip,
 * Finalise (primary), Open in editor and Export. The draft text is not fetched
 * here (today's layout is kept). Export opens the editor's export as it is.
 * No "Checks: N items" chip: there is no signed or existing wording for it
 * (Priya's ruling: leave it out). No Regenerate (cut by Priya).
 */
import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { DraftResult } from './briefTypes';
import { finaliseDocument } from './draftActions';
import { actions, folio, linkButton, page } from './nlUi';

import { Button, Chip, ErrorState, InkChip, Spinner } from '@/components/ui';

/**
 * T-136. Ajay's text (CLO, 7 Oct 2026, part 1, C5), word for word, in place of
 * "No problems found.". Do not reword.
 */
const NO_MISMATCH_FOUND =
  'These checks found no mismatch between the draft and your brief (dates, names, numbers, sections and parts). They can miss things, and they do not check the law. Read every line before use.';

/** T-521: functional labels with no signed string (listed for Ajay's review). */
export const DRAFT_READY_COPY = {
  finalise: 'Finalise',
  export: 'Export',
  exportAfterFinalise: 'Export PDF / Word',
  /** "{n} Ink used" (spec 05 chip "1 Ink used"). */
  inkUsed: 'Ink used',
  /** Copy row 455, signed: the generic failure, used when Finalise fails. */
  finaliseFailed: 'Something did not work. Try again.',
} as const;

export default function DraftReadyStep({
  result,
  onOpenEditor,
  onStartAnother,
  onExport,
}: {
  result: DraftResult;
  onOpenEditor: () => void;
  onStartAnother: () => void;
  /** T-521: opens the editor's export. Without it, Export opens the editor. */
  onExport?: () => void;
}) {
  const [finalise, setFinalise] = useState<'idle' | 'saving' | 'done' | 'failed'>('idle');
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

  const docId = result.docId;
  const finalised = finalise === 'done';
  const saving = finalise === 'saving';
  // Ajay (AJ-521-M1 to M8): the chip shows the real debit only, never "0 Ink used". Unknown,
  // zero or not a finite number: no chip. A failed draft never reaches this screen.
  const inkUsed =
    typeof result.inkUsed === 'number' && Number.isFinite(result.inkUsed) && result.inkUsed > 0
      ? result.inkUsed
      : null;
  // T-521 (a11y, WCAG 2.4.3): focus never falls to <body>. Finalise stays focusable while it
  // saves (aria-disabled, not disabled); on success it unmounts and focus moves to Export,
  // which becomes the primary "Export PDF / Word". On failure focus stays on Finalise.
  const finaliseRef = useRef<HTMLButtonElement>(null);
  const exportRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (finalised) exportRef.current?.focus();
  }, [finalised]);
  const runFinalise = async () => {
    if (!docId || saving || finalised) return;
    setFinalise('saving');
    try {
      await finaliseDocument(docId);
      setFinalise('done');
    } catch {
      setFinalise('failed');
    }
  };
  /** Retry in the error unmounts with the error, so focus goes to Finalise first. */
  const retryFinalise = () => {
    finaliseRef.current?.focus();
    void runFinalise();
  };

  return (
    <div className={`${page} space-y-nl-4`}>
      <div className={`${folio} gap-nl-3 flex items-start`}>
        <span className="bg-nl-ok-light text-nl-ok flex h-8 w-8 flex-none items-center justify-center rounded-full">
          <Check size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="nl-h2 text-nl-text">Your draft is ready</h1>
          {/* T-521: a guided document's name is typed by the advocate and can be one long word. */}
          <p className="nl-body-sm text-nl-soft break-words">
            {result.name}. Read it through and edit before you use it.
          </p>
          <div
            className={`gap-nl-2 flex flex-wrap items-center ${
              inkUsed !== null || finalised ? 'mt-nl-3' : ''
            }`}
          >
            {inkUsed !== null && (
              <InkChip balance={inkUsed} data-testid="ink-used-chip">
                <span>
                  <span className="tabular-nums">{inkUsed}</span> {DRAFT_READY_COPY.inkUsed}
                </span>
              </InkChip>
            )}
            {/* WCAG 4.1.3: always mounted and empty at first, so "finalised" is announced
                when the chip appears. */}
            <span role="status">
              {finalised && (
                // The status word as the documents list and the editor show it: the advocate's
                // own mark (Ajay); it never says Lawie checked the draft.
                <Chip variant="ok" className="capitalize" data-testid="finalised-chip">
                  finalised
                </Chip>
              )}
            </span>
          </div>
        </div>
      </div>

      {result.startingDraft && result.startingDraftLabel && (
        <div role="note" className="border-nl-warn bg-nl-warn-light px-nl-4 py-nl-3 border">
          <p className="nl-body-sm text-nl-warn break-words font-medium">
            {result.startingDraftLabel}
          </p>
          {result.labelReason && (
            <p className="nl-body-sm text-nl-warn mt-nl-1 break-words">{result.labelReason}</p>
          )}
        </div>
      )}

      <section aria-labelledby="ready-checks" className={folio}>
        <div className="gap-nl-2 flex flex-wrap items-center justify-between">
          <h2 id="ready-checks" className="nl-h3 text-nl-text">
            Checks run for you
          </h2>
          <Chip variant="ok">No charge</Chip>
        </div>
        {factCheck && (
          <div
            role="note"
            aria-labelledby="ready-fact-check"
            className="border-nl-warn bg-nl-warn-light mt-nl-3 px-nl-4 py-nl-3 border"
          >
            {/* T-147d: the wording is the service's; Priya, Madhuri and Rajesh to word and design it. */}
            <p id="ready-fact-check" className="nl-body-sm text-nl-warn break-words font-medium">
              {factCheck.text}
            </p>
            <ul className="mt-nl-2 space-y-1.5">
              {factCheck.items.map((item, i) => (
                <li key={i} className="nl-body-sm text-nl-warn flex items-start gap-2.5">
                  <span className="bg-nl-warn mt-2 h-2 w-2 flex-none rounded-full" />
                  <span className="min-w-0 break-words">
                    <strong className="font-medium">{item.label}:</strong> {item.note}
                  </span>
                </li>
              ))}
            </ul>
            <p className="nl-body-sm text-nl-warn mt-nl-2 break-words">{factCheck.disclaimer}</p>
          </div>
        )}
        {!factCheck && disclaimer && (
          <div role="note" className="border-nl-line bg-nl-wood mt-nl-3 px-nl-4 py-nl-3 border">
            <p className="nl-body-sm text-nl-text break-words">{disclaimer}</p>
          </div>
        )}
        {nothingFound ? (
          <p className="nl-body-sm text-nl-text mt-nl-3 flex items-start gap-2.5">
            <span className="bg-nl-ok-light text-nl-ok flex h-6 w-6 flex-none items-center justify-center rounded-full">
              <Check size={14} aria-hidden="true" />
            </span>
            <span>{NO_MISMATCH_FOUND}</span>
          </p>
        ) : (
          <ul className="mt-nl-3 space-y-2.5">
            {missingParts.map((c) => (
              <li key={c.id} className="nl-body-sm text-nl-text flex items-start gap-2.5">
                <span className="bg-nl-err mt-2 h-2 w-2 flex-none rounded-full" />
                <span className="min-w-0 break-words">
                  <strong className="font-medium">Missing part.</strong> {c.title}
                </span>
              </li>
            ))}
            {result.findings.map((f, i) => (
              <li key={i} className="nl-body-sm text-nl-text flex items-start gap-2.5">
                <span className="bg-nl-warn mt-2 h-2 w-2 flex-none rounded-full" />
                <span className="min-w-0 break-words">{f.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {result.blanks > 0 && (
        <p className="border-nl-line bg-nl-wood nl-body-sm text-nl-soft p-nl-3 border">
          <strong className="text-nl-text font-medium">
            {result.blanks} {result.blanks === 1 ? 'blank' : 'blanks'} to fill
          </strong>{' '}
          before use. They are marked in the draft in square brackets, like this:{' '}
          <span className="text-nl-brass-dark font-mono text-xs">[To be confirmed: …]</span>
        </p>
      )}

      {docId === null && (
        <p role="alert" className="bg-nl-err-light nl-body-sm text-nl-err p-nl-3">
          The draft was written but could not be saved, so it cannot be opened. Please start again.
        </p>
      )}

      {finalise === 'failed' && (
        <ErrorState message={DRAFT_READY_COPY.finaliseFailed} onRetry={retryFinalise} />
      )}

      <div className={`${actions} pt-nl-2`}>
        <button type="button" onClick={onStartAnother} className={linkButton}>
          Start another document
        </button>
        {docId !== null && (
          <div className="gap-nl-3 flex flex-col-reverse min-[640px]:flex-row min-[640px]:items-center">
            <Button variant="ghost" onClick={onOpenEditor}>
              Open in editor
            </Button>
            {/* One primary per screen: Finalise until the draft is finalised, then Export. */}
            <Button
              ref={exportRef}
              variant={finalised ? 'primary' : 'ghost'}
              onClick={onExport ?? onOpenEditor}
            >
              {finalised ? DRAFT_READY_COPY.exportAfterFinalise : DRAFT_READY_COPY.export}
            </Button>
            {!finalised && (
              // Not `loading`: that sets native disabled, which drops focus to <body>.
              <Button
                ref={finaliseRef}
                aria-disabled={saving || undefined}
                aria-busy={saving || undefined}
                data-loading={saving || undefined}
                className={saving ? 'cursor-progress opacity-50' : undefined}
                onClick={() => void runFinalise()}
              >
                {saving && <Spinner />}
                {DRAFT_READY_COPY.finalise}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
