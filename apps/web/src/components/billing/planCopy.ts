/**
 * T-509: the plan chooser, status card and cancel dialog strings. Every string is signed copy,
 * byte for byte (handoff/copy/T-511-copy-v1.md, signed by Ajay c3301bb9; rulings
 * handoff/legal/T-511-copy-rulings-ajay.md AJ-511-M7, M8, M16). Changes only with his sign-off.
 * Prices and Ink are never written here: they come from billing's GET /plans (lib/plans.ts).
 */
import { formatInvoiceDate } from '@/components/billing/InvoicesCard';
import type { PlanTier, SubscriptionPlan } from '@/lib/plans';

/**
 * {support email} in AJ-509-M2: the in-app support address, as the dashboard already uses it
 * (components/dashboard/Sidebar.tsx "Get help", credits/GenerationFailedModal.tsx).
 */
export const SUPPORT_EMAIL = 'support@lawie.in';

export const PLAN_COPY = {
  // §4.1 plan cards
  freeName: 'Free',
  freePrice: '₹0',
  // AJ-511-M7: "(one time)", not "(lifetime)".
  freeInk: '5 Ink on sign-up, once your email is verified (one time)',
  // AJ-511-M8.
  cardsNote:
    'Prices include GST. Plan Ink does not carry over. Top-up Ink does not expire while your account is open.',
  // §4.2 labels and buttons
  currentPlan: 'Current plan',
  chooseSolo: 'Choose Solo',
  choosePro: 'Choose Pro',
  upgradeToPro: 'Upgrade to Pro',
  switchToSolo: 'Switch to Solo',
  freePlan: 'Free plan',
  paymentPending: 'Payment received. Your Ink will appear here in a moment.',
  // §4.3 status labels
  active: 'Active',
  renewsOn: (date: string) => `Renews on ${date}`,
  endsOn: (date: string) => `Ends on ${date}`,
  paymentFailed: 'Payment failed',
  lapsed: 'Lapsed',
  lapsedHelp: 'Choose a plan to start again.',
  // §4.4 cancel dialog and switching
  cancelLink: 'Cancel plan',
  cancelTitle: 'Cancel your plan?',
  cancelBody: (date: string) =>
    `Your plan ends on ${date}. Ink you already have stays until then. Plan Ink does not carry over after that. Top-up Ink stays.`,
  cancelConfirm: 'Cancel plan',
  cancelKeep: 'Keep my plan',
  // Copy marks this as a toast; no ToastProvider is mounted, so it shows inline.
  cancelDone: (date: string) => `Your plan will end on ${date}.`,
  cancelError: 'Could not cancel your plan. Try again.',
  // AJ-511-M16: ships because the build refuses a new plan while one is live (T-444).
  switchNote: (date: string) =>
    `To change plans, cancel your current plan and choose the new one after ${date}.`,
  // §4.5 banners and gates
  // AJ-509-M2 (3af1ac4a): until billing ships a payment retry, the past_due banner has no action
  // and points to support. When retry ships, go back to the §4.5 line with "Retry payment".
  paymentFailedHelp: (supportEmail: string) =>
    `Your last payment did not go through. For help, write to ${supportEmail}.`,
  verifyGate: 'Verify your email to subscribe.',
  verifyAction: 'Resend email',
  privacyGate: 'Please review and accept the updated Privacy Policy to continue.',
  privacyAction: 'Review and accept',
  // §5 generic failure
  genericFailure: 'Something did not work. Try again.',
  retry: 'Retry',
} as const;

/** §4.1 plan names. */
export function tierName(tier: PlanTier): string {
  return tier === 'pro' ? 'Pro' : 'Solo';
}

/** §4.1 price line, e.g. `₹799 a month`. Monthly plans only (yearly is hidden, T-399). */
export function planPriceLine(plan: SubscriptionPlan): string {
  return `₹${plan.priceInr.toLocaleString('en-IN')} a month`;
}

/** §4.1 Ink line, e.g. `50 Ink a month`. */
export function planInkLine(plan: SubscriptionPlan): string {
  return `${plan.inkPerCycle} Ink a month`;
}

/** {date} in the copy: `14 Oct 2026`, IST (same format as the Invoices card). */
export function planDate(iso: string | null | undefined): string {
  return iso ? formatInvoiceDate(iso) : '';
}
