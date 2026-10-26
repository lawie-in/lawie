import './setupDb';
import './setupEnv';
import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';

import logger from '../config/logger';
import { Invoice } from '../models/Invoice.model';
import {
  INVOICE_OVERDUE_ALERT_MESSAGE,
  INVOICE_OVERDUE_ALERT_MS,
  resetOverdueAlertsForTests,
  runInvoiceSweep,
} from '../services/invoice-sweep.service';

import { makeIssued, withGstEnv } from './t436-helpers';

// T-595: one Sentry event per invoice / credit note still 'issuing', or issued with its email
// unqueued, 24 h after payment. Deduped per id, carrying id, kind, reason and age only.

jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureMessage: jest.fn(),
}));

const HOUR = 3_600_000;
const NOW = new Date('2026-10-20T12:00:00Z');
const paidAgo = (hours: number) => new Date(NOW.getTime() - hours * HOUR);

// Canary values built at runtime so no literal looks like a secret or real PII.
const canary = {
  email: `${'canary'}${Math.random().toString(36).slice(2, 8)}@${'canary-mail'}.test`,
  name: `${'Canary'} ${Math.random().toString(36).slice(2, 8)}`,
  gstin: `${'29'}${'ZZZZZ'}${String(Math.floor(1000 + Math.random() * 8999))}${'Z1Z9'}`,
  amount: 7_654_321,
};

// createdAt is stamped by Mongoose timestamps at the real clock, so it is rewritten through the
// raw collection to keep fixtures independent of the wall clock (NOW is a fixed date).
async function seedIssuing(
  hoursAgo: number,
  over: Record<string, unknown> = {},
  createdAt: Date = paidAgo(hoursAgo),
) {
  const row = await Invoice.create({
    kind: 'invoice',
    state: 'issuing',
    paymentId: `pay_${Math.random().toString(36).slice(2)}`,
    userId: new mongoose.Types.ObjectId(),
    draft: {
      amount: canary.amount,
      description: canary.name,
      paidAt: paidAgo(hoursAgo),
      source: 'subscription.charged',
    },
    ...over,
  } as Record<string, unknown>);
  await Invoice.collection.updateOne({ _id: row._id }, { $set: { createdAt } });
  return row;
}

async function seedIssued(hoursAgo: number, over: Record<string, unknown> = {}) {
  return makeIssued(new mongoose.Types.ObjectId(), {
    issuedAt: paidAgo(hoursAgo),
    customer: { name: canary.name, email: canary.email, stateCode: '20', stateName: 'Jharkhand' },
    seller: {
      legalName: canary.name,
      tradeName: 'Lawie',
      gstin: canary.gstin,
      address: 'addr',
      stateCode: '20',
      stateName: 'Jharkhand',
    },
    total: canary.amount,
    price: canary.amount,
    ...over,
  });
}

describe('T-595 overdue invoice alert', () => {
  let capture: jest.Mock;
  let restoreEnv: () => void;

  beforeEach(() => {
    resetOverdueAlertsForTests();
    capture = (Sentry.captureMessage as jest.Mock).mockReset().mockImplementation(() => 'evt');
    // Config incomplete: nothing is issued by the run, so rows keep their state.
    restoreEnv = withGstEnv({ GST_GSTIN: '' });
  });

  afterEach(() => {
    restoreEnv();
    jest.restoreAllMocks();
  });

  it('exports a 24 h threshold', () => {
    expect(INVOICE_OVERDUE_ALERT_MS).toBe(24 * HOUR);
  });

  it('captures nothing for a row unissued at 23 h', async () => {
    await seedIssuing(23);
    const counts = await runInvoiceSweep(NOW);
    expect(capture).not.toHaveBeenCalled();
    expect(counts.overdueAlerted).toBe(0);
  });

  it('captures exactly once at 25 h, with id, kind, reason and whole-hour age', async () => {
    const row = await seedIssuing(25);
    const counts = await runInvoiceSweep(NOW);
    expect(counts.overdueAlerted).toBe(1);
    expect(capture).toHaveBeenCalledTimes(1);
    const [message, ctx] = capture.mock.calls[0];
    expect(message).toBe(INVOICE_OVERDUE_ALERT_MESSAGE);
    expect(ctx.tags).toEqual({ invoiceId: String(row._id), kind: 'invoice', reason: 'issuing' });
    expect(ctx.extra).toEqual({ ageHours: 25 });
    expect(ctx.fingerprint).toContain(String(row._id));
  });

  it('rounds the age to a whole hour', async () => {
    await seedIssuing(25.4);
    await runInvoiceSweep(NOW);
    expect(capture.mock.calls[0][1].extra).toEqual({ ageHours: 25 });
  });

  it('does not capture again on the next sweep', async () => {
    await seedIssuing(25);
    await runInvoiceSweep(NOW);
    await runInvoiceSweep(new Date(NOW.getTime() + 5 * 60_000));
    await runInvoiceSweep(new Date(NOW.getTime() + 10 * 60_000));
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('captures a second, different overdue row on a later sweep, once each', async () => {
    await seedIssuing(25);
    await runInvoiceSweep(NOW);
    await seedIssuing(26);
    await runInvoiceSweep(NOW);
    expect(capture).toHaveBeenCalledTimes(2);
    const ids = capture.mock.calls.map((c) => c[1].tags.invoiceId);
    expect(new Set(ids).size).toBe(2);
  });

  it('captures nothing for an issued invoice whose email is queued', async () => {
    await seedIssued(30, { emailQueuedAt: paidAgo(29) });
    await runInvoiceSweep(NOW);
    expect(capture).not.toHaveBeenCalled();
  });

  it('captures one event, reason email_unqueued, for an issued invoice with no queued email at 25 h', async () => {
    const row = await seedIssued(25, { emailQueuedAt: null });
    await runInvoiceSweep(NOW);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][1].tags).toEqual({
      invoiceId: String(row._id),
      kind: 'invoice',
      reason: 'email_unqueued',
    });
  });

  it('captures nothing for an issued invoice with no queued email at 23 h', async () => {
    await seedIssued(23, { emailQueuedAt: null });
    await runInvoiceSweep(NOW);
    expect(capture).not.toHaveBeenCalled();
  });

  it('covers credit notes, with kind in the event', async () => {
    const issuing = await seedIssuing(26, { kind: 'credit_note' });
    const issued = await seedIssued(27, { kind: 'credit_note', seq: 2, emailQueuedAt: null });
    await runInvoiceSweep(NOW);
    expect(capture).toHaveBeenCalledTimes(2);
    const byId = Object.fromEntries(
      capture.mock.calls.map((c) => [c[1].tags.invoiceId, c[1].tags]),
    );
    expect(byId[String(issuing._id)]).toMatchObject({ kind: 'credit_note', reason: 'issuing' });
    expect(byId[String(issued._id)]).toMatchObject({
      kind: 'credit_note',
      reason: 'email_unqueued',
    });
  });

  it('with config complete, a row the run issues is not reported as issuing or email_unqueued', async () => {
    restoreEnv();
    restoreEnv = () => undefined;
    const row = await seedIssuing(25);
    await runInvoiceSweep(NOW);
    const after = await Invoice.findById(row._id).lean();
    expect(after?.state).toBe('issued');
    const reasons = capture.mock.calls
      .filter((c) => c[1].tags.invoiceId === String(row._id))
      .map((c) => c[1].tags.reason);
    expect(reasons).not.toContain('issuing');
    expect(reasons).not.toContain('email_unqueued');
  });

  it('does not alert an issuing row paid 25 h ago but created within 60 s of now', async () => {
    await seedIssuing(25, {}, new Date(NOW.getTime() - 30_000));
    const counts = await runInvoiceSweep(NOW);
    expect(capture).not.toHaveBeenCalled();
    expect(counts.overdueAlerted).toBe(0);
  });

  it('does not alert an unqueued issued row paid 25 h ago but issued within 60 s of now', async () => {
    const row = await seedIssued(0, {
      emailQueuedAt: null,
      issuedAt: new Date(NOW.getTime() - 30_000),
    });
    await Invoice.collection.updateOne({ _id: row._id }, { $set: { 'draft.paidAt': paidAgo(25) } });
    const counts = await runInvoiceSweep(NOW);
    expect(capture).not.toHaveBeenCalled();
    expect(counts.overdueAlerted).toBe(0);
  });

  it('a throwing capture is logged with errName only, not counted, and retried next sweep', async () => {
    const row = await seedIssuing(25);
    capture.mockImplementationOnce(() => {
      throw Object.assign(new Error('leaky capture detail'), { name: 'SentryTransportError' });
    });
    const error = jest.spyOn(logger, 'error');
    const first = await runInvoiceSweep(NOW);
    expect(first.overdueAlerted).toBe(0);
    expect(error).toHaveBeenCalledWith(
      { invoiceId: String(row._id), errName: 'SentryTransportError' },
      expect.stringContaining('capture failed'),
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('leaky capture detail');
    const second = await runInvoiceSweep(NOW);
    expect(second.overdueAlerted).toBe(1);
    expect(capture).toHaveBeenCalledTimes(2);
    const third = await runInvoiceSweep(NOW);
    expect(third.overdueAlerted).toBe(0);
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it('puts no email, name, amount or GSTIN in the event or the log', async () => {
    await seedIssuing(25);
    await seedIssued(26, { emailQueuedAt: null });
    const error = jest.spyOn(logger, 'error');
    await runInvoiceSweep(NOW);
    expect(capture).toHaveBeenCalledTimes(2);
    const payload = JSON.stringify(capture.mock.calls) + JSON.stringify(error.mock.calls);
    expect(payload).not.toContain(canary.email);
    expect(payload).not.toContain(canary.name);
    expect(payload).not.toContain(canary.gstin);
    expect(payload).not.toContain(String(canary.amount));
    expect(payload).not.toContain('@');
    for (const call of capture.mock.calls) {
      expect(Object.keys(call[1].tags).sort()).toEqual(['invoiceId', 'kind', 'reason']);
      expect(Object.keys(call[1].extra)).toEqual(['ageHours']);
    }
  });

  it('a DB error in the overdue check does not throw out of the run, and logs the error name only', async () => {
    await seedIssuing(25);
    const realFind = Invoice.find.bind(Invoice);
    jest.spyOn(Invoice, 'find').mockImplementation(((filter: Record<string, unknown>) => {
      if (filter && 'draft.paidAt' in filter) {
        throw Object.assign(new Error('leaky detail'), { name: 'MongoNetworkError' });
      }
      return realFind(filter);
    }) as never);
    const error = jest.spyOn(logger, 'error');
    await expect(runInvoiceSweep(NOW)).resolves.toMatchObject({ overdueAlerted: 0 });
    expect(capture).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      { errName: 'MongoNetworkError' },
      expect.stringContaining('overdue'),
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('leaky detail');
  });

  it('a failed check leaves the dedupe state alone: the row alerts once after recovery, then not again', async () => {
    await seedIssuing(25);
    const realFind = Invoice.find.bind(Invoice);
    const spy = jest.spyOn(Invoice, 'find').mockImplementationOnce((() => {
      throw new Error('down');
    }) as never);
    await runInvoiceSweep(NOW);
    spy.mockImplementation(realFind as never);
    await runInvoiceSweep(NOW);
    await runInvoiceSweep(NOW);
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
