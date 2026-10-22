'use client';

// T-511 part A: Button (spec 3). primary (brass fill, on-brass text), ghost (brass/text, 1px
// Control Line), destructive (ox/fill, white). md 44px, sm 36px (its hit area is padded to 44px).
// Focus ring 2px brass offset 3px; disabled .5; loading swaps the label for a spinner and holds
// the width. Never two primaries on one screen.
// T-535 (Rajesh): ghost-danger (Rust text + 1px Rust border, transparent; hover Rust Soft, no
// lift, no halo) for the triggers of destructive flows (Close account, Cancel plan). The filled
// Oxblood destructive stays inside confirm dialogs only.
// T-531 (Rajesh, DESIGN.md Buttons): hover per variant, from ui/hover.ts (shared with nl-link).
// Only primary lifts 1px with the 4px Brass Soft halo. Ghost: border to Brass, ground to Brass
// Soft, 150ms, no lift, no halo. Destructive does not lift or glow. Every hover is gated to a
// hover-capable fine pointer and to an enabled button.

import { forwardRef } from 'react';

import { NL_GHOST_HOVER, NL_PRIMARY_BUTTON_HOVER } from './hover';

import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'ghost' | 'destructive' | 'ghost-danger';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Spinner replaces the label (width held); the button is disabled and aria-busy. */
  loading?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-nl-brass text-nl-on-brass border border-transparent ' + NL_PRIMARY_BUTTON_HOVER,
  // T-525: ghost border at rest is Control Line (3:1, WCAG 1.4.11).
  ghost:
    'bg-transparent text-nl-brass-dark border border-[color:var(--line-control)] ' + NL_GHOST_HOVER,
  destructive: 'bg-nl-ox text-white border border-transparent',
  // T-535: hover only where a real pointer hovers (no sticky hover on touch). Forced colours:
  // the system ButtonText/ButtonBorder keep the border visible; the focus ring is .nl-focus.
  'ghost-danger': cn(
    'bg-transparent text-[color:var(--err)] border border-[color:var(--err)]',
    '[@media(hover:hover)_and_(pointer:fine)]:enabled:hover:bg-[color:var(--err-light)]',
    'forced-colors:border-[color:ButtonBorder] forced-colors:text-[color:ButtonText]',
  ),
};

const SIZE: Record<ButtonSize, string> = {
  md: 'h-11 min-w-[44px] px-nl-5',
  // 36px visual height; the ::before extends the hit area to 44px (targets >= 44px).
  sm: 'h-9 min-w-[44px] px-nl-4 before:absolute before:inset-x-0 before:-inset-y-1 before:content-[""]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    type = 'button',
    className,
    children,
    ...rest
  },
  ref,
) {
  const isDisabled = Boolean(disabled || loading);
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      className={cn(
        'nl nl-focus gap-nl-2 rounded-nl-md relative inline-flex touch-manipulation select-none items-center justify-center whitespace-nowrap',
        'font-nl-body text-[15px] font-medium leading-5',
        'disabled:cursor-not-allowed disabled:opacity-50',
        loading && 'disabled:cursor-progress',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {/* opacity, not visibility: the label stays the accessible name while loading. */}
      <span className={cn('gap-nl-2 inline-flex items-center', loading && 'opacity-0')}>
        {children}
      </span>
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <Spinner />
        </span>
      ) : null}
    </button>
  );
});

/** 16px ring spinner in the current text colour. Static under reduced motion. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      className={cn('animate-spin motion-reduce:animate-none', className)}
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="2"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
