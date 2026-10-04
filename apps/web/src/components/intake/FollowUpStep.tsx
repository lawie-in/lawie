'use client';

/**
 * 02 Follow-up — T-103 (screen) over T-102 (questions), design T-005 §5 "02".
 * At most 5 questions a round, 2 rounds. Questions are the form labels.
 * Inputs are the same widgets as the long form (FieldInput), so court
 * dropdowns load the real list and cascade as they do there.
 */
import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { IntakeQuestion } from './types';

import {
  FieldInput,
  resolveOptions,
  TemplateConfig,
  useCourtsData,
} from '@/components/form/DynamicFormRenderer';

const REASON_TEXT: Record<string, string> = {
  type: 'This does not look right. Please check the format.',
  option: 'Please pick one of the choices.',
  length: 'This is too short or too long.',
  pattern: 'This does not match the expected format.',
  min_select: 'Please pick a few more.',
};

export default function FollowUpStep({
  config,
  questions,
  knownValues,
  round,
  totalRounds,
  description,
  invalid,
  submitting,
  onSubmit,
  onFillMyself,
  onEditDescription,
}: {
  config: TemplateConfig;
  questions: IntakeQuestion[];
  /** Values known so far; needed for cascading court lists. */
  knownValues: Record<string, unknown>;
  round: number;
  totalRounds: number;
  description: string;
  invalid: Array<{ field_id: string; reason: string }>;
  submitting: boolean;
  onSubmit: (answers: Record<string, unknown>) => void;
  onFillMyself: (answers: Record<string, unknown>) => void;
  onEditDescription: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const fieldsById = useMemo(
    () => new Map(config.form_schema.steps.flatMap((s) => s.fields).map((f) => [f.field_id, f])),
    [config],
  );
  const merged = useMemo(() => ({ ...knownValues, ...answers }), [knownValues, answers]);
  const courtsData = useCourtsData(merged);

  const setAnswer = (fieldId: string, value: unknown) => {
    setAnswers((prev) => {
      const next = { ...prev, [fieldId]: value };
      // Same cascade reset as the long form: a new state clears its court type and court.
      for (const t of fieldsById.get(fieldId)?.cascades_to ?? []) {
        next[t] = Array.isArray(prev[t]) ? [] : '';
      }
      return next;
    });
  };

  const invalidById = new Map(invalid.map((i) => [i.field_id, i.reason]));

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <p className="text-brand-muted text-sm font-medium">
        Round {round} of {totalRounds} · {questions.length}{' '}
        {questions.length === 1 ? 'question' : 'questions'}
      </p>
      <h1 className="font-heading text-brand-navy mt-1 text-[26px] font-semibold leading-8 sm:text-[34px] sm:leading-[42px]">
        A few details we still need
      </h1>
      <p className="text-brand-muted mt-2 text-base">
        Court, parties, FIR number, sections and dates are always asked, never guessed.
      </p>

      <div className="border-brand-line mt-4 flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
        <span className="text-brand-navy shrink-0 font-medium">Your description:</span>
        <span className="text-brand-muted min-w-0 flex-1 truncate">{description}</span>
        <button
          type="button"
          onClick={onEditDescription}
          className="text-brand-teal-dark focus-visible:ring-brand-teal min-h-[44px] shrink-0 px-1 underline underline-offset-2 focus:outline-none focus-visible:ring-2"
        >
          Edit
        </button>
      </div>

      <form
        className="border-brand-line mt-6 rounded-xl border bg-white p-4 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(answers);
        }}
      >
        <div className="space-y-5">
          {questions.map((q) => {
            const field = fieldsById.get(q.field_id);
            if (!field) return null;
            const reason = invalidById.get(q.field_id);
            return (
              <div key={q.field_id}>
                <FieldInput
                  field={field}
                  value={merged[q.field_id]}
                  options={resolveOptions(field, merged, config, courtsData)}
                  onChange={(v) => setAnswer(q.field_id, v)}
                />
                {reason && (
                  <p role="alert" className="text-brand-error mt-1 text-sm">
                    {REASON_TEXT[reason] ?? 'Please check this answer.'}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => onFillMyself(answers)}
            className="text-brand-teal-dark focus-visible:ring-brand-teal min-h-[44px] text-sm underline underline-offset-2 focus:outline-none focus-visible:ring-2"
          >
            Fill in the details myself
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-brand-navy focus-visible:ring-brand-teal inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg px-6 text-base font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-40"
          >
            {submitting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}
