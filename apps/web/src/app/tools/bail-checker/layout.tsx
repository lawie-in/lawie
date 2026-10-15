import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getToolFeatures } from '@/lib/features';

export const metadata: Metadata = {
  title: 'Bail Eligibility Checker | BNS Bailable Non-Bailable — Lawie',
  description:
    'Free bail eligibility checker for Indian advocates. Enter BNS or IPC sections to check if an offence is bailable or non-bailable, which court to approach, and which BNSS section to cite.',
  keywords: [
    'bail eligibility checker',
    'bailable non-bailable BNS',
    'BNSS bail section',
    'bail application court',
    'BNS offence classification',
    'IPC to BNS bail',
    'anticipatory bail BNSS 482',
    'regular bail BNSS 480',
  ],
};

// T-375: hidden (404) while its feature switch is off, or the flag can't be read.
export default async function BailCheckerLayout({ children }: { children: React.ReactNode }) {
  const features = await getToolFeatures();
  if (!features.tool_bail_checker) notFound();
  return children;
}
