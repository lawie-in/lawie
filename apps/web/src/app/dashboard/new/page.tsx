'use client';

/**
 * New Document Page — Config-Driven (SCRUM-43)
 *
 * Flow:
 * 1. Fetch available template configs from API
 * 2. User selects a template → fetch full config
 * 3. DynamicFormRenderer renders the multi-step form
 * 4. On submit → POST /documents/preflight (verifying state)
 *    - hard  → hard_block state (stop)
 *    - soft  → soft_warn state (advocate can override)
 *    - pass  → proceed directly
 * 5. POST /documents/generate-from-template (SSE stream) → drafting → ready
 * 6. On done → redirect to /dashboard/documents/:id (editor)
 *
 * Describe-first (T-103, ADR-019), when `feature.describe_first` is on for
 * this user: the page opens on one text box → POST /documents/intake →
 * "which document?" (needs_choice) or follow-up questions (T-102) → the
 * form above, prefilled, as the review step (T-104) → the same preflight and
 * generation as before, carrying intake_id. The gallery stays one click away.
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
  ArrowLeft,
  Search,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PaywallModal } from '@/components/credits/PaywallModal';
import PipelineStatus, { PipelineState } from '@/components/draft/PipelineStatus';
import DynamicFormRenderer from '@/components/form/DynamicFormRenderer';
import DescribeStep from '@/components/intake/DescribeStep';
import DocumentChoiceStep, { NONE_OF_THESE } from '@/components/intake/DocumentChoiceStep';
import FollowUpStep from '@/components/intake/FollowUpStep';
import NoMatchStep from '@/components/intake/NoMatchStep';
import type { AnswersResponse, IntakeResponse, IntakeState } from '@/components/intake/types';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch';

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

// ── Category filter chip ────────────────────────────────────────────────────

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
        active
          ? 'bg-slate-900 text-white'
          : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 text-[10px] ${
          active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

// ── Page Component ──────────────────────────────────────────────────────────

function NewDocumentContent() {
  const router = useRouter();
  const { user } = useAuth();

  // Phase: [describe → choice/followup/no_match →] select → form → generating
  const [phase, setPhase] = useState<
    'loading' | 'describe' | 'choice' | 'followup' | 'no_match' | 'select' | 'form' | 'generating'
  >('loading');

  // ── Describe-first (T-103) ──────────────────────────────────────────────────
  const [describeFirst, setDescribeFirst] = useState(false);
  const [description, setDescription] = useState('');
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [intakeMessage, setIntakeMessage] = useState<{ text: string; retry?: boolean } | null>(
    null,
  );
  const [intake, setIntake] = useState<IntakeState | null>(null);
  const [choices, setChoices] = useState<
    Array<{ template_id: string; display_name: string; description?: string }>
  >([]);
  const [answerInvalid, setAnswerInvalid] = useState<Array<{ field_id: string; reason: string }>>(
    [],
  );
  // Values known before the form opens (review step). Null when the gallery path is used.
  const [prefill, setPrefill] = useState<Record<string, unknown> | null>(null);
  // ADR-019 §3.7 — sent with the generate request so the draft links to its intake.
  const intakeIdRef = useRef<string | undefined>(undefined);
  // T-104 — latest values on the review screen, kept across "Not this document?".
  const reviewValuesRef = useRef<Record<string, unknown>>({});
  const carryOverRef = useRef<Record<string, unknown> | null>(null);

  /** Details the user already entered that also exist in `config` (T-109 03a: they are kept). */
  const carriedInto = useCallback((config: TemplateConfig): Record<string, unknown> => {
    const carry = carryOverRef.current;
    if (!carry) return {};
    const ids = new Set<string>(
      (config.form_schema?.steps ?? []).flatMap((st: { fields: Array<{ field_id: string }> }) =>
        st.fields.map((f) => f.field_id),
      ),
    );
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(carry)) {
      if (!ids.has(k)) continue;
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0))
        continue;
      out[k] = v;
    }
    return out;
  }, []);

  // Template list + selected config
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedConfig, setSelectedConfig] = useState<TemplateConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Search + filter (92 templates need a way to narrow down)
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Pipeline state (drives PipelineStatus)
  const [pipelineState, setPipelineState] = useState<PipelineState>('verifying');
  const [preflightQuestions, setPreflightQuestions] = useState<string[]>([]);
  const [hardBlockReason, setHardBlockReason] = useState<string | undefined>(undefined);
  const [sectionsCited, setSectionsCited] = useState<string[]>([]);
  const [paragraphCount, setParagraphCount] = useState<number | undefined>(undefined);
  const [warningCount, setWarningCount] = useState<number | undefined>(undefined);
  const [docId, setDocId] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Generation error (AI service failed mid-stream — surfaces in PipelineStatus)
  const [generationError, setGenerationError] = useState<string | undefined>(undefined);
  const [generationRetryable, setGenerationRetryable] = useState<boolean>(true);
  // Paywall (SCRUM-73 — opens when enforceCredits returns 402)
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallCost, setPaywallCost] = useState(0);
  const [paywallBalance, setPaywallBalance] = useState(0);

  // Saved form data so the advocate can proceed after soft-warn
  const pendingFormData = useRef<Record<string, unknown> | null>(null);
  // T-003 §3.8 — the run id for the in-progress/last-failed attempt. Kept
  // across a retry (same run, next sequence); dropped on a fresh submit
  // (edited form = a new run). The server works out the sequence; we never
  // send one.
  const lastRunId = useRef<string | undefined>(undefined);

  // ── Search + filter pipeline ──────────────────────────────────────────────
  // Categories with counts, derived from the live template list (so any
  // category Ajay coins in a new doc-rule auto-appears as a filter chip).
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of templates) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ id, count }));
  }, [templates]);

  // Filter pipeline: category first, then case-insensitive substring on
  // display_name + description + template_id. Cheap enough at 92 rows; revisit
  // if we ever cross ~500 templates.
  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        t.display_name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.template_id.toLowerCase().includes(q)
      );
    });
  }, [templates, query, categoryFilter]);

  // ── Fetch template list on mount ──────────────────────────────────────────
  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await apiFetch('/api/documents/template-configs');
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates ?? []);
        } else if (res.status === 503) {
          setError('Service temporarily unavailable. Please try again in a moment.');
        } else {
          setError('Failed to load templates. Please refresh the page.');
        }
      } catch {
        setError('Could not connect to Lawie. Check your connection and refresh.');
      } finally {
        setLoadingTemplates(false);
      }
    }
    fetchTemplates();
  }, []);

  // ── Select a template → fetch full config ─────────────────────────────────
  const handleSelectTemplate = useCallback(
    async (templateId: string) => {
      // A plain gallery pick is not an intake: nothing to link, nothing to prefill.
      // After "Not this document?" the details already entered come along (T-109 03a).
      const fromReview = carryOverRef.current !== null;
      if (!fromReview) intakeIdRef.current = undefined;
      setPrefill(null);
      setLoadingConfig(true);
      try {
        const res = await apiFetch(`/api/documents/template-configs/${templateId}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedConfig(data.config);
          if (fromReview) {
            setPrefill(carriedInto(data.config));
            carryOverRef.current = null;
          }
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
    [carriedInto],
  );

  // ── Describe-first: is it switched on for this user? (ADR-019 §3.11) ──────
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/documents/intake/enabled')
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .catch(() => ({ enabled: false }))
      .then((d: { enabled?: boolean }) => {
        if (cancelled) return;
        setDescribeFirst(d.enabled === true);
        setPhase((p) => (p === 'loading' ? (d.enabled === true ? 'describe' : 'select') : p));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Loads a template's full config. Returns null and shows why when it cannot be used. */
  const loadConfigForIntake = useCallback(async (templateId: string) => {
    try {
      const res = await apiFetch(`/api/documents/template-configs/${templateId}`);
      if (res.ok) return (await res.json()).config as TemplateConfig;
      if (res.status === 403) {
        setIntakeMessage({
          text: 'This document needs the Pro plan. You can upgrade from Settings, then try again.',
        });
        return null;
      }
    } catch {
      /* fall through */
    }
    setIntakeMessage({ text: 'We could not open that document just now.', retry: true });
    return null;
  }, []);

  const goToReview = useCallback((state: IntakeState, extra: Record<string, unknown> = {}) => {
    setPrefill({ ...state.formData, ...extra });
    setPhase('form');
  }, []);

  const handleIntakeResponse = useCallback(
    async (data: IntakeResponse) => {
      intakeIdRef.current = data.intake_id;
      switch (data.outcome) {
        case 'matched': {
          const templateId = data.template_id ?? '';
          const config = await loadConfigForIntake(templateId);
          if (!config) {
            setPhase('describe');
            return;
          }
          setSelectedConfig(config);
          const state: IntakeState = {
            intakeId: data.intake_id,
            templateId,
            displayName: data.display_name ?? config.display_name,
            fields: data.fields ?? {},
            formData: data.form_data ?? {},
            missing: data.missing ?? [],
            questions: data.questions ?? [],
            round: 1,
          };
          setIntake(state);
          setAnswerInvalid([]);
          const carried = carriedInto(config);
          carryOverRef.current = null;
          if (Object.keys(carried).length > 0) {
            // Coming from "Not this document?": what the user typed wins, straight to review.
            goToReview(state, carried);
            return;
          }
          if (state.questions.length > 0) setPhase('followup');
          else goToReview(state);
          return;
        }
        case 'needs_choice': {
          const byId = new Map(templates.map((t) => [t.template_id, t.description]));
          setChoices(
            (data.choices ?? []).map((c) => ({ ...c, description: byId.get(c.template_id) })),
          );
          setPhase('choice');
          return;
        }
        case 'guided': // Reception is T-105; until then this is the no-match screen.
        case 'no_match':
          setPhase('no_match');
          return;
        default:
          setIntakeMessage({
            text: 'We could not read that just now. Try again, or browse templates.',
            retry: true,
          });
          setPhase('describe');
      }
    },
    [loadConfigForIntake, goToReview, templates, carriedInto],
  );

  const postIntake = useCallback(
    async (body: Record<string, unknown>) => {
      setIntakeBusy(true);
      setIntakeMessage(null);
      try {
        const res = await apiFetch('/api/documents/intake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.status === 429) {
          const data = await res.json().catch(() => ({}));
          setIntakeMessage({
            text:
              data.message ??
              "You have used today's quota for describing. Browse templates still works.",
          });
          setPhase('describe');
          return;
        }
        if (res.status === 400) {
          setIntakeMessage({ text: 'Please describe the matter in a little more detail.' });
          setPhase('describe');
          return;
        }
        if (!res.ok) throw new Error('intake failed');
        await handleIntakeResponse((await res.json()) as IntakeResponse);
      } catch {
        setIntakeMessage({
          text: 'We could not read that just now. Try again, or browse templates.',
          retry: true,
        });
        setPhase('describe');
      } finally {
        setIntakeBusy(false);
      }
    },
    [handleIntakeResponse],
  );

  const handleDescribe = useCallback(() => {
    intakeIdRef.current = undefined;
    setIntake(null);
    void postIntake({ description: description.trim() });
  }, [description, postIntake]);

  const handleChoose = useCallback(
    (templateId: string) => {
      if (templateId === NONE_OF_THESE) {
        setPhase('no_match'); // Reception questions arrive with T-105.
        return;
      }
      void postIntake({
        description: description.trim(),
        template_id: templateId,
        ...(intakeIdRef.current ? { intake_id: intakeIdRef.current } : {}),
      });
    },
    [description, postIntake],
  );

  const sendAnswers = useCallback(
    async (answers: Record<string, unknown>, fillMyself: boolean) => {
      if (!intake) return;
      setIntakeBusy(true);
      try {
        const res = await apiFetch('/api/documents/intake/answers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intake_id: intake.intakeId,
            template_id: intake.templateId,
            fields: intake.fields,
            answers,
            round: intake.round,
          }),
        });
        if (!res.ok) throw new Error('answers failed');
        const data = (await res.json()) as AnswersResponse;
        const next: IntakeState = {
          ...intake,
          fields: data.fields,
          formData: data.form_data,
          missing: data.missing,
          questions: data.questions,
          round: intake.round + 1,
        };
        setIntake(next);
        setAnswerInvalid(data.invalid);
        if (fillMyself || data.review || data.questions.length === 0) goToReview(next);
      } catch {
        // The answers are still on screen; going to the form keeps nothing from being lost.
        goToReview(intake, answers);
      } finally {
        setIntakeBusy(false);
      }
    },
    [intake, goToReview],
  );

  const backToDescribe = useCallback(() => {
    setIntakeMessage(null);
    setPhase('describe');
  }, []);

  const openGallery = useCallback(() => {
    intakeIdRef.current = undefined;
    carryOverRef.current = null;
    setPrefill(null);
    setSelectedConfig(null);
    setPhase('select');
  }, []);

  // T-104 "Not this document?" — back to the choices when there were some, else the gallery.
  const notThisDocument = useCallback(() => {
    carryOverRef.current = { ...reviewValuesRef.current };
    setPrefill(null);
    if (choices.length > 0) {
      setPhase('choice');
      return;
    }
    setSelectedConfig(null);
    setPhase('select');
  }, [choices.length]);

  const onReviewValues = useCallback((v: Record<string, unknown>) => {
    reviewValuesRef.current = v;
  }, []);

  // ── SSE generation stream ─────────────────────────────────────────────────
  const runGeneration = useCallback(
    async (formData: Record<string, unknown>) => {
      if (!selectedConfig) return;

      setPipelineState('drafting');
      setError('');
      setGenerationError(undefined);
      setGenerationRetryable(true);

      try {
        const res = await apiFetch('/api/documents/generate-from-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_id: selectedConfig.template_id,
            form_data: formData,
            ...(lastRunId.current ? { run_id: lastRunId.current } : {}),
            ...(intakeIdRef.current ? { intake_id: intakeIdRef.current } : {}),
          }),
        });

        // The server always resolves a run (new or continued) before it
        // starts streaming, so the header is there whether this attempt
        // succeeds or fails — the authoritative source, read before the body.
        const runIdHeader = res.headers.get('X-Run-Id');
        if (runIdHeader) lastRunId.current = runIdHeader;

        if (!res.ok) {
          let reason = 'Generation could not start.';
          let paywallInfo: { cost: number; balance: number } | null = null;
          try {
            const data = await res.json();
            reason = data.error ?? data.message ?? reason;
            // 402 Insufficient credits — open the paywall modal instead of the
            // generation_failed card. The shape is { cost, balance: {...} } from
            // enforceCredits.
            if (res.status === 402 && data.cost && data.balance) {
              paywallInfo = { cost: data.cost, balance: data.balance.total ?? 0 };
            }
          } catch {
            /* non-JSON error body */
          }
          if (paywallInfo) {
            setPaywallCost(paywallInfo.cost);
            setPaywallBalance(paywallInfo.balance);
            setShowPaywall(true);
            // Bounce back to the form view; the paywall sits on top.
            setPhase('form');
            return;
          }
          setGenerationError(reason);
          setGenerationRetryable(res.status !== 402 && res.status !== 403);
          setPipelineState('generation_failed');
          return;
        }

        if (!res.body) {
          setGenerationError('The drafting service returned no response body. Please try again.');
          setGenerationRetryable(true);
          setPipelineState('generation_failed');
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';
        const citedSections: string[] = [];
        let paraCount = 0;
        let warnCount = 0;

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
                    if (payload.warnings) warnCount += payload.warnings.length;
                    break;
                  case 'checklist':
                    // checklist available but not shown in new pipeline UI
                    break;
                  case 'template_sections':
                    if (payload.sections) {
                      citedSections.push(
                        ...(payload.sections as string[]).filter(
                          (s: string) => !citedSections.includes(s),
                        ),
                      );
                    }
                    break;
                  case 'done':
                    if (payload.docId) setDocId(payload.docId);
                    if (payload.paragraphCount) paraCount = payload.paragraphCount;
                    break;
                  case 'error':
                    // Server emitted a structured error mid-stream (AI failure,
                    // rate-limit, etc). Stop reading, switch to the failure state.
                    setGenerationError(
                      typeof payload.reason === 'string'
                        ? payload.reason
                        : 'The AI service returned an error.',
                    );
                    setGenerationRetryable(payload.retryable !== false);
                    setPipelineState('generation_failed');
                    reading = false;
                    return;
                  default:
                    if (payload.text) {
                      // Count paragraph breaks as a proxy for paragraph count
                      paraCount += (payload.text.match(/\n\n/g) ?? []).length;
                    }
                    break;
                }
              } catch {
                // malformed SSE — skip
              }
              currentEvent = '';
            }
          }
        }

        setSectionsCited(citedSections);
        setParagraphCount(paraCount > 0 ? paraCount : undefined);
        setWarningCount(warnCount > 0 ? warnCount : undefined);
        setPipelineState('ready');
        // A run ends at its first completed attempt — generating again is a
        // new run. The server would start one anyway (a completed run never
        // gets reused), but clearing here keeps the client's picture honest.
        lastRunId.current = undefined;
      } catch (err) {
        // Network drop or unexpected client-side error during the SSE read.
        // Surface in the generation_failed card with a retry button.
        const reason =
          err instanceof Error ? err.message : 'Lost connection to the drafting service.';
        setGenerationError(reason);
        setGenerationRetryable(true);
        setPipelineState('generation_failed');
      }
    },
    [selectedConfig],
  );

  // ── Retry handler (generation_failed card) ────────────────────────────────
  const handleRetry = useCallback(async () => {
    if (pendingFormData.current) {
      await runGeneration(pendingFormData.current);
    }
  }, [runGeneration]);

  // ── Submit form → preflight first ────────────────────────────────────────
  const handleSubmit = useCallback(
    async (formData: Record<string, unknown>) => {
      if (!user || !selectedConfig) return;

      // A fresh submit (not the retry button) means the form changed —
      // T-003 §3.8 has the web page drop the stored run id so this starts a
      // new run instead of continuing a failed one.
      lastRunId.current = undefined;
      pendingFormData.current = formData;
      setPhase('generating');
      setPipelineState('verifying');
      setPreflightQuestions([]);
      setHardBlockReason(undefined);
      setSectionsCited([]);
      setParagraphCount(undefined);
      setWarningCount(undefined);
      setDocId(null);
      setError('');

      try {
        const res = await apiFetch('/api/documents/preflight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_id: selectedConfig.template_id,
            form_data: formData,
          }),
        });

        // Fail-open: if preflight itself errors, proceed to generation
        if (!res.ok) {
          await runGeneration(formData);
          return;
        }

        const preflight = await res.json();

        if (preflight.verdict === 'hard') {
          setHardBlockReason(
            preflight.hardBlockReason ?? 'Input cannot be used to generate a valid document.',
          );
          setPipelineState('hard_block');
          return;
        }

        if (preflight.verdict === 'soft') {
          setPreflightQuestions(preflight.questions ?? []);
          setPipelineState('soft_warn');
          return;
        }

        // verdict === 'pass' — proceed straight to generation
        await runGeneration(formData);
      } catch {
        // Fail-open: preflight network error → still generate
        await runGeneration(formData);
      }
    },
    [user, selectedConfig, runGeneration],
  );

  // ── Proceed anyway (soft-warn override) ───────────────────────────────────
  const handleProceedAnyway = useCallback(async () => {
    if (pendingFormData.current) {
      await runGeneration(pendingFormData.current);
    }
  }, [runGeneration]);

  // ── Edit form (go back from soft-warn or hard-block) ─────────────────────
  const handleEditForm = useCallback(() => {
    setPhase('form');
  }, []);

  // ── Open editor on ready ──────────────────────────────────────────────────
  const handleOpenEditor = useCallback(() => {
    if (docId) {
      router.push(`/dashboard/documents/${docId}`);
    }
  }, [docId, router]);

  // ── Auto-redirect when docId lands and state is ready ────────────────────
  useEffect(() => {
    if (pipelineState === 'ready' && docId && !error) {
      // Small delay so the ready card renders before navigating
      const t = setTimeout(() => {
        router.push(`/dashboard/documents/${docId}`);
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [pipelineState, docId, error, router]);

  // ── Render: describe-first phases (T-103) ─────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="flex items-center gap-2 py-12 text-slate-400">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }
  if (phase === 'describe') {
    return (
      <DescribeStep
        value={description}
        onChange={setDescription}
        onSubmit={handleDescribe}
        onBrowse={openGallery}
        submitting={intakeBusy}
        message={intakeMessage}
      />
    );
  }
  if (phase === 'choice') {
    return (
      <DocumentChoiceStep
        choices={choices}
        onChoose={handleChoose}
        onEditDescription={backToDescribe}
        submitting={intakeBusy}
      />
    );
  }
  if (phase === 'no_match') {
    return (
      <NoMatchStep
        description={description}
        onEditDescription={backToDescribe}
        onBrowse={openGallery}
      />
    );
  }
  if (phase === 'followup' && intake && selectedConfig) {
    return (
      <FollowUpStep
        key={`round-${intake.round}`}
        config={selectedConfig}
        questions={intake.questions}
        knownValues={intake.formData}
        round={intake.round}
        totalRounds={2}
        description={description}
        invalid={answerInvalid}
        submitting={intakeBusy}
        onSubmit={(answers) => void sendAnswers(answers, false)}
        onFillMyself={(answers) => void sendAnswers(answers, true)}
        onEditDescription={backToDescribe}
      />
    );
  }

  // ── Render: Generation phase ──────────────────────────────────────────────
  if (phase === 'generating') {
    return (
      <div>
        {error && pipelineState !== 'hard_block' && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        <PipelineStatus
          state={pipelineState}
          questions={preflightQuestions}
          hardBlockReason={hardBlockReason}
          templateName={selectedConfig?.display_name}
          sectionsCited={sectionsCited}
          paragraphCount={paragraphCount}
          warningCount={warningCount}
          onProceedAnyway={handleProceedAnyway}
          onEditForm={handleEditForm}
          onOpenEditor={handleOpenEditor}
          generationError={generationError}
          generationRetryable={generationRetryable}
          onRetry={handleRetry}
        />
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
            if (prefill) {
              backToDescribe();
              return;
            }
            setPhase('select');
            setSelectedConfig(null);
          }}
          className="mb-4 flex min-h-[44px] items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={12} />
          {prefill ? 'Edit my description' : 'Choose a different template'}
        </button>
        <DynamicFormRenderer
          key={`${selectedConfig.template_id}-${prefill ? 'intake' : 'blank'}`}
          config={selectedConfig}
          initialData={prefill ?? undefined}
          mode={prefill ? 'review' : 'steps'}
          imageFields={Object.entries(intake?.fields ?? {})
            .filter(([, v]) => v.source === 'image')
            .map(([k]) => k)}
          onValuesChange={onReviewValues}
          titleExtra={
            prefill ? (
              <button
                type="button"
                onClick={notThisDocument}
                className="text-brand-teal-dark focus-visible:ring-brand-teal min-h-[44px] text-sm underline underline-offset-2 focus:outline-none focus-visible:ring-2"
              >
                Not this document?
              </button>
            ) : undefined
          }
          onSubmit={handleSubmit}
          onCancel={() => router.push('/dashboard')}
        />
        {showPaywall && (
          <PaywallModal
            documentLabel={selectedConfig.display_name ?? 'document'}
            cost={paywallCost}
            balance={paywallBalance}
            onClose={() => setShowPaywall(false)}
          />
        )}
      </div>
    );
  }

  // ── Render: Template selection phase ──────────────────────────────────────
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">New document</h1>
        <p className="mt-1 text-sm text-slate-500">Choose a document template to get started.</p>
        {describeFirst && (
          <button
            type="button"
            onClick={backToDescribe}
            className="text-brand-teal-dark mt-2 min-h-[44px] text-sm underline underline-offset-2"
          >
            Describe your matter instead
          </button>
        )}
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
        <>
          {/* Search + category chips */}
          <div className="mb-4 space-y-3">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${templates.length} templates by name, description, or id…`}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-800 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <CategoryChip
                label="All"
                count={templates.length}
                active={categoryFilter === 'all'}
                onClick={() => setCategoryFilter('all')}
              />
              {categories.map((c) => (
                <CategoryChip
                  key={c.id}
                  label={c.id.replace(/_/g, ' ')}
                  count={c.count}
                  active={categoryFilter === c.id}
                  onClick={() => setCategoryFilter(c.id)}
                />
              ))}
            </div>
            <p className="text-xs text-slate-400">
              Showing {filteredTemplates.length} of {templates.length}
              {query && ` matching "${query}"`}
              {categoryFilter !== 'all' && ` in ${categoryFilter.replace(/_/g, ' ')}`}
            </p>
          </div>

          {filteredTemplates.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((t) => {
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
                        {t.category.replace(/_/g, ' ')}
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
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <Search size={24} className="mx-auto text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">
                No templates match {query ? `"${query}"` : 'this filter'}
                {categoryFilter !== 'all' && ` in ${categoryFilter.replace(/_/g, ' ')}`}.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setCategoryFilter('all');
                }}
                className="mt-3 text-xs font-medium text-amber-600 hover:text-amber-700"
              >
                Clear filters
              </button>
            </div>
          )}
        </>
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
