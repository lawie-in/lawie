// T-517: link styles that match components/ui/Button (primary / ghost, md 44px) for calls to
// action that navigate. Button renders a <button>; a link must stay an <a> (middle click, open
// in new tab), so the same classes are applied to next/link here. Never two primaries in one view.

import { CONTROL_LINE, NL_GHOST_HOVER, NL_PRIMARY_LINK_HOVER } from '@/components/ui/hover';
import { cn } from '@/lib/cn';

const BASE =
  'nl nl-focus gap-nl-2 rounded-nl-md relative inline-flex select-none items-center justify-center ' +
  'font-nl-body text-[15px] font-medium leading-5 no-underline min-h-[44px] py-nl-2 min-w-[44px] px-nl-5 ' +
  'text-center touch-manipulation';

// T-531: the hover rules and Control Line live in components/ui/hover.ts (one copy, shared with
// ui/Button). Re-exported here so this file's importers keep working.
export {
  CONTROL_LINE,
  NL_GHOST_HOVER,
  NL_PRIMARY_BUTTON_HOVER,
  NL_PRIMARY_LINK_HOVER,
} from '@/components/ui/hover';

export function nlLinkButton(variant: 'primary' | 'ghost', className?: string): string {
  return cn(
    BASE,
    variant === 'primary'
      ? cn('bg-nl-brass text-nl-on-brass border border-transparent', NL_PRIMARY_LINK_HOVER)
      : cn('bg-transparent text-nl-brass-dark border', CONTROL_LINE, NL_GHOST_HOVER),
    className,
  );
}

/** Inline text link: brass/text, underlined, 44px tall hit area. */
export const NL_TEXT_LINK =
  'nl-focus rounded-nl-sm text-nl-brass-dark inline-flex min-h-[44px] items-center underline underline-offset-4';
