'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { useEffect, useState } from 'react';

import { GA_MEASUREMENT_ID, isAnalyticsRoute, sanitizePageLocation } from './analytics-routes';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

// Google's documented opt-out flag. gtag.js checks it before every hit, including Enhanced
// Measurement's automatic history-change page views, so no GA Admin setting is relied on.
const GA_DISABLE_KEY = `ga-disable-${GA_MEASUREMENT_ID}`;

function setGaDisabled(disabled: boolean): void {
  (window as unknown as Record<string, unknown>)[GA_DISABLE_KEY] = disabled;
}

// Browser Back/Forward: on popstate the URL is already the destination, and GA's history
// listener may fire before React re-renders (and before the component's render-time disable). This
// listener is registered at module load, long before gtag.js can load, and in the capture
// phase (gtag's is a bubble listener), so it runs first and sets the flag from the new URL.
// Registered once per window, even if the module is evaluated twice.
const POPSTATE_GUARD_KEY = '__lawieGaPopstateGuard';
if (typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>;
  if (!w[POPSTATE_GUARD_KEY]) {
    w[POPSTATE_GUARD_KEY] = true;
    window.addEventListener(
      'popstate',
      () => {
        setGaDisabled(!isAnalyticsRoute(window.location.pathname));
      },
      { capture: true },
    );
  }
}

// Sets up the gtag queue once. gtag.js drains window.dataLayer when it loads, so commands
// pushed before the script arrives are kept in order (js, config, then the first page view).
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

// T-306: GA loads only on public allowlisted pages, with the automatic page view off. Page views
// are sent here, with no query string or hash, and never for a route off the allowlist, even
// after gtag.js has loaded on an earlier public page.
export default function GoogleAnalytics() {
  const pathname = usePathname();
  const allowed = isAnalyticsRoute(pathname);
  // Once loaded, keep the script mounted; the flag and the page-view effect do the gating.
  const [loaded, setLoaded] = useState(false);

  // Disable-only, during render: Next.js pushes the new URL in an insertion effect, which runs
  // before any effect here, and GA's history listener fires on that push. Rendering with the new
  // pathname happens first, so the flag is already set. Never enabled here, because a render
  // can be discarded; enabling waits for the committed effect below.
  if (!allowed && typeof window !== 'undefined') setGaDisabled(true);

  useEffect(() => {
    // Every pathname change, before gtag.js loads and while it is mounted.
    setGaDisabled(!allowed);
    if (!allowed) return;
    initGtag();
    setLoaded(true);
    window.gtag?.('event', 'page_view', {
      page_location: sanitizePageLocation(window.location.href),
      page_path: window.location.pathname,
    });
  }, [allowed, pathname]);

  if (!loaded) return null;

  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      strategy="afterInteractive"
    />
  );
}
