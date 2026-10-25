/**
 * T-223 — the verify link lands here: `${FRONTEND_URL}/verify-email?token=<token>`.
 * The client part (components/VerifyEmailPrompt.tsx) reads ?token=, removes it from the address
 * bar (history.replaceState), and POSTs it once in the body to /api/auth/verify-email. No
 * referrer leaves this page (the `referrer` metadata is <meta name="referrer"
 * content="no-referrer">), so the token cannot leak to another site through a link or a loaded
 * resource.
 * T-522 (Rajesh §4, AJ-522-S5): five states. A sign-in link's tokens sign the user in through
 * AuthContext's login; a verify-only link says "verified, not signed in"; a 400 is expired/used.
 */
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { VerifyEmailLanding } from '@/components/VerifyEmailPrompt';

export const metadata: Metadata = {
  title: 'Verify your email',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailLanding />
    </Suspense>
  );
}
