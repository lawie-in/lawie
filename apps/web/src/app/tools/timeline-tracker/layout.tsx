import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getToolFeatures } from '@/lib/features';

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

// T-375: hidden (404) while its feature switch is off, or the flag can't be read.
export default async function TimelineTrackerLayout({ children }: { children: React.ReactNode }) {
  const features = await getToolFeatures();
  if (!features.tool_timeline) notFound();
  return children;
}
