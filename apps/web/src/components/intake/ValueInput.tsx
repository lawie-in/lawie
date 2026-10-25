'use client';

/**
 * One editable value of the brief, by its kind (T-126, B1): one line, long
 * text, date, number, amount, one choice, several choices, or a list.
 *
 * Text is committed when the field loses focus, so the brief is worked out
 * again once per edit and not once per keystroke. Choices commit at once.
 */
import { useEffect, useRef, useState } from 'react';

import { dateInWords, LIST_MAX, NARRATIVE_MAX, TEXT_MAX, Value, ValueKind } from './briefTypes';
import { input, linkButton, small } from './ui';

function asText(value: Value | null): string {
  if (value === null) return '';
  return Array.isArray(value) ? value.join('\n') : value;
}

function chip(on: boolean): string {
  return `focus-visible:ring-brand-teal inline-flex min-h-[40px] items-center rounded-full border px-3.5 text-sm focus:outline-none focus-visible:ring-2 ${
    on ? 'bg-brand-navy border-brand-navy font-medium text-white' : 'border-brand-line bg-white'
  }`;
}

export default function ValueInput({
  id,
  kind,
  options,
  value,
  onCommit,
  className = '',
  placeholder,
  describedBy,
  invalid,
  words = false,
  notKnownDate = false,
  notKnownLabel = '',
}: {
  id: string;
  kind: ValueKind;
  options: string[];
  value: Value | null;
  onCommit: (value: Value) => void;
  /** Extra classes for the field, for the "read from your description" and "not given" looks. */
  className?: string;
  placeholder?: string;
  describedBy?: string;
  invalid?: boolean;
  /**
   * T-147b: a number that may be typed in words ("3 lakh"). Opens the plain
   * keyboard. An amount always does, so no numeric keypad is offered for it.
   */
  words?: boolean;
  /**
   * T-384: a date row answered "Not known". It shows a "Not known" chip and a
   * "Change" link in place of the date input, until the advocate presses Change.
   */
  notKnownDate?: boolean;
  /** T-384: the row's label, for the "Change" link's aria-label. */
  notKnownLabel?: string;
}) {
  const [text, setText] = useState(asText(value));
  // The service's answer replaces what is on screen (it may tidy a value).
  useEffect(() => {
    setText(asText(value));
  }, [value]);

  // T-384: true once "Change" is pressed on a Not-known date, so the input shows.
  const [changing, setChanging] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Once the row is no longer Not known (a date was saved), forget the swap,
    // so a later Not-known answer shows the chip again.
    if (!notKnownDate) setChanging(false);
  }, [notKnownDate]);
  useEffect(() => {
    // Focus after the swap, not autoFocus. focus() does not open the date picker;
    // it opens only on the advocate's own tap or key.
    if (changing) dateRef.current?.focus();
  }, [changing]);

  const commitText = (raw: string) => {
    if (raw === asText(value)) return;
    if (kind === 'list') {
      onCommit(
        raw
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, LIST_MAX),
      );
      return;
    }
    onCommit(raw.trim());
  };

  if (kind === 'choice' || kind === 'choices') {
    const chosen = new Set(Array.isArray(value) ? value : value ? [value] : []);
    return (
      <div id={id} role="group" aria-describedby={describedBy} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = chosen.has(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              className={chip(on)}
              onClick={() => {
                if (kind === 'choice') {
                  onCommit(on ? '' : o);
                  return;
                }
                const next = new Set(chosen);
                if (on) next.delete(o);
                else next.add(o);
                onCommit(options.filter((x) => next.has(x)));
              }}
            >
              {o}
            </button>
          );
        })}
      </div>
    );
  }

  if (kind === 'date' && notKnownDate && !changing) {
    // Static chip, not a button: it takes no focus and is the row's value, not news.
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className={chip(true)}>Not known</span>
        <button
          type="button"
          className={linkButton}
          aria-label={`Change ${notKnownLabel}, now Not known`}
          onClick={() => setChanging(true)}
        >
          Change
        </button>
      </div>
    );
  }

  if (kind === 'date') {
    return (
      <div>
        <input
          ref={dateRef}
          id={id}
          type="date"
          value={/^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            setText(e.target.value);
            // A date picker has no "leaving the field" moment worth waiting for.
            if (e.target.value === '' || /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) {
              onCommit(e.target.value);
            }
          }}
          className={`${input} ${className}`}
        />
        {/^\d{4}-\d{2}-\d{2}$/.test(text) && (
          <p className={`${small} mt-1`} aria-live="polite">
            {dateInWords(text)}
          </p>
        )}
      </div>
    );
  }

  if (kind === 'narrative' || kind === 'list') {
    return (
      <textarea
        id={id}
        value={text}
        maxLength={NARRATIVE_MAX}
        placeholder={placeholder ?? (kind === 'list' ? 'One on each line' : undefined)}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commitText(e.target.value)}
        className={`${input} min-h-[96px] resize-y ${className}`}
      />
    );
  }

  return (
    <input
      id={id}
      type="text"
      inputMode={kind === 'number' && !words ? 'decimal' : undefined}
      value={text}
      maxLength={TEXT_MAX}
      placeholder={placeholder}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => commitText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitText((e.target as HTMLInputElement).value);
        }
      }}
      className={`${input} ${className}`}
    />
  );
}
