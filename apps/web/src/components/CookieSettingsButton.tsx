'use client';

import { CONSENT_STRINGS, openConsentSettings } from './AnalyticsConsent';

// T-310: the controls that reopen the analytics consent notice. Ajay's S9 (footer, tool pages)
// and S10 (privacy page); Rajesh's classes. The strings live in AnalyticsConsent.tsx, so server
// components pick a variant rather than pass text.

const FOOTER_CLASS =
  'rounded-sm bg-transparent p-0 text-left text-[15px] text-white/[0.72] transition-colors ' +
  'hover:text-[#E5A933] focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-brand-teal focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy';

const TOOL_CLASS =
  'rounded-sm bg-transparent p-0 text-xs text-slate-500 underline underline-offset-2 ' +
  'hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-brand-teal focus-visible:ring-offset-2';

export default function CookieSettingsButton({
  variant,
}: {
  variant: 'footer' | 'privacy' | 'tool';
}) {
  if (variant === 'privacy') {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={(e) => openConsentSettings(e.currentTarget)}
      >
        {CONSENT_STRINGS.S10}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-haspopup={variant === 'footer' ? 'true' : undefined}
      className={variant === 'footer' ? FOOTER_CLASS : TOOL_CLASS}
      onClick={(e) => openConsentSettings(e.currentTarget)}
    >
      {CONSENT_STRINGS.S9}
    </button>
  );
}
