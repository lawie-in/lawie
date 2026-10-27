// T-642 AC8: the consent fence at the command bar, top-up, subscribe/upgrade, and the BriefStep
// confirm button (Rajesh option a: secondary class while consent is needed, primary otherwise).
// The form page and OneFlow are in app/dashboard/new/__tests__/t642-gate.test.tsx.
import { act, useEffect, useState } from 'react';

import SignupConsentPrompt from '../SignupConsentPrompt';
import { useSubscribe } from '../billing/useSubscribe';
import { TopUpModal } from '../credits/TopUpModal';
import { DashboardCommandBar } from '../dashboard/DashboardCommandBar';
import BriefStep from '../intake/BriefStep';
import type { Brief } from '../intake/briefTypes';
import { primaryButton, secondaryButton } from '../intake/ui';

import {
  cleanupMounted,
  click,
  mount,
  q,
  qa,
  stubMatchMedia,
  typeInto,
} from '@/components/ui/__tests__/nl-test-utils';
import { resetSignupConsent } from '@/lib/signupConsent';
import { useRouter } from 'next/navigation';

let needs = true;
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-642' }, isLoading: false }),
}));
const mockPrivacyFetch = jest.fn();
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  ...jest.requireActual('@/components/PrivacyUpdatePrompt'),
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: (...a: unknown[]) => mockPrivacyFetch(...a),
  usePrivacyDescribedBy: () => undefined,
  onPrivacyAccepted: () => () => {},
}));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  openVerifyIfDraftRefused: async () => false,
  VerifyEmailCard: () => null,
  useNeedsEmailVerification: () => false,
}));

const reply = (body: unknown, status = 200) => ({
  ok: status < 300,
  status,
  json: async () => body,
});
const flush = () =>
  act(async () => {
    for (let i = 0; i < 25; i += 1) await Promise.resolve();
  });
const box = () => q('#signup-consent-box') as HTMLInputElement;
const wait = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const push = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  needs = true;
  stubMatchMedia();
  Element.prototype.scrollIntoView = jest.fn();
  (useRouter as jest.Mock).mockReturnValue({ push });
  window.sessionStorage.clear();
  resetSignupConsent();
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/auth/me')
      return reply({ data: { needsSignupConsent: needs, gstStateCode: '07' } });
    if (path === '/api/billing/plans')
      return reply({ topups: [{ id: 'topup_mid', ink: 30, priceInr: 249, pricePerInkInr: 8.3 }] });
    return reply({ data: { gstStateCode: '07' } });
  });
});
afterEach(() => cleanupMounted());

const sent = (re: RegExp) =>
  [...mockApiFetch.mock.calls, ...mockPrivacyFetch.mock.calls].filter((c) => re.test(String(c[0])));

describe('command bar', () => {
  const submit = () => {
    typeInto(q('[role=combobox]') as HTMLInputElement, 'my matter');
    click(q('button[type=submit]'));
  };
  it('needed: Draft does nothing (no prefill, no navigation) and focuses the checkbox', async () => {
    mount(
      <>
        <SignupConsentPrompt />
        <DashboardCommandBar />
      </>,
    );
    await flush();
    submit();
    await wait(5);
    expect(push).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('lawie:draft-prefill')).toBeNull();
    expect(document.activeElement).toBe(box());
  });
  it('not needed: unchanged', async () => {
    needs = false;
    mount(
      <>
        <SignupConsentPrompt />
        <DashboardCommandBar />
      </>,
    );
    await flush();
    submit();
    expect(push).toHaveBeenCalledWith('/dashboard/new');
    expect(window.sessionStorage.getItem('lawie:draft-prefill')).toBe('my matter');
  });
  it('unknown (no panel mounted): let through', () => {
    mount(<DashboardCommandBar />);
    submit();
    expect(push).toHaveBeenCalledWith('/dashboard/new');
  });
});

describe('TopUpModal handlePurchase', () => {
  const buy = () => qa('button').find((b) => b.textContent === 'Buy') as HTMLButtonElement;
  // The modal is mounted while open, as in the app: onClose unmounts it (Radix then frees the page).
  function Host({ onClose }: { onClose: jest.Mock }) {
    const [openNow, setOpen] = useState(true);
    return (
      <>
        <SignupConsentPrompt />
        {openNow && (
          <TopUpModal
            onClose={() => {
              onClose();
              setOpen(false);
            }}
          />
        )}
      </>
    );
  }
  async function open(onClose: jest.Mock) {
    mount(<Host onClose={onClose} />);
    await flush();
  }
  it('needed: no order request, the modal closes, the checkbox is focused after 50 ms', async () => {
    const onClose = jest.fn();
    await open(onClose);
    await act(async () => void buy().click());
    await flush();
    expect(sent(/order|topup|create/i).filter((c) => !/plans/.test(String(c[0])))).toHaveLength(0);
    expect(mockPrivacyFetch).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    await wait(80);
    expect(document.activeElement).toBe(box());
  });
  it('not needed: the order is sent as before and the modal is not closed by the gate', async () => {
    needs = false;
    mockPrivacyFetch.mockResolvedValue(reply({}, 500));
    const onClose = jest.fn();
    await open(onClose);
    await act(async () => void buy().click());
    await flush();
    expect(mockPrivacyFetch).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('useSubscribe checkout', () => {
  function Harness() {
    const { subscribe } = useSubscribe({ ensureReady: async () => true } as never);
    useEffect(() => {
      (window as unknown as { __sub: (id: string) => void }).__sub = (id) => void subscribe(id);
    }, [subscribe]);
    return null;
  }
  const run = async () => {
    mount(
      <>
        <SignupConsentPrompt />
        <Harness />
      </>,
    );
    await flush();
    await act(
      async () => void (window as unknown as { __sub: (id: string) => void }).__sub('solo'),
    );
    await flush();
  };
  it('needed: no /subscribe, checkbox focused', async () => {
    await run();
    await wait(5);
    expect(mockPrivacyFetch).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(box());
  });
  it('not needed: /subscribe is sent as before', async () => {
    needs = false;
    mockPrivacyFetch.mockResolvedValue(reply({ data: { shortUrl: 'https://rzp.io/x' } }));
    await run();
    expect(mockPrivacyFetch).toHaveBeenCalledWith(
      'subscribe',
      '/api/billing/subscribe',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('BriefStep confirm button (Rajesh option a)', () => {
  const brief: Brief = {
    kind: { id: 'k', name: 'Notice', court_document: false },
    court: { state: null, court_type: null, court: null },
    items: [],
    loose_dates: [],
    unplaced: [],
    still_unknown: [],
    can_confirm: true,
    confirm_blockers: [],
    confirm_message: null,
  } as Brief;
  const noop = jest.fn();
  const confirmBtn = () =>
    qa('button').find((b) => (b.textContent ?? '').includes('Confirm brief and continue'))!;
  const render = async () => {
    mount(
      <>
        <SignupConsentPrompt />
        <BriefStep
          brief={brief}
          busy={false}
          confirming={false}
          message={null}
          questionsLeft={0}
          onValue={noop}
          onCourt={noop}
          onKindName={noop}
          onPlaceDate={noop}
          onChangeDocument={noop}
          onMoreQuestions={noop}
          onEditDescription={noop}
          onCancel={noop}
          onConfirm={noop}
        />
      </>,
    );
    await flush();
  };
  it('needed: secondary styling, same label', async () => {
    await render();
    const c = confirmBtn();
    expect(c.className).toContain('border-brand-navy');
    expect(c.className).not.toContain('bg-brand-navy');
    expect(c.className).toContain('min-h-[48px]');
    expect(c.textContent).toBe('Confirm brief and continue');
    expect(secondaryButton).toContain('border-brand-navy');
  });
  it('not needed: primary styling, same label', async () => {
    needs = false;
    await render();
    const c = confirmBtn();
    for (const cls of primaryButton.split(' ').slice(0, 3)) expect(c.className).toContain(cls);
    expect(c.className).not.toContain('border-brand-navy');
    expect(c.textContent).toBe('Confirm brief and continue');
  });
});
