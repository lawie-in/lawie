import './setupDb';
import './setupEnv';
import mongoose from 'mongoose';

import * as gst from '../config/gst';
import logger from '../config/logger';
import { Invoice } from '../models/Invoice.model';
import { InvoiceCounter } from '../models/InvoiceCounter.model';
import * as invoiceService from '../services/invoice.service';
import { recordInvoiceForPayment } from '../services/invoice.service';
import {
  INVOICE_SWEEP_BATCH,
  INVOICE_SWEEP_INTERVAL_MS,
  INVOICE_SWEEP_MIN_AGE_MS,
  runInvoiceSweep,
  startInvoiceSweep,
  stopInvoiceSweep,
} from '../services/invoice-sweep.service';

import { withGstEnv } from './t436-helpers';

// T-436 AC8: invoice-sweep.service.ts — runs at boot and on an interval, never two at once,
// start/stop. Finishes pending counters, then rows stuck in 'issuing' older than 60 s.

const later = (ms = 2 * INVOICE_SWEEP_MIN_AGE_MS) => new Date(Date.now() + ms);

async function record(paymentId: string, paidAt: Date) {
  const row = await recordInvoiceForPayment({
    paymentId,
    userId: String(new mongoose.Types.ObjectId()),
    amount: 79900,
    paidAt,
    description: 'd',
    source: 'backfill',
  });
  return row!;
}

// Inner afterEach hooks run before setupDb's top-level one, so fake timers are off by then.
const pendingRuns: Array<(n: number) => void> = [];
const cleanup = async () => {
  stopInvoiceSweep();
  jest.useRealTimers();
  // Let any run still in flight finish, so the module's no-overlap flag is clear for the next test.
  while (pendingRuns.length) pendingRuns.pop()!(0);
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  jest.restoreAllMocks();
};

describe('runInvoiceSweep', () => {
  afterEach(cleanup);

  it('exports the 60 s age, 5 min interval and a batch size', () => {
    expect(INVOICE_SWEEP_MIN_AGE_MS).toBe(60_000);
    expect(INVOICE_SWEEP_INTERVAL_MS).toBe(300_000);
    expect(INVOICE_SWEEP_BATCH).toBeGreaterThan(0);
  });

  it('leaves rows younger than 60 s to the live webhook, takes older ones', async () => {
    const row = await record('pay_young', new Date('2026-03-01T00:00:00Z'));
    let counts = await runInvoiceSweep(new Date());
    expect(counts).toMatchObject({ found: 0, issued: 0 });
    expect((await Invoice.findById(row._id).lean())!.state).toBe('issuing');

    counts = await runInvoiceSweep(new Date(Date.now() + 61_000));
    expect(counts).toMatchObject({ found: 1, issued: 1, failed: 0 });
    expect((await Invoice.findById(row._id).lean())!.state).toBe('issued');
  });

  it('a second run issues nothing more', async () => {
    await record('pay_once', new Date('2026-03-01T00:00:00Z'));
    expect((await runInvoiceSweep(later())).issued).toBe(1);
    expect(await runInvoiceSweep(later())).toMatchObject({ found: 0, issued: 0 });
    expect((await InvoiceCounter.findOne({}).lean())!.seq).toBe(1);
  });

  it('issues in payment order, oldest first', async () => {
    await record('pay_c', new Date('2026-03-03T00:00:00Z'));
    await record('pay_a', new Date('2026-03-01T00:00:00Z'));
    await record('pay_b', new Date('2026-03-02T00:00:00Z'));
    await runInvoiceSweep(later());
    const rows = await Invoice.find({}).sort({ seq: 1 }).lean();
    expect(rows.map((r) => [r.paymentId, r.seq])).toEqual([
      ['pay_a', 1],
      ['pay_b', 2],
      ['pay_c', 3],
    ]);
  });

  it('finishes a pending counter allocation, with its number, before anything else', async () => {
    const stuck = await record('pay_stuck', new Date('2026-03-05T00:00:00Z'));
    await record('pay_older', new Date('2026-03-01T00:00:00Z'));
    await InvoiceCounter.create({
      fy: '2026-27',
      series: 'invoice',
      seq: 1,
      pendingInvoiceId: stuck._id,
      pendingIssuedAt: new Date('2026-10-01T00:00:00Z'),
    });
    const counts = await runInvoiceSweep(later());
    expect(counts.issued).toBe(2);
    expect((await Invoice.findById(stuck._id).lean())!.number).toBe('LAW/2026-27/0001');
    expect((await Invoice.findOne({ paymentId: 'pay_older' }).lean())!.number).toBe(
      'LAW/2026-27/0002',
    );
  });

  it('config incomplete: reports blockedByConfig, attempts nothing, logs the names not the values', async () => {
    await record('pay_blocked', new Date('2026-03-01T00:00:00Z'));
    const error = jest.spyOn(logger, 'error');
    const restore = withGstEnv({ GST_GSTIN: '', GST_ADDRESS: '' });
    try {
      const counts = await runInvoiceSweep(later());
      expect(counts).toMatchObject({ blockedByConfig: 1, issued: 0, found: 0 });
    } finally {
      restore();
    }
    expect(await InvoiceCounter.countDocuments({})).toBe(0);
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain('GST_GSTIN');
    expect(logged).not.toContain('Test Road');
    expect(logged).not.toContain('20AAAAA0000A1Z5');
  });

  it('GST_EFFECTIVE_FROM unset also blocks', async () => {
    await record('pay_noeff', new Date('2026-03-01T00:00:00Z'));
    const restore = withGstEnv({ GST_EFFECTIVE_FROM: '' });
    try {
      expect(await runInvoiceSweep(later())).toMatchObject({ blockedByConfig: 1, issued: 0 });
    } finally {
      restore();
    }
  });

  it('drops a row recorded before the effective date was set, using no number', async () => {
    await record('pay_early', new Date('2026-03-01T00:00:00Z'));
    const restore = withGstEnv({ GST_EFFECTIVE_FROM: '2026-06-01' });
    try {
      const counts = await runInvoiceSweep(later());
      expect(counts).toMatchObject({ found: 1, dropped: 1, issued: 0 });
    } finally {
      restore();
    }
    expect(await Invoice.countDocuments({})).toBe(0);
    expect(await InvoiceCounter.countDocuments({})).toBe(0);
  });

  it('counts a row that throws as failed, logs only the error name, and carries on', async () => {
    await record('pay_bad', new Date('2026-03-01T00:00:00Z'));
    await record('pay_good', new Date('2026-03-02T00:00:00Z'));
    const real = invoiceService.issueInvoice;
    const spy = jest
      .spyOn(invoiceService, 'issueInvoice')
      .mockImplementationOnce(async () => {
        throw Object.assign(new Error('secret detail'), { name: 'MongoServerError' });
      })
      .mockImplementation(real);
    const error = jest.spyOn(logger, 'error');
    const counts = await runInvoiceSweep(later());
    expect(spy).toHaveBeenCalledTimes(2);
    expect(counts).toMatchObject({ found: 2, failed: 1, issued: 1 });
    const call = error.mock.calls.find((c) => String(c[1]).includes('issue failed'));
    expect(call![0]).toMatchObject({ errName: 'MongoServerError' });
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret detail');
  });
});

describe('startInvoiceSweep / stopInvoiceSweep', () => {
  afterEach(cleanup);

  // Config reported incomplete and the count stubbed, so a run touches no database and the
  // number of runs is the number of missingSellerConfig calls. A run counts blocked rows
  // ({state: 'issuing'}, held until release) and then, with no REDIS_URL, the issued rows still
  // waiting for their email (filter has emailQueuedAt, answered at once with 0).
  function stubRuns() {
    const missing = jest.spyOn(gst, 'missingSellerConfig').mockReturnValue(['GST_GSTIN']);
    const count = jest.spyOn(Invoice, 'countDocuments').mockImplementation(((
      filter: Record<string, unknown>,
    ) => {
      if (filter && 'emailQueuedAt' in filter) return Promise.resolve(0);
      return new Promise<number>((r) => {
        pendingRuns.push(r);
      });
    }) as never);
    // T-595: the config-incomplete path ends with the overdue check, an Invoice.find chain.
    const chain = {
      sort: () => chain,
      limit: () => chain,
      select: () => chain,
      lean: async () => [],
    };
    jest.spyOn(Invoice, 'find').mockImplementation((() => chain) as never);
    return { missing, count, release: () => pendingRuns.splice(0).forEach((r) => r(0)) };
  }
  const flush = async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  };

  it('runs once at boot, then on each interval', async () => {
    jest.useFakeTimers();
    const { missing, release } = stubRuns();
    startInvoiceSweep(1000);
    expect(missing).toHaveBeenCalledTimes(1);
    release();
    await flush();
    jest.advanceTimersByTime(1000);
    expect(missing).toHaveBeenCalledTimes(2);
    release();
    await flush();
    jest.advanceTimersByTime(2000);
    expect(missing).toHaveBeenCalledTimes(3); // second tick of the 2 s: previous run still pending
    release();
    await flush();
    jest.advanceTimersByTime(1000);
    expect(missing).toHaveBeenCalledTimes(4);
  });

  it('never overlaps: ticks while a run is in flight are skipped', async () => {
    jest.useFakeTimers();
    const { missing, release } = stubRuns();
    startInvoiceSweep(1000);
    jest.advanceTimersByTime(5000);
    expect(missing).toHaveBeenCalledTimes(1);
    release();
    await flush();
    jest.advanceTimersByTime(1000);
    expect(missing).toHaveBeenCalledTimes(2);
  });

  it('starting twice does not start a second timer', async () => {
    jest.useFakeTimers();
    const { missing } = stubRuns();
    startInvoiceSweep(1000);
    startInvoiceSweep(1000);
    expect(jest.getTimerCount()).toBe(1);
    expect(missing).toHaveBeenCalledTimes(1);
  });

  it('stop clears the timer; stopping when not running is safe; it can be started again', async () => {
    jest.useFakeTimers();
    const { missing, release } = stubRuns();
    stopInvoiceSweep();
    startInvoiceSweep(1000);
    release();
    await flush();
    stopInvoiceSweep();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(10_000);
    expect(missing).toHaveBeenCalledTimes(1);
    stopInvoiceSweep();
    startInvoiceSweep(1000);
    expect(missing).toHaveBeenCalledTimes(2);
  });

  it('the default interval is 5 minutes', async () => {
    jest.useFakeTimers();
    const { missing, release } = stubRuns();
    startInvoiceSweep();
    release();
    await flush();
    jest.advanceTimersByTime(INVOICE_SWEEP_INTERVAL_MS - 1);
    expect(missing).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(missing).toHaveBeenCalledTimes(2);
  });

  it('a run that throws is logged (error name only) and the next run still happens', async () => {
    jest.useFakeTimers();
    const error = jest.spyOn(logger, 'error');
    jest.spyOn(gst, 'missingSellerConfig').mockImplementation(() => {
      throw Object.assign(new Error('internal secret'), { name: 'WeirdError' });
    });
    startInvoiceSweep(1000);
    await flush();
    expect(error).toHaveBeenCalledWith({ errName: 'WeirdError' }, 'Invoice sweep failed');
    expect(JSON.stringify(error.mock.calls)).not.toContain('internal secret');
    jest.advanceTimersByTime(1000);
    await flush();
    expect(error).toHaveBeenCalledTimes(2);
  });
});
