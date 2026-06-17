'use client';

/**
 * /admin/ai-config — runtime AI configuration (visual refresh 2026-05-12).
 *
 * Backed by the AppSetting Mongo collection. Layout chrome lives in
 * apps/web/src/app/admin/layout.tsx.
 *
 * Design: docs/Admin Panel Design/Runtime model selection _ editable rows _ audit.png
 */

import { AlertTriangle, CheckCircle2, Info, Loader2, PencilLine, Save, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { AdminPageHeader, ServiceHealthyBadge } from '@/components/admin/AdminPageHeader';
import { apiFetch } from '@/lib/apiFetch';

interface AppSetting {
  key: string;
  value: string;
  description?: string;
  updatedAt: string;
}

interface AiUsage {
  month: string;
  totalTokens: number;
  totalCostInr: number;
  generationCount: number;
  avgCostPerGenInr: number;
}

const REQUIRED_KEYS: Array<{ key: string; help: string; required: boolean }> = [
  {
    key: 'ai.drafting_model',
    help: 'Anthropic model id for the main drafting pipeline (body paragraphs, prayer, verification text). Required.',
    required: true,
  },
  {
    key: 'ai.preflight_model',
    help: 'Anthropic model id for the SCRUM-69 preflight verifier (Haiku-class). Optional — preflight degrades to rules-only if unset.',
    required: false,
  },
];

export default function AiConfigPage() {
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setFetching(true);
    try {
      const res = await apiFetch('/api/drafting/admin/app-settings');
      if (res.ok) {
        const body = await res.json();
        setSettings(body.settings ?? []);
      } else {
        setError('Failed to load AI configuration.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
    const month = new Date().toISOString().slice(0, 7);
    apiFetch(`/api/drafting/admin/ai-usage?month=${month}`)
      .then(async (res) => {
        if (res.ok) setAiUsage(await res.json());
      })
      .catch(() => undefined);
  }, [fetchSettings]);

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

  const rows = REQUIRED_KEYS.map((rk) => {
    const existing = settings.find((s) => s.key === rk.key);
    return {
      key: rk.key,
      help: rk.help,
      required: rk.required,
      value: existing?.value,
      description: existing?.description,
      updatedAt: existing?.updatedAt,
      isConfigured: !!existing,
    };
  });

  const extras = settings.filter((s) => !REQUIRED_KEYS.some((rk) => rk.key === s.key));

  return (
    <div>
      <AdminPageHeader
        title="AI configuration"
        eyebrow="Runtime model selection · ~1 min propagation"
        statusBadge={<ServiceHealthyBadge />}
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <Info size={14} className="mt-0.5 flex-shrink-0 text-blue-500" />
        <div className="text-sm text-blue-900">
          <p className="font-medium">
            Changes take effect within ~1 minute (drafting service cache TTL). No redeploy required.
          </p>
          <p className="mt-0.5 text-blue-700">
            Drafts cannot be generated until <code className="font-mono">ai.drafting_model</code> is
            populated.
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Required keys
        </h2>
        {fetching && rows.every((r) => !r.isConfigured) ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        ) : (
          rows.map((row) => (
            <SettingRow
              key={row.key}
              row={row}
              isEditing={editingKey === row.key}
              editValue={editValue}
              editDescription={editDescription}
              saving={saving}
              saveError={editingKey === row.key ? saveError : ''}
              savedRecently={savedKey === row.key}
              onStart={() => startEdit(row.key, row.value ?? '', row.description)}
              onCancel={cancelEdit}
              onChangeValue={setEditValue}
              onChangeDescription={setEditDescription}
              onSave={() => handleSave(row.key)}
            />
          ))
        )}
      </section>

      {extras.length > 0 && (
        <section className="mt-6 space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Other settings
          </h2>
          {extras.map((s) => (
            <SettingRow
              key={s.key}
              row={{
                key: s.key,
                help: '',
                required: false,
                value: s.value,
                description: s.description,
                updatedAt: s.updatedAt,
                isConfigured: true,
              }}
              isEditing={editingKey === s.key}
              editValue={editValue}
              editDescription={editDescription}
              saving={saving}
              saveError={editingKey === s.key ? saveError : ''}
              savedRecently={savedKey === s.key}
              onStart={() => startEdit(s.key, s.value, s.description)}
              onCancel={cancelEdit}
              onChangeValue={setEditValue}
              onChangeDescription={setEditDescription}
              onSave={() => handleSave(s.key)}
            />
          ))}
        </section>
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

interface SettingRowProps {
  row: {
    key: string;
    help: string;
    required: boolean;
    value?: string;
    description?: string;
    updatedAt?: string;
    isConfigured: boolean;
  };
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
}

function SettingRow(p: SettingRowProps) {
  const cardClass = !p.row.isConfigured
    ? 'border-amber-200 bg-amber-50/40'
    : 'border-slate-200 bg-white';
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${cardClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-sm font-semibold text-slate-900">{p.row.key}</code>
            {p.row.isConfigured ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                <span className="h-1 w-1 rounded-full bg-green-500" />
                Live
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
        </div>
        {!p.isEditing && (
          <button
            type="button"
            onClick={p.onStart}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <PencilLine size={12} />
            {p.row.isConfigured ? 'Edit' : 'Set value'}
          </button>
        )}
      </div>

      {!p.isEditing && p.row.isConfigured && (
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
          <input
            type="text"
            value={p.editValue}
            onChange={(e) => p.onChangeValue(e.target.value)}
            placeholder="Enter value"
            maxLength={500}
            autoFocus
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <input
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
    </div>
  );
}
