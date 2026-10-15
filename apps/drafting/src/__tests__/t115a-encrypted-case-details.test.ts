/**
 * T-115a — saved case details (formInputs and the Fact Ledger) are stored
 * encrypted.
 *
 * A: the generate paths (from-template, from-brief; the legacy /generate is 410 since T-443) store formInputsEnc and no plain case details.
 * B: annexures-pack reads a legacy plain doc and a new encrypted doc alike.
 * C: readFormInputs / openVersion on lean and hydrated rows, and every failure.
 * D: ledgers: new rows hold no plain facts; old, new and mixed rows read the same.
 * E: Mongoose defaults no longer re-add plain fields.
 *
 * The backfill script is in t115a-backfill.test.ts.
 */
import './setupDb';
import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';

import { LedgerFact, LedgerUnresolvedFact } from '@lawie/shared';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import {
  appendVersion,
  createLedger,
  currentState,
  ledgerView,
  openVersion,
  sealVersion,
} from '../services/fact-ledger.service';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import {
  FilingChecklistCarrier,
  FormInputsCarrier,
  readFilingChecklist,
  readFormInputs,
  sealFilingChecklist,
  sealFormInputs,
} from '../utils/case-details';
import { decrypt, encrypt } from '../utils/encryption';
import { sdkAnswer } from './sdkStream';

const mockBuildPack = jest.fn();
jest.mock('../services/annexures.service', () => ({
  ...jest.requireActual('../services/annexures.service'),
  buildAnnexuresPack: (...args: unknown[]) => mockBuildPack(...args),
}));

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994391a1';
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';

function headers(userId = USER_ID) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test Advocate',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

/** A raw collection row, as the reader sees it. */
const readRaw = (row: object) => readFormInputs(row as FormInputsCarrier);

/** The collection as stored, bypassing the model. */
const rawDocs = () => mongoose.connection.db!.collection('documents');
const rawLedgers = () => mongoose.connection.db!.collection('factledgers');

function fact(key: string, display: string, raw_span: string): LedgerFact {
  return {
    key,
    type: 'text',
    value: display,
    display,
    raw_span,
    source: 'user',
    confidence: 0.9,
  } as unknown as LedgerFact;
}
function unresolved(key: string, raw_span: string): LedgerUnresolvedFact {
  return {
    key,
    type: 'text',
    reason: 'no_verbatim_span',
    raw_span,
  } as unknown as LedgerUnresolvedFact;
}

/** AES-256-GCM in the same format as utils/encryption, with a key of the test's choosing. */
function encryptWith(keyHex: string, plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join(':');
}
const OTHER_KEY = 'ab'.repeat(32);

/** The same stored value with one ciphertext byte changed. */
function tamper(stored: string): string {
  const [iv, tag, data] = stored.split(':');
  const bytes = Buffer.from(data, 'base64');
  bytes[0] ^= 0xff;
  return [iv, tag, bytes.toString('base64')].join(':');
}

beforeEach(async () => {
  mockMessagesStream.mockReset();
  mockBuildPack.mockReset();
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
  });
  await Court.create({
    courtId: COURT_ID,
    name: 'District & Sessions Court, Patna',
    designation: 'DISTRICT & SESSIONS JUDGE, PATNA',
    courtType: 'sessions',
    state: 'Bihar',
    stateId: 'bihar',
    city: 'Patna',
    formattingRulesRef: 'bihar_district',
  });
  await User.create({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
});

// ── A: the generate paths ─────────────────────────────────────────────

const TEMPLATE_FORM = {
  fir_number: '124/2026',
  fir_date: '2026-03-15',
  police_station: 'Kotwali, Patna',
  sections_charged: ['103'],
  currently_in_custody: 'yes_judicial',
  custody_since: '2026-03-15',
  state: 'bihar',
  court_type: 'sessions',
  court_name: COURT_ID,
  applicant_name: 'Zorbaxx Template Applicant',
  father_name: 'Shri Quillon Template Father',
  applicant_age: '32',
  address: '77 Wrenfield Template Lane',
  language: 'en',
  facts_narrative: 'Zorbaxx template narrative about a boundary wall dispute with neighbours.',
  grounds_for_bail: ['false_implication', 'no_flight_risk'],
};

const PACK = loadRulePack('bail_regular')!;
const CLAUSE_IDS = PACK.mandatoryClauses.map((c) => c.id);
const FIRST_GROUND = buildChecklist(PACK).find((i) => i.key === 'grounds_for_bail')!.options[0];
const BRIEF_VALUES = [
  { key: 'applicant_name', value: 'Zorbaxx Brief Applicant' },
  { key: 'father_name', value: 'Shri Quillon Brief Father' },
  { key: 'applicant_age', value: '32' },
  { key: 'address', value: '88 Wrenfield Brief Lane, Patna' },
  { key: 'fir_number', value: '555/2026' },
  { key: 'fir_date', value: '2026-03-10' },
  { key: 'police_station', value: 'Kotwali' },
  { key: 'sections_charged', value: ['318'] },
  { key: 'currently_in_custody', value: 'Yes — Judicial custody' },
  {
    key: 'facts_narrative',
    value:
      'Zorbaxx brief narrative: the applicant was wrongly named in the FIR and falsely implicated.',
  },
  { key: 'grounds_for_bail', value: [FIRST_GROUND] },
];

function briefAnswer(): string {
  const body = [
    '1. That the applicant is a law-abiding citizen. He is in custody, the grounds are submitted below, he gives an undertaking, and no earlier bail application has been filed.',
    '2. That the FIR was registered at the police station under the Bharatiya Nyaya Sanhita.',
    '3. That the applicant is in judicial custody and was wrongly named in the FIR and falsely implicated.',
    '4. That the applicant has deep roots in society and will not flee from justice.',
  ].join('\n\n');
  const report = CLAUSE_IDS.map((id) => `${id}: 1`).join('\n');
  return `${body}\n\n===CLAUSES===\n${report}`;
}

async function rawDocAfter(path: string, body: Record<string, unknown>) {
  const res = await request(app).post(path).set(headers()).send(body);
  expect(res.status).toBe(200);
  expect(res.text).toContain('event: done');
  const rows = await rawDocs().find({}).toArray();
  expect(rows).toHaveLength(1);
  return { res, row: rows[0] };
}

/** Whole stored row as text, with the encrypted fields taken out, to look for plain strings. */
function plainText(row: Record<string, unknown>): string {
  return JSON.stringify({
    ...row,
    formInputsEnc: undefined,
    generatedContent: undefined,
    brief: undefined,
    filingChecklistEnc: undefined,
  });
}

/** No plain filingChecklist in the raw row; the sealed one reads back (and holds `fir` when given). */
function expectSealedChecklist(row: Record<string, unknown>, fir?: string) {
  expect(row).not.toHaveProperty('filingChecklist');
  expect(typeof row.filingChecklistEnc).toBe('string');
  const items = readFilingChecklist(row as FilingChecklistCarrier);
  if (fir) {
    expect(items.length).toBeGreaterThan(0);
    expect(items.join('\n')).toContain(fir);
  }
  expect(row.filingChecklistEnc as string).not.toContain('Vakalatnama');
}

describe('T-115a AC1/AC4 A: a new document holds no plain case details', () => {
  it('POST /generate-from-template', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer('1. Applicant seeks bail.', 1000, 200));
    const { row } = await rawDocAfter('/generate-from-template', {
      template_id: 'bail_regular',
      form_data: TEMPLATE_FORM,
    });

    expect(row).not.toHaveProperty('formInputs');
    expect(typeof row.formInputsEnc).toBe('string');
    const text = plainText(row);
    for (const secret of [
      'Zorbaxx',
      'Quillon',
      'Wrenfield',
      'Kotwali, Patna',
      'boundary wall',
      '124/2026',
    ]) {
      expect(text).not.toContain(secret);
    }
    expectSealedChecklist(row, '124/2026');
    // The raw encrypted value does not hold them either, and it round-trips.
    expect(row.formInputsEnc as string).not.toContain('Zorbaxx');
    expect(readRaw(row)).toEqual({ template_id: 'bail_regular', ...TEMPLATE_FORM });
    expect(JSON.parse(decrypt(row.formInputsEnc as string))).toEqual({
      template_id: 'bail_regular',
      ...TEMPLATE_FORM,
    });
  });

  it('POST /generate-from-brief', async () => {
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(briefAnswer(), 4000, 800));
    const { row } = await rawDocAfter('/generate-from-brief', {
      kind: 'bail_regular',
      values: BRIEF_VALUES,
      court: { state: 'bihar', court_type: 'sessions', court: COURT_ID },
      paragraphs: 12,
    });

    expect(row).not.toHaveProperty('formInputs');
    expect(typeof row.formInputsEnc).toBe('string');
    const text = plainText(row);
    for (const secret of ['Zorbaxx', 'Quillon', 'Wrenfield', '555/2026']) {
      expect(text).not.toContain(secret);
    }
    expectSealedChecklist(row, '555/2026');
    // T-381: the sealed inputs now hold the pack's party inputs, court_type, and (a State row) state.
    expect(readRaw(row)).toEqual({
      template_id: 'bail_regular',
      source: 'brief',
      applicant_name: 'Zorbaxx Brief Applicant',
      father_name: 'Shri Quillon Brief Father',
      applicant_age: '32',
      address: '88 Wrenfield Brief Lane, Patna',
      court_type: 'sessions',
      state: 'Bihar',
    });
  });
});

// ── B: annexures-pack ───────────────────────────────────────────────────────

describe('T-115a AC1 B: annexures-pack reads legacy plain and new encrypted alike', () => {
  const FORM = {
    template_id: 'bail_regular',
    court_name: COURT_ID,
    applicant_name: 'Zorbaxx Annexure Applicant',
  };

  /** Inserts a bail_regular draft row and posts the pack request. */
  async function postPack(docFields: Record<string, unknown>) {
    mockBuildPack.mockResolvedValue(Buffer.from('%PDF'));
    const now = new Date();
    const ins = await rawDocs().insertOne({
      userId: new mongoose.Types.ObjectId(USER_ID),
      title: 'Bail Application',
      docType: 'bail_application',
      generatedContent: encrypt('Paragraph one.\n\nParagraph two.'),
      filingChecklist: [],
      checklistState: [],
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      ...docFields,
    });
    return request(app)
      .post(`/${String(ins.insertedId)}/annexures-pack`)
      .set(headers());
  }

  async function packFormData(docFields: Record<string, unknown>): Promise<unknown> {
    const res = await postPack(docFields);
    expect(res.status).toBe(200);
    expect(mockBuildPack).toHaveBeenCalledTimes(1);
    return (mockBuildPack.mock.calls[0][0] as { formData: unknown }).formData;
  }

  it('a legacy row with plain formInputs', async () => {
    expect(await packFormData({ formInputs: FORM })).toEqual(FORM);
  });

  it('a new row with formInputsEnc', async () => {
    expect(await packFormData({ formInputsEnc: sealFormInputs(FORM) })).toEqual(FORM);
  });

  it('both give the same court lookup (court_name used)', async () => {
    mockBuildPack.mockResolvedValue(Buffer.from('%PDF'));
    const seen: unknown[] = [];
    for (const fields of [{ formInputs: FORM }, { formInputsEnc: sealFormInputs(FORM) }]) {
      mockBuildPack.mockClear();
      await rawDocs().deleteMany({});
      await packFormData(fields);
      const arg = mockBuildPack.mock.calls[0][0] as { courtData?: { designation?: string } };
      seen.push(arg.courtData?.designation);
    }
    expect(seen[0]).toBe('DISTRICT & SESSIONS JUDGE, PATNA');
    expect(seen[1]).toBe(seen[0]);
  });

  it('a row with neither field reads as empty case details, so the pack refuses (T-381)', async () => {
    // Empty details have no client name: 422, and nothing is rendered.
    const res = await postPack({});
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'party_details_missing', missing: ['client_role'] });
    expect(mockBuildPack).not.toHaveBeenCalled();
  });
});

// ── C: readers ──────────────────────────────────────────────────────────────

describe('T-115a AC1/AC4 C: readFormInputs', () => {
  const INPUTS = { template_id: 'bail_regular', applicant_name: 'Zorbaxx', n: 3, list: ['a', 'b'] };
  const base = () => ({
    userId: new mongoose.Types.ObjectId(USER_ID),
    title: 'T',
    docType: 'bail_application',
    generatedContent: encrypt('x'),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  async function both(fields: Record<string, unknown>) {
    const { insertedId } = await rawDocs().insertOne({ ...base(), ...fields });
    const lean = await LawieDocument.findById(insertedId).lean();
    const hydrated = await LawieDocument.findById(insertedId);
    return { lean: lean!, hydrated: hydrated! };
  }

  it('reads the encrypted field on lean and hydrated rows', async () => {
    const { lean, hydrated } = await both({ formInputsEnc: sealFormInputs(INPUTS) });
    expect(readFormInputs(lean)).toEqual(INPUTS);
    expect(readFormInputs(hydrated)).toEqual(INPUTS);
  });

  it('reads a legacy plain row on lean and hydrated rows', async () => {
    const { lean, hydrated } = await both({ formInputs: INPUTS });
    expect(readFormInputs(lean)).toEqual(INPUTS);
    expect(readFormInputs(hydrated)).toEqual(INPUTS);
  });

  it('the encrypted field wins over a leftover plain one', async () => {
    const { lean } = await both({ formInputsEnc: sealFormInputs(INPUTS), formInputs: { a: 1 } });
    expect(readFormInputs(lean)).toEqual(INPUTS);
  });

  it('reads null for a missing field and for a legacy null', async () => {
    const a = await both({});
    expect(readFormInputs(a.lean)).toBeNull();
    expect(readFormInputs(a.hydrated)).toBeNull();
    await rawDocs().deleteMany({});
    const b = await both({ formInputs: null });
    expect(readFormInputs(b.lean)).toBeNull();
    expect(readFormInputs(b.hydrated)).toBeNull();
  });

  it('sealFormInputs holds no plain text and is a different value each time', () => {
    const a = sealFormInputs(INPUTS);
    expect(a).not.toContain('Zorbaxx');
    expect(sealFormInputs(INPUTS)).not.toBe(a);
  });

  it('throws on tampered ciphertext', async () => {
    const { lean, hydrated } = await both({ formInputsEnc: tamper(sealFormInputs(INPUTS)) });
    expect(() => readFormInputs(lean)).toThrow();
    expect(() => readFormInputs(hydrated)).toThrow();
  });

  it('throws on a value made with another key, and never returns data', async () => {
    const { lean } = await both({ formInputsEnc: encryptWith(OTHER_KEY, JSON.stringify(INPUTS)) });
    let got: unknown = 'unset';
    try {
      got = readFormInputs(lean);
    } catch {
      got = 'threw';
    }
    expect(got).toBe('threw');
  });

  it('throws on a malformed stored value', () => {
    expect(() => readFormInputs({ formInputsEnc: 'not-encrypted' })).toThrow();
    expect(() => readFormInputs({ formInputsEnc: 'a:b:c' })).toThrow();
  });

  it.each(['"text"', '[1,2]', 'null', '42', 'true'])(
    'throws when the JSON is not an object: %s',
    (json) => {
      expect(() => readFormInputs({ formInputsEnc: encrypt(json) })).toThrow();
    },
  );

  it('throws when the decrypted text is not JSON', () => {
    expect(() => readFormInputs({ formInputsEnc: encrypt('not json {') })).toThrow();
  });
});

describe('T-115a AC2/AC4 C: openVersion', () => {
  const FACTS = [fact('court', 'Patna', 'Patna court')];
  const UNRES = [unresolved('victim_name', 'Ramesh')];
  const created = new Date('2026-01-02T03:04:05Z');

  it('opens an encrypted version', () => {
    const v = sealVersion({
      version: 1,
      createdAt: created,
      reason: 'extract',
      facts: FACTS,
      unresolved: UNRES,
    });
    expect(v).toMatchObject({ version: 1, createdAt: created, reason: 'extract' });
    expect(v).not.toHaveProperty('facts');
    expect(v).not.toHaveProperty('unresolved');
    expect(v.factsEnc).not.toContain('Patna');
    expect(openVersion(v)).toEqual({ facts: FACTS, unresolved: UNRES });
  });

  it('opens a legacy plain version, reading missing fields as []', () => {
    expect(openVersion({ facts: FACTS, unresolved: UNRES })).toEqual({
      facts: FACTS,
      unresolved: UNRES,
    });
    expect(openVersion({ facts: FACTS })).toEqual({ facts: FACTS, unresolved: [] });
    expect(openVersion({ unresolved: UNRES })).toEqual({ facts: [], unresolved: UNRES });
    expect(openVersion({})).toEqual({ facts: [], unresolved: [] });
    expect(openVersion(undefined)).toEqual({ facts: [], unresolved: [] });
    expect(openVersion(null)).toEqual({ facts: [], unresolved: [] });
  });

  it('returns fresh arrays, so a caller cannot change the stored version', () => {
    const plain = { facts: FACTS, unresolved: UNRES };
    expect(openVersion(plain).facts).not.toBe(FACTS);
    const open = openVersion(plain);
    open.facts.push(fact('x', 'y', 'z'));
    expect(FACTS).toHaveLength(1);
  });

  it('reads lean and hydrated rows alike (encrypted, plain, mixed)', async () => {
    const doc = await FactLedgerModel.create({
      userId: USER_ID,
      documentKind: 'bail_regular',
      runType: 'user',
      currentVersion: 1,
      versions: [
        sealVersion({
          version: 1,
          createdAt: created,
          reason: 'extract',
          facts: FACTS,
          unresolved: UNRES,
        }),
      ],
    });
    // A pre-change version pushed raw.
    await rawLedgers().updateOne(
      { _id: doc._id },
      {
        $push: {
          versions: {
            version: 2,
            facts: FACTS,
            unresolved: [],
            createdAt: created,
            reason: 'edit',
          } as never,
        },
        $set: { currentVersion: 2 },
      },
    );
    const lean = await FactLedgerModel.findById(doc._id).lean();
    const hydrated = await FactLedgerModel.findById(doc._id);
    for (const src of [lean!, hydrated!]) {
      expect(openVersion(src.versions[0])).toEqual({ facts: FACTS, unresolved: UNRES });
      expect(openVersion(src.versions[1])).toEqual({ facts: FACTS, unresolved: [] });
      expect(currentState(src)).toEqual({ facts: FACTS, unresolved: [] });
    }
  });

  it('throws on tampered ciphertext', () => {
    const v = sealVersion({
      version: 1,
      createdAt: created,
      reason: 'extract',
      facts: FACTS,
      unresolved: UNRES,
    });
    expect(() => openVersion({ factsEnc: tamper(v.factsEnc!) })).toThrow();
  });

  it('throws on a value made with another key, and never returns a state', () => {
    const enc = encryptWith(OTHER_KEY, JSON.stringify({ facts: FACTS, unresolved: UNRES }));
    let got: unknown = 'unset';
    try {
      got = openVersion({ factsEnc: enc });
    } catch {
      got = 'threw';
    }
    expect(got).toBe('threw');
  });

  it('a wrong-key version does not fall back to its plain fields', () => {
    const enc = encryptWith(OTHER_KEY, JSON.stringify({ facts: FACTS, unresolved: UNRES }));
    expect(() => openVersion({ factsEnc: enc, facts: FACTS, unresolved: UNRES })).toThrow();
  });

  it.each([
    '[]',
    'null',
    '"x"',
    '{"facts":[]}',
    '{"unresolved":[]}',
    '{"facts":"a","unresolved":[]}',
    '{"facts":[],"unresolved":{}}',
  ])('throws when the JSON is not a ledger state: %s', (json) => {
    expect(() => openVersion({ factsEnc: encrypt(json) })).toThrow();
  });

  it('throws when the decrypted text is not JSON', () => {
    expect(() => openVersion({ factsEnc: encrypt('{{') })).toThrow();
  });
});

// ── D: ledgers ──────────────────────────────────────────────────────────────

describe('T-115a AC2/AC4 D: Fact Ledger storage', () => {
  const S1 = {
    facts: [fact('court', 'Zorbaxx Sessions Court', 'Zorbaxx court')],
    unresolved: [unresolved('victim_name', 'Quillon Victim')],
  };
  const S2 = {
    facts: [...S1.facts, fact('fir_number', '999/2026', 'FIR 999/2026')],
    unresolved: [] as LedgerUnresolvedFact[],
  };

  it('createLedger then appendVersion: the raw row holds no facts, no unresolved and no plain text', async () => {
    const created = await createLedger({
      userId: USER_ID,
      documentKind: 'bail_regular',
      intakeId: 'i1',
      state: S1,
    });
    await appendVersion(created, S2, 'edit', 10);

    const raw = (await rawLedgers().findOne({ _id: created._id }))!;
    const versions = raw.versions as Array<Record<string, unknown>>;
    expect(versions).toHaveLength(2);
    for (const v of versions) {
      expect(Object.keys(v).sort()).toEqual(['createdAt', 'factsEnc', 'reason', 'version']);
      expect(typeof v.factsEnc).toBe('string');
    }
    const text = JSON.stringify(raw);
    for (const secret of [
      'Zorbaxx',
      'Quillon',
      '999/2026',
      'victim_name',
      'raw_span',
      '"facts"',
      '"unresolved"',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(JSON.parse(decrypt(versions[0].factsEnc as string))).toEqual({
      facts: S1.facts,
      unresolved: S1.unresolved,
    });
    expect(JSON.parse(decrypt(versions[1].factsEnc as string))).toEqual({
      facts: S2.facts,
      unresolved: S2.unresolved,
    });
    expect(raw.currentVersion).toBe(2);
  });

  it('versions are append-only: the first version is byte-identical after an append', async () => {
    const created = await createLedger({
      userId: USER_ID,
      documentKind: 'bail_regular',
      intakeId: 'i1',
      state: S1,
    });
    const before = (await rawLedgers().findOne({ _id: created._id }))!.versions[0];
    await appendVersion(created, S2, 'edit', 10);
    const after = (await rawLedgers().findOne({ _id: created._id }))!.versions;
    expect(JSON.stringify(after[0])).toBe(JSON.stringify(before));
  });

  const VIEW_DOC = { id: 'L1', runType: 'user' as const, documentKind: 'bail_regular' };

  it('a pre-change plain ledger and a new one give the same ledgerView and currentState', async () => {
    const t1 = new Date('2026-02-01T00:00:00Z');
    const t2 = new Date('2026-02-02T00:00:00Z');
    const plain = {
      ...VIEW_DOC,
      versions: [
        {
          version: 1,
          facts: S1.facts,
          unresolved: S1.unresolved,
          createdAt: t1,
          reason: 'extract' as const,
        },
        {
          version: 2,
          facts: S2.facts,
          unresolved: S2.unresolved,
          createdAt: t2,
          reason: 'edit' as const,
        },
      ],
    };
    const sealed = {
      ...VIEW_DOC,
      versions: [
        sealVersion({ version: 1, createdAt: t1, reason: 'extract', ...S1 }),
        sealVersion({ version: 2, createdAt: t2, reason: 'edit', ...S2 }),
      ],
    };
    const mixed = { ...VIEW_DOC, versions: [plain.versions[0], sealed.versions[1]] };

    const want = ledgerView(plain as never, []);
    expect(want.facts).toHaveLength(2);
    expect(ledgerView(sealed as never, [])).toEqual(want);
    expect(ledgerView(mixed as never, [])).toEqual(want);
    expect(currentState(plain)).toEqual(currentState(sealed));
    expect(currentState(mixed)).toEqual(currentState(sealed));
    expect(currentState(sealed)).toEqual({ facts: S2.facts, unresolved: S2.unresolved });
  });

  it('ledgerView shows previous_display across an old plain version and a new sealed one', () => {
    const edited = [fact('court', 'Changed Court', 'Changed court')];
    const doc = {
      ...VIEW_DOC,
      versions: [
        {
          version: 1,
          facts: S1.facts,
          unresolved: [],
          createdAt: new Date(),
          reason: 'extract' as const,
        },
        sealVersion({
          version: 2,
          createdAt: new Date(),
          reason: 'edit',
          facts: edited,
          unresolved: [],
        }),
      ],
    };
    const view = ledgerView(doc as never, []);
    expect(view.facts[0]).toMatchObject({
      display: 'Changed Court',
      previous_display: 'Zorbaxx Sessions Court',
    });
  });

  it('ledgerView throws, not garbage, when a version cannot be decrypted', () => {
    const doc = {
      ...VIEW_DOC,
      versions: [
        {
          version: 1,
          factsEnc: encryptWith(OTHER_KEY, JSON.stringify(S1)),
          createdAt: new Date(),
          reason: 'extract' as const,
        },
      ],
    };
    expect(() => ledgerView(doc as never, [])).toThrow();
  });

  it('a ledger written through the model reads back through hydrated and lean docs', async () => {
    const created = await createLedger({
      userId: USER_ID,
      documentKind: 'bail_regular',
      intakeId: 'i1',
      state: S1,
    });
    const hydrated = await FactLedgerModel.findById(created._id);
    const lean = await FactLedgerModel.findById(created._id).lean();
    expect(currentState(hydrated!)).toEqual(S1);
    expect(currentState(lean!)).toEqual(S1);
  });
});

// ── E: Mongoose defaults ────────────────────────────────────────────────────

describe('T-115a E: defaults do not put plain fields back', () => {
  it('a new document has no formInputs key at all (not null)', async () => {
    const doc = await LawieDocument.create({
      userId: USER_ID,
      title: 'T',
      docType: 'bail_application',
      generatedContent: encrypt('x'),
      formInputsEnc: sealFormInputs({ a: 1 }),
    });
    const raw = (await rawDocs().findOne({ _id: doc._id }))!;
    expect(raw).not.toHaveProperty('formInputs');
    expect(readRaw(raw)).toEqual({ a: 1 });
  });

  it('a document created with neither field has neither key', async () => {
    const doc = await LawieDocument.create({
      userId: USER_ID,
      title: 'T',
      docType: 'bail_application',
      generatedContent: encrypt('x'),
    });
    const raw = (await rawDocs().findOne({ _id: doc._id }))!;
    expect(raw).not.toHaveProperty('formInputs');
    expect(raw).not.toHaveProperty('formInputsEnc');
    expect(readRaw(raw)).toBeNull();
  });

  it('a version created with the ledger, and one pushed later, have no facts: [] or unresolved: []', async () => {
    const created = await createLedger({
      userId: USER_ID,
      documentKind: 'bail_regular',
      intakeId: 'i1',
      state: { facts: [], unresolved: [] },
    });
    // Empty lists are still sealed, never stored as plain [].
    await appendVersion(created, { facts: [], unresolved: [] }, 'answer', 10);
    const raw = (await rawLedgers().findOne({ _id: created._id }))!;
    for (const v of raw.versions as Array<Record<string, unknown>>) {
      expect(v).not.toHaveProperty('facts');
      expect(v).not.toHaveProperty('unresolved');
      expect(typeof v.factsEnc).toBe('string');
    }
  });

  it('a direct $push through the model adds no default plain fields', async () => {
    const created = await createLedger({
      userId: USER_ID,
      documentKind: 'bail_regular',
      intakeId: 'i1',
      state: { facts: [], unresolved: [] },
    });
    await FactLedgerModel.updateOne(
      { _id: created._id },
      {
        $push: {
          versions: {
            version: 2,
            factsEnc: encrypt('{"facts":[],"unresolved":[]}'),
            createdAt: new Date(),
            reason: 'answer',
          },
        },
      },
    );
    const raw = (await rawLedgers().findOne({ _id: created._id }))!;
    const v = (raw.versions as Array<Record<string, unknown>>)[1];
    expect(v).not.toHaveProperty('facts');
    expect(v).not.toHaveProperty('unresolved');
  });
});

// ── filingChecklist ─────────────────────────────────────────────────────────

describe('T-115a readFilingChecklist', () => {
  const ITEMS = ['Certified copy of FIR No. Zorbaxx 1/2026', 'Vakalatnama duly executed'];
  const base = () => ({
    userId: new mongoose.Types.ObjectId(USER_ID),
    title: 'T',
    docType: 'bail_application',
    generatedContent: encrypt('x'),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  async function both(fields: Record<string, unknown>) {
    const { insertedId } = await rawDocs().insertOne({ ...base(), ...fields });
    return {
      lean: (await LawieDocument.findById(insertedId).lean())!,
      hydrated: (await LawieDocument.findById(insertedId))!,
    };
  }

  it('reads the encrypted field on lean and hydrated rows', async () => {
    const { lean, hydrated } = await both({ filingChecklistEnc: sealFilingChecklist(ITEMS) });
    expect(readFilingChecklist(lean)).toEqual(ITEMS);
    expect(readFilingChecklist(hydrated)).toEqual(ITEMS);
  });

  it('reads a legacy plain row on lean and hydrated rows', async () => {
    const { lean, hydrated } = await both({ filingChecklist: ITEMS });
    expect(readFilingChecklist(lean)).toEqual(ITEMS);
    expect(readFilingChecklist(hydrated)).toEqual(ITEMS);
  });

  it('the encrypted field wins over a leftover plain one', async () => {
    const { lean } = await both({
      filingChecklistEnc: sealFilingChecklist(ITEMS),
      filingChecklist: ['old'],
    });
    expect(readFilingChecklist(lean)).toEqual(ITEMS);
  });

  it('reads [] when neither field is set, and for a legacy null or empty list', async () => {
    const a = await both({});
    expect(readFilingChecklist(a.lean)).toEqual([]);
    expect(readFilingChecklist(a.hydrated)).toEqual([]);
    await rawDocs().deleteMany({});
    const b = await both({ filingChecklist: null });
    expect(readFilingChecklist(b.lean)).toEqual([]);
    await rawDocs().deleteMany({});
    const c = await both({ filingChecklistEnc: sealFilingChecklist([]) });
    expect(readFilingChecklist(c.lean)).toEqual([]);
  });

  it('the sealed value holds no plain text and differs each time', () => {
    const a = sealFilingChecklist(ITEMS);
    expect(a).not.toContain('Zorbaxx');
    expect(sealFilingChecklist(ITEMS)).not.toBe(a);
  });

  it('returns a fresh array', () => {
    const plain = ['a', 'b'];
    const out = readFilingChecklist({ filingChecklist: plain });
    out.push('c');
    expect(plain).toEqual(['a', 'b']);
  });

  it('throws on tampered ciphertext', () => {
    expect(() =>
      readFilingChecklist({ filingChecklistEnc: tamper(sealFilingChecklist(ITEMS)) }),
    ).toThrow();
  });

  it('throws on a value made with another key, and never returns data', () => {
    const enc = encryptWith(OTHER_KEY, JSON.stringify(ITEMS));
    let got: unknown = 'unset';
    try {
      got = readFilingChecklist({ filingChecklistEnc: enc });
    } catch {
      got = 'threw';
    }
    expect(got).toBe('threw');
    // It does not fall back to a plain copy either.
    expect(() =>
      readFilingChecklist({ filingChecklistEnc: enc, filingChecklist: ITEMS }),
    ).toThrow();
  });

  it('throws on a malformed stored value', () => {
    expect(() => readFilingChecklist({ filingChecklistEnc: 'not-encrypted' })).toThrow();
  });

  it.each(['{}', '"text"', 'null', '42', '[1,2]', '["a",2]', '[["a"]]', '{"0":"a"}'])(
    'throws when the JSON is not a list of strings: %s',
    (json) => {
      expect(() => readFilingChecklist({ filingChecklistEnc: encrypt(json) })).toThrow();
    },
  );

  it('throws when the decrypted text is not JSON', () => {
    expect(() => readFilingChecklist({ filingChecklistEnc: encrypt('[[') })).toThrow();
  });
});

// ── GET /:id and the 500 paths ──────────────────────────────────────────────

describe('T-115a GET /:id: filingChecklist and unreadable values', () => {
  const ITEMS = ['Certified copy of FIR No. Zorbaxx 2/2026', 'Vakalatnama duly executed'];

  async function insert(fields: Record<string, unknown>): Promise<string> {
    const now = new Date();
    const ins = await rawDocs().insertOne({
      userId: new mongoose.Types.ObjectId(USER_ID),
      title: 'Bail Application',
      docType: 'bail_application',
      generatedContent: encrypt('Paragraph one.'),
      checklistState: [true, false],
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      ...fields,
    });
    return String(ins.insertedId);
  }
  const get = (id: string) => request(app).get(`/${id}`).set(headers());

  it('returns the same filingChecklist array for a legacy plain doc and a new encrypted doc', async () => {
    const plainId = await insert({ filingChecklist: ITEMS });
    const encId = await insert({ filingChecklistEnc: sealFilingChecklist(ITEMS) });
    const a = await get(plainId);
    const b = await get(encId);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.filingChecklist).toEqual(ITEMS);
    expect(b.body.filingChecklist).toEqual(ITEMS);
    expect(b.body.checklistState).toEqual([true, false]);
    expect(b.body.content).toBe('Paragraph one.');
    // The response never carries the stored field names.
    expect(b.body).not.toHaveProperty('filingChecklistEnc');
    expect(b.body).not.toHaveProperty('formInputsEnc');
  });

  it('returns [] for a doc with neither field', async () => {
    const res = await get(await insert({}));
    expect(res.status).toBe(200);
    expect(res.body.filingChecklist).toEqual([]);
  });

  it('a draft made by /generate-from-template is returned by GET /:id with its checklist', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer('1. Applicant seeks bail.', 1000, 200));
    const { row } = await rawDocAfter('/generate-from-template', {
      template_id: 'bail_regular',
      form_data: TEMPLATE_FORM,
    });
    const res = await get(String(row._id));
    expect(res.status).toBe(200);
    expect(res.body.filingChecklist).toEqual(readFilingChecklist(row as FilingChecklistCarrier));
    expect(res.body.filingChecklist.join('\n')).toContain('124/2026');
  });

  describe('a wrong key or damaged value answers 500 with no hang, and logs the id and error name only', () => {
    let errSpy: jest.SpyInstance;
    beforeEach(() => {
      errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => errSpy.mockRestore());

    const logged = () => errSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    function expectLogClean(id: string) {
      const log = logged();
      expect(log).toContain(id);
      expect(log).toContain('Error');
      for (const leak of [
        'Zorbaxx',
        'Paragraph one',
        'FIR No',
        'Unsupported state',
        'authenticate',
      ]) {
        expect(log).not.toContain(leak);
      }
    }
    const wrongKey = (text: string) => encryptWith(OTHER_KEY, text);

    const GET_CASES: Array<[string, () => Record<string, unknown>]> = [
      [
        'filingChecklistEnc made with another key',
        () => ({ filingChecklistEnc: wrongKey(JSON.stringify(ITEMS)) }),
      ],
      [
        'filingChecklistEnc tampered',
        () => ({ filingChecklistEnc: tamper(sealFilingChecklist(ITEMS)) }),
      ],
      ['filingChecklistEnc not a list', () => ({ filingChecklistEnc: encrypt('{"a":1}') })],
      [
        'generatedContent made with another key',
        () => ({ generatedContent: wrongKey('Paragraph one.') }),
      ],
      [
        'finalContent made with another key',
        () => ({ finalContent: wrongKey('Final Zorbaxx text') }),
      ],
    ];
    it.each(GET_CASES)('GET /:id with %s', async (_name, fields) => {
      const id = await insert(fields());
      const res = await get(id);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Could not read this document' });
      expect(JSON.stringify(res.body)).not.toContain('Zorbaxx');
      expectLogClean(id);
    });

    const PACK_CASES: Array<[string, () => Record<string, unknown>]> = [
      [
        'formInputsEnc made with another key',
        () => ({ formInputsEnc: wrongKey('{"applicant_name":"Zorbaxx"}') }),
      ],
      [
        'formInputsEnc tampered',
        () => ({ formInputsEnc: tamper(sealFormInputs({ a: 'Zorbaxx' })) }),
      ],
      ['formInputsEnc not an object', () => ({ formInputsEnc: encrypt('[1]') })],
      [
        'generatedContent made with another key',
        () => ({ generatedContent: wrongKey('Paragraph one.') }),
      ],
      [
        'finalContent made with another key',
        () => ({ finalContent: wrongKey('Final Zorbaxx text') }),
      ],
    ];
    it.each(PACK_CASES)('POST /:id/annexures-pack with %s', async (_name, fields) => {
      mockBuildPack.mockResolvedValue(Buffer.from('%PDF'));
      const id = await insert(fields());
      const res = await request(app).post(`/${id}/annexures-pack`).set(headers());
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Annexures pack generation failed' });
      expect(mockBuildPack).not.toHaveBeenCalled();
      expectLogClean(id);
      // No export was recorded for a pack that was not made.
      expect(
        (await rawDocs().findOne({ _id: new mongoose.Types.ObjectId(id) }))!.exportedAs ?? [],
      ).toEqual([]);
    });
  });
});

// ── /generate-from-brief with an unreadable ledger ──────────────────────────

describe('T-115a /generate-from-brief: an unreadable ledger answers 503 before any Ink is held', () => {
  let errSpy: jest.SpyInstance;
  beforeEach(async () => {
    await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => errSpy.mockRestore());

  const GOOD = { facts: [fact('court', 'Zorbaxx Court', 'Zorbaxx court')], unresolved: [] };
  const CASES: Array<[string, () => string]> = [
    ['made with another key', () => encryptWith(OTHER_KEY, JSON.stringify(GOOD))],
    ['tampered', () => tamper(encrypt(JSON.stringify(GOOD)))],
    ['not a ledger state', () => encrypt('[1]')],
  ];

  it.each(CASES)('factsEnc %s', async (_name, make) => {
    const ledgerId = (
      await rawLedgers().insertOne({
        userId: new mongoose.Types.ObjectId(USER_ID),
        documentKind: 'bail_regular',
        runType: 'user',
        currentVersion: 1,
        versions: [{ version: 1, factsEnc: make(), createdAt: new Date(), reason: 'extract' }],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).insertedId;
    const userBefore = await User.findById(USER_ID).lean();
    const ledgersBefore = JSON.stringify(await rawLedgers().find({}).toArray());

    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({
        kind: 'bail_regular',
        values: BRIEF_VALUES,
        court: { state: 'bihar', court_type: 'sessions', court: COURT_ID },
        ledger_id: String(ledgerId),
      });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'ledger_unavailable' });
    // No model call, no draft, no Ink held or charged.
    expect(mockMessagesStream).not.toHaveBeenCalled();
    expect(await rawDocs().countDocuments({})).toBe(0);
    const userAfter = await User.findById(USER_ID).lean();
    expect(userAfter!.inkTopup).toBe(userBefore!.inkTopup);
    expect(userAfter!.inkHolds ?? []).toEqual([]);
    expect(await mongoose.connection.db!.collection('inkledger').countDocuments({})).toBe(0);
    // The ledger is not written to.
    expect(JSON.stringify(await rawLedgers().find({}).toArray())).toBe(ledgersBefore);

    // The log has the ledger id and the error name, never a value.
    const log = errSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    // Only the id and one name word. Under jest an error thrown by node:crypto is from another
    // realm, so `instanceof Error` is false and the name logged is 'unknown'; in production it is 'Error'.
    expect(log).toMatch(
      new RegExp(`ledger unreadable \\(ledgerId=${String(ledgerId)}\\): (Error|unknown)\\s*$`),
    );
    for (const leak of ['Zorbaxx', 'Unsupported state', 'authenticate', 'raw_span']) {
      expect(log).not.toContain(leak);
    }
    expect(res.text).not.toContain('Zorbaxx');
  });
});
