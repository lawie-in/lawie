'use client';

/**
 * 01 Describe — T-103, design T-005 §5 "01 Describe".
 * One text box. Continue is disabled until there is enough text.
 * Image attach is T-301 and not here.
 *
 * T-125: when the advocate came from "Browse document types", the document is
 * already set and its name is the heading (T-126, G1).
 *
 * T-521 (Night Library, spec 04): the textarea on the folio, underline style,
 * with the signed placeholder (copy file, command bar). The text is held by
 * OneFlow, so it is kept on every error.
 */
import { useId } from 'react';

import { folio, h1, linkButton, page, sub } from './nlUi';

import { Button, Textarea } from '@/components/ui';

export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 4000;

/** Signed: handoff/copy/T-511-copy-v1.md (dashboard command bar placeholder; spec 04 empty state). */
export const DESCRIBE_PLACEHOLDER = 'A bail application for a client arrested on Tuesday…';

export default function DescribeStep({
  value,
  onChange,
  onSubmit,
  onBrowse,
  submitting,
  message,
  documentName,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onBrowse: () => void;
  submitting: boolean;
  /** A problem to show above the actions (unavailable, limit reached, bad input). */
  message?: { text: string; retry?: boolean } | null;
  /** Set when the document was picked from "Browse document types". */
  documentName?: string | null;
}) {
  const id = useId();
  const length = value.trim().length;
  const tooShort = length < DESCRIPTION_MIN;
  const canContinue = !tooShort && length <= DESCRIPTION_MAX && !submitting;

  return (
    <div className={page}>
      <h1 className={`${h1} break-words`}>{documentName ?? 'What do you need to draft?'}</h1>
      <p className={sub}>
        {documentName
          ? 'Describe the matter in your own words. We then ask for the details this document needs.'
          : 'Describe the matter in your own words. We will suggest a document and ask for the details it needs.'}
      </p>

      <form
        className={`${folio} mt-nl-6`}
        onSubmit={(e) => {
          e.preventDefault();
          if (canContinue) onSubmit();
        }}
      >
        <Textarea
          id={id}
          label="Your matter"
          appearance="underline"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={DESCRIPTION_MAX}
          placeholder={DESCRIBE_PLACEHOLDER}
          aria-describedby={`${id}-hint`}
          rows={6}
          className="min-h-[150px] min-[640px]:min-h-[190px]"
        />
        <div
          id={`${id}-hint`}
          className="nl-body-sm text-nl-muted mt-nl-2 gap-nl-2 flex flex-wrap items-center justify-between"
        >
          <span>
            {tooShort && length > 0
              ? `A little more, please: at least ${DESCRIPTION_MIN} characters.`
              : 'Names, dates, amounts and the court, if there is one, all help. You can add anything later.'}
          </span>
          <span aria-live="polite" className="tabular-nums">
            {length} / {DESCRIPTION_MAX}
          </span>
        </div>

        {message && (
          <div
            role="alert"
            className="border-nl-err bg-nl-err-light nl-body-sm text-nl-err mt-nl-4 p-nl-3 border"
          >
            {message.text}
          </div>
        )}

        <div className="mt-nl-5 flex justify-end">
          <Button
            type="submit"
            disabled={!canContinue}
            loading={submitting}
            className="w-full min-[640px]:w-auto"
          >
            {message?.retry ? 'Try again' : 'Continue'}
          </Button>
        </div>
        {/* The Button's spinner replaces its label while submitting; this line says what is
            happening. The live region is always rendered (never display:none) and filled
            later, so screen readers announce the text when it appears. */}
        <p
          className={`nl-body-sm text-nl-muted text-right ${submitting ? 'mt-nl-2' : ''}`}
          role="status"
        >
          {submitting ? 'Reading your description…' : null}
        </p>
      </form>

      <p className="nl-body-sm text-nl-soft mt-nl-4 text-center">
        {documentName ? 'Not this document?' : 'Know the document you need?'}{' '}
        <button type="button" onClick={onBrowse} className={linkButton}>
          Browse document types
        </button>
      </p>
    </div>
  );
}
