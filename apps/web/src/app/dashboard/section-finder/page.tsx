'use client';

import { Search } from 'lucide-react';

export default function SectionFinderPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Section finder</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Search BNS, BNSS, and BSA sections by keyword or number.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <Search size={22} className="text-slate-400" />
        </div>
        <p className="mt-4 text-sm font-medium text-slate-700">Coming soon</p>
        <p className="mt-1 text-xs text-slate-400">
          Section finder will let you search across BNS 2023, BNSS 2023, and BSA 2023 by keyword,
          offence type, or section number.
        </p>
      </div>
    </div>
  );
}
