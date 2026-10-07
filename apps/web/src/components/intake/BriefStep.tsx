'use client';

/**
 * B1 Check your brief (T-126), with its states: the court (B3), dates (B4),
 * Confirm off (B5) and the brief when nothing fits (B6).
 *
 * The only screen where details are entered, for every document. Every line of
 * fixed wording here is sent by the service (T-127, section 7): the blank a
 * missing fact leaves, the line under Confirm, and the labels.
 */
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  Brief,
  BriefCourt,
  BriefItem,
  dateInWords,
  describeValue,
  isEmptyValue,
  PART_ORDER,
  PART_TITLES,
  Value,
} from './briefTypes';
import CourtPicker from './CourtPicker';
import {
  card,
  h1,
  input,
  label as labelClass,
  linkButton,
  primaryButton,
  secondaryButton,
  small,
  sub,
  tagError,
  tagGold,
  tagPlain,
} from './ui';
import ValueInput from './ValueInput';

/**
 * T-136. Ajay's line (CLO, 7 Oct 2026, part 2, condition 2), word for word. The
 * description goes to the Drafter of a document with a rule pack, so the
 * advocate is told before generating and can still change it. Do not reword.
 */
const DESCRIPTION_IS_USED =
  'Your description is used in full, together with this brief. If anything in it is wrong, or should not be in the draft, change the description before you generate.';

/** Long text and rows of choices take the full width of the card. */
const WIDE = new Set(['narrative', 'list', 'choice', 'choices']);

function fieldId(key: string): string {
  return `brief-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function Item({
  item,
  needed,
  onCommit,
}: {
  item: BriefItem;
  /** True when this is a party's name that Confirm is waiting for. */
  needed: boolean;
  onCommit: (value: Value) => void;
}) {
  const id = fieldId(item.key);
  const empty = isEmptyValue(item.value);
  const heading = item.kind === 'date' && item.meaning ? item.meaning : item.label;
  // These sit on top of the shared field look, so they are marked important.
  const look = needed
    ? '!border-brand-error !border-2'
    : item.please_check
      ? '!bg-brand-gold-light !border-brand-gold'
      : empty && item.required
        ? '!border-dashed'
        : '';
  return (
    <div className={WIDE.has(item.kind) ? 'sm:col-span-2' : ''}>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className={labelClass}>
          {heading}
        </label>
        {item.required && <span className="text-brand-muted text-xs">Required</span>}
        {item.please_check && <span className={tagGold}>Please check</span>}
        {needed && <span className={tagError}>Needed to continue</span>}
      </div>
      <div className="mt-1.5">
        <ValueInput
          id={id}
          kind={item.kind}
          options={item.options}
          value={item.value}
          onCommit={onCommit}
          className={look}
          placeholder={empty && item.required ? 'Not given' : undefined}
          describedBy={empty && item.required && !needed ? `${id}-blank` : undefined}
          invalid={needed}
        />
      </div>
      {empty && item.required && !needed && (
        <p id={`${id}-blank`} className={`${small} mt-1`}>
          The draft will show{' '}
          <span className="text-brand-gold-dark font-mono text-xs">{item.placeholder}</span>
        </p>
      )}
    </div>
  );
}

export default function BriefStep({
  brief,
  busy,
  confirming,
  message,
  questionsLeft,
  onValue,
  onCourt,
  onKindName,
  onPlaceDate,
  onChangeDocument,
  onMoreQuestions,
  onEditDescription,
  onCancel,
  onConfirm,
}: {
  brief: Brief;
  /** True while the brief is being worked out again after a change. */
  busy: boolean;
  confirming: boolean;
  /** A problem to show above the buttons. */
  message: string | null;
  questionsLeft: number;
  onValue: (item: BriefItem, value: Value) => void;
  onCourt: (court: BriefCourt) => void;
  /** Only when nothing fits: the advocate may rename the document. */
  onKindName: (name: string) => void;
  onPlaceDate: (item: BriefItem, date: string) => void;
  onChangeDocument: () => void;
  onMoreQuestions: () => void;
  onEditDescription: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [name, setName] = useState(brief.kind.name);
  // The service may tidy the name. What it sends back is what is shown.
  useEffect(() => {
    setName(brief.kind.name);
  }, [brief.kind.name]);
  const noRules = brief.kind.id === null;
  const partiesNeeded = brief.confirm_blockers.includes('parties');
  const courtNeeded = brief.confirm_blockers.includes('court');
  const anyChecked = brief.items.some((i) => i.please_check);

  const emptyDates = brief.items.filter((i) => i.kind === 'date' && isEmptyValue(i.value));
  const looseDates = brief.loose_dates.filter(
    (d) => !dismissed.includes(d.value) && (d.meaning !== null || emptyDates.length > 0),
  );

  const focusField = (key: string) => {
    const el = document.getElementById(fieldId(key));
    el?.scrollIntoView({ block: 'center' });
    (el?.querySelector('button, input, textarea') as HTMLElement | null)?.focus();
    el?.focus();
  };

  const focusFirstBlocker = () => {
    if (courtNeeded) {
      const el = ['brief-court-state', 'brief-court-type', 'brief-court-court']
        .map((id) => document.getElementById(id) as HTMLSelectElement | null)
        .find((s) => s && !s.disabled && s.value === '');
      el?.scrollIntoView({ block: 'center' });
      el?.focus();
      return;
    }
    const party = brief.items.find((i) => i.party_name && i.required && isEmptyValue(i.value));
    if (party) focusField(party.key);
  };

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <h1 className={h1}>Check your brief</h1>
      <p className={sub}>
        This is what we will write from. Change anything that is wrong. Nothing is drafted until you
        confirm.
      </p>

      {/* The document */}
      <div className="border-brand-navy mt-6 flex flex-col gap-3 rounded-xl border-2 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="text-brand-muted text-xs font-semibold uppercase tracking-wider">
            Document
          </p>
          {noRules ? (
            <input
              type="text"
              value={name}
              maxLength={80}
              aria-label="Name of the document"
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name.trim() && name.trim() !== brief.kind.name) onKindName(name.trim());
              }}
              className={`${input} font-heading mt-1.5 text-lg font-semibold`}
            />
          ) : (
            <p className="font-heading text-brand-navy mt-0.5 text-xl font-semibold leading-7">
              {brief.kind.name}
            </p>
          )}
          <p className="mt-2 flex flex-wrap gap-2">
            <span className={tagPlain}>
              {brief.kind.court_document ? 'Court document' : 'Not for a court'}
            </span>
            {noRules && <span className={tagGold}>No Lawie rules for this one</span>}
          </p>
        </div>
        <button type="button" onClick={onChangeDocument} className={secondaryButton}>
          Change
        </button>
      </div>

      {anyChecked && (
        <p className="bg-brand-gold-light text-brand-gold-dark mt-4 rounded-lg p-3 text-sm">
          <strong className="font-semibold">Please check</strong> marks what we read from your
          description. Check it before you confirm.
        </p>
      )}

      <div className={`${card} divide-brand-line mt-4 divide-y`}>
        {brief.kind.court_document && (
          <section aria-labelledby="brief-part-court" className="pb-6">
            <h2
              id="brief-part-court"
              className="font-heading text-brand-navy text-lg font-semibold"
            >
              Court
            </h2>
            <p className={`${small} mb-3`}>You choose this. We never fill it in.</p>
            <CourtPicker court={brief.court} onChange={onCourt} missing={courtNeeded} />
          </section>
        )}

        {PART_ORDER.map((part) => {
          const items = brief.items.filter((i) => i.part === part);
          const dates = part === 'dates' ? looseDates : [];
          if (items.length === 0 && dates.length === 0) return null;
          return (
            <section
              key={part}
              aria-labelledby={`brief-part-${part}`}
              className="py-6 first:pt-0 last:pb-0"
            >
              <h2
                id={`brief-part-${part}`}
                className="font-heading text-brand-navy text-lg font-semibold"
              >
                {PART_TITLES[part]}
              </h2>
              {part === 'dates' && <p className={small}>Each date says what it is the date of.</p>}
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {items.map((item) => (
                  <Item
                    key={item.key}
                    item={item}
                    needed={
                      partiesNeeded && item.party_name && item.required && isEmptyValue(item.value)
                    }
                    onCommit={(v) => onValue(item, v)}
                  />
                ))}
              </div>
              {dates.map((d) =>
                d.meaning !== null ? (
                  <p key={d.value} className={`${small} mt-3`}>
                    {d.meaning}: {dateInWords(d.value)}. This document has no separate place for it.
                    It stays in your facts.
                  </p>
                ) : (
                  <div
                    key={d.value}
                    className="bg-brand-gold-light mt-4 flex flex-col gap-3 rounded-lg p-3"
                  >
                    <label
                      htmlFor={`loose-${d.value}`}
                      className="text-brand-gold-dark text-sm font-semibold"
                    >
                      You wrote {dateInWords(d.value)}. What is it the date of?
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <select
                        id={`loose-${d.value}`}
                        defaultValue=""
                        onChange={(e) => {
                          const item = emptyDates.find((i) => i.key === e.target.value);
                          if (item) onPlaceDate(item, d.value);
                        }}
                        className={`${input} sm:max-w-xs`}
                      >
                        <option value="">Choose what it is the date of</option>
                        {emptyDates.map((i) => (
                          <option key={i.key} value={i.key}>
                            {i.meaning ?? i.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setDismissed((x) => [...x, d.value])}
                        className={linkButton}
                      >
                        Not needed
                      </button>
                    </div>
                  </div>
                ),
              )}
            </section>
          );
        })}

        {brief.unplaced.length > 0 && (
          <section aria-labelledby="brief-part-other" className="pt-6">
            <h2
              id="brief-part-other"
              className="font-heading text-brand-navy text-lg font-semibold"
            >
              Other things you gave
            </h2>
            <p className={small}>
              This document has no separate place for these. They still reach the draft.
            </p>
            <dl className="mt-3 space-y-2">
              {brief.unplaced.map((u, i) => (
                <div key={`${u.label}-${i}`} className="bg-brand-page rounded-lg p-3 text-sm">
                  <dt className="text-brand-navy font-medium capitalize">{u.label}</dt>
                  <dd className="text-brand-navy mt-0.5 whitespace-pre-wrap break-words">
                    {describeValue(u.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>

      {brief.still_unknown.length > 0 && (
        <section
          aria-labelledby="brief-unknown"
          className="border-brand-line bg-brand-page mt-4 rounded-xl border p-4 sm:p-5"
        >
          <h2 id="brief-unknown" className="font-heading text-brand-navy text-lg font-semibold">
            Still unknown. These will be blanks in the draft.
          </h2>
          <ul className="mt-3 space-y-2">
            {brief.still_unknown.map((u) => {
              const field = brief.items.find((i) => i.key === u.key);
              const hasField = field !== undefined;
              return (
                <li
                  key={u.key}
                  className="border-brand-line flex items-center justify-between gap-3 rounded-lg border bg-white p-3"
                >
                  <div className="min-w-0">
                    <p className="text-brand-navy text-sm font-medium">
                      {/* A date is named by what it is the date of, as on its field above. */}
                      {field?.kind === 'date' && field.meaning ? field.meaning : u.label}
                    </p>
                    <p className="text-brand-gold-dark break-words font-mono text-xs">
                      {u.placeholder}
                    </p>
                  </div>
                  {hasField && (
                    <button
                      type="button"
                      onClick={() => focusField(u.key)}
                      className={`${linkButton} flex-none whitespace-nowrap`}
                    >
                      Add it
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!brief.can_confirm && brief.confirm_message && (
        <button
          type="button"
          onClick={focusFirstBlocker}
          className="bg-brand-error-light text-brand-error focus-visible:ring-brand-teal mt-4 block w-full rounded-lg p-3 text-left text-sm font-semibold focus:outline-none focus-visible:ring-2"
        >
          {brief.confirm_message}
        </button>
      )}
      {message && (
        <p
          role="alert"
          className="bg-brand-error-light text-brand-error mt-4 rounded-lg p-3 text-sm"
        >
          {message}
        </p>
      )}

      {!noRules && (
        <p
          role="note"
          className="bg-brand-gold-light text-brand-gold-dark mt-4 rounded-lg p-3 text-sm"
        >
          {DESCRIPTION_IS_USED}
        </p>
      )}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-5">
          <button type="button" onClick={onEditDescription} className={linkButton}>
            Edit my description
          </button>
          {questionsLeft > 0 && (
            <button type="button" onClick={onMoreQuestions} className={linkButton}>
              Answer {questionsLeft} more {questionsLeft === 1 ? 'question' : 'questions'}
            </button>
          )}
          <button type="button" onClick={onCancel} className={linkButton}>
            Cancel
          </button>
        </div>
        <button
          type="button"
          onClick={brief.can_confirm ? onConfirm : focusFirstBlocker}
          aria-disabled={!brief.can_confirm || busy || confirming}
          disabled={busy || confirming}
          className={`${primaryButton} ${brief.can_confirm ? '' : 'opacity-40'}`}
        >
          {(busy || confirming) && (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          )}
          Confirm brief and continue
        </button>
      </div>
    </div>
  );
}
