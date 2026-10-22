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
 * The one drafting flow (T-125, ADR-021), when `feature.describe_first` is on
 * for this user: the page hands over to `OneFlow` — describe, a few
 * questions, a brief the advocate confirms, the draft. No form.
 *
 * While the switch is off the page still shows the list and the long form
 * above, so that a user without the switch can make a document. The review
 * screen (T-104) and the questions built from form fields (T-102) are gone.
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
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PaywallModal } from '@/components/credits/PaywallModal';
import PipelineStatus, {
  type GenerationFailure,
  PipelineState,
} from '@/components/draft/PipelineStatus';
import DynamicFormRenderer, { type FormSnapshot } from '@/components/form/DynamicFormRenderer';
// T-565 W7: the plan gate's 403 test (shared with OneFlow); the server's text is never shown.
import { isPlanGate } from '@/components/intake/generationFailure';
import { takeDraftPrefill } from '@/components/intake/initialQuery';
import { NOT_STARTED_LINE, inkCostState } from '@/components/intake/InkCostLine';
import { inkLevelFrom } from '@/components/intake/inkLevel';
import OneFlow from '@/components/intake/OneFlow';
import {
  PrivacyBlockedNotice,
  isPrivacyBlocked,
  privacyFetch,
  privacyPrecheck,
  usePrivacyDescribedBy,
} from '@/components/PrivacyUpdatePrompt';
import {
  openVerifyIfDraftRefused,
  openVerifyInsteadOfPaywall,
} from '@/components/VerifyEmailPrompt';
import { useAuth } from '@/context/AuthContext';
import { useCredits } from '@/hooks/useCredits';
import { apiFetch } from '@/lib/apiFetch';

// ── Types ───────────────────────────────────────────────────────────────────

interface TemplateSummary {
  template_id: string;
  display_name: string;
  category: string;
  /** T-240: library category id, display name and T-239 order (from the service). */
  catalogueCategory: string;
  catalogueCategoryName: string;
  catalogueCategoryOrder: number;
  description: string;
  icon: string;
  plan_access: 'free' | 'pro';
  supported_languages: string[];
  /** T-372 / T-388: what a draft of this template charges, from the service's price function. */
  credits_cost?: number;
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

// Colours cycle by the catalogue category's T-239 order (T-240), so a new
// category needs no edit here.
const CATEGORY_PALETTE: { color: string; border: string }[] = [
  { color: 'text-blue-500', border: 'border-t-blue-400' },
  { color: 'text-green-500', border: 'border-t-green-400' },
  { color: 'text-purple-500', border: 'border-t-purple-400' },
  { color: 'text-rose-500', border: 'border-t-rose-400' },
  { color: 'text-amber-500', border: 'border-t-amber-400' },
  { color: 'text-teal-500', border: 'border-t-teal-400' },
];

function categoryColors(order: number): { color: string; border: string } {
  return CATEGORY_PALETTE[(Math.max(order, 1) - 1) % CATEGORY_PALETTE.length];
}

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
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
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
  // T-365 AC5: "Use template →" in the library links here with ?kind=<template_id>.
  const initialKind = useSearchParams().get('kind') ?? undefined;
  // T-521 (Rajesh): the generating inkwell shows the real Ink level, as the dashboard does.
  const { balance: inkBalance, loaded: inkLoaded } = useCredits();
  const inkLevel = inkLevelFrom({
    loaded: inkLoaded,
    totalInk: inkBalance.totalInk,
    monthlyAllotment: inkBalance.inkSubMonthlyAllotment,
  });
  const { user } = useAuth();
  const privacyDescribedBy = usePrivacyDescribedBy('generate'); // T-343

  // Phase: the one flow when the switch is on; otherwise select → form → generating
  const [phase, setPhase] = useState<'loading' | 'one_flow' | 'select' | 'form' | 'generating'>(
    'loading',
  );

  // Template list + selected config
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [guidedInkCost, setGuidedInkCost] = useState<number | undefined>(); // T-372
  // T-388: the template-configs fetch (which carries the Ink costs) is in flight.
  const [inkCostLoading, setInkCostLoading] = useState(true);
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
  // T-565 W1/W3: which signed failure the card shows (not started / request failed / stream).
  const [generationFailure, setGenerationFailure] = useState<GenerationFailure>('stream');
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
  // T-432: the form's answers, step and Commission level, kept so that every
  // return to the form (privacy block, paywall, verify-email bounce, "Edit
  // form") shows it as the advocate left it. In memory only, like OneFlow:
  // never written to browser storage. Dropped on a template change, on
  // Cancel, and once a draft is written.
  const formSnapshot = useRef<(FormSnapshot & { templateId: string }) | null>(null);
  // T-565 W8: set by "Try again" on the not-started card (the cost is unknown): draft once the
  // cost is known. Cleared by every path that leaves that card or drops the answers, so a cost
  // that resolves later can never start (and charge) a draft the advocate has walked away from.
  const [retryWhenCostKnown, setRetryWhenCostKnown] = useState(false);
  const clearFormAnswers = useCallback(() => {
    formSnapshot.current = null;
    pendingFormData.current = null;
    setRetryWhenCostKnown(false);
  }, []);

  // ── Search + filter pipeline ──────────────────────────────────────────────
  // Catalogue categories (T-240) with counts, derived from the live template
  // list in T-239 order. Only categories that have a template get a chip.
  const categories = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; order: number; count: number }>();
    for (const t of templates) {
      const c = byId.get(t.catalogueCategory) ?? {
        id: t.catalogueCategory,
        name: t.catalogueCategoryName,
        order: t.catalogueCategoryOrder,
        count: 0,
      };
      c.count += 1;
      byId.set(t.catalogueCategory, c);
    }
    return Array.from(byId.values()).sort((a, b) => a.order - b.order);
  }, [templates]);

  const categoryFilterName =
    categories.find((c) => c.id === categoryFilter)?.name ?? categoryFilter;

  // Filter pipeline: category first, then case-insensitive substring on
  // display_name + description + template_id. Cheap enough at 92 rows; revisit
  // if we ever cross ~500 templates.
  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (categoryFilter !== 'all' && t.catalogueCategory !== categoryFilter) return false;
      if (!q) return true;
      return (
        t.display_name.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q) ||
        t.template_id.toLowerCase().includes(q)
      );
    });
  }, [templates, query, categoryFilter]);

  // ── Fetch template list on mount ──────────────────────────────────────────
  // T-388: also the "Check the cost again" link under an unknown Ink cost (`initial` false),
  // which fetches the costs again without touching the page's error line.
  const fetchTemplates = useCallback(async (initial: boolean) => {
    setInkCostLoading(true);
    try {
      const res = await apiFetch('/api/documents/template-configs');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates ?? []);
        setGuidedInkCost(data.guided_credits_cost);
      } else if (initial) {
        if (res.status === 503) {
          setError('Service temporarily unavailable. Please try again in a moment.');
        } else {
          setError('Failed to load templates. Please refresh the page.');
        }
      }
      // A retry that fails leaves the cost unknown; the notice under the button says so.
    } catch {
      if (initial) setError('Could not connect to Lawie. Check your connection and refresh.');
    } finally {
      setInkCostLoading(false);
      if (initial) setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    void fetchTemplates(true);
  }, [fetchTemplates]);

  const retryInkCost = useCallback(() => {
    void fetchTemplates(false);
  }, [fetchTemplates]);

  // T-388: what a draft of the selected template charges; the same number the
  // service charges (template-configs credits_cost, from costForTemplate).
  const templateInkCost = templates.find(
    (t) => t.template_id === selectedConfig?.template_id,
  )?.credits_cost;
  const templateInkCostKnown = inkCostState(templateInkCost, inkCostLoading) === 'known';

  // ── Select a template → fetch full config ─────────────────────────────────
  const handleSelectTemplate = useCallback(
    async (templateId: string) => {
      clearFormAnswers(); // T-432: a new template starts empty.
      setLoadingConfig(true);
      try {
        const res = await apiFetch(`/api/documents/template-configs/${templateId}`);
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
    [clearFormAnswers],
  );

  // ── Is the one flow switched on for this user? (ADR-021 §3.11) ────────────
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/documents/intake/enabled')
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .catch(() => ({ enabled: false }))
      .then((d: { enabled?: boolean }) => {
        if (cancelled) return;
        // T-565 item 40: the form flow has no describe step, so the command bar's matter text
        // is read once and dropped here (OneFlow reads and clears it itself when it is on).
        if (d.enabled !== true) takeDraftPrefill();
        setPhase((p) => (p === 'loading' ? (d.enabled === true ? 'one_flow' : 'select') : p));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── SSE generation stream ─────────────────────────────────────────────────
  const runGeneration = useCallback(
    async (formData: Record<string, unknown>) => {
      if (!selectedConfig) return;
      // T-388 (Arjun): nothing that charges starts while the cost is not known.
      // Every caller ends here, including the fail-open preflight paths. The
      // advocate stays on this screen and sees the notice here ("Edit form"
      // goes back to the form with the answers kept, T-432). "Try again" here
      // fetches the cost again and then drafts from the saved inputs (T-565 W8:
      // the card shows no unknown-cost notice).
      if (!templateInkCostKnown) {
        setGenerationError(NOT_STARTED_LINE);
        setGenerationRetryable(true);
        // T-565 W1: nothing was sent; the card says `The draft could not start.` alone.
        setGenerationFailure('not_started');
        setPipelineState('generation_failed');
        return;
      }

      setPipelineState('drafting');
      setError('');
      setGenerationError(undefined);
      setGenerationRetryable(true);
      setGenerationFailure('stream');

      // Priya: set once the first stream data arrives. A failure before that shows the
      // request-failed card (`Retry`); after it, the stream card (the draft did not finish).
      // Once the 200 headers are in, the server may already hold Ink even before the first
      // chunk. That is safe: X-Run-Id is read before the body, and Retry resends that run_id,
      // so the server continues the same run or answers 409 (the in_progress card). Retry must
      // therefore NOT become a fresh run: never clear lastRunId on this path.
      let streamDataSeen = false;
      try {
        const res = await privacyFetch('generate', '/api/documents/generate-from-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_id: selectedConfig.template_id,
            form_data: formData,
            ...(lastRunId.current ? { run_id: lastRunId.current } : {}),
          }),
        });
        // T-343: privacy re-acceptance needed; the prompt or P7 box is shown. Back to the form.
        if (isPrivacyBlocked(res)) return setPhase('form');

        // The server always resolves a run (new or continued) before it
        // starts streaming, so the header is there whether this attempt
        // succeeds or fails — the authoritative source, read before the body.
        const runIdHeader = res.headers.get('X-Run-Id');
        if (runIdHeader) lastRunId.current = runIdHeader;

        // T-522 (AJ-522-M6): an unverified email account. The Draft dialog opens now, over the
        // form with the answers kept; no redirect, and the Generate button stays enabled.
        if (await openVerifyIfDraftRefused(res)) {
          setPhase('form');
          return;
        }

        if (!res.ok) {
          let reason = 'Generation could not start.';
          let paywallInfo: { cost: number; balance: number } | null = null;
          let errorBody: unknown = null;
          try {
            const data = await res.json();
            errorBody = data;
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
          // T-223 trigger 2: an unverified email user gets the verify modal, not the paywall.
          if (res.status === 402 && (await openVerifyInsteadOfPaywall())) {
            setPhase('form');
            return;
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
          // T-565 W3/W6/W7 (Ajay): the privacy gate's 403 returned above (its T-343 prompt shows
          // on the form) and an unverified user's 402 opened the verify modal. The reason is
          // never shown.
          //   409 (the Ink hold: a draft for this run is already in progress) → the documents-list
          //     line, no Retry.
          //   403 from the plan gate → `This document is not available on your current plan.`,
          //     no Retry.
          //   Every other non-OK status (any 3xx/4xx/5xx, including a 401 after the fetch
          //     helper's token refresh and a 402 with no paywall data) → `Something did not
          //     work. Try again.` + Retry: the start was refused, so no draft started (Priya).
          if (res.status === 409) {
            setGenerationFailure('in_progress');
            setGenerationRetryable(false);
          } else if (res.status === 403 && isPlanGate(errorBody)) {
            setGenerationFailure('plan_required');
            setGenerationRetryable(false);
          } else {
            setGenerationFailure('request_failed');
            setGenerationRetryable(true);
          }
          setPipelineState('generation_failed');
          return;
        }

        if (!res.body) {
          setGenerationError('The drafting service returned no response body. Please try again.');
          // No stream, so no draft started (Priya): the request-failed card with Retry.
          setGenerationFailure('request_failed');
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
          if (value && value.length > 0) streamDataSeen = true;

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
        // T-432: the draft is written; the typed answers are no longer held.
        clearFormAnswers();
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
        // Priya: a request or read that failed before any stream data → request-failed card.
        // Ink may already be held (headers in, no chunk yet); Retry resends lastRunId, so it
        // continues the same run or gets a 409. Do not clear lastRunId here.
        if (!streamDataSeen) setGenerationFailure('request_failed');
        setGenerationRetryable(true);
        setPipelineState('generation_failed');
      }
    },
    [selectedConfig, templateInkCostKnown, clearFormAnswers],
  );

  // ── Retry handler (generation_failed card) ────────────────────────────────
  // T-565 W8 (Ajay): on the not-started card (the cost is unknown) "Try again" fetches the
  // cost again and drafts once it is known; the unknown-cost notice is not on that card.
  const handleRetry = useCallback(async () => {
    if (!pendingFormData.current) return;
    if (!templateInkCostKnown) {
      setRetryWhenCostKnown(true);
      retryInkCost();
      return;
    }
    await runGeneration(pendingFormData.current);
  }, [runGeneration, templateInkCostKnown, retryInkCost]);
  useEffect(() => {
    if (!retryWhenCostKnown || inkCostLoading) return;
    // Cleared before anything else, so this fires at most once per click.
    setRetryWhenCostKnown(false);
    // Only from the not-started card the advocate is still looking at; anywhere else (the
    // form, another card) nothing is sent.
    if (
      phase !== 'generating' ||
      pipelineState !== 'generation_failed' ||
      generationFailure !== 'not_started'
    ) {
      return;
    }
    // Still unknown: the not-started card stays, with its "Try again".
    if (templateInkCostKnown && pendingFormData.current) {
      void runGeneration(pendingFormData.current);
    }
  }, [
    retryWhenCostKnown,
    inkCostLoading,
    templateInkCostKnown,
    runGeneration,
    phase,
    pipelineState,
    generationFailure,
  ]);

  // ── Submit form → preflight first ────────────────────────────────────────
  const handleSubmit = useCallback(
    async (formData: Record<string, unknown>) => {
      if (!user || !selectedConfig) return;
      // T-388: an unknown cost blocks before the preflight. "Generate document"
      // is off then and the notice is under it (DynamicFormRenderer).
      if (!templateInkCostKnown) return;
      // T-343: ask before leaving the form, so a privacy block never unmounts (empties) it.
      if (await privacyPrecheck('generate')) return;

      // A fresh submit (not the retry button) means the form changed —
      // T-003 §3.8 has the web page drop the stored run id so this starts a
      // new run instead of continuing a failed one.
      lastRunId.current = undefined;
      pendingFormData.current = formData;
      setRetryWhenCostKnown(false); // T-565 W8: a new run drops any pending not-started retry.
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

        // T-522 (AJ-522-M6): the preflight is fenced too. Same dialog, back on the form.
        if (await openVerifyIfDraftRefused(res)) {
          setPhase('form');
          return;
        }

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
    [user, selectedConfig, runGeneration, templateInkCostKnown],
  );

  // ── Proceed anyway (soft-warn override) ───────────────────────────────────
  const handleProceedAnyway = useCallback(async () => {
    if (pendingFormData.current) {
      await runGeneration(pendingFormData.current);
    }
  }, [runGeneration]);

  // ── Edit form (go back from soft-warn or hard-block) ─────────────────────
  // T-432: the form is shown again from formSnapshot, so nothing is lost.
  const handleEditForm = useCallback(() => {
    // T-565 W8: a pending "Try again" from the not-started card is dropped, so nothing drafts
    // (or holds Ink) while the advocate is on the form.
    setRetryWhenCostKnown(false);
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

  // ── Render: loading, then the one flow when it is switched on ─────────────
  if (phase === 'loading') {
    return (
      <div className="flex items-center gap-2 py-12 text-slate-400">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }
  if (phase === 'one_flow') {
    return (
      <OneFlow
        kinds={templates}
        loadingKinds={loadingTemplates}
        guidedInkCost={guidedInkCost}
        inkCostLoading={inkCostLoading}
        onInkCostRetry={retryInkCost}
        initialKind={initialKind}
        inkLevel={inkLevel}
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
          generationFailure={generationFailure}
          onRetry={handleRetry}
          inkCost={templateInkCost}
          inkCostLoading={inkCostLoading}
          onInkCostRetry={retryInkCost}
          templateId={selectedConfig?.template_id}
        />
      </div>
    );
  }

  // ── Render: Form phase ────────────────────────────────────────────────────
  if (phase === 'form' && selectedConfig) {
    // T-432: seed the form from the last snapshot of this template, if any.
    const seed =
      formSnapshot.current?.templateId === selectedConfig.template_id ? formSnapshot.current : null;
    const templateIdForSnapshot: string = selectedConfig.template_id;
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            clearFormAnswers(); // T-432
            setPhase('select');
            setSelectedConfig(null);
          }}
          className="mb-4 flex min-h-[44px] items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={12} />
          Choose a different template
        </button>
        <PrivacyBlockedNotice actionKey="generate" />
        <DynamicFormRenderer
          key={selectedConfig.template_id}
          config={selectedConfig}
          onSubmit={handleSubmit}
          onCancel={() => {
            clearFormAnswers(); // T-432
            router.push('/dashboard');
          }}
          submitDescribedBy={privacyDescribedBy}
          inkCost={templateInkCost}
          inkCostLoading={inkCostLoading}
          onInkCostRetry={retryInkCost}
          templateId={selectedConfig.template_id}
          initialValues={seed?.values}
          initialStep={seed?.step}
          initialLevel={seed?.level}
          onStateChange={(values, step, level) => {
            formSnapshot.current = { templateId: templateIdForSnapshot, values, step, level };
          }}
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
                  label={c.name}
                  count={c.count}
                  active={categoryFilter === c.id}
                  onClick={() => setCategoryFilter(c.id)}
                />
              ))}
            </div>
            <p className="text-xs text-slate-400">
              Showing {filteredTemplates.length} of {templates.length}
              {query && ` matching "${query}"`}
              {categoryFilter !== 'all' && ` in ${categoryFilterName}`}
            </p>
          </div>

          {filteredTemplates.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((t) => {
                const Icon = ICON_MAP[t.icon] ?? FileText;
                const colors = categoryColors(t.catalogueCategoryOrder);

                return (
                  <button
                    key={t.template_id}
                    onClick={() => handleSelectTemplate(t.template_id)}
                    disabled={loadingConfig}
                    className={`rounded-xl border border-t-[3px] border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md ${colors.border} disabled:opacity-50`}
                  >
                    <Icon size={18} className={colors.color} />
                    <p className="mt-2 text-sm font-semibold text-slate-800">{t.display_name}</p>
                    {t.description && (
                      <p className="mt-0.5 text-xs text-slate-400">{t.description}</p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                        {t.catalogueCategoryName}
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
                {categoryFilter !== 'all' && ` in ${categoryFilterName}`}.
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
          <p className="mt-2 text-sm text-slate-500">No templates available yet.</p>
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
