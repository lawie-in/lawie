/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
// T-223 AC4 (web) — verify-your-email prompt: banner, modal instead of paywall, checkout card.
// Mounted with react-dom/client like PrivacyUpdatePrompt.test.tsx. The component keeps
// module-level state, so every test loads a fresh copy with jest.resetModules().

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Strings typed out independently of the source constant.
// Signed by Ajay: handoff/legal/T-223-verify-email-signed.md (part B) and
// handoff/marketing/copy/verify-email-t223.md part B (all other part-B rows "approved as drafted").
// limitReady: copy file "Additions for Ajay" (13 Oct) — NOT yet signed ("Ajay to check").
const S = {
  title: 'Verify your email',
  resend: 'Resend email',
  sent: 'Email sent to a***@example.com. Check your inbox and your spam folder.',
  wait2: 'Try again in 2 minutes.',
  wait1: 'Try again in 1 minute.',
  already: 'Your email is already verified.',
  networkError: "Couldn't send the email. Check your connection and try again.",
  banner:
    'Verify your email. You need it to receive your 5 sign-up Ink and to buy Ink. We sent a link to a***@example.com.',
  modalTitle: 'Verify your email to continue',
  modalBody: 'Verify your email to receive your 5 sign-up Ink. We sent a link to a***@example.com.',
  checkoutTitle: 'Verify your email before you buy',
  checkoutBody: 'We sent a link to a***@example.com. Verify your email, then come back to buy Ink.',
  limitReady: 'You can resend the email now.',
};
const FULL_EMAIL = 'alice.secret@example.com';

let mockUser: { id: string; email: string } | null;
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, login: jest.fn(), logout: jest.fn(), isLoading: false }),
}));

type Reply = {
  status?: number;
  body?: unknown;
  throws?: boolean;
  headers?: Record<string, string>;
};
type Handler = Reply | ((n: number) => Reply);
let calls: { path: string; method: string; body?: string }[];
let handlers: Record<string, Handler>;

function fakeResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  const make = (): any => ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => JSON.parse(JSON.stringify(body)),
    clone: () => make(),
  });
  return make();
}
function installFetch() {
  calls = [];
  const counts: Record<string, number> = {};
  (global as any).fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    calls.push({ path, method: init.method ?? 'GET', body: init.body as string | undefined });
    counts[path] = (counts[path] ?? 0) + 1;
    const hd = handlers[path];
    const r = typeof hd === 'function' ? hd(counts[path]) : hd;
    if (!r) return fakeResponse(404, {});
    if (r.throws) throw new Error('network');
    return fakeResponse(r.status ?? 200, r.body ?? {}, r.headers);
  });
}

const me = (emailVerified: unknown, hasGoogle: unknown): Reply => ({
  body: { status: 'success', data: { emailVerified, hasGoogle } },
});
const ME_UNVERIFIED = me(false, false);
const RESEND = '/api/auth/verify-email/resend';
const ME = '/api/auth/me';

let h: ReturnType<typeof load>;
let consoleSpies: jest.SpyInstance[];
let fakeTimers = false;

function load() {
  jest.resetModules();
  const React = require('react');
  const { act } = React;
  const { createRoot } = require('react-dom/client');
  const mod = require('../VerifyEmailPrompt');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  // Stands for OneFlow / new/page: on a 402 it asks the component first, then shows the paywall.
  function Harness(): any {
    const [paywall, setPaywall] = React.useState(false);
    return React.createElement(
      'div',
      null,
      React.createElement('main', { id: 'dashboard-main', tabIndex: -1 }),
      React.createElement(mod.default),
      paywall ? React.createElement('div', { 'data-testid': 'paywall' }, 'PAYWALL') : null,
      React.createElement(
        'button',
        {
          id: 'gen',
          onClick: async () => {
            const res = await fetch('/api/documents/generate', { method: 'POST' });
            if (res.status === 402 && (await mod.openVerifyInsteadOfPaywall())) return;
            if (res.status === 402) setPaywall(true);
          },
        },
        'Generate',
      ),
    );
  }

  const flush = () =>
    act(async () => {
      for (let i = 0; i < 12; i += 1) await Promise.resolve();
      if (!fakeTimers) await new Promise((r) => setTimeout(r, 0));
    });
  return {
    React,
    act,
    mod,
    root,
    flush,
    async mount(el?: any) {
      await act(async () => root.render(el ?? React.createElement(Harness)));
      await flush();
    },
    async unmount() {
      await act(async () => root.unmount());
    },
    async click(el: Element) {
      await act(async () => {
        (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flush();
    },
    async esc() {
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      await flush();
    },
  };
}

const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
const banner = () => document.querySelector('[role="region"][aria-label="Verify your email"]');
const byText = (label: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll('button')).find((b) => b.textContent === label) as
    | HTMLButtonElement
    | undefined;
const genBtn = () => document.getElementById('gen') as HTMLButtonElement;
const paywall = () => document.querySelector('[data-testid="paywall"]');
const statusRegions = (root: ParentNode = document) =>
  Array.from(root.querySelectorAll('[role="status"]')) as HTMLElement[];
const alertRegions = (root: ParentNode = document) =>
  Array.from(root.querySelectorAll('[role="alert"]')) as HTMLElement[];
const politeText = (root: ParentNode = document) =>
  statusRegions(root)
    .map((r) => r.textContent)
    .join('|');
const alertText = (root: ParentNode = document) =>
  alertRegions(root)
    .map((r) => r.textContent)
    .join('|');

beforeEach(() => {
  fakeTimers = false;
  mockUser = { id: 'u1', email: FULL_EMAIL };
  handlers = { [ME]: ME_UNVERIFIED };
  installFetch();
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation(() => {}),
  );
  h = load();
});
afterEach(async () => {
  await h.unmount();
  document.body.innerHTML = '';
  jest.useRealTimers();
  consoleSpies.forEach((s) => s.mockRestore());
});

describe('T-223 AC4 — banner (trigger 1)', () => {
  it('shows for an unverified email user with the signed text and a masked address', async () => {
    await h.mount();
    const b = banner() as HTMLElement;
    expect(b).not.toBeNull();
    expect(b.querySelector('p')?.textContent).toBe(S.banner);
    expect(document.body.textContent).not.toContain(FULL_EMAIL);
    expect(document.body.textContent).not.toContain('alice');
    expect(byText(S.resend, b)).toBeDefined();
    expect(b.querySelector('button[aria-label="Close"]')).not.toBeNull();
  });

  it('is hidden for a verified user', async () => {
    handlers[ME] = me(true, false);
    await h.mount();
    expect(banner()).toBeNull();
  });

  it('is hidden for a Google user, even when emailVerified is false', async () => {
    handlers[ME] = me(false, true);
    await h.mount();
    expect(banner()).toBeNull();
  });

  it.each([
    ['500', { status: 500, body: {} }],
    ['network error', { throws: true }],
    ['fields missing', { body: { data: { id: 'u1' } } }],
    ['fields not boolean', me('no', 'no')],
  ])('is hidden when /me fails (%s): fail open', async (_l, reply) => {
    handlers[ME] = reply as Reply;
    await h.mount();
    expect(banner()).toBeNull();
    expect(dialog()).toBeNull();
  });

  it('is hidden when signed out and does not call /me', async () => {
    mockUser = null;
    await h.mount();
    expect(banner()).toBeNull();
    expect(calls.filter((c) => c.path === ME)).toHaveLength(0);
  });

  it('close hides it for the session', async () => {
    await h.mount();
    await h.click(document.querySelector('button[aria-label="Close"]') as Element);
    expect(banner()).toBeNull();
  });

  it('masks a one-character local part and rejects odd input', () => {
    const { maskEmail } = h.mod;
    expect(maskEmail('a@x.in')).toBe('a***@x.in');
    expect(maskEmail('bob@x.in')).toBe('b***@x.in');
    expect(maskEmail(undefined)).toBe('***');
    expect(maskEmail('noatsign')).toBe('***');
  });
});

describe('T-223 AC4 — resend', () => {
  it('202 shows the signed "sent" text with the masked address, in the polite region', async () => {
    handlers[RESEND] = { status: 202, body: {} };
    await h.mount();
    await h.click(byText(S.resend) as Element);
    expect(calls.filter((c) => c.path === RESEND && c.method === 'POST')).toHaveLength(1);
    expect(politeText()).toBe(S.sent);
    expect(alertText()).toBe('');
    expect(document.body.textContent).not.toContain(FULL_EMAIL);
  });

  it('429 with retryAfter 90 says "Try again in 2 minutes." (rounded up) and disables the button', async () => {
    handlers[RESEND] = {
      status: 429,
      body: { error: 'verify_email_rate_limited', message: 'x', retryAfter: 90 },
    };
    await h.mount();
    await h.click(byText(S.resend) as Element);
    expect(alertText()).toBe(S.wait2);
    expect(document.body.textContent).toContain(S.wait2);
    const btn = byText(S.resend) as HTMLButtonElement;
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    // A click while limited sends nothing.
    await h.click(btn);
    expect(calls.filter((c) => c.path === RESEND)).toHaveLength(1);
  });

  it('429 with retryAfter 30 says "Try again in 1 minute."', async () => {
    handlers[RESEND] = { status: 429, body: { retryAfter: 30 } };
    await h.mount();
    await h.click(byText(S.resend) as Element);
    expect(alertText()).toBe(S.wait1);
  });

  it('429 without any wait does not invent one: network-error text', async () => {
    handlers[RESEND] = { status: 429, body: { error: 'verify_email_rate_limited' } };
    await h.mount();
    await h.click(byText(S.resend) as Element);
    expect(alertText()).toBe(S.networkError);
    expect(document.body.textContent).not.toMatch(/Try again in/);
  });

  it('when the wait ends, limit_ready is announced once and Resend works again', async () => {
    fakeTimers = true;
    jest.useFakeTimers();
    let n = 0;
    handlers[RESEND] = () =>
      ++n === 1 ? { status: 429, body: { retryAfter: 90 } } : { status: 202, body: {} };
    await h.mount();
    await h.click(byText(S.resend) as Element);
    expect(alertText()).toBe(S.wait2);
    expect(politeText()).toBe('');

    await h.act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await h.flush();
    expect(politeText()).toBe(''); // not before the wait ends
    const announcements: string[] = [];
    await h.act(async () => {
      jest.advanceTimersByTime(31_000);
    });
    await h.flush();
    announcements.push(politeText());
    // Many more ticks: it must not be announced again, and the region text stays the same node text.
    const region = statusRegions()[0];
    const mutations: string[] = [];
    const mo = new MutationObserver(() => mutations.push(region.textContent ?? ''));
    mo.observe(region, { childList: true, characterData: true, subtree: true });
    await h.act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    await h.flush();
    mo.disconnect();
    expect(announcements).toEqual([S.limitReady]);
    expect(mutations).toEqual([]);
    expect(politeText()).toBe(S.limitReady);
    expect(document.body.textContent).not.toMatch(/Try again in/);
    const btn = byText(S.resend) as HTMLButtonElement;
    expect(btn.getAttribute('aria-disabled')).toBeNull();
    await h.click(btn);
    expect(calls.filter((c) => c.path === RESEND)).toHaveLength(2);
    expect(politeText()).toBe(S.sent);
  });

  it('409 on the banner: the user is now known verified, so the banner goes away', async () => {
    handlers[RESEND] = { status: 409, body: { error: 'already_verified' } };
    await h.mount();
    await h.click(byText(S.resend) as Element);
    // Banner is hidden once the store knows the user is verified; the status text was announced.
    expect(banner()).toBeNull();
  });

  it('409 in the modal shows the signed already-verified text and drops the Resend button', async () => {
    handlers[RESEND] = { status: 409, body: { error: 'already_verified' } };
    handlers['/api/documents/generate'] = { status: 402, body: {} };
    await h.mount();
    await openModal();
    const d = dialog() as HTMLElement;
    await h.click(byText(S.resend, d) as Element);
    expect(politeText(d)).toBe(S.already);
    expect(d.textContent).toContain(S.already);
    expect(byText(S.resend, d)).toBeUndefined();
  });

  it.each([
    ['503', { status: 503, body: {} }],
    ['network error', { throws: true }],
  ])('%s shows the signed network-error text in role=alert', async (_l, reply) => {
    handlers[RESEND] = reply as Reply;
    await h.mount();
    await h.click(byText(S.resend) as Element);
    expect(alertText()).toBe(S.networkError);
    expect(politeText()).toBe('');
  });

  it('while sending the button is aria-busy and aria-disabled, and a second click sends nothing', async () => {
    let release: (v: unknown) => void = () => {};
    (global as any).fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, '');
      calls.push({ path, method: init.method ?? 'GET' });
      if (path === RESEND) {
        await new Promise((r) => (release = r));
        return fakeResponse(202, {});
      }
      return fakeResponse(200, ME_UNVERIFIED.body);
    });
    await h.mount();
    const btn = byText(S.resend) as HTMLButtonElement;
    await h.act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    await h.click(btn);
    expect(calls.filter((c) => c.path === RESEND)).toHaveLength(1);
    await h.act(async () => release(undefined));
    await h.flush();
    expect(politeText()).toBe(S.sent);
  });
});

async function openModal() {
  await h.click(genBtn());
}

describe('T-223 AC4 — trigger 2: 402 shows the verify modal instead of the paywall', () => {
  beforeEach(() => {
    handlers['/api/documents/generate'] = {
      status: 402,
      body: { cost: 1, balance: { total: 0 } },
    };
  });

  it('unverified non-Google user: verify modal, no paywall, signed title and body', async () => {
    await h.mount();
    await openModal();
    const d = dialog() as HTMLElement;
    expect(d).not.toBeNull();
    expect(d.querySelector('h2')?.textContent).toBe(S.modalTitle);
    expect(d.querySelector('#verify-modal-reason')?.textContent).toBe(S.modalBody);
    expect(byText(S.resend, d)).toBeDefined();
    expect(paywall()).toBeNull();
    expect(banner()).toBeNull(); // the modal replaces the banner while open
  });

  it('re-reads /me at the 402 (state may have changed since sign-in)', async () => {
    handlers[ME] = me(true, false); // verified at sign-in: no banner
    await h.mount();
    expect(banner()).toBeNull();
    handlers[ME] = ME_UNVERIFIED;
    await openModal();
    expect(dialog()).not.toBeNull();
    expect(paywall()).toBeNull();
  });

  it('verified user: paywall, no modal', async () => {
    handlers[ME] = me(true, false);
    await h.mount();
    await openModal();
    expect(paywall()).not.toBeNull();
    expect(dialog()).toBeNull();
  });

  it('Google user: paywall, no modal', async () => {
    handlers[ME] = me(false, true);
    await h.mount();
    await openModal();
    expect(paywall()).not.toBeNull();
    expect(dialog()).toBeNull();
  });

  it('/me failing at the 402: paywall (fail open)', async () => {
    await h.mount();
    handlers[ME] = { status: 500, body: {} };
    await openModal();
    expect(paywall()).not.toBeNull();
    expect(dialog()).toBeNull();
  });

  it('a non-402 error never opens the modal', async () => {
    handlers['/api/documents/generate'] = { status: 500, body: {} };
    await h.mount();
    await openModal();
    expect(dialog()).toBeNull();
    expect(paywall()).toBeNull();
  });

  it('openVerifyInsteadOfPaywall resolves true/false per user kind', async () => {
    await h.mount();
    let r: boolean | undefined;
    await h.act(async () => {
      r = await h.mod.openVerifyInsteadOfPaywall();
    });
    expect(r).toBe(true);
    handlers[ME] = me(false, true);
    await h.act(async () => {
      r = await h.mod.openVerifyInsteadOfPaywall();
    });
    expect(r).toBe(false);
  });

  it('focus moves to the modal title; Escape closes it and returns focus to the button', async () => {
    await h.mount();
    genBtn().focus();
    await openModal();
    const d = dialog() as HTMLElement;
    expect(document.activeElement).toBe(d.querySelector('h2'));
    expect(d.getAttribute('aria-describedby')).toBe('verify-modal-reason');
    expect(d.querySelector('button[aria-label="Close"]')).not.toBeNull();
    await h.esc();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(genBtn());
  });

  it('the Close button closes the modal', async () => {
    await h.mount();
    await openModal();
    await h.click(dialog()?.querySelector('button[aria-label="Close"]') as Element);
    expect(dialog()).toBeNull();
  });

  it('the modal has one polite status region and one alert, and the resend status is announced once', async () => {
    handlers[RESEND] = { status: 202, body: {} };
    await h.mount();
    await openModal();
    const d = dialog() as HTMLElement;
    expect(statusRegions(d)).toHaveLength(1);
    expect(alertRegions(d)).toHaveLength(1);
    expect(statusRegions(d)[0].getAttribute('aria-live')).toBe('polite');
    await h.click(byText(S.resend, d) as Element);
    expect(politeText(d)).toBe(S.sent);
    // The visible copy of the same sentence is hidden from assistive tech (no double reading).
    const visible = Array.from(d.querySelectorAll('p')).find((p) => p.textContent === S.sent);
    expect(visible?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('T-223 AC4 — trigger 3: checkout', () => {
  const PLANS = {
    body: {
      topups: [
        { id: 'topup_mini', ink: 10, priceInr: 99, pricePerInkInr: 9.9 },
        { id: 'topup_mid', ink: 30, priceInr: 249, pricePerInkInr: 8.3, badge: 'POPULAR' },
      ],
    },
  };
  const ORDER = '/api/billing/topup/order';
  const PAY = 'Pay with Razorpay';

  async function mountTopUp() {
    const { TopUpModal } = require('../credits/TopUpModal');
    const Privacy = require('../PrivacyUpdatePrompt').default;
    await h.mount(
      h.React.createElement(
        'div',
        null,
        h.React.createElement('main', { id: 'dashboard-main', tabIndex: -1 }),
        h.React.createElement(Privacy),
        h.React.createElement(TopUpModal, { onClose: jest.fn() }),
      ),
    );
  }

  beforeEach(() => {
    handlers['/api/billing/plans'] = PLANS;
  });

  it('billing 403 email_verification_required replaces Pay with the card; the total stays', async () => {
    // /me here is read by the privacy status only, so it carries no T-223 fields.
    handlers[ME] = { body: { data: { needsPrivacyAcceptance: false } } };
    handlers[ORDER] = { status: 403, body: { error: 'email_verification_required' } };
    await mountTopUp();
    expect(byText(PAY)).toBeDefined();
    await h.click(byText(PAY) as Element);
    expect(byText(PAY)).toBeUndefined();
    const card = document.querySelector('section[aria-labelledby="verify-checkout-title"]');
    expect(card).not.toBeNull();
    expect(card?.querySelector('h2')?.textContent).toBe(S.checkoutTitle);
    expect(card?.querySelector('p')?.textContent).toBe(S.checkoutBody);
    expect(byText(S.resend, card as ParentNode)).toBeDefined();
    // The pack and the total stay visible.
    expect(document.body.textContent).toContain('₹249');
    expect(document.body.textContent).toContain("You'll pay");
    // No generic order error is shown for this 403.
    expect(document.body.textContent).not.toContain('email_verification_required');
    expect(document.body.textContent).not.toContain('Order creation failed');
    expect(document.body.textContent).not.toContain(FULL_EMAIL);
  });

  it('the card shows up front (no click) when /me says unverified', async () => {
    handlers[ME] = ME_UNVERIFIED;
    const Prompt = h.mod.default;
    const { TopUpModal } = require('../credits/TopUpModal');
    await h.mount(
      h.React.createElement(
        'div',
        null,
        h.React.createElement(Prompt),
        h.React.createElement(TopUpModal, { onClose: jest.fn() }),
      ),
    );
    expect(byText(PAY)).toBeUndefined();
    expect(
      document.querySelector('section[aria-labelledby="verify-checkout-title"]'),
    ).not.toBeNull();
    expect(document.body.textContent).toContain('₹249');
  });

  it('a verified user keeps the Pay button and sees no card', async () => {
    handlers[ME] = me(true, false);
    const Prompt = h.mod.default;
    const { TopUpModal } = require('../credits/TopUpModal');
    await h.mount(
      h.React.createElement(
        'div',
        null,
        h.React.createElement(Prompt),
        h.React.createElement(TopUpModal, { onClose: jest.fn() }),
      ),
    );
    expect(byText(PAY)).toBeDefined();
    expect(document.querySelector('section[aria-labelledby="verify-checkout-title"]')).toBeNull();
  });

  it('a 403 with a different error code is not treated as verification (shows the server error)', async () => {
    handlers[ME] = { body: { data: { needsPrivacyAcceptance: false } } };
    handlers[ORDER] = { status: 403, body: { error: 'something_else' } };
    await mountTopUp();
    await h.click(byText(PAY) as Element);
    expect(byText(PAY)).toBeDefined();
    expect(document.querySelector('section[aria-labelledby="verify-checkout-title"]')).toBeNull();
    expect(document.body.textContent).toContain('something_else');
  });

  it('privacy first: a privacy 403 opens the privacy flow, not the verify card', async () => {
    handlers[ME] = {
      body: {
        data: {
          privacyVersion: '2026-10-11',
          currentPrivacyVersion: '2026-10-12b',
          needsPrivacyAcceptance: true,
          summary: 'Summary text.',
        },
      },
    };
    handlers[ORDER] = { status: 403, body: { error: 'privacy_reaccept_required' } };
    await mountTopUp();
    // The privacy dialog shows at mount for this user; close it with Escape, then press Pay.
    await h.esc();
    await h.click(byText(PAY) as Element);
    expect(document.querySelector('section[aria-labelledby="verify-checkout-title"]')).toBeNull();
    expect(byText(PAY)).toBeDefined();
    // Privacy handled it: the dialog (or the P7 box) is back.
    const privacyShown =
      dialog()?.querySelector('h2')?.textContent === 'We have updated our Privacy Policy' ||
      document.body.textContent?.includes('Accept the updated Privacy Policy to continue.');
    expect(privacyShown).toBe(true);
  });

  it('isEmailVerificationRequired is true only for 403 + the exact code', async () => {
    const { isEmailVerificationRequired } = h.mod;
    expect(
      await isEmailVerificationRequired(
        fakeResponse(403, { error: 'email_verification_required' }),
      ),
    ).toBe(true);
    expect(
      await isEmailVerificationRequired(fakeResponse(403, { error: 'privacy_reaccept_required' })),
    ).toBe(false);
    expect(
      await isEmailVerificationRequired(
        fakeResponse(402, { error: 'email_verification_required' }),
      ),
    ).toBe(false);
    expect(await isEmailVerificationRequired(fakeResponse(200, {}))).toBe(false);
    const bad = fakeResponse(403, {});
    bad.clone = () => ({
      json: async () => {
        throw new Error('not json');
      },
    });
    expect(await isEmailVerificationRequired(bad)).toBe(false);
  });
});

describe('T-223 AC4 — logging', () => {
  it('no console call contains the address or any part of it, across banner, modal and resend errors', async () => {
    handlers['/api/documents/generate'] = { status: 402, body: {} };
    handlers[RESEND] = { throws: true };
    await h.mount();
    await h.click(byText(S.resend) as Element);
    handlers[RESEND] = { status: 429, body: { retryAfter: 90 } };
    await openModal();
    await h.click(byText(S.resend, dialog() as ParentNode) as Element);
    const all = consoleSpies.flatMap((s) => s.mock.calls).map((c) => JSON.stringify(c));
    for (const line of all) {
      expect(line).not.toContain('alice');
      expect(line).not.toContain('example.com');
    }
  });
});

describe('T-223 AC4 — callers are wired (OneFlow and new/page are too large to mount here)', () => {
  // Static check: the real callers must ask openVerifyInsteadOfPaywall() on a 402 before they set
  // up the paywall. The branch behaviour itself is covered by the trigger 2 tests above.
  const fs = require('fs');
  const path = require('path');
  const src = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

  it('OneFlow: the 402 branch awaits openVerifyInsteadOfPaywall before setPaywall', () => {
    const code = src('components/intake/OneFlow.tsx');
    const i402 = code.indexOf('if (res.status === 402) {');
    const iAsk = code.indexOf('await openVerifyInsteadOfPaywall()', i402);
    const iPay = code.indexOf('setPaywall(', i402);
    expect(i402).toBeGreaterThan(-1);
    expect(iAsk).toBeGreaterThan(i402);
    expect(iAsk).toBeLessThan(iPay);
  });

  it('new/page: the 402 branch awaits openVerifyInsteadOfPaywall before setShowPaywall', () => {
    const code = src('app/dashboard/new/page.tsx');
    const iAsk = code.indexOf('res.status === 402 && (await openVerifyInsteadOfPaywall())');
    const iPay = code.indexOf('setShowPaywall(true)', iAsk);
    expect(iAsk).toBeGreaterThan(-1);
    expect(iPay).toBeGreaterThan(iAsk);
  });

  it('settings: checks the verification 403 for the upgrade call and renders the card', () => {
    // T-370: the upgrade block moved from settings/page.tsx into <PlanUpgrade />.
    const code = src('components/billing/PlanUpgrade.tsx');
    expect(code).toContain('await isEmailVerificationRequired(res)');
    expect(code).toContain('<VerifyEmailCard />');
    expect(src('app/dashboard/settings/page.tsx')).toContain('<PlanUpgrade />');
  });

  it('the dashboard layout mounts the banner', () => {
    expect(src('app/dashboard/layout.tsx')).toMatch(/<VerifyEmailPrompt\s*\/>/);
  });

  it('no console.* in the new source, and no token placed in a path', () => {
    for (const rel of ['components/VerifyEmailPrompt.tsx', 'app/verify-email/page.tsx']) {
      expect(src(rel)).not.toMatch(/console\./);
    }
    expect(src('components/VerifyEmailPrompt.tsx')).not.toMatch(/verify-email\/\$\{/);
  });
});
