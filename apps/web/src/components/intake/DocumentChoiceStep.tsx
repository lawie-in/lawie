'use client';

/**
 * 02a Which document do you need? — T-103, design T-109 §3 "02a".
 * Up to 3 radio cards plus "None of these". The closest match is
 * pre-selected, and the user still has to confirm (ADR-019 §4.2.2: we never
 * pick for them). No confidence figure, no internal template text.
 *
 * T-521: restyled on the Night Library tokens. Behaviour unchanged.
 */
import { useId, useState } from 'react';

import { actions, h1, linkButton, optionCard, page, sub } from './nlUi';

import { Button } from '@/components/ui';

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
    <div className={page}>
      <h1 className={h1}>Which document do you need?</h1>
      <p className={sub}>Your description could fit more than one. Pick the closest.</p>

      <form
        className="mt-nl-6"
        onSubmit={(e) => {
          e.preventDefault();
          onChoose(selected);
        }}
      >
        <fieldset>
          <legend className="sr-only">Which document do you need?</legend>
          <div className="space-y-nl-3">
            {options.map((c) => {
              const checked = selected === c.template_id;
              return (
                <label key={c.template_id} className={optionCard(checked)}>
                  <input
                    type="radio"
                    name={name}
                    value={c.template_id}
                    checked={checked}
                    onChange={() => setSelected(c.template_id)}
                    className="mt-1 h-4 w-4 accent-[var(--brass)]"
                  />
                  <span className="min-w-0 break-words">
                    <span className="nl-body text-nl-text block font-medium">{c.display_name}</span>
                    {c.description && (
                      <span className="nl-body-sm text-nl-soft mt-0.5 block">{c.description}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className={`${actions} mt-nl-6`}>
          <button type="button" onClick={onEditDescription} className={linkButton}>
            Edit my description
          </button>
          <Button type="submit" loading={submitting}>
            Continue
          </Button>
        </div>
      </form>
    </div>
  );
}
