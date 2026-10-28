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
import { useEffect, useMemo, useRef, useState } from 'react';

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
  ledgerGivenKeys,
  PART_ORDER,
  PART_TITLES,
  renderedLedgerFacts,
  revealLabel,
  Value,
} from './briefTypes';
import CourtPicker from './CourtPicker';
import InkCostLine, { inkCostState } from './InkCostLine';
import * as nl from './nlUi';
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

import { ErrorState, Skeleton } from '@/components/ui';
import { useSignupConsent } from '@/lib/signupConsent';

/**
 * T-136. Ajay's line (CLO, 7 Oct 2026, part 2, condition 2), word for word. The
 * description goes to the Drafter of a document with a rule pack, so the
 * advocate is told before generating and can still change it. Do not reword.
 */
const DESCRIPTION_IS_USED =
  'Your description is used in full, together with this brief. If anything in it is wrong, or should not be in the draft, change the description before you generate.';

/** T-372: the line under Confirm saying what the draft costs (now in InkCostLine, T-388). */
export { formatInkCost } from './InkCostLine';

/** T-372: id of the Ink cost line, which describes the confirm button. */
export const INK_COST_ID = 'brief-confirm-ink-cost';

/**
 * T-363 AC1: the two buttons under T-192's B2 line, exactly as Ajay signed
 * them (T-363, Addendum 1, item 4). Do not reword.
 */
export const DATE_CHECK_CONTINUE = 'Continue with these dates';
export const DATE_CHECK_CHANGE = 'Change the dates';

/** T-363 AC1: id of the B2 block, which describes the confirm button while it waits. */
export const DATE_CHECK_ID = 'brief-date-check';

/** T-363 AC1: the s.138 dates B2 is about, in the order they are offered to change. */
const DATE_CHECK_KEYS = ['memo_received_date', 'notice_sent_date'];

function lastKeySegment(key: string): string {
  const at = key.lastIndexOf('.');
  return at < 0 ? key : key.slice(at + 1);
}

/** T-365: the choices that write no fact, folded as the service folds them (T-190). */
const NOT_KNOWN_ANSWERS = new Set(['not known', 'not given']);

/** T-365: case, spacing and punctuation folded, as the service's `foldAnswer`. */
function foldAnswer(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * T-365 AC2: the option an item answered "Not known" shows as chosen. The
 * service sends such an item with no value and `asked_empty`, so without this
 * its row looks empty and unanswered.
 */
export function notKnownOption(item: BriefItem): string | undefined {
  if (!item.asked_empty || (item.kind !== 'choice' && item.kind !== 'choices')) return undefined;
  return item.options.find((o) => NOT_KNOWN_ANSWERS.has(foldAnswer(o)));
}

/**
 * T-365 AC2: what a row answered with no fact ("Not known", "none") shows, so a
 * row the advocate answered never looks empty. A choice shows the option that
 * was chosen; a typed field shows the words given. A date field cannot show
 * words, so it gives nothing here: `isNotKnownDate` flags it instead and the
 * row shows a "Not known" chip (T-384). Undefined when the item is not
 * `asked_empty`.
 */
export function askedEmptyValue(item: BriefItem, answer?: Value): Value | undefined {
  if (!item.asked_empty) return undefined;
  const said = typeof answer === 'string' ? answer : Array.isArray(answer) ? answer[0] : undefined;
  if (item.kind === 'choice' || item.kind === 'choices') {
    const folded = said === undefined ? undefined : foldAnswer(said);
    // With no matching answer, fall back only when one option alone writes no
    // fact: with both "Not known" and "Not given" the answer cannot be guessed.
    const noFact = item.options.filter((o) => NOT_KNOWN_ANSWERS.has(foldAnswer(o)));
    const option =
      (folded !== undefined ? item.options.find((o) => foldAnswer(o) === folded) : undefined) ??
      (noFact.length === 1 ? noFact[0] : undefined);
    if (option === undefined) return undefined;
    return item.kind === 'choices' ? [option] : option;
  }
  if (item.kind === 'date' || said === undefined || said.trim() === '') return undefined;
  return said;
}

/**
 * T-384: a date row the advocate answered "Not known" (or "Not given"). A date
 * input cannot show words, so the row shows a "Not known" chip in its place.
 */
export function isNotKnownDate(item: BriefItem, answer?: Value): boolean {
  if (!item.asked_empty || item.kind !== 'date') return false;
  const said = typeof answer === 'string' ? answer : Array.isArray(answer) ? answer[0] : undefined;
  return said !== undefined && NOT_KNOWN_ANSWERS.has(foldAnswer(said));
}

/** Long text and rows of choices take the full width of the card. */
const WIDE = new Set(['narrative', 'list', 'choice', 'choices']);

function fieldId(key: string): string {
  return `brief-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

type RowStatus =
  | { kind: 'saving'; typed: Value }
  // T-612: the service took no ledger edit for this row; what was picked stays on screen.
  | { kind: 'kept'; typed: Value }
  | { kind: 'saved_as'; display: string }
  | { kind: 'unreadable'; typed: Value; detail: string }
  | { kind: 'failed'; typed: Value };

/** T-147b, section 3: the advocate's own words, under the field they explain. */
function Reveal({ id, lines }: { id: string; lines: string[] }) {
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
  askedAnswer,
}: {
  item: BriefItem;
  /** T-147b: the fact ledger, when the service sent one. */
  ledger: Ledger | null;
  /** True when this is a party's name that Confirm is waiting for. */
  needed: boolean;
  /** True when Confirm waits for this field while it is empty (T-139): a party's name on a court document. */
  blocksConfirm: boolean;
  onCommit: (value: Value) => void | Promise<EditOutcome | null>;
  /** T-365 AC2: the advocate's answer, when the service sent this item as `asked_empty`. */
  askedAnswer?: Value;
}) {
  const id = fieldId(item.key);
  const entry = ledgerEntryOf(ledger, item.key);
  const onLedger = ledger !== null && entry.type !== undefined;
  const [status, setStatus] = useState<RowStatus | null>(null);
  const [open, setOpen] = useState(false);
  // T-365 AC2: answered "Not known" or "none", with no fact placed since.
  const notKnown =
    isEmptyValue(item.value) && !entry.fact ? askedEmptyValue(item, askedAnswer) : undefined;
  // T-384: a date answered "Not known" shows a chip, so it is neither blank nor "To be asked".
  const notKnownDate = isEmptyValue(item.value) && !entry.fact && isNotKnownDate(item, askedAnswer);

  // T-147b: the row renders from the ledger. With no fact and nothing outstanding,
  // the brief's own value shows as before. T-612: several choices or a list is one
  // fact per entry under the same key, so every one of them is the row's value.
  const multi = item.kind === 'choices' || item.kind === 'list';
  const multiFacts = multi && ledger ? ledger.facts.filter((f) => f.key === item.key) : [];
  // T-612: a pick kept after a null outcome gives way once the ledger's entries
  // for this key change (a re-read, another document).
  const multiDisplaysKey = multi ? JSON.stringify(multiFacts.map((f) => f.display)) : '[]';
  const multiLedgerKey = multi
    ? JSON.stringify([multiDisplaysKey, entry.unresolved?.raw_span ?? null])
    : '';
  // T-612: the same array while the entries are the same, so a re-render elsewhere
  // does not reset a list being typed in (ValueInput resets on a new value).
  const multiShown = useMemo(() => JSON.parse(multiDisplaysKey) as string[], [multiDisplaysKey]);
  useEffect(() => {
    setStatus((s) => (s?.kind === 'kept' ? null : s));
  }, [multiLedgerKey]);
  // T-612: only the newest pick on this row may set its status; an older answer
  // arriving later must not undo it.
  const latestCommit = useRef(0);
  // T-612: for several choices or a list, what was just picked shows while it
  // saves too, so a chip stays ticked and the next tick adds to it.
  const shown: Value | null =
    status && 'typed' in status && (multi || status.kind !== 'saving')
      ? status.typed
      : notKnown !== undefined
        ? notKnown
        : entry.fact
          ? multi
            ? multiShown
            : fieldValueOf(item, entry.fact)
          : entry.unresolved
            ? null
            : item.value;
  const empty = isEmptyValue(shown);
  const heading = item.kind === 'date' && item.meaning ? item.meaning : item.label;
  const toBeAsked =
    onLedger &&
    entry.unresolved !== undefined &&
    !entry.fact &&
    notKnown === undefined &&
    !notKnownDate;
  // A required fact, or one an edited description left unclear (T-150), shows its blank.
  const showBlank = empty && !notKnownDate && (item.required || item.reask === true || toBeAsked);
  const pleaseCheck =
    onLedger && entry.fact
      ? entry.fact.source === 'user' || item.note !== undefined
      : item.please_check;
  const required =
    ledger !== null && (item.required || blocksConfirm || entry.fact?.required_in_draft === true);
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
    const mine = ++latestCommit.current;
    setStatus({ kind: 'saving', typed: value });
    const out = await onCommit(value);
    if (mine !== latestCommit.current) return;
    if (!out) {
      // T-612: no ledger result for this row. For several choices or a list,
      // falling back to the ledger reset the chips, so the pick stays on screen.
      setStatus(multi ? { kind: 'kept', typed: value } : null);
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
      ? [
          spanLine(revealLabel(entry.unresolved.source, false), entry.unresolved.raw_span),
          entry.unresolved.detail,
        ]
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
        ? {
            'data-ledger-key': entry.fact.key,
            'data-ledger-display': multi ? multiShown.join(', ') : entry.fact.display,
          }
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
          notKnownDate={notKnownDate}
          notKnownLabel={heading}
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

/** T-521: signed, copy row 458 ("Describe failed"); action `Retry`. */
export const DESCRIBE_FAILED = 'Could not read your description. Try again.';

/**
 * T-147b, section 6: the brief while it is read the first time. No Confirm.
 * T-521 (spec 04): the folio with a skeleton; "Still working…" after 8s.
 */
export function BriefLoading() {
  // T-521 (WCAG 4.1.3): a live region mounted with its text already in it is often not
  // announced. The status is mounted empty and filled after the first paint; the visible
  // line is the same text, hidden from screen readers so it is not read twice.
  const [announce, setAnnounce] = useState(false);
  useEffect(() => {
    setAnnounce(true);
  }, []);
  return (
    <div className={nl.page}>
      <h1 className={nl.h1}>Check your brief</h1>
      <p className={nl.sub}>{BRIEF_SUB}</p>
      <div className={`${nl.folio} mt-nl-6 space-y-nl-5`}>
        <p className={nl.small} aria-hidden="true">
          Reading your description…
        </p>
        <p className="sr-only" role="status">
          {announce ? 'Reading your description…' : null}
        </p>
        <Skeleton lines={6} />
      </div>
    </div>
  );
}

/**
 * T-147b, section 6: the brief could not be loaded. "Edit my description" stays.
 * T-521 (spec 04): the signed describe error with Retry, and the advocate's text
 * shown as kept.
 */
export function BriefLoadError({
  onRetry,
  onEditDescription,
  description,
}: {
  onRetry: () => void;
  onEditDescription: () => void;
  /** The description as typed. It is kept; Retry sends it again. */
  description?: string;
}) {
  return (
    <div className={nl.page}>
      <h1 className={nl.h1}>Check your brief</h1>
      <p className={nl.sub}>{BRIEF_SUB}</p>
      <div className={`${nl.folio} mt-nl-6 space-y-nl-4`}>
        <ErrorState message={DESCRIBE_FAILED} onRetry={onRetry} />
        {description ? (
          <figure>
            <figcaption className={nl.label}>Your description</figcaption>
            <blockquote className="nl-body text-nl-text mt-nl-2 whitespace-pre-wrap break-words">
              {description}
            </blockquote>
          </figure>
        ) : null}
      </div>
      <div className="mt-nl-6">
        <button type="button" onClick={onEditDescription} className={nl.linkButton}>
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
  updating = false,
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
  confirmDescribedBy,
  inkCost,
  inkCostLoading = false,
  onInkCostRetry,
  inkCostKind,
  askedAnswers,
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
  /**
   * T-481: a change on the brief is being worked out again. Confirm shows as
   * busy but stays pressable: a press is held and acted on when the brief is back.
   */
  updating?: boolean;
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
  /** T-343: aria-describedby for the confirm (generate) button, e.g. the privacy P7 box. */
  confirmDescribedBy?: string;
  /** T-372: the template's Ink cost, shown under the confirm button when positive. */
  inkCost?: number;
  /** T-388: the cost is being fetched. */
  inkCostLoading?: boolean;
  /** T-388: fetches the cost again when it could not be worked out. */
  onInkCostRetry?: () => void;
  /** T-388: the document kind id, for the Sentry report only (defaults to the brief's kind). */
  inkCostKind?: string;
  /** T-365 AC2: the advocate's answers to the items sent as `asked_empty`, by key. */
  askedAnswers?: Record<string, Value>;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [name, setName] = useState(brief.kind.name);
  // T-363 AC1: the B2 line the advocate chose to continue with. A changed line
  // (the dates were edited) asks again.
  const [datesAcceptedFor, setDatesAcceptedFor] = useState<string | null>(null);
  const dateCheck = brief.date_check;
  const datesHeld = dateCheck !== undefined && datesAcceptedFor !== dateCheck.text;
  // T-498: a party name the ledger holds shows on its row, so it does not block
  // Confirm. The service already leaves it out when it had the ledger; this
  // keeps the screen in step when it did not. With no ledger nothing changes.
  const ledgerGiven = ledgerGivenKeys(ledger);
  const partyMissing = (i: BriefItem): boolean =>
    i.party_name && i.required && isEmptyValue(i.value) && !ledgerGiven.has(i.key);
  const partiesNeeded =
    brief.confirm_blockers.includes('parties') && brief.items.some(partyMissing);
  const courtNeeded = brief.confirm_blockers.includes('court');
  // T-629: a required field (main_suit_relief, restraint_sought) blocks until
  // the service says otherwise. The ledger never lifts it (fail closed).
  const requiredNeeded = brief.confirm_blockers.includes('required_fields');
  // Only the parties the ledger holds are lifted; any other "no" stays.
  const partiesLifted = brief.confirm_blockers.includes('parties') && !partiesNeeded;
  const briefCanConfirm = brief.can_confirm || (partiesLifted && !courtNeeded && !requiredNeeded);
  // The service's lines, unless the parties were lifted: then the court's line
  // (Ajay's signed wording, T-127 section 7.2, as in apps/drafting
  // intake-brief.ts) if the court is still needed, and the required fields'
  // signed lines after it (T-629, T-613 §(j)2). The service's first line is the
  // court/parties line whenever either blocks.
  const serviceLines = (brief.confirm_message ?? '').split('\n').filter((l) => l !== '');
  const fieldLines =
    courtNeeded || brief.confirm_blockers.includes('parties')
      ? serviceLines.slice(1)
      : serviceLines;
  const liftedLines = [...(courtNeeded ? ['Choose the court to continue.'] : []), ...fieldLines];
  const confirmLine = briefCanConfirm
    ? null
    : partiesLifted
      ? liftedLines.length > 0
        ? liftedLines.join('\n')
        : null
      : brief.confirm_message;
  const canConfirm = briefCanConfirm && !datesHeld;
  const dateCheckContinue = useRef<HTMLButtonElement>(null);
  // The service may tidy the name. What it sends back is what is shown.
  useEffect(() => {
    setName(brief.kind.name);
  }, [brief.kind.name]);
  const noRules = brief.kind.id === null;
  const anyChecked = brief.items.some((i) => i.please_check);
  // T-147b: what the screen shows from the ledger. Every fact renders: on its
  // row, or under "Other things you gave" when the document has no row for it.
  const itemKeys = new Set(brief.items.map((i) => i.key));
  const ledgerFacts = ledger ? renderedLedgerFacts(ledger) : [];
  const otherFacts = ledger ? ledger.facts.filter((f) => !itemKeys.has(f.key)) : [];
  const outstanding = ledger
    ? ledger.unresolved.filter((u) => !ledger.facts.some((f) => f.key === u.key))
    : [];
  const nothingRead = ledger !== null && ledgerFacts.length === 0 && outstanding.length === 0;
  // T-498: a fact the ledger holds shows on its row, so it is not still unknown.
  // With no ledger the list is the brief's own, as before.
  const stillUnknown = brief.still_unknown.filter((u) => !ledgerGiven.has(u.key));
  // T-372 / T-388: the Ink cost slot (loading, "Uses N Ink" or the notice)
  // always describes the confirm button. Confirm charges, so it waits for a
  // known cost (Arjun); like its other blockers it stays aria-disabled only.
  const costKnown = inkCostState(inkCost, inkCostLoading) === 'known';
  const confirmOff = !canConfirm || !costKnown;
  const confirmDescribedByIds =
    [confirmDescribedBy, INK_COST_ID, datesHeld ? DATE_CHECK_ID : undefined]
      .filter(Boolean)
      .join(' ') || undefined;

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

  // T-363 AC1: "Change the dates" goes to the first of the dates B2 is about.
  const changeDates = () => {
    const item =
      DATE_CHECK_KEYS.map((k) => brief.items.find((i) => lastKeySegment(i.key) === k)).find(
        (i) => i !== undefined,
      ) ?? brief.items.find((i) => i.kind === 'date');
    if (item) focusField(item.key);
  };

  const focusFirstBlocker = () => {
    // T-363 AC1: the court and the parties come first, as before; then the dates.
    if (briefCanConfirm && datesHeld) {
      dateCheckContinue.current?.scrollIntoView({ block: 'center' });
      dateCheckContinue.current?.focus();
      return;
    }
    if (courtNeeded) {
      // T-411: a consumer complaint asks for the Commission level first.
      const levelGroup = document.querySelector('[aria-labelledby="brief-court-level-label"]');
      if (levelGroup && !levelGroup.querySelector('[aria-checked="true"]')) {
        const chip = levelGroup.querySelector<HTMLElement>('[role="radio"][tabindex="0"]');
        chip?.scrollIntoView({ block: 'center' });
        chip?.focus();
        return;
      }
      const el = ['brief-court-state', 'brief-court-type', 'brief-court-court']
        .map((id) => document.getElementById(id) as HTMLSelectElement | null)
        .find((s) => s && !s.disabled && s.value === '');
      el?.scrollIntoView({ block: 'center' });
      el?.focus();
      return;
    }
    const party = brief.items.find(partyMissing);
    if (party) {
      focusField(party.key);
      return;
    }
    // T-629: then the first required field, in the signed order (§(j)2).
    const field = requiredNeeded ? brief.confirm_blocking_keys?.[0] : undefined;
    if (field) focusField(field);
  };

  /** What a press of Confirm does, with the brief as it is now. */
  const pressConfirm = () => {
    if (!canConfirm) focusFirstBlocker();
    else if (costKnown) onConfirm();
    // T-388: with an unknown cost nothing starts and focus does not move.
  };
  const pressConfirmRef = useRef(pressConfirm);
  pressConfirmRef.current = pressConfirm;

  // T-481: a typed field commits on blur, so pressing Confirm just after typing
  // starts an update between mousedown and mouseup. A natively disabled button
  // would swallow that click, so Confirm is not disabled for an update: the
  // press is held and acted on, with the brief the service sent back, once the
  // update ends. A failed update (its line shows in `message`) drops the press.
  const [confirmHeld, setConfirmHeld] = useState(false);
  const pending = busy || updating || confirming;
  // T-642 (Rajesh 3, option a): while the sign-up consent panel shows, its button is the one primary.
  const { needed: signupConsentNeeded } = useSignupConsent();
  useEffect(() => {
    if (!confirmHeld || updating) return;
    setConfirmHeld(false);
    if (busy || confirming || message !== null) return;
    pressConfirmRef.current();
  }, [confirmHeld, updating, busy, confirming, message]);
  const onConfirmClick = () => {
    if (busy || confirming) return;
    if (updating) {
      setConfirmHeld(true);
      return;
    }
    pressConfirm();
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
          We did not find any details in your description. Add them below, or edit your description.
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
            <CourtPicker
              court={brief.court}
              onChange={onCourt}
              missing={courtNeeded}
              templateId={brief.kind.id ?? undefined}
            />
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
                    needed={partiesNeeded && partyMissing(item)}
                    blocksConfirm={brief.kind.court_document && item.party_name && item.required}
                    onCommit={(v) => onValue(item, v)}
                    askedAnswer={askedAnswers?.[item.key]}
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

      {stillUnknown.length > 0 && (
        <section
          aria-labelledby="brief-unknown"
          className="border-brand-line bg-brand-page mt-4 rounded-xl border p-4 sm:p-5"
        >
          <h2 id="brief-unknown" className="font-heading text-brand-navy text-lg font-semibold">
            Still unknown. These will be blanks in the draft.
          </h2>
          <ul className="mt-3 space-y-2">
            {stillUnknown.map((u) => {
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

      {dateCheck && (
        <section
          id={DATE_CHECK_ID}
          aria-label="Check the dates"
          className="bg-brand-error-light text-brand-error mt-4 rounded-lg p-3 text-sm"
        >
          <p className="font-semibold">{dateCheck.text}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              ref={dateCheckContinue}
              type="button"
              aria-pressed={!datesHeld}
              onClick={() => setDatesAcceptedFor(dateCheck.text)}
              className={secondaryButton}
            >
              {DATE_CHECK_CONTINUE}
            </button>
            <button type="button" onClick={changeDates} className={secondaryButton}>
              {DATE_CHECK_CHANGE}
            </button>
          </div>
        </section>
      )}

      {confirmLine && (
        <button
          type="button"
          onClick={focusFirstBlocker}
          className="bg-brand-error-light text-brand-error focus-visible:ring-brand-teal mt-4 block w-full whitespace-pre-line rounded-lg p-3 text-left text-sm font-semibold focus:outline-none focus-visible:ring-2"
        >
          {confirmLine}
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
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <button
            type="button"
            // T-388: with an unknown cost nothing starts and focus does not move;
            // the notice in the cost slot says why.
            onClick={onConfirmClick}
            aria-disabled={confirmOff || pending}
            aria-describedby={confirmDescribedByIds}
            // T-481: not while an update runs (see `onConfirmClick`).
            disabled={busy || confirming}
            // T-642: secondary while the consent panel shows, sized as primary so nothing shifts
            // (48px min height, text-base, and 23px side padding + the 1px border = primary's 24px).
            className={`${
              signupConsentNeeded
                ? secondaryButton
                    .replace('min-h-[44px]', 'min-h-[48px]')
                    .replace('px-4', 'px-[23px]')
                    .replace('text-sm', 'text-base')
                : primaryButton
            } ${confirmOff ? 'opacity-40' : ''}`}
          >
            {pending && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Confirm brief and continue
          </button>
          <InkCostLine
            id={INK_COST_ID}
            cost={inkCost}
            loading={inkCostLoading}
            onRetry={onInkCostRetry}
            kind={inkCostKind ?? brief.kind.id ?? 'unknown'}
            action="confirm"
          />
        </div>
      </div>
    </div>
  );
}
