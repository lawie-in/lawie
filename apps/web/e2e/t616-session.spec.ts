/**
 * T-616 (AC2, AC3): the session does not end under a user who is working.
 *
 * The gateway is mocked here with the behaviour that matters (prod evidence, 26 Oct 2026):
 * - an expired access token is answered 401;
 * - refresh tokens are single use: /api/auth/refresh rotates them and a reused one is a 401;
 * - a refresh revokes the previous access token at once, so a request that was in flight with
 *   the OLD token gets 401 "session expired" even though its `exp` has not passed.
 * Tokens are unsigned fakes built at runtime (mocks/auth.ts). Desktop-1280 flows, plus a
 * mobile-390 smoke of the first one.
 */
import type { Request } from '@playwright/test';

import { corsHeaders, expect, mockApi, test } from './fixtures';
import { onlyOn, seedVisitor } from './helpers';
import {
  authTokens,
  fakeJwt,
  json,
  me,
  shellMocks,
  type ApiMocks,
  type FakeUser,
  type MockHandler,
} from './mocks';

const API = 'http://localhost:4000';
const PREFILL = 'lawie:draft-prefill';
const UNSAVED = 'Anticipatory bail for a client named in an FIR (unsaved description)';

// ── A tiny gateway with sessions ─────────────────────────────────────────────────────────────

interface Gateway {
  /** The refresh token the "auth service" will accept now. */
  currentRefresh: string;
  /** Bodies of every POST /api/auth/refresh. */
  refreshBodies: { refreshToken?: string }[];
  /** Access tokens the service has revoked (rotation). */
  revoked: Set<string>;
  /** Authorization header of every shell call, in order, with the path. */
  seen: { path: string; auth: string | null; status: number }[];
  /** The newest access token the service issued. */
  latestAccess: string | null;
}

function newGateway(refresh: string): Gateway {
  return {
    currentRefresh: refresh,
    refreshBodies: [],
    revoked: new Set(),
    seen: [],
    latestAccess: null,
  };
}

function bearer(request: Request): string | null {
  const h = request.headers().authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

function expMs(token: string | null): number {
  if (!token) return 0;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return Number(payload.exp) * 1000;
  } catch {
    return 0;
  }
}

/** 401 unless the Bearer token is present, unexpired and not revoked. */
function verdict(gw: Gateway, request: Request): { status: number } | null {
  const token = bearer(request);
  if (!token || expMs(token) <= Date.now() || gw.revoked.has(token)) return { status: 401 };
  return null;
}

/** The signed-in shell's calls, each one checked like the real gateway would. */
function guardedShell(gw: Gateway, overrides: ApiMocks = {}): ApiMocks {
  const out: ApiMocks = {};
  const all: ApiMocks = { ...shellMocks(), ...overrides };
  for (const [key, handler] of Object.entries(all)) {
    const path = key.replace(/^[A-Z]+\s+/, '');
    const wrapped: MockHandler = async (request, params) => {
      const bad = verdict(gw, request);
      if (bad) {
        gw.seen.push({ path, auth: bearer(request), status: 401 });
        return json({ status: 'error', message: 'session expired' }, 401);
      }
      const reply = typeof handler === 'function' ? await handler(request, params) : handler;
      gw.seen.push({ path, auth: bearer(request), status: reply.status ?? 200 });
      return reply;
    };
    out[key] = wrapped;
  }
  return out;
}

type RefreshStep = 'ok' | 'abort' | number;

/**
 * POST /api/auth/refresh. `script(n)` says what call n (1-based) does: 'ok' = rotate and answer
 * 200, a number = that status with no change, 'abort' = the network drops (offline). The default
 * is the honest service: 200 for the current refresh token, 401 for any other.
 */
async function routeRefresh(
  page: import('@playwright/test').Page,
  gw: Gateway,
  user: Partial<FakeUser>,
  script?: (n: number) => RefreshStep,
): Promise<void> {
  let n = 0;
  await page.route(
    (url) => url.origin === API && url.pathname === '/api/auth/refresh',
    async (route, request) => {
      if (request.method() === 'OPTIONS') return route.fallback();
      n += 1;
      const body = (request.postDataJSON() ?? {}) as { refreshToken?: string };
      gw.refreshBodies.push(body);
      const step: RefreshStep = script ? script(n) : 'ok';
      if (step === 'abort') return route.abort('internetdisconnected');
      const headers = { ...corsHeaders(request), 'content-type': 'application/json' };
      if (typeof step === 'number') {
        return route.fulfill({ status: step, headers, body: JSON.stringify({ status: 'error' }) });
      }
      if (body.refreshToken !== gw.currentRefresh) {
        return route.fulfill({ status: 401, headers, body: JSON.stringify({ status: 'error' }) });
      }
      const fresh = authTokens({ ...user, name: `${user.name ?? 'Asha Advocate'} #${n}` });
      // Rotation: the previous access token stops working immediately.
      if (gw.latestAccess) gw.revoked.add(gw.latestAccess);
      gw.currentRefresh = fresh.data.refreshToken;
      gw.latestAccess = fresh.data.accessToken;
      return route.fulfill({ status: 200, headers, body: JSON.stringify(fresh) });
    },
  );
}

/** Seeds the tokens (and the unsaved matter text) once per tab, before any app script runs. */
async function seedSession(
  context: import('@playwright/test').BrowserContext,
  access: string,
  refresh: string,
  withPrefill = false,
): Promise<void> {
  await context.addInitScript(
    ({ origin, access, refresh, withPrefill, prefillKey, text }) => {
      try {
        if (window.location.origin !== origin) return;
        if (window.sessionStorage.getItem('__e2e_seeded:t616')) return;
        window.localStorage.setItem('lawie_access_token', access);
        window.localStorage.setItem('lawie_refresh_token', refresh);
        if (withPrefill) window.sessionStorage.setItem(prefillKey, text);
        window.sessionStorage.setItem('__e2e_seeded:t616', '1');
      } catch {
        // Storage unavailable: the test fails on its own assertions.
      }
    },
    {
      origin: 'http://localhost:3100',
      access,
      refresh,
      withPrefill,
      prefillKey: PREFILL,
      text: UNSAVED,
    },
  );
}

const USER: Partial<FakeUser> = { name: 'Asha Advocate' };
const nowSec = () => Math.floor(Date.now() / 1000);
/** An access token that expired `agoSec` seconds ago (minted an hour before that). */
const expiredAccess = (agoSec = 120) =>
  fakeJwt({ ...USER, expiresInSec: 900 }, 'access', nowSec() - 900 - agoSec);
const refreshToken = (tag: string) => fakeJwt({ ...USER, name: `refresh ${tag}` }, 'refresh');

const stored = (page: import('@playwright/test').Page) =>
  page.evaluate(() => ({
    access: window.localStorage.getItem('lawie_access_token'),
    refresh: window.localStorage.getItem('lawie_refresh_token'),
    prefill: window.sessionStorage.getItem('lawie:draft-prefill'),
  }));

// ── (a) an expired access token with a valid refresh token ───────────────────────────────────

async function expiredTokenStaysSignedIn(
  page: import('@playwright/test').Page,
  context: import('@playwright/test').BrowserContext,
): Promise<void> {
  await seedVisitor(context, 'night');
  const r1 = refreshToken('r1');
  const gw = newGateway(r1);
  await mockApi(page, guardedShell(gw));
  await routeRefresh(page, gw, USER);
  await seedSession(context, expiredAccess(), r1);

  await page.goto('/dashboard');

  await expect(page.getByRole('heading', { level: 1, name: 'Your shelf' })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
  // exactly one refresh, with the stored refresh token, and the session now holds the new pair
  await expect.poll(() => gw.refreshBodies.length).toBe(1);
  expect(gw.refreshBodies[0]).toEqual({ refreshToken: r1 });
  const now = await stored(page);
  expect(now.access).toBe(gw.latestAccess);
  expect(now.refresh).toBe(gw.currentRefresh);
  expect(now.refresh).not.toBe(r1);
  // let anything that was waiting on the refresh settle, then still exactly one
  await page.waitForTimeout(1500);
  expect(gw.refreshBodies).toHaveLength(1);
}

test.describe('T-616 desktop flows', () => {
  onlyOn('desktop-1280');

  test('(a) an expired access token with a valid refresh token: stays signed in, exactly one POST /api/auth/refresh', async ({
    page,
    context,
  }) => {
    await expiredTokenStaysSignedIn(page, context);
  });

  // ── (b) the refresh is only delayed: never signed out ──────────────────────────────────────

  test('(b) refresh answers 429, then 503, then the network drops: stays on /dashboard, tokens untouched', async ({
    page,
    context,
  }) => {
    await seedVisitor(context, 'night');
    const r1 = refreshToken('r1');
    const old = expiredAccess();
    const gw = newGateway(r1);
    await mockApi(page, guardedShell(gw));
    await routeRefresh(page, gw, USER, (n) => (n === 1 ? 429 : n === 2 ? 503 : 'abort'));
    await seedSession(context, old, r1, true);

    await page.goto('/dashboard');
    await expect.poll(() => gw.refreshBodies.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
    await page.waitForTimeout(1500);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page).not.toHaveURL(/\/login/);
    const now = await stored(page);
    expect(now.access).toBe(old);
    expect(now.refresh).toBe(r1);
    // every attempt carried the same, still-stored refresh token
    for (const b of gw.refreshBodies) expect(b).toEqual({ refreshToken: r1 });
  });

  test('(b2) a delayed refresh (429) then a good one: the user never sees sign-in and ends up with fresh tokens', async ({
    page,
    context,
  }) => {
    await seedVisitor(context, 'night');
    const r1 = refreshToken('r1');
    const gw = newGateway(r1);
    await mockApi(page, guardedShell(gw));
    await routeRefresh(page, gw, USER, (n) => (n === 1 ? 429 : 'ok'));
    await seedSession(context, expiredAccess(), r1);

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Your shelf' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/dashboard$/);
    // the good answer comes after the cooldown (1 s); only then is there a latest token to compare
    await expect.poll(() => gw.latestAccess, { timeout: 15_000 }).not.toBeNull();
    await expect.poll(async () => (await stored(page)).access).toBe(gw.latestAccess);
  });

  // ── (c) the refresh is refused: sign in again and come back, text kept ─────────────────────

  test('(c) refresh answers 401: lands on /login?next=..., the unsaved text is kept, and email sign-in returns to that page', async ({
    page,
    context,
  }) => {
    await seedVisitor(context, 'night');
    const r1 = refreshToken('r1');
    const gw = newGateway(r1);
    const calls = await mockApi(page, {
      ...guardedShell(gw),
      'POST /api/auth/login': json(authTokens(USER)),
    });
    await routeRefresh(page, gw, USER, () => 401);
    await seedSession(context, expiredAccess(), r1, true);

    await page.goto('/dashboard/documents');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fdocuments$/);
    const afterEnd = await stored(page);
    expect(afterEnd.access).toBeNull();
    expect(afterEnd.refresh).toBeNull();
    expect(afterEnd.prefill).toBe(UNSAVED); // AC3: the description is not lost
    expect(gw.refreshBodies).toHaveLength(1);

    // sign in again with email: back on the page the user was on, text still there
    await page.getByLabel('Email').fill('advocate@e2e.test');
    await page.getByLabel('Password', { exact: true }).fill('Correct-Horse-1');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard\/documents$/);
    expect(calls.some((c) => c.path === '/api/auth/login' && c.method === 'POST')).toBe(true);
    const back = await stored(page);
    expect(back.access).toBeTruthy();
    expect(back.prefill).toBe(UNSAVED);
  });

  test('(c2) an unsafe ?next= is ignored: sign-in lands on /dashboard', async ({
    page,
    context,
  }) => {
    await seedVisitor(context, 'night');
    const gw = newGateway('unused');
    await mockApi(page, {
      ...guardedShell(gw),
      'POST /api/auth/login': json(authTokens(USER)),
    });
    await page.goto('/login?mode=signin&next=%2F%2Fevil.example');
    await page.getByLabel('Email').fill('advocate@e2e.test');
    await page.getByLabel('Password', { exact: true }).fill('Correct-Horse-1');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  // ── (d) the proactive refresh ──────────────────────────────────────────────────────────────

  test('(d) a token that expires in about 70 s is refreshed on the timer, before it expires, without any request failing', async ({
    page,
    context,
  }) => {
    await seedVisitor(context, 'night');
    const r1 = refreshToken('r1');
    const gw = newGateway(r1);
    await mockApi(page, guardedShell(gw));
    await routeRefresh(page, gw, USER);
    const t1 = fakeJwt({ ...USER, expiresInSec: 70 }, 'access');
    await seedSession(context, t1, r1);

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Your shelf' })).toBeVisible();
    // real time: the timer is due 10 s after load (60 s before exp); give it up to 40 s
    await expect.poll(() => gw.refreshBodies.length, { timeout: 40_000 }).toBe(1);
    expect(Date.now()).toBeLessThan(expMs(t1)); // it did not wait for the token to run out
    await expect.poll(async () => (await stored(page)).access).toBe(gw.latestAccess);
    expect(gw.latestAccess).not.toBe(t1);
    await expect(page).toHaveURL(/\/dashboard$/);
    // no shell request was refused on the way
    expect(gw.seen.filter((s) => s.status === 401)).toEqual([]);
  });

  // ── (e) the late-401 race against the mocked gateway ───────────────────────────────────────

  test('(e) a request sent with T1 that is answered 401 after /refresh issued T2: stays signed in and retries with T2, no second refresh', async ({
    page,
    context,
  }) => {
    await seedVisitor(context, 'night');
    const r1 = refreshToken('r1');
    const gw = newGateway(r1);
    // The first GET /api/auth/me (sent with T1) is held until the refresh has happened.
    let release!: () => void;
    const released = new Promise<void>((res) => (release = res));
    let held = 0;
    const meHeld: MockHandler = async (request) => {
      if (held === 0 && bearer(request) === t1) {
        held += 1;
        await released;
      }
      // answer by the CURRENT state of the token: revoked by the refresh -> 401 session expired
      const bad = verdict(gw, request);
      if (bad) {
        gw.seen.push({ path: '/api/auth/me', auth: bearer(request), status: 401 });
        return json({ status: 'error', message: 'session expired' }, 401);
      }
      gw.seen.push({ path: '/api/auth/me', auth: bearer(request), status: 200 });
      return json(me());
    };
    // T1 is valid for 65 s: the timer (due at the 5 s floor) refreshes while /me is still held.
    const t1 = fakeJwt({ ...USER, expiresInSec: 65 }, 'access');
    gw.latestAccess = t1;
    await mockApi(page, {
      ...guardedShell(gw),
      'GET /api/auth/me': meHeld,
    });
    await routeRefresh(page, gw, USER);
    await seedSession(context, t1, r1);

    await page.goto('/dashboard');
    await expect.poll(() => gw.refreshBodies.length, { timeout: 30_000 }).toBe(1);
    expect(gw.revoked.has(t1)).toBe(true); // T1 is revoked on the server now
    release(); // the in-flight /me answers 401 "session expired" for T1

    await expect
      .poll(() => gw.seen.some((s) => s.path === '/api/auth/me' && s.status === 401))
      .toBe(true);
    // the app retries /me with the NEW token and succeeds
    await expect
      .poll(() =>
        gw.seen.some(
          (s) => s.path === '/api/auth/me' && s.status === 200 && s.auth === gw.latestAccess,
        ),
      )
      .toBe(true);
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page).not.toHaveURL(/\/login/);
    expect(gw.refreshBodies).toHaveLength(1); // the late 401 did not cause a second refresh
    const now = await stored(page);
    expect(now.access).toBe(gw.latestAccess);
    expect(now.refresh).toBe(gw.currentRefresh);
  });
});

test.describe('T-616 mobile smoke', () => {
  onlyOn('mobile-390');

  test('(a) on a phone: an expired access token with a valid refresh token stays signed in, one refresh', async ({
    page,
    context,
  }) => {
    await expiredTokenStaysSignedIn(page, context);
  });
});

// ── the "Reconnecting…" banner (Rajesh's spec, handoff/design/T-616-reconnecting-banner.md) ───

const BANNER = '[data-kind="session-reconnecting"]';
// Round 3: the live region stays mounted, empty and visually hidden (sr-only), while no bar shows.
// "No banner" therefore means phase `hidden` and no text, not "no element".
const BANNER_PHASE = '[data-session-banner-phase]';
async function expectBannerHidden(
  page: import('@playwright/test').Page,
  timeout?: number,
): Promise<void> {
  await expect(page.locator(BANNER_PHASE)).toHaveAttribute('data-session-banner-phase', 'hidden', {
    timeout,
  });
  await expect(page.locator(BANNER)).toHaveText('', { timeout });
}

/** Refresh answers 503 until `state.recover` is set; then the honest service answers 200. */
function failingThenRecovering(state: { recover: boolean }) {
  return (_n: number): RefreshStep => (state.recover ? 'ok' : 503);
}

async function openFailingDashboard(
  page: import('@playwright/test').Page,
  context: import('@playwright/test').BrowserContext,
  state: { recover: boolean },
) {
  await seedVisitor(context, 'night');
  const r1 = refreshToken('r1');
  const old = expiredAccess();
  const gw = newGateway(r1);
  await mockApi(page, guardedShell(gw));
  await routeRefresh(page, gw, USER, failingThenRecovering(state));
  await seedSession(context, old, r1, true);
  await page.goto('/dashboard');
  return { gw, old, r1 };
}

test.describe('T-616 banner, desktop', () => {
  onlyOn('desktop-1280');

  test('503 on /refresh: no banner after the first failure, "Reconnecting…" after the second; no sign-out, no modal, focus and caret unchanged; then "Reconnected." and gone within about 4 s', async ({
    page,
    context,
  }) => {
    const state = { recover: false };
    const { gw, old, r1 } = await openFailingDashboard(page, context, state);

    // first failure: nothing
    await expect.poll(() => gw.refreshBodies.length).toBeGreaterThanOrEqual(1);
    if (gw.refreshBodies.length === 1) {
      await expectBannerHidden(page);
      // the live region is already in the page, empty, so the later text is announced
      await expect(page.locator(BANNER)).toHaveAttribute('role', 'status');
      await expect(page.locator(BANNER)).toHaveAttribute('aria-live', 'polite');
    }
    await expect(page.getByRole('heading', { level: 1, name: 'Your shelf' })).toBeVisible();

    // a field with the caret in the middle of some text: the banner must not touch it
    await page.evaluate(() => {
      const el = document.createElement('textarea');
      el.id = 'e2e-caret';
      el.value = 'unsaved description text';
      document.body.appendChild(el);
      el.focus();
      el.setSelectionRange(7, 7);
    });

    // second failure: the banner
    const banner = page.locator(BANNER);
    await expect(page.locator(BANNER_PHASE)).toHaveAttribute(
      'data-session-banner-phase',
      'reconnecting',
      { timeout: 15_000 },
    );
    await expect(banner).toBeVisible();
    await expect(banner).toHaveText('Reconnecting…');
    await expect(banner).toHaveAttribute('role', 'status');
    await expect(banner).toHaveAttribute('aria-live', 'polite');
    expect((await banner.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // not signed out, no modal, focus and caret where they were
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('[role="dialog"], [aria-modal="true"]')).toHaveCount(0);
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLTextAreaElement | null;
      return { id: el?.id, start: el?.selectionStart, end: el?.selectionEnd };
    });
    expect(focus).toEqual({ id: 'e2e-caret', start: 7, end: 7 });
    const now = await stored(page);
    expect(now.access).toBe(old);
    expect(now.refresh).toBe(r1);
    expect(now.prefill).toBe(UNSAVED);
    // nothing inside the bar can take focus
    await expect(banner.locator('a, button, input, select, textarea, [tabindex]')).toHaveCount(0);

    // the next refresh succeeds: "Reconnected." and the bar is gone within about 4 s
    state.recover = true;
    await expect(banner).toHaveText('Reconnected.', { timeout: 15_000 });
    await expectBannerHidden(page, 4_500);
    expect(await stored(page).then((v) => v.access)).toBe(gw.latestAccess);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('going offline hides the banner (the offline bar or nothing), and it never signs out', async ({
    page,
    context,
  }) => {
    const state = { recover: false };
    const { old } = await openFailingDashboard(page, context, state);
    await expect(page.locator(BANNER_PHASE)).toHaveAttribute(
      'data-session-banner-phase',
      'reconnecting',
      { timeout: 15_000 },
    );
    await context.setOffline(true);
    await expectBannerHidden(page, 3_000);
    await page.waitForTimeout(1500);
    await expectBannerHidden(page);
    await expect(page).toHaveURL(/\/dashboard$/);
    expect((await stored(page)).access).toBe(old);
    await context.setOffline(false);
  });
});

test.describe('T-616 banner, mobile smoke', () => {
  onlyOn('mobile-390');

  test('on a phone the bar is at least 44 px high, fits the width, and shows "Reconnecting…"', async ({
    page,
    context,
  }) => {
    const state = { recover: false };
    await openFailingDashboard(page, context, state);
    const banner = page.locator(BANNER);
    await expect(page.locator(BANNER_PHASE)).toHaveAttribute(
      'data-session-banner-phase',
      'reconnecting',
      { timeout: 15_000 },
    );
    await expect(banner).toHaveText('Reconnecting…');
    const box = (await banner.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
