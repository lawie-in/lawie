'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';

import ConfirmCloseAccountDialog from '@/components/account/ConfirmCloseAccountDialog';
import { GST_STATE_NAG_STRINGS, GstStatePicker } from '@/components/billing/GstStatePicker';
import { InvoicesCard, type InvoiceRow } from '@/components/billing/InvoicesCard';
import { PlanUpgrade } from '@/components/billing/PlanUpgrade';
import { secondaryButton } from '@/components/intake/ui';
import { useAuth } from '@/context/AuthContext';
import { useCredits } from '@/hooks/useCredits';
import { useGstState } from '@/hooks/useGstState';

/**
 * T-372 (ADR-025 D3): Ink is the only entitlement shown. The line is left out
 * while the balance is loading or unknown, never showing the empty default's 0.
 * Its own component, so the balance is fetched only where the line can show.
 */
/** T-115c — secondaryButton in the error colour (Rajesh's spec §1); no new colours. */
const closeButtonClass = secondaryButton.replace(
  'border-brand-navy text-brand-navy',
  'border-brand-error text-brand-error',
);

/** The settings Plan block's State select (the nag focuses it). */
const SETTINGS_GST_SELECT_ID = 'settings-gst-state';

function InkBalanceLine() {
  const { balance, loaded } = useCredits();
  if (!loaded || !Number.isFinite(balance.totalInk)) return null;
  return <p className="mt-1 text-sm text-slate-600">{`You have ${balance.totalInk} Ink`}</p>;
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [closeOpen, setCloseOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // T-436 (b): the State picker sits in the Plan block (spec §2: saved on change).
  const gst = useGstState('gst-state-settings');
  // T-436 (Arjun, 14 Oct): any invoice issued with our State as the fallback.
  const [hasFallbackInvoice, setHasFallbackInvoice] = useState(false);
  const onInvoicesLoaded = useCallback((rows: InvoiceRow[]) => {
    setHasFallbackInvoice(rows.some((r) => r.placeOfSupplySource === 'fallback'));
  }, []);

  if (!user) return null;

  // The nag: no State on file and at least one invoice used the fallback.
  const showStateNag = gst.loaded && gst.savedCode === null && hasFallbackInvoice;

  function focusStatePicker() {
    const el = gst.selectRef.current;
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
  }

  const isPro = user.plan === 'pro';

  function handleSignOut() {
    logout();
    router.replace('/login');
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

      {/* Profile */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Profile</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-slate-500">Name</label>
            <input
              type="text"
              defaultValue={user.name}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Email</label>
            <input
              type="email"
              defaultValue={user.email}
              disabled
              className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Bar Council</label>
            <input
              type="text"
              placeholder="Your State Bar Council"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Enrollment Number</label>
            <input
              type="text"
              placeholder="e.g. D/123/2018"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
            />
          </div>
        </div>
        <button className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700">
          Save changes
        </button>
      </div>

      {/* Plan */}
      <div
        className={`mt-4 rounded-xl border p-6 shadow-sm ${
          isPro ? 'border-[#86EFAC] bg-[#F0FDF4]' : 'border-[#FDE68A] bg-[#FFF7ED]'
        }`}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Plan</h2>
            {isPro ? (
              <>
                <p className="mt-1 text-sm text-slate-700">Pro plan</p>
                <p className="text-xs text-slate-400">Next billing cycle — managed via Razorpay</p>
              </>
            ) : (
              <InkBalanceLine />
            )}
          </div>
          {isPro && (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              Active
            </span>
          )}
        </div>

        {/* T-436 (Madhuri C): the nag, then the State picker, above Upgrade. */}
        {showStateNag && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-700">
            <p>{GST_STATE_NAG_STRINGS.nag}</p>
            <button
              type="button"
              onClick={focusStatePicker}
              className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-white"
            >
              {GST_STATE_NAG_STRINGS.action}
            </button>
          </div>
        )}
        <GstStatePicker gst={gst} id={SETTINGS_GST_SELECT_ID} className="mt-4 max-w-xs" />

        {!isPro && <PlanUpgrade gst={gst} />}

        {isPro && (
          <div className="mt-4 flex gap-2">
            <button className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50">
              Cancel subscription
            </button>
            <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50">
              Manage on Razorpay
            </button>
          </div>
        )}
      </div>

      {/* T-436 — Invoices (Rajesh's spec, as settled by Arjun): after Plan, before Close account. */}
      <InvoicesCard onRowsLoaded={onInvoicesLoaded} />

      {/* T-115c — Close account (Rajesh's spec §1): below Plan, above Sign out, apart from both
          so it is not hit by mistake. Strings: Madhuri, dpdp-ui-strings-t115.md B. */}
      <section
        aria-labelledby="close-account-heading"
        className="mt-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 id="close-account-heading" className="text-sm font-semibold text-slate-700">
          Close account
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Close your Lawie account. You will be asked to confirm first.
        </p>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={() => setCloseOpen(true)}
          className={`${closeButtonClass} mt-4 w-full sm:w-auto`}
        >
          Close account
        </button>
      </section>
      {closeOpen && (
        <ConfirmCloseAccountDialog
          onClose={() => setCloseOpen(false)}
          fallbackFocusRef={closeButtonRef}
        />
      )}

      {/* Sign out */}
      <div className="mt-8 border-t border-slate-200 pt-6">
        <button onClick={handleSignOut} className="text-xs text-slate-400 hover:text-slate-600">
          Sign out of Lawie
        </button>
      </div>
    </div>
  );
}
