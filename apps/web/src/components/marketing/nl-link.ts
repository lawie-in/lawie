// T-517: link styles that match components/ui/Button (primary / ghost, md 44px) for calls to
// action that navigate. Button renders a <button>; a link must stay an <a> (middle click, open
// in new tab), so the same classes are applied to next/link here. Never two primaries in one view.

import { cn } from '@/lib/cn';

const BASE =
  'nl nl-focus gap-nl-2 rounded-nl-md relative inline-flex select-none items-center justify-center ' +
  'font-nl-body text-[15px] font-medium leading-5 no-underline min-h-[44px] py-nl-2 min-w-[44px] px-nl-5 ' +
  '[@media(hover:hover)_and_(pointer:fine)]:hover:shadow-nl-halo [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-px motion-reduce:[@media(hover:hover)_and_(pointer:fine)]:hover:translate-y-0 text-center touch-manipulation';

export function nlLinkButton(variant: 'primary' | 'ghost', className?: string): string {
  return cn(
    BASE,
    variant === 'primary'
      ? 'bg-nl-brass text-nl-on-brass border border-transparent'
      : 'bg-transparent text-nl-brass-dark border border-nl-line',
    className,
  );
}

/** Inline text link: brass/text, underlined, 44px tall hit area. */
export const NL_TEXT_LINK =
  'nl-focus rounded-nl-sm text-nl-brass-dark inline-flex min-h-[44px] items-center underline underline-offset-4';
