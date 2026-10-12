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
}

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

  useEffect(() => {
    if (!readHandler) return;
    const values = JSON.parse(valuesKey) as string[];
    if (values.length === 0) return;
    const controller = new AbortController();
    void readHandler(values, controller.signal).then((entries) => {
      if (controller.signal.aborted) return; // superseded or unmounted
      setReadResult(
        entries !== null && entries.length === values.length
          ? { forKey: valuesKey, status: 'ok', entries }
          : { forKey: valuesKey, status: 'failed' },
      );
    });
    return () => controller.abort();
  }, [valuesKey, readHandler]);

  /** S7 (undefined) until this exact chip list has been checked. */
  function readStateAt(index: number): SectionReadState | undefined {
    if (!readResult || readResult.forKey !== valuesKey) return undefined;
    if (readResult.status === 'failed') return { status: 'failed' };
    return { status: 'ok', sections: readResult.entries[index] ?? [] };
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
      return remoteResults.filter((o) => !value.includes(o.id));
    }
    return search.length > 0
      ? options.filter(
          (o) => o.label.toLowerCase().includes(search.toLowerCase()) && !value.includes(o.id),
        )
      : options.filter((o) => !value.includes(o.id));
  }, [searchHandler, options, search, value, remoteResults]);

  const selectedItems: FieldOption[] = value.map((id) => {
    const found = options.find((o) => o.id === id);
    return found ?? { id, label: id };
  });

  function addFreeText() {
    const trimmed = search.trim();
    if (trimmed && !value.includes(trimmed)) {
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
              <div className="flex items-center gap-2 sm:gap-1">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
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
            onKeyDown={(e) => {
              if (allowFreeText && (e.key === 'Enter' || e.key === ',')) {
                e.preventDefault();
                addFreeText();
              }
            }}
            placeholder={field.placeholder || 'Search and select…'}
            className="flex-1 bg-transparent text-sm outline-none"
          />
          {allowFreeText && search.trim() && (
            <button
              type="button"
              onClick={addFreeText}
              className="flex-shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-200"
            >
              Add
            </button>
          )}
        </div>
        {search.length > 0 && (
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

/** T-290 — the "Read as" lines for one entered value (S2 to S8, signed by Ajay).
 *  Never renders nothing: a missing line would read as "nothing wrong". */
function SectionReadLines({ state }: { state: SectionReadState | undefined }) {
  if (state === undefined) {
    return <p className="mt-0.5 break-words text-xs text-slate-600">Checking this section</p>;
  }
  if (state.status === 'failed') {
    return (
      <p className="mt-0.5 text-xs text-red-500">
        Could not check this section. Check the Act and the number before you generate.
      </p>
    );
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
        // The bns_mapping reader always gives a code; never invent one.
        if (s.code === null) return null;
        return (
          <p key={key} className="mt-0.5 break-words text-xs text-slate-600">
            Read as{' '}
            <span className="font-medium">
              {s.code} {s.number}
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

export function useCourtsData(formData: Record<string, unknown>) {
  const [states, setStates] = useState<FieldOption[]>([]);
  const [courtTypes, setCourtTypes] = useState<FieldOption[]>([]);
  const [courts, setCourts] = useState<FieldOption[]>([]);

  const stateId = String(formData.state ?? '');
  const courtType = String(formData.court_type ?? '');

  // Fetch states once on mount
  const statesFetched = useRef(false);
  useEffect(() => {
    if (statesFetched.current) return;
    statesFetched.current = true;
    fetch(`${API_URL}/api/courts/states`)
      .then((r) => r.json())
      .then((data) => {
        if (data.states) {
          setStates(
            data.states.map((s: { id: string; name: string }) => ({ id: s.id, label: s.name })),
          );
        }
      })
      .catch(() => {});
  }, []);

  // Fetch court types when state changes
  useEffect(() => {
    if (!stateId) {
      setCourtTypes([]);
      setCourts([]);
      return;
    }
    fetch(`${API_URL}/api/courts/types?state=${encodeURIComponent(stateId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.types) {
          setCourtTypes(
            data.types.map((t: { id: string; label: string }) => ({ id: t.id, label: t.label })),
          );
        }
      })
      .catch(() => {});
  }, [stateId]);

  // Fetch courts when state + court_type change
  useEffect(() => {
    if (!stateId || !courtType) {
      setCourts([]);
      return;
    }
    fetch(
      `${API_URL}/api/courts?state=${encodeURIComponent(stateId)}&type=${encodeURIComponent(courtType)}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.courts) {
          setCourts(
            data.courts.map((c: { courtId: string; name: string }) => ({
              id: c.courtId,
              label: c.name,
            })),
          );
        }
      })
      .catch(() => {});
  }, [stateId, courtType]);

  return { states, courtTypes, courts };
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

type SectionReadState = { status: 'ok'; sections: SectionRead[] } | { status: 'failed' };

type SectionReadResult =
  | { forKey: string; status: 'ok'; entries: SectionRead[][] }
  | { forKey: string; status: 'failed' };

const SECTION_READ_TIMEOUT_MS = 5000;

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
}: DynamicFormRendererProps) {
  const steps = config.form_schema.steps;
  const [step, setStep] = useState(0);
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
    return initial;
  });

  // Courts data from API — cascading dropdowns (SCRUM-50)
  const courtsData = useCourtsData(formData);

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

  function handleNext() {
    if (isLastStep) {
      onSubmit(formData);
    } else {
      setStep((s) => s + 1);
    }
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
          {visibleFields.map((field) => {
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

      {/* Navigation */}
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => (step === 0 ? onCancel() : setStep((s) => s - 1))}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <ChevronLeft size={14} />
          {step === 0 ? 'Cancel' : 'Back'}
        </button>

        <button
          type="button"
          disabled={!canAdvance || submitting}
          onClick={handleNext}
          className={`flex items-center gap-1.5 rounded-lg px-5 py-2 text-xs font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
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
      </div>
    </div>
  );
}
