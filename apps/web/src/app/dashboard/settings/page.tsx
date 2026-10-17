'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import ConfirmCloseAccountDialog from '@/components/account/ConfirmCloseAccountDialog';
import { GST_STATE_NAG_STRINGS, GstStatePicker } from '@/components/billing/GstStatePicker';
import { InvoicesCard, type InvoiceRow } from '@/components/billing/InvoicesCard';
import { PlanUpgrade } from '@/components/billing/PlanUpgrade';
import { secondaryButton } from '@/components/intake/ui';
import {
  PrivacyBlockedNotice,
  isPrivacyBlocked,
  privacyFetch,
  usePrivacyDescribedBy,
} from '@/components/PrivacyUpdatePrompt';
import { useAuth } from '@/context/AuthContext';
import { useCredits } from '@/hooks/useCredits';
import { useGstState } from '@/hooks/useGstState';
import { apiFetch } from '@/lib/apiFetch';

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

/**
 * T-510 — the Profile card's editable fields. Names agreed with T-507 AC1 (PATCH /api/auth/me).
 * Email is shown read-only and is never sent. Copy: handoff/copy/T-511-copy-v1.md §6.
 */
type ProfileFields = { name: string; barCouncil: string; enrollmentNumber: string };
const PROFILE_KEYS: (keyof ProfileFields)[] = ['name', 'barCouncil', 'enrollmentNumber'];
const PROFILE_SAVE_FAILED = 'Could not save your profile. Try again.';
const PROFILE_SAVED = 'Profile saved.';
// Signed copy §6.3 "Field error": a field that had a saved value was emptied.
const PROFILE_FIELD_ERROR = 'Check this field and try again.';
const PROFILE_ACTION_KEY = 'profile-save';

type ProfileStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'failed'; message: string };

/** The saved profile from GET /me, or null when the body is not what we expect. */
async function fetchProfile(): Promise<Partial<ProfileFields> | null> {
  try {
    const res = await apiFetch('/api/auth/me', { cache: 'no-store' });
    if (!res?.ok) return null;
    const body = (await res.json()) as { data?: unknown };
    const data = body?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const out: Partial<ProfileFields> = {};
    for (const key of PROFILE_KEYS) {
      const v = (data as Record<string, unknown>)[key];
      if (typeof v === 'string') out[key] = v;
    }
    return out;
  } catch {
    return null;
  }
}

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

  // T-510: the Profile card. Controlled fields, prefilled from GET /me (falls back to the
  // session name); Save sends only the changed, non-empty values to PATCH /me.
  const [profile, setProfile] = useState<ProfileFields>({
    name: user?.name ?? '',
    barCouncil: '',
    enrollmentNumber: '',
  });
  const [profileSaved, setProfileSaved] = useState<ProfileFields>({
    name: user?.name ?? '',
    barCouncil: '',
    enrollmentNumber: '',
  });
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>({ kind: 'idle' });
  const profileTouched = useRef<Set<keyof ProfileFields>>(new Set());
  const profileMounted = useRef(true);
  const userId = user?.id ?? null;
  const sessionName = user?.name ?? '';
  // T-343: the P7 box id while a privacy block on this Save is showing.
  const profilePrivacyDescribedBy = usePrivacyDescribedBy(PROFILE_ACTION_KEY);

  useEffect(() => {
    profileMounted.current = true;
    return () => {
      profileMounted.current = false;
    };
  }, []);

  // The session may arrive after the first render: seed the name from it until /me answers.
  useEffect(() => {
    if (!sessionName) return;
    setProfileSaved((prev) => (prev.name ? prev : { ...prev, name: sessionName }));
    setProfile((prev) =>
      prev.name || profileTouched.current.has('name') ? prev : { ...prev, name: sessionName },
    );
  }, [sessionName]);

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      const got = await fetchProfile();
      if (!got || !profileMounted.current) return;
      setProfileSaved((prev) => ({ ...prev, ...got }));
      // Never overwrite a field the user has already started editing.
      setProfile((prev) => {
        const next = { ...prev };
        for (const key of PROFILE_KEYS) {
          const v = got[key];
          if (v !== undefined && !profileTouched.current.has(key)) next[key] = v;
        }
        return next;
      });
    })();
  }, [userId]);

  function onProfileChange(key: keyof ProfileFields, value: string) {
    profileTouched.current.add(key);
    setProfile((prev) => ({ ...prev, [key]: value }));
    if (profileStatus.kind !== 'saving') setProfileStatus({ kind: 'idle' });
  }

  async function handleProfileSave() {
    // Emptying a field that has a saved value is not a save: the PATCH cannot clear it, so
    // block the whole save rather than show "Profile saved." for a value still on file.
    const cleared = PROFILE_KEYS.some((key) => !profile[key].trim() && profileSaved[key].trim());
    if (cleared) {
      setProfileStatus({ kind: 'failed', message: PROFILE_FIELD_ERROR });
      return;
    }
    const changes: Partial<ProfileFields> = {};
    for (const key of PROFILE_KEYS) {
      const v = profile[key].trim();
      if (v && v !== profileSaved[key].trim()) changes[key] = v;
    }
    if (Object.keys(changes).length === 0) {
      setProfileStatus({ kind: 'saved' });
      return;
    }
    setProfileStatus({ kind: 'saving' });
    try {
      const res = await privacyFetch(PROFILE_ACTION_KEY, '/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (!profileMounted.current) return;
      if (isPrivacyBlocked(res)) {
        // The re-accept prompt is showing; nothing was stored. The edits stay on screen.
        setProfileStatus({ kind: 'idle' });
        return;
      }
      if (!res.ok) {
        // Any refusal (400/422/500...) shows only the plain line: server text never reaches
        // the user (e.g. "Only gstStateCode can be changed" before T-507).
        setProfileStatus({ kind: 'failed', message: PROFILE_SAVE_FAILED });
        return;
      }
      setProfileSaved((prev) => ({ ...prev, ...changes }));
      setProfile((prev) => ({ ...prev, ...changes }));
      setProfileStatus({ kind: 'saved' });
    } catch {
      if (profileMounted.current) {
        setProfileStatus({ kind: 'failed', message: PROFILE_SAVE_FAILED });
      }
    }
  }

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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleProfileSave();
          }}
        >
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="profile-name" className="block text-xs font-medium text-slate-500">
                Name
              </label>
              <input
                id="profile-name"
                type="text"
                autoComplete="name"
                value={profile.name}
                onChange={(e) => onProfileChange('name', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
              />
            </div>
            <div>
              <label htmlFor="profile-email" className="block text-xs font-medium text-slate-500">
                Email
              </label>
              <input
                id="profile-email"
                type="email"
                defaultValue={user.email}
                disabled
                className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400"
              />
            </div>
            <div>
              <label
                htmlFor="profile-bar-council"
                className="block text-xs font-medium text-slate-500"
              >
                Bar council
              </label>
              <input
                id="profile-bar-council"
                type="text"
                placeholder="Your State Bar Council"
                value={profile.barCouncil}
                onChange={(e) => onProfileChange('barCouncil', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
              />
            </div>
            <div>
              <label
                htmlFor="profile-enrollment-number"
                className="block text-xs font-medium text-slate-500"
              >
                Enrollment number
              </label>
              <input
                id="profile-enrollment-number"
                type="text"
                placeholder="e.g. D/123/2018"
                aria-describedby="profile-enrollment-number-help"
                value={profile.enrollmentNumber}
                onChange={(e) => onProfileChange('enrollmentNumber', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
              />
              <p id="profile-enrollment-number-help" className="mt-1 text-xs text-slate-500">
                As on your Bar Council enrollment certificate
              </p>
            </div>
          </div>
          {/* T-343: P7 box above the Save button (only after a privacy block). */}
          <div className="mt-5">
            <PrivacyBlockedNotice actionKey={PROFILE_ACTION_KEY} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={profileStatus.kind === 'saving'}
              aria-describedby={[
                profileStatus.kind === 'failed' ? 'profile-save-error' : 'profile-save-status',
                profilePrivacyDescribedBy,
              ]
                .filter(Boolean)
                .join(' ')}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save changes
            </button>
            <p id="profile-save-status" role="status" className="text-brand-teal-dark text-xs">
              {profileStatus.kind === 'saved' ? PROFILE_SAVED : ''}
            </p>
            {profileStatus.kind === 'failed' && (
              <p id="profile-save-error" role="alert" className="text-brand-error text-xs">
                {profileStatus.message}
              </p>
            )}
          </div>
        </form>
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
