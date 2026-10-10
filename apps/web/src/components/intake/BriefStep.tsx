'use client';

/**
 * B1 Check your brief (T-126), with its states: the court (B3), dates (B4),
 * Confirm off (B5) and the brief when nothing fits (B6).
 *
 * The only screen where details are entered, for every document. Every line of
 * fixed wording here is sent by the service (T-127, section 7): the blank a
 * missing fact leaves, the line under Confirm, and the labels.
 *
 * T-147b (`handoff/design/T-147b-brief-ledger-spec.md`): when the service sends
 * a fact ledger, each row shows its fact's `display`, the advocate's own words
 * on request, a "Required" tag, and what could not be read as "To be asked".
 * Without a ledger the screen is exactly as before.
 */
import { ChevronDown, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  Brief,
  BriefCourt,
  BriefItem,
  dateInWords,
  describeValue,
  EditOutcome,
  fieldValueOf,
  hasReveal,
  isEmptyValue,
  Ledger,
  LedgerFact,
  ledgerEntryOf,
  PART_ORDER,
  PART_TITLES,
  renderedLedgerFacts,
  revealLabel,
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

type RowStatus =
  | { kind: 'saving'; typed: Value }
  | { kind: 'saved_as'; display: string }
  | { kind: 'unreadable'; typed: Value; detail: string }
  | { kind: 'failed'; typed: Value };

/** T-147b, section 3: the advocate's own words, under the field they explain. */
function Reveal({
  id,
  lines,
}: {
  id: string;
  lines: string[];
}) {
  return (
    <div
      id={id}
      className="border-brand-line bg-brand-page text-brand-navy mt-1.5 whitespace-pre-wrap break-words rounded-r-lg border-l-2 py-2 pl-3 pr-2 text-sm"
    >
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </div>
  );
}

function spanLine(label: string, span: string): string {
  return `${label}: “${span}”`;
}

function factLines(fact: LedgerFact): string[] {
  const edited = fact.previous_display !== undefined;
  const lines = [spanLine(revealLabel(fact.source, edited), fact.raw_span)];
  if (edited) lines.push(`You changed this. Before: ${fact.previous_display}.`);
  return lines;
}

function Item({
  item,
  ledger,
  needed,
  blocksConfirm,
  onCommit,
}: {
  item: BriefItem;
  /** T-147b: the fact ledger, when the service sent one. */
  ledger: Ledger | null;
  /** True when this is a party's name that Confirm is waiting for. */
  needed: boolean;
  /** True when Confirm waits for this field while it is empty (T-139): a party's name on a court document. */
  blocksConfirm: boolean;
  onCommit: (value: Value) => void | Promise<EditOutcome | null>;
}) {
  const id = fieldId(item.key);
  const entry = ledgerEntryOf(ledger, item.key);
  const onLedger = ledger !== null && entry.type !== undefined;
  const [status, setStatus] = useState<RowStatus | null>(null);
  const [open, setOpen] = useState(false);

  // T-147b: the row renders from the ledger. With no fact and nothing outstanding,
  // the brief's own value shows as before.
  const shown: Value | null =
    status && 'typed' in status && status.kind !== 'saving'
      ? status.typed
      : entry.fact
        ? fieldValueOf(item, entry.fact)
        : entry.unresolved
          ? null
          : item.value;
  const empty = isEmptyValue(shown);
  const heading = item.kind === 'date' && item.meaning ? item.meaning : item.label;
  const toBeAsked = onLedger && entry.unresolved !== undefined && !entry.fact;
  // A required fact, or one an edited description left unclear (T-150), shows its blank.
  const showBlank = empty && (item.required || item.reask === true || toBeAsked);
  const pleaseCheck = onLedger && entry.fact
    ? entry.fact.source === 'user' || item.note !== undefined
    : item.please_check;
  const required = ledger !== null && (item.required || blocksConfirm || entry.fact?.required_in_draft === true);
  const badRead = status?.kind === 'unreadable';
  // These sit on top of the shared field look, so they are marked important.
  const look =
    needed || badRead
      ? '!border-brand-error !border-2'
      : pleaseCheck
        ? '!bg-brand-gold-light !border-brand-gold'
        : showBlank
          ? '!border-dashed'
          : '';

  const commit = async (value: Value) => {
    if (!onLedger) {
      void onCommit(value);
      return;
    }
    setStatus({ kind: 'saving', typed: value });
    const out = await onCommit(value);
    if (!out) {
      setStatus(null);
      return;
    }
    if (out.status === 'failed') setStatus({ kind: 'failed', typed: value });
    else if (out.status === 'unreadable') {
      setStatus({ kind: 'unreadable', typed: value, detail: out.detail });
    } else if (out.display !== null && out.display.trim() !== describeValue(value).trim()) {
      setStatus({ kind: 'saved_as', display: out.display });
    } else setStatus(null);
  };

  const revealLines = entry.fact
    ? hasReveal(entry.fact)
      ? factLines(entry.fact)
      : null
    : toBeAsked && entry.unresolved
      ? [spanLine(revealLabel(entry.unresolved.source, false), entry.unresolved.raw_span), entry.unresolved.detail]
      : null;
  const revealButtonLabel = entry.fact
    ? revealLabel(entry.fact.source, entry.fact.previous_display !== undefined)
    : entry.unresolved
      ? revealLabel(entry.unresolved.source, false)
      : '';
  // An item we could not read shows its words at once, and they stay open.
  const revealOpen = toBeAsked || open;

  const statusLine =
    status?.kind === 'saving' ? (
      <p id={`${id}-status`} className={`${small} mt-1`} aria-live="polite">
        Saving…
      </p>
    ) : status?.kind === 'saved_as' ? (
      <p id={`${id}-status`} className={`${small} mt-1`} aria-live="polite">
        Saved as {status.display}.
      </p>
    ) : status?.kind === 'unreadable' ? (
      <p id={`${id}-status`} className={`${small} mt-1`} role="alert">
        We could not read this for certain. {status.detail} Your earlier value is kept.
      </p>
    ) : status?.kind === 'failed' ? (
      <p id={`${id}-status`} className={`${small} mt-1`} role="alert">
        Could not save this change.{' '}
        <button type="button" className={linkButton} onClick={() => void commit(status.typed)}>
          Try again
        </button>
      </p>
    ) : null;

  return (
    <div
      className={WIDE.has(item.kind) ? 'sm:col-span-2' : ''}
      {...(onLedger && entry.fact
        ? { 'data-ledger-key': entry.fact.key, 'data-ledger-display': entry.fact.display }
        : {})}
      {...(toBeAsked ? { 'data-ledger-unresolved': item.key } : {})}
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <label htmlFor={id} className={labelClass}>
            {heading}
          </label>
          {required ? (
            <span id={`${id}-required`} className={tagPlain}>
              Required
            </span>
          ) : (
            blocksConfirm && <span className="text-brand-muted text-xs">Required</span>
          )}
          {pleaseCheck && <span className={tagGold}>Please check</span>}
          {toBeAsked && <span className={tagGold}>To be asked</span>}
          {needed && <span className={tagError}>Needed to continue</span>}
        </div>
        {revealLines && !toBeAsked && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-span`}
            aria-label={`${revealButtonLabel}, ${heading}`}
            onClick={() => setOpen((o) => !o)}
            className={`${linkButton} flex-none`}
          >
            {revealButtonLabel}
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>
      <div className="mt-1.5">
        <ValueInput
          id={id}
          kind={item.kind}
          options={item.options}
          value={shown}
          onCommit={(v) => void commit(v)}
          className={look}
          placeholder={showBlank ? 'Not given' : undefined}
          words={entry.type === 'amount'}
          describedBy={
            [
              required ? `${id}-required` : '',
              item.note ? `${id}-note` : '',
              statusLine ? `${id}-status` : '',
              showBlank && !needed ? `${id}-blank` : '',
            ]
              .filter((d) => d !== '')
              .join(' ') || undefined
          }
          invalid={needed || badRead}
        />
      </div>
      {revealLines && revealOpen && <Reveal id={`${id}-span`} lines={revealLines} />}
      {item.note && (
        <p id={`${id}-note`} className={`${small} mt-1`}>
          {item.note}
        </p>
      )}
      {statusLine}
      {showBlank && !needed && (
        <p id={`${id}-blank`} className={`${small} mt-1`}>
          The draft will show{' '}
          <span className="text-brand-gold-dark font-mono text-xs">{item.placeholder}</span>
        </p>
      )}
    </div>
  );
}

/** T-147b: a ledger fact this document has no field for, under "Other things you gave". */
function OtherFact({ fact }: { fact: LedgerFact }) {
  const [open, setOpen] = useState(false);
  const id = fieldId(`other-${fact.key}`);
  const label = revealLabel(fact.source, fact.previous_display !== undefined);
  return (
    <div
      className="bg-brand-page rounded-lg p-3 text-sm"
      data-ledger-key={fact.key}
      data-ledger-display={fact.display}
    >
      <div className="flex items-start gap-2">
        <dt className="text-brand-navy min-w-0 flex-1 font-medium">{fact.label}</dt>
        {hasReveal(fact) && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-span`}
            aria-label={`${label}, ${fact.label}`}
            onClick={() => setOpen((o) => !o)}
            className={`${linkButton} flex-none`}
          >
            {label}
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>
      <dd className="text-brand-navy mt-0.5 whitespace-pre-wrap break-words">
        {fact.display}
        {open && <Reveal id={`${id}-span`} lines={factLines(fact)} />}
      </dd>
    </div>
  );
}

const BRIEF_SUB =
  'This is what we will write from. Change anything that is wrong. Nothing is drafted until you confirm.';

/**
 * T-147b, section 6: the brief while it is read the first time. Static grey
 * boxes, no shimmer, no Confirm.
 */
export function BriefLoading() {
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <h1 className={h1}>Check your brief</h1>
      <p className={sub}>{BRIEF_SUB}</p>
      <div className={`${card} mt-6 space-y-5`} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div className="h-[14px] w-1/3 rounded bg-slate-100" />
            <div className="mt-1.5 h-12 w-full rounded-lg bg-slate-100" />
          </div>
        ))}
      </div>
      <p className={`${small} mt-4 flex items-center gap-2`} aria-live="polite">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        Reading your description…
      </p>
    </div>
  );
}

/** T-147b, section 6: the brief could not be loaded. "Edit my description" stays. */
export function BriefLoadError({
  onRetry,
  onEditDescription,
}: {
  onRetry: () => void;
  onEditDescription: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <h1 className={h1}>Check your brief</h1>
      <p className={sub}>{BRIEF_SUB}</p>
      <div
        role="alert"
        className="bg-brand-error-light text-brand-error mt-6 flex flex-col gap-3 rounded-lg p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
      >
        <p>We could not load your brief.</p>
        <button type="button" onClick={onRetry} className={secondaryButton}>
          Try again
        </button>
      </div>
      <div className="mt-6">
        <button type="button" onClick={onEditDescription} className={linkButton}>
          Edit my description
        </button>
      </div>
    </div>
  );
}

export default function BriefStep({
  brief,
  ledger = null,
  focusOutstanding = false,
  onOutstandingFocused,
  outstandingQuestions = 0,
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
  /** T-147b: the fact ledger, when the service sent one. Rows render from it. */
  ledger?: Ledger | null;
  /** T-147b: back from "Answer N questions" in the outstanding block: focus its heading. */
  focusOutstanding?: boolean;
  onOutstandingFocused?: () => void;
  /** T-147b: open questions for the outstanding items, for "Answer N questions". */
  outstandingQuestions?: number;
  /** True while the brief is being worked out again after a change. */
  busy: boolean;
  confirming: boolean;
  /** A problem to show above the buttons. */
  message: string | null;
  questionsLeft: number;
  /** With a ledger, resolves to what the edit came to, for the row's status line. */
  onValue: (item: BriefItem, value: Value) => void | Promise<EditOutcome | null>;
  onCourt: (court: BriefCourt) => void;
  /** Only when nothing fits: the advocate may rename the document. */
  onKindName: (name: string) => void;
  onPlaceDate: (item: BriefItem, date: string) => void;
  onChangeDocument: () => void;
  /** `outstanding` when opened from the outstanding block, so focus returns there. */
  onMoreQuestions: (from?: 'outstanding') => void;
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
  // T-147b: what the screen shows from the ledger. Every fact renders: on its
  // row, or under "Other things you gave" when the document has no row for it.
  const itemKeys = new Set(brief.items.map((i) => i.key));
  const ledgerFacts = ledger ? renderedLedgerFacts(ledger) : [];
  const otherFacts = ledger ? ledger.facts.filter((f) => !itemKeys.has(f.key)) : [];
  const outstanding = ledger ? ledger.unresolved.filter((u) => !ledger.facts.some((f) => f.key === u.key)) : [];
  const nothingRead = ledger !== null && ledgerFacts.length === 0 && outstanding.length === 0;

  // T-147b, section 9: coming back from the questions opened here, focus the block's
  // heading. When the last item was answered the block is gone, and focus stays put.
  const outstandingHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!focusOutstanding) return;
    outstandingHeading.current?.focus();
    onOutstandingFocused?.();
  }, [focusOutstanding, onOutstandingFocused]);

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

      {nothingRead && (
        <p className="bg-brand-page text-brand-navy mt-4 rounded-lg p-3 text-sm">
          We did not find any details in your description. Add them below, or edit your
          description.
        </p>
      )}

      {outstanding.length > 0 && (
        <section
          aria-labelledby="brief-outstanding"
          className="bg-brand-gold-light mt-4 rounded-xl p-4 sm:p-5"
        >
          <h2
            id="brief-outstanding"
            ref={outstandingHeading}
            tabIndex={-1}
            className="font-heading text-brand-navy text-lg font-semibold"
          >
            We could not read these for certain
          </h2>
          <p className={small}>We have not filled these in. Please answer them before you draft.</p>
          <ul className="mt-3 space-y-2">
            {outstanding.map((u) => (
              <li key={u.id} className="border-brand-line rounded-lg border bg-white p-3">
                <p className="text-brand-navy text-sm font-medium">{u.label}</p>
                <p className={`${small} text-brand-navy break-words`}>
                  {spanLine(revealLabel(u.source, false), u.raw_span)}
                </p>
                <p className={small}>{u.detail}</p>
              </li>
            ))}
          </ul>
          {outstandingQuestions > 0 && (
            <button
              type="button"
              onClick={() => onMoreQuestions('outstanding')}
              className={`${secondaryButton} mt-3`}
            >
              {outstandingQuestions === 1
                ? 'Answer 1 question'
                : `Answer ${outstandingQuestions} questions`}
            </button>
          )}
        </section>
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
                    ledger={ledger}
                    needed={
                      partiesNeeded && item.party_name && item.required && isEmptyValue(item.value)
                    }
                    blocksConfirm={brief.kind.court_document && item.party_name && item.required}
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

        {(brief.unplaced.length > 0 || otherFacts.length > 0) && (
          <section aria-labelledby="brief-part-other" className="pt-6">
            <h2
              id="brief-part-other"
              className="font-heading text-brand-navy text-lg font-semibold"
            >
              Other things you gave
            </h2>
            {brief.unplaced.length > 0 && (
              <>
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
              </>
            )}
            {/* T-147b: ledger-only facts do not reach the draft until T-147c, so that line is not shown for them. */}
            {otherFacts.length > 0 && (
              <dl className="mt-3 space-y-2">
                {otherFacts.map((f) => (
                  <OtherFact key={f.id} fact={f} />
                ))}
              </dl>
            )}
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
            <button type="button" onClick={() => onMoreQuestions()} className={linkButton}>
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
