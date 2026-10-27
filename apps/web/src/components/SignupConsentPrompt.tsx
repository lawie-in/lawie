'use client';

/**
 * T-642 — the next-sign-in consent step for acceptedVia 'google' accounts (AJ-517-M18(c);
 * AJ-642-M2..M6; Rajesh's panel spec via Priya, 27 Oct 2026). A persistent panel, not a modal:
 * mounted once in app/dashboard/layout.tsx in the banner slot, above the verify-email bar, on
 * every dashboard page while GET /me says needsSignupConsent. No dismiss, nothing made inert:
 * the sidebar, Settings, export, delete, Privacy Policy and support stay usable (AJ-642-M3).
 *
 * Copy: the signed M2 set only (SIGNUP_CONSENT_COPY), the AJ-517-M16 box and the AJ-517-M3 error
 * (CONSENT_COPY), byte for byte. The box is unticked by default; "Accept and continue" is disabled
 * until it is ticked. On accept: POST /me/signup-consent, then the panel hides.
 *
 * Drafting and purchase entry points call signupConsentGate() (lib/signupConsent.ts), which
 * scrolls here and focuses the checkbox instead of sending the request.
 */
import Link from 'next/link';
import { useEffect } from 'react';

import { CONSENT_COPY, SIGNUP_CONSENT_COPY } from '@/components/marketing/nl-copy';
import { Button, Card } from '@/components/ui';
import { CONTROL_LINE } from '@/components/ui/hover';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/cn';
import {
  SIGNUP_CONSENT_CHECKBOX_ID,
  SIGNUP_CONSENT_PANEL_ID,
  acceptSignupConsent,
  refreshSignupConsent,
  resetSignupConsent,
  setSignupConsentTicked,
  useSignupConsentState,
} from '@/lib/signupConsent';

const HEADING_ID = 'signup-consent-heading';
const INTRO_ID = 'signup-consent-intro';
const ERROR_ID = 'signup-consent-error';

// As the login page's consent line (T-528): brass-dark underlined text links.
const TEXT_LINK =
  'nl-focus rounded-nl-sm font-medium text-nl-brass-dark underline underline-offset-4';

export default function SignupConsentPrompt() {
  const { user, isLoading } = useAuth();
  const s = useSignupConsentState();
  const userId = user?.id ?? null;

  // Signed out: forget the state, so the next sign-in asks again.
  useEffect(() => {
    if (!isLoading && !userId) resetSignupConsent();
  }, [isLoading, userId]);

  // Every dashboard load (AJ-642-M3): ask the server.
  useEffect(() => {
    if (!userId) return;
    resetSignupConsent();
    void refreshSignupConsent();
  }, [userId]);

  if (!userId || s.needed !== true) return null;

  const onAccept = async () => {
    if (await acceptSignupConsent()) {
      // The panel (and the focused button) is gone: put focus on the page's main region.
      document.getElementById('dashboard-main')?.focus();
    }
  };

  return (
    <Card
      as="section"
      id={SIGNUP_CONSENT_PANEL_ID}
      role="region"
      aria-labelledby={HEADING_ID}
      aria-busy={s.pending || undefined}
      // Rajesh (1): Card fill and 1px Line border (Card), radius 4 (radius-md), 24px padding,
      // 16px at 360px. scroll-margin-top: the sticky top bar's live height (TopBar --nl-bar-h).
      className="rounded-nl-md p-nl-4 min-[361px]:p-nl-6 scroll-mt-[var(--nl-bar-h,0px)]"
    >
      <h2
        id={HEADING_ID}
        className="font-nl-display text-nl-text m-0 text-[20px] font-normal leading-[28px]"
      >
        {SIGNUP_CONSENT_COPY.heading}
      </h2>
      <p id={INTRO_ID} className="nl-body text-nl-text mt-nl-2 mb-0">
        {SIGNUP_CONSENT_COPY.introBefore}
        <Link href="/terms" target="_blank" rel="noopener" className={TEXT_LINK}>
          {SIGNUP_CONSENT_COPY.terms}
        </Link>
        {SIGNUP_CONSENT_COPY.introMiddle}
        <Link href="/privacy" target="_blank" rel="noopener" className={TEXT_LINK}>
          {SIGNUP_CONSENT_COPY.privacy}
        </Link>
        {SIGNUP_CONSENT_COPY.introAfter}
      </p>

      <div className="mt-nl-4">
        {/* Rajesh (2): a 44px row; the box takes the Control Line at rest (drawn, as T-528) and
            the 2px brass focus ring (nl-focus). Forced colours get the native control. */}
        <div className="gap-nl-3 flex min-h-[44px] items-center">
          <span className="relative inline-flex h-5 w-5 shrink-0">
            <input
              id={SIGNUP_CONSENT_CHECKBOX_ID}
              type="checkbox"
              checked={s.ticked}
              disabled={s.pending}
              onChange={(e) => setSignupConsentTicked(e.target.checked)}
              aria-invalid={s.showError ? true : undefined}
              aria-describedby={s.showError ? `${INTRO_ID} ${ERROR_ID}` : INTRO_ID}
              className={cn(
                'nl-focus rounded-nl-sm bg-nl-card checked:border-nl-brass checked:bg-nl-brass peer m-0 block h-5 w-5 cursor-pointer appearance-none border disabled:cursor-not-allowed disabled:opacity-50 forced-colors:appearance-auto',
                CONTROL_LINE,
              )}
            />
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 20 20"
              className="text-nl-on-brass pointer-events-none absolute inset-0 hidden h-5 w-5 peer-checked:block forced-colors:hidden"
            >
              <path
                d="M5 10.5l3 3 7-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <label htmlFor={SIGNUP_CONSENT_CHECKBOX_ID} className="nl-body-sm text-nl-soft">
            {CONSENT_COPY.before}
            <Link href="/terms" target="_blank" rel="noopener" className={TEXT_LINK}>
              {CONSENT_COPY.terms}
            </Link>
            {CONSENT_COPY.middle}
            <Link href="/privacy" target="_blank" rel="noopener" className={TEXT_LINK}>
              {CONSENT_COPY.privacy}
            </Link>
            {CONSENT_COPY.after}
          </label>
        </div>
        {/* Rajesh (2): the Rust error under the box, role=alert; it clears when the box is ticked. */}
        {s.showError && (
          <p id={ERROR_ID} role="alert" className="nl-body-sm mt-nl-1 text-nl-err mb-0">
            {CONSENT_COPY.required}
          </p>
        )}
      </div>

      <div className="mt-nl-4">
        {/* Rajesh (3): the one primary while the panel shows. */}
        <Button
          variant="primary"
          disabled={!s.ticked}
          loading={s.pending}
          onClick={() => void onAccept()}
        >
          {SIGNUP_CONSENT_COPY.accept}
        </Button>
      </div>
    </Card>
  );
}
