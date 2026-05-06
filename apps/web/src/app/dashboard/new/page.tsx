'use client';

/**
 * New Document Page — Config-Driven (SCRUM-43)
 *
 * Flow:
 * 1. Fetch available template configs from API
 * 2. User selects a template → fetch full config
 * 3. DynamicFormRenderer renders the multi-step form
 * 4. On submit → POST /documents/generate-from-template (SSE stream)
 * 5. On done → redirect to /dashboard/documents/:id (editor)
 */
import {
  Scale,
  Megaphone,
  Home,
  AlignLeft,
  FileText,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import DynamicFormRenderer from '@/components/form/DynamicFormRenderer';
import { useAuth } from '@/context/AuthContext';
import { getAccessToken } from '@/lib/auth';

// ── Types ───────────────────────────────────────────────────────────────────

interface TemplateSummary {
  template_id: string;
  display_name: string;
  category: string;
  description: string;
  icon: string;
  plan_access: 'free' | 'pro';
  supported_languages: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TemplateConfig = any; // Full config from API — dynamic JSON

// ── Icon mapping ────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, typeof Scale> = {
  scales: Scale,
  megaphone: Megaphone,
  home: Home,
  align_left: AlignLeft,
  file_text: FileText,
  shield_check: ShieldCheck,
};

const CATEGORY_COLORS: Record<string, { color: string; border: string }> = {
  criminal: { color: 'text-blue-500', border: 'border-t-blue-400' },
  civil: { color: 'text-green-500', border: 'border-t-green-400' },
  corporate: { color: 'text-purple-500', border: 'border-t-purple-400' },
  family: { color: 'text-rose-500', border: 'border-t-rose-400' },
};

// ── Page Component ──────────────────────────────────────────────────────────

function NewDocumentContent() {
  const router = useRouter();
  const { user } = useAuth();

  // Phase: select → form → generating
  const [phase, setPhase] = useState<'select' | 'form' | 'generating'>('select');

  // Template list + selected config
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedConfig, setSelectedConfig] = useState<TemplateConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Generation state
  const [generatedText, setGeneratedText] = useState('');
  const [warnings, setWarnings] = useState<{ type: string; message: string }[]>([]);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [docId, setDocId] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

  // ── Fetch template list on mount ──────────────────────────────────────────
  useEffect(() => {
    async function fetchTemplates() {
      try {
        const token = getAccessToken();
        const res = await fetch(`${apiUrl}/api/documents/template-configs`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates ?? []);
        }
      } catch {
        // Silently fail — we'll show empty state
      } finally {
        setLoadingTemplates(false);
      }
    }
    fetchTemplates();
  }, [apiUrl]);

  // ── Select a template → fetch full config ─────────────────────────────────
  const handleSelectTemplate = useCallback(
    async (templateId: string) => {
      setLoadingConfig(true);
      try {
        const token = getAccessToken();
        const res = await fetch(`${apiUrl}/api/documents/template-configs/${templateId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSelectedConfig(data.config);
          setPhase('form');
        } else {
          const data = await res.json();
          setError(data.error ?? 'Failed to load template');
        }
      } catch {
        setError('Network error loading template');
      } finally {
        setLoadingConfig(false);
      }
    },
    [apiUrl],
  );

  // ── Submit form → generate document (SSE stream) ──────────────────────────
  const handleSubmit = useCallback(
    async (formData: Record<string, unknown>) => {
      if (!user || !selectedConfig) return;

      setPhase('generating');
      setGeneratedText('');
      setWarnings([]);
      setChecklist([]);
      setError('');
      setDone(false);

      const token = getAccessToken();

      try {
        const res = await fetch(`${apiUrl}/api/documents/generate-from-template`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            template_id: selectedConfig.template_id,
            form_data: formData,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? data.message ?? 'Generation failed');
          return;
        }

        if (!res.body) {
          setError('No response body');
          return;
        }

        // Read SSE stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';

        let reading = true;
        while (reading) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) {
            reading = false;
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const payload = JSON.parse(line.slice(6));

                switch (currentEvent) {
                  case 'warning':
                    if (payload.warnings) setWarnings(payload.warnings);
                    break;
                  case 'checklist':
                    if (payload.items) setChecklist(payload.items);
                    break;
                  case 'template_sections':
                    // Template sections are pre-rendered — no action needed here
                    // The full document is assembled server-side
                    break;
                  case 'done':
                    if (payload.docId) setDocId(payload.docId);
                    setDone(true);
                    break;
                  default:
                    // Streamed AI text chunks
                    if (payload.text) {
                      setGeneratedText((prev) => prev + payload.text);
                    }
                    break;
                }
              } catch {
                // malformed SSE line — skip
              }
              currentEvent = '';
            }
          }
        }

        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    },
    [user, selectedConfig, apiUrl],
  );

  // ── Redirect to editor on done ────────────────────────────────────────────
  useEffect(() => {
    if (done && docId && !error) {
      router.push(`/dashboard/documents/${docId}`);
    }
  }, [done, docId, error, router]);

  // ── Render: Generation phase ──────────────────────────────────────────────
  if (phase === 'generating') {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">
            {done && !error ? 'Redirecting to editor…' : done ? 'Document ready' : 'Generating…'}
          </h1>
          {done && error && (
            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
            >
              Back to dashboard
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-amber-700">Validation warnings:</p>
              <ul className="mt-1 space-y-0.5">
                {warnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-600">
                    {'\u2022'} {w.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {checklist.length > 0 && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-sm font-medium text-blue-700">Filing checklist:</p>
            <ul className="mt-1 space-y-0.5">
              {checklist.map((item, i) => (
                <li key={i} className="text-xs text-blue-600">
                  {'\u2610'} {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {done && !error && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
            <CheckCircle2 size={14} className="flex-shrink-0 text-green-600" />
            <p className="text-sm text-green-700">Draft saved — opening editor…</p>
          </div>
        )}

        <div className="min-h-[400px] rounded-xl border border-slate-200 bg-white p-6">
          {!generatedText && !done && (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">AI is drafting the body…</span>
            </div>
          )}
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">
            {generatedText}
          </pre>
          {!done && generatedText && (
            <span className="inline-block h-4 w-0.5 animate-pulse bg-amber-500 align-bottom" />
          )}
        </div>
      </div>
    );
  }

  // ── Render: Form phase ────────────────────────────────────────────────────
  if (phase === 'form' && selectedConfig) {
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            setPhase('select');
            setSelectedConfig(null);
          }}
          className="mb-4 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={12} />
          Choose a different template
        </button>
        <DynamicFormRenderer
          config={selectedConfig}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/dashboard')}
        />
      </div>
    );
  }

  // ── Render: Template selection phase ──────────────────────────────────────
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">New document</h1>
        <p className="mt-1 text-sm text-slate-500">Choose a document template to get started.</p>
      </div>

      {loadingTemplates && (
        <div className="flex items-center gap-2 py-12 text-slate-400">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Loading templates…</span>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {!loadingTemplates && templates.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const Icon = ICON_MAP[t.icon] ?? FileText;
            const colors = CATEGORY_COLORS[t.category] ?? {
              color: 'text-slate-500',
              border: 'border-t-slate-400',
            };

            return (
              <button
                key={t.template_id}
                onClick={() => handleSelectTemplate(t.template_id)}
                disabled={loadingConfig}
                className={`rounded-xl border border-t-[3px] border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md ${colors.border} disabled:opacity-50`}
              >
                <Icon size={18} className={colors.color} />
                <p className="mt-2 text-sm font-semibold text-slate-800">{t.display_name}</p>
                <p className="mt-0.5 text-xs text-slate-400">{t.description}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                    {t.category}
                  </span>
                  {t.plan_access === 'pro' && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      PRO
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!loadingTemplates && templates.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <FileText size={24} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">
            No templates available yet. Templates will appear here as they are reviewed by our legal
            team.
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-6">
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft size={14} />
          Back to dashboard
        </button>
      </div>
    </div>
  );
}

export default function NewDocumentPage() {
  return (
    <Suspense>
      <NewDocumentContent />
    </Suspense>
  );
}
