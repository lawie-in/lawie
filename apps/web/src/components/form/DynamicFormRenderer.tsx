'use client';

/**
 * DynamicFormRenderer — Config-Driven Form (SCRUM-43)
 *
 * Reads a template config's form_schema and renders the full multi-step form.
 * Supports all field types: text, date, number, textarea, dropdown,
 * dropdown_search, multi_select_search, checkbox_group.
 * Handles show_if conditional visibility and min/max validation.
 *
 * Zero hardcoded fields — adding a new template = new JSON config only.
 */
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── Types (mirrored from backend template-engine types) ─────────────────────

interface FieldOption {
  id: string;
  label: string;
}

interface FormField {
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
    | 'checkbox_group';
  required: boolean;
  placeholder?: string;
  default?: string;
  options?: FieldOption[];
  options_from?: string;
  source?: string;
  filtered_by?: string[];
  cascades_to?: string[];
  show_if?: string;
  inject_into?: string[];
  auto_convert_old?: boolean;
  links_to_formatting?: boolean;
  min_length?: number;
  max_length?: number;
  min_select?: number;
}

interface FormStep {
  step: number;
  title: string;
  fields: FormField[];
}

interface TemplateConfig {
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

// ── Helper: evaluate show_if expressions ────────────────────────────────────

function evaluateShowIf(expr: string, formData: Record<string, unknown>): boolean {
  const neqMatch = expr.match(/^(\w+)\s*!==?\s*(\w+)$/);
  if (neqMatch) {
    const actual = String(formData[neqMatch[1]] ?? '');
    return actual !== neqMatch[2];
  }
  const eqMatch = expr.match(/^(\w+)\s*===?\s*(\w+)$/);
  if (eqMatch) {
    const actual = String(formData[eqMatch[1]] ?? '');
    return actual === eqMatch[2];
  }
  return true;
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

  const filtered = useMemo(
    () =>
      search.length > 0
        ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
        : options,
    [options, search],
  );

  const selectedLabel = options.find((o) => o.id === value)?.label ?? '';

  return (
    <div className="relative">
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
}: {
  field: FormField;
  value: string[];
  onChange: (v: string[]) => void;
  options: FieldOption[];
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () =>
      search.length > 0
        ? options.filter(
            (o) => o.label.toLowerCase().includes(search.toLowerCase()) && !value.includes(o.id),
          )
        : options.filter((o) => !value.includes(o.id)),
    [options, search, value],
  );

  const selectedItems = value
    .map((id) => options.find((o) => o.id === id))
    .filter(Boolean) as FieldOption[];

  return (
    <div>
      <FieldLabel field={field} />
      {/* Selected items as tags */}
      {selectedItems.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {selectedItems.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
            >
              {item.label}
              <X
                size={12}
                className="cursor-pointer hover:text-amber-600"
                onClick={() => onChange(value.filter((v) => v !== item.id))}
              />
            </span>
          ))}
        </div>
      )}
      {/* Search + dropdown */}
      <div className="relative mt-1">
        <div className={`${inputClasses} flex items-center gap-2`}>
          <Search size={14} className="flex-shrink-0 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={field.placeholder || 'Search and select…'}
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        {search.length > 0 && filtered.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
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
    </div>
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

function useCourtsData(formData: Record<string, unknown>) {
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

function resolveOptions(
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

  // bns_mapping source — for now return empty, user types freely
  // TODO: SCRUM-46 will provide the full BNS section search API
  if (field.source === 'bns_mapping') return [];

  return [];
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
    // Initialize with defaults from the schema
    const initial: Record<string, unknown> = {};
    for (const s of steps) {
      for (const f of s.fields) {
        if (f.default) {
          initial[f.field_id] = f.default;
        } else if (f.type === 'checkbox_group' || f.type === 'multi_select_search') {
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

  // Get visible fields for the current step (respecting show_if)
  const currentStep = steps[step];
  const visibleFields = useMemo(
    () => currentStep.fields.filter((f) => !f.show_if || evaluateShowIf(f.show_if, formData)),
    [currentStep, formData],
  );

  // Can we advance to the next step?
  const canAdvance = useMemo(() => {
    for (const field of visibleFields) {
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
  }, [visibleFields, formData]);

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
              field.type === 'multi_select_search';

            return (
              <div key={field.field_id} className={isFullWidth ? 'col-span-full' : ''}>
                {(field.type === 'text' || field.type === 'date' || field.type === 'number') && (
                  <TextField
                    field={field}
                    value={String(value ?? '')}
                    onChange={(v) => setField(field.field_id, v)}
                  />
                )}

                {field.type === 'textarea' && (
                  <TextareaField
                    field={field}
                    value={String(value ?? '')}
                    onChange={(v) => setField(field.field_id, v)}
                  />
                )}

                {field.type === 'dropdown' && (
                  <DropdownField
                    field={field}
                    value={String(value ?? '')}
                    onChange={(v) => setField(field.field_id, v)}
                    options={options}
                  />
                )}

                {field.type === 'dropdown_search' && (
                  <DropdownSearchField
                    field={field}
                    value={String(value ?? '')}
                    onChange={(v) => setField(field.field_id, v)}
                    options={options}
                  />
                )}

                {field.type === 'multi_select_search' && (
                  <MultiSelectSearchField
                    field={field}
                    value={Array.isArray(value) ? (value as string[]) : []}
                    onChange={(v) => setField(field.field_id, v)}
                    options={options}
                  />
                )}

                {field.type === 'checkbox_group' && (
                  <CheckboxGroupField
                    field={field}
                    value={Array.isArray(value) ? (value as string[]) : []}
                    onChange={(v) => setField(field.field_id, v)}
                  />
                )}
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
