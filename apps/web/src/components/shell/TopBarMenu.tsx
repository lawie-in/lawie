'use client';

/**
 * T-531 (Rajesh, DESIGN.md Navigation): the small-screen menu of the top bar. Below 720px the
 * nav, the theme toggle and the language toggle fold into it, so the bar stays one 64px row.
 * A Radix Popover, not a DropdownMenu, for the same reason as DashboardTopBar's account menu:
 * it holds radio groups and toggle buttons, and a menu's roving arrow-key focus would fight them.
 * The trigger is a 44px icon button; its name never changes, the open state is `aria-expanded`
 * (Radix sets it). Hidden from 720px; if the viewport crosses 720 while it is open, it closes.
 * No open/close animation: DESIGN.md keeps motion literal and rare, and the account menu is still.
 */
import * as Popover from '@radix-ui/react-popover';
import { useState } from 'react';

import { CONTROL_LINE, NL_GHOST_HOVER } from '@/components/ui/hover';
import { useMediaQuery } from '@/components/ui/motion';
import { cn } from '@/lib/cn';

/** The width from which the top bar has room for its own row (the menu is hidden). */
export const TOP_BAR_ROW_QUERY = '(min-width: 720px)';

export interface TopBarMenuProps {
  /** Accessible name of the trigger (signed copy, e.g. "Menu"). */
  label: string;
  children: React.ReactNode;
}

export function TopBarMenu({ label, children }: TopBarMenuProps) {
  const [open, setOpen] = useState(false);
  const wide = useMediaQuery(TOP_BAR_ROW_QUERY, false);
  return (
    <Popover.Root open={open && !wide} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          data-topbar-menu-trigger=""
          className={cn(
            'nl-focus rounded-nl-md text-nl-text inline-flex h-11 w-11 shrink-0 touch-manipulation select-none items-center justify-center border bg-transparent',
            CONTROL_LINE,
            NL_GHOST_HOVER,
            'min-[720px]:hidden',
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
            if ((e.target as HTMLElement).closest('a')) setOpen(false);
          }}
          className="nl nl-root rounded-nl-md border-nl-line bg-nl-card p-nl-3 shadow-nl-card gap-nl-3 z-50 flex max-h-[var(--radix-popover-content-available-height)] w-[min(320px,calc(100vw-32px))] flex-col overflow-y-auto overscroll-contain border"
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
