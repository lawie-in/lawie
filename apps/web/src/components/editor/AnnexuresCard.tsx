'use client';

/**
 * T-381 — the Annexures card on the document page. One button calls
 * POST /api/documents/:id/annexures-pack and offers the one PDF it returns
 * (the 7 annexures). Spec: handoff/marketing/annexures-button-spec-t381.md.
 *
 * States: idle, loading, success (one download), party details missing (422),
 * error (with retry). Nothing is stored: each press makes a fresh pack, and a
 * reload returns to idle (Priya, call 5). No cost, no "free" wording, no
 * disclaimer banner (Ajay; the files carry the T-317 annexure footer).
 * The T-194 blanks check for the pack is deferred (Ajay, Addendum 2; T-420).
 */

import { AlertTriangle, Check, Download, FileText, Loader2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { downloadBlob, filenameFromDisposition } from '@/components/editor/exportUtils';
import { linkButton, secondaryButton } from '@/components/intake/ui';
import { Button } from '@/components/ui';
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Strings. All signed word for word by Ajay (handoff/legal/T-381-annexures-button-signed.md):
 * Addendum 2 for button, button_help, success_title, success_note and download; 7b23de4 for
 * the rest, with his edits to loading and error. Do not reword without his sign-off.
 */
export const ANNEX_STRINGS = {
  region_label: 'Annexures',
  button: 'Create annexures',
  button_help: 'Prepared from the details you entered.',
  loading: 'Preparing your annexures…',
  success_title: 'Annexures created',
  success_note: 'Check each annexure and fill in every blank line before filing.',
  download: 'Download annexures (PDF)',
  error: "We couldn't create the annexures. Please try again.",
  retry: 'Try again',
  missing_title: 'Party details are missing',
  missing_body: 'Add the names and roles of the parties to this draft, then try again.',
  /** `{what}` is one of MISSING_WHAT, joined with "and". */
  missing_named: 'Add {what} to this draft, then try again.',
} as const;

/** The fields the route can list as missing (422 party_details_missing), and how the card names them. */
export const MISSING_WHAT = {
  client_role: "the client's role",
  client_name: "the client's name",
  opposite_party_name: "the opposite party's name",
} as const;

export type MissingField = keyof typeof MISSING_WHAT;

function isMissingField(v: unknown): v is MissingField {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(MISSING_WHAT, v);
}

/** The order the missing items are named in: role, client's name, opposite party's name. */
const MISSING_ORDER: readonly MissingField[] = [
  'client_role',
  'client_name',
  'opposite_party_name',
];

/**
 * The missing-details line: names each field the route listed, in MISSING_ORDER,
 * joined with "and" (Ajay, Addendum 4), or the generic line when none is named.
 */
export function missingLine(missing: readonly MissingField[]): string {
  const what = MISSING_ORDER.filter((f) => missing.includes(f)).map((f) => MISSING_WHAT[f]);
  if (what.length === 0) return ANNEX_STRINGS.missing_body;
  return ANNEX_STRINGS.missing_named.replace('{what}', what.join(' and '));
}

/**
 * Whether the page shows the card: a court document (not one of the 32
 * not_court_documents) with at least one party. Both flags come from
 * GET /api/documents/:id; the card is hidden when either is absent.
 */
export function annexuresCardVisible(doc: {
  courtDocument?: boolean | null;
  hasParty?: boolean | null;
}): boolean {
  return doc.courtDocument === true && doc.hasParty === true;
}

type CardState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; blob: Blob; filename: string }
  | { kind: 'missing'; missing: MissingField[] }
  | { kind: 'error' };

interface AnnexuresCardProps {
  docId: string;
  /** The document title, for the file name when the server sends none. */
  title: string;
}

export default function AnnexuresCard({ docId, title }: AnnexuresCardProps) {
  const [state, setState] = useState<CardState>({ kind: 'idle' });
  const busy = useRef(false);
  const titleId = useId();
  const helpId = useId();
  const missingTitleRef = useRef<HTMLHeadingElement | null>(null);
  const retryRef = useRef<HTMLButtonElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // After "missing details", focus its title so the line is read; after an error,
  // focus the retry. After success, focus stays where it was (the button).
  useEffect(() => {
    if (state.kind === 'missing') missingTitleRef.current?.focus();
    if (state.kind === 'error') retryRef.current?.focus();
  }, [state.kind]);

  const createPack = async () => {
    // A second press while loading is ignored (the button stays focusable).
    if (busy.current) return;
    const token = getAccessToken();
    if (!token) {
      setState({ kind: 'error' });
      return;
    }
    busy.current = true;
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`${API_URL}/api/documents/${docId}/annexures-pack`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 422) {
        const body: unknown = await res.json().catch(() => null);
        const data = (body ?? {}) as { error?: unknown; missing?: unknown };
        if (data.error === 'party_details_missing') {
          const missing = Array.isArray(data.missing) ? data.missing.filter(isMissingField) : [];
          setState({ kind: 'missing', missing });
          return;
        }
        setState({ kind: 'error' });
        return;
      }

      if (!res.ok) {
        setState({ kind: 'error' });
        return;
      }

      const blob = await res.blob();
      const fallback = `${title.replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 60)}_annexures.pdf`;
      const filename = filenameFromDisposition(res.headers.get('Content-Disposition'), fallback);
      setState({ kind: 'success', blob, filename });
    } catch (err) {
      // The error name only, never the draft's content.
      console.error('[annexures-pack] failed:', err instanceof Error ? err.name : 'error');
      setState({ kind: 'error' });
    } finally {
      busy.current = false;
    }
  };

  // The alert row (and its retry) unmounts while the pack is made, so focus moves
  // to the card's button first instead of dropping to <body> (as T-233).
  const handleRetry = () => {
    if (busy.current) return;
    buttonRef.current?.focus();
    void createPack();
  };

  const loading = state.kind === 'loading';

  // The live region's text: loading, success and missing details are announced here.
  const status =
    state.kind === 'loading'
      ? ANNEX_STRINGS.loading
      : state.kind === 'success'
        ? ANNEX_STRINGS.success_title
        : state.kind === 'missing'
          ? `${ANNEX_STRINGS.missing_title}. ${missingLine(state.missing)}`
          : '';

  return (
    // T-578 (Rajesh's note §2.4-5, layout only): below lg one 44px row (Card fill, Control Line
    // border) with a ghost button on the right; from lg the same row stacked at the top of the
    // right rail. The states open under the row on action only. Strings and role unchanged.
    <div
      role="region"
      aria-labelledby={titleId}
      className="bg-nl-card text-nl-text rounded-nl-md px-nl-3 lg:py-nl-3 border border-[color:var(--line-control)]"
    >
      <div className="gap-nl-3 lg:gap-nl-2 flex min-h-[42px] items-center lg:flex-col lg:items-stretch">
        <div className="gap-x-nl-3 lg:gap-nl-1 flex min-w-0 flex-1 flex-wrap items-center lg:flex-col lg:items-start">
          <h2
            id={titleId}
            className="gap-nl-2 flex shrink-0 items-center text-[14px] font-medium leading-5"
          >
            <FileText size={16} aria-hidden="true" />
            {ANNEX_STRINGS.region_label}
          </h2>
          {/* Below 640px (sm) the line is hidden and only read as the button's description. */}
          <p id={helpId} className="text-nl-muted text-[13px] leading-5 max-[639px]:hidden">
            {ANNEX_STRINGS.button_help}
          </p>
        </div>
        <Button
          ref={buttonRef}
          variant="ghost"
          size="sm"
          onClick={() => void createPack()}
          aria-busy={loading}
          aria-disabled={loading}
          aria-describedby={helpId}
          className="shrink-0 aria-disabled:cursor-default aria-disabled:opacity-60 lg:h-11 lg:w-full"
        >
          {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {loading ? ANNEX_STRINGS.loading : ANNEX_STRINGS.button}
        </Button>
      </div>

      {state.kind === 'success' && (
        <div className="mt-nl-2 pb-nl-3 space-y-3 lg:pb-0">
          <div className="bg-brand-teal-light text-brand-teal-dark rounded-lg px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Check size={16} aria-hidden="true" />
              {ANNEX_STRINGS.success_title}
            </p>
            <p className="mt-1 text-sm">{ANNEX_STRINGS.success_note}</p>
          </div>
          {/* The file needs the user's token, so it was fetched; this button saves it. */}
          <button
            type="button"
            onClick={() => downloadBlob(state.blob, state.filename)}
            className={`${secondaryButton} w-full lg:w-auto`}
          >
            <Download size={16} aria-hidden="true" />
            {ANNEX_STRINGS.download}
          </button>
        </div>
      )}

      {state.kind === 'missing' && (
        <div className="border-brand-gold bg-brand-gold-light text-brand-gold-dark mb-nl-3 mt-nl-2 rounded-lg border px-3 py-2 lg:mb-0">
          <h3
            ref={missingTitleRef}
            tabIndex={-1}
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <AlertTriangle size={16} aria-hidden="true" />
            {ANNEX_STRINGS.missing_title}
          </h3>
          <p className="mt-1 text-sm">{missingLine(state.missing)}</p>
        </div>
      )}

      {/* One live region, in the DOM from the start (as the verify prompt, T-223). */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {status}
      </div>

      {/* Errors go to their own alert node, with the retry in the same row (as T-233). */}
      <div role="alert">
        {state.kind === 'error' && (
          <div className="bg-brand-error-light text-brand-error mb-nl-3 mt-nl-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 lg:mb-0">
            <AlertTriangle size={16} className="flex-shrink-0" aria-hidden="true" />
            <p className="flex-1 text-sm">{ANNEX_STRINGS.error}</p>
            <button
              ref={retryRef}
              type="button"
              onClick={handleRetry}
              className={`${linkButton} !text-brand-error font-semibold`}
            >
              {ANNEX_STRINGS.retry}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
