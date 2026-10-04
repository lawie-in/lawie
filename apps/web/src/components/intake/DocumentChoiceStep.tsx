'use client';

/**
 * 02a Which document do you need? — T-103, design T-109 §3 "02a".
 * Up to 3 radio cards plus "None of these". The closest match is
 * pre-selected, and the user still has to confirm (ADR-019 §4.2.2: we never
 * pick for them). No confidence figure, no internal template text.
 */
import { Loader2 } from 'lucide-react';
import { useId, useState } from 'react';

export const NONE_OF_THESE = '__none__';

export default function DocumentChoiceStep({
  choices,
  onChoose,
  onEditDescription,
  submitting,
}: {
  choices: Array<{ template_id: string; display_name: string; description?: string }>;
  onChoose: (templateId: string) => void;
  onEditDescription: () => void;
  submitting: boolean;
}) {
  const [selected, setSelected] = useState<string>(choices[0]?.template_id ?? NONE_OF_THESE);
  const name = useId();
  const options = [
    ...choices,
    {
      template_id: NONE_OF_THESE,
      display_name: 'None of these',
      description: 'Tell us more instead.',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <h1 className="font-heading text-brand-navy text-[26px] font-semibold leading-8 sm:text-[34px] sm:leading-[42px]">
        Which document do you need?
      </h1>
      <p className="text-brand-muted mt-2 text-base">
        Your description could fit more than one. Pick the closest.
      </p>

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          onChoose(selected);
        }}
      >
        <fieldset>
          <legend className="sr-only">Which document do you need?</legend>
          <div className="space-y-3">
            {options.map((c) => {
              const checked = selected === c.template_id;
              return (
                <label
                  key={c.template_id}
                  className={`focus-within:ring-brand-teal flex min-h-[56px] cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 focus-within:ring-2 ${
                    checked ? 'border-brand-navy' : 'border-brand-line'
                  }`}
                >
                  <input
                    type="radio"
                    name={name}
                    value={c.template_id}
                    checked={checked}
                    onChange={() => setSelected(c.template_id)}
                    className="mt-1 h-4 w-4 accent-[#0D1F3C]"
                  />
                  <span>
                    <span className="text-brand-navy block text-base font-medium">
                      {c.display_name}
                    </span>
                    {c.description && (
                      <span className="text-brand-muted mt-0.5 block text-sm">{c.description}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onEditDescription}
            className="text-brand-teal-dark focus-visible:ring-brand-teal min-h-[44px] text-sm underline underline-offset-2 focus:outline-none focus-visible:ring-2"
          >
            Edit my description
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
