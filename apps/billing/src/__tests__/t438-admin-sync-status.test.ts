/**
 * T-438 (c): admin sync validates Razorpay's live status against the nine
 * known ones. Unknown -> 400, a warn log, nothing written. Known -> written.
 * Razorpay is a stub; nothing talks to it.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

jest.mock('../config/razorpay', () => ({
  razorpay: { subscriptions: { create: jest.fn(), fetch: jest.fn() } },
}));

import app from '../app';
import { razorpay } from '../config/razorpay';
import logger from '../config/logger';
import { Subscription } from '../models/Subscription.model';

const headers = {
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': '507f1f77bcf86cd799439011',
  'x-user-email': 'admin@test.com',
  'x-user-name': 'Admin',
  'x-user-plan': 'free',
  'x-user-role': 'Admin',
};
const fetchMock = razorpay.subscriptions.fetch as unknown as jest.Mock;
const URL = '/admin/billing/subscriptions/sub_t438/sync';
const NINE = [
  'created',
  'authenticated',
  'active',
  'pending',
  'halted',
  'paused',
  'cancelled',
  'completed',
  'expired',
];

async function seed(status = 'active') {
  return Subscription.create({
    userId: new mongoose.Types.ObjectId(),
    razorpaySubscriptionId: 'sub_t438',
    status,
    currentPeriodStart: new Date('2026-03-01T00:00:00Z'),
    currentPeriodEnd: new Date('2026-04-01T00:00:00Z'),
  });
}
const stored = async () => Subscription.collection.findOne({ razorpaySubscriptionId: 'sub_t438' });

let warn: jest.SpyInstance;
let updateSpy: jest.SpyInstance;
beforeEach(() => {
  fetchMock.mockReset();
  warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined as never);
  updateSpy = jest.spyOn(Subscription, 'findOneAndUpdate');
});
afterEach(() => jest.restoreAllMocks());

describe('admin sync - unknown live status', () => {
  it('400 with the exact body, a warn log with id and status only, and nothing written', async () => {
    await seed('active');
    const before = await stored();
    fetchMock.mockResolvedValueOnce({
      status: 'frozen',
      current_start: 1767225600,
      current_end: 1769904000,
    });

    const res = await request(app).post(URL).set(headers);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Unknown Razorpay subscription status', status: 'frozen' });
    expect(warn).toHaveBeenCalledTimes(1);
    const [fields] = warn.mock.calls[0];
    expect(fields).toEqual({ razorpaySubscriptionId: 'sub_t438', status: 'frozen' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(process.env.INTERNAL_SECRET);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(await stored()).toEqual(before);
  });

  it('also refuses a status that is the wrong case or empty', async () => {
    await seed('active');
    const before = await stored();
    for (const status of ['ACTIVE', '', 'Halted ']) {
      fetchMock.mockResolvedValueOnce({ status });
      const res = await request(app).post(URL).set(headers);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Unknown Razorpay subscription status', status });
    }
    expect(updateSpy).not.toHaveBeenCalled();
    expect(await stored()).toEqual(before);
  });

  it.each([
    ['number', 5, 'number'],
    ['null', null, 'object'],
    ['object', { a: 1 }, 'object'],
    ['array', ['active'], 'object'],
    ['boolean', true, 'boolean'],
    ['missing', undefined, 'undefined'],
  ] as Array<[string, unknown, string]>)(
    'a %s status: 400 with typeof, nothing written',
    async (_n, value, shown) => {
      await seed('active');
      const before = await stored();
      fetchMock.mockResolvedValueOnce({ status: value });

      const res = await request(app).post(URL).set(headers);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Unknown Razorpay subscription status', status: shown });
      expect(warn.mock.calls[0][0]).toEqual({ razorpaySubscriptionId: 'sub_t438', status: shown });
      expect(updateSpy).not.toHaveBeenCalled();
      expect(await stored()).toEqual(before);
    },
  );

  it('a very long status string is cut to 64 chars in the body and the log', async () => {
    await seed('active');
    const before = await stored();
    fetchMock.mockResolvedValueOnce({ status: 'z'.repeat(5000) });

    const res = await request(app).post(URL).set(headers);

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('z'.repeat(64));
    expect(warn.mock.calls[0][0].status).toBe('z'.repeat(64));
    expect(updateSpy).not.toHaveBeenCalled();
    expect(await stored()).toEqual(before);
  });

  it('an unknown status for a subscription we do not have is 400, not 404, and writes nothing', async () => {
    fetchMock.mockResolvedValueOnce({ status: 'frozen' });
    const res = await request(app).post(URL).set(headers);
    expect(res.status).toBe(400);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe('admin sync - known live status', () => {
  it.each(NINE)('writes %s as before', async (status) => {
    await seed('active');
    fetchMock.mockResolvedValueOnce({
      status,
      current_start: 1767225600,
      current_end: 1769904000,
    });

    const res = await request(app).post(URL).set(headers);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, status });
    expect(warn).not.toHaveBeenCalled();
    const saved = (await Subscription.findOne({ razorpaySubscriptionId: 'sub_t438' }))!;
    expect(saved.status).toBe(status);
    expect(saved.currentPeriodStart!.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(saved.currentPeriodEnd!.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('a known status for a subscription we do not have is still 404', async () => {
    fetchMock.mockResolvedValueOnce({ status: 'halted' });
    const res = await request(app).post(URL).set(headers);
    expect(res.status).toBe(404);
  });
});
