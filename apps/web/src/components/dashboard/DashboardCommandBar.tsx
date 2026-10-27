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
 * id is listed, otherwise a plain describe). COMMAND_CHIP_KIND is the one place quick chips map to
 * the template ids that exist; COMMAND_CHIP_HREF is derived from it. The chips with no single
 * template go to /dashboard/new with no kind; "Browse all templates" goes to /dashboard/templates.
 *
 * Draft (Priya, T-520; privacy: no matter text in URLs): the description is written to
 * sessionStorage under DRAFT_PREFILL_KEY (trimmed, max DESCRIPTION_MAX UTF-16 units, well formed)
 * and the bar goes to plain /dashboard/new. The describe step (Kunal, intake) reads and then
 * clears the key. Blank text writes nothing and removes any stale key. Every storage access is
 * guarded, so private mode or a full quota never stops the navigation.
 *
 * T-630 (Priya/Arjun): picking a chip or option with text typed stores that text the same way and
 * goes to the chip's page, so the text and the kind both arrive; the kind is the only query
 * param, the text never enters the URL. A pick with the input empty does not touch the key.
 * "Browse all templates" never stores text. Draft with an option highlighted uses that option's
 * kind (none for a chip without one); Draft with nothing highlighted stays plain /dashboard/new.
 * No kind is ever guessed from the typed text.
 */
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { CommandBar, DEFAULT_QUICK_CHIPS, type CommandBarItem } from '@/components/shell';
import { DESCRIPTION_MAX, DRAFT_PREFILL_KEY, capToLimit } from '@/lib/draftPrefill';

const NEW_DRAFT_HREF = '/dashboard/new';
const BROWSE_TEMPLATES_ID = 'browse-all-templates';

/**
 * Quick chip id -> template id for `?kind=`, or null when the chip has no single template. The one
 * place this mapping lives (T-630).
 */
export const COMMAND_CHIP_KIND: Record<string, string | null> = {
  'bail-application': 'bail_regular',
  'legal-notice': null,
  'written-statement': 'written_statement',
  plaint: null,
};

function newDraftHref(kind: string | null | undefined): string {
  return kind ? `${NEW_DRAFT_HREF}?kind=${encodeURIComponent(kind)}` : NEW_DRAFT_HREF;
}

export const COMMAND_CHIP_HREF: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(COMMAND_CHIP_KIND).map(([id, kind]) => [id, newDraftHref(kind)]),
  ),
  [BROWSE_TEMPLATES_ID]: '/dashboard/templates',
};

export function commandHref(item: CommandBarItem): string {
  return COMMAND_CHIP_HREF[item.id] ?? NEW_DRAFT_HREF;
}

/** The kind an item carries to /dashboard/new, or null (no kind, or not a draft chip). */
export function commandKind(item: CommandBarItem): string | null {
  return COMMAND_CHIP_KIND[item.id] ?? null;
}

/** sessionStorage key for the Draft description; read and cleared by the describe step. */
export { DRAFT_PREFILL_KEY };

/** Longest description carried to /dashboard/new, in UTF-16 units (T-608: the page's limit). */
export const DRAFT_PREFILL_MAX = DESCRIPTION_MAX;

/**
 * The description to carry: trimmed, well formed (a lone surrogate becomes U+FFFD), then cut to
 * DRAFT_PREFILL_MAX UTF-16 units at a code point boundary (a surrogate pair is never split).
 * '' when blank.
 */
export function draftPrefill(text: string): string {
  const wellFormed = Array.from(text.trim())
    .map((ch) => {
      const c = ch.charCodeAt(0);
      return ch.length === 1 && c >= 0xd800 && c <= 0xdfff ? '�' : ch;
    })
    .join('');
  return capToLimit(wellFormed, DRAFT_PREFILL_MAX);
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
  const onSelect = useCallback(
    (item: CommandBarItem, query?: string) => {
      // T-630: carry typed text to the draft page; an empty pick and Browse never touch the key.
      if (query && item.id !== BROWSE_TEMPLATES_ID) storeDraftPrefill(query);
      router.push(commandHref(item));
    },
    [router],
  );
  const onSubmit = useCallback(
    (text: string, highlighted?: CommandBarItem) => {
      storeDraftPrefill(text);
      router.push(newDraftHref(highlighted ? commandKind(highlighted) : null));
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
