/**
 * T-399 AC4: scripts/backfill-yearly-drip.ts.
 *
 * The script runs main() on load and calls process.exit, so it cannot be
 * imported in-process. It is run as a child process (ts-node, as the
 * `backfill:yearly-drip` package script does) against the in-memory MongoDB
 * that setupDb starts. The real clock is used; dates are relative to now.
 */
import './setupDb';
import './setupEnv';
import { spawn } from 'child_process';
import { join } from 'path';
import mongoose from 'mongoose';

const BILLING_DIR = join(__dirname, '..', '..');
const SCRIPT = join(BILLING_DIR, 'scripts', 'backfill-yearly-drip.ts');
const DAY = 86_400_000;
const db = () => mongoose.connection.db!;

// MONGO_URI is always passed: when it is unset the script falls back to the
// repo dotenv file, and a test must never reach a developer database that way.
function run(args: string[], mongoUri: string) {
  return new Promise<{ code: number | null; out: string; err: string }>((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, NODE_ENV: 'test' };
    env.MONGO_URI = mongoUri;
    const child = spawn(
      process.execPath,
      [require.resolve('ts-node/dist/bin.js'), '--transpile-only', SCRIPT, ...args],
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

const hostPart = () =>
  `${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`;
const uri = () =>
  `mongodb://${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`; // gitleaks:allow

async function seed() {
  const userId = new mongoose.Types.ObjectId();
  await db().collection('users').insertOne({
    _id: userId,
    email: 'backfill-pii@example.com',
    plan: 'pro',
    planTier: 'solo',
    billingCycle: 'yearly',
    inkSub: 10,
    inkAnnualCarry: 0,
    inkTopup: 0,
  });
  await db()
    .collection('subscriptions')
    .insertOne({
      userId,
      razorpaySubscriptionId: 'sub_backfill',
      status: 'active',
      billingCycle: 'yearly',
      planId: 'solo_yearly',
      paidThrough: new Date(Date.now() + 200 * DAY),
      inkDripNextAt: new Date(Date.now() - 2 * DAY),
      inkDripCount: 0,
      lastGrantedPaidCount: 1,
      createdAt: new Date(),
    });
  return userId;
}

jest.setTimeout(90_000);

describe('backfill-yearly-drip script', () => {
  it('dry run (the default) reports what is owed and writes nothing', async () => {
    const userId = await seed();
    const r = await run([], uri());
    expect(r.code).toBe(0);
    expect(r.out).toContain('sub_backfill');
    expect(r.out).toContain('owed now 1');
    expect(r.out).toContain('Dry run: nothing written');
    expect(r.out).toContain(`Target (dry run, read-only): mongodb://${hostPart()}`); // gitleaks:allow
    expect(r.out).not.toContain('backfill-pii');
    expect(await db().collection('inkledger').countDocuments({})).toBe(0);
    expect((await db().collection('users').findOne({ _id: userId }))!.inkSub).toBe(10);
    expect((await db().collection('subscriptions').findOne({ userId }))!.inkDripCount).toBe(0);
  });

  it('an explicit --dry-run also writes nothing', async () => {
    await seed();
    const r = await run(['--dry-run'], uri());
    expect(r.code).toBe(0);
    expect(await db().collection('inkledger').countDocuments({})).toBe(0);
  });

  it('--apply grants through settleYearlyDrip (ledger row, reset, counter) and is idempotent', async () => {
    const userId = await seed();
    const r = await run(['--apply'], uri());
    expect(r.code).toBe(0);
    expect(r.out).toContain('drips granted: 1');
    expect(r.out).toContain(`--apply: WRITING to mongodb://${hostPart()}`);
    const rows = await db().collection('inkledger').find({}).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe('sub_drip');
    expect(rows[0].reference).toBe('sub_drip:sub_backfill:1:1');
    expect((await db().collection('users').findOne({ _id: userId }))!.inkSub).toBe(100);
    expect((await db().collection('subscriptions').findOne({ userId }))!.inkDripCount).toBe(1);

    const again = await run(['--apply'], uri());
    expect(again.code).toBe(0);
    expect(again.out).toContain('drips granted: 0');
    expect(await db().collection('inkledger').countDocuments({})).toBe(1);
  });

  it('refuses unknown arguments and --apply with --dry-run (exit code 2), writing nothing', async () => {
    await seed();
    expect((await run(['--bogus'], uri())).code).toBe(2);
    expect((await run(['--apply', '--dry-run'], uri())).code).toBe(2);
    expect(await db().collection('inkledger').countDocuments({})).toBe(0);
  });

  it('prints the redacted host and never the credentials, whatever the connection does', async () => {
    const host = hostPart();
    for (const [creds, secrets] of [
      ['user:s3cretPw', ['s3cretPw']],
      ['us%40er:p@ss:w0rd', ['p@ss', 'w0rd', 'ss:w0rd']],
    ] as const) {
      for (const args of [[], ['--apply']]) {
        const r = await run(args, `mongodb://${creds}@${host}?authSource=admin&secretParam=zzz`);
        const all = r.out + r.err;
        expect(r.out).toContain(`mongodb://${host}`);
        for (const secret of [...secrets, 'secretParam', 'authSource']) {
          expect(all).not.toContain(secret);
        }
      }
    }
  });
});
