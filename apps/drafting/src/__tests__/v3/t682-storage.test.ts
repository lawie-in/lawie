/**
 * T-682 (Arjun conditions 4 and 5): the v2 encryption helper and key seal every version; the stored
 * document holds ids, keys, reasons, counts and timestamps in plaintext, and nothing else. Fictional,
 * distinctive strings (English and Devanagari) so a leak is easy to find.
 */
import '../setupDb';
import { FactLedgerModel } from '../../models/FactLedger.model';
import { FactLedgerV3Model } from '../../models/FactLedgerV3.model';
import { createLedger as createV2 } from '../../services/fact-ledger.service';
import * as L from '../../services/v3/ledger.service';
import type { LedgerEntry, NonAnswer } from '../../services/v3/ledger.types';
import { decrypt, encrypt } from '../../utils/encryption';
import {
  ARREST,
  CHECKLIST,
  cand,
  CUSTODY,
  freshLedger,
  readDescription,
  storedDoc,
  USER_A,
} from './t682-helpers';

beforeAll(async () => {
  await FactLedgerV3Model.init();
});

// distinctive fictional strings
const NAME_HI = 'ऩीरज़ क्वार्ट्ज़';
const STATION = 'Zorblax Chowk';
const FIR = '7771/2026';
const TEXT =
  `आवेदक ${NAME_HI} को 10.10.2026 को ${STATION} थाने ने पकड़ा, FIR ${FIR}, ` +
  'in judicial custody. Arrested 10.10.2026 or 11.10.2026? Quibbly-detail-4417.';

/** A ledger with a held name, held dates and choices, an unresolved item, a conflict and a non-answer. */
async function richLedger() {
  const s = await freshLedger();
  const r1 = await readDescription(s, TEXT, [
    cand('applicant_name', NAME_HI, NAME_HI),
    cand('police_station', STATION, STATION),
    cand('fir_number', FIR, `FIR ${FIR}`),
    ARREST(),
    CUSTODY(),
    cand('fir_date', '2026-10-09', '10.10.2026', { confidence: 0.05 }),
  ]);
  const r2 = await readDescription(r1.s, TEXT, [cand('arrest_date', '2026-10-11', '11.10.2026')]);
  const r3 = await L.recordNonAnswer(r2.s.ledgerId, USER_A, r2.s.version, {
    key: 'antecedents',
    kind: 'not_known',
    turn: 1,
  });
  return { s, last: r3 };
}

const SECRETS = [
  NAME_HI,
  STATION,
  FIR,
  `FIR ${FIR}`,
  '10.10.2026',
  '11.10.2026',
  '2026-10-10',
  '2026-10-11',
  '10 October 2026',
  '11 October 2026',
  'in judicial custody',
  'Yes — Judicial custody',
  'Quibbly',
  'Test Applicant',
];

async function sealedState(doc: { versions: Array<{ sealed: string }> }, i = -1) {
  const v = i < 0 ? doc.versions[doc.versions.length + i] : doc.versions[i];
  return JSON.parse(decrypt(v.sealed)) as { entries: LedgerEntry[]; nonAnswers: NonAnswer[] };
}

describe('condition 4: the v2 helper and key', () => {
  it("every stored version's sealed state is not plaintext and is not JSON", async () => {
    const { s } = await richLedger();
    const doc = (await storedDoc(s.ledgerId))!;
    expect(doc.versions.length).toBeGreaterThanOrEqual(4);
    for (const v of doc.versions) {
      expect(v.sealed.startsWith('{')).toBe(false);
      expect(() => JSON.parse(v.sealed)).toThrow();
      for (const secret of SECRETS) expect(v.sealed.includes(secret)).toBe(false);
    }
  });

  it('it has the v2 sealed format (iv:tag:ciphertext, base64) and decrypts with the v2 helper', async () => {
    const { s } = await richLedger();
    const doc = (await storedDoc(s.ledgerId))!;
    const v2 = await createV2({
      userId: USER_A,
      documentKind: 'bail_regular',
      intakeId: 'fmt-check',
      state: { facts: [], unresolved: [] },
    });
    const v2Enc = (await FactLedgerModel.findById(v2._id).lean())!.versions[0].factsEnc as string;
    const shape = (x: string) => x.split(':').map((p) => /^[A-Za-z0-9+/]+=*$/.test(p));
    expect(shape(doc.versions[0].sealed)).toEqual(shape(v2Enc));
    expect(doc.versions[0].sealed.split(':')).toHaveLength(3);
    const state = await sealedState(doc);
    expect(Array.isArray(state.entries)).toBe(true);
    expect(Array.isArray(state.nonAnswers)).toBe(true);
    expect(state.entries.some((e) => e.display === 'Yes — Judicial custody')).toBe(true);
    expect(state.nonAnswers).toEqual([
      expect.objectContaining({ key: 'antecedents', kind: 'not_known' }),
    ]);
  });

  it('a sealed value encrypted with the v2 helper reads back through the ledger (same key)', async () => {
    const { s } = await richLedger();
    const doc = (await storedDoc(s.ledgerId))!;
    const state = await sealedState(doc);
    const resealed = encrypt(JSON.stringify(state));
    // swap in a version sealed by the helper directly: the ledger service must open it
    await FactLedgerV3Model.updateOne(
      { _id: s.ledgerId },
      { $set: { [`versions.${doc.versions.length - 1}.sealed`]: resealed } },
    );
    const open = (await L.openLedger(s.ledgerId, USER_A))!;
    expect(open.entries.some((e) => e.key === 'applicant_name' && e.display === NAME_HI)).toBe(
      true,
    );
  });

  it('a tampered sealed value is refused (GCM tag), not read as something else', async () => {
    const { s } = await richLedger();
    const doc = (await storedDoc(s.ledgerId))!;
    const last = doc.versions.length - 1;
    const parts = doc.versions[last].sealed.split(':');
    parts[2] = Buffer.from('tampered').toString('base64');
    await FactLedgerV3Model.updateOne(
      { _id: s.ledgerId },
      { $set: { [`versions.${last}.sealed`]: parts.join(':') } },
    );
    await expect(L.openLedger(s.ledgerId, USER_A)).rejects.toThrow();
  });

  it('every version of the ledger opens (each was sealed under the same key)', async () => {
    const { s } = await richLedger();
    const doc = (await storedDoc(s.ledgerId))!;
    for (let i = 0; i < doc.versions.length; i += 1) {
      const st = await sealedState(doc, i);
      expect(Array.isArray(st.entries)).toBe(true);
    }
  });
});

describe('condition 5: plaintext fields are ids, keys, reasons, counts and timestamps only', () => {
  it('the stored document, serialised, holds no entry value, display, quote or candidate outside `sealed`', async () => {
    const { s } = await richLedger();
    const doc = (await storedDoc(s.ledgerId))!;
    // the conflict (candidates with their quotes) is in there
    const st = await sealedState(doc);
    expect(
      st.entries.some((e) => e.status === 'conflict' && (e.candidates?.length ?? 0) === 2),
    ).toBe(true);
    // everything except the sealed strings
    const stripped = JSON.stringify(doc, (key, value) => (key === 'sealed' ? '<sealed>' : value));
    expect(stripped).toContain('<sealed>');
    for (const secret of SECRETS) {
      expect(`${secret} :: ${stripped.includes(secret)}`).toBe(`${secret} :: false`);
    }
  });

  it('the plain fields are exactly the allowed ones', async () => {
    const { s } = await richLedger();
    const doc = (await storedDoc(s.ledgerId))!;
    expect(Object.keys(doc).sort()).toEqual(
      [
        '__v',
        '_id',
        'createdAt',
        'currentVersion',
        'intakeId',
        'packId',
        'runId',
        'runType',
        'updatedAt',
        'userId',
        'versions',
      ].sort(),
    );
    for (const v of doc.versions) {
      expect(Object.keys(v).sort()).toEqual([
        'changedKeys',
        'createdAt',
        'reason',
        'sealed',
        'version',
      ]);
      expect(Number.isInteger(v.version)).toBe(true);
      expect(v.createdAt).toBeInstanceOf(Date);
    }
  });

  it('changedKeys are checklist keys only (no value in them)', async () => {
    const { s } = await richLedger();
    const doc = (await storedDoc(s.ledgerId))!;
    const keys = new Set(CHECKLIST.map((i) => i.key));
    for (const v of doc.versions) {
      for (const k of v.changedKeys) expect(keys.has(k)).toBe(true);
    }
    expect(doc.versions.flatMap((v) => v.changedKeys)).toEqual(
      expect.arrayContaining(['applicant_name', 'arrest_date', 'antecedents']),
    );
  });

  it('the run id and intake id are opaque ids, and the user is an ObjectId', async () => {
    const { s } = await richLedger();
    const doc = (await storedDoc(s.ledgerId))!;
    expect(doc.runId).toMatch(/^t682-run-/);
    expect(String(doc.userId)).toBe(USER_A);
    expect(doc.currentVersion).toBe(doc.versions.length);
  });

  it('a log of the whole round (reads and writes) holds none of the strings either', async () => {
    const logger = (await import('../../config/logger')).default;
    const spies = (['info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(logger, m).mockImplementation(() => logger),
    );
    try {
      await richLedger();
      const all = JSON.stringify(spies.flatMap((s2) => s2.mock.calls));
      for (const secret of SECRETS) expect(all.includes(secret)).toBe(false);
    } finally {
      spies.forEach((sp) => sp.mockRestore());
    }
  });
});
