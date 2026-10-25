/**
 * T-221 — "Forgot password?" from /login lands here. The form (components/auth/
 * ForgotPasswordForm.tsx) shows the same "sent" state for every address (AC1).
 */
import type { Metadata } from 'next';

import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Reset your password · Lawie',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
