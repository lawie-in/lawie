/* eslint-disable @typescript-eslint/no-explicit-any */
// Makes this file a module so its top-level names do not clash with other test files under tsc.
export {};
// T-223 AC4, reworked for T-522 — the verify bar (not dismissible), the draft refusal dialog
// (M6, Draft, Top-up and Subscribe), the S3 referral notice. Landing states: app/verify-email/__tests__.
// Mounted with react-dom/client. The component keeps module-level state, so every test loads a
// fresh copy (jest.resetModules, then dynamic imports; no require).
import * as fs from 'fs';
import * as path from 'path';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Strings typed out independently of the source constant, copied from
// handoff/legal/T-511-copy-rulings-ajay.md (origin/develop_staging) and the T-223 signed rows.
const S = {
  resend: 'Resend email', // AJ-522-M3 button
  // AJ-522-M3 (full) and AJ-522-S11 (the account that already had its sign-up Ink)
  m3: 'Verify your email to start drafting, buy Ink and receive your 5 sign-up Ink. We sent a link to a***@example.com.',
  s11: 'Verify your email to start drafting and buy Ink. We sent a link to a***@example.com.',
  sent: 'Email sent. Check your inbox and spam folder.', // AJ-522-M4
  wait: 'Please wait before asking for another email.', // AJ-522-M4 (generic)
  ready: 'You can resend the email now.', // AJ-522-S6 end of wait
  failed: "Couldn't send the email. Check your connection and try again.", // AJ-522-S8
  retry: 'Retry', // AJ-522-S8
  modalTitle: 'Verify your email to continue', // AJ-522-M6 (T-223)
  modalBody: 'Verify your email to start drafting. We sent a link to a***@example.com.', // AJ-522-M6
  notNow: 'Not now', // AJ-522-S14
  referral: 'Your referral code was not valid, so no bonus Ink was added.', // AJ-522-S3
  topupBody: 'Verify your email to buy Ink.', // AJ-522-M6 Top-up
  subscribeBody: 'Verify your email to subscribe.', // AJ-522-M6 Subscribe
  // The T-223 lines that AJ-522-M3 and M6 replaced: they must never render again.
  oldBanner:
    'Verify your email. You need it to receive your 5 sign-up Ink and to buy Ink. We sent a link to a***@example.com.',
  oldModalBody:
    'Verify your email to receive your 5 sign-up Ink. We sent a link to a***@example.com.',
};
const FULL_EMAIL = 'alice.secret@example.com';

let mockUser: { id: string; email: string } | null;
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, login: jest.fn(), logout: jest.fn(), isLoading: false }),
}));
const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/dashboard',
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
    const p = String(url).replace(/^https?:\/\/[^/]+/, '');
    calls.push({ path: p, method: init.method ?? 'GET', body: init.body as string | undefined });
    counts[p] = (counts[p] ?? 0) + 1;
    const hd = handlers[p];
    const r = typeof hd === 'function' ? hd(counts[p]) : hd;
    if (!r) return fakeResponse(404, {});
    if (r.throws) throw new Error('network');
    return fakeResponse(r.status ?? 200, r.body ?? {}, r.headers);
  });
}

const me = (
  emailVerified: unknown,
  hasGoogle: unknown,
  extra: Record<string, unknown> = {},
): Reply => ({
  body: { status: 'success', data: { emailVerified, hasGoogle, ...extra } },
});
const ME_UNVERIFIED = me(false, false);
const RESEND = '/api/auth/verify-email/resend';
const ME = '/api/auth/me';
const GENERATE = '/api/documents/generate';

let h: Awaited<ReturnType<typeof load>>;
let consoleSpies: jest.SpyInstance[];
let fakeTimers = false;

async function load() {
  jest.resetModules();
  const React = await import('react');
  const { act } = React;
  const { createRoot } = await import('react-dom/client');
  const mod = await import('../VerifyEmailPrompt');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  // Stands for new/page and OneFlow: on a 403 it asks the component first; on a 402 likewise.
  function Harness(): any {
    const [paywall, setPaywall] = React.useState(false);
    const [done, setDone] = React.useState('');
    return React.createElement(
      'div',
      null,
      React.createElement('main', { id: 'dashboard-main', tabIndex: -1 }),
      React.createElement(mod.default),
      React.createElement(mod.ReferralNotAppliedNotice),
      paywall ? React.createElement('div', { 'data-testid': 'paywall' }, 'PAYWALL') : null,
      done ? React.createElement('div', { 'data-testid': 'done' }, done) : null,
      React.createElement(
        'button',
        {
          id: 'gen',
          onClick: async () => {
            const res = await fetch(GENERATE, { method: 'POST' });
            if (await mod.openVerifyIfDraftRefused(res)) return;
            if (res.status === 402 && (await mod.openVerifyInsteadOfPaywall())) return;
            if (res.status === 402) setPaywall(true);
            else setDone(`status ${res.status}`);
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
    async advance(ms: number) {
      await act(async () => {
        jest.advanceTimersByTime(ms);
      });
      await flush();
    },
  };
}

const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
const bar = () => document.querySelector('[data-kind="verify-email"]') as HTMLElement | null;
const barText = () => bar()?.querySelector('p')?.textContent ?? null;
const byText = (label: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll('button')).find((b) => b.textContent === label) as
    | HTMLButtonElement
    | undefined;
const genBtn = () => document.getElementById('gen') as HTMLButtonElement;
const paywall = () => document.querySelector('[data-testid="paywall"]');
const resendPosts = () => calls.filter((c) => c.path === RESEND && c.method === 'POST');

beforeEach(async () => {
  fakeTimers = false;
  mockUser = { id: 'u1', email: FULL_EMAIL };
  handlers = { [ME]: ME_UNVERIFIED };
  mockRouterPush.mockReset();
  mockRouterReplace.mockReset();
  localStorage.clear();
  installFetch();
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation(() => {}),
  );
  h = await load();
});
afterEach(async () => {
  await h.unmount();
  document.body.innerHTML = '';
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('T-522 — the verify bar (AJ-522-M3, S11)', () => {
  it('shows the signed M3 line for an unverified email user, with a masked address', async () => {
    await h.mount();
    expect(bar()).not.toBeNull();
    expect(barText()).toBe(S.m3);
    expect(document.body.textContent).not.toContain(FULL_EMAIL);
    expect(document.body.textContent).not.toContain('alice');
    expect(byText(S.resend, bar() as HTMLElement)).toBeDefined();
  });

  it('shows the re-signed S11 line when the sign-up Ink was already granted (signupInkGranted)', async () => {
    handlers[ME] = me(false, false, { signupInkGranted: true });
    await h.mount();
    expect(barText()).toBe(S.s11);
    expect(barText()).not.toContain('5 sign-up Ink');
  });

  it('keeps the full M3 line when signupInkGranted is false or absent', async () => {
    handlers[ME] = me(false, false, { signupInkGranted: false });
    await h.mount();
    expect(barText()).toBe(S.m3);
  });

  it('is a role=status region and is not dismissible: no close control of any kind', async () => {
    await h.mount();
    const b = bar() as HTMLElement;
    expect(b.getAttribute('role')).toBe('status');
    expect(b.getAttribute('data-tone')).toBe('warn');
    expect(b.querySelector('button[aria-label]')).toBeNull();
    expect(b.querySelector('button[aria-label="Close"]')).toBeNull();
    expect(Array.from(b.querySelectorAll('button')).map((x) => x.textContent)).toEqual([S.resend]);
    // Escape or any click on the bar does not remove it.
    await h.esc();
    expect(bar()).not.toBeNull();
  });

  it('the old T-223 banner and modal-body lines never render, and are gone from VERIFY_STRINGS', async () => {
    handlers[GENERATE] = { status: 402, body: {} };
    await h.mount();
    await h.click(genBtn());
    const text = document.body.textContent ?? '';
    expect(text).not.toContain(S.oldBanner);
    expect(text).not.toContain(S.oldModalBody);
    expect(text).not.toContain('You need it to receive your 5 sign-up Ink and to buy Ink');
    expect(Object.keys(h.mod.VERIFY_STRINGS)).not.toContain('banner');
    expect(Object.keys(h.mod.VERIFY_STRINGS)).not.toContain('modalBody');
  });

  it('is hidden for a verified user', async () => {
    handlers[ME] = me(true, false);
    await h.mount();
    expect(bar()).toBeNull();
  });

  it('is hidden for a Google user, even when emailVerified is false', async () => {
    handlers[ME] = me(false, true);
    await h.mount();
    expect(bar()).toBeNull();
  });

  it.each([
    ['500', { status: 500, body: {} }],
    ['network error', { throws: true }],
    ['fields missing', { body: { data: { id: 'u1' } } }],
    ['fields not boolean', me('no', 'no')],
  ])('is hidden when /me fails (%s): fail open', async (_l, reply) => {
    handlers[ME] = reply as Reply;
    await h.mount();
    expect(bar()).toBeNull();
    expect(dialog()).toBeNull();
  });

  it('is hidden when signed out and does not call /me', async () => {
    mockUser = null;
    await h.mount();
    expect(bar()).toBeNull();
    expect(calls.filter((c) => c.path === ME)).toHaveLength(0);
  });

  it('masks a one-character local part and rejects odd input', () => {
    const { maskEmail } = h.mod;
    expect(maskEmail('a@x.in')).toBe('a***@x.in');
    expect(maskEmail('bob@x.in')).toBe('b***@x.in');
    expect(maskEmail(undefined)).toBe('***');
    expect(maskEmail('noatsign')).toBe('***');
  });
});

describe('T-522 — the bar resend (AJ-522-M4, S6, S8)', () => {
  it('202: the M4 sent line replaces the M3 line, then the M3 line returns', async () => {
    fakeTimers = true;
    jest.useFakeTimers();
    handlers[RESEND] = { status: 202, body: {} };
    await h.mount();
    await h.click(byText(S.resend) as Element);
    expect(resendPosts()).toHaveLength(1);
    expect(barText()).toBe(S.sent);
    expect(bar()?.getAttribute('role')).toBe('status');
    expect(document.body.textContent).not.toContain(FULL_EMAIL);
    await h.advance(7_000);
    expect(barText()).toBe(S.m3);
  });

  it('429 with a body retryAfter: the M4 wait line, Resend aria-disabled (never disabled), a press does nothing', async () => {
    handlers[RESEND] = {
      status: 429,
      body: { error: 'verify_email_rate_limited', retryAfter: 90 },
    };
    await h.mount();
    await h.click(byText(S.resend) as Element);
    expect(barText()).toBe(S.wait);
    const btn = byText(S.resend) as HTMLButtonElement;
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    expect(btn.hasAttribute('disabled')).toBe(false);
    expect(btn.disabled).toBe(false);
    await h.click(btn);
    await h.click(btn);
    expect(resendPosts()).toHaveLength(1);
    expect(barText()).toBe(S.wait);
  });

  it('429 with a Retry-After header only: the same wait line; it ends after that many seconds', async () => {
    fakeTimers = true;
    jest.useFakeTimers();
    handlers[RESEND] = { status: 429, body: {}, headers: { 'Retry-After': '30' } };
    await h.mount();
    await h.click(byText(S.resend) as Element);
    expect(barText()).toBe(S.wait);
    await h.advance(29_000);
    expect(barText()).toBe(S.wait);
    await h.advance(2_000);
    expect(barText()).toBe(S.ready);
  });

  it('429 with no wait given holds the 2-minute window, then shows the S6 end-of-wait line and Resend works again', async () => {
    fakeTimers = true;
    jest.useFakeTimers();
    let n = 0;
    handlers[RESEND] = () => (++n === 1 ? { status: 429, body: {} } : { status: 202, body: {} });
    await h.mount();
    await h.click(byText(S.resend) as Element);
    expect(barText()).toBe(S.wait);
    await h.advance(119_000);
    expect(barText()).toBe(S.wait);
    await h.advance(2_000);
    expect(barText()).toBe(S.ready);
    const btn = byText(S.resend) as HTMLButtonElement;
    expect(btn.getAttribute('aria-disabled')).toBeNull();
    await h.click(btn);
    expect(resendPosts()).toHaveLength(2);
    expect(barText()).toBe(S.sent);
  });

  it.each([
    ['500', { status: 500, body: {} }],
    ['503', { status: 503, body: {} }],
    ['network error', { throws: true }],
  ])('%s: the S8 failure line with Retry, not the M3 line', async (_l, reply) => {
    handlers[RESEND] = reply as Reply;
    await h.mount();
    await h.click(byText(S.resend) as Element);
    expect(barText()).toBe(S.failed);
    expect(byText(S.retry, bar() as HTMLElement)).toBeDefined();
    expect(byText(S.resend, bar() as HTMLElement)).toBeUndefined();
  });

  it('Retry sends again and a 202 then shows the sent line', async () => {
    let n = 0;
    handlers[RESEND] = () => (++n === 1 ? { status: 500, body: {} } : { status: 202, body: {} });
    await h.mount();
    await h.click(byText(S.resend) as Element);
    await h.click(byText(S.retry) as Element);
    expect(resendPosts()).toHaveLength(2);
    expect(barText()).toBe(S.sent);
  });

  it('while sending: aria-busy and aria-disabled, never disabled, and a second press sends nothing', async () => {
    let release: (v: unknown) => void = () => {};
    (global as any).fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
      const p = String(url).replace(/^https?:\/\/[^/]+/, '');
      calls.push({ path: p, method: init.method ?? 'GET' });
      if (p === RESEND) {
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
    expect(btn.hasAttribute('disabled')).toBe(false);
    await h.click(btn);
    expect(resendPosts()).toHaveLength(1);
    await h.act(async () => release(undefined));
    await h.flush();
    expect(barText()).toBe(S.sent);
    expect(byText(S.resend)?.getAttribute('aria-busy')).toBeNull();
  });

  it('409 (already verified): the bar goes away', async () => {
    handlers[RESEND] = { status: 409, body: { error: 'already_verified' } };
    await h.mount();
    await h.click(byText(S.resend) as Element);
    expect(bar()).toBeNull();
  });
});

describe('T-522 — the draft refusal dialog (AJ-522-M6, S14)', () => {
  beforeEach(() => {
    handlers[GENERATE] = { status: 403, body: { error: 'email_verification_required' } };
  });

  it('a 403 email_verification_required opens the M6 dialog with the signed title and body', async () => {
    await h.mount();
    genBtn().focus();
    await h.click(genBtn());
    const d = dialog() as HTMLElement;
    expect(d).not.toBeNull();
    expect(d.querySelector('h2')?.textContent).toBe(S.modalTitle);
    expect(d.textContent).toContain(S.modalBody);
    expect(byText(S.resend, d)).toBeDefined();
    expect(byText(S.notNow, d)).toBeDefined();
    expect(document.body.textContent).not.toContain(S.oldModalBody);
    expect(document.body.textContent).not.toContain(FULL_EMAIL);
    expect(paywall()).toBeNull();
  });

  it('Not now gets first focus; both buttons are enabled; no redirect', async () => {
    await h.mount();
    await h.click(genBtn());
    const d = dialog() as HTMLElement;
    expect(document.activeElement).toBe(byText(S.notNow, d));
    expect(byText(S.notNow, d)?.hasAttribute('disabled')).toBe(false);
    expect(byText(S.resend, d)?.hasAttribute('disabled')).toBe(false);
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(window.location.pathname).not.toMatch(/login|verify-email/);
  });

  it('Not now and Escape close it; the caller stays where it was', async () => {
    await h.mount();
    await h.click(genBtn());
    await h.click(byText(S.notNow, dialog() as HTMLElement) as Element);
    expect(dialog()).toBeNull();
    expect(genBtn().disabled).toBe(false);
    await h.click(genBtn());
    expect(dialog()).not.toBeNull();
    await h.esc();
    expect(dialog()).toBeNull();
  });

  it('Resend email in the dialog posts once and shows the M4 sent line in the dialog', async () => {
    handlers[RESEND] = { status: 202, body: {} };
    await h.mount();
    await h.click(genBtn());
    const d = dialog() as HTMLElement;
    await h.click(byText(S.resend, d) as Element);
    expect(resendPosts()).toHaveLength(1);
    expect(d.querySelector('[role="status"]')?.textContent).toBe(S.sent);
  });

  it('a 429 in the dialog shows the M4 wait line and a second press sends nothing', async () => {
    handlers[RESEND] = { status: 429, body: { retryAfter: 90 } };
    await h.mount();
    await h.click(genBtn());
    const d = dialog() as HTMLElement;
    await h.click(byText(S.resend, d) as Element);
    expect(d.querySelector('[role="status"]')?.textContent).toBe(S.wait);
    await h.click(byText(S.resend, d) as Element);
    expect(resendPosts()).toHaveLength(1);
  });

  it('a failed resend in the dialog shows the S8 verify-bar failure line', async () => {
    handlers[RESEND] = { status: 500, body: {} };
    await h.mount();
    await h.click(genBtn());
    const d = dialog() as HTMLElement;
    await h.click(byText(S.resend, d) as Element);
    expect(d.querySelector('[role="status"]')?.textContent).toBe(S.failed);
  });

  it('openVerifyIfDraftRefused is true only for 403 plus the exact code, and leaves the body readable', async () => {
    await h.mount();
    const { openVerifyIfDraftRefused } = h.mod;
    const other = fakeResponse(403, { error: 'privacy_reaccept_required' });
    expect(await openVerifyIfDraftRefused(other)).toBe(false);
    expect(await other.json()).toEqual({ error: 'privacy_reaccept_required' });
    expect(dialog()).toBeNull();
    expect(
      await openVerifyIfDraftRefused(fakeResponse(402, { error: 'email_verification_required' })),
    ).toBe(false);
    expect(await openVerifyIfDraftRefused(fakeResponse(200, {}))).toBe(false);
    const notJson = fakeResponse(403, {});
    notJson.clone = () => ({
      status: 403,
      json: async () => {
        throw new Error('not json');
      },
    });
    expect(await openVerifyIfDraftRefused(notJson)).toBe(false);
    expect(dialog()).toBeNull();
    const refused = fakeResponse(403, { error: 'email_verification_required' });
    let result = false;
    await h.act(async () => {
      result = await openVerifyIfDraftRefused(refused);
    });
    expect(result).toBe(true);
    expect(await refused.json()).toEqual({ error: 'email_verification_required' });
    expect(dialog()).not.toBeNull();
  });

  it('a non-verification error never opens the dialog', async () => {
    handlers[GENERATE] = { status: 500, body: {} };
    await h.mount();
    await h.click(genBtn());
    expect(dialog()).toBeNull();
    expect(paywall()).toBeNull();
  });
});

describe('T-223 trigger 2 (kept) — a 402 for an unverified user opens the same dialog, not the paywall', () => {
  beforeEach(() => {
    handlers[GENERATE] = { status: 402, body: { cost: 1, balance: { total: 0 } } };
  });

  it('unverified non-Google user: dialog, no paywall', async () => {
    await h.mount();
    await h.click(genBtn());
    const d = dialog() as HTMLElement;
    expect(d.querySelector('h2')?.textContent).toBe(S.modalTitle);
    expect(d.textContent).toContain(S.modalBody);
    expect(paywall()).toBeNull();
  });

  it('verified user: paywall, no dialog', async () => {
    handlers[ME] = me(true, false);
    await h.mount();
    await h.click(genBtn());
    expect(paywall()).not.toBeNull();
    expect(dialog()).toBeNull();
  });

  it('Google user: paywall, no dialog', async () => {
    handlers[ME] = me(false, true);
    await h.mount();
    await h.click(genBtn());
    expect(paywall()).not.toBeNull();
    expect(dialog()).toBeNull();
  });

  it('/me failing at the 402: paywall (fail open)', async () => {
    await h.mount();
    handlers[ME] = { status: 500, body: {} };
    await h.click(genBtn());
    expect(paywall()).not.toBeNull();
    expect(dialog()).toBeNull();
  });
});

describe('T-522 — the S3 referral notice (AJ-522-S3)', () => {
  const SEEN = 'lawie.referralNotice.seen:u1';
  const notice = () =>
    Array.from(document.querySelectorAll('[role="status"]')).find(
      (e) => e.textContent === S.referral,
    );

  it('shows for a verified user with referralStatus not_applied, and the seen flag is written only after it rendered', async () => {
    handlers[ME] = me(true, false, { referralStatus: 'not_applied' });
    const seenWhenWritten: boolean[] = [];
    const realSet = Storage.prototype.setItem;
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      k: string,
      v: string,
    ) {
      if (k === SEEN) {
        seenWhenWritten.push((document.body.textContent ?? '').includes(S.referral));
      }
      return realSet.call(this, k, v);
    });
    expect(localStorage.getItem(SEEN)).toBeNull();
    await h.mount();
    expect(notice()).toBeDefined();
    expect(localStorage.getItem(SEEN)).toBe('1');
    expect(seenWhenWritten).toEqual([true]);
  });

  it('shows once: the next dashboard load (a fresh mount) does not show it again', async () => {
    handlers[ME] = me(true, false, { referralStatus: 'not_applied' });
    await h.mount();
    expect(notice()).toBeDefined();
    await h.unmount();
    document.body.innerHTML = '';
    h = await load();
    await h.mount();
    expect(notice()).toBeUndefined();
  });

  it('stays on screen for the rest of the visit once shown', async () => {
    handlers[ME] = me(true, false, { referralStatus: 'not_applied' });
    await h.mount();
    await h.flush();
    expect(notice()).toBeDefined();
  });

  it.each([
    ['referralStatus applied', me(true, false, { referralStatus: 'applied' })],
    ['referralStatus absent', me(true, false)],
    ['not verified yet', me(false, false, { referralStatus: 'not_applied' })],
    ['/me fails', { status: 500, body: {} } as Reply],
  ])('does not show, and does not write the seen flag: %s', async (_l, reply) => {
    handlers[ME] = reply;
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    await h.mount();
    expect(notice()).toBeUndefined();
    expect(document.body.textContent).not.toContain(S.referral);
    expect(setItem.mock.calls.filter(([k]) => k === SEEN)).toHaveLength(0);
    expect(localStorage.getItem(SEEN)).toBeNull();
  });

  it('is not shown when signed out', async () => {
    mockUser = null;
    handlers[ME] = me(true, false, { referralStatus: 'not_applied' });
    await h.mount();
    expect(notice()).toBeUndefined();
  });
});

describe('T-522 — M6 Top-up and Subscribe refusals (AJ-522-M6, Rajesh §3)', () => {
  const PLANS = {
    body: {
      topups: [
        { id: 'topup_mini', ink: 10, priceInr: 99, pricePerInkInr: 9.9 },
        { id: 'topup_mid', ink: 30, priceInr: 249, pricePerInkInr: 8.3, badge: 'POPULAR' },
      ],
    },
  };
  const ORDER = '/api/billing/topup/order';
  const SUBSCRIBE = '/api/billing/subscribe';
  const BUY = 'Buy';
  const FENCE_403 = { status: 403, body: { error: 'email_verification_required' } };

  async function topUpEls() {
    const { TopUpModal } = await import('../credits/TopUpModal');
    const R = h.React;
    return R.createElement(
      'div',
      null,
      R.createElement('main', { id: 'dashboard-main', tabIndex: -1 }),
      R.createElement(h.mod.default),
      R.createElement(TopUpModal, { onClose: jest.fn() }),
    );
  }
  async function subscribeEls() {
    const { useSubscribe } = await import('../billing/useSubscribe');
    const R = h.React;
    function Plans(): any {
      const gst = { ensureReady: async () => true } as any;
      const sub = useSubscribe(gst);
      return R.createElement(
        'div',
        null,
        R.createElement(
          'button',
          {
            id: 'choose',
            disabled: sub.pendingPlanId !== null,
            onClick: () => sub.subscribe('solo_monthly'),
          },
          'Choose',
        ),
        sub.failedPlanId ? R.createElement('p', { id: 'failed' }, 'FAILED') : null,
      );
    }
    return R.createElement(
      'div',
      null,
      R.createElement('main', { id: 'dashboard-main', tabIndex: -1 }),
      R.createElement(h.mod.default),
      R.createElement(Plans),
    );
  }
  // The M6 dialog by its title, so a stacked top-up dialog is never mistaken for it.
  const m6 = () =>
    Array.from(document.querySelectorAll('[role="dialog"]')).find(
      (d) => d.querySelector('h2')?.textContent === S.modalTitle,
    ) as HTMLElement | undefined;
  const select = () => document.body.querySelector('select') as HTMLSelectElement;

  beforeEach(() => {
    handlers['/api/billing/plans'] = PLANS;
    handlers[ME] = { body: { data: { needsPrivacyAcceptance: false, gstStateCode: '07' } } };
  });

  it('a top-up 403 email_verification_required opens M6 with the Top-up body; Buy stays enabled; pack, coupon and State are kept', async () => {
    handlers['/api/billing/validate-coupon/SAVE10?skuId=topup_mini'] = {
      body: { valid: true, code: 'SAVE10', discountInr: 10, finalPriceInr: 89 },
    };
    handlers[ORDER] = FENCE_403;
    await h.mount(await topUpEls());
    const pack = Array.from(document.querySelectorAll('button[aria-pressed]')).find((b) =>
      (b.textContent ?? '').includes('₹99'),
    ) as HTMLElement;
    await h.click(pack);
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    await h.act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      set?.call(input, 'SAVE10');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await h.click(byText('Apply') as Element);
    expect(document.body.textContent).toContain('SAVE10');
    expect(select().value).toBe('07');

    await h.click(byText(BUY) as Element);
    const d = m6() as HTMLElement;
    expect(d).toBeDefined();
    expect(d.querySelector('h2')?.textContent).toBe(S.modalTitle);
    expect(d.textContent).toContain(S.topupBody);
    expect(d.textContent).not.toContain(S.subscribeBody);
    expect(byText(S.resend, d)).toBeDefined();
    expect(byText(S.notNow, d)).toBeDefined();
    expect(document.body.textContent).not.toContain('email_verification_required');
    // Buy stays enabled and the choices survive.
    expect((byText(BUY) as HTMLButtonElement).disabled).toBe(false);
    expect(byText(BUY)?.hasAttribute('disabled')).toBe(false);
    expect(select().value).toBe('07');
    expect(document.body.textContent).toContain('SAVE10');
    expect(
      Array.from(document.querySelectorAll('button[aria-pressed="true"]')).map(
        (b) => b.textContent,
      ),
    ).toEqual([expect.stringContaining('₹99')]);
    expect(document.body.textContent).toContain('₹89');
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('the top-up M6: Not now gets first focus', async () => {
    handlers[ORDER] = FENCE_403;
    await h.mount(await topUpEls());
    await h.click(byText(BUY) as Element);
    const d = m6() as HTMLElement;
    expect(d).toBeDefined();
    expect(document.activeElement).toBe(byText(S.notNow, d));
  });

  it('the top-up M6 closes with Not now and Buy can be pressed again', async () => {
    handlers[ORDER] = FENCE_403;
    await h.mount(await topUpEls());
    await h.click(byText(BUY) as Element);
    await h.click(byText(S.notNow, m6() as HTMLElement) as Element);
    expect(m6()).toBeUndefined();
    await h.click(byText(BUY) as Element);
    expect(m6()).toBeDefined();
    expect(calls.filter((c) => c.path === ORDER)).toHaveLength(2);
  });

  it.each([
    ['Not now', 'click'],
    ['Escape', 'esc'],
  ])('top-up M6 closed with %s returns focus to Buy', async (_l, how) => {
    handlers[ORDER] = FENCE_403;
    await h.mount(await topUpEls());
    await h.click(byText(BUY) as Element);
    expect(m6()).toBeDefined();
    if (how === 'click') await h.click(byText(S.notNow, m6() as HTMLElement) as Element);
    else await h.esc();
    expect(m6()).toBeUndefined();
    expect(document.activeElement).toBe(byText(BUY));
  });

  it.each([
    ['Not now', 'click'],
    ['Escape', 'esc'],
  ])('subscribe M6 closed with %s returns focus to the pressed Choose', async (_l, how) => {
    handlers[SUBSCRIBE] = FENCE_403;
    await h.mount(await subscribeEls());
    const choose = document.getElementById('choose') as HTMLButtonElement;
    choose.focus();
    await h.click(choose);
    expect(m6()).toBeDefined();
    if (how === 'click') await h.click(byText(S.notNow, m6() as HTMLElement) as Element);
    else await h.esc();
    expect(m6()).toBeUndefined();
    expect(document.activeElement).toBe(document.getElementById('choose'));
  });

  it('the M6 dialog node comes after the top-up dialog node, so it stacks above it', async () => {
    handlers[ORDER] = FENCE_403;
    await h.mount(await topUpEls());
    await h.click(byText(BUY) as Element);
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    expect(dialogs.length).toBeGreaterThanOrEqual(2);
    const top = dialogs.find((d) => d !== m6()) as HTMLElement;
    const order = top.compareDocumentPosition(m6() as HTMLElement);
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('ui/Dialog passes onCloseAutoFocus through to the Radix content', () => {
    const code = fs.readFileSync(path.join(__dirname, '..', 'ui', 'Dialog.tsx'), 'utf8');
    expect(code).toContain('onCloseAutoFocus');
    expect(code).toMatch(/onCloseAutoFocus=\{onCloseAutoFocus\}/);
  });

  it('a top-up 403 with any other code does not open M6 and shows the server error line', async () => {
    handlers[ORDER] = { status: 403, body: { error: 'something_else' } };
    await h.mount(await topUpEls());
    await h.click(byText(BUY) as Element);
    expect(m6()).toBeUndefined();
    expect(document.body.textContent).toContain('something_else');
    expect((byText(BUY) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a top-up 403 privacy_reaccept_required does not open M6', async () => {
    handlers[ORDER] = { status: 403, body: { error: 'privacy_reaccept_required' } };
    await h.mount(await topUpEls());
    await h.click(byText(BUY) as Element);
    expect(m6()).toBeUndefined();
  });

  it('a subscribe 403 email_verification_required opens M6 with the Subscribe body; Choose stays enabled; no redirect', async () => {
    handlers[SUBSCRIBE] = FENCE_403;
    await h.mount(await subscribeEls());
    await h.click(document.getElementById('choose') as Element);
    const d = m6() as HTMLElement;
    expect(d).toBeDefined();
    expect(d.querySelector('h2')?.textContent).toBe(S.modalTitle);
    expect(d.textContent).toContain(S.subscribeBody);
    expect(d.textContent).not.toContain(S.topupBody);
    expect(byText(S.resend, d)).toBeDefined();
    expect(byText(S.notNow, d)).toBeDefined();
    const choose = document.getElementById('choose') as HTMLButtonElement;
    expect(choose.disabled).toBe(false);
    expect(document.getElementById('failed')).toBeNull();
    expect(document.body.textContent).not.toContain('email_verification_required');
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(window.location.pathname).not.toMatch(/login|verify-email/);
  });

  it('the subscribe M6: Not now gets first focus', async () => {
    handlers[SUBSCRIBE] = FENCE_403;
    await h.mount(await subscribeEls());
    await h.click(document.getElementById('choose') as Element);
    const d = m6() as HTMLElement;
    expect(d).toBeDefined();
    expect(document.activeElement).toBe(byText(S.notNow, d));
  });

  it('a subscribe 403 with any other code does not open M6; it is the generic failure', async () => {
    handlers[SUBSCRIBE] = { status: 403, body: { error: 'something_else' } };
    await h.mount(await subscribeEls());
    await h.click(document.getElementById('choose') as Element);
    expect(m6()).toBeUndefined();
    expect(document.getElementById('failed')).not.toBeNull();
  });

  it('the M6 Top-up and Subscribe resend share the M4 sent line', async () => {
    handlers[SUBSCRIBE] = FENCE_403;
    handlers[RESEND] = { status: 202, body: {} };
    await h.mount(await subscribeEls());
    await h.click(document.getElementById('choose') as Element);
    await h.click(byText(S.resend, m6() as HTMLElement) as Element);
    expect(resendPosts()).toHaveLength(1);
    expect((m6() as HTMLElement).querySelector('[role="status"]')?.textContent).toBe(S.sent);
  });

  it('the checkout card and its two strings are gone from VerifyEmailPrompt', () => {
    const code = fs.readFileSync(path.join(__dirname, '..', 'VerifyEmailPrompt.tsx'), 'utf8');
    expect(code).not.toContain('VerifyEmailCard');
    expect(code).not.toContain('before you buy');
    expect(code).not.toContain('come back to buy');
    expect(Object.keys(h.mod.VERIFY_STRINGS)).not.toContain('checkoutTitle');
    expect(Object.keys(h.mod.VERIFY_STRINGS)).not.toContain('checkoutBody');
  });
});

describe('T-522 — logging and wiring', () => {
  it('no console call contains the address or any part of it, across bar, dialog and resend errors', async () => {
    handlers[GENERATE] = { status: 403, body: { error: 'email_verification_required' } };
    handlers[RESEND] = { throws: true };
    await h.mount();
    await h.click(byText(S.resend) as Element);
    handlers[RESEND] = { status: 429, body: { retryAfter: 90 } };
    await h.click(genBtn());
    await h.click(byText(S.resend, dialog() as ParentNode) as Element);
    const all = consoleSpies.flatMap((s) => s.mock.calls).map((c) => JSON.stringify(c));
    for (const line of all) {
      expect(line).not.toContain('alice');
      expect(line).not.toContain('example.com');
    }
  });

  const src = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

  it('the dashboard layout mounts the bar above the offline banner', () => {
    const code = src('app/dashboard/layout.tsx');
    expect(code).toMatch(/<VerifyEmailPrompt\s*\/>/);
    expect(code.indexOf('<VerifyEmailPrompt />')).toBeLessThan(code.indexOf('<OfflineBanner />'));
  });

  it('the dashboard page mounts the S3 notice', () => {
    expect(src('app/dashboard/page.tsx')).toContain('<ReferralNotAppliedNotice />');
  });

  it('settings: a subscribe 403 opens the M6 Subscribe dialog; the old verify gate and banner are gone', () => {
    const hook = src('components/billing/useSubscribe.ts');
    expect(hook).toContain("openVerifyIfDraftRefused(res, 'subscribe'");
    expect(hook).not.toContain("'verify'");
    expect(src('components/billing/PlanPanel.tsx')).not.toContain("gate === 'verify'");
  });

  it('no console.* in the new source, and no token placed in a path', () => {
    for (const rel of ['components/VerifyEmailPrompt.tsx', 'app/verify-email/page.tsx']) {
      expect(src(rel)).not.toMatch(/console\./);
    }
    expect(src('components/VerifyEmailPrompt.tsx')).not.toMatch(/verify-email\/\$\{/);
  });
});
