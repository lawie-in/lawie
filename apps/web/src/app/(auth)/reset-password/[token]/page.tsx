/**
 * T-221 — the reset email's link lands here: `${FRONTEND_URL}/reset-password/<token>`.
 * The client form (components/auth/ResetPasswordForm.tsx) reads the token from the URL itself;
 * this server component never receives or renders it. No referrer leaves this page, so the
 * token cannot leak to another site through a link or a loaded resource.
 */
import type { Metadata } from 'next';

import ResetPasswordForm from '@/components/auth/ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Set a new password · Lawie',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
