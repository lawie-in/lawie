'use client';

import { Menu } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { HeaderCreditPill } from '@/components/credits/HeaderCreditPill';
import Sidebar from '@/components/dashboard/Sidebar';
import PrivacyUpdatePrompt, { PrivacyAcceptedStatus } from '@/components/PrivacyUpdatePrompt';
import { SectionFinderPanel } from '@/components/sections/SectionFinderPanel';
import { DashboardTopBar } from '@/components/shell/DashboardTopBar';
import { OfflineBanner } from '@/components/shell/OfflineBanner';
import { Spinner } from '@/components/ui';
import VerifyEmailPrompt from '@/components/VerifyEmailPrompt';
import { useAuth } from '@/context/AuthContext';

/** T-520: only the dashboard home uses the Night Library shell; every other route keeps the legacy one. */
const NIGHT_LIBRARY_PATH = '/dashboard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  const nightLibrary = pathname === NIGHT_LIBRARY_PATH;

  if (nightLibrary) {
    if (isLoading || !user) {
      return (
        <div className="nl nl-root text-nl-brass-dark flex min-h-screen items-center justify-center">
          <Spinner className="h-8 w-8" />
          {/* T-343: mounted while signed out too, so it clears its once-per-sign-in flag. */}
          <PrivacyUpdatePrompt />
        </div>
      );
    }

    return (
      <div className="nl nl-root flex min-h-screen flex-col overflow-x-hidden">
        {/* T-520: signed-in top bar; the theme toggle is in its menu (one header row). */}
        <DashboardTopBar />
        <OfflineBanner />

        {/* T-223: verify-your-email banner under the top bar and the Ink-refusal verify modal. */}
        <VerifyEmailPrompt />

        {/* T-343: id and tabIndex so focus can return here when the privacy prompt closes. */}
        <main id="dashboard-main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          {children}
        </main>

        {/* Section finder: globally mounted; it owns Ctrl/Cmd+K, opened from the account menu. */}
        <SectionFinderPanel />

        <PrivacyUpdatePrompt />
        <PrivacyAcceptedStatus />
      </div>
    );
  }

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        {/* T-343: mounted while signed out too, so it clears its once-per-sign-in flag. */}
        <PrivacyUpdatePrompt />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed on mobile, static on desktop */}
      <div
        className={`fixed inset-y-0 left-0 z-30 transition-transform duration-200 md:relative md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar />
      </div>

      {/* Content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar — mobile menu button + credit pill (visible on all sizes) */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="text-slate-600 md:hidden"
          >
            <Menu size={20} />
          </button>
          <span className="ml-3 text-sm font-semibold text-slate-800 md:hidden">Lawie</span>
          <div className="ml-auto">
            <HeaderCreditPill />
          </div>
        </div>

        {/* T-223: verify-your-email banner under the top bar (unverified email users only) and
            the Ink-refusal verify modal. The privacy dialog (below) is modal over both. */}
        <VerifyEmailPrompt />

        {/* T-343: id and tabIndex so focus can return here when the privacy prompt closes.
            Not "main": app/layout.tsx already has div#main (T-310). */}
        <main
          id="dashboard-main"
          tabIndex={-1}
          className="flex-1 overflow-y-auto p-6 focus:outline-none md:p-8"
        >
          {children}
        </main>
      </div>

      {/* Section finder — globally mounted, lawyer can pop it open from any page */}
      <SectionFinderPanel />

      {/* T-343: privacy re-acceptance prompt (above every shell layer) and the always-present
          polite region that announces P9 after an Accept. */}
      <PrivacyUpdatePrompt />
      <PrivacyAcceptedStatus />
    </div>
  );
}
