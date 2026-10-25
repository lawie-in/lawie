import type { Metadata } from 'next';

import { LandingPage } from '@/components/landing/LandingPage';
import { SEO_DESCRIPTION, SEO_TITLE } from '@/components/marketing/nl-copy';

// T-517: the Night Library landing (spec 01). SEO title and description: copy §1.1 (the root
// layout title equals the title, Priya 21 Oct).
export const metadata: Metadata = {
  title: SEO_TITLE,
  description: SEO_DESCRIPTION,
};

export default function HomePage() {
  return <LandingPage />;
}
