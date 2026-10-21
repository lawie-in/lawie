'use client';

/**
 * T-531 (Rajesh, DESIGN.md Navigation): the menu of the top bar. It holds what does not fit the
 * one 64px row: the nav, the theme toggle and the language toggle (and on phones Sign in).
 * A Radix Popover, not a DropdownMenu, for the same reason as DashboardTopBar's account menu:
 * it holds radio groups and toggle buttons, and a menu's roving arrow-key focus would fight them.
 * The trigger is a 44px icon button; its name never changes, the open state is `aria-expanded`
 * (Radix sets it). Hidden from `hideFrom` (720 by default; the marketing bar passes 1120, Rajesh
 * round 2); if the viewport crosses it while open, the menu closes and stays closed.
 * Layer (Rajesh round 2): popovers and dialogs share z-[60], above the consent sheet (55) and
 * the bar (30), below toasts (100).
 * No open/close animation: DESIGN.md keeps motion literal and rare, and the account menu is still.
 */
import * as Popover from '@radix-ui/react-popover';
import { useEffect, useRef, useState } from 'react';

import { CONTROL_LINE, NL_GHOST_HOVER } from '@/components/ui/hover';
import { useMediaQuery } from '@/components/ui/motion';
import { cn } from '@/lib/cn';

/** The width from which the top bar has room for its own row (the default `hideFrom`). */
export const TOP_BAR_ROW_QUERY = '(min-width: 720px)';

/** Per `hideFrom`: the query that force-closes the menu and the class that hides the trigger. */
export const TOP_BAR_MENU_HIDE = {
  720: { query: TOP_BAR_ROW_QUERY, className: 'min-[720px]:hidden' },
  1120: { query: '(min-width: 1120px)', className: 'min-[1120px]:hidden' },
} as const;

export type TopBarMenuHideFrom = keyof typeof TOP_BAR_MENU_HIDE;

export interface TopBarMenuProps {
  /** Accessible name of the trigger (signed copy, e.g. "Menu"). */
  label: string;
  /** Width (px) from which the trigger is hidden and the menu force-closed. Default 720. */
  hideFrom?: TopBarMenuHideFrom;
  children: React.ReactNode;
}

export function TopBarMenu({ label, hideFrom = 720, children }: TopBarMenuProps) {
  const hide = TOP_BAR_MENU_HIDE[hideFrom];
  const [open, setOpen] = useState(false);
  const wide = useMediaQuery(hide.query, false);
  // Set when a link inside closed the menu: focus then follows the navigation (a section
  // fragment or a new page), not back to the trigger.
  const closedByLinkRef = useRef(false);

  // Crossing into the wide row closes the menu for good, so it does not reopen on the way back.
  useEffect(() => {
    if (wide) setOpen(false);
  }, [wide]);

  return (
    <Popover.Root open={open && !wide} onOpenChange={(o) => setOpen(o && !wide)}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          data-topbar-menu-trigger=""
          className={cn(
            'nl-focus rounded-nl-md text-nl-text inline-flex h-11 w-11 shrink-0 touch-manipulation select-none items-center justify-center border bg-transparent',
            CONTROL_LINE,
            NL_GHOST_HOVER,
            hide.className,
          )}
        >
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path
              d="M3 5.5h14M3 10h14M3 14.5h14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          aria-label={label}
          data-topbar-menu=""
          // A link inside (Sign in, a section anchor) navigates; the menu closes behind it.
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a')) {
              closedByLinkRef.current = true;
              setOpen(false);
            }
          }}
          onCloseAutoFocus={(e) => {
            if (closedByLinkRef.current) {
              e.preventDefault();
              closedByLinkRef.current = false;
            }
          }}
          className="nl nl-root rounded-nl-md border-nl-line bg-nl-card p-nl-3 shadow-nl-card gap-nl-3 z-[60] flex max-h-[var(--radix-popover-content-available-height)] w-[min(320px,calc(100vw-32px))] flex-col overflow-y-auto overscroll-contain border"
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
