'use client';

/**
 * T-343 — privacy re-acceptance prompt (Rajesh's design, handoff/design/T-343-privacy-reaccept.md;
 * Ajay's text and rules, handoff/legal/T-343-privacy-reaccept-signed.md and its Addendum 1).
 *
 * - The default export is the dialog, mounted once in app/dashboard/layout.tsx. On mount it asks
 *   GET /api/auth/me and opens once per sign-in when the server says the user is behind AND
 *   there is a signed summary (D8). Any error from /me shows nothing (fail open).
 * - `PrivacyAcceptedStatus` is the always-present polite region for P9 (layout.tsx).
 * - Blocked actions (new drafts, user-started payments): callers use `privacyFetch` instead of
 *   `apiFetch`, return early when `isPrivacyBlocked(res)`, render `<PrivacyBlockedNotice>` above
 *   the action, and give the action `aria-describedby={usePrivacyDescribedBy(key)}`.
 *   On a 403 { error: 'privacy_reaccept_required' } it asks /me: not behind (stale token) ->
 *   /refresh and retry ONCE (Arjun, Addendum 2.2); behind -> the dialog opens again (Ajay §3).
 *
 * Nothing here logs tokens or user data.
 */
import * as Dialog from '@radix-ui/react-dialog';
import { Info, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { linkButton } from '@/components/intake/ui';
import { useAuth } from '@/context/AuthContext';
import { apiFetch, refreshAccessToken } from '@/lib/apiFetch';

// ── Ajay's signed text, byte for byte. Changes only with his sign-off. ─────────────────────────
// P1–P7: handoff/legal/T-343-privacy-reaccept-signed.md §1 (a0fc831).
// P8, P9: the same file, Addendum 1 (3b9f53d). P2 ({summary}) comes from the server (GET /me).
export const PRIVACY_PROMPT_STRINGS = {
  P1: 'We have updated our Privacy Policy',
  P3: 'Please read the updated policy. You need to accept it to create new drafts or make payments.',
  P4: 'Read the Privacy Policy',
  P5: 'Accept and continue',
  P6: 'Not now',
  P7: 'Accept the updated Privacy Policy to continue.',
  P8: 'Could not save your acceptance. Please try again.',
  P9: 'Privacy Policy accepted.',
} as const;

const PRIVACY_HREF = '/privacy';
/** Arjun, T-343: the 403 body's error code on a blocked action. */
export const PRIVACY_REACCEPT_REQUIRED = 'privacy_reaccept_required';
const SHOWN_KEY_PREFIX = 'lawie_privacy_prompt_shown:';

/** Design §4 — T-310's choiceBtn at 48 px. One class string for BOTH buttons (D2). */
const choiceBtn =
  'inline-flex min-h-[48px] w-full items-center justify-center whitespace-normal rounded-lg border-2 ' +
  'border-brand-navy bg-white px-4 py-2 text-center text-[15px] font-semibold text-brand-navy ' +
  'hover:bg-brand-page active:bg-brand-line ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 ' +
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-60 sm:min-w-[140px]';

const errorBox = 'bg-brand-error-light text-brand-error rounded-lg px-3 py-2 text-sm leading-5';

// ── Store (module level, so plain functions like privacyFetch can open the dialog) ─────────────

interface PromptState {
  open: boolean;
  /** Signed summary (P2) for the current version, from GET /me. */
  summary: string | null;
  /** The blocked action that opened the dialog, if any (shows its P7 box after Not now). */
  openedFor: string | null;
  /** Blocked actions whose P7 box is showing. */
  boxes: readonly string[];
  pending: boolean;
  /** Where the last Accept failed: P8 shows there. */
  errorAt: 'dialog' | string | null;
  /** P9 text for the polite region; cleared when the dialog next opens. */
  announcement: string;
}

let state: PromptState = {
  open: false,
  summary: null,
  openedFor: null,
  boxes: [],
  pending: false,
  errorAt: null,
  announcement: '',
};
const listeners = new Set<() => void>();
/** Element to focus when the dialog closes (the action's button, or <main>). */
let returnFocusTo: HTMLElement | null = null;
/** The button that started each blocked action; focus goes back to it after a box Accept. */
const actionTriggers = new Map<string, HTMLElement>();
/** Responses that were a privacy block; callers check isPrivacyBlocked(res). */
const blockedResponses = new WeakSet<Response>();

function setState(patch: Partial<PromptState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function usePromptState(): PromptState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

function usableSummary(summary: unknown): string | null {
  // D8: empty, missing or whitespace summary -> no prompt, even if the server said "show".
  return typeof summary === 'string' && summary.trim() ? summary : null;
}

function openPrompt(summary: string, actionKey: string | null, trigger: HTMLElement | null): void {
  returnFocusTo = trigger;
  setState({ open: true, summary, openedFor: actionKey, errorAt: null, announcement: '' });
}

function focusAfterClose(preferred: HTMLElement | null = returnFocusTo): void {
  // The dashboard's own <main> (app/layout.tsx already has a div#main for T-310), else the
  // page's <main> element.
  const target =
    preferred && preferred.isConnected
      ? preferred
      : (document.getElementById('dashboard-main') ?? document.querySelector('main'));
  returnFocusTo = null;
  target?.focus();
}

// ── sessionStorage: once per sign-in (per tab session, user and version) ──────────────────────

function shownKey(userId: string, version: string): string {
  return `${SHOWN_KEY_PREFIX}${userId}:${version}`;
}

function wasShown(userId: string, version: string): boolean {
  try {
    return sessionStorage.getItem(shownKey(userId, version)) === '1';
  } catch {
    return false;
  }
}

function markShown(userId: string, version: string): void {
  try {
    sessionStorage.setItem(shownKey(userId, version), '1');
  } catch {
    // Storage unavailable: the prompt may show again on the next page load. Harmless.
  }
}

function clearShownFlags(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(SHOWN_KEY_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    // Ignore.
  }
}

// ── Server calls ───────────────────────────────────────────────────────────────────────────────

interface PrivacyStatus {
  needsPrivacyAcceptance: boolean;
  currentPrivacyVersion: string;
  summary: string | null;
}

/** GET /api/auth/me. Null on any error (callers fail open). */
async function fetchPrivacyStatus(): Promise<PrivacyStatus | null> {
  try {
    const res = await apiFetch('/api/auth/me', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Record<string, unknown> };
    const data = body?.data;
    if (!data || typeof data.currentPrivacyVersion !== 'string') return null;
    return {
      needsPrivacyAcceptance: data.needsPrivacyAcceptance === true,
      currentPrivacyVersion: data.currentPrivacyVersion,
      summary: usableSummary(data.summary),
    };
  } catch {
    return null;
  }
}

/** One refresh through apiFetch's shared, de-duplicated refresh (no race). True on success. */
async function refreshOnce(): Promise<boolean> {
  return (await refreshAccessToken()) !== null;
}

async function isPrivacy403(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const body = (await res.clone().json()) as { error?: unknown };
    return body?.error === PRIVACY_REACCEPT_REQUIRED;
  } catch {
    return false;
  }
}

/** The server blocked the action: open the dialog if it can show, else show the P7 box. */
async function handleBlocked(actionKey: string, trigger: HTMLElement | null): Promise<void> {
  const status = await fetchPrivacyStatus();
  if (status?.summary) {
    openPrompt(status.summary, actionKey, trigger);
    return;
  }
  // No prompt can show (no summary, or /me failed), but the server still blocks: the P7 box
  // (with its own Accept) is the only way forward. Never a generic text.
  returnFocusTo = trigger;
  if (!state.boxes.includes(actionKey)) setState({ boxes: [...state.boxes, actionKey] });
}

/**
 * Like apiFetch, for a blocked action (generate, subscribe, top-up order). `actionKey` names
 * the action so its own P7 box shows. Returns the response; when it is a privacy block, the
 * prompt or box is already handled and `isPrivacyBlocked(res)` is true: return early.
 */
export async function privacyFetch(
  actionKey: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  // The pressed button, if it still has focus; <body> means none (focus then goes to <main>).
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  const trigger = active instanceof HTMLElement && active !== document.body ? active : null;

  if (trigger) actionTriggers.set(actionKey, trigger);

  const first = await apiFetch(path, init);
  if (!(await isPrivacy403(first))) return first;

  const status = await fetchPrivacyStatus();
  if (status && !status.needsPrivacyAcceptance) {
    // Stale token (issued before the user accepted, or before pv existed): refresh, retry ONCE.
    if (await refreshOnce()) {
      const retry = await apiFetch(path, init);
      if (!(await isPrivacy403(retry))) return retry;
      // A second 403 never loops: show the prompt (or the box).
      blockedResponses.add(retry);
      await handleBlocked(actionKey, trigger);
      return retry;
    }
  }

  blockedResponses.add(first);
  if (status?.needsPrivacyAcceptance && status.summary) {
    openPrompt(status.summary, actionKey, trigger);
  } else {
    await handleBlocked(actionKey, trigger);
  }
  return first;
}

/**
 * Before a blocked action changes the screen (T-343 round 5): ask /me and, when the user is
 * behind and a signed summary exists, open the prompt and return true so the caller stays put
 * (no form is unmounted). Any /me error returns false (fail open); the server's 403, handled by
 * privacyFetch, stays the fallback.
 */
export async function privacyPrecheck(actionKey: string): Promise<boolean> {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  const trigger = active instanceof HTMLElement && active !== document.body ? active : null;
  const status = await fetchPrivacyStatus();
  if (!status?.needsPrivacyAcceptance || !status.summary) return false;
  if (trigger) actionTriggers.set(actionKey, trigger);
  openPrompt(status.summary, actionKey, trigger);
  return true;
}

/** True when privacyFetch handled this response as a privacy block. */
export function isPrivacyBlocked(res: Response): boolean {
  return blockedResponses.has(res);
}

/** P7 box id for an action; put it in the action's aria-describedby. */
function boxId(actionKey: string): string {
  return `reaccept-p7-${actionKey}`;
}

/** aria-describedby value for a blocked action's button while its P7 box shows. */
export function usePrivacyDescribedBy(actionKey: string): string | undefined {
  const s = usePromptState();
  return s.boxes.includes(actionKey) ? boxId(actionKey) : undefined;
}

// ── Accept: one handler wherever it is pressed (dialog or box) ───────────────────────────────

function useAccept(): (where: 'dialog' | string) => Promise<void> {
  const { login } = useAuth();
  return useCallback(
    async (where: 'dialog' | string) => {
      if (state.pending) return;
      setState({ pending: true, errorAt: null });
      try {
        const res = await apiFetch('/api/auth/me/privacy-acceptance', { method: 'POST' });
        if (!res.ok) throw new Error('accept failed');
        const body = (await res.json()) as {
          data?: { accessToken?: unknown; refreshToken?: unknown };
        };
        const access = body?.data?.accessToken;
        const refresh = body?.data?.refreshToken;
        if (typeof access !== 'string' || typeof refresh !== 'string') {
          throw new Error('accept failed');
        }
        login(access, refresh);
        // Success: dialog closes, every P7 box goes, P9 is announced. The blocked action is not
        // re-run; the user presses it again.
        setState({
          pending: false,
          open: false,
          openedFor: null,
          boxes: [],
          errorAt: null,
          announcement: PRIVACY_PROMPT_STRINGS.P9,
        });
        // Box Accept: the box's own button is gone; focus the blocked action's button.
        if (where !== 'dialog') focusAfterClose(actionTriggers.get(where) ?? null);
      } catch {
        setState({ pending: false, errorAt: where });
      }
    },
    [login],
  );
}

function Spinner() {
  return (
    <Loader2 size={16} aria-hidden="true" className="mr-2 shrink-0 motion-safe:animate-spin" />
  );
}

// ── P9 region (always in the DOM, in layout.tsx) ─────────────────────────────────────────────

export function PrivacyAcceptedStatus() {
  const s = usePromptState();
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {s.announcement}
    </div>
  );
}

// ── P7 box, above a blocked action ───────────────────────────────────────────────────────────

export function PrivacyBlockedNotice({ actionKey }: { actionKey: string }) {
  const s = usePromptState();
  const accept = useAccept();
  if (!s.boxes.includes(actionKey)) return null;
  const pending = s.pending;
  return (
    <div className="bg-brand-gold-light border-brand-gold-dark text-brand-navy mb-2 flex items-start gap-2 rounded-lg border-l-4 px-3 py-3 text-sm leading-5">
      <Info size={16} aria-hidden="true" className="text-brand-gold-dark mt-0.5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p id={boxId(actionKey)} role="status">
          {PRIVACY_PROMPT_STRINGS.P7}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Link href={PRIVACY_HREF} className={linkButton}>
            {PRIVACY_PROMPT_STRINGS.P4}
          </Link>
          <button
            type="button"
            className={`${choiceBtn} sm:w-auto`}
            aria-disabled={pending || undefined}
            onClick={() => {
              if (!pending) void accept(actionKey);
            }}
          >
            {pending && <Spinner />}
            {PRIVACY_PROMPT_STRINGS.P5}
          </button>
        </div>
        {s.errorAt === actionKey && (
          <p role="alert" className={errorBox}>
            {PRIVACY_PROMPT_STRINGS.P8}
          </p>
        )}
      </div>
    </div>
  );
}

// ── The dialog (mounted once in dashboard/layout.tsx) ────────────────────────────────────────

export default function PrivacyUpdatePrompt() {
  const { user, isLoading } = useAuth();
  const s = usePromptState();
  const accept = useAccept();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const userId = user?.id ?? null;

  // Signed out: forget "shown this sign-in", so the next sign-in in this tab prompts again.
  // Not while AuthProvider is still reading the token (a reload starts with no user).
  useEffect(() => {
    if (!isLoading && !userId) clearShownFlags();
  }, [isLoading, userId]);

  // Once per sign-in: ask the server, open only if behind AND there is a signed summary.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const status = await fetchPrivacyStatus();
      if (cancelled || !status) return; // fail open
      if (!status.needsPrivacyAcceptance || !status.summary) return;
      if (wasShown(userId, status.currentPrivacyVersion)) return;
      markShown(userId, status.currentPrivacyVersion);
      if (!state.open) openPrompt(status.summary, null, null);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const notNow = useCallback(() => {
    if (state.pending) return;
    const key = state.openedFor;
    setState({
      open: false,
      openedFor: null,
      errorAt: null,
      boxes: key && !state.boxes.includes(key) ? [...state.boxes, key] : state.boxes,
    });
  }, []);

  const summary = usableSummary(s.summary);
  if (!userId || !summary) return null; // D8

  const pending = s.pending;

  return (
    <>
      {/* Design §7: keyframes here (house pattern, as PipelineStatus); motion-safe only. */}
      <style>{`
        @keyframes reaccept-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes reaccept-in { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: none } }
        @media (min-width: 640px) {
          @keyframes reaccept-in { from { opacity: 0; transform: translate(-50%, 16px) } to { opacity: 1; transform: translate(-50%, 0) } }
        }
      `}</style>
      <Dialog.Root
        open={s.open}
        onOpenChange={(o) => {
          if (!o) notNow(); // D5: Esc = Not now
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="bg-brand-navy/55 fixed inset-0 z-[60] motion-safe:animate-[reaccept-fade_150ms_ease-out]" />
          <Dialog.Content
            aria-busy={pending}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              titleRef.current?.focus(); // D4
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              focusAfterClose();
            }}
            onPointerDownOutside={(e) => e.preventDefault()} // D5: overlay does nothing
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => {
              if (state.pending) e.preventDefault(); // Esc ignored mid-request
            }}
            className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[max(88vh,12rem)] flex-col rounded-t-2xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] motion-safe:animate-[reaccept-in_200ms_ease-out] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[14vh] sm:max-h-[max(80vh,12rem)] sm:w-[480px] sm:-translate-x-1/2 sm:rounded-2xl sm:p-7"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              <Dialog.Title asChild>
                <h2
                  ref={titleRef}
                  tabIndex={-1}
                  className="font-heading text-brand-navy text-xl font-semibold leading-7 focus:outline-none sm:text-2xl sm:leading-8"
                >
                  {PRIVACY_PROMPT_STRINGS.P1}
                </h2>
              </Dialog.Title>
              <Dialog.Description asChild>
                <div className="flex flex-col gap-3">
                  <p className="text-brand-navy text-[15px] font-medium leading-6">{summary}</p>
                  <p className="text-brand-navy text-[15px] leading-6">
                    {PRIVACY_PROMPT_STRINGS.P3}
                  </p>
                </div>
              </Dialog.Description>
              <Link href={PRIVACY_HREF} className={linkButton}>
                {PRIVACY_PROMPT_STRINGS.P4}
              </Link>
            </div>
            {s.errorAt === 'dialog' && (
              <p role="alert" className={`mt-4 shrink-0 ${errorBox}`}>
                {PRIVACY_PROMPT_STRINGS.P8}
              </p>
            )}
            {/* auto-rows-fr: equal button heights when stacked and a label wraps (200% zoom). */}
            <div className="mt-5 grid shrink-0 auto-rows-fr grid-cols-1 gap-3 sm:ml-auto sm:grid-cols-2">
              <button
                type="button"
                className={choiceBtn}
                aria-disabled={pending || undefined}
                onClick={notNow}
              >
                {PRIVACY_PROMPT_STRINGS.P6}
              </button>
              <button
                type="button"
                className={choiceBtn}
                aria-disabled={pending || undefined}
                onClick={() => {
                  if (!pending) void accept('dialog');
                }}
              >
                {pending && <Spinner />}
                {PRIVACY_PROMPT_STRINGS.P5}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
