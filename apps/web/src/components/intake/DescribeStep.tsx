'use client';

/**
 * 01 Describe — T-103, design T-005 §5 "01 Describe".
 * One text box. Continue is disabled until there is enough text.
 * Image attach is T-301 and not here.
 *
 * T-125: when the advocate came from "Browse document types", the document is
 * already set and its name is the heading (T-126, G1).
 */
import { ExternalLink, Loader2 } from 'lucide-react';
import { useId } from 'react';

export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 4000;

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
    <div className="mx-auto w-full max-w-[720px]">
      <h1 className="font-heading text-brand-navy text-[26px] font-semibold leading-8 sm:text-[34px] sm:leading-[42px]">
        {documentName ?? 'What do you need to draft?'}
      </h1>
      <p className="text-brand-muted mt-2 text-base">
        {documentName
          ? 'Describe the matter in your own words. We ask only for what is missing.'
          : 'Describe the matter in your own words. We will pick the right document and ask only for what is missing.'}
      </p>

      <form
        className="border-brand-line mt-6 rounded-xl border bg-white p-4 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (canContinue) onSubmit();
        }}
      >
        <label htmlFor={id} className="text-brand-navy text-sm font-medium">
          Your matter
        </label>
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={DESCRIPTION_MAX}
          placeholder="For example: My client was arrested on 15 March in FIR 124/2026 at Kotwali police station, Patna, under section 103 BNS, and we need to apply for regular bail."
          aria-describedby={`${id}-hint`}
          className="border-brand-line text-brand-navy placeholder:text-brand-muted/70 focus:border-brand-teal focus:ring-brand-teal mt-2 block min-h-[150px] w-full resize-y rounded-lg border bg-white p-3 text-base leading-6 outline-none focus:ring-2 sm:min-h-[190px]"
        />
        <div
          id={`${id}-hint`}
          className="text-brand-muted mt-2 flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <span>
            {tooShort && length > 0
              ? `A little more, please: at least ${DESCRIPTION_MIN} characters.`
              : 'Names, dates, FIR number and court help. You can add anything later.'}
          </span>
          <span aria-live="polite">
            {length} / {DESCRIPTION_MAX}
          </span>
        </div>

        <a
          href="https://scrb.bihar.gov.in/FIRiew.aspx"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-teal-dark focus-visible:ring-brand-teal mt-3 inline-flex min-h-[44px] items-center gap-1 text-sm underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2"
        >
          Find your FIR on the Bihar police portal
          <ExternalLink size={14} aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>

        {message && (
          <div
            role="alert"
            className="border-brand-error/30 bg-brand-error-light text-brand-error mt-4 rounded-lg border p-3 text-sm"
          >
            {message.text}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={!canContinue}
            className="bg-brand-navy focus-visible:ring-brand-teal inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg px-6 text-base font-medium text-white transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {submitting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {submitting ? 'Reading your description…' : message?.retry ? 'Try again' : 'Continue'}
          </button>
        </div>
      </form>

      <p className="text-brand-muted mt-4 text-center text-sm">
        {documentName ? 'Not this document?' : 'Know the document you need?'}{' '}
        <button
          type="button"
          onClick={onBrowse}
          className="text-brand-teal-dark focus-visible:ring-brand-teal min-h-[44px] underline underline-offset-2 focus:outline-none focus-visible:ring-2"
        >
          Browse document types
        </button>
      </p>
    </div>
  );
}
