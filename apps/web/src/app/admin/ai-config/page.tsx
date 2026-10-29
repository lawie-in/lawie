'use client';

/**
 * /admin/ai-config — runtime AI configuration (visual refresh 2026-05-12).
 *
 * Backed by the AppSetting Mongo collection. Layout chrome lives in
 * apps/web/src/app/admin/layout.tsx.
 *
 * T-684: the known keys (a model and an effort per role, plus the three
 * deprecated model keys) come from GET /api/drafting/admin/app-settings/registry,
 * which returns key names and help text only, never values. Values come from
 * the stored settings list, as before.
 *
 * Design: docs/Admin Panel Design/Runtime model selection _ editable rows _ audit.png
 */

import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Info,
  Loader2,
  PencilLine,
  Save,
  X,
  Zap,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { AdminPageHeader, ServiceHealthyBadge } from '@/components/admin/AdminPageHeader';
import { apiFetch } from '@/lib/apiFetch';

interface AppSetting {
  key: string;
  value: string;
  description?: string;
  updatedAt: string;
}

/** One entry of GET /api/drafting/admin/app-settings/registry (T-684). No value. */
interface RegistryEntry {
  key: string;
  group: 'model' | 'effort' | 'deprecated';
  role?: string;
  label: string;
  help: string;
  required: boolean;
  deprecated?: boolean;
  replacedBy?: string;
  legacyKey?: string;
  allowedValues?: string[];
}

interface AiUsage {
  month: string;
  totalTokens: number;
  totalCostInr: number;
  generationCount: number;
  avgCostPerGenInr: number;
  /** T-437 — prompt cache. Optional so an older drafting service still renders. */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cacheReadCostInr?: number;
  cacheWriteCostInr?: number;
  cacheSavingsInr?: number;
  cacheHitSharePct?: number;
}

export default function AiConfigPage() {
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [registry, setRegistry] = useState<RegistryEntry[]>([]);
  const [registryLoaded, setRegistryLoaded] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [registryError, setRegistryError] = useState('');
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const [copyingKey, setCopyingKey] = useState<string | null>(null);
  /** Guards a double click before the copyingKey state update renders. */
  const copyInFlight = useRef(false);
  const [copyError, setCopyError] = useState<{ key: string; message: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    setFetching(true);
    try {
      const res = await apiFetch('/api/drafting/admin/app-settings');
      if (res.ok) {
        const body = await res.json();
        setSettings(body.settings ?? []);
        setSettingsLoaded(true);
        setError('');
      } else {
        // T-684 review: without current values every editable row is hidden,
        // so a "Set value" can never overwrite a live row it could not see.
        setSettingsLoaded(false);
        setError('Failed to load AI configuration.');
      }
    } catch {
      setSettingsLoaded(false);
      setError('Network error.');
    } finally {
      setFetching(false);
    }
  }, []);

  const fetchRegistry = useCallback(async () => {
    try {
      const res = await apiFetch('/api/drafting/admin/app-settings/registry');
      if (res.ok) {
        const body = await res.json();
        setRegistry(Array.isArray(body.entries) ? (body.entries as RegistryEntry[]) : []);
        setRegistryLoaded(true);
        setRegistryError('');
      } else {
        setRegistryError(
          'Failed to load the list of AI keys. Stored settings are shown under Other settings.',
        );
      }
    } catch {
      setRegistryError(
        'Network error loading the list of AI keys. Stored settings are shown under Other settings.',
      );
    }
  }, []);

  useEffect(() => {
    void Promise.all([fetchSettings(), fetchRegistry()]);
    const month = new Date().toISOString().slice(0, 7);
    apiFetch(`/api/drafting/admin/ai-usage?month=${month}`)
      .then(async (res) => {
        if (res.ok) setAiUsage(await res.json());
      })
      .catch(() => undefined);
  }, [fetchSettings, fetchRegistry]);

  const startEdit = (key: string, value: string, description?: string) => {
    setEditingKey(key);
    setEditValue(value);
    setEditDescription(description ?? '');
    setSaveError('');
    setSavedKey(null);
  };
  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue('');
    setEditDescription('');
    setSaveError('');
  };

  const handleSave = async (key: string) => {
    setSaveError('');
    if (!editValue.trim()) {
      setSaveError('Value is required.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/drafting/admin/app-settings/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: editValue.trim(),
          description: editDescription.trim() || undefined,
        }),
      });
      if (res.ok) {
        await fetchSettings();
        setSavedKey(key);
        setEditingKey(null);
        setTimeout(() => setSavedKey(null), 2500);
      } else {
        const data = await res.json();
        setSaveError(data.error ?? 'Save failed.');
      }
    } catch {
      setSaveError('Network error.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * T-684: explicit "copy to the new key" action for a deprecated key. Writes
   * the legacy value to its replacement with the same PUT, then reloads. Only
   * offered while the replacement has no stored row, and re-checked against a
   * fresh settings list just before the PUT (T-684 review), so a key set
   * since the page loaded is never overwritten.
   */
  const handleCopy = async (fromKey: string, toKey: string) => {
    if (copyInFlight.current) return;
    copyInFlight.current = true;
    setCopyError(null);
    setCopyingKey(fromKey);
    try {
      const listRes = await apiFetch('/api/drafting/admin/app-settings');
      if (!listRes.ok) {
        setCopyError({ key: fromKey, message: 'Failed to load AI configuration.' });
        return;
      }
      const fresh: AppSetting[] = (await listRes.json()).settings ?? [];
      setSettings(fresh);
      setSettingsLoaded(true);
      if (fresh.some((s) => s.key === toKey)) {
        setCopyError({ key: fromKey, message: `${toKey} was set meanwhile; not overwritten.` });
        return;
      }
      const source = fresh.find((s) => s.key === fromKey);
      if (!source || !source.value.trim()) {
        setCopyError({ key: fromKey, message: 'Nothing to copy.' });
        return;
      }
      const res = await apiFetch(`/api/drafting/admin/app-settings/${encodeURIComponent(toKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: source.value.trim() }),
      });
      if (res.ok) {
        await fetchSettings();
        setSavedKey(toKey);
        setTimeout(() => setSavedKey(null), 2500);
      } else {
        const data = await res.json();
        setCopyError({ key: fromKey, message: data.error ?? 'Save failed.' });
      }
    } catch {
      setCopyError({ key: fromKey, message: 'Network error.' });
    } finally {
      copyInFlight.current = false;
      setCopyingKey(null);
    }
  };

  const stored = (key: string) => settings.find((s) => s.key === key);
  const hasRow = (key?: string) => !!key && settings.some((s) => s.key === key);

  const toRow = (entry: RegistryEntry): RowData => {
    const existing = stored(entry.key);
    const servedByLegacy = !existing && hasRow(entry.legacyKey);
    return {
      key: entry.key,
      label: entry.label,
      help: entry.help,
      required: entry.required,
      showRequirement: true,
      value: existing?.value,
      description: existing?.description,
      updatedAt: existing?.updatedAt,
      isConfigured: !!existing || servedByLegacy,
      legacyNotice: servedByLegacy
        ? `Set via legacy key ${entry.legacyKey}, move it to ${entry.key}.`
        : undefined,
      legacyHint:
        entry.legacyKey && !servedByLegacy
          ? `Legacy key: ${entry.legacyKey} (read while this key is unset, until the next release).`
          : undefined,
      allowedValues: entry.allowedValues,
      deprecated: entry.deprecated,
      replacedBy: entry.replacedBy,
    };
  };

  const modelRows = registry.filter((e) => e.group === 'model').map(toRow);
  const effortRows = registry.filter((e) => e.group === 'effort').map(toRow);
  const deprecatedRows = registry
    .filter((e) => e.group === 'deprecated' && hasRow(e.key))
    .map(toRow);

  // Stored rows only once the list has loaded; after a failed load nothing is shown.
  const extras = settingsLoaded
    ? settings.filter((s) => !registry.some((e) => e.key === s.key))
    : [];

  // T-585 / T-684: a required model key is missing when neither it nor its
  // legacy key has a stored row. Only computed once both lists have loaded,
  // so a failed request never shows a false warning. Key names only.
  const missingRequired =
    registryLoaded && settingsLoaded
      ? registry.filter(
          (e) => e.group === 'model' && e.required && !hasRow(e.key) && !hasRow(e.legacyKey),
        )
      : [];

  const initialLoading = fetching && !settingsLoaded;
  // T-684 review: the registry sections are editable only with current values.
  const settingsFailed = !fetching && !settingsLoaded;

  const rowProps = (row: RowData) => ({
    row,
    isEditing: editingKey === row.key,
    editValue,
    editDescription,
    saving,
    saveError: editingKey === row.key ? saveError : '',
    savedRecently: savedKey === row.key,
    onStart: () => startEdit(row.key, canonicalValue(row), row.description),
    onCancel: cancelEdit,
    onChangeValue: setEditValue,
    onChangeDescription: setEditDescription,
    onSave: () => handleSave(row.key),
  });

  return (
    <div>
      <AdminPageHeader
        title="AI configuration"
        eyebrow="Runtime model selection · ~1 min propagation"
        statusBadge={<ServiceHealthyBadge />}
      />

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {registryError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {registryError}
        </div>
      )}

      {settingsFailed && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Current values could not be loaded, so settings are hidden to avoid overwriting them.
        </div>
      )}

      {missingRequired.length > 0 && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4"
        >
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Required AI model keys are not configured.</p>
            <ul className="mt-1 space-y-0.5 text-amber-800">
              {missingRequired.map((e) => (
                <li key={e.key}>
                  <code className="font-mono">{e.key}</code> is not populated
                  {e.legacyKey ? (
                    <>
                      {' '}
                      (and neither is <code className="font-mono">{e.legacyKey}</code>)
                    </>
                  ) : null}
                  .
                </li>
              ))}
            </ul>
            <p className="mt-1 text-amber-700">
              Drafting reports these at boot and on /health as config warnings until they are
              populated.
            </p>
          </div>
        </div>
      )}

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <Info size={14} className="mt-0.5 flex-shrink-0 text-blue-500" />
        <div className="text-sm text-blue-900">
          <p className="font-medium">
            Changes take effect within ~1 minute (drafting service cache TTL). No redeploy required.
          </p>
          <p className="mt-0.5 text-blue-700">
            Drafts cannot be generated until <code className="font-mono">ai.model.drafter</code> is
            populated, and intake needs <code className="font-mono">ai.model.extractor</code>. Until
            the next release, <code className="font-mono">ai.drafting_model</code>,{' '}
            <code className="font-mono">ai.intake_model</code> and{' '}
            <code className="font-mono">ai.preflight_model</code> are still read while the new key
            is unset.
          </p>
        </div>
      </div>

      {initialLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
          <Loader2 size={14} className="animate-spin" />
          Loading…
        </div>
      ) : settingsFailed ? null : (
        <>
          {modelRows.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Models
              </h2>
              {modelRows.map((row) => (
                <SettingRow key={row.key} {...rowProps(row)} />
              ))}
            </section>
          )}

          {effortRows.length > 0 && (
            <section className="mt-6 space-y-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Effort
              </h2>
              {effortRows.map((row) => (
                <SettingRow key={row.key} {...rowProps(row)} />
              ))}
            </section>
          )}

          {deprecatedRows.length > 0 && (
            <section className="mt-6 space-y-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Deprecated (read until the next release)
              </h2>
              {deprecatedRows.map((row) => {
                const target = row.replacedBy;
                const targetSet = hasRow(target);
                return (
                  <SettingRow key={row.key} {...rowProps(row)}>
                    {target && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        {targetSet ? (
                          <span className="text-slate-500">
                            <code className="font-mono">{target}</code> is set, so this key is no
                            longer read.
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleCopy(row.key, target)}
                            disabled={copyingKey !== null}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {copyingKey === row.key ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Copy size={12} />
                            )}
                            Copy to {target}
                          </button>
                        )}
                        {copyError?.key === row.key && (
                          <span className="flex items-center gap-1 text-red-600">
                            <AlertTriangle size={12} />
                            {copyError.message}
                          </span>
                        )}
                      </div>
                    )}
                  </SettingRow>
                );
              })}
            </section>
          )}

          {extras.length > 0 && (
            <section className="mt-6 space-y-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Other settings
              </h2>
              {extras.map((s) => (
                <SettingRow
                  key={s.key}
                  {...rowProps({
                    key: s.key,
                    help: '',
                    required: false,
                    showRequirement: false,
                    value: s.value,
                    description: s.description,
                    updatedAt: s.updatedAt,
                    isConfigured: true,
                  })}
                />
              ))}
            </section>
          )}
        </>
      )}

      {/* AI cost this month */}
      {aiUsage && (
        <section className="mt-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Zap size={14} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-800">AI cost — {aiUsage.month}</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Total cost
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                ₹{aiUsage.totalCostInr.toLocaleString('en-IN')}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Generations
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {aiUsage.generationCount.toLocaleString('en-IN')}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Avg per generation
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">₹{aiUsage.avgCostPerGenInr}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Total tokens
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {aiUsage.totalTokens.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
          {/* T-437: prompt cache — its cost is already inside Total cost. */}
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Cache reads
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {(aiUsage.cacheReadTokens ?? 0).toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-slate-500">
                ₹{(aiUsage.cacheReadCostInr ?? 0).toLocaleString('en-IN')}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Cache writes
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {(aiUsage.cacheWriteTokens ?? 0).toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-slate-500">
                ₹{(aiUsage.cacheWriteCostInr ?? 0).toLocaleString('en-IN')}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Cache hit share
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {aiUsage.cacheHitSharePct ?? 0}%
              </p>
              <p className="text-xs text-slate-500">of input tokens</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Cache saving
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                ₹{(aiUsage.cacheSavingsInr ?? 0).toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-slate-500">net of write cost</p>
            </div>
          </div>
        </section>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Bootstrap:{' '}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">
          yarn workspace @lawie/drafting seed:setting &lt;key&gt; &lt;value&gt;
        </code>
      </p>
    </div>
  );
}

/**
 * T-684 review: the allowed value a stored value matches, compared trimmed and
 * lower-cased (old rows may be mixed case, e.g. "HIGH"), or undefined.
 */
function matchAllowed(value: string, allowed: string[] | undefined): string | undefined {
  const v = value.trim().toLowerCase();
  if (!v || !allowed) return undefined;
  return allowed.find((a) => a.toLowerCase() === v);
}

/** The value an edit starts from: a select row's matching allowed value, else the stored value. */
function canonicalValue(row: RowData): string {
  const value = row.value ?? '';
  return matchAllowed(value, row.allowedValues) ?? value;
}

interface RowData {
  key: string;
  /** Human label from the registry; stored-only keys have none. */
  label?: string;
  help: string;
  required: boolean;
  /** Show the Required / Optional badge (registry keys only). */
  showRequirement: boolean;
  value?: string;
  description?: string;
  updatedAt?: string;
  /** Has a stored row, or (T-684) is served by its legacy key's row. */
  isConfigured: boolean;
  /** T-684: the key has no row and its legacy key is serving it. */
  legacyNotice?: string;
  /** T-684: which legacy key this key replaces. */
  legacyHint?: string;
  /** T-684: effort keys take one of these values (rendered as a select). */
  allowedValues?: string[];
  deprecated?: boolean;
  replacedBy?: string;
}

interface SettingRowProps {
  row: RowData;
  isEditing: boolean;
  editValue: string;
  editDescription: string;
  saving: boolean;
  saveError: string;
  savedRecently: boolean;
  onStart: () => void;
  onCancel: () => void;
  onChangeValue: (v: string) => void;
  onChangeDescription: (v: string) => void;
  onSave: () => void;
  children?: ReactNode;
}

function SettingRow(p: SettingRowProps) {
  const hasOwnRow = p.row.value !== undefined;
  // Amber card for a required key with no value from either key; an unset
  // optional key keeps the plain card.
  const cardClass =
    !p.row.isConfigured && p.row.required
      ? 'border-amber-200 bg-amber-50/40'
      : 'border-slate-200 bg-white';
  const valueId = `setting-value-${p.row.key}`;
  const descriptionId = `setting-description-${p.row.key}`;
  const options = p.row.allowedValues ?? [];
  // A stored "HIGH" selects "high"; only a value matching none is flagged.
  const matchedOption = matchAllowed(p.editValue, options);
  const selectValue = matchedOption ?? p.editValue;
  const currentNotAllowed = options.length > 0 && p.editValue.trim() !== '' && !matchedOption;
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${cardClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {p.row.label && !p.row.deprecated && (
            <p className="mb-0.5 text-xs font-medium text-slate-600">{p.row.label}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-sm font-semibold text-slate-900">{p.row.key}</code>
            {p.row.showRequirement &&
              !p.row.deprecated &&
              (p.row.required ? (
                <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700">
                  Required
                </span>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  Optional
                </span>
              ))}
            {p.row.deprecated && (
              <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700">
                Deprecated
              </span>
            )}
            {hasOwnRow ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                <span className="h-1 w-1 rounded-full bg-green-500" />
                Live
              </span>
            ) : p.row.legacyNotice ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                Legacy key in use
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                Not configured
              </span>
            )}
            {p.savedRecently && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600">
                <CheckCircle2 size={12} />
                Saved
              </span>
            )}
          </div>
          {p.row.help && <p className="mt-1 text-xs text-slate-500">{p.row.help}</p>}
          {p.row.deprecated && p.row.replacedBy && (
            <p className="mt-1 text-xs font-medium text-orange-700">
              Migrate to <code className="font-mono">{p.row.replacedBy}</code>.
            </p>
          )}
          {p.row.legacyNotice && (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700">
              <AlertTriangle size={12} />
              {p.row.legacyNotice}
            </p>
          )}
          {p.row.legacyHint && (
            <p className="mt-1 text-[11px] text-slate-400">{p.row.legacyHint}</p>
          )}
        </div>
        {!p.isEditing && (
          <button
            type="button"
            onClick={p.onStart}
            aria-label={`${hasOwnRow ? 'Edit' : 'Set value for'} ${p.row.key}`}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <PencilLine size={12} />
            {hasOwnRow ? 'Edit' : 'Set value'}
          </button>
        )}
      </div>

      {!p.isEditing && hasOwnRow && (
        <div className="mt-3">
          <code className="block max-w-full overflow-x-auto rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-800">
            {p.row.value}
          </code>
          {p.row.description && <p className="mt-2 text-xs text-slate-500">{p.row.description}</p>}
          {p.row.updatedAt && (
            <p className="mt-1 text-[11px] text-slate-400">
              Updated{' '}
              {new Date(p.row.updatedAt).toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>
      )}

      {p.isEditing && (
        <div className="mt-3 space-y-2">
          <label htmlFor={valueId} className="block text-[11px] font-medium text-slate-600">
            Value for <code className="font-mono">{p.row.key}</code>
          </label>
          {options.length > 0 ? (
            <select
              id={valueId}
              value={selectValue}
              onChange={(e) => p.onChangeValue(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">(unset: choose a value)</option>
              {currentNotAllowed && (
                <option value={p.editValue}>{p.editValue} (not an allowed value)</option>
              )}
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={valueId}
              type="text"
              value={p.editValue}
              onChange={(e) => p.onChangeValue(e.target.value)}
              placeholder="Enter value"
              maxLength={500}
              autoFocus
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          )}
          <label htmlFor={descriptionId} className="sr-only">
            Description for {p.row.key} (optional)
          </label>
          <input
            id={descriptionId}
            type="text"
            value={p.editDescription}
            onChange={(e) => p.onChangeDescription(e.target.value)}
            placeholder="Description (optional)"
            maxLength={500}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          {p.saveError && (
            <p className="flex items-center gap-1 text-xs text-red-600">
              <AlertTriangle size={12} />
              {p.saveError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={p.onSave}
              disabled={p.saving}
              className="flex items-center gap-1 rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {p.saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save
            </button>
            <button
              type="button"
              onClick={p.onCancel}
              disabled={p.saving}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <X size={12} />
              Cancel
            </button>
          </div>
        </div>
      )}

      {p.children}
    </div>
  );
}
