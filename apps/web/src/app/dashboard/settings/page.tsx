'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import ConfirmCloseAccountDialog from '@/components/account/ConfirmCloseAccountDialog';
import { GST_STATE_NAG_STRINGS, GstStatePicker } from '@/components/billing/GstStatePicker';
import { InkHistoryCard } from '@/components/billing/InkHistoryCard';
import { InvoicesCard, type InvoiceRow } from '@/components/billing/InvoicesCard';
import { PaymentHistoryCard } from '@/components/billing/PaymentHistoryCard';
import { PlanPanel } from '@/components/billing/PlanPanel';
import {
  PrivacyBlockedNotice,
  isPrivacyBlocked,
  privacyFetch,
  usePrivacyDescribedBy,
} from '@/components/PrivacyUpdatePrompt';
import {
  SettingsTabList,
  SettingsTabPanel,
  useSettingsTab,
} from '@/components/settings/SettingsTabs';
import { THEME_TOGGLE_COPY, ThemeToggle } from '@/components/shell/ThemeToggle';
import { Button, Card, Input, usePrefersReducedMotion } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useGstState } from '@/hooks/useGstState';
import { apiFetch } from '@/lib/apiFetch';

/** The settings Plan block's State select (the nag focuses it). */
const SETTINGS_GST_SELECT_ID = 'settings-gst-state';

/** T-525: the page h1 names the tablist. */
const SETTINGS_HEADING_ID = 'settings-heading';

/** Card titles (DESIGN.md: Subtitle, Mukta 500 18px, for headings under 20px). */
const CARD_HEADING = 'nl-h3 text-nl-text';

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

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [closeOpen, setCloseOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // T-525: Profile, Plan, Account, Appearance; every panel stays mounted (hidden when inactive).
  // T-646: Billing after Plan (Invoices, Payments, Ink history).
  const [tab, selectTab] = useSettingsTab();
  const reducedMotion = usePrefersReducedMotion();
  // T-436 (b): the State picker sits in the Plan block (spec §2: saved on change).
  const gst = useGstState('gst-state-settings');

  // T-525: a blocked Pay moves focus to the State select (GstStatePicker's focusTick effect). That
  // select lives in the Plan panel; if another tab is showing, show Plan and focus it again once
  // the panel is no longer hidden (a hidden element cannot take focus).
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const { focusTick, selectRef } = gst;
  useEffect(() => {
    if (focusTick === 0 || tabRef.current === 'plan') return undefined;
    selectTab('plan');
    const raf = window.requestAnimationFrame(() => selectRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [focusTick, selectRef, selectTab]);
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
  // The latest rendered field values, so a finished save can see text typed while it ran.
  const profileLatest = useRef<ProfileFields>(profile);
  profileLatest.current = profile;
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
      // Typed during the save: some field no longer matches what was sent (or, for a field not
      // sent, its saved value). Then "Profile saved." would be untrue for what is on screen.
      const latest = profileLatest.current;
      const typedDuringSave = PROFILE_KEYS.some(
        (key) => latest[key].trim() !== (changes[key] ?? profileSaved[key].trim()),
      );
      setProfileSaved((prev) => ({ ...prev, ...changes }));
      // Only settle a field to its trimmed saved value if it still holds what was sent: text
      // typed while the PATCH was in flight is kept (T-510 follow-up).
      setProfile((prev) => {
        const next = { ...prev };
        for (const key of PROFILE_KEYS) {
          const sent = changes[key];
          if (sent !== undefined && prev[key].trim() === sent) next[key] = sent;
        }
        return next;
      });
      setProfileStatus({ kind: typedDuringSave ? 'idle' : 'saved' });
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
    // T-525: the select is in the Plan panel; make sure it is showing before focusing it.
    if (tab !== 'plan') flushSync(() => selectTab('plan'));
    const el = gst.selectRef.current;
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    el.focus({ preventScroll: true });
  }

  function handleSignOut() {
    logout();
    router.replace('/login');
  }

  return (
    <div className="nl min-w-0">
      <h1 id={SETTINGS_HEADING_ID} className="nl-h1 text-nl-text">
        Settings
      </h1>

      <div className="mt-nl-4">
        <SettingsTabList active={tab} onSelect={selectTab} labelledBy={SETTINGS_HEADING_ID} />
      </div>

      {/* Profile (T-510). Behaviour unchanged; boxed inputs (DESIGN.md Inputs: Settings forms). */}
      <SettingsTabPanel id="profile" active={tab}>
        <Card aria-labelledby="profile-heading">
          <h2 id="profile-heading" className={CARD_HEADING}>
            Profile
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleProfileSave();
            }}
          >
            {/* 360 first: one column; two from 640px. Inputs are 16px (no iOS focus zoom). */}
            <div className="mt-nl-4 gap-nl-4 grid grid-cols-1 min-[640px]:grid-cols-2">
              <Input
                id="profile-name"
                label="Name"
                type="text"
                autoComplete="name"
                value={profile.name}
                onChange={(e) => onProfileChange('name', e.target.value)}
              />
              <Input
                id="profile-email"
                label="Email"
                type="email"
                defaultValue={user.email}
                disabled
              />
              <Input
                id="profile-bar-council"
                label="Bar council"
                type="text"
                placeholder="Your State Bar Council"
                value={profile.barCouncil}
                onChange={(e) => onProfileChange('barCouncil', e.target.value)}
              />
              <Input
                id="profile-enrollment-number"
                label="Enrollment number"
                help="As on your Bar Council enrollment certificate"
                type="text"
                placeholder="e.g. D/123/2018"
                value={profile.enrollmentNumber}
                onChange={(e) => onProfileChange('enrollmentNumber', e.target.value)}
              />
            </div>
            {/* T-343: P7 box above the Save button (only after a privacy block). */}
            <div className="mt-nl-5">
              <PrivacyBlockedNotice actionKey={PROFILE_ACTION_KEY} />
            </div>
            <div className="gap-nl-3 flex flex-wrap items-center">
              {/* The panel's one primary (DESIGN.md: The One Primary Rule). */}
              <Button
                type="submit"
                loading={profileStatus.kind === 'saving'}
                aria-describedby={[
                  profileStatus.kind === 'failed' ? 'profile-save-error' : 'profile-save-status',
                  profilePrivacyDescribedBy,
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                Save changes
              </Button>
              <p id="profile-save-status" role="status" className="nl-body-sm text-nl-ok">
                {profileStatus.kind === 'saved' ? PROFILE_SAVED : ''}
              </p>
              {profileStatus.kind === 'failed' && (
                <p id="profile-save-error" role="alert" className="nl-body-sm text-nl-err">
                  {profileStatus.message}
                </p>
              )}
            </div>
          </form>
        </Card>
      </SettingsTabPanel>

      {/* Plan (T-509): status, plan cards and Cancel. Not a Card: PlanPanel brings its own cards
          and cards do not nest (DESIGN.md). T-646: Invoices moved to the Billing tab. */}
      <SettingsTabPanel id="plan" active={tab}>
        <section aria-labelledby="plan-heading">
          <h2 id="plan-heading" className={CARD_HEADING}>
            Plan
          </h2>
          <PlanPanel
            gst={gst}
            gstSlot={
              <div className="gap-nl-4 flex flex-col">
                {/* T-436 (Madhuri C): the nag, then the State picker, above the plan cards. */}
                {showStateNag && (
                  <div className="gap-nl-3 flex flex-wrap items-center">
                    <p className="nl-body text-nl-text">{GST_STATE_NAG_STRINGS.nag}</p>
                    <Button variant="ghost" onClick={focusStatePicker}>
                      {GST_STATE_NAG_STRINGS.action}
                    </Button>
                  </div>
                )}
                <GstStatePicker gst={gst} id={SETTINGS_GST_SELECT_ID} className="max-w-xs" />
              </div>
            }
          />
        </section>
      </SettingsTabPanel>

      {/* T-646 (Rajesh's design §5): Billing is the record. Invoices (T-436, unchanged), then
          Payments, then Ink history. */}
      <SettingsTabPanel id="billing" active={tab}>
        <InvoicesCard onRowsLoaded={onInvoicesLoaded} />
        <PaymentHistoryCard />
        <InkHistoryCard />
      </SettingsTabPanel>

      {/* Account: T-115c Close account (Rajesh's spec §1: apart from Sign out so it is not hit by
          mistake; strings: Madhuri, dpdp-ui-strings-t115.md B), then Sign out. */}
      <SettingsTabPanel id="account" active={tab}>
        <Card aria-labelledby="close-account-heading">
          <h2 id="close-account-heading" className={CARD_HEADING}>
            Close account
          </h2>
          <p className="nl-body-sm mt-nl-1 text-nl-soft">
            Close your Lawie account. You will be asked to confirm first.
          </p>
          {/* T-535: ghost danger, not a fill: one primary per screen; the destructive fill is the
              dialog's. */}
          <Button
            ref={closeButtonRef}
            variant="ghost-danger"
            onClick={() => setCloseOpen(true)}
            className="mt-nl-4 w-full min-[640px]:w-auto"
          >
            Close account
          </Button>
        </Card>

        <div className="border-nl-line pt-nl-6 mt-nl-4 border-t">
          <button
            type="button"
            onClick={handleSignOut}
            className="nl-focus nl-body text-nl-brass-dark inline-flex min-h-[44px] touch-manipulation select-none items-center underline underline-offset-4"
          >
            Sign out
          </button>
        </div>
      </SettingsTabPanel>

      {/* Appearance: Night / Daylight / System (copy §6.4); ThemeProvider persists the choice. */}
      <SettingsTabPanel id="appearance" active={tab}>
        <Card aria-labelledby="appearance-heading">
          <h2 id="appearance-heading" className={CARD_HEADING}>
            Appearance
          </h2>
          <ThemeToggle className="mt-nl-4" help={THEME_TOGGLE_COPY.help} />
        </Card>
      </SettingsTabPanel>

      {closeOpen && (
        <ConfirmCloseAccountDialog
          onClose={() => setCloseOpen(false)}
          fallbackFocusRef={closeButtonRef}
        />
      )}
    </div>
  );
}
