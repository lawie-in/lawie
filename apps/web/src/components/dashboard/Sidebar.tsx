'use client';

import { LayoutGrid, Plus, FileText, Layers, Search, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useAuth } from '@/context/AuthContext';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/dashboard/new', label: 'New document', icon: Plus },
  { href: '/dashboard/documents', label: 'My documents', icon: FileText },
  { href: '/dashboard/templates', label: 'Templates', icon: Layers },
  { href: '/dashboard/section-finder', label: 'Section finder', icon: Search },
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
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500">
          {/* Equalizer / waveform icon */}
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
            <rect x="3" y="8" width="2.5" height="5" rx="1" fill="white" />
            <rect x="7" y="5" width="2.5" height="11" rx="1" fill="white" />
            <rect x="11" y="7" width="2.5" height="7" rx="1" fill="white" />
            <rect x="15" y="10" width="2.5" height="4" rx="1" fill="white" />
          </svg>
        </div>
        <span className="text-[15px] font-semibold text-white">Lawie</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-[#94A3B8] hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-[4px] h-[calc(100%-8px)] w-[3px] rounded-r-full bg-amber-500" />
              )}
              <Icon size={14} strokeWidth={isActive ? 2.5 : 2} />
              {label}
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
