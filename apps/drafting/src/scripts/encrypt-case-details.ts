/**
 * T-115a — one-off backfill: encrypt the case details saved before T-115a.
 *
 *   yarn workspace @lawie/drafting backfill:encrypt-case-details --dry-run
 *   yarn workspace @lawie/drafting backfill:encrypt-case-details --yes
 *
 * - documents, one pass per field: plain `formInputs` -> `formInputsEnc` and
 *   plain `filingChecklist` -> `filingChecklistEnc`, the plain field unset in
 *   the same update as the encrypted write. A null plain field is only unset.
 *   A row that already holds the encrypted field is never overwritten
 *   (skipped). `checklistState` stays plain.
 * - factledgers: every version still holding plain `facts` / `unresolved` is
 *   sealed to `factsEnc`; the versions array is written once, guarded on the
 *   `currentVersion` read (the same check as appendVersion). On a miss the
 *   ledger is re-read and retried once, else skipped.
 *
 * Before any write the key is checked by decrypting one value already stored
 * encrypted; if that fails nothing is written. Every value is checked with
 * decrypt(encrypt(x)) === x before it is written. Batches of 200. Idempotent:
 * a second run finds nothing to do. Writes go through the driver, so
 * `updatedAt` is not touched.
 *
 * Needs MONGO_URI and ENCRYPTION_KEY of the target environment; loads
 * .env.<NODE_ENV> (default development) or .env from the repo root when they
 * are not already set. Back up ENCRYPTION_KEY offline before a real run.
 *
 * Prints counts only: never a value, a field name with content, or an id.
 * Exit codes: 0 done, 1 key check failed or rows failed, 2 usage.
 */
/* eslint-disable import/order, import/first, no-console */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// src/scripts (or dist/scripts) -> apps/drafting -> repo root.
const repoRoot = join(__dirname, '..', '..', '..', '..');
for (const candidate of [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env']) {
  const p = join(repoRoot, candidate);
  if (existsSync(p)) {
    loadDotenv({ path: p });
    break;
  }
}

import mongoose from 'mongoose';

import { env } from '../config/env';
import { LawieDocument } from '../models/Document.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import {
  openVersion,
  sealedPlaintext,
  sealVersion,
  StoredLedgerVersion,
} from '../services/fact-ledger.service';
import { sealFilingChecklist, sealFormInputs } from '../utils/case-details';
import { decrypt } from '../utils/encryption';
/* eslint-enable import/order, import/first */

const BATCH = 200;
const USAGE = 'Usage: backfill:encrypt-case-details (--dry-run | --yes)';

type ObjectId = mongoose.Types.ObjectId;
type Row = Record<string, unknown> & { _id: ObjectId };

interface Counts {
  scanned: number;
  encrypted: number;
  nullUnset: number;
  skipped: number;
  failed: number;
}

const zero = (): Counts => ({ scanned: 0, encrypted: 0, nullUnset: 0, skipped: 0, failed: 0 });

/** Failure counts by error name only. */
const failures = new Map<string, number>();
function fail(counts: Counts, err: unknown): void {
  counts.failed += 1;
  const name = err instanceof Error ? err.name : 'UnknownError';
  failures.set(name, (failures.get(name) ?? 0) + 1);
}

class RoundTripError extends Error {
  constructor() {
    super('decrypt(encrypt(x)) !== x');
    this.name = 'RoundTripError';
  }
}
class NotJsonSafeError extends Error {
  constructor() {
    super('value would change through JSON');
    this.name = 'NotJsonSafeError';
  }
}

/** True when JSON.parse(JSON.stringify(v)) gives back the same value. */
function jsonSafe(v: unknown): boolean {
  if (v === null) return true;
  switch (typeof v) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      return Number.isFinite(v);
    case 'object':
      if (Array.isArray(v)) return v.every(jsonSafe);
      if (Object.getPrototypeOf(v) !== Object.prototype) return false;
      return Object.values(v as Record<string, unknown>).every(jsonSafe);
    default:
      return false;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ── Filters ─────────────────────────────────────────────────────────────────

/** One encrypted Document field and its legacy plain field. */
interface DocField {
  plain: string;
  enc: string;
  /** True when the plain value can be sealed and reads back the same through its read helper. */
  valid: (v: unknown) => boolean;
  seal: (v: unknown) => string;
}

const DOC_FIELDS: readonly DocField[] = [
  {
    // readFormInputs only returns an object.
    plain: 'formInputs',
    enc: 'formInputsEnc',
    valid: (v) => isRecord(v) && jsonSafe(v),
    seal: (v) => sealFormInputs(v as Record<string, unknown>),
  },
  {
    // readFilingChecklist only returns a list of strings.
    plain: 'filingChecklist',
    enc: 'filingChecklistEnc',
    valid: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'),
    seal: (v) => sealFilingChecklist(v as string[]),
  },
];

const hasPlain = (f: DocField) => ({ [f.plain]: { $exists: true } });
const toEncrypt = (f: DocField) => ({
  [f.plain]: { $exists: true, $ne: null },
  [f.enc]: { $exists: false },
});
const toUnset = (f: DocField) => ({
  [f.plain]: { $exists: true, $eq: null },
  [f.enc]: { $exists: false },
});
const both = (f: DocField) => ({ [f.plain]: { $exists: true }, [f.enc]: { $exists: true } });
const DOC_HAS_ANY_PLAIN = { $or: DOC_FIELDS.map(hasPlain) };

const PLAIN_VERSION = {
  factsEnc: { $exists: false },
  $or: [{ facts: { $exists: true } }, { unresolved: { $exists: true } }],
};
const LEDGER_TO_ENCRYPT = { versions: { $elemMatch: PLAIN_VERSION } };

// ── Key check ───────────────────────────────────────────────────────────────

type KeyCheck = 'ok' | 'failed' | 'no-sample';

/** Decrypt one value already stored encrypted. decrypt(encrypt(x)) alone cannot catch a wrong key. */
async function checkKey(): Promise<KeyCheck> {
  const docs = LawieDocument.collection;
  const doc = await docs.findOne(
    { generatedContent: { $type: 'string' } },
    { projection: { generatedContent: 1 }, sort: { _id: -1 } },
  );
  const ledger = doc
    ? null
    : await FactLedgerModel.collection.findOne(
        { 'versions.factsEnc': { $type: 'string' } },
        { projection: { versions: 1 }, sort: { _id: -1 } },
      );
  let sample: string | undefined;
  if (doc && typeof doc.generatedContent === 'string') sample = doc.generatedContent;
  else if (ledger && Array.isArray(ledger.versions)) {
    const v = (ledger.versions as StoredLedgerVersion[]).find(
      (x) => typeof x.factsEnc === 'string',
    );
    sample = v?.factsEnc ?? undefined;
  }
  if (!sample) return 'no-sample';
  try {
    decrypt(sample);
    return 'ok';
  } catch {
    return 'failed';
  }
}

// ── Documents ───────────────────────────────────────────────────────────────

async function backfillDocumentField(f: DocField): Promise<Counts> {
  const counts = zero();
  const col = LawieDocument.collection;
  let lastId: ObjectId | null = null;
  for (;;) {
    const filter: Record<string, unknown> = lastId
      ? { ...hasPlain(f), _id: { $gt: lastId } }
      : { ...hasPlain(f) };
    const batch = (await col
      .find(filter, { projection: { [f.plain]: 1, [f.enc]: 1 } })
      .sort({ _id: 1 })
      .limit(BATCH)
      .toArray()) as Row[];
    if (batch.length === 0) break;
    lastId = batch[batch.length - 1]._id;
    for (const row of batch) {
      counts.scanned += 1;
      try {
        if (row[f.enc] !== undefined) {
          // Already encrypted: never overwritten, and the plain copy is left for a person to look at.
          counts.skipped += 1;
          continue;
        }
        const value = row[f.plain];
        if (value === null) {
          const r = await col.updateOne(
            { _id: row._id, [f.plain]: null, [f.enc]: { $exists: false } },
            { $unset: { [f.plain]: '' } },
          );
          if (r.modifiedCount === 1) counts.nullUnset += 1;
          else counts.skipped += 1;
          continue;
        }
        // Anything the read helper would not return as it is stays plain, for a person.
        if (!f.valid(value)) throw new NotJsonSafeError();
        const plaintext = JSON.stringify(value);
        const sealed = f.seal(value);
        if (decrypt(sealed) !== plaintext) throw new RoundTripError();
        const r = await col.updateOne(
          { _id: row._id, [f.plain]: { $exists: true }, [f.enc]: { $exists: false } },
          { $set: { [f.enc]: sealed }, $unset: { [f.plain]: '' } },
        );
        if (r.modifiedCount === 1) counts.encrypted += 1;
        else counts.skipped += 1;
      } catch (err) {
        fail(counts, err);
      }
    }
  }
  return counts;
}

// ── Fact ledgers ────────────────────────────────────────────────────────────

type StoredVersion = StoredLedgerVersion & Record<string, unknown>;

/** Every version sealed; versions already sealed are kept as they are. Throws on any check failure. */
function sealAll(versions: StoredVersion[]): StoredVersion[] {
  return versions.map((v) => {
    if (typeof v.factsEnc === 'string' && v.factsEnc.length > 0) return v;
    const state = openVersion(v);
    if (!jsonSafe(state)) throw new NotJsonSafeError();
    const sealed = sealVersion({
      version: v.version as number,
      createdAt: v.createdAt as Date,
      reason: v.reason as Parameters<typeof sealVersion>[0]['reason'],
      ...state,
    });
    if (!sealed.factsEnc || decrypt(sealed.factsEnc) !== sealedPlaintext(state)) {
      throw new RoundTripError();
    }
    // Any other stored key is kept; only the plain lists go.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { facts: _f, unresolved: _u, ...rest } = v;
    return { ...rest, ...sealed };
  });
}

/** 'encrypted' | 'gone' (nothing left to do) | 'conflict' (currentVersion moved). */
async function sealLedger(row: Row): Promise<'encrypted' | 'gone' | 'conflict'> {
  const col = FactLedgerModel.collection;
  const versions = Array.isArray(row.versions) ? (row.versions as StoredVersion[]) : [];
  const sealed = sealAll(versions);
  const r = await col.updateOne(
    { _id: row._id, currentVersion: row.currentVersion },
    { $set: { versions: sealed } },
  );
  return r.modifiedCount === 1 ? 'encrypted' : 'conflict';
}

async function backfillLedgers(): Promise<Counts> {
  const counts = zero();
  const col = FactLedgerModel.collection;
  const projection = { versions: 1, currentVersion: 1 };
  let lastId: ObjectId | null = null;
  for (;;) {
    const filter: Record<string, unknown> = lastId
      ? { ...LEDGER_TO_ENCRYPT, _id: { $gt: lastId } }
      : { ...LEDGER_TO_ENCRYPT };
    const batch = (await col
      .find(filter, { projection })
      .sort({ _id: 1 })
      .limit(BATCH)
      .toArray()) as Row[];
    if (batch.length === 0) break;
    lastId = batch[batch.length - 1]._id;
    for (const row of batch) {
      counts.scanned += 1;
      try {
        let outcome = await sealLedger(row);
        if (outcome === 'conflict') {
          // Re-read once: a version may have been appended since the batch was read.
          const again = (await col.findOne(
            { _id: row._id, ...LEDGER_TO_ENCRYPT },
            { projection },
          )) as Row | null;
          outcome = again ? await sealLedger(again) : 'gone';
        }
        if (outcome === 'encrypted') counts.encrypted += 1;
        else counts.skipped += 1;
      } catch (err) {
        fail(counts, err);
      }
    }
  }
  return counts;
}

// ── Main ────────────────────────────────────────────────────────────────────

function line(name: string, c: Counts): string {
  return `${name}: scanned=${c.scanned} encrypted=${c.encrypted} null-unset=${c.nullUnset} skipped=${c.skipped} failed=${c.failed}`;
}

async function dryRun(key: KeyCheck): Promise<void> {
  const docs = LawieDocument.collection;
  console.log(`Key check: ${key}`);
  for (const f of DOC_FIELDS) {
    const [enc, unset, skip] = await Promise.all([
      docs.countDocuments(toEncrypt(f)),
      docs.countDocuments(toUnset(f)),
      docs.countDocuments(both(f)),
    ]);
    console.log(
      `documents.${f.plain}: to-encrypt=${enc} null-unset=${unset} skipped(already encrypted, plain left)=${skip}`,
    );
  }
  const ledgers = await FactLedgerModel.collection.countDocuments(LEDGER_TO_ENCRYPT);
  console.log(`factledgers: to-encrypt=${ledgers}`);
  console.log('Dry run: nothing written. Run with --yes to encrypt.');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const yes = args.includes('--yes');
  const unknown = args.filter((a) => a !== '--dry-run' && a !== '--yes');
  if (dry === yes || unknown.length > 0) {
    console.error(USAGE);
    process.exit(2);
  }

  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  try {
    const key = await checkKey();
    const pending =
      (await LawieDocument.collection.countDocuments(DOC_HAS_ANY_PLAIN)) +
      (await FactLedgerModel.collection.countDocuments(LEDGER_TO_ENCRYPT));
    if (dry) {
      await dryRun(key);
      // A dry run that a real run would refuse must not exit 0: the founder
      // reads 0 as "safe to run". Nothing to encrypt stays 0.
      if (key !== 'ok' && pending > 0) {
        console.error('Key check not ok: a real run would write nothing and exit 1.');
        process.exitCode = 1;
      }
      return;
    }
    if (pending === 0) {
      console.log(`Key check: ${key}`);
      console.log('Nothing to encrypt.');
      return;
    }
    if (key !== 'ok') {
      console.error(
        key === 'failed'
          ? 'Key check failed: ENCRYPTION_KEY does not decrypt a stored value. Nothing written.'
          : 'Key check impossible: no stored encrypted value to test ENCRYPTION_KEY against. Nothing written.',
      );
      process.exitCode = 1;
      return;
    }
    console.log('Key check: ok');
    for (const f of DOC_FIELDS) {
      console.log(line(`documents.${f.plain}`, await backfillDocumentField(f)));
    }
    const ledgerCounts = await backfillLedgers();
    console.log(line('factledgers', ledgerCounts));
    if (failures.size > 0) {
      console.error(`Failures by error: ${[...failures].map(([n, c]) => `${n}=${c}`).join(' ')}`);
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(`Backfill stopped: ${err instanceof Error ? err.name : 'UnknownError'}`);
  void mongoose.disconnect().finally(() => process.exit(1));
});
