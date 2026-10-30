'use client';

/**
 * Admin layout — sidebar shell shared by every /admin/* page.
 *
 * Design source: docs/Admin Panel Design/*.png (founder-only, 2026-05-12).
 *
 * Left rail: brand → workspace nav (Overview / All documents / Users) →
 *            founder tools (Referral codes / Panel review / AI configuration /
 *            Credit ledger) → user pill at the bottom.
 *
 * Right: page content via {children}. Pages handle their own "FOUNDER-ONLY"
 * badge + page title in their own header.
 *
 * Auth gating: this layout is admin-only. We render a 403 fallback when the
 * caller isn't an admin so the contained page never has to repeat the gate.
 */

import {
  AlertTriangle,
  BookOpen,
  Coins,
  FileText,
  Home,
  Loader2,
  Menu,
  Settings2,
  ShieldCheck,
  Tag,
  Ticket,
  TrendingUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/cn';
import { buildLoginRedirect } from '@/lib/safeReturnPath';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  group: 'workspace' | 'monetisation' | 'tools';
}

const NAV: NavItem[] = [
  // WORKSPACE
  { href: '/admin', label: 'Overview', icon: Home, group: 'workspace' },
  { href: '/admin/users', label: 'Users', icon: Users, group: 'workspace' },
  { href: '/admin/documents', label: 'Documents', icon: FileText, group: 'workspace' },
  // MONETISATION
  { href: '/admin/referral-codes', label: 'Referral codes', icon: Tag, group: 'monetisation' },
  { href: '/admin/coupons', label: 'Coupon codes', icon: Ticket, group: 'monetisation' },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: BookOpen, group: 'monetisation' },
  { href: '/admin/revenue', label: 'Revenue', icon: TrendingUp, group: 'monetisation' },
  // TOOLS
  { href: '/admin/credit-ledger', label: 'Ink ledger', icon: Coins, group: 'tools' },
  { href: '/admin/panel-review', label: 'Panel review', icon: ShieldCheck, group: 'tools' },
  { href: '/admin/ai-config', label: 'AI configuration', icon: Settings2, group: 'tools' },
  { href: '/admin/audit-log', label: 'Audit log', icon: ShieldCheck, group: 'tools' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { user, isLoading } = useAuth();
  // T-704: below md the sidebar is a drawer opened from the header toggle.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close the drawer on navigation.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  // ── Auth gating ───────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 size={18} className="animate-spin text-slate-400" />
      </div>
    );
  }
  if (!user) {
    // T-616: come back to this page after signing in (pathname only, never the query).
    if (typeof window !== 'undefined') router.replace(buildLoginRedirect(pathname));
    return null;
  }
  if (user.role !== 'Admin') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-800">Access denied</p>
              <p className="mt-0.5 text-sm text-red-600">
                The admin panel is restricted to Lawie founders.
              </p>
              <Link
                href="/dashboard"
                className="mt-3 inline-block text-xs font-medium text-red-700 underline hover:text-red-900"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const workspaceItems = NAV.filter((n) => n.group === 'workspace');
  const monetisationItems = NAV.filter((n) => n.group === 'monetisation');
  const toolItems = NAV.filter((n) => n.group === 'tools');

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);

  const initials = (user.name ?? user.email)
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* T-704: mobile overlay — tapping it closes the drawer */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar — fixed drawer on mobile, static on desktop ─────────── */}
      <aside
        id="admin-sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-60 flex-col overflow-y-auto border-r border-slate-200 bg-slate-900 text-slate-100 transition-transform duration-200 md:relative md:translate-x-0 md:overflow-visible',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-400 text-sm font-bold text-slate-900">
            L
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Lawie</span>
            <span className="text-[10px] font-medium tracking-[0.18em] text-amber-300">ADMIN</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2">
          <SidebarGroup title="WORKSPACE">
            {workspaceItems.map((it) => (
              <SidebarLink key={it.href} item={it} active={isActive(it.href)} />
            ))}
          </SidebarGroup>
          <SidebarGroup title="MONETISATION">
            {monetisationItems.map((it) => (
              <SidebarLink key={it.href} item={it} active={isActive(it.href)} />
            ))}
          </SidebarGroup>
          <SidebarGroup title="TOOLS">
            {toolItems.map((it) => (
              <SidebarLink key={it.href} item={it} active={isActive(it.href)} />
            ))}
          </SidebarGroup>
        </nav>

        <div className="border-t border-slate-800 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-slate-900">
              {initials}
            </span>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-xs font-semibold">{user.name}</span>
              <span className="truncate text-[10px] text-slate-400">Founder · Admin</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main pane ──────────────────────────────────────────────────── */}
      <main className="min-w-0 flex-1 overflow-x-clip">
        {/* T-704: mobile header with the sidebar toggle */}
        <div className="flex items-center border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            aria-controls="admin-sidebar"
            aria-expanded={sidebarOpen}
            className="text-slate-600"
          >
            <Menu size={20} />
          </button>
          <span className="ml-3 text-sm font-semibold text-slate-800">Lawie</span>
        </div>
        <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">{children}</div>
      </main>
    </div>
  );
}

function SidebarGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="px-3 pb-1 pt-2 text-[10px] font-medium tracking-[0.15em] text-slate-500">
        {title}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'bg-amber-400 text-slate-900'
          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <Icon size={13} />
      {item.label}
    </Link>
  );
}
