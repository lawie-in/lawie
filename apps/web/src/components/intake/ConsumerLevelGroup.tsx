'use client';

/**
 * T-411: the "Which Commission?" level group for a consumer complaint. One choice at a
 * time (radio behaviour): role="radiogroup" labelled by its visible label, chips with
 * role="radio", aria-checked, roving tabindex, arrow keys move and select, Space selects.
 * Nothing is selected until the user picks (ADR-021 rule 3). Strings signed by Ajay
 * (handoff/legal/T-411-consumer-picker-strings-signed.md); use them byte for byte.
 */
import { Check } from 'lucide-react';
import { useRef } from 'react';

import { label as labelClass } from './ui';

export type ConsumerLevel = 'district' | 'state' | 'national';

/**
 * How a level was chosen. 'arrow': arrow keys moved the selection; focus stays on the
 * chip (WAI-ARIA radio pattern). 'activate': click, Space or Enter; the picker may move focus
 * to the first new control.
 */
export type LevelChangeHow = 'arrow' | 'activate';

export const CONSUMER_LEVELS: ReadonlyArray<{ id: ConsumerLevel; name: string }> = [
  { id: 'district', name: 'District Commission' },
  { id: 'state', name: 'State Commission' },
  { id: 'national', name: 'National Commission (NCDRC)' },
];

export const CONSUMER_GROUP_LABEL = 'Which Commission?';
export const NCDRC_OPTION_LABEL =
  'National Consumer Disputes Redressal Commission (NCDRC), New Delhi';
export const CONSUMER_NO_MATCH = 'No Commission is listed for this state yet.';
/** The court select's label in consumer mode (Ajay, ad03fd4). */
export const CONSUMER_COURT_LABEL = 'Consumer Commission';

export const LIVE_STATE_SHOWN = 'State select shown.';
export const LIVE_COURT_SHOWN = 'Commission select shown.';
export const LIVE_NATIONAL_SHOWN = 'No state needed. Commission select shown.';
export const LIVE_CLEARED = 'State and Commission cleared.';

/** The template id whose court picker runs in consumer mode. */
export const CONSUMER_TEMPLATE_ID = 'consumer_complaint';

/** Court id and stored values for NCDRC (part 1 server API). */
export const NCDRC_COURT_ID = 'ncdrc_delhi';
export const NCDRC_STATE_ID = 'india';
export const NCDRC_COURT_TYPE = 'tribunal';
export const CONSUMER_COURT_TYPE = 'consumer_commission';

function chip(on: boolean): string {
  return `focus-visible:ring-brand-teal inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border px-4 py-2 text-center text-sm leading-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:w-auto ${
    on
      ? 'bg-brand-navy border-brand-navy font-medium text-white'
      : 'border-brand-line text-brand-navy bg-white'
  }`;
}

export default function ConsumerLevelGroup({
  id,
  value,
  onChange,
}: {
  /** Prefix for element ids; the label is `${id}-label`, chips `${id}-<level>`. */
  id: string;
  value: ConsumerLevel | null;
  onChange: (level: ConsumerLevel, how: LevelChangeHow) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = CONSUMER_LEVELS.findIndex((l) => l.id === value);
  // Roving tabindex: the checked chip, or the first one when nothing is checked.
  const tabbable = selectedIndex === -1 ? 0 : selectedIndex;

  const move = (from: number, delta: number) => {
    const n = CONSUMER_LEVELS.length;
    const to = (from + delta + n) % n;
    refs.current[to]?.focus();
    onChange(CONSUMER_LEVELS[to].id, 'arrow');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        move(index, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        move(index, -1);
        break;
      case ' ':
      case 'Enter':
        // Enter is handled here (not left to the native button click) so it always
        // counts as an activation, the same as click and Space.
        e.preventDefault();
        onChange(CONSUMER_LEVELS[index].id, 'activate');
        break;
      default:
        break;
    }
  };

  return (
    <div>
      <p id={`${id}-label`} className={labelClass}>
        {CONSUMER_GROUP_LABEL}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap"
      >
        {CONSUMER_LEVELS.map((level, index) => {
          const on = level.id === value;
          return (
            <button
              key={level.id}
              id={`${id}-${level.id}`}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={index === tabbable ? 0 : -1}
              onClick={() => onChange(level.id, 'activate')}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={chip(on)}
            >
              {on && <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}
              <span>{level.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
