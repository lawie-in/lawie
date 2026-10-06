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

import type { BriefQuestion, Value } from './briefTypes';
import { card, h1, label as labelClass, linkButton, primaryButton, small, sub } from './ui';
import ValueInput from './ValueInput';

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
}: {
  documentName: string | null;
  questions: BriefQuestion[];
  round: number;
  totalRounds: number;
  description: string;
  busy: boolean;
  onSubmit: (answers: Array<{ question: BriefQuestion; value: Value }>) => void;
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

      <div className={`${card} mt-6 flex items-center gap-3 !p-3.5`}>
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
          onSubmit(
            questions
              .map((q) => ({ question: q, value: answers[q.key] ?? '' }))
              .filter((a) => (Array.isArray(a.value) ? a.value.length > 0 : a.value.trim() !== '')),
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
