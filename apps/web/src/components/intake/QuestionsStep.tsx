'use client';

/**
 * 02 and 02b Questions (T-005, T-109), now fed by the brief (T-105).
 *
 * With a rule pack the questions are the required facts still missing, each
 * with its own kind of field. With no rule pack they are the Reception
 * questions: free text, written for this request. Any may stay empty. What is
 * skipped becomes a visible blank in the draft.
 */
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { type BriefQuestion, dateInWords, describeValue, type Value } from './briefTypes';
import { card, h1, label as labelClass, linkButton, primaryButton, small, sub } from './ui';
import ValueInput from './ValueInput';

/** T-498: a suggestion as the brief shows it: a date in words, a list joined. */
function suggestionText(q: BriefQuestion, v: Value): string {
  return q.kind === 'date' && typeof v === 'string' ? dateInWords(v) : describeValue(v);
}

export default function QuestionsStep({
  documentName,
  questions,
  round,
  totalRounds,
  description,
  busy,
  onSubmit,
  onSkip,
  onEditDescription,
  suggestions = {},
}: {
  documentName: string | null;
  questions: BriefQuestion[];
  /**
   * T-498: by question key, a value the brief read from the description for a
   * fact the ledger could not read. Shown under the field, marked "Please
   * check"; it is the advocate's answer only once they tap it.
   */
  suggestions?: Record<string, Value>;
  round: number;
  totalRounds: number;
  description: string;
  busy: boolean;
  /**
   * `blankKeys` (T-629, §(i)2): the questions left blank on this submit. They
   * were asked; the service decides which count as answered.
   */
  onSubmit: (
    answers: Array<{ question: BriefQuestion; value: Value }>,
    blankKeys: string[],
  ) => void;
  onSkip: () => void;
  onEditDescription: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, Value>>({});
  const count = questions.length;

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <h1 className={h1}>A few questions about what you need</h1>
      <p className={sub}>
        Round {round} of {totalRounds} · {count} {count === 1 ? 'question' : 'questions'}. Answer
        what you can. Anything you skip becomes a visible blank in the draft.
      </p>

      <div className={`${card} mt-6 flex flex-wrap items-center gap-3 !p-3.5`}>
        <div className="min-w-0 flex-1">
          <p className="text-brand-muted text-xs font-semibold uppercase tracking-wider">
            {documentName ? documentName : 'Your description'}
          </p>
          <p className="text-brand-navy truncate text-sm">{description}</p>
        </div>
        <button type="button" onClick={onEditDescription} className={linkButton}>
          Edit
        </button>
      </div>

      <form
        className={`${card} mt-4 space-y-5`}
        onSubmit={(e) => {
          e.preventDefault();
          const given = questions
            .map((q) => ({ question: q, value: answers[q.key] ?? '' }))
            .filter((a) => (Array.isArray(a.value) ? a.value.length > 0 : a.value.trim() !== ''));
          const answered = new Set(given.map((a) => a.question.key));
          onSubmit(
            given,
            questions.filter((q) => !answered.has(q.key)).map((q) => q.key),
          );
        }}
      >
        {questions.map((q, i) => (
          <div key={q.key}>
            <label htmlFor={`question-${i}`} className={labelClass}>
              {q.question}
            </label>
            <div className="mt-1.5">
              <ValueInput
                id={`question-${i}`}
                kind={q.kind}
                options={q.options}
                value={answers[q.key] ?? null}
                onCommit={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))}
              />
            </div>
            {suggestions[q.key] !== undefined && answers[q.key] === undefined && (
              // T-498: one tap puts the value in the field; until then nothing is answered.
              <button
                type="button"
                data-suggestion={q.key}
                onClick={() => setAnswers((a) => ({ ...a, [q.key]: suggestions[q.key] }))}
                className="!bg-brand-gold-light !border-brand-gold text-brand-navy focus-visible:ring-brand-teal mt-1.5 rounded-lg border px-3 py-1.5 text-left text-sm focus:outline-none focus-visible:ring-2"
              >
                Please check: {suggestionText(q, suggestions[q.key])}
              </button>
            )}
          </div>
        ))}
        <p className={small}>
          We ask for the court, the parties, the numbers and the dates. We never guess them.
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onSkip} disabled={busy} className={linkButton}>
            Skip these questions
          </button>
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}
