// T-531 (Rajesh, DESIGN.md Buttons and Elevation): the one source of the button hover rules, for
// ui/Button and for the link-styled calls to action in components/marketing/nl-link.ts (which
// re-exports these, so ui never imports from marketing). Every rule is gated to a hover-capable
// fine pointer, so a tap on a phone never leaves a stuck hover. T-622: every button rule is also
// gated to `:not([aria-disabled=true])`, so a focusable but inert (aria-disabled) button does not
// halo, lift or change ground either.
// - Primary: the 4px Brass Soft halo and a 1px lift, 150ms ease (via `.nl-focus`). No lift under
//   reduced motion. Nothing else lifts or halos.
// - Ghost (and the Google button, and any ghost-styled link): border Line -> Brass, ground ->
//   Brass Soft, 150ms. No lift, no halo.
// - Destructive (T-544, Rajesh T-531 F2): ground Oxblood -> Oxblood High, 150ms. No lift, no halo.

/**
 * Primary hover for a link (`<a>` has no :disabled). T-517: matches the Button primary hover.
 */
export const NL_PRIMARY_LINK_HOVER =
  '[@media(hover:hover)_and_(pointer:fine)]:hover:shadow-nl-halo [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-px motion-reduce:[@media(hover:hover)_and_(pointer:fine)]:hover:translate-y-0';

/**
 * T-528: primary hover for a real <button> (ui/Button primary, login submit, Continue): `enabled:`
 * so a disabled or busy button neither halos nor lifts. Never on a non-primary.
 */
export const NL_PRIMARY_BUTTON_HOVER =
  '[@media(hover:hover)_and_(pointer:fine)]:[&:not([aria-disabled=true])]:enabled:hover:shadow-nl-halo [@media(hover:hover)_and_(pointer:fine)]:[&:not([aria-disabled=true])]:enabled:hover:-translate-y-px motion-reduce:[@media(hover:hover)_and_(pointer:fine)]:[&:not([aria-disabled=true])]:enabled:hover:translate-y-0';

/**
 * T-528 (Rajesh): Control Line, the at-rest border of a control (inputs, ghost buttons, the
 * consent box, the tab rule), falling back to Line. Cards, dividers, the folio and section
 * hairlines keep `border-nl-line`.
 */
export const CONTROL_LINE = 'border-[color:var(--line-control,var(--line))]';

/**
 * T-528 (Rajesh): hover for a non-primary (ui/Button ghost, a ghost link, the login Google
 * button). Border -> Brass, ground -> Brass Soft (`nl-brass-light`), 150ms ease; the transition
 * list adds border and background colour to `.nl-focus`'s own properties. No lift, no halo.
 * `:not(:disabled)`, so a disabled button does not react (an <a> always matches). The colour fade
 * stays under reduced motion (it moves nothing); duration and easing are set here because the
 * `.nl-focus` reduced-motion rule sets `transition: none`.
 */
export const NL_GHOST_HOVER =
  '[transition-property:outline-color,box-shadow,transform,border-color,background-color] duration-150 ease-[ease] ' +
  '[@media(hover:hover)_and_(pointer:fine)]:[&:not([aria-disabled=true])]:[&:not(:disabled)]:hover:border-nl-brass [@media(hover:hover)_and_(pointer:fine)]:[&:not([aria-disabled=true])]:[&:not(:disabled)]:hover:bg-nl-brass-light';

/**
 * T-544 (Rajesh, T-531 F2): hover for the filled destructive ui/Button. Ground Oxblood -> Oxblood
 * High (`nl-ox-hi`), 150ms ease; the transition list adds background colour to `.nl-focus`'s own
 * properties (so the focus ring keeps its transition). `enabled:`, so a disabled or busy button
 * does not react. The colour fade stays under reduced motion (it moves nothing). No lift, no halo.
 */
export const NL_DESTRUCTIVE_HOVER =
  '[transition-property:outline-color,box-shadow,transform,background-color] duration-150 ease-[ease] ' +
  '[@media(hover:hover)_and_(pointer:fine)]:[&:not([aria-disabled=true])]:enabled:hover:bg-nl-ox-hi';
