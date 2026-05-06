import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BNSS Investigation Timeline Tracker | Custody Limits & Default Bail — Lawie',
  description:
    'Free BNSS investigation timeline calculator for Indian advocates. Enter FIR date and BNS sections to get police custody limits, chargesheet deadline, and default bail eligibility date.',
  keywords: [
    'BNSS investigation timeline',
    'police custody limit BNSS',
    'judicial custody limit',
    'chargesheet deadline calculator',
    'default bail BNSS 187',
    'custody period calculator',
    'BNSS remand rules',
    'investigation timeline tracker',
  ],
};

export default function TimelineTrackerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
