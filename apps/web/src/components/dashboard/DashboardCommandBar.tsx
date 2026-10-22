'use client';

/**
 * T-520 item 8: the command bar on the dashboard. T-524 (Rajesh, 21 Oct): on /dashboard the
 * command bar owns Ctrl/Cmd+K and shows the signed hint. The section finder stays mounted by the
 * dashboard layout (the account menu opens it through its window event) and still registers its
 * own window keydown listener, which this change cannot edit; `hotkeyExclusive` takes the key in
 * the capture phase and stops it, so on /dashboard only the command bar reacts. On every other
 * route this bar is not mounted and the section finder keeps the key.
 *
 * /dashboard/new reads only `?kind=<template_id>` (T-365 AC5; it presets the document when the
 * id is listed, otherwise a plain describe). Quick chips map to the template ids that exist; the
 * chips with no single template go to /dashboard/new with no kind.
 *
 * Draft (Priya, T-520; privacy: no matter text in URLs): the description is written to
 * sessionStorage under DRAFT_PREFILL_KEY (trimmed, max 500 code points, well formed) and the bar
 * goes to plain /dashboard/new. The describe step (Kunal, intake) reads and then clears the key.
 * Blank text writes nothing and removes any stale key. Every storage access is guarded, so
 * private mode or a full quota never stops the navigation.
 */
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { CommandBar, DEFAULT_QUICK_CHIPS, type CommandBarItem } from '@/components/shell';
import { DRAFT_PREFILL_KEY } from '@/lib/draftPrefill';

export const COMMAND_CHIP_HREF: Record<string, string> = {
  'bail-application': '/dashboard/new?kind=bail_regular',
  'legal-notice': '/dashboard/new',
  'written-statement': '/dashboard/new?kind=written_statement',
  plaint: '/dashboard/new',
  'browse-all-templates': '/dashboard/templates',
};

export function commandHref(item: CommandBarItem): string {
  return COMMAND_CHIP_HREF[item.id] ?? '/dashboard/new';
}

/** sessionStorage key for the Draft description; read and cleared by the describe step. */
export { DRAFT_PREFILL_KEY };

/** Longest description carried to /dashboard/new, in code points. */
export const DRAFT_PREFILL_MAX = 500;

/**
 * The description to carry: trimmed, cut to 500 code points (a surrogate pair is never split),
 * and well formed (a lone surrogate becomes U+FFFD). '' when blank.
 */
export function draftPrefill(text: string): string {
  return Array.from(text.trim())
    .slice(0, DRAFT_PREFILL_MAX)
    .map((ch) => {
      const c = ch.charCodeAt(0);
      return ch.length === 1 && c >= 0xd800 && c <= 0xdfff ? '�' : ch;
    })
    .join('');
}

/** Writes (or, for blank text, removes) the prefill key. Never throws. */
export function storeDraftPrefill(text: string): void {
  const value = draftPrefill(text);
  try {
    const storage = typeof window === 'undefined' ? null : window.sessionStorage;
    if (!storage) return;
    if (value) storage.setItem(DRAFT_PREFILL_KEY, value);
    else storage.removeItem(DRAFT_PREFILL_KEY);
  } catch {
    // Private mode, quota or a blocked storage: go on without the prefill.
  }
}

export function DashboardCommandBar({
  className,
  hotkeySuspended = false,
}: {
  className?: string;
  /** T-524: true while an overlay without a focus trap is open (the page's top-up modal). */
  hotkeySuspended?: boolean;
}) {
  const router = useRouter();
  const onSelect = useCallback((item: CommandBarItem) => router.push(commandHref(item)), [router]);
  const onSubmit = useCallback(
    (text: string) => {
      storeDraftPrefill(text);
      router.push('/dashboard/new');
    },
    [router],
  );
  return (
    <CommandBar
      hotkeyExclusive
      hotkeySuspended={hotkeySuspended}
      items={DEFAULT_QUICK_CHIPS}
      quickChips={DEFAULT_QUICK_CHIPS}
      onSelect={onSelect}
      onSubmit={onSubmit}
      className={className}
    />
  );
}
