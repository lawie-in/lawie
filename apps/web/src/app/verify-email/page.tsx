/**
 * T-223 — the verify link lands here: `${FRONTEND_URL}/verify-email?token=<token>`.
 * The client part (components/VerifyEmailPrompt.tsx) reads ?token=, removes it from the address
 * bar, and POSTs it in the body to /api/auth/verify-email. No referrer leaves this page, so the
 * token cannot leak to another site through a link or a loaded resource.
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
