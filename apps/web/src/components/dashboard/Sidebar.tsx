'use client';

import { LayoutGrid, Plus, FileText, Layers, Search, Settings } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { SECTION_FINDER_OPEN_EVENT } from '@/components/sections/SectionFinderPanel';
import { useAuth } from '@/context/AuthContext';

// `action: 'open-section-finder'` items dispatch a window event instead of
// routing. The Section Finder lives as a global slide-out panel (SCRUM-83) —
// the sidebar entry just toggles it open.
type NavItem =
  | { href: string; label: string; icon: typeof LayoutGrid; action?: undefined }
  | { action: 'open-section-finder'; label: string; icon: typeof LayoutGrid; href?: undefined };

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/dashboard/new', label: 'New document', icon: Plus },
  { href: '/dashboard/documents', label: 'My documents', icon: FileText },
  { href: '/dashboard/templates', label: 'Templates', icon: Layers },
  { action: 'open-section-finder', label: 'Section finder', icon: Search },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isPro = user?.plan === 'pro';

  return (
    <aside className="flex h-full w-[200px] flex-shrink-0 flex-col bg-[#0F172A]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5">
        <Image
          src="/app-icon.png"
          alt="Lawie"
          width={28}
          height={28}
          className="h-7 w-7 rounded-md"
        />
        <span className="text-[15px] font-semibold text-white">Lawie</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.href ? pathname === item.href : false;
          const className = `relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-colors ${
            isActive
              ? 'bg-white/10 text-white'
              : 'text-[#94A3B8] hover:bg-white/5 hover:text-slate-200'
          }`;

          if (item.action === 'open-section-finder') {
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent(SECTION_FINDER_OPEN_EVENT))}
                className={className}
              >
                <Icon size={14} strokeWidth={2} />
                {item.label}
              </button>
            );
          }
          return (
            <Link key={item.href} href={item.href} className={className}>
              {isActive && (
                <span className="absolute left-0 top-[4px] h-[calc(100%-8px)] w-[3px] rounded-r-full bg-amber-500" />
              )}
              <Icon size={14} strokeWidth={isActive ? 2.5 : 2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      {user && (
        <div className="border-t border-white/10 px-3 py-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ring-2 ${
                isPro ? 'bg-slate-600 ring-green-500' : 'bg-slate-600 ring-amber-500'
              }`}
            >
              {getInitials(user.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-white">Adv. {user.name}</p>
              <p className={`text-[11px] ${isPro ? 'text-green-400' : 'text-slate-400'}`}>
                {isPro ? 'Pro plan' : 'Free plan'}
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
