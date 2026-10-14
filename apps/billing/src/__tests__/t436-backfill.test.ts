/**
 * T-436 AC14: scripts/backfill-invoices.ts.
 *
 * Run as a child process (ts-node, like the `backfill:invoices` package script) against the
 * in-memory MongoDB that setupDb starts, as t399-backfill-yearly-drip.test.ts does. Razorpay is
 * replaced by a fake via a node -r preload (t436-razorpay-stub.js) fed from an env var; the
 * script never reaches the network. MONGO_URI is always passed explicitly.
 */
import './setupDb';
import './setupEnv';
import { spawn } from 'child_process';
import { join } from 'path';
import mongoose from 'mongoose';

const BILLING_DIR = join(__dirname, '..', '..');
const SCRIPT = join(BILLING_DIR, 'scripts', 'backfill-invoices.ts');
const STUB = join(__dirname, 't436-razorpay-stub.js');
const db = () => mongoose.connection.db!;

const uri = () =>
  `mongodb://${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`; // gitleaks:allow

const unix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function run(
  args: string[],
  fixture: unknown,
  over: Record<string, string> = {},
  mongoUri: string = uri(),
) {
  return new Promise<{ code: number | null; out: string; err: string }>((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      NODE_ENV: 'test',
      MONGO_URI: mongoUri,
      INTERNAL_SECRET: process.env.INTERNAL_SECRET,
      RAZORPAY_KEY_ID: 'rzp_test_dummy_key_id',
      RAZORPAY_KEY_SECRET: 'rzp_test_dummy_key_secret',
      RAZORPAY_PLAN_ID: 'plan_test_dummy_plan_id',
      RAZORPAY_WEBHOOK_SECRET: 'whsec_test_dummy_webhook_secret',
      LOG_LEVEL: 'error',
      GST_GSTIN: process.env.GST_GSTIN,
      GST_LEGAL_NAME: process.env.GST_LEGAL_NAME,
      GST_TRADE_NAME: process.env.GST_TRADE_NAME,
      GST_ADDRESS: process.env.GST_ADDRESS,
      GST_STATE_CODE: process.env.GST_STATE_CODE,
      GST_EFFECTIVE_FROM: '2026-01-01',
      T436_RZP_FIXTURE: JSON.stringify(fixture),
      ...over,
    };
    const child = spawn(
      process.execPath,
      ['-r', STUB, require.resolve('ts-node/dist/bin.js'), '--transpile-only', SCRIPT, ...args],
      { cwd: BILLING_DIR, env },
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

/**
 * Two top-ups (one with a coupon amount), one monthly subscription charge, and the cases that
 * must be skipped: failed, before GST_EFFECTIVE_FROM, no payment id, unpaid Razorpay invoice,
 * unreadable payment. Payment order (oldest first): pay_top_old, pay_sub, pay_top_new.
 */
async function seed() {
  const asha = new mongoose.Types.ObjectId();
  const ravi = new mongoose.Types.ObjectId();
  await db()
    .collection('users')
    .insertMany([
      { _id: asha, email: 'asha-pii@example.com', name: 'Asha Pii', gstStateCode: '27' },
      { _id: ravi, email: 'ravi-pii@example.com', name: 'Ravi Pii' },
    ]);
  const ledger = (
    userId: mongoose.Types.ObjectId,
    order: string,
    pay: string | undefined,
    sku: string,
    delta: number,
  ) => ({
    userId,
    delta,
    reason: 'topup_purchase',
    sourceBucket: 'topup',
    reference: order,
    metadata: { ...(pay ? { razorpayPaymentId: pay } : {}), amountInr: 199, topupSkuId: sku },
    createdAt: new Date(),
  });
  await db()
    .collection('inkledger')
    .insertMany([
      ledger(asha, 'order_new', 'pay_top_new', 'topup_mid', 20),
      ledger(ravi, 'order_old', 'pay_top_old', 'topup_max', 56),
      ledger(ravi, 'order_failed', 'pay_failed', 'topup_mini', 6),
      ledger(ravi, 'order_early', 'pay_early', 'topup_mini', 6),
      ledger(ravi, 'order_nopay', undefined, 'topup_mini', 6),
      ledger(ravi, 'order_unread', 'pay_unreadable', 'topup_mini', 6),
    ]);
  await db().collection('subscriptions').insertOne({
    userId: asha,
    razorpaySubscriptionId: 'sub_bf',
    status: 'active',
    planId: 'solo_monthly',
    billingCycle: 'monthly',
    createdAt: new Date(),
  });
  await db().collection('subscriptions').insertOne({
    userId: ravi,
    razorpaySubscriptionId: 'sub_gone',
    status: 'active',
    createdAt: new Date(),
  });
  return { asha, ravi };
}

const FIXTURE = {
  payments: {
    pay_top_old: { status: 'captured', amount: 49900, created_at: unix('2026-02-01T00:00:00Z') },
    pay_sub: { status: 'captured', amount: 79900, created_at: unix('2026-03-01T00:00:00Z') },
    // a coupon: 17900 charged, not the SKU's 19900
    pay_top_new: { status: 'captured', amount: 17900, created_at: unix('2026-04-01T00:00:00Z') },
    pay_failed: { status: 'failed', amount: 6500, created_at: unix('2026-02-15T00:00:00Z') },
    pay_early: { status: 'captured', amount: 6500, created_at: unix('2025-12-31T18:29:59Z') },
    pay_unpaid: { status: 'captured', amount: 79900, created_at: unix('2026-03-15T00:00:00Z') },
  },
  invoices: {
    sub_bf: {
      items: [
        {
          status: 'paid',
          payment_id: 'pay_sub',
          billing_start: unix('2026-03-01T00:00:00Z'),
          billing_end: unix('2026-03-31T00:00:00Z'),
        },
        { status: 'issued', payment_id: 'pay_unpaid' },
        { status: 'paid' },
      ],
    },
    sub_gone: 'throw',
  },
};

jest.setTimeout(120_000);

const invoices = () => db().collection('invoices').find({}).sort({ seq: 1 }).toArray();

describe('backfill-invoices script (AC14)', () => {
  it('dry run (the default) reports what is due and writes nothing', async () => {
    await seed();
    const r = await run([], FIXTURE);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Target (dry run, read-only): mongodb://'); // gitleaks:allow
    expect(r.out).toContain('pay_top_old: due');
    expect(r.out).toContain('pay_sub: due');
    expect(r.out).toContain('pay_top_new: due');
    expect(r.out).toContain('invoices due: 3');
    expect(r.out).toContain('pay_failed: status failed, no invoice');
    expect(r.out).toContain('pay_early: before GST_EFFECTIVE_FROM, no invoice');
    expect(r.out).toContain('no payment id');
    expect(r.out).toContain('pay_unreadable: payment not readable');
    expect(r.out).toContain('sub_gone');
    expect(r.out).toContain('Dry run: nothing written');
    expect(r.out).not.toContain('pii');
    expect(r.out).not.toContain('20AAAAA0000A1Z5');
    expect(await db().collection('invoices').countDocuments({})).toBe(0);
    expect(await db().collection('invoicecounters').countDocuments({})).toBe(0);
    // Dry run creates no collections at all (autoCreate/autoIndex are off), so no indexes either.
    const names = (await db().listCollections().toArray()).map((c) => c.name);
    expect(names).not.toContain('invoices');
    expect(names).not.toContain('invoicecounters');
  });

  it('an explicit --dry-run also writes nothing', async () => {
    await seed();
    const r = await run(['--dry-run'], FIXTURE);
    expect(r.code).toBe(0);
    expect(await db().collection('invoices').countDocuments({})).toBe(0);
  });

  it('--apply issues in payment order, from the amount charged, and respects GST_EFFECTIVE_FROM', async () => {
    const { asha, ravi } = await seed();
    const r = await run(['--apply'], FIXTURE);
    expect(r.code).toBe(0);
    expect(r.out).toContain('--apply: WRITING to mongodb://');
    expect(r.out).toContain('invoices issued: 3, failed: 0');
    expect(r.out).not.toContain('pii');

    const rows = await invoices();
    expect(rows.map((x) => x.paymentId)).toEqual(['pay_top_old', 'pay_sub', 'pay_top_new']);
    expect(rows.map((x) => x.seq)).toEqual([1, 2, 3]);
    expect(
      rows.every((x) => x.state === 'issued' && /^LAW\/\d{4}-\d{2}\/000[123]$/.test(x.number)),
    ).toBe(true);
    expect(rows.every((x) => x.draft.source === 'backfill')).toBe(true);

    const [old, sub, fresh] = rows;
    expect(old.price).toBe(49900);
    expect(old.lines[0].description).toBe('Lawie Ink top-up — 28 Ink');
    expect(String(old.userId)).toBe(String(ravi));
    expect(old.placeOfSupply).toMatchObject({ code: '20', source: 'fallback' });
    expect(old.cgst + old.sgst + old.taxable).toBe(49900);

    expect(sub.price).toBe(79900);
    expect(sub.lines[0].description).toBe(
      'Lawie subscription — Solo Monthly, 1 Mar 2026 to 31 Mar 2026',
    );
    expect(sub.placeOfSupply).toMatchObject({ code: '27', source: 'user' });
    expect(sub.igst).toBe(12188);
    expect(String(sub.userId)).toBe(String(asha));

    expect(fresh.price).toBe(17900); // the coupon price, not 19900
    expect(fresh.lines[0].description).toBe('Lawie Ink top-up — 10 Ink');

    // none for failed, early, unpaid, unreadable, or no-payment-id
    const ids = rows.map((x) => x.paymentId);
    for (const skipped of ['pay_failed', 'pay_early', 'pay_unpaid', 'pay_unreadable']) {
      expect(ids).not.toContain(skipped);
    }
    expect((await db().collection('invoicecounters').findOne({ series: 'invoice' }))!.seq).toBe(3);
  });

  it('is idempotent: a second --apply issues nothing and uses no number', async () => {
    await seed();
    await run(['--apply'], FIXTURE);
    const again = await run(['--apply'], FIXTURE);
    expect(again.code).toBe(0);
    expect(again.out).toContain('invoices due: 0');
    expect(again.out).toContain('invoices issued: 0, failed: 0');
    expect(await db().collection('invoices').countDocuments({})).toBe(3);
    expect((await db().collection('invoicecounters').findOne({ series: 'invoice' }))!.seq).toBe(3);
  });

  it('a later effective date drops the earlier payments (none due)', async () => {
    await seed();
    const r = await run(['--apply'], FIXTURE, { GST_EFFECTIVE_FROM: '2026-03-15' });
    expect(r.code).toBe(0);
    expect(r.out).toContain('invoices due: 1'); // only pay_top_new (1 Apr)
    const rows = await invoices();
    expect(rows.map((x) => x.paymentId)).toEqual(['pay_top_new']);
  });

  it('refuses --apply while the seller config is incomplete (exit 2), writing nothing', async () => {
    await seed();
    const r = await run(['--apply'], FIXTURE, { GST_ADDRESS: '' });
    expect(r.code).toBe(2);
    expect(r.err).toContain('GST_ADDRESS');
    expect(await db().collection('invoices').countDocuments({})).toBe(0);
  });

  it('refuses to run without GST_EFFECTIVE_FROM (exit 2)', async () => {
    await seed();
    const r = await run([], FIXTURE, { GST_EFFECTIVE_FROM: '' });
    expect(r.code).toBe(2);
    expect(r.err).toContain('GST_EFFECTIVE_FROM');
  });

  it('refuses unknown arguments and --apply with --dry-run (exit 2)', async () => {
    await seed();
    expect((await run(['--bogus'], FIXTURE)).code).toBe(2);
    expect((await run(['--apply', '--dry-run'], FIXTURE)).code).toBe(2);
    expect(await db().collection('invoices').countDocuments({})).toBe(0);
  });

  it('prints the redacted host and never the credentials', async () => {
    const host = `${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`;
    const creds = ['user', 's3cretPw'].join(':');
    const r = await run(
      [],
      FIXTURE,
      {},
      `mongodb://${creds}@${host}?authSource=admin&secretParam=zzz`,
    );
    const all = r.out + r.err;
    expect(r.out).toContain(`mongodb://${host}`);
    for (const secret of ['s3cretPw', 'secretParam', 'authSource'])
      expect(all).not.toContain(secret);
  });
});
