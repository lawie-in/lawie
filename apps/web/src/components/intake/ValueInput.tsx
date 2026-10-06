'use client';

/**
 * One editable value of the brief, by its kind (T-126, B1): one line, long
 * text, date, number, amount, one choice, several choices, or a list.
 *
 * Text is committed when the field loses focus, so the brief is worked out
 * again once per edit and not once per keystroke. Choices commit at once.
 */
import { useEffect, useState } from 'react';

import { dateInWords, LIST_MAX, NARRATIVE_MAX, TEXT_MAX, Value, ValueKind } from './briefTypes';
import { input, small } from './ui';

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
}) {
  const [text, setText] = useState(asText(value));
  // The service's answer replaces what is on screen (it may tidy a value).
  useEffect(() => {
    setText(asText(value));
  }, [value]);

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

  if (kind === 'date') {
    return (
      <div>
        <input
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
      inputMode={kind === 'number' || kind === 'amount' ? 'decimal' : undefined}
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
