/**
 * T-516: past_due retry link on the 409, stale-checkout cancel and replace,
 * same-plan reuse, and no second live sub. Razorpay is mocked. Rules are
 * Arjun's (CTO, 17 Oct 2026). The web Retry button is a separate ticket.
 *
 * Fake ids are built at runtime so gitleaks sees no secret-looking literals.
 */
import './setupDb';
import './setupEnv';
import mongoose from 'mongoose';
import request from 'supertest';
import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';

import logger from '../config/logger';
import { Subscription } from '../models/Subscription.model';
import { SubscriptionCreateLock } from '../models/SubscriptionCreateLock.model';
import { User } from '../models/User.model';
import {
  PAST_DUE_LINK_TIMEOUT_MS,
  RAZORPAY_CALL_TIMEOUT_MS,
  createSubscription,
  handleWebhookEvent,
} from '../services/subscription.service';

jest.mock('../config/razorpay', () => ({
  razorpay: {
    subscriptions: {
      create: jest.fn(),
      fetch: jest.fn(),
      cancel: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockCaptureMessage = jest.fn();
jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
  withScope: (cb: (scope: unknown) => void) => cb({ setTag: jest.fn(), setExtra: jest.fn() }),
}));

import { razorpay } from '../config/razorpay';
import app from '../app';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const createMock = razorpay.subscriptions.create as jest.Mock;
const fetchMock = razorpay.subscriptions.fetch as jest.Mock;
const cancelMock = razorpay.subscriptions.cancel as jest.Mock;
const updateMock = (razorpay.subscriptions as unknown as { update: jest.Mock }).update;

const DAY = 86_400_000;
const future = () => new Date(Date.now() + 10 * DAY);
const past = () => new Date(Date.now() - 10 * DAY);
const sid = (n: string) => ['sub', '_', 't516', n].join('');
const url = (n: string) => ['https://rzp.io/', 't516-', n].join('');
const WARN_MSG = 'billing.subscription.past_due_link_unavailable';

function headers(userId: string, email: string) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': email,
    'x-user-name': 'Test',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
    'x-user-privacy-version': CURRENT_PRIVACY_VERSION,
  };
}

let counter = 0;
async function seedUser(): Promise<{ userId: string; email: string }> {
  const email = `t516-${++counter}@example.com`;
  const u = await User.create({ email, plan: 'free', emailVerified: true });
  return { userId: u._id.toString(), email };
}
const addSub = (userId: string, id: string, fields: Record<string, unknown>) =>
  Subscription.create({ userId, razorpaySubscriptionId: id, ...fields });
const getSub = (id: string) => Subscription.findOne({ razorpaySubscriptionId: id }).lean();
const lockCount = (userId: string) => SubscriptionCreateLock.countDocuments({ userId });
const subscribe = (u: { userId: string; email: string }, planId?: string) =>
  request(app)
    .post('/subscribe')
    .set(headers(u.userId, u.email))
    .send(planId ? { planId } : {});
const mockNewSub = (id = sid('new'), shortUrl = url('new')) =>
  createMock.mockResolvedValue({ id, short_url: shortUrl });

let warnSpy: jest.SpyInstance;
const linkWarnings = () => warnSpy.mock.calls.filter((c) => c[1] === WARN_MSG);

beforeEach(() => {
  mockCaptureMessage.mockClear();
  createMock.mockReset();
  fetchMock.mockReset();
  cancelMock.mockReset().mockResolvedValue({});
  updateMock.mockReset();
  warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Fire the Razorpay timeouts (2 s link fetch, 15 s call) immediately. */
function collapseRazorpayTimeouts() {
  const realSetTimeout = global.setTimeout;
  jest
    .spyOn(global, 'setTimeout')
    .mockImplementation(((fn: () => void, ms?: number, ...a: []) =>
      realSetTimeout(
        fn,
        ms === PAST_DUE_LINK_TIMEOUT_MS || ms === RAZORPAY_CALL_TIMEOUT_MS ? 0 : ms,
        ...a,
      )) as unknown as typeof setTimeout);
}

// ─── AC1: past_due returns the live short_url ────────────────────────────────
describe('T-516 AC1: 409 for a past_due sub carries the live short_url', () => {
  it('uses a 2 s timeout for the link fetch', () => {
    expect(PAST_DUE_LINK_TIMEOUT_MS).toBe(2_000);
  });

  it.each(['halted', 'paused', 'pending'] as const)(
    'a still-paid %s sub: 409 with shortUrl fetched live by subscription id',
    async (status) => {
      const u = await seedUser();
      const id = sid(status);
      await addSub(u.userId, id, { status, planId: 'solo_monthly', paidThrough: future() });
      fetchMock.mockResolvedValue({ id, short_url: url(status) });

      const res = await subscribe(u);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('subscription_exists');
      expect(res.body.status).toBe(status);
      expect(res.body.shortUrl).toBe(url(status));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(id);
      expect(createMock).not.toHaveBeenCalled();
      expect(cancelMock).not.toHaveBeenCalled();
      expect(linkWarnings()).toHaveLength(0);
    },
  );

  it('the service error carries the shortUrl too', async () => {
    const u = await seedUser();
    await addSub(u.userId, sid('svc'), { status: 'halted', paidThrough: future() });
    fetchMock.mockResolvedValue({ short_url: url('svc') });
    await expect(createSubscription(u.userId, u.email)).rejects.toMatchObject({
      name: 'SubscriptionExistsError',
      shortUrl: url('svc'),
    });
  });

  it.each([
    ['fetch throws', () => fetchMock.mockRejectedValue(new Error('rzp down'))],
    ['short_url missing', () => fetchMock.mockResolvedValue({ id: 'x' })],
    ['short_url empty', () => fetchMock.mockResolvedValue({ short_url: '' })],
    ['fetch returns nothing', () => fetchMock.mockResolvedValue(undefined)],
  ])('%s: shortUrl is null, one warn log with the subscription id only', async (_n, arrange) => {
    const u = await seedUser();
    const id = sid('fail');
    await addSub(u.userId, id, { status: 'paused', paidThrough: future() });
    arrange();

    const res = await subscribe(u);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('shortUrl', null);
    expect(linkWarnings()).toHaveLength(1);
    expect(linkWarnings()[0][0]).toEqual({ subscriptionId: id });
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(u.email);
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(u.userId);
  });

  it('fetch hangs past the timeout: shortUrl is null, one warn log', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    const id = sid('hang');
    await addSub(u.userId, id, { status: 'halted', paidThrough: future() });
    fetchMock.mockReturnValue(new Promise(() => undefined));

    const res = await subscribe(u);

    expect(res.status).toBe(409);
    expect(res.body.shortUrl).toBeNull();
    expect(linkWarnings()).toHaveLength(1);
    expect(linkWarnings()[0][0]).toEqual({ subscriptionId: id });
  });

  it('the link is never cached or stored: each request fetches again, the row has no link', async () => {
    const u = await seedUser();
    const id = sid('nocache');
    await addSub(u.userId, id, { status: 'halted', paidThrough: future() });
    fetchMock
      .mockResolvedValueOnce({ short_url: url('first') })
      .mockResolvedValueOnce({ short_url: url('second') });

    const r1 = await subscribe(u);
    const r2 = await subscribe(u);

    expect(r1.body.shortUrl).toBe(url('first'));
    expect(r2.body.shortUrl).toBe(url('second'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const raw = await mongoose.connection.db!.collection('subscriptions').findOne({
      razorpaySubscriptionId: id,
    });
    expect(JSON.stringify(raw)).not.toContain('t516-first');
    expect(raw).not.toHaveProperty('shortUrl');
  });

  it('an active sub: 409 body has no shortUrl key and nothing is fetched', async () => {
    const u = await seedUser();
    await addSub(u.userId, sid('act'), { status: 'active', planId: 'solo_monthly' });

    const res = await subscribe(u);

    expect(res.status).toBe(409);
    expect(res.body).not.toHaveProperty('shortUrl');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("owner only: another user's past_due sub does not leak its link", async () => {
    const owner = await seedUser();
    const other = await seedUser();
    await addSub(owner.userId, sid('owner'), { status: 'halted', paidThrough: future() });
    fetchMock.mockResolvedValue({ short_url: url('owner') });
    mockNewSub();

    const res = await subscribe(other);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(url('owner'));
    expect(fetchMock).not.toHaveBeenCalledWith(sid('owner'));
  });

  it('owner only: each signed-in owner is given only their own link', async () => {
    const a = await seedUser();
    const b = await seedUser();
    await addSub(a.userId, sid('a'), { status: 'halted', paidThrough: future() });
    await addSub(b.userId, sid('b'), { status: 'paused', paidThrough: future() });
    fetchMock.mockImplementation(async (id: string) => ({ short_url: `${url('for')}-${id}` }));

    const ra = await subscribe(a);
    const rb = await subscribe(b);

    expect(ra.body.shortUrl).toBe(`${url('for')}-${sid('a')}`);
    expect(rb.body.shortUrl).toBe(`${url('for')}-${sid('b')}`);
  });

  it('an unauthenticated request gets 401 and no fetch', async () => {
    const res = await request(app).post('/subscribe');
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a lapsed halted sub (paidThrough passed) is not a 409: no link fetch for it', async () => {
    const u = await seedUser();
    await addSub(u.userId, sid('lapsed'), { status: 'halted', paidThrough: past() });
    mockNewSub();
    const res = await subscribe(u);
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalledWith(sid('lapsed'));
  });
});

// ─── AC2: a different plan cancels and replaces the stale checkout ───────────
describe('T-516 AC2: stale checkout for a different plan', () => {
  it.each(['created', 'authenticated'] as const)(
    'a %s sub: cancel(id,false), guarded local cancel, then create; link and planId match the request',
    async (status) => {
      const u = await seedUser();
      const stale = sid(`stale-${status}`);
      await addSub(u.userId, stale, { status, planId: 'solo_monthly' });
      const order: string[] = [];
      cancelMock.mockImplementation(async () => {
        order.push('cancel');
      });
      createMock.mockImplementation(async () => {
        order.push(`create(local=${(await getSub(stale))!.status})`);
        return { id: sid('yearly'), short_url: url('yearly') };
      });

      const res = await subscribe(u, 'solo_yearly');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        subscriptionId: sid('yearly'),
        shortUrl: url('yearly'),
        planId: 'solo_yearly',
      });
      expect(cancelMock).toHaveBeenCalledWith(stale, false);
      expect(order).toEqual(['cancel', 'create(local=cancelled)']);
      const payload = createMock.mock.calls[0][0];
      expect(payload.notes.planId).toBe('solo_yearly');
      const old = await getSub(stale);
      expect(old!.status).toBe('cancelled');
      expect(old!.cancelledAt).toBeInstanceOf(Date);
      expect((await getSub(sid('yearly')))!.planId).toBe('solo_yearly');
      expect(await lockCount(u.userId)).toBe(0);
      expect(updateMock).not.toHaveBeenCalled();
    },
  );

  it('the stale checkout is cancelled by its own _id; the new row is the only live-to-be one', async () => {
    const u = await seedUser();
    await addSub(u.userId, sid('s1'), { status: 'created', planId: 'solo_monthly' });
    mockNewSub();
    await createSubscription(u.userId, u.email, 'pro_yearly');
    const rows = await Subscription.find({ userId: u.userId }).lean();
    expect(rows.map((r) => [r.razorpaySubscriptionId, r.status, r.planId]).sort()).toEqual(
      [
        [sid('new'), 'created', 'pro_yearly'],
        [sid('s1'), 'cancelled', 'solo_monthly'],
      ].sort(),
    );
  });

  it('only the newest checkout is cancelled when several exist', async () => {
    const u = await seedUser();
    await addSub(u.userId, sid('older'), {
      status: 'created',
      planId: 'solo_monthly',
      createdAt: new Date(Date.now() - 2 * DAY),
    });
    await addSub(u.userId, sid('newest'), {
      status: 'created',
      planId: 'pro_monthly',
      createdAt: new Date(Date.now() - DAY),
    });
    mockNewSub();

    await createSubscription(u.userId, u.email, 'solo_yearly');

    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledWith(sid('newest'), false);
    expect((await getSub(sid('newest')))!.status).toBe('cancelled');
    expect((await getSub(sid('older')))!.status).toBe('created');
  });

  it('cancel fails and the fetch shows no ended status: 503 try_again, no create, row unchanged', async () => {
    const u = await seedUser();
    const stale = sid('keep');
    await addSub(u.userId, stale, { status: 'created', planId: 'solo_monthly' });
    cancelMock.mockRejectedValue(new Error('rzp 400'));
    fetchMock.mockResolvedValue({ id: stale, status: 'created' });

    const res = await subscribe(u, 'solo_yearly');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'try_again' });
    expect(fetchMock).toHaveBeenCalledWith(stale);
    expect(createMock).not.toHaveBeenCalled();
    expect((await getSub(stale))!.status).toBe('created');
    expect(await Subscription.countDocuments({ userId: u.userId })).toBe(1);
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('cancel fails and the follow-up fetch also fails: 503 try_again, no create', async () => {
    const u = await seedUser();
    await addSub(u.userId, sid('keep2'), { status: 'authenticated', planId: 'solo_monthly' });
    cancelMock.mockRejectedValue(new Error('rzp 500'));
    fetchMock.mockRejectedValue(new Error('rzp 500'));

    const res = await subscribe(u, 'solo_yearly');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'try_again' });
    expect(createMock).not.toHaveBeenCalled();
    expect((await getSub(sid('keep2')))!.status).toBe('authenticated');
  });

  it.each(['cancelled', 'completed', 'expired'])(
    'cancel throws but Razorpay shows %s: counts as success, local cancel then create',
    async (rzpStatus) => {
      const u = await seedUser();
      const stale = sid(`ended-${rzpStatus}`);
      await addSub(u.userId, stale, { status: 'created', planId: 'solo_monthly' });
      cancelMock.mockRejectedValue(new Error('already ended'));
      fetchMock.mockResolvedValue({ id: stale, status: rzpStatus });
      mockNewSub();

      const r = await createSubscription(u.userId, u.email, 'solo_yearly');

      expect(r).toEqual({
        subscriptionId: sid('new'),
        shortUrl: url('new'),
        planId: 'solo_yearly',
      });
      expect((await getSub(stale))!.status).toBe('cancelled');
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(updateMock).not.toHaveBeenCalled();
    },
  );

  it('an UNKNOWN plan (no stored planId, no notes, no plan_id) is cancelled and replaced, never reused with planId ""', async () => {
    const u = await seedUser();
    const stale = sid('unknown');
    await addSub(u.userId, stale, { status: 'created' });
    fetchMock.mockResolvedValue({ id: stale, short_url: url('unknown') });
    mockNewSub();

    const r = await createSubscription(u.userId, u.email, 'solo_monthly');

    expect(cancelMock).toHaveBeenCalledWith(stale, false);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(r.subscriptionId).toBe(sid('new'));
    expect(r.planId).toBe('solo_monthly');
    expect(r.planId).not.toBe('');
    expect(r.shortUrl).toBe(url('new'));
    expect((await getSub(stale))!.status).toBe('cancelled');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('a legacy row whose Razorpay notes name another plan is cancelled and replaced', async () => {
    const u = await seedUser();
    const stale = sid('legacy');
    await addSub(u.userId, stale, { status: 'created' });
    fetchMock.mockResolvedValue({ short_url: url('legacy'), notes: { planId: 'pro_monthly' } });
    mockNewSub();

    const r = await createSubscription(u.userId, u.email, 'solo_yearly');

    expect(cancelMock).toHaveBeenCalledWith(stale, false);
    expect(r.planId).toBe('solo_yearly');
  });

  it('the new create failing leaves the stale checkout cancelled and no live sub (retryable)', async () => {
    const u = await seedUser();
    await addSub(u.userId, sid('gone'), { status: 'created', planId: 'solo_monthly' });
    createMock.mockRejectedValue(new Error('rzp create failed'));

    await expect(createSubscription(u.userId, u.email, 'solo_yearly')).rejects.toThrow();

    expect((await getSub(sid('gone')))!.status).toBe('cancelled');
    expect(await lockCount(u.userId)).toBe(0);
  });
});

// ─── AC3: the same plan returns the same checkout ────────────────────────────
describe('T-516 AC3: same plan reuses the unfinished checkout', () => {
  it.each(['created', 'authenticated'] as const)(
    'a %s sub for the same plan: same short_url, no create, no cancel',
    async (status) => {
      const u = await seedUser();
      const id = sid(`same-${status}`);
      await addSub(u.userId, id, { status, planId: 'solo_yearly' });
      fetchMock.mockResolvedValue({ id, short_url: url('same') });

      const res = await subscribe(u, 'solo_yearly');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        subscriptionId: id,
        shortUrl: url('same'),
        planId: 'solo_yearly',
      });
      expect(createMock).not.toHaveBeenCalled();
      expect(cancelMock).not.toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
      expect((await getSub(id))!.status).toBe(status);
    },
  );

  it('choosing the same plan twice in a row creates one sub and returns the same link both times', async () => {
    const u = await seedUser();
    mockNewSub(sid('once'), url('once'));
    fetchMock.mockResolvedValue({ id: sid('once'), short_url: url('once') });

    const first = await subscribe(u, 'solo_monthly');
    const second = await subscribe(u, 'solo_monthly');

    expect(first.body.data.shortUrl).toBe(url('once'));
    expect(second.body.data).toEqual(first.body.data);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(await Subscription.countDocuments({ userId: u.userId })).toBe(1);
  });

  it('a legacy row whose notes name the same plan is reused', async () => {
    const u = await seedUser();
    await addSub(u.userId, sid('legsame'), { status: 'created' });
    fetchMock.mockResolvedValue({ short_url: url('legsame'), notes: { planId: 'solo_monthly' } });

    const r = await createSubscription(u.userId, u.email, 'solo_monthly');

    expect(r).toEqual({
      subscriptionId: sid('legsame'),
      shortUrl: url('legsame'),
      planId: 'solo_monthly',
    });
    expect(createMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('the reuse fetch is bounded by a timeout: a hung fetch rejects, no create, no cancel, lock released', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    await addSub(u.userId, sid('hungreuse'), { status: 'created', planId: 'solo_monthly' });
    fetchMock.mockReturnValue(new Promise(() => undefined));

    await expect(createSubscription(u.userId, u.email, 'solo_monthly')).rejects.toMatchObject({
      name: 'RazorpayTimeoutError',
    });

    expect(createMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
    expect(await lockCount(u.userId)).toBe(0);
  });
});

// ─── AC4: no create while a live sub exists ──────────────────────────────────
describe('T-516 AC4: no new sub while a live one exists', () => {
  it.each(['active', 'pending', 'halted', 'paused'] as const)(
    'a live %s sub (still paid): 409 and no create, even for a different plan',
    async (status) => {
      const u = await seedUser();
      await addSub(u.userId, sid(`live-${status}`), {
        status,
        planId: 'solo_monthly',
        paidThrough: future(),
      });
      fetchMock.mockResolvedValue({ short_url: url('live') });

      const res = await subscribe(u, 'pro_yearly');

      expect(res.status).toBe(409);
      expect(createMock).not.toHaveBeenCalled();
      expect(cancelMock).not.toHaveBeenCalled();
      expect(await Subscription.countDocuments({ userId: u.userId })).toBe(1);
    },
  );

  it('a live sub together with a stale checkout: 409, the checkout is left alone', async () => {
    const u = await seedUser();
    await addSub(u.userId, sid('live'), {
      status: 'active',
      planId: 'solo_monthly',
      paidThrough: future(),
    });
    await addSub(u.userId, sid('chk'), { status: 'created', planId: 'solo_monthly' });

    const res = await subscribe(u, 'solo_yearly');

    expect(res.status).toBe(409);
    expect(createMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
    expect((await getSub(sid('chk')))!.status).toBe('created');
  });

  describe('webhook race: the stale checkout is activated between the lock and the local cancel', () => {
    it('guarded update matches nothing: re-reads the live sub, 409, no create, paid-sub report', async () => {
      const u = await seedUser();
      const stale = sid('race');
      await addSub(u.userId, stale, { status: 'authenticated', planId: 'solo_monthly' });
      const errSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
      cancelMock.mockImplementation(async () => {
        // The activation webhook lands while the cancel is in flight.
        await Subscription.updateOne(
          { razorpaySubscriptionId: stale },
          { status: 'active', paidThrough: future() },
        );
      });

      const res = await subscribe(u, 'solo_yearly');

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('subscription_exists');
      expect(res.body.status).toBe('active');
      expect(res.body).not.toHaveProperty('shortUrl');
      expect(createMock).not.toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
      const row = await getSub(stale);
      expect(row!.status).toBe('active'); // the guarded update did not overwrite it
      expect(await Subscription.countDocuments({ userId: u.userId })).toBe(1);
      expect(errSpy).toHaveBeenCalledWith(
        { subscriptionId: stale },
        'billing.resubscribe.cancelled_paid_sub',
      );
      expect(mockCaptureMessage).toHaveBeenCalledWith(
        'billing.resubscribe.cancelled_paid_sub',
        'warning',
      );
      expect(await lockCount(u.userId)).toBe(0);
    });

    it('the activated checkout reads as past_due: 409 carries the live link', async () => {
      const u = await seedUser();
      const stale = sid('race-halted');
      await addSub(u.userId, stale, { status: 'created', planId: 'solo_monthly' });
      cancelMock.mockImplementation(async () => {
        await Subscription.updateOne(
          { razorpaySubscriptionId: stale },
          { status: 'halted', paidThrough: future() },
        );
      });
      fetchMock.mockResolvedValue({ short_url: url('race') });

      const res = await subscribe(u, 'solo_yearly');

      expect(res.status).toBe(409);
      expect(res.body.shortUrl).toBe(url('race'));
      expect(createMock).not.toHaveBeenCalled();
    });

    it('a cancelled webhook lands first (no live sub afterwards): no report, the new sub is created', async () => {
      const u = await seedUser();
      const stale = sid('race-cancelled');
      await addSub(u.userId, stale, { status: 'created', planId: 'solo_monthly' });
      const errSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
      cancelMock.mockImplementation(async () => {
        await Subscription.updateOne({ razorpaySubscriptionId: stale }, { status: 'cancelled' });
      });
      mockNewSub();

      const r = await createSubscription(u.userId, u.email, 'solo_yearly');

      expect(r.subscriptionId).toBe(sid('new'));
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(errSpy).not.toHaveBeenCalledWith(
        expect.anything(),
        'billing.resubscribe.cancelled_paid_sub',
      );
      expect(mockCaptureMessage).not.toHaveBeenCalled();
    });
  });

  it('two concurrent requests for different plans never both create a sub', async () => {
    const u = await seedUser();
    mockNewSub();
    const results = await Promise.allSettled([
      createSubscription(u.userId, u.email, 'solo_monthly'),
      createSubscription(u.userId, u.email, 'solo_yearly'),
    ]);
    expect(createMock.mock.calls.length).toBeLessThanOrEqual(1);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeLessThanOrEqual(1);
  });
});

// ─── Webhook on the already-cancelled stale checkout is harmless ─────────────
describe('T-516: subscription.cancelled webhook on an already-cancelled stale checkout', () => {
  it('stays cancelled, no error, no Ink or plan change, no ledger rows', async () => {
    const user = await User.create({
      email: 't516-wh@example.com',
      plan: 'pro',
      planTier: 'solo',
      billingCycle: 'monthly',
      inkSub: 80,
      inkAnnualCarry: 10,
      emailVerified: true,
    });
    const userId = user._id.toString();
    const stale = sid('wh-stale');
    await addSub(userId, stale, { status: 'created', planId: 'solo_monthly' });
    mockNewSub(sid('wh-new'), url('wh-new'));
    await createSubscription(userId, 't516-wh@example.com', 'solo_yearly');
    expect((await getSub(stale))!.status).toBe('cancelled');
    const before = await User.findById(userId).lean();
    const ledgerBefore = await mongoose.connection.db!.collection('inkledger').countDocuments({});
    const errSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);

    await expect(
      handleWebhookEvent('subscription.cancelled', {
        subscription: { entity: { id: stale, status: 'cancelled' } },
      }),
    ).resolves.toBeUndefined();

    expect((await getSub(stale))!.status).toBe('cancelled');
    expect((await getSub(sid('wh-new')))!.status).toBe('created');
    const after = await User.findById(userId).lean();
    expect(after!.plan).toBe(before!.plan);
    expect(after!.planTier).toBe(before!.planTier);
    expect(after!.billingCycle).toBe(before!.billingCycle);
    expect(after!.inkSub).toBe(before!.inkSub);
    expect(after!.inkAnnualCarry).toBe(before!.inkAnnualCarry);
    expect(await mongoose.connection.db!.collection('inkledger').countDocuments({})).toBe(
      ledgerBefore,
    );
    expect(errSpy).not.toHaveBeenCalled();
  });
});
