'use client';

/**
 * T-520: the signed-in Night Library top bar for /dashboard. Mark, nav (the Sidebar's labels),
 * Ink chip (hidden until a real balance has arrived) and the avatar menu. The theme toggle lives
 * in the menu, so the TopBar gets showThemeToggle={false} and there is no second header row.
 * Below 720px the TopBar hides the nav; the menu then carries the nav links too, so the bar is
 * mark + Ink chip + menu (spec 3, 5) and the theme toggle is one tap away.
 *
 * The menu is a Radix Popover, not a DropdownMenu: it holds a radio group (the theme toggle), and
 * a menu's roving arrow-key focus would fight the radios.
 */
import * as Popover from '@radix-ui/react-popover';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useRef, useState } from 'react';

import { ThemeToggle } from './ThemeToggle';
import { TopBar } from './TopBar';

import { DASHBOARD_NAV_LABEL } from '@/components/marketing/nl-copy';
import { SECTION_FINDER_OPEN_EVENT } from '@/components/sections/SectionFinderPanel';
import { InkChip } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useCredits } from '@/hooks/useCredits';
import { cn } from '@/lib/cn';

/** Same destinations and labels as components/dashboard/Sidebar.tsx NAV_ITEMS. */
export const DASHBOARD_NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/new', label: 'New document' },
  { href: '/dashboard/documents', label: 'My documents' },
  { href: '/dashboard/templates', label: 'Templates' },
] as const;

/** Sidebar labels for the menu entries. */
export const DASHBOARD_MENU_COPY = {
  sectionFinder: 'Section finder',
  settings: 'Settings',
  logOut: 'Log out',
} as const;

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const NAV_LINK =
  'nl-focus nl-body-sm rounded-nl-md px-nl-3 inline-flex min-h-[44px] items-center font-medium no-underline';
const MENU_ITEM =
  'nl-focus nl-body rounded-nl-sm px-nl-3 text-nl-text [@media(hover:hover)_and_(pointer:fine)]:hover:bg-nl-brass-light flex min-h-[44px] w-full items-center text-left no-underline';

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {DASHBOARD_NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            onClick={onNavigate}
            className={cn(
              onNavigate ? MENU_ITEM : NAV_LINK,
              !onNavigate &&
                (active
                  ? 'text-nl-brass-dark'
                  : 'text-nl-soft [@media(hover:hover)_and_(pointer:fine)]:hover:text-nl-text'),
              onNavigate && active && 'text-nl-brass-dark',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const emailId = useId();
  // Set when the Section finder item closes the menu, so focus is not pulled back to the avatar.
  const openingFinderRef = useRef(false);
  if (!user) return null;
  const close = () => setOpen(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          // No signed copy for a menu label; the user's own name names the button.
          aria-label={user.name || user.email}
          className="nl-focus bg-nl-wood text-nl-text border-nl-line inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border font-medium"
        >
          <span aria-hidden="true" className="nl-body-sm font-medium">
            {initials(user.name || user.email)}
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        {/* T-531 (Rajesh round 2): popovers and dialogs share z-[60], above the consent sheet. */}
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          aria-labelledby={emailId}
          onCloseAutoFocus={(e) => {
            if (openingFinderRef.current) {
              e.preventDefault();
              openingFinderRef.current = false;
            }
          }}
          className="nl nl-root rounded-nl-md border-nl-line bg-nl-card p-nl-2 shadow-nl-card gap-nl-1 z-[60] flex max-h-[var(--radix-popover-content-available-height)] w-[min(320px,calc(100vw-32px))] flex-col overflow-y-auto border"
        >
          <p id={emailId} className="nl-body-sm text-nl-muted px-nl-3 py-nl-2 m-0 break-all">
            {user.email}
          </p>
          <div className="border-nl-line pb-nl-1 flex flex-col border-b min-[720px]:hidden">
            <NavLinks pathname={pathname} onNavigate={close} />
          </div>
          <button
            type="button"
            className={MENU_ITEM}
            onClick={() => {
              openingFinderRef.current = true;
              close();
              window.dispatchEvent(new CustomEvent(SECTION_FINDER_OPEN_EVENT));
            }}
          >
            {DASHBOARD_MENU_COPY.sectionFinder}
          </button>
          <Link href="/dashboard/settings" onClick={close} className={MENU_ITEM}>
            {DASHBOARD_MENU_COPY.settings}
          </Link>
          <div className="border-nl-line px-nl-3 py-nl-2 border-y">
            <ThemeToggle />
          </div>
          <button
            type="button"
            className={MENU_ITEM}
            onClick={() => {
              close();
              logout();
            }}
          >
            {DASHBOARD_MENU_COPY.logOut}
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function DashboardTopBar() {
  const pathname = usePathname() ?? '';
  const { balance, loaded } = useCredits();
  const inkKnown = loaded && Number.isFinite(balance.totalInk);
  return (
    <TopBar
      // T-531: pinned at every width (one 64px row); publishes --nl-bar-h for scroll padding.
      sticky
      variant="signed-in"
      homeHref="/dashboard"
      showThemeToggle={false}
      nav={<NavLinks pathname={pathname} />}
      // T-531: named (Ajay-signed); TopBar renders it from 720px, where its links show.
      navLabel={DASHBOARD_NAV_LABEL.en}
      inkChip={inkKnown ? <InkChip balance={balance.totalInk} /> : undefined}
      menu={<AccountMenu />}
    />
  );
}
