/**
 * T-521 (Priya; replaces the `?q=` prefill: matter text never goes in a URL).
 * Another screen may leave text in sessionStorage under DRAFT_PREFILL_KEY. The
 * one-flow describe step reads it once, removes it and prefills the textarea.
 * It is never submitted on its own, and the value is never logged.
 */
import { DESCRIPTION_MAX, DRAFT_PREFILL_KEY, capToLimit } from '@/lib/draftPrefill';

// Re-exported for existing imports; the one definition is in lib/draftPrefill.ts.
export { DRAFT_PREFILL_KEY };

/** T-608: the New document page's limit, so the carried text is never cut short. */
export const INITIAL_PREFILL_MAX = DESCRIPTION_MAX;

/** Trimmed and capped text to prefill, or undefined when there is none. Pure. */
export function initialPrefillFrom(raw: string | null | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = capToLimit(raw.trim(), INITIAL_PREFILL_MAX);
  return text === '' ? undefined : text;
}

/** `window.sessionStorage` can throw on access itself (privacy mode, blocked storage). */
function sessionStorageOrNone(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * Reads the prefill once and removes the key, so it is used one time only.
 * Returns undefined when there is none, or when storage cannot be used (server
 * render, privacy mode): it never throws. `storage` is for tests.
 */
export function takeDraftPrefill(
  storage: Pick<Storage, 'getItem' | 'removeItem'> | undefined = sessionStorageOrNone(),
): string | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(DRAFT_PREFILL_KEY);
    if (raw !== null) storage.removeItem(DRAFT_PREFILL_KEY);
    return initialPrefillFrom(raw);
  } catch {
    return undefined;
  }
}
