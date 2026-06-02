'use client';

/**
 * Shared header used by every /admin/* page. Renders:
 *   [FOUNDER-ONLY] · <eyebrow>
 *   <Title>
 *                                                                  [Action button]
 *
 * Action area is open — pass children to drop in any button(s). Eyebrow is the
 * short status line under the pill (e.g. "Real-time credit accounting · 247
 * active advocates" on the credit ledger).
 */

import React from 'react';

interface AdminPageHeaderProps {
  title: string;
  eyebrow?: string;
  /** Optional right-aligned status indicator (e.g. "Service healthy" green dot) */
  statusBadge?: React.ReactNode;
  /** Right-aligned action(s) below the status badge */
  children?: React.ReactNode;
}

export function AdminPageHeader({ title, eyebrow, statusBadge, children }: AdminPageHeaderProps) {
  return (
    <header className="mb-8 flex items-start justify-between gap-6">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em]">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
            FOUNDER-ONLY
          </span>
          {eyebrow && (
            <span className="text-slate-400">
              <span className="px-1">·</span>
              {eyebrow}
            </span>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        {statusBadge}
        {children}
      </div>
    </header>
  );
}

/** Green-dot "Service healthy" badge — reused on AI config + credit ledger. */
export function ServiceHealthyBadge({ label = 'Service healthy' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-[11px] font-medium text-green-700">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      {label}
    </span>
  );
}
