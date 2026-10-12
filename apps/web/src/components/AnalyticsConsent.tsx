'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  GA_MEASUREMENT_ID,
  isAnalyticsRoute,
  sanitizePageLocation,
} from './analytics/analytics-routes';

// T-310: Google Analytics loads only after the visitor accepts (DPDP). No answer or Decline: no
// gtag.js and no _ga cookie. Replaces T-306's GoogleAnalytics component as the only GA loader.
// Mechanism: Arjun (handoff/tickets/T-310-analytics-consent-before-ga.md). Look and behaviour:
// Rajesh (handoff/design/T-310-consent-notice.md, D1-D6). Words: Ajay
// (handoff/legal/T-310-consent-notice-signed.md), shipped byte for byte; no other words in the card.

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Ajay's signed strings S1-S10. Do not edit without his sign-off. */
export const CONSENT_STRINGS = {
  S1: 'Analytics cookies',
  S2: 'With your permission, Google Analytics counts visits to our public pages. It sets cookies and sends your IP address, browser details and the page address to Google. It loads only if you accept.',
  S3: 'Privacy Policy',
  S4_GRANTED: 'Your current choice: Accepted.',
  S4_DENIED: 'Your current choice: Declined.',
  S5: 'Decline',
  S6: 'Accept',
  S7: 'Choice saved. Analytics is on.',
  S8: 'Choice saved. Analytics is off.',
  S9: 'Cookie settings',
  S10: 'Change cookie settings',
} as const;

/** Version of the notice text. Raise it when Ajay changes S1-S8; every visitor is asked again. */
export const CONSENT_TEXT_VERSION = 1;
/** A stored choice older than this is treated as no answer (Ajay: re-ask after 12 months). */
export const CONSENT_MAX_AGE_MONTHS = 12;
export const CONSENT_STORAGE_KEY = 'lawie.consent.analytics';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const CONSENT_ENDPOINT = `${API_URL}/api/auth/consent`;

const GA_SCRIPT_ID = 'lawie-gtag-js';
const GA_SCRIPT_SRC = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
// Google's documented opt-out flag. gtag.js checks it before every hit, including Enhanced
// Measurement's automatic history-change page views.
const GA_DISABLE_KEY = `ga-disable-${GA_MEASUREMENT_ID}`;
export const GA_COOKIE_NAMES: readonly string[] = [
  '_ga',
  `_ga_${GA_MEASUREMENT_ID.replace(/^G-/, '')}`,
];

export type ConsentChoice = 'granted' | 'denied';

export interface StoredConsent {
  v: number;
  id: string;
  choice: ConsentChoice;
  at: string;
  synced: boolean;
}

// ── Storage (every access in try/catch; blocked storage = no answer = denied) ─────────────────

export function readStoredConsent(): StoredConsent | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const c = value as Record<string, unknown>;
    if (
      typeof c.v !== 'number' ||
      typeof c.id !== 'string' ||
      (c.choice !== 'granted' && c.choice !== 'denied') ||
      typeof c.at !== 'string' ||
      typeof c.synced !== 'boolean'
    ) {
      return null;
    }
    return { v: c.v, id: c.id, choice: c.choice, at: c.at, synced: c.synced };
  } catch {
    return null;
  }
}

function writeStoredConsent(record: StoredConsent): boolean {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/**
 * A stored choice counts only if it was made on the current notice version and less than 12
 * months ago. A different version (older, or an unknown newer one after a rollback) or an
 * unreadable time means: ask again.
 */
export function isConsentCurrent(record: StoredConsent | null, now: Date = new Date()): boolean {
  if (!record) return false;
  if (record.v !== CONSENT_TEXT_VERSION) return false;
  const decided = new Date(record.at);
  if (Number.isNaN(decided.getTime())) return false;
  const expires = new Date(decided.getTime());
  expires.setMonth(expires.getMonth() + CONSENT_MAX_AGE_MONTHS);
  return now.getTime() < expires.getTime();
}

function newConsentId(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Non-secure contexts have no randomUUID; build a v4 uuid from getRandomValues.
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ── Server record (never awaited for the UX; a failure is never shown) ──────────────────────────

function postConsent(record: StoredConsent): Promise<boolean> {
  try {
    return fetch(CONSENT_ENDPOINT, {
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: record.id, choice: record.choice, version: record.v }),
    })
      .then((res) => res.ok)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

/** Marks the stored record synced, if it is still the one that was sent. */
function markSynced(sent: StoredConsent): void {
  const now = readStoredConsent();
  if (now && now.id === sent.id && now.at === sent.at && now.choice === sent.choice) {
    writeStoredConsent({ ...now, synced: true });
  }
}

function syncRecord(record: StoredConsent): void {
  void postConsent(record).then((ok) => {
    if (ok) markSynced(record);
  });
}

// ── GA control ───────────────────────────────────────────────────────────────────────────────

const GRANTED_KEY = '__lawieAnalyticsGranted';

function windowRecord(): Record<string, unknown> {
  return window as unknown as Record<string, unknown>;
}

function isGrantedNow(): boolean {
  return windowRecord()[GRANTED_KEY] === true;
}

function setGrantedNow(granted: boolean): void {
  windowRecord()[GRANTED_KEY] = granted;
}

function setGaDisabled(disabled: boolean): void {
  windowRecord()[GA_DISABLE_KEY] = disabled;
}

// Browser Back/Forward (T-306): on popstate the URL is already the destination, and GA's history
// listener may fire before React re-renders. This capture-phase listener is registered at module
// load, before gtag.js can load, so it runs first. GA is enabled only on an allowlisted route
// AND with consent granted. Registered once per window.
const POPSTATE_GUARD_KEY = '__lawieGaPopstateGuard';
if (typeof window !== 'undefined') {
  const w = windowRecord();
  if (!w[POPSTATE_GUARD_KEY]) {
    w[POPSTATE_GUARD_KEY] = true;
    window.addEventListener(
      'popstate',
      () => {
        setGaDisabled(!(isAnalyticsRoute(window.location.pathname) && isGrantedNow()));
      },
      { capture: true },
    );
  }
}

// Sets up the gtag queue and config once per window. gtag.js drains window.dataLayer when it
// loads, so commands pushed before the script arrives are kept in order.
function initGtag(): void {
  if (typeof window.gtag === 'function') return;
  const dataLayer = (window.dataLayer = window.dataLayer || []);
  window.gtag = function gtag() {
    // gtag.js expects the Arguments object itself, not an array.
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  // T-308 (Ajay condition 1): Google signals and ads personalisation off at the tag.
  window.gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
}

function gaScriptElements(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>('script')).filter(
    (s) => s.id === GA_SCRIPT_ID || s.src.startsWith('https://www.googletagmanager.com/gtag/js'),
  );
}

/** Appends gtag.js once. At most one script element exists at any time. */
function loadGtag(): void {
  initGtag();
  if (gaScriptElements().length > 0) return;
  const script = document.createElement('script');
  script.id = GA_SCRIPT_ID;
  script.async = true;
  script.src = GA_SCRIPT_SRC;
  document.head.appendChild(script);
}

function removeGtagScript(): void {
  for (const s of gaScriptElements()) s.remove();
}

/** Expires the GA cookies on the host and on every parent domain (GA sets them on the top one). */
export function deleteGaCookies(): void {
  try {
    const host = window.location.hostname;
    const labels = host.split('.');
    const domains: string[] = [''];
    if (host && !/^[\d.]+$/.test(host) && labels.length > 1) {
      for (let i = 0; i < labels.length - 1; i++) domains.push(labels.slice(i).join('.'));
    }
    for (const name of GA_COOKIE_NAMES) {
      for (const domain of domains) {
        const domainPart = domain ? `; domain=.${domain}` : '';
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0; path=/${domainPart}`;
      }
    }
  } catch {
    /* cookies unavailable: nothing to delete */
  }
}

function applyGranted(): void {
  setGrantedNow(true);
  loadGtag();
}

function applyDenied(): void {
  setGrantedNow(false);
  setGaDisabled(true);
  deleteGaCookies();
  removeGtagScript();
}

// ── Reopen ("Cookie settings") ───────────────────────────────────────────────────────────────

type ReopenListener = (opener: HTMLElement | null) => void;
const reopenListeners = new Set<ReopenListener>();

/**
 * Reopens the notice (footer "Cookie settings", the privacy-page button, the tool pages).
 * Pass the button that was pressed, so focus can return to it after a change or Esc.
 */
export function openConsentSettings(opener?: HTMLElement | null): void {
  const el =
    opener ??
    (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null);
  reopenListeners.forEach((listener) => listener(el));
}

// ── Splash (Rajesh R4): the card appears after the first-visit logo splash ends ──────────────

export const SPLASH_OPEN_ATTR = 'data-lawie-splash';
export const SPLASH_END_EVENT = 'lawie:splash-end';

// ── Component ────────────────────────────────────────────────────────────────────────────────

// D2: one class string for both buttons. Do not add a variant.
const choiceBtn =
  'inline-flex h-11 items-center justify-center rounded-lg border-2 border-brand-navy bg-white ' +
  'px-4 text-[15px] font-semibold text-brand-navy ' +
  'hover:bg-brand-page active:bg-brand-line ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 ' +
  'sm:h-10 sm:min-w-[120px] [@media(pointer:coarse)]:sm:h-11';

type CardMode = 'closed' | 'first' | 'reopen';

export default function AnalyticsConsent() {
  const pathname = usePathname();
  const allowed = isAnalyticsRoute(pathname);

  const [mounted, setMounted] = useState(false);
  // The choice in force for this page lifetime. Loaded from storage on mount; null = no answer.
  const [record, setRecord] = useState<StoredConsent | null>(null);
  const [reopened, setReopened] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const openerRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const retriedRef = useRef(false);

  const granted = record?.choice === 'granted';

  // T-306 render-time defence, consent-aware: disable-only, during render. Next.js pushes the new
  // URL before any effect here runs, and GA's history listener fires on that push; rendering with
  // the new pathname happens first. Never enabled here (a render can be discarded).
  if (typeof window !== 'undefined' && !(allowed && granted)) setGaDisabled(true);

  // Mount: read the stored choice once.
  useEffect(() => {
    const stored = readStoredConsent();
    const current = isConsentCurrent(stored) ? stored : null;
    setRecord(current);
    setMounted(true);
    if (!current || current.choice !== 'granted') {
      // No answer, a stale one, or Decline: no _ga cookie may remain from an earlier visit.
      setGrantedNow(false);
      deleteGaCookies();
    }
  }, []);

  // Splash: wait for it to end if one is showing. LogoSplash sets the attribute in its own mount
  // effect, which runs after this one in the same commit, so check after the commit settles.
  useEffect(() => {
    const done = () => setSplashDone(true);
    window.addEventListener(SPLASH_END_EVENT, done);
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && !document.documentElement.hasAttribute(SPLASH_OPEN_ATTR)) done();
    });
    return () => {
      cancelled = true;
      window.removeEventListener(SPLASH_END_EVENT, done);
    };
  }, []);

  // Retry an unsynced server record once, on the first public page of this load.
  useEffect(() => {
    if (!mounted || !allowed || retriedRef.current) return;
    retriedRef.current = true;
    const stored = readStoredConsent();
    if (stored && isConsentCurrent(stored) && !stored.synced) syncRecord(stored);
  }, [mounted, allowed]);

  // GA gate and page views. Commit-time: enabled only on an allowlisted route with consent.
  useEffect(() => {
    if (!mounted) return;
    const on = allowed && granted;
    setGaDisabled(!on);
    if (!on) return;
    applyGranted();
    window.gtag?.('event', 'page_view', {
      page_location: sanitizePageLocation(window.location.href),
      page_path: window.location.pathname,
    });
  }, [mounted, allowed, granted, pathname]);

  // Reopen requests from "Cookie settings" buttons.
  useEffect(() => {
    const listener: ReopenListener = (opener) => {
      openerRef.current = opener;
      setAnnouncement('');
      setReopened(true);
    };
    reopenListeners.add(listener);
    return () => {
      reopenListeners.delete(listener);
    };
  }, []);

  let mode: CardMode = 'closed';
  if (mounted && allowed) {
    if (reopened) mode = 'reopen';
    else if (!record && splashDone) mode = 'first';
  }
  const open = mode !== 'closed';

  // D6: hide the float CTA while the card is open.
  useEffect(() => {
    if (!open) return;
    document.body.setAttribute('data-consent-open', '');
    return () => {
      document.body.removeAttribute('data-consent-open');
    };
  }, [open]);

  // Entry animation (design: consent-in, 200 ms, no movement under reduced motion).
  useEffect(() => {
    const el = cardRef.current;
    if (!open || !el || typeof el.animate !== 'function') return;
    if (typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    el.animate(
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 200, easing: 'ease-out' },
    );
  }, [open]);

  // Reopen: focus the card's title. First ask: focus is not moved.
  useEffect(() => {
    if (mode === 'reopen') titleRef.current?.focus();
  }, [mode]);

  const returnFocus = useCallback((wasReopen: boolean) => {
    const opener = openerRef.current;
    openerRef.current = null;
    if (wasReopen && opener && opener.isConnected) {
      opener.focus();
      return;
    }
    // T-332: #main is focusable only for this move; tabindex goes again on blur.
    const main = document.getElementById('main');
    if (!main) return;
    main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: true });
    main.addEventListener('blur', () => main.removeAttribute('tabindex'), { once: true });
  }, []);

  const decide = useCallback(
    (choice: ConsentChoice) => {
      const wasReopen = mode === 'reopen';
      const previous = record ?? readStoredConsent();
      const next: StoredConsent = {
        v: CONSENT_TEXT_VERSION,
        id: previous?.id ?? newConsentId(),
        choice,
        at: new Date().toISOString(),
        synced: false,
      };
      // Takes effect at once; never waits for the server record. If storage is blocked the
      // choice holds for this page lifetime only and the notice asks again on the next visit.
      writeStoredConsent(next);
      setRecord(next);
      setReopened(false);
      if (choice === 'granted') applyGranted();
      else applyDenied();
      setAnnouncement(choice === 'granted' ? CONSENT_STRINGS.S7 : CONSENT_STRINGS.S8);
      syncRecord(next);
      // Focus moves after the card unmounts.
      setTimeout(() => returnFocus(wasReopen), 0);
    },
    [mode, record, returnFocus],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Escape' || mode !== 'reopen') return;
      e.stopPropagation();
      setReopened(false);
      setTimeout(() => returnFocus(true), 0);
    },
    [mode, returnFocus],
  );

  if (!mounted || !allowed) return null;

  return (
    <>
      {open && (
        // Container: a landmark, not a dialog (D1). No backdrop, no focus trap.
        // Design (Rajesh, 46370d6): capped at max(40vh, 8rem) at every width. The card is a flex column: the text region
        // scrolls inside it and the button row stays outside the scroll, always visible.
        <section
          ref={cardRef}
          aria-labelledby="consent-title"
          aria-describedby="consent-desc"
          onKeyDown={onKeyDown}
          className="border-brand-line text-brand-navy fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[55] flex max-h-[max(40vh,8rem)] flex-col rounded-xl border bg-white p-4 shadow-[0_12px_32px_rgba(13,31,60,0.14)] sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[400px] sm:p-5"
        >
          {/* -m-1 p-1: room for the link's focus ring inside the scroll clip; layout unchanged. */}
          <div className="-m-1 min-h-0 flex-1 overflow-y-auto p-1">
            <h2
              id="consent-title"
              ref={titleRef}
              tabIndex={-1}
              className="font-heading text-base font-semibold leading-snug focus:outline-none"
            >
              {CONSENT_STRINGS.S1}
            </h2>

            <p id="consent-desc" className="text-brand-muted mt-1.5 text-sm leading-relaxed">
              {CONSENT_STRINGS.S2}{' '}
              <a
                href="/privacy#browser-storage"
                className="text-brand-navy hover:text-brand-teal-dark focus-visible:ring-brand-teal rounded-sm font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {CONSENT_STRINGS.S3}
              </a>
            </p>

            {mode === 'reopen' && record && (
              <p className="text-brand-navy mt-2 text-sm">
                {record.choice === 'granted'
                  ? CONSENT_STRINGS.S4_GRANTED
                  : CONSENT_STRINGS.S4_DENIED}
              </p>
            )}
          </div>

          {/* D3: Decline, then Accept. Outside the scroll region, so always visible. */}
          <div className="mt-3 grid shrink-0 grid-cols-2 gap-2 sm:mt-4">
            <button type="button" onClick={() => decide('denied')} className={choiceBtn}>
              {CONSENT_STRINGS.S5}
            </button>
            <button type="button" onClick={() => decide('granted')} className={choiceBtn}>
              {CONSENT_STRINGS.S6}
            </button>
          </div>
        </section>
      )}

      {/* Polite announcement after a choice; always in the DOM on public pages, visually hidden. */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
