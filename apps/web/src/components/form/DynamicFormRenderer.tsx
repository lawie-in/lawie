'use client';

/**
 * DynamicFormRenderer — Config-Driven Form (SCRUM-43, extended SCRUM-79).
 *
 * Reads a template config's form_schema and renders the full multi-step form.
 * Field types: text, date, number, textarea, dropdown, dropdown_search,
 * multi_select_search, checkbox_group, file (single/multi), currency (INR).
 * Handles show_if / depends_on conditional visibility, validation_pattern
 * (regex), min/max length, min_select, and cascading dropdowns
 * (state → court_type → court).
 *
 * Zero hardcoded fields — adding a new template = new JSON config only.
 */
import { ChevronLeft, ChevronRight, IndianRupee, Paperclip, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { isBailTemplate, NOT_OFFERED_SUFFIX, SAVED_TYPE_NAMES } from '../intake/bailCourts';
import ConsumerLevelGroup, {
  CONSUMER_COURT_LABEL,
  CONSUMER_COURT_TYPE,
  CONSUMER_NO_MATCH,
  CONSUMER_TEMPLATE_ID,
  LIVE_CLEARED,
  LIVE_COURT_SHOWN,
  LIVE_NATIONAL_SHOWN,
  LIVE_STATE_SHOWN,
  NCDRC_COURT_ID,
  NCDRC_COURT_TYPE,
  NCDRC_OPTION_LABEL,
  NCDRC_STATE_ID,
  type ConsumerLevel,
  type LevelChangeHow,
} from '../intake/ConsumerLevelGroup';
import InkCostLine, { inkCostState } from '../intake/InkCostLine';

// ── Types (mirrored from backend template-engine types) ─────────────────────

export interface FieldOption {
  id: string;
  label: string;
}

export interface FormField {
  field_id: string;
  label: string;
  type:
    | 'text'
    | 'date'
    | 'number'
    | 'textarea'
    | 'dropdown'
    | 'dropdown_search'
    | 'multi_select_search'
    | 'checkbox_group'
    | 'file'
    | 'currency';
  required: boolean;
  placeholder?: string;
  default?: string;
  options?: FieldOption[];
  options_from?: string;
  source?: string;
  filtered_by?: string[];
  cascades_to?: string[];
  show_if?: string;
  depends_on?: string;
  inject_into?: string[];
  auto_convert_old?: boolean;
  links_to_formatting?: boolean;
  min_length?: number;
  max_length?: number;
  min_select?: number;
  validation_pattern?: string;
  validation_message?: string;
  multiple?: boolean;
  accept?: string;
  help?: string;
}

interface UploadedFile {
  name: string;
  size: number;
  type: string;
}

interface FormStep {
  step: number;
  title: string;
  fields: FormField[];
}

export interface TemplateConfig {
  template_id: string;
  display_name: string;
  supported_languages: string[];
  form_schema: {
    steps: FormStep[];
  };
}

// ── Props ───────────────────────────────────────────────────────────────────

interface DynamicFormRendererProps {
  config: TemplateConfig;
  onSubmit: (formData: Record<string, unknown>) => void;
  onCancel: () => void;
  submitting?: boolean;
  /** T-343: aria-describedby for the Generate (last-step) button, e.g. the privacy P7 box. */
  submitDescribedBy?: string;
  /** T-388: what "Generate document" charges (template-configs `credits_cost`). */
  inkCost?: number;
  /** T-388: the cost is being fetched. */
  inkCostLoading?: boolean;
  /** T-388: fetches the cost again when it could not be worked out. */
  onInkCostRetry?: () => void;
  /** T-388: the template id, for the Sentry report only. */
  templateId?: string;
  /**
   * T-432: answers to start from, read on mount only (merged over the schema
   * defaults). The page passes back the last snapshot when it shows the form
   * again, so a return from the privacy block, the paywall, the verify-email
   * bounce or "Edit form" keeps what was typed. Held in memory by the caller;
   * never written to browser storage.
   */
  initialValues?: Record<string, unknown>;
  /** T-432: the step to start on, read on mount only (clamped to the schema). */
  initialStep?: number;
  /** T-432: the consumer Commission level to start with, read on mount only. */
  initialLevel?: ConsumerLevel | null;
  /** T-432: called with the answers, step and level whenever any of them changes. */
  onStateChange?: (
    values: Record<string, unknown>,
    step: number,
    level: ConsumerLevel | null,
  ) => void;
}

/** T-432: what the form reports through `onStateChange`, for the caller to hold. */
export interface FormSnapshot {
  values: Record<string, unknown>;
  step: number;
  level: ConsumerLevel | null;
}

/** T-388: id of the Ink cost line under "Generate document". */
export const SUBMIT_INK_COST_ID = 'form-submit-ink-cost';

// ── Helper: evaluate show_if / depends_on expressions ──────────────────────
//
// Supports a small predicate language used by CLO templates:
//
//   marriage_type === "registered"            // eq, quoted RHS
//   currently_in_custody !== no               // neq, bare-word RHS
//   field === "a" && other === "b"            // AND chain (no OR — kept simple)
//
// Anything else evaluates to `true` (fail-open) so a malformed predicate never
// hides a required field. That matches the SCRUM-43 behaviour the engine relied on.
export function evaluateConditional(
  expr: string | undefined,
  formData: Record<string, unknown>,
): boolean {
  if (!expr) return true;
  const clauses = expr.split('&&').map((c) => c.trim());
  for (const clause of clauses) {
    if (!evaluateClause(clause, formData)) return false;
  }
  return true;
}

function evaluateClause(clause: string, formData: Record<string, unknown>): boolean {
  // Match `<field> <op> <rhs>` where <rhs> is bare-word or quoted.
  const m = clause.match(/^(\w+)\s*(!==?|===?)\s*(?:"([^"]*)"|'([^']*)'|(\S+))$/);
  if (!m) return true; // fail-open on malformed clauses
  const [, field, op, dq, sq, bare] = m;
  const rhs = dq ?? sq ?? bare ?? '';
  const actual = String(formData[field] ?? '');
  const equal = actual === rhs;
  return op.startsWith('!') ? !equal : equal;
}

// Back-compat alias for the SCRUM-43 callsite name.
export const evaluateShowIf = evaluateConditional;

// SCRUM-79 — regex validation in zod. Returns null when OK, error message otherwise.
export function validatePattern(field: FormField, value: unknown): string | null {
  if (!field.validation_pattern) return null;
  if (value === undefined || value === null || value === '') return null;
  let re: RegExp;
  try {
    re = new RegExp(field.validation_pattern);
  } catch {
    return null; // malformed pattern from CLO — don't block the user, log will surface upstream
  }
  return re.test(String(value)) ? null : (field.validation_message ?? 'Invalid format');
}

// SCRUM-79 — INR rupee formatting. Returns a display string for the field.
function formatRupee(raw: string): string {
  if (raw === '' || raw === undefined || raw === null) return '';
  const num = Number(String(raw).replace(/[^0-9.]/g, ''));
  if (Number.isNaN(num)) return '';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(num);
}

// ── Field Components ────────────────────────────────────────────────────────

const inputClasses =
  'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100';

function TextField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel field={field} />
      <input
        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className={inputClasses}
      />
      {field.max_length && (
        <p className="mt-0.5 text-xs text-slate-400">
          {value.length} / {field.max_length}
        </p>
      )}
    </div>
  );
}

function TextareaField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <FieldLabel field={field} />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        rows={5}
        className={`${inputClasses} resize-y`}
      />
      <div className="mt-0.5 flex justify-between text-xs text-slate-400">
        {field.min_length && value.length < field.min_length ? (
          <span className="text-amber-500">Min {field.min_length} characters</span>
        ) : (
          <span />
        )}
        {field.max_length && (
          <span>
            {value.length} / {field.max_length}
          </span>
        )}
      </div>
    </div>
  );
}

function DropdownField({
  field,
  value,
  onChange,
  options,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
  options: FieldOption[];
}) {
  return (
    <div>
      <FieldLabel field={field} />
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClasses}>
        <option value="">Select…</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DropdownSearchField({
  field,
  value,
  onChange,
  options,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
  options: FieldOption[];
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const filtered = useMemo(
    () =>
      search.length > 0
        ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
        : options,
    [options, search],
  );

  const selectedLabel = options.find((o) => o.id === value)?.label ?? '';

  return (
    <div className="relative" ref={containerRef}>
      <FieldLabel field={field} />
      <div
        className={`${inputClasses} flex cursor-pointer items-center gap-2`}
        onClick={() => setOpen(!open)}
      >
        <Search size={14} className="flex-shrink-0 text-slate-400" />
        {open ? (
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="flex-1 bg-transparent text-sm outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={selectedLabel ? 'text-slate-800' : 'text-slate-400'}>
            {selectedLabel || field.placeholder || 'Search…'}
          </span>
        )}
        {value && (
          <X
            size={14}
            className="flex-shrink-0 text-slate-400 hover:text-slate-600"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
              setSearch('');
            }}
          />
        )}
      </div>
      {open && (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">No results</div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`w-full px-3 py-2 text-left text-sm hover:bg-amber-50 ${
                  opt.id === value ? 'bg-amber-50 font-medium text-amber-700' : 'text-slate-700'
                }`}
                onClick={() => {
                  onChange(opt.id);
                  setSearch('');
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function MultiSelectSearchField({
  field,
  value,
  onChange,
  options,
  allowFreeText = false,
  searchHandler,
  readHandler,
  maxValues,
  maxValueLength,
}: {
  field: FormField;
  value: string[];
  onChange: (v: string[]) => void;
  options: FieldOption[];
  allowFreeText?: boolean;
  /** SCRUM-85 — when provided, the dropdown is populated by debounced remote
   *  search instead of static `options`. Returns up to N matches for `query`. */
  searchHandler?: (query: string) => Promise<FieldOption[]>;
  /** T-290 — bns_mapping picker only. Returns what the server reads from each
   *  value (entries[i] for values[i]), or null if the check failed, timed out or
   *  was aborted. Shows the S1 hint and a "Read as" line under each chip. */
  readHandler?: (values: string[], signal: AbortSignal) => Promise<SectionRead[][] | null>;
  /** T-309 — bns_mapping picker only: at most this many chips (no new text at the
   *  cap; the input is just made read-only). */
  maxValues?: number;
  /** T-309 — bns_mapping picker only: never add a value longer than this. */
  maxValueLength?: number;
}) {
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [remoteResults, setRemoteResults] = useState<FieldOption[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  // T-290 (Arjun, Addendum 2): ONE read call for all chip values whenever the chip
  // list changes. entries[i] belongs to chip i. A newer call aborts the older one.
  // Every check result is tied to the exact list it was made for (`forKey`), so a
  // result never lands on a different list of chips.
  const valuesKey = JSON.stringify(value);
  const [readResult, setReadResult] = useState<SectionReadResult | null>(null);
  // T-309 — only values the server accepts are sent (Arjun's caps), so one bad
  // stored value can't fail the whole call. sendIndex[i] is chip i's index in
  // the sent list, or null if chip i can't be sent (it shows S8 on its own).
  const { sendIndex } = useMemo(
    () => pickSendableReadValues(JSON.parse(valuesKey) as string[]),
    [valuesKey],
  );

  useEffect(() => {
    if (!readHandler) return;
    const { sendable } = pickSendableReadValues(JSON.parse(valuesKey) as string[]);
    if (sendable.length === 0) return;
    // One call per chip list. The controller is aborted when the list changes or
    // the picker unmounts, which also cancels a pending retry (T-309: on failure,
    // retry the same request once after ~2 s; a success replaces S8).
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const run = (attempt: number) => {
      void readHandler(sendable, controller.signal).then((entries) => {
        if (controller.signal.aborted) return; // superseded or unmounted
        const ok = entries !== null && entries.length === sendable.length;
        setReadResult(
          ok
            ? { forKey: valuesKey, status: 'ok', entries }
            : { forKey: valuesKey, status: 'failed' },
        );
        if (!ok && attempt === 0) {
          retryTimer = setTimeout(() => {
            if (!controller.signal.aborted) run(1);
          }, SECTION_READ_RETRY_MS);
        }
      });
    };
    run(0);
    return () => {
      controller.abort();
      clearTimeout(retryTimer);
    };
  }, [valuesKey, readHandler]);

  /** S7 (undefined) until this exact chip list has been checked. A chip that
   *  can't be sent shows S8 straight away. */
  function readStateAt(index: number): SectionReadState | undefined {
    const slot = sendIndex[index];
    if (slot === null || slot === undefined) return { status: 'failed' };
    if (!readResult || readResult.forKey !== valuesKey) return undefined;
    if (readResult.status === 'failed') return { status: 'failed' };
    return { status: 'ok', sections: readResult.entries[slot] ?? [] };
  }

  // T-309 — caps (bns_mapping only; undefined elsewhere means no cap).
  const atCap = maxValues !== undefined && value.length >= maxValues;
  function canAdd(v: string): boolean {
    if (atCap) return false;
    if (maxValueLength !== undefined && v.length > maxValueLength) return false;
    return !value.includes(v);
  }

  // SCRUM-85: debounced typeahead for fields with a `searchHandler`. Tracks the
  // latest request to discard stale ones (advocate types fast).
  useEffect(() => {
    if (!searchHandler) return;
    const term = search.trim();
    if (term.length === 0) {
      setRemoteResults([]);
      return;
    }
    let cancelled = false;
    setRemoteLoading(true);
    const handle = setTimeout(async () => {
      try {
        const results = await searchHandler(term);
        if (!cancelled) setRemoteResults(results);
      } finally {
        if (!cancelled) setRemoteLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [search, searchHandler]);

  const filtered = useMemo(() => {
    if (searchHandler) {
      // Remote-search mode: dropdown shows whatever the handler returned, minus
      // anything the user has already picked.
      // T-309: also drop any match too long to add (bns_mapping cap).
      return remoteResults.filter(
        (o) =>
          !value.includes(o.id) && (maxValueLength === undefined || o.id.length <= maxValueLength),
      );
    }
    return search.length > 0
      ? options.filter(
          (o) => o.label.toLowerCase().includes(search.toLowerCase()) && !value.includes(o.id),
        )
      : options.filter((o) => !value.includes(o.id));
  }, [searchHandler, options, search, value, remoteResults, maxValueLength]);

  const selectedItems: FieldOption[] = value.map((id) => {
    const found = options.find((o) => o.id === id);
    return found ?? { id, label: id };
  });

  function addFreeText() {
    const trimmed = search.trim();
    if (trimmed && canAdd(trimmed)) {
      onChange([...value, trimmed]);
      setSearch('');
    }
  }

  return (
    <div>
      <FieldLabel field={field} />
      {allowFreeText && !readHandler && (
        <p className="mt-0.5 text-xs text-slate-400">Type a section and press Enter to add</p>
      )}
      {/* Selected items as tags */}
      {selectedItems.length > 0 && (
        <div className="mt-1 space-y-2 sm:space-y-1">
          {selectedItems.map((item, index) => (
            <div key={item.id}>
              <div className="flex min-w-0 items-center gap-2 sm:gap-1">
                <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 [overflow-wrap:anywhere]">
                  {item.label}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onChange(value.filter((v) => v !== item.id));
                    searchInputRef.current?.focus();
                  }}
                  aria-label={`Remove ${item.label}`}
                  className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 sm:h-6 sm:w-6 sm:rounded-full sm:border-0"
                >
                  <X size={16} className="sm:h-3 sm:w-3" aria-hidden="true" />
                </button>
              </div>
              {readHandler && (
                <div aria-live="polite">
                  <SectionReadLines state={readStateAt(index)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Search + dropdown */}
      <div className="relative mt-2 sm:mt-1">
        <div className={`${inputClasses} flex items-center gap-2`}>
          <Search size={14} className="flex-shrink-0 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={maxValueLength}
            // T-309: at the chip cap the input stops taking text. readOnly, not
            // disabled, so the remove button can still return focus here.
            readOnly={atCap}
            aria-disabled={atCap || undefined}
            onKeyDown={(e) => {
              if (allowFreeText && (e.key === 'Enter' || e.key === ',')) {
                e.preventDefault();
                addFreeText();
              }
            }}
            placeholder={field.placeholder || 'Search and select…'}
            className={`flex-1 bg-transparent text-sm outline-none ${
              atCap ? 'cursor-not-allowed opacity-40' : ''
            }`}
          />
          {allowFreeText && !atCap && search.trim() && (
            <button
              type="button"
              onClick={addFreeText}
              className="flex-shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-200"
            >
              Add
            </button>
          )}
        </div>
        {!atCap && search.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {remoteLoading && filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>
            )}
            {!remoteLoading && filtered.length === 0 && searchHandler && (
              <div className="px-3 py-2 text-xs text-slate-400">No matches</div>
            )}
            {filtered.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-amber-50"
                onClick={() => {
                  if (!canAdd(opt.id)) return;
                  onChange([...value, opt.id]);
                  setSearch('');
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {readHandler && (
        <p className="mt-1 text-xs text-slate-500">
          A number without the Act is read as a BNS section. For IPC, type the Act, for example IPC
          302.
        </p>
      )}
    </div>
  );
}

/** T-290 — S8, signed by Ajay. One constant so every S8 reads the same. */
const SECTION_READ_FAILED_LINE =
  'Could not check this section. Check the Act and the number before you generate.';

/** T-290 — the "Read as" lines for one entered value (S2 to S8, signed by Ajay).
 *  Never renders nothing: a missing line would read as "nothing wrong". */
function SectionReadLines({ state }: { state: SectionReadState | undefined }) {
  if (state === undefined) {
    return <p className="mt-0.5 break-words text-xs text-slate-600">Checking this section</p>;
  }
  if (state.status === 'failed') {
    return <p className="mt-0.5 text-xs text-red-500">{SECTION_READ_FAILED_LINE}</p>;
  }
  const { sections } = state;
  if (sections.length === 0) {
    return <p className="mt-0.5 text-xs text-red-500">Not read as a section</p>;
  }
  return (
    <>
      {sections.map((s, i) => {
        const key = `${i}-${s.code ?? ''}-${s.number}`;
        if (s.code === 'OTHER') {
          return (
            <p key={key} className="mt-0.5 break-words text-xs text-slate-600">
              Read as a section of another Act (not checked by Lawie)
            </p>
          );
        }
        // T-309: the bns_mapping reader always gives a code, but never invent one
        // and never show no line: a null or unknown code shows S8 for this item.
        if (!isNamedReadCode(s.code)) {
          return (
            <p key={key} className="mt-0.5 text-xs text-red-500">
              {SECTION_READ_FAILED_LINE}
            </p>
          );
        }
        return (
          <p key={key} className="mt-0.5 break-words text-xs text-slate-600">
            Read as{' '}
            <span className="font-medium">
              {displayReadAsCode(s.code)} {s.number}
            </span>
            {s.code === 'BNS' && s.title ? `: ${s.title}` : null}
          </p>
        );
      })}
    </>
  );
}

function CheckboxGroupField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const options = field.options ?? [];

  return (
    <div>
      <FieldLabel field={field} />
      {field.min_select && (
        <p className="mt-0.5 text-xs text-slate-400">Select at least {field.min_select}</p>
      )}
      <div className="mt-2 space-y-2">
        {options.map((opt) => (
          <label
            key={opt.id}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-100 p-2.5 transition-colors hover:bg-slate-50"
          >
            <input
              type="checkbox"
              checked={value.includes(opt.id)}
              onChange={(e) => {
                if (e.target.checked) {
                  onChange([...value, opt.id]);
                } else {
                  onChange(value.filter((v) => v !== opt.id));
                }
              }}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
            />
            <span className="text-sm text-slate-700">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function CurrencyField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
}) {
  // Maintain raw digits internally; show the INR-formatted preview below the input.
  const display = formatRupee(value);
  return (
    <div>
      <FieldLabel field={field} />
      <div className={`${inputClasses} flex items-center gap-2 px-2 py-1.5`}>
        <IndianRupee size={14} className="flex-shrink-0 text-slate-400" />
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder={field.placeholder ?? '0'}
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      {display && <p className="mt-0.5 text-xs text-slate-500">{display}</p>}
    </div>
  );
}

function FileField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: UploadedFile[];
  onChange: (v: UploadedFile[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const chooseButtonRef = useRef<HTMLButtonElement>(null);
  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list) return;
    const picked: UploadedFile[] = Array.from(list).map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
    }));
    onChange(field.multiple ? [...value, ...picked] : picked);
    // Reset so the same file can be re-selected after removal.
    if (inputRef.current) inputRef.current.value = '';
  }
  return (
    <div>
      <FieldLabel field={field} />
      <button
        ref={chooseButtonRef}
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`${inputClasses} flex items-center gap-2 text-left text-slate-600 hover:bg-slate-50`}
      >
        <Paperclip size={14} className="flex-shrink-0 text-slate-400" />
        <span className="flex-1 text-sm">
          {value.length > 0
            ? field.multiple
              ? `${value.length} file(s) selected`
              : value[0].name
            : (field.placeholder ?? (field.multiple ? 'Choose files…' : 'Choose a file…'))}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple={field.multiple ?? false}
        accept={field.accept}
        onChange={handlePick}
      />
      {value.length > 0 && (
        <ul className="mt-2 space-y-2 sm:mt-1 sm:space-y-1">
          {value.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between gap-2 rounded border border-slate-100 py-0 pl-2 pr-0 text-xs text-slate-600 sm:pr-1"
            >
              <span className="min-w-0 truncate">
                {f.name}
                <span className="ml-2 text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onChange(value.filter((_, j) => j !== i));
                  chooseButtonRef.current?.focus();
                }}
                aria-label={`Remove ${f.name}`}
                className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 sm:h-6 sm:w-6 sm:border-0"
              >
                <X size={16} className="sm:h-3 sm:w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FieldFooter({ field, errorMessage }: { field: FormField; errorMessage?: string | null }) {
  if (!errorMessage && !field.help) return null;
  return (
    <div className="mt-0.5 space-y-0.5 text-xs">
      {errorMessage && <p className="text-red-500">{errorMessage}</p>}
      {field.help && !errorMessage && <p className="text-slate-400">{field.help}</p>}
    </div>
  );
}

function FieldLabel({ field }: { field: FormField }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {field.label}
      {field.required && <span className="ml-0.5 text-red-400">*</span>}
    </label>
  );
}

// ── Step Indicator ──────────────────────────────────────────────────────────

function StepIndicator({ steps, currentStep }: { steps: FormStep[]; currentStep: number }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i < currentStep
                ? 'w-4 bg-amber-500'
                : i === currentStep
                  ? 'w-6 bg-amber-400'
                  : 'w-4 bg-slate-200'
            }`}
          />
        ))}
        <span className="ml-2 text-xs text-slate-400">
          Step {currentStep + 1} of {steps.length}
        </span>
      </div>
      <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
        {steps.map((s, i) => (
          <span
            key={s.step}
            className={`flex-shrink-0 text-xs ${
              i === currentStep
                ? 'font-semibold text-amber-600'
                : i < currentStep
                  ? 'text-slate-500'
                  : 'text-slate-300'
            }`}
          >
            {i > 0 && <ChevronRight size={10} className="mr-0.5 inline" />}
            {s.title}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Courts API hook ─────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * T-411: an optional template scope. For consumer_complaint the lists are filtered by the
 * Commission level (part 1 server API); with no scope everything behaves as before.
 * T-425: for the six bail packs the three lists are asked for with `template=<id>`.
 */
export interface CourtsScope {
  templateId?: string;
  level?: ConsumerLevel | null;
  /** T-425 (AC3): the form field holding the court, so a saved court can be kept. */
  courtFieldId?: string;
}

interface SavedCourt {
  id: string;
  name: string;
  state: string;
}

export function useCourtsData(formData: Record<string, unknown>, scope?: CourtsScope) {
  const [states, setStates] = useState<FieldOption[]>([]);
  const [statesLoaded, setStatesLoaded] = useState(false);
  const [courtTypes, setCourtTypes] = useState<FieldOption[]>([]);
  const [typesLoaded, setTypesLoaded] = useState(false);
  const [courts, setCourts] = useState<FieldOption[]>([]);
  const [courtsLoaded, setCourtsLoaded] = useState(false);
  const [saved, setSaved] = useState<SavedCourt | null>(null);
  // T-425: saved court ids whose by-id lookup failed; not asked again.
  const lookupFailed = useRef<Set<string>>(new Set());

  const stateId = String(formData.state ?? '');
  const courtType = String(formData.court_type ?? '');
  const courtId = scope?.courtFieldId ? String(formData[scope.courtFieldId] ?? '') : '';
  const consumer = scope?.templateId === CONSUMER_TEMPLATE_ID;
  const bail = isBailTemplate(scope?.templateId);
  const level = consumer ? (scope?.level ?? null) : null;
  const query =
    consumer && level
      ? `template=${CONSUMER_TEMPLATE_ID}&level=${level}`
      : bail
        ? `template=${encodeURIComponent(scope?.templateId as string)}`
        : '';

  // Fetch states once on mount (once per level in consumer mode)
  const statesFetched = useRef<string | null>(null);
  useEffect(() => {
    if (consumer && (!level || level === 'national')) {
      statesFetched.current = null;
      setStates([]);
      setStatesLoaded(false);
      return;
    }
    if (statesFetched.current === query) return;
    statesFetched.current = query;
    let off = false;
    setStatesLoaded(false);
    fetch(`${API_URL}/api/courts/states${query ? `?${query}` : ''}`)
      .then((r) => r.json())
      .then((data) => {
        if (off) return;
        if (data.states) {
          setStates(
            data.states.map((s: { id: string; name: string }) => ({ id: s.id, label: s.name })),
          );
          setStatesLoaded(true);
        }
      })
      .catch(() => {});
    return () => {
      // A stale response (the level changed, or unmount) is dropped; forget the key so
      // the next run fetches again rather than skipping.
      off = true;
      statesFetched.current = null;
    };
  }, [consumer, level, query]);

  // Fetch court types when state changes
  useEffect(() => {
    if (consumer) {
      // The level replaces the court type in consumer mode.
      setCourtTypes([]);
      setTypesLoaded(false);
      return;
    }
    if (!stateId) {
      setCourtTypes([]);
      setTypesLoaded(false);
      setCourts([]);
      return;
    }
    const typesPath = `${API_URL}/api/courts/types?state=${encodeURIComponent(stateId)}`;
    let off = false;
    setTypesLoaded(false);
    fetch(query ? `${typesPath}&${query}` : typesPath)
      .then((r) => r.json())
      .then((data) => {
        if (off) return;
        if (data.types) {
          setCourtTypes(
            data.types.map((t: { id: string; label: string }) => ({ id: t.id, label: t.label })),
          );
          setTypesLoaded(true);
        }
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [stateId, consumer, query]);

  // Fetch courts when state + court_type change
  useEffect(() => {
    let path: string;
    if (consumer) {
      if (!level || (level !== 'national' && !stateId)) {
        setCourts([]);
        setCourtsLoaded(false);
        return;
      }
      path =
        level === 'national'
          ? `${API_URL}/api/courts?${query}`
          : `${API_URL}/api/courts?${query}&state=${encodeURIComponent(stateId)}`;
    } else {
      if (!stateId || !courtType) {
        setCourts([]);
        setCourtsLoaded(false);
        return;
      }
      path = `${API_URL}/api/courts?state=${encodeURIComponent(stateId)}&type=${encodeURIComponent(courtType)}`;
      if (query) path = `${path}&${query}`;
    }
    let off = false;
    setCourtsLoaded(false);
    fetch(path)
      .then((r) => r.json())
      .then((data) => {
        if (off) return;
        if (data.courts) {
          setCourts(
            data.courts.map((c: { courtId: string; name: string }) => ({
              id: c.courtId,
              // T-411: signed UI label for NCDRC; the record's name still prints.
              label: consumer && c.courtId === NCDRC_COURT_ID ? NCDRC_OPTION_LABEL : c.name,
            })),
          );
          setCourtsLoaded(true);
        }
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [stateId, courtType, consumer, level, query]);

  // T-425 (AC3): a bail form holding a court this pack no longer offers keeps it. Ask for
  // that court by id only to name it in the list; the value itself is never changed.
  const courtNotOffered =
    bail && courtId !== '' && courtsLoaded && !courts.some((c) => c.id === courtId);
  useEffect(() => {
    if (!courtNotOffered || saved?.id === courtId) return;
    const id = courtId;
    if (lookupFailed.current.has(id)) return;
    let off = false;
    fetch(`${API_URL}/api/courts/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('court');
        const data = (await res.json()) as { court?: { name?: string; state?: string } };
        if (!data.court?.name) throw new Error('court');
        if (!off) setSaved({ id, name: data.court.name, state: data.court.state ?? '' });
      })
      // Only the label is lost: the saved id still shows. A failure is about the id, so it
      // is remembered even if this run was superseded.
      .catch(() => {
        lookupFailed.current.add(id);
      });
    return () => {
      off = true;
    };
  }, [courtNotOffered, courtId, saved?.id]);

  const savedName = saved && saved.id === courtId ? saved : null;
  const keptStateLabel =
    bail && stateId && statesLoaded && !states.some((s) => s.id === stateId)
      ? `${savedName?.state || stateId}${NOT_OFFERED_SUFFIX}`
      : null;
  const keptTypeLabel =
    bail && courtType && typesLoaded && !courtTypes.some((t) => t.id === courtType)
      ? `${SAVED_TYPE_NAMES[courtType] ?? courtType}${NOT_OFFERED_SUFFIX}`
      : null;
  const keptCourtLabel = courtNotOffered
    ? `${savedName?.name ?? courtId}${NOT_OFFERED_SUFFIX}`
    : null;

  const shownStates = useMemo(
    () => (keptStateLabel ? [{ id: stateId, label: keptStateLabel }, ...states] : states),
    [keptStateLabel, stateId, states],
  );
  const shownTypes = useMemo(
    () => (keptTypeLabel ? [{ id: courtType, label: keptTypeLabel }, ...courtTypes] : courtTypes),
    [keptTypeLabel, courtType, courtTypes],
  );
  const shownCourts = useMemo(
    () => (keptCourtLabel ? [{ id: courtId, label: keptCourtLabel }, ...courts] : courts),
    [keptCourtLabel, courtId, courts],
  );

  return { states: shownStates, courtTypes: shownTypes, courts: shownCourts, courtsLoaded };
}

export function resolveOptions(
  field: FormField,
  formData: Record<string, unknown>,
  templateConfig: TemplateConfig,
  courtsData: { states: FieldOption[]; courtTypes: FieldOption[]; courts: FieldOption[] },
): FieldOption[] {
  // Static options defined in the field
  if (field.options) return field.options;

  // options_from template-level array (e.g., supported_languages)
  if (field.options_from === 'supported_languages') {
    return templateConfig.supported_languages.map((lang) => ({
      id: lang,
      label: lang === 'en' ? 'English' : lang === 'hi' ? 'Hindi' : 'Bilingual (English + Hindi)',
    }));
  }

  // Source-based (courts API)
  if (field.source === 'courts_db.states') return courtsData.states;
  if (field.source === 'courts_db.court_types') return courtsData.courtTypes;
  if (field.source === 'courts_db.courts') return courtsData.courts;

  // bns_mapping: the dropdown is populated by remote typeahead (SCRUM-85);
  // the MultiSelectSearchField below uses a searchHandler instead of these
  // static options. Returning [] here keeps the local filter inert.
  if (field.source === 'bns_mapping') return [];

  return [];
}

// SCRUM-85 — typeahead handler for in-form section pickers (bail templates etc).
// Fetches /api/sections/search and shapes results into FieldOption[] with the
// new section number as the chosen value and a "<section> · <title>" label.
export async function fetchBnsMappingResults(query: string): Promise<FieldOption[]> {
  try {
    const res = await fetch(
      `${API_URL}/api/sections/search?q=${encodeURIComponent(query)}&code=BNS&limit=10`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results: Array<{ section: string; title: string; code: string }>;
    };
    return (data.results ?? []).map((r) => ({
      id: r.section,
      label: `${r.section} BNS · ${r.title}`,
    }));
  } catch {
    return [];
  }
}

// T-290 — what the server reads from bns_mapping picker values (POST
// /sections/read, Arjun). `title` is set only for BNS, from the signed T-277 table.
export interface SectionRead {
  code: 'BNS' | 'BNSS' | 'BSA' | 'IPC' | 'CRPC' | 'IEA' | 'OTHER' | null;
  number: string;
  title: string | null;
}

// T-290 (Ajay, on ba4b11c) — display only: the code as practitioners write it in
// the "Read as" line ("Read as CrPC 41"). Stored values and the server response
// keep the reader's codes unchanged.
type NamedReadCode = Exclude<SectionRead['code'], 'OTHER' | null>;
const READ_AS_DISPLAY_CODE: Readonly<Record<NamedReadCode, string>> = {
  IPC: 'IPC',
  CRPC: 'CrPC',
  IEA: 'IEA',
  BNS: 'BNS',
  BNSS: 'BNSS',
  BSA: 'BSA',
};

/** T-309 — true only for a code the picker can name in a "Read as" line. */
export function isNamedReadCode(code: unknown): code is NamedReadCode {
  return (
    typeof code === 'string' && Object.prototype.hasOwnProperty.call(READ_AS_DISPLAY_CODE, code)
  );
}

/** T-290 — the display form of a named reader code, e.g. CRPC → "CrPC". */
export function displayReadAsCode(code: NamedReadCode): string {
  return READ_AS_DISPLAY_CODE[code];
}

/** T-290 — the plain text of the S2/S3/S4 line for one named-code section, e.g.
 *  "Read as CrPC 41" or "Read as BNS 303: Theft". Null for OTHER or a bare
 *  number (those are not S2 to S4). Pure, so it can be unit-tested. */
export function formatReadAsLine(s: SectionRead): string | null {
  if (!isNamedReadCode(s.code)) return null;
  const title = s.code === 'BNS' && s.title ? `: ${s.title}` : '';
  return `Read as ${displayReadAsCode(s.code)} ${s.number}${title}`;
}

type SectionReadState = { status: 'ok'; sections: SectionRead[] } | { status: 'failed' };

type SectionReadResult =
  | { forKey: string; status: 'ok'; entries: SectionRead[][] }
  | { forKey: string; status: 'failed' };

const SECTION_READ_TIMEOUT_MS = 5000;
// T-309 — one automatic retry of a failed read, after about 2 s.
const SECTION_READ_RETRY_MS = 2000;

// T-309 — Arjun's /sections/read caps for `values` (more is a 400 for the whole
// call). The bns_mapping picker enforces the same caps on input.
export const SECTION_READ_MAX_VALUES = 30;
export const SECTION_READ_MAX_VALUE_LENGTH = 100;

/** T-309 — the values that can be sent to /sections/read: strings of at most
 *  100 characters, the first 30 of them. sendIndex[i] is values[i]'s index in
 *  `sendable`, or null if values[i] is not sent (that chip shows S8 on its own).
 *  Pure, so it can be unit-tested. */
export function pickSendableReadValues(values: readonly unknown[]): {
  sendable: string[];
  sendIndex: Array<number | null>;
} {
  const sendable: string[] = [];
  const sendIndex = values.map((v) => {
    if (
      typeof v !== 'string' ||
      v.length > SECTION_READ_MAX_VALUE_LENGTH ||
      sendable.length >= SECTION_READ_MAX_VALUES
    ) {
      return null;
    }
    sendable.push(v);
    return sendable.length - 1;
  });
  return { sendable, sendIndex };
}

// T-290 — POSTs {values} to /api/sections/read (POST so FIR numbers stay out of
// URLs) and returns entries[i].read for values[i]. Returns null on network error,
// non-2xx, bad shape, the ~5 s timeout, or an abort from the caller, so the picker
// shows S8 rather than a guess.
export async function fetchSectionRead(
  values: string[],
  signal: AbortSignal,
): Promise<SectionRead[][] | null> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) return null;
  signal.addEventListener('abort', abort);
  const timer = setTimeout(abort, SECTION_READ_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}/api/sections/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { entries?: Array<{ read?: SectionRead[] }> };
    if (!Array.isArray(data.entries)) return null;
    const entries = data.entries.map((e) => e?.read);
    return entries.every(Array.isArray) ? (entries as SectionRead[][]) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

// ── One field's input, by type (shared with the describe-first follow-up, T-103) ──

export function FieldInput({
  field,
  value,
  options,
  onChange,
}: {
  field: FormField;
  value: unknown;
  options: FieldOption[];
  onChange: (v: unknown) => void;
}) {
  return (
    <>
      {(field.type === 'text' || field.type === 'date' || field.type === 'number') && (
        <TextField field={field} value={String(value ?? '')} onChange={(v) => onChange(v)} />
      )}

      {field.type === 'textarea' && (
        <TextareaField field={field} value={String(value ?? '')} onChange={(v) => onChange(v)} />
      )}

      {field.type === 'dropdown' && (
        <DropdownField
          field={field}
          value={String(value ?? '')}
          onChange={(v) => onChange(v)}
          options={options}
        />
      )}

      {field.type === 'dropdown_search' && (
        <DropdownSearchField
          field={field}
          value={String(value ?? '')}
          onChange={(v) => onChange(v)}
          options={options}
        />
      )}

      {field.type === 'multi_select_search' && (
        <MultiSelectSearchField
          field={field}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={(v) => onChange(v)}
          options={options}
          allowFreeText={field.source === 'bns_mapping'}
          searchHandler={field.source === 'bns_mapping' ? fetchBnsMappingResults : undefined}
          readHandler={field.source === 'bns_mapping' ? fetchSectionRead : undefined}
          maxValues={field.source === 'bns_mapping' ? SECTION_READ_MAX_VALUES : undefined}
          maxValueLength={
            field.source === 'bns_mapping' ? SECTION_READ_MAX_VALUE_LENGTH : undefined
          }
        />
      )}

      {field.type === 'checkbox_group' && (
        <CheckboxGroupField
          field={field}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={(v) => onChange(v)}
        />
      )}

      {field.type === 'currency' && (
        <CurrencyField field={field} value={String(value ?? '')} onChange={(v) => onChange(v)} />
      )}

      {field.type === 'file' && (
        <FileField
          field={field}
          value={Array.isArray(value) ? (value as UploadedFile[]) : []}
          onChange={(v) => onChange(v)}
        />
      )}
    </>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function DynamicFormRenderer({
  config,
  onSubmit,
  onCancel,
  submitting = false,
  submitDescribedBy,
  inkCost,
  inkCostLoading = false,
  onInkCostRetry,
  templateId,
  initialValues,
  initialStep,
  initialLevel,
  onStateChange,
}: DynamicFormRendererProps) {
  const steps = config.form_schema.steps;
  // T-432: seeded on mount only; with no seed this starts at step 1 as before.
  const [step, setStep] = useState(() => {
    if (typeof initialStep !== 'number' || !Number.isInteger(initialStep)) return 0;
    return Math.min(Math.max(initialStep, 0), steps.length - 1);
  });
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    // Initialize with defaults from the schema. Array-shaped fields (checkbox group,
    // multi-select, file) get `[]`, scalar fields get '' unless the config supplies a default.
    const initial: Record<string, unknown> = {};
    for (const s of steps) {
      for (const f of s.fields) {
        if (f.default !== undefined) {
          initial[f.field_id] = f.default;
        } else if (
          f.type === 'checkbox_group' ||
          f.type === 'multi_select_search' ||
          f.type === 'file'
        ) {
          initial[f.field_id] = [];
        } else {
          initial[f.field_id] = '';
        }
      }
    }
    // T-432: a returning advocate's answers win over the defaults.
    return initialValues ? { ...initial, ...initialValues } : initial;
  });

  // T-411: a consumer complaint picks the Commission level first.
  const consumer = config.template_id === CONSUMER_TEMPLATE_ID;
  const [level, setLevel] = useState<ConsumerLevel | null>(() =>
    consumer ? (initialLevel ?? null) : null,
  );
  const [live, setLive] = useState('');
  const focusNext = useRef<string | null>(null);
  const courtFieldIds = useMemo(() => {
    const ids: {
      state?: string;
      type?: string;
      court?: string;
      stateField?: FormField;
      courtField?: FormField;
    } = {};
    for (const s of steps) {
      for (const f of s.fields) {
        if (f.source === 'courts_db.states') {
          ids.state = f.field_id;
          ids.stateField = f;
        }
        if (f.source === 'courts_db.court_types') ids.type = f.field_id;
        if (f.source === 'courts_db.courts') {
          ids.court = f.field_id;
          ids.courtField = f;
        }
      }
    }
    return ids;
  }, [steps]);

  // T-432: hand every change to the caller, which holds it in memory so the
  // form can be shown again as it was. The ref keeps a new callback identity
  // from re-running this.
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  useEffect(() => {
    onStateChangeRef.current?.(formData, step, level);
  }, [formData, step, level]);

  useEffect(() => {
    if (!focusNext.current) return;
    const el = document.getElementById(focusNext.current);
    focusNext.current = null;
    el?.focus();
  });

  // Courts data from API — cascading dropdowns (SCRUM-50)
  // T-425: the bail packs ask for their lists with template=<id> and keep a saved court.
  const bail = isBailTemplate(config.template_id);
  const courtsData = useCourtsData(
    formData,
    consumer
      ? { templateId: config.template_id, level }
      : bail
        ? { templateId: config.template_id, courtFieldId: courtFieldIds.court }
        : undefined,
  );

  const onLevel = (next: ConsumerLevel, how: LevelChangeHow) => {
    if (next === level) return;
    const { state: sId, type: tId, court: cId } = courtFieldIds;
    const hadChoice =
      level === 'national'
        ? Boolean(cId && formData[cId])
        : Boolean((sId && formData[sId]) || (cId && formData[cId]));
    setLevel(next);
    // Changing the level clears the state and court below it. The court type (and the
    // state, for NCDRC) are set from the level, so required checks still pass.
    setFormData((prev) => {
      const out = { ...prev };
      if (sId) out[sId] = next === 'national' ? NCDRC_STATE_ID : '';
      if (tId) out[tId] = next === 'national' ? NCDRC_COURT_TYPE : CONSUMER_COURT_TYPE;
      if (cId) out[cId] = '';
      return out;
    });
    const shown = next === 'national' ? LIVE_NATIONAL_SHOWN : LIVE_STATE_SHOWN;
    setLive(hadChoice ? `${LIVE_CLEARED} ${shown}` : shown);
    // Arrow keys keep focus on the chip (radio pattern); click, Space or Enter moves it on.
    if (how === 'activate') {
      focusNext.current = next === 'national' ? 'dfr-consumer-court' : 'dfr-consumer-state';
    }
  };

  // Build a map of field_id → cascades_to for cascade resets
  const cascadeMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const s of steps) {
      for (const f of s.fields) {
        if (f.cascades_to) {
          map[f.field_id] = f.cascades_to;
        }
      }
    }
    return map;
  }, [steps]);

  const setField = useCallback(
    (fieldId: string, value: unknown) => {
      setFormData((prev) => {
        const next = { ...prev, [fieldId]: value };
        // Cascade reset: clear downstream fields when a parent changes
        const targets = cascadeMap[fieldId];
        if (targets) {
          for (const t of targets) {
            next[t] = Array.isArray(prev[t]) ? [] : '';
          }
        }
        return next;
      });
    },
    [cascadeMap],
  );

  // Get visible fields for the current step (respecting show_if + depends_on).
  const currentStep = steps[step];
  const visibleFields = useMemo(
    () =>
      currentStep.fields.filter((f) => evaluateConditional(f.show_if ?? f.depends_on, formData)),
    [currentStep, formData],
  );

  // Surface validation-pattern errors per field so we can both gate `canAdvance`
  // and render the error message under the input.
  const fieldErrors = useMemo(() => {
    const errors: Record<string, string | null> = {};
    for (const field of visibleFields) {
      errors[field.field_id] = validatePattern(field, formData[field.field_id]);
    }
    return errors;
  }, [visibleFields, formData]);

  // Can we advance to the next step?
  const canAdvance = useMemo(() => {
    for (const field of visibleFields) {
      if (fieldErrors[field.field_id]) return false;
      if (!field.required) continue;
      const value = formData[field.field_id];
      if (value === undefined || value === null || value === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      if (
        field.type === 'checkbox_group' &&
        field.min_select &&
        Array.isArray(value) &&
        value.length < field.min_select
      )
        return false;
      if (
        (field.type === 'textarea' || field.type === 'text') &&
        field.min_length &&
        String(value).length < field.min_length
      )
        return false;
    }
    return true;
  }, [visibleFields, formData, fieldErrors]);

  const isLastStep = step === steps.length - 1;
  // T-388 (Arjun): "Generate document" charges, so it waits for a known cost.
  // "Next" charges nothing and is not held.
  const costBlocked = isLastStep && inkCostState(inkCost, inkCostLoading) !== 'known';
  const submitDescribedByIds = isLastStep
    ? [submitDescribedBy, SUBMIT_INK_COST_ID].filter(Boolean).join(' ')
    : undefined;

  function handleNext() {
    if (isLastStep) {
      if (costBlocked) return;
      onSubmit(formData);
    } else {
      setStep((s) => s + 1);
    }
  }

  function renderConsumerCourt() {
    const { state: sId, type: tId, court: cId, stateField, courtField } = courtFieldIds;
    const national = level === 'national';
    const stateValue = sId ? String(formData[sId] ?? '') : '';
    const courtValue = cId ? String(formData[cId] ?? '') : '';
    const courtDisabled = !level || (!national && !stateValue);
    const chosen = courtsData.courts.find((c) => c.id === courtValue);
    const selectClass = `${inputClasses} min-h-[44px] disabled:bg-slate-100`;
    return (
      <div key="consumer-court" className="col-span-full">
        <ConsumerLevelGroup id="dfr-consumer-level" value={level} onChange={onLevel} />
        <p aria-live="polite" role="status" className="sr-only">
          {live}
        </p>
        {level && (
          <div className={`mt-4 grid grid-cols-1 gap-4 ${national ? '' : 'sm:grid-cols-2'}`}>
            {!national && sId && (
              <div>
                <label
                  htmlFor="dfr-consumer-state"
                  className="block text-xs font-medium text-slate-600"
                >
                  State
                  {stateField?.required && <span className="ml-0.5 text-red-400">*</span>}
                </label>
                <select
                  id="dfr-consumer-state"
                  value={stateValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormData((prev) => {
                      const out = { ...prev, [sId]: v };
                      if (tId) out[tId] = CONSUMER_COURT_TYPE;
                      if (cId) out[cId] = '';
                      return out;
                    });
                    if (v) setLive(LIVE_COURT_SHOWN);
                  }}
                  className={selectClass}
                >
                  <option value="">Choose</option>
                  {courtsData.states.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {stateField && (
                  <FieldFooter field={stateField} errorMessage={fieldErrors[stateField.field_id]} />
                )}
              </div>
            )}
            {cId && (
              <div>
                <label
                  htmlFor="dfr-consumer-court"
                  className="block text-xs font-medium text-slate-600"
                >
                  {CONSUMER_COURT_LABEL}
                  {courtField?.required && <span className="ml-0.5 text-red-400">*</span>}
                </label>
                <select
                  id="dfr-consumer-court"
                  value={courtValue}
                  disabled={courtDisabled}
                  onChange={(e) => setField(cId, e.target.value)}
                  className={selectClass}
                >
                  <option value="">Choose</option>
                  {courtsData.courts.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {chosen && <p className="mt-1 text-xs text-slate-600">{chosen.label}</p>}
                {courtField && (
                  <FieldFooter field={courtField} errorMessage={fieldErrors[courtField.field_id]} />
                )}
              </div>
            )}
          </div>
        )}
        {!national && stateValue && courtsData.courtsLoaded && courtsData.courts.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">{CONSUMER_NO_MATCH}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">{config.display_name}</h1>
        <div className="mt-3">
          <StepIndicator steps={steps} currentStep={step} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">{currentStep.title}</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {visibleFields.map((field, fieldIndex) => {
            if (consumer && field.source?.startsWith('courts_db.')) {
              // T-411: one consumer block replaces the state / court type / court fields.
              const first = visibleFields.findIndex((f) => f.source?.startsWith('courts_db.'));
              if (fieldIndex !== first) return null;
              return renderConsumerCourt();
            }
            const options = resolveOptions(field, formData, config, courtsData);
            const value = formData[field.field_id];

            // For fields spanning full width
            const isFullWidth =
              field.type === 'textarea' ||
              field.type === 'checkbox_group' ||
              field.type === 'multi_select_search' ||
              field.type === 'file';

            return (
              <div key={field.field_id} className={isFullWidth ? 'col-span-full' : ''}>
                <FieldInput
                  field={field}
                  value={value}
                  options={options}
                  onChange={(v) => setField(field.field_id, v)}
                />

                <FieldFooter field={field} errorMessage={fieldErrors[field.field_id]} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation (T-388: top-aligned, so the Ink cost line under the button moves nothing).
          T-432: stacked at phone width (Generate and its cost line above Cancel/Back, with a
          real gap); a row from sm up, as before. */}
      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={() => (step === 0 ? onCancel() : setStep((s) => s - 1))}
          className="flex items-center gap-1.5 self-start rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <ChevronLeft size={14} />
          {step === 0 ? 'Cancel' : 'Back'}
        </button>

        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <button
            type="button"
            disabled={!canAdvance || submitting || costBlocked}
            aria-disabled={costBlocked ? 'true' : undefined}
            onClick={handleNext}
            aria-describedby={submitDescribedByIds}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-5 py-2 text-xs font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              isLastStep ? 'bg-slate-900 hover:bg-slate-700' : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            {submitting ? (
              'Generating…'
            ) : isLastStep ? (
              'Generate document'
            ) : (
              <>
                Next
                <ChevronRight size={14} />
              </>
            )}
          </button>
          {isLastStep && (
            <InkCostLine
              id={SUBMIT_INK_COST_ID}
              cost={inkCost}
              loading={inkCostLoading}
              onRetry={onInkCostRetry}
              kind={templateId ?? config.template_id ?? 'unknown'}
              action="submit"
            />
          )}
        </div>
      </div>
    </div>
  );
}
