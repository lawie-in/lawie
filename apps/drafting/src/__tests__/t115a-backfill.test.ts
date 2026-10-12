/**
 * T-115a AC3/AC4 F — the backfill, src/scripts/encrypt-case-details.ts.
 *
 * The script has no exported main (it runs on import), so most cases spawn it
 * with ts-node --transpile-only against the in-memory MongoDB, with the test
 * key. The one case that needs a write to land between the script's read and
 * its write (a ledger whose currentVersion moves) loads the script in this
 * process, in an isolated module registry, and wraps the driver's updateOne.
 *
 * Case-detail values here are made-up strings. Nothing runs against a real
 * database: MONGO_URI is always the in-memory server.
 */
import './setupDb';
import { spawnSync } from 'child_process';
import mongoose from 'mongoose';
import path from 'path';

import { LedgerFact, LedgerUnresolvedFact } from '@lawie/shared';

import { openVersion } from '../services/fact-ledger.service';
import {
  FilingChecklistCarrier,
  FormInputsCarrier,
  readFilingChecklist,
  readFormInputs,
} from '../utils/case-details';
import { encrypt } from '../utils/encryption';

jest.setTimeout(180_000);

const SCRIPT = path.join(__dirname, '..', 'scripts', 'encrypt-case-details.ts');
const DRAFTING_DIR = path.join(__dirname, '..', '..');
const TS_NODE = require.resolve('ts-node/dist/bin.js');
const TEST_KEY = process.env.ENCRYPTION_KEY!;
const WRONG_KEY = 'ff'.repeat(32);

const uri = () =>
  `mongodb://${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`;
const docs = () => mongoose.connection.db!.collection('documents');
const ledgers = () => mongoose.connection.db!.collection('factledgers');

interface Run {
  status: number | null;
  out: string;
}

function runScript(args: string[], env: Record<string, string> = {}): Run {
  const r = spawnSync(
    process.execPath,
    [
      TS_NODE,
      '--transpile-only',
      '--project',
      path.join(DRAFTING_DIR, 'tsconfig.json'),
      SCRIPT,
      ...args,
    ],
    {
      cwd: DRAFTING_DIR,
      encoding: 'utf8',
      timeout: 150_000,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        NODE_ENV: 'test',
        MONGO_URI: uri(),
        REDIS_URL: 'redis://localhost:6379',
        INTERNAL_SECRET: 'test-internal-secret-at-least-16',
        ENCRYPTION_KEY: TEST_KEY,
        LOG_LEVEL: 'error',
        ...env,
      },
    },
  );
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}

// ── Seeding (raw, so the rows look like pre-change rows) ────────────────────

const T0 = new Date('2026-01-01T00:00:00.000Z');
const T1 = new Date('2026-01-02T00:00:00.000Z');

const legacyInputs = (i: number) => ({
  template_id: 'bail_regular',
  applicant_name: `Zorbaxx Applicant ${i}`,
  fir_number: `${i}/2026`,
  nested: { list: ['alpha', 'beta'], n: i, flag: i % 2 === 0, none: null },
});

const legacyChecklist = (i: number) => [
  `Certified copy of FIR No. Zorbaxx ${i}/2026`,
  'Vakalatnama duly executed',
];
const STATE = [true, false];

const baseDoc = (extra: Record<string, unknown>) => ({
  userId: new mongoose.Types.ObjectId('507f1f77bcf86cd7994391b1'),
  title: 'T',
  docType: 'bail_application',
  generatedContent: encrypt('draft text'),
  status: 'draft',
  createdAt: T0,
  updatedAt: T1,
  ...extra,
});

const F = (key: string, display: string): LedgerFact =>
  ({
    key,
    type: 'text',
    value: display,
    display,
    raw_span: display,
    source: 'user',
    confidence: 0.9,
  }) as unknown as LedgerFact;
const U = (key: string, span: string): LedgerUnresolvedFact =>
  ({
    key,
    type: 'text',
    reason: 'no_verbatim_span',
    raw_span: span,
  }) as unknown as LedgerUnresolvedFact;

const LEDGER_USER = new mongoose.Types.ObjectId('507f1f77bcf86cd7994391b1');
const legacyLedger = (n: number, versions = 2) => ({
  userId: LEDGER_USER,
  documentKind: 'bail_regular',
  runType: 'user',
  intakeId: `intake-${n}`,
  currentVersion: versions,
  versions: Array.from({ length: versions }, (_, k) => ({
    version: k + 1,
    facts: [F('court', `Quillon Court ${n}-${k}`)],
    unresolved: k === 0 ? [U('victim_name', `Quillon Victim ${n}`)] : [],
    createdAt: new Date(T0.getTime() + k * 1000),
    reason: k === 0 ? 'extract' : 'edit',
  })),
  createdAt: T0,
  updatedAt: T1,
});

interface Seeded {
  docIds: mongoose.Types.ObjectId[];
  nullIds: mongoose.Types.ObjectId[];
  newId: mongoose.Types.ObjectId;
  bothId: mongoose.Types.ObjectId;
  ledgerIds: mongoose.Types.ObjectId[];
}

async function seed(
  opts: { legacyDocs: number; sample?: boolean } = { legacyDocs: 5 },
): Promise<Seeded> {
  const withSample = opts.sample !== false;
  const sampleField = withSample ? {} : { generatedContent: undefined };
  const legacy = Array.from({ length: opts.legacyDocs }, (_, i) =>
    baseDoc({
      formInputs: legacyInputs(i),
      filingChecklist: legacyChecklist(i),
      checklistState: STATE,
      ...sampleField,
    }),
  );
  const nulls = [
    baseDoc({ formInputs: null, filingChecklist: null, checklistState: STATE, ...sampleField }),
    baseDoc({ formInputs: null, filingChecklist: null, checklistState: STATE, ...sampleField }),
  ];
  const newer = baseDoc({
    formInputsEnc: encrypt(JSON.stringify({ prior: 'Mirabel' })),
    filingChecklistEnc: encrypt(JSON.stringify(['Mirabel item'])),
    checklistState: STATE,
    ...sampleField,
  });
  const both = baseDoc({
    formInputsEnc: encrypt(JSON.stringify({ x: 'enc' })),
    formInputs: { x: 'plain-left-for-a-person' },
    filingChecklist: legacyChecklist(7),
    checklistState: STATE,
    ...sampleField,
  });
  const strip = (d: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
  const all = [...legacy, ...nulls, newer, both].map(strip);
  const r = await docs().insertMany(all);
  const ids = Object.values(r.insertedIds) as mongoose.Types.ObjectId[];

  const ls = [legacyLedger(1), legacyLedger(2, 3), legacyLedger(3, 1)];
  // A ledger with a plain version missing `unresolved`, and one already sealed.
  (ls[2].versions[0] as Record<string, unknown>).unresolved = undefined;
  ls[2].versions = ls[2].versions.map(strip) as never;
  const lr = await ledgers().insertMany(ls);

  return {
    docIds: ids.slice(0, opts.legacyDocs),
    nullIds: ids.slice(opts.legacyDocs, opts.legacyDocs + 2),
    newId: ids[opts.legacyDocs + 2],
    bothId: ids[opts.legacyDocs + 3],
    ledgerIds: Object.values(lr.insertedIds) as mongoose.Types.ObjectId[],
  };
}

/** Every row, as stored, as one comparable string. */
async function snapshot(): Promise<string> {
  const d = await docs().find({}).sort({ _id: 1 }).toArray();
  const l = await ledgers().find({}).sort({ _id: 1 }).toArray();
  return JSON.stringify({ d, l });
}

/** Seeded values that must never reach the output. */
const SECRETS = ['Zorbaxx', 'Quillon', 'alpha', 'plain-left-for-a-person', 'Mirabel'];
function expectNoValues(out: string, ids: mongoose.Types.ObjectId[] = []) {
  for (const s of SECRETS) expect(out).not.toContain(s);
  for (const id of ids) expect(out).not.toContain(String(id));
}

describe('T-115a AC3 F: backfill script (spawned)', () => {
  it('no args, both flags, and an unknown arg exit 2 and write nothing', async () => {
    await seed();
    const before = await snapshot();
    for (const args of [[], ['--dry-run', '--yes'], ['--bogus'], ['--yes', '--bogus']]) {
      const r = runScript(args);
      expect(r.status).toBe(2);
      expect(r.out).toContain('Usage');
    }
    expect(await snapshot()).toBe(before);
  });

  it('--dry-run prints counts and writes nothing', async () => {
    const s = await seed({ legacyDocs: 5 });
    const before = await snapshot();
    const r = runScript(['--dry-run']);
    expect(r.status).toBe(0);
    expect(r.out).toContain('Key check: ok');
    expect(r.out).toContain(
      'documents.formInputs: to-encrypt=5 null-unset=2 skipped(already encrypted, plain left)=1',
    );
    expect(r.out).toContain(
      'documents.filingChecklist: to-encrypt=6 null-unset=2 skipped(already encrypted, plain left)=0',
    );
    expect(r.out).toContain('factledgers: to-encrypt=3');
    expect(r.out).toContain('nothing written');
    expectNoValues(r.out, [...s.docIds, ...s.ledgerIds]);
    expect(await snapshot()).toBe(before);
  });

  it('--yes across more than one batch of 200: every row reads the same, plain fields gone, timestamps unchanged, second run changes nothing', async () => {
    const N = 450;
    const s = await seed({ legacyDocs: N });
    const legacyLedgersBefore = await ledgers().find({}).sort({ _id: 1 }).toArray();

    const r = runScript(['--yes']);
    expect(r.status).toBe(0);
    expect(r.out).toContain('Key check: ok');
    // 450 legacy + 2 null + 1 both = 453 scanned; the already-encrypted-only row is not scanned.
    expect(r.out).toContain(
      `documents.formInputs: scanned=${N + 3} encrypted=${N} null-unset=2 skipped=1 failed=0`,
    );
    // The row with both formInputs fields still has a plain checklist, so it is encrypted here.
    expect(r.out).toContain(
      `documents.filingChecklist: scanned=${N + 3} encrypted=${N + 1} null-unset=2 skipped=0 failed=0`,
    );
    expect(r.out).toContain('factledgers: scanned=3 encrypted=3 null-unset=0 skipped=0 failed=0');
    expectNoValues(r.out, [...s.docIds, ...s.nullIds, ...s.ledgerIds]);

    // Documents: same reading, plain field gone, Enc is not the plain text, timestamps untouched.
    for (let i = 0; i < N; i += 1) {
      const row = (await docs().findOne({ _id: s.docIds[i] }))!;
      expect(readFormInputs(row as FormInputsCarrier)).toEqual(legacyInputs(i));
      expect(row).not.toHaveProperty('formInputs');
      expect(row.formInputsEnc as string).not.toContain('Zorbaxx');
      expect(row.createdAt).toEqual(T0);
      expect(row.updatedAt).toEqual(T1);
      // filingChecklist: encrypted, plain gone, checklistState untouched.
      expect(row).not.toHaveProperty('filingChecklist');
      expect(readFilingChecklist(row as FilingChecklistCarrier)).toEqual(legacyChecklist(i));
      expect(row.filingChecklistEnc as string).not.toContain('Zorbaxx');
      expect(JSON.stringify(row)).not.toContain('Zorbaxx');
      expect(row.checklistState).toEqual(STATE);
    }
    for (const id of s.nullIds) {
      const row = (await docs().findOne({ _id: id }))!;
      expect(row).not.toHaveProperty('formInputs');
      expect(row).not.toHaveProperty('formInputsEnc');
      expect(readFormInputs(row as FormInputsCarrier)).toBeNull();
      // A null checklist is only unset, never turned into an encrypted value.
      expect(row).not.toHaveProperty('filingChecklist');
      expect(row).not.toHaveProperty('filingChecklistEnc');
      expect(readFilingChecklist(row as FilingChecklistCarrier)).toEqual([]);
      expect(row.checklistState).toEqual(STATE);
      expect(row.updatedAt).toEqual(T1);
    }
    // A row that already had the encrypted field is untouched.
    const newer = (await docs().findOne({ _id: s.newId }))!;
    expect(readFormInputs(newer as FormInputsCarrier)).toEqual({ prior: 'Mirabel' });
    // A row with both is skipped: encrypted value kept, plain left for a person.
    const both = (await docs().findOne({ _id: s.bothId }))!;
    expect(readFormInputs(both as FormInputsCarrier)).toEqual({ x: 'enc' });
    expect(both.formInputs).toEqual({ x: 'plain-left-for-a-person' });
    expect(both).not.toHaveProperty('filingChecklist');
    expect(readFilingChecklist(both as FilingChecklistCarrier)).toEqual(legacyChecklist(7));
    expect(readFilingChecklist(newer as FilingChecklistCarrier)).toEqual(['Mirabel item']);

    // Ledgers: every version reads the same, plain fields gone, metadata kept.
    for (const before of legacyLedgersBefore) {
      const after = (await ledgers().findOne({ _id: before._id }))!;
      expect(after.currentVersion).toBe(before.currentVersion);
      expect(after.updatedAt).toEqual(T1);
      expect(after.createdAt).toEqual(T0);
      expect(after.versions).toHaveLength(before.versions.length);
      for (let k = 0; k < before.versions.length; k += 1) {
        const b = before.versions[k];
        const a = after.versions[k];
        expect(a).not.toHaveProperty('facts');
        expect(a).not.toHaveProperty('unresolved');
        expect(typeof a.factsEnc).toBe('string');
        expect(a).toMatchObject({ version: b.version, createdAt: b.createdAt, reason: b.reason });
        expect(openVersion(a)).toEqual({ facts: b.facts ?? [], unresolved: b.unresolved ?? [] });
      }
      expect(JSON.stringify(after)).not.toContain('Quillon');
    }

    // A second run changes nothing.
    const afterFirst = await snapshot();
    const again = runScript(['--yes']);
    expect(again.status).toBe(0);
    // The row with both fields is still counted as skipped each run (its plain copy is left for a person).
    expect(again.out).toContain(
      'documents.formInputs: scanned=1 encrypted=0 null-unset=0 skipped=1 failed=0',
    );
    expect(again.out).toContain(
      'documents.filingChecklist: scanned=0 encrypted=0 null-unset=0 skipped=0 failed=0',
    );
    expect(again.out).toContain(
      'factledgers: scanned=0 encrypted=0 null-unset=0 skipped=0 failed=0',
    );
    expect(await snapshot()).toBe(afterFirst);

    // With that row dealt with, a run has nothing to do.
    await docs().deleteOne({ _id: s.bothId });
    const last = runScript(['--yes']);
    expect(last.status).toBe(0);
    expect(last.out).toContain('Nothing to encrypt');
  });

  it('a second run after a partial state only does the rest (idempotent per row)', async () => {
    const s = await seed({ legacyDocs: 3 });
    expect(runScript(['--yes']).status).toBe(0);
    await docs().deleteOne({ _id: s.bothId });
    const doneSnap = await snapshot();
    // One more legacy row arrives; only it is touched.
    const extra = await docs().insertOne(baseDoc({ formInputs: legacyInputs(99) }));
    const r = runScript(['--yes']);
    expect(r.status).toBe(0);
    expect(r.out).toContain('documents.formInputs: scanned=1 encrypted=1 ');
    const row = (await docs().findOne({ _id: extra.insertedId }))!;
    expect(readFormInputs(row as FormInputsCarrier)).toEqual(legacyInputs(99));
    for (const id of s.docIds) {
      const prev = JSON.parse(doneSnap).d.find((d: { _id: string }) => d._id === String(id));
      const now = (await docs().findOne({ _id: id }))!;
      expect(now.formInputsEnc).toBe(prev.formInputsEnc);
    }
  });

  it('a wrong ENCRYPTION_KEY exits 1 and writes nothing', async () => {
    const s = await seed();
    const before = await snapshot();
    const r = runScript(['--yes'], { ENCRYPTION_KEY: WRONG_KEY });
    expect(r.status).toBe(1);
    expect(r.out).toContain('Key check failed');
    expect(r.out).toContain('Nothing written');
    expectNoValues(r.out, [...s.docIds, ...s.ledgerIds]);
    expect(await snapshot()).toBe(before);
  });

  it('a wrong key in --dry-run says so and writes nothing', async () => {
    await seed();
    const before = await snapshot();
    const r = runScript(['--dry-run'], { ENCRYPTION_KEY: WRONG_KEY });
    expect(r.status).toBe(1);
    expect(r.out).toContain('Key check: failed');
    expect(r.out).toContain('Key check not ok: a real run would write nothing and exit 1.');
    expect(await snapshot()).toBe(before);
  });

  it('--dry-run with no sample to check against and pending rows exits 1', async () => {
    await seed({ legacyDocs: 2, sample: false });
    const before = await snapshot();
    const r = runScript(['--dry-run']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('Key check not ok: a real run would write nothing and exit 1.');
    expect(await snapshot()).toBe(before);
  });

  it('--dry-run with a wrong key and nothing pending exits 0', async () => {
    await docs().insertOne(baseDoc({ formInputsEnc: encrypt('{"a":1}') }));
    const before = await snapshot();
    const r = runScript(['--dry-run'], { ENCRYPTION_KEY: WRONG_KEY });
    expect(r.status).toBe(0);
    expect(r.out).not.toContain('Key check not ok');
    expect(await snapshot()).toBe(before);
  });

  it('--dry-run with the right key and pending rows exits 0, with no key warning', async () => {
    await seed();
    const r = runScript(['--dry-run']);
    expect(r.status).toBe(0);
    expect(r.out).toContain('Key check: ok');
    expect(r.out).not.toContain('Key check not ok');
  });

  it('no stored encrypted value to check the key against exits 1 and writes nothing', async () => {
    await seed({ legacyDocs: 4, sample: false });
    const before = await snapshot();
    const r = runScript(['--yes']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('Key check impossible');
    expect(await snapshot()).toBe(before);
  });

  it('a sealed ledger version alone is enough to check the key', async () => {
    await seed({ legacyDocs: 2, sample: false });
    await ledgers().insertOne({
      ...legacyLedger(9, 1),
      versions: [
        {
          version: 1,
          factsEnc: encrypt(JSON.stringify({ facts: [], unresolved: [] })),
          createdAt: T0,
          reason: 'extract',
        },
      ],
    });
    const r = runScript(['--yes']);
    expect(r.status).toBe(0);
    expect(r.out).toContain('Key check: ok');
  });

  it('a row that cannot be encrypted safely is counted as failed, left plain, exit 1; the rest still go', async () => {
    const s = await seed({ legacyDocs: 2 });
    const bad = await docs().insertOne(baseDoc({ formInputs: [1, 2, 3] }));
    const r = runScript(['--yes']);
    expect(r.status).toBe(1);
    expect(r.out).toContain('failed=1');
    expect(r.out).toContain('NotJsonSafeError=1');
    const badRow = (await docs().findOne({ _id: bad.insertedId }))!;
    expect(badRow.formInputs).toEqual([1, 2, 3]);
    expect(badRow).not.toHaveProperty('formInputsEnc');
    for (let i = 0; i < 2; i += 1) {
      const row = (await docs().findOne({ _id: s.docIds[i] }))!;
      expect(readFormInputs(row as FormInputsCarrier)).toEqual(legacyInputs(i));
      expect(row).not.toHaveProperty('formInputs');
    }
  });
});

// ── A ledger whose currentVersion moves between the read and the write ──────

describe('T-115a AC3 F: ledger changes mid-run (in this process)', () => {
  async function runInProcess(
    mutations: number,
    ledgerId: mongoose.Types.ObjectId,
  ): Promise<{ output: string }> {
    const saved = { MONGO_URI: process.env.MONGO_URI };
    process.env.MONGO_URI = uri();
    const savedArgv = process.argv;
    process.argv = [process.argv[0], SCRIPT, '--yes'];
    const logs: string[] = [];
    const logSpies = (['log', 'error'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.join(' '))),
    );
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const savedExit = process.exitCode;

    let finish!: () => void;
    const finished = new Promise<void>((res) => (finish = res));
    let left = mutations;
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
        const m = require('mongoose') as typeof mongoose;
        const disconnect = m.disconnect.bind(m);
        m.disconnect = (async () => {
          await disconnect();
          finish();
        }) as typeof m.disconnect;
        const proto = m.mongo.Collection.prototype as unknown as {
          updateOne: (this: { collectionName: string }, ...a: unknown[]) => Promise<unknown>;
        };
        const real = proto.updateOne;
        proto.updateOne = async function (this: { collectionName: string }, ...a: unknown[]) {
          const filter = a[0] as Record<string, unknown>;
          if (this.collectionName === 'factledgers' && 'currentVersion' in filter && left > 0) {
            left -= 1;
            // Another request appends a version (written plain, like an old row) first.
            const cur = filter.currentVersion as number;
            await real.call(
              this,
              { _id: filter._id },
              {
                $push: {
                  versions: {
                    version: cur + 1,
                    facts: [F('court', 'Appended Mid Run')],
                    unresolved: [],
                    createdAt: new Date(),
                    reason: 'edit',
                  },
                },
                $set: { currentVersion: cur + 1 },
              },
            );
          }
          return real.apply(this, a);
        };
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
        require(SCRIPT);
      });
      await finished;
    } finally {
      logSpies.forEach((s) => s.mockRestore());
      exitSpy.mockRestore();
      process.argv = savedArgv;
      process.exitCode = savedExit;
      process.env.MONGO_URI = saved.MONGO_URI;
    }
    expect(String(ledgerId)).toBeTruthy();
    return { output: logs.join('\n') };
  }

  it('one concurrent append: the ledger is re-read and retried, nothing is lost', async () => {
    await docs().insertOne(baseDoc({ formInputs: null }));
    const lid = (await ledgers().insertOne(legacyLedger(1, 2))).insertedId;
    const { output } = await runInProcess(1, lid);

    expect(output).toContain('factledgers: scanned=1 encrypted=1 null-unset=0 skipped=0 failed=0');
    const row = (await ledgers().findOne({ _id: lid }))!;
    expect(row.currentVersion).toBe(3);
    expect(row.versions).toHaveLength(3);
    for (const v of row.versions) {
      expect(v).not.toHaveProperty('facts');
      expect(typeof v.factsEnc).toBe('string');
    }
    // The version appended mid-run is kept, and sealed.
    expect(openVersion(row.versions[2]).facts[0]).toMatchObject({ display: 'Appended Mid Run' });
    expect(openVersion(row.versions[0]).facts[0]).toMatchObject({ display: 'Quillon Court 1-0' });
    expect(output).not.toContain('Quillon');
    expect(output).not.toContain('Appended Mid Run');
  });

  it('a ledger that keeps moving is skipped (not failed), and left readable and unharmed', async () => {
    await docs().insertOne(baseDoc({ formInputs: null }));
    const lid = (await ledgers().insertOne(legacyLedger(1, 2))).insertedId;
    const { output } = await runInProcess(10, lid);

    expect(output).toContain('factledgers: scanned=1 encrypted=0 null-unset=0 skipped=1 failed=0');
    const row = (await ledgers().findOne({ _id: lid }))!;
    // Two appends happened (one per attempt); every version still reads, plain, not corrupted.
    expect(row.versions).toHaveLength(4);
    expect(row.currentVersion).toBe(4);
    expect(openVersion(row.versions[0]).facts[0]).toMatchObject({ display: 'Quillon Court 1-0' });
    expect(row.versions.map((v: { version: number }) => v.version)).toEqual([1, 2, 3, 4]);
  });
});
