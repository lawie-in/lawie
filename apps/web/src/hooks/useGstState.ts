'use client';

/**
 * T-436 (b) — the user's GST State/UT for tax invoices (place of supply).
 *
 * - Reads it from GET /api/auth/me (`gstStateCode`, a 2-digit string or null) and saves it with
 *   PATCH /api/auth/me { gstStateCode }. Every mount asks /me itself (the top-up modal opens
 *   from anywhere); the saved value is shared between mounted pickers (module store), keyed by
 *   the signed-in user so another user's State never shows.
 * - Consent order (Ajay, handoff/legal/gst-tax-invoice-signed.md Addendum 7 (2), must-fix): the
 *   State is saved only after the current privacy version is accepted. The server refuses
 *   otherwise (403 privacy_reaccept_required); the PATCH goes through privacyFetch, which opens
 *   the T-343 re-accept prompt (or its P7 box). The picked State is held in this component's
 *   state only (never localStorage) and saved again once the user accepts (onPrivacyAccepted).
 * - Pay/Subscribe call `ensureReady()` first: no State -> the required error and focus on the
 *   select, false (no billing call); an unsaved pick -> saved first; false when that save is
 *   blocked or fails.
 *
 * Nothing here logs the State.
 */
import { isGstStateCode } from '@lawie/shared';
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  isPrivacyBlocked,
  onPrivacyAccepted,
  privacyFetch,
} from '@/components/PrivacyUpdatePrompt';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch';

// ── Shared store: the saved State per signed-in user ──────────────────────────────────────────

interface Saved {
  userId: string | null;
  loaded: boolean;
  code: string | null;
}

let saved: Saved = { userId: null, loaded: false, code: null };
const listeners = new Set<() => void>();

function setSaved(next: Saved): void {
  saved = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** GET /api/auth/me -> the saved code (null when not set). Undefined on any error. */
async function fetchSavedCode(): Promise<string | null | undefined> {
  try {
    const res = await apiFetch('/api/auth/me', { cache: 'no-store' });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { data?: { gstStateCode?: unknown } };
    const raw = body?.data?.gstStateCode;
    return isGstStateCode(raw) ? raw : null;
  } catch {
    return undefined;
  }
}

/** The saved code for `userId`, or null while unknown / not set. */
export function useSavedGstStateCode(): { loaded: boolean; code: string | null } {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const s = useSyncExternalStore(
    subscribe,
    () => saved,
    () => saved,
  );
  const mine = s.userId === userId;
  return { loaded: mine && s.loaded, code: mine ? s.code : null };
}

// ── The hook a picker is driven by ──────────────────────────────────────────────────────────

export type GstSaveStatus = 'idle' | 'saving' | 'saved' | 'failed';
type SaveResult = 'saved' | 'blocked' | 'failed';

/** How long "Saved" shows (spec §5: about 2 s). */
const SAVED_MS = 2000;

export interface GstStateController {
  /** The State picked in the select ('' = none). */
  value: string;
  /** The State on the server, or null. */
  savedCode: string | null;
  loaded: boolean;
  status: GstSaveStatus;
  /** Pay was pressed with no State: the required error shows. */
  requiredError: boolean;
  /** privacyFetch action key; the picker renders its P7 box. */
  actionKey: string;
  selectRef: RefObject<HTMLSelectElement | null>;
  /** Bumped when the select must take focus (blocked Pay). */
  focusTick: number;
  onChange: (code: string) => void;
  /** For Pay/Subscribe: true only when a valid State is saved. */
  ensureReady: () => Promise<boolean>;
}

export function useGstState(actionKey: string): GstStateController {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { loaded, code: savedCode } = useSavedGstStateCode();

  const [value, setValue] = useState('');
  const [status, setStatus] = useState<GstSaveStatus>('idle');
  const [requiredError, setRequiredError] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  /** Picked while the save was privacy-blocked; saved again after acceptance. */
  const heldRef = useRef<string | null>(null);
  const inflightRef = useRef<Promise<SaveResult> | null>(null);
  const loadRef = useRef<Promise<void> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchedRef = useRef(false);
  /** The current pick, readable after an await (state in a closure would be stale). */
  const valueRef = useRef('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  // Every mount asks /me (the top-up modal can open from any page).
  const load = useCallback((): Promise<void> => {
    if (!userId) return Promise.resolve();
    const p = (async () => {
      const code = await fetchSavedCode();
      if (code === undefined) {
        // Unknown: keep what we had for this user, but stop waiting on it.
        if (saved.userId !== userId) setSaved({ userId, loaded: true, code: null });
        else if (!saved.loaded) setSaved({ ...saved, loaded: true });
        return;
      }
      setSaved({ userId, loaded: true, code });
    })();
    loadRef.current = p;
    return p;
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Pre-fill from the saved State until the user picks one here.
  useEffect(() => {
    if (!touchedRef.current) {
      valueRef.current = savedCode ?? '';
      setValue(savedCode ?? '');
    }
  }, [savedCode]);

  const save = useCallback(
    (code: string): Promise<SaveResult> => {
      const run = (async (): Promise<SaveResult> => {
        if (savedTimer.current) clearTimeout(savedTimer.current);
        setStatus('saving');
        try {
          const res = await privacyFetch(actionKey, '/api/auth/me', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gstStateCode: code }),
          });
          if (isPrivacyBlocked(res)) {
            // Ajay 7 (2): not stored. The prompt or P7 box is showing; hold the pick in memory.
            heldRef.current = code;
            if (mountedRef.current) setStatus('idle');
            return 'blocked';
          }
          if (!res.ok) {
            if (mountedRef.current) setStatus('failed');
            return 'failed';
          }
          heldRef.current = null;
          if (userId) setSaved({ userId, loaded: true, code });
          if (mountedRef.current) {
            setStatus('saved');
            savedTimer.current = setTimeout(() => {
              if (mountedRef.current) setStatus('idle');
            }, SAVED_MS);
          }
          return 'saved';
        } catch {
          if (mountedRef.current) setStatus('failed');
          return 'failed';
        }
      })();
      inflightRef.current = run;
      void run.finally(() => {
        if (inflightRef.current === run) inflightRef.current = null;
      });
      return run;
    },
    [actionKey, userId],
  );

  // After the user accepts the current privacy version, save the held pick.
  useEffect(
    () =>
      onPrivacyAccepted(() => {
        const held = heldRef.current;
        if (held && mountedRef.current) void save(held);
      }),
    [save],
  );

  const onChange = useCallback(
    (code: string) => {
      touchedRef.current = true;
      valueRef.current = code;
      setValue(code);
      setRequiredError(false);
      if (code && isGstStateCode(code)) void save(code);
    },
    [save],
  );

  const ensureReady = useCallback(async (): Promise<boolean> => {
    // "Pay waits" for a save in progress, and for /me if it has not answered yet.
    if (inflightRef.current) await inflightRef.current;
    const mine = () => saved.userId === userId;
    if (!(mine() && saved.loaded) && loadRef.current) await loadRef.current;
    // Not picked here yet: the saved State is the pick (the pre-fill may not have rendered).
    const picked = touchedRef.current ? valueRef.current : mine() ? (saved.code ?? '') : '';
    if (!picked || !isGstStateCode(picked)) {
      setRequiredError(true);
      setFocusTick((t) => t + 1);
      return false;
    }
    if (mine() && saved.code === picked) return true;
    return (await save(picked)) === 'saved';
  }, [save, userId]);

  return {
    value,
    savedCode,
    loaded,
    status,
    requiredError,
    actionKey,
    selectRef,
    focusTick,
    onChange,
    ensureReady,
  };
}
