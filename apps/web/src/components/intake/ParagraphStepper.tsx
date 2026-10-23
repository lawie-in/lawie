'use client';

/**
 * T-577: the paragraph-count stepper on the brief (Rajesh, T-578 design note section 5).
 *
 * Reads "Up to [ n ] paragraphs" on a ceiling quote (AJ-577-M6 (3); also the spinbutton's
 * aria-label). A 44px group: − ghost, a 64px numeric input (role="spinbutton"), + ghost. Arrow
 * keys step by 1, Shift+arrow by 5, Home/End go to min/max; each is a commit, as is a press and
 * blur. Typing alone never re-quotes. A typed value is clamped on blur to min..max and the
 * AJ-577-M4 line says why; the same line (with the error ring) shows for the server's 400.
 * Disabled until the first quote gives `min`. Every string is signed (paragraphCopy.ts).
 */
import { Minus, Plus } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent } from 'react';

import { PARAGRAPH_TEXT, fillParagraphCopy } from './paragraphCopy';
import type { ParagraphControl } from './useParagraphQuote';

export const PARAGRAPH_STEPPER_ID = 'brief-paragraphs';
export const PARAGRAPH_HELP_ID = 'brief-paragraphs-help';
export const PARAGRAPH_RANGE_ID = 'brief-paragraphs-range';
const LABEL_ID = 'brief-paragraphs-label';

/**
 * The signed "Up to {n} paragraphs" split around the number, so "Up to" reads before − and
 * "paragraphs" after +. Without a ceiling the "Up to" words are left out (design section 5).
 */
function stepperWords(ceiling: boolean): { before: string; after: string } {
  const [before, after] = PARAGRAPH_TEXT.stepper.split('{n}');
  return { before: ceiling ? before.trim() : '', after: after.trim() };
}

export function paragraphsAriaLabel(n: number, ceiling: boolean): string {
  if (ceiling) return fillParagraphCopy(PARAGRAPH_TEXT.stepper, { n });
  return `${n} ${stepperWords(false).after}`;
}

const stepButton =
  'nl-focus text-nl-text inline-flex min-h-[44px] min-w-[44px] items-center justify-center bg-transparent disabled:opacity-40';

export default function ParagraphStepper({ control }: { control: ParagraphControl }) {
  const { quote, value, rangeLine, onCommit } = control;
  const ready = quote !== null && value !== null;
  const ceiling = quote?.ceiling ?? true;
  const min = quote?.min ?? 1;
  const max = quote?.max ?? 25;
  const [typed, setTyped] = useState<string>(value === null ? '' : String(value));
  // The field shows the committed count whenever it changes (a step, a quote, a clamp).
  useEffect(() => {
    setTyped(value === null ? '' : String(value));
  }, [value]);

  const words = stepperWords(ceiling);
  const atMin = !ready || value <= min;
  const atMax = !ready || value >= max;
  const serverError = rangeLine?.server === true;

  const step = (by: number) => {
    if (!ready) return;
    onCommit(value + by, false);
  };

  const commitTyped = () => {
    if (!ready) return;
    const n = Number.parseInt(typed.trim(), 10);
    if (!Number.isFinite(n)) {
      setTyped(String(value)); // Nothing usable typed: the count stays as it was.
      return;
    }
    onCommit(n, true);
    setTyped(String(Math.min(max, Math.max(min, n))));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!ready) return;
    const by = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowUp') step(by);
    else if (e.key === 'ArrowDown') step(-by);
    else if (e.key === 'Home') onCommit(min, false);
    else if (e.key === 'End') onCommit(max, false);
    else if (e.key === 'Enter') commitTyped();
    else return;
    e.preventDefault();
  };

  const describedBy = [PARAGRAPH_HELP_ID, rangeLine ? PARAGRAPH_RANGE_ID : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="gap-nl-2 flex flex-col">
      <div className="gap-nl-2 flex flex-col min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between">
        <span id={LABEL_ID} className="nl-body-sm text-nl-text font-medium">
          {PARAGRAPH_TEXT.label}
        </span>
        <div
          role="group"
          aria-labelledby={LABEL_ID}
          className="gap-nl-2 nl-body text-nl-text flex items-center"
        >
          {words.before && <span aria-hidden="true">{words.before}</span>}
          <div
            className={`rounded-nl-md bg-nl-card flex min-h-[44px] items-center border ${
              serverError
                ? 'border-nl-err ring-nl-err ring-2'
                : 'border-[color:var(--line-control)]'
            } ${ready ? '' : 'opacity-40'}`}
          >
            <button
              type="button"
              className={stepButton}
              aria-label={PARAGRAPH_TEXT.fewer}
              aria-controls={PARAGRAPH_STEPPER_ID}
              aria-disabled={atMin || undefined}
              disabled={!ready}
              onClick={() => {
                if (!atMin) step(-1);
              }}
            >
              <Minus size={16} aria-hidden="true" />
            </button>
            <input
              id={PARAGRAPH_STEPPER_ID}
              type="text"
              role="spinbutton"
              inputMode="numeric"
              autoComplete="off"
              className="nl-body text-nl-text w-16 bg-transparent text-center tabular-nums focus:outline-none disabled:cursor-not-allowed"
              value={typed}
              disabled={!ready}
              aria-label={ready ? paragraphsAriaLabel(value, ceiling) : PARAGRAPH_TEXT.label}
              aria-valuemin={min}
              aria-valuemax={max}
              aria-valuenow={value ?? undefined}
              aria-invalid={serverError || undefined}
              aria-describedby={describedBy}
              onChange={(e) => setTyped(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
              onBlur={commitTyped}
              onKeyDown={onKeyDown}
            />
            <button
              type="button"
              className={stepButton}
              aria-label={PARAGRAPH_TEXT.more}
              aria-controls={PARAGRAPH_STEPPER_ID}
              aria-disabled={atMax || undefined}
              disabled={!ready}
              onClick={() => {
                if (!atMax) step(1);
              }}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
          <span aria-hidden="true">{words.after}</span>
        </div>
      </div>
      <p id={PARAGRAPH_HELP_ID} className="text-nl-muted text-[13px] leading-5">
        {ceiling ? PARAGRAPH_TEXT.help : PARAGRAPH_TEXT.helpExact}
      </p>
      {/* Always mounted, so the range line is announced when it appears. */}
      <p
        id={PARAGRAPH_RANGE_ID}
        role="status"
        className={rangeLine ? 'nl-body-sm text-nl-err' : 'sr-only'}
      >
        {rangeLine ? fillParagraphCopy(PARAGRAPH_TEXT.range, { min: rangeLine.min }) : ''}
      </p>
    </div>
  );
}
