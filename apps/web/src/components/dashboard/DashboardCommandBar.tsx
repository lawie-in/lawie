'use client';

/**
 * T-520 item 8: the command bar on the dashboard. `hotkey={false}` because the section finder
 * (mounted by the dashboard layout) owns Ctrl/Cmd+K.
 *
 * /dashboard/new reads only `?kind=<template_id>` (T-365 AC5; it presets the document when the
 * id is listed, otherwise a plain describe). Quick chips map to the template ids that exist; the
 * chips with no single template go to /dashboard/new with no kind.
 *
 * Draft (Priya, T-520): /dashboard/new?q=<text>, the trimmed text capped at 500 characters;
 * blank text goes to plain /dashboard/new. /dashboard/new does not read `q` yet.
 */
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

import { CommandBar, DEFAULT_QUICK_CHIPS, type CommandBarItem } from '@/components/shell';

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

/** Longest description carried in `?q=`. */
export const COMMAND_QUERY_MAX = 500;

/**
 * Draft target: `/dashboard/new?q=<text>` (trimmed, max 500 code points, so a surrogate pair is
 * never split), or `/dashboard/new` if blank. A lone surrogate typed into the input would make
 * encodeURIComponent throw; then the text is made well formed (String.prototype.toWellFormed,
 * where available) and encoded again, falling back to plain /dashboard/new.
 */
export function submitHref(text: string): string {
  const q = Array.from(text.trim()).slice(0, COMMAND_QUERY_MAX).join('');
  if (!q) return '/dashboard/new';
  try {
    return `/dashboard/new?q=${encodeURIComponent(q)}`;
  } catch {
    const wellFormed = (q as string & { toWellFormed?: () => string }).toWellFormed?.();
    if (wellFormed) {
      try {
        return `/dashboard/new?q=${encodeURIComponent(wellFormed)}`;
      } catch {
        // fall through
      }
    }
    return '/dashboard/new';
  }
}

export function DashboardCommandBar({ className }: { className?: string }) {
  const router = useRouter();
  const onSelect = useCallback((item: CommandBarItem) => router.push(commandHref(item)), [router]);
  const onSubmit = useCallback((text: string) => router.push(submitHref(text)), [router]);
  return (
    <CommandBar
      hotkey={false}
      items={DEFAULT_QUICK_CHIPS}
      quickChips={DEFAULT_QUICK_CHIPS}
      onSelect={onSelect}
      onSubmit={onSubmit}
      className={className}
    />
  );
}
