'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * T-115b — the focus logic of a modal dialog, taken from `ReferralOfferModal`
 * (T-234) so every dialog shares one copy (Rajesh's spec, delete-document-spec-t115b §2).
 * `ReferralOfferModal` still has its own inline copy; moving it onto this hook is a
 * separate change.
 *
 * While the component that calls it is mounted:
 * - focus moves to `initialFocusRef` (the safe action);
 * - Tab / Shift+Tab cycle inside `containerRef` only;
 * - Escape calls `onEscape` (the caller decides whether to close, e.g. not while working);
 * - with `lockPage`, every other child of <body> is `aria-hidden` and the page does not
 *   scroll (render the dialog in a portal on <body> for this).
 * On unmount, focus returns to the element focused at open; when that is gone or is
 * <body>, to `fallbackFocusRef`. Call `skipReturnFocus()` first when the caller moves
 * focus itself (for example after the item the opener belonged to was deleted).
 */
export interface UseModalFocusOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  initialFocusRef: React.RefObject<HTMLElement | null>;
  onEscape: () => void;
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
  lockPage?: boolean;
}

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalFocus({
  containerRef,
  initialFocusRef,
  onEscape,
  fallbackFocusRef,
  lockPage = false,
}: UseModalFocusOptions): { skipReturnFocus: () => void } {
  // Latest callbacks and refs in refs, so a new identity from the caller never re-runs
  // the mount effect (which would re-focus the initial element and reset the return target).
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const fallbackRef = useRef(fallbackFocusRef);
  fallbackRef.current = fallbackFocusRef;
  const skipRef = useRef(false);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    initialFocusRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscapeRef.current();
        return;
      }
      const container = containerRef.current;
      if (e.key !== 'Tab' || !container) return;
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && container.contains(active);
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    // The page behind: hidden from assistive tech and not scrollable.
    const hidden: { el: Element; prev: string | null }[] = [];
    let prevOverflow = '';
    if (lockPage) {
      const container = containerRef.current;
      for (const el of Array.from(document.body.children)) {
        if (container && el.contains(container)) continue;
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
        hidden.push({ el, prev: el.getAttribute('aria-hidden') });
        el.setAttribute('aria-hidden', 'true');
      }
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', onKey);
      if (lockPage) {
        for (const { el, prev } of hidden) {
          if (prev === null) el.removeAttribute('aria-hidden');
          else el.setAttribute('aria-hidden', prev);
        }
        document.body.style.overflow = prevOverflow;
      }
      if (skipRef.current) return;
      const opener =
        previouslyFocused && previouslyFocused !== document.body && previouslyFocused.isConnected
          ? previouslyFocused
          : fallbackRef.current?.current;
      opener?.focus();
    };
    // Mount-only by design (see the refs above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skipReturnFocus = useCallback(() => {
    skipRef.current = true;
  }, []);

  return { skipReturnFocus };
}
