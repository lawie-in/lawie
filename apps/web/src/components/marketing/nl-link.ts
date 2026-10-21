// T-517: link styles that match components/ui/Button (primary / ghost, md 44px) for calls to
// action that navigate. Button renders a <button>; a link must stay an <a> (middle click, open
// in new tab), so the same classes are applied to next/link here. Never two primaries in one view.

import { cn } from '@/lib/cn';

const BASE =
  'nl nl-focus gap-nl-2 rounded-nl-md relative inline-flex select-none items-center justify-center ' +
  'font-nl-body text-[15px] font-medium leading-5 no-underline min-h-[44px] py-nl-2 min-w-[44px] px-nl-5 ' +
  'text-center touch-manipulation';

// DESIGN.md Elevation: hover on a primary adds the 4px Brass Soft halo and a 1px lift; nothing
// else lifts. Gated to a hover-capable fine pointer; no lift under reduced motion.
const PRIMARY_HOVER =
  '[@media(hover:hover)_and_(pointer:fine)]:hover:shadow-nl-halo [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-px motion-reduce:[@media(hover:hover)_and_(pointer:fine)]:hover:translate-y-0';

/**
 * T-528: the same primary hover for a real <button> (login submit, Continue): `enabled:` so a
 * disabled or busy button neither halos nor lifts. Matches components/ui/Button. Never on a
 * non-primary.
 */
export const NL_PRIMARY_BUTTON_HOVER =
  '[@media(hover:hover)_and_(pointer:fine)]:enabled:hover:shadow-nl-halo [@media(hover:hover)_and_(pointer:fine)]:enabled:hover:-translate-y-px motion-reduce:[@media(hover:hover)_and_(pointer:fine)]:enabled:hover:translate-y-0';

/**
 * T-528 (Rajesh): Control Line, the at-rest border of a control (inputs, ghost buttons, the
 * consent box, the tab rule). `--line-control` lands in globals.css with T-525; until then it
 * falls back to Line. Cards, dividers, the folio and section hairlines keep `border-nl-line`.
 */
export const CONTROL_LINE = 'border-[color:var(--line-control,var(--line))]';

/**
 * T-528 (Rajesh): hover for a non-primary (ghost link, the login Google button). Border Line ->
 * Brass, ground -> Brass Soft (`nl-brass-light`), 150ms ease via `.nl-focus` (duration and easing);
 * the transition list adds border and background colour to .nl-focus's own properties. No lift,
 * no halo: those stay primary-only. Gated to a hover-capable fine pointer; `:not(:disabled)`, so a
 * disabled button does not react (an <a> always matches). The colour fade stays under reduced
 * motion (it moves nothing); the duration and easing are set here because the `.nl-focus`
 * reduced-motion rule sets `transition: none`.
 */
export const NL_GHOST_HOVER =
  '[transition-property:outline-color,box-shadow,transform,border-color,background-color] duration-150 ease-[ease] ' +
  '[@media(hover:hover)_and_(pointer:fine)]:[&:not(:disabled)]:hover:border-nl-brass [@media(hover:hover)_and_(pointer:fine)]:[&:not(:disabled)]:hover:bg-nl-brass-light';

export function nlLinkButton(variant: 'primary' | 'ghost', className?: string): string {
  return cn(
    BASE,
    variant === 'primary'
      ? cn('bg-nl-brass text-nl-on-brass border border-transparent', PRIMARY_HOVER)
      : cn('bg-transparent text-nl-brass-dark border', CONTROL_LINE, NL_GHOST_HOVER),
    className,
  );
}

/** Inline text link: brass/text, underlined, 44px tall hit area. */
export const NL_TEXT_LINK =
  'nl-focus rounded-nl-sm text-nl-brass-dark inline-flex min-h-[44px] items-center underline underline-offset-4';
