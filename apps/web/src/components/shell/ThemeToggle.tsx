'use client';

// T-511 part A: Night / Daylight / System control (spec 1, 2.5; copy handoff/copy/T-511-copy-v1.md
// 6.4). Native radio inputs in a fieldset, so arrow keys, Tab and screen readers behave as a
// radiogroup without custom key handling. Every option is a 44px target.

import { useId } from 'react';

import type { ThemePreference } from './theme';
import { useTheme } from './ThemeProvider';

import { cn } from '@/lib/cn';

/** Copy 6.4, English. Pass `labels` / `legend` / `help` for Hindi. */
export const THEME_TOGGLE_COPY = {
  legend: 'Theme',
  help: 'System follows your device setting.',
  labels: { night: 'Night', daylight: 'Daylight', system: 'System' } as Record<
    ThemePreference,
    string
  >,
} as const;

const ORDER: ThemePreference[] = ['night', 'daylight', 'system'];

export interface ThemeToggleProps {
  legend?: string;
  labels?: Partial<Record<ThemePreference, string>>;
  /** Shown under the options when set (Settings). The top bar leaves it out. */
  help?: string;
  /** Hide the legend visually; it stays the group's accessible name. */
  hideLegend?: boolean;
  className?: string;
}

export function ThemeToggle({
  legend = THEME_TOGGLE_COPY.legend,
  labels,
  help,
  hideLegend = false,
  className,
}: ThemeToggleProps) {
  const { preference, setPreference } = useTheme();
  const name = useId();
  const helpId = `${name}-help`;
  const text = { ...THEME_TOGGLE_COPY.labels, ...labels };

  return (
    <fieldset
      className={cn('nl m-0 min-w-0 border-0 p-0', className)}
      aria-describedby={help ? helpId : undefined}
    >
      <legend className={cn('nl-label mb-nl-2 text-nl-brass-dark p-0', hideLegend && 'sr-only')}>
        {legend}
      </legend>
      {/* T-525: the frame is a control boundary, so Control Line (3:1, WCAG 1.4.11). */}
      <div className="rounded-nl-md bg-nl-card inline-flex border border-[color:var(--line-control)] p-px">
        {ORDER.map((option) => (
          <label key={option} className="relative inline-flex cursor-pointer">
            <input
              type="radio"
              name={name}
              value={option}
              checked={preference === option}
              onChange={() => setPreference(option)}
              className="peer sr-only"
            />
            <span
              className={cn(
                // T-544 (Rajesh, T-531 N1): the frame is 44px (40px option + 2 padding + 2 border).
                // The ::before restores the 44px hit area in height only (2px above and below;
                // inset-x-0, so neighbours never overlap). The focus ring stays on this 40px span.
                'nl-body-sm rounded-nl-sm px-nl-3 text-nl-soft relative inline-flex min-h-[40px] min-w-[44px] items-center justify-center font-medium',
                "before:absolute before:-inset-y-[2px] before:inset-x-0 before:content-['']",
                'transition-colors duration-150 ease-[ease] motion-reduce:transition-none',
                'peer-checked:bg-nl-brass-light peer-checked:text-nl-brass-dark',
                'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-[color:var(--brass)]',
                // T-525: forced colours drop the fill, so the checked option takes the system
                // selection pair, opted out of the repaint on this span only; its focus ring
                // uses CanvasText so it stays visible.
                'forced-colors:peer-checked:bg-[color:Highlight] forced-colors:peer-checked:text-[color:HighlightText] forced-colors:peer-checked:[forced-color-adjust:none] forced-colors:peer-checked:peer-focus-visible:outline-[color:CanvasText]',
              )}
            >
              {text[option]}
            </span>
          </label>
        ))}
      </div>
      {help ? (
        <p id={helpId} className="nl-body-sm mt-nl-2 text-nl-muted">
          {help}
        </p>
      ) : null}
    </fieldset>
  );
}
