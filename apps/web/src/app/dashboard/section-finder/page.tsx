'use client';

import { SectionFinderPanel } from '@/components/sections/SectionFinderPanel';

export default function SectionFinderPage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Section finder</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Search BNS, BNSS, BSA, and the old IPC / CrPC / IEA sections. Auto-detects either
          direction. The same panel is available as a slide-out drawer from any drafting screen.
        </p>
      </div>
      <SectionFinderPanel inline />
    </div>
  );
}
