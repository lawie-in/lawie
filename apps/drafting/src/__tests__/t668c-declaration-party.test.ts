/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * T-668c (strike 2: Anushka run 5c FAIL on v1.2.4). Legal sign-off: Ajay, AJ-668-M5/M5a/M5b/M5d/M5e,
 * AJ-668c-M6 (one leading role label, for the check only), AJ-668c-P1 / P1a (the prompt line)
 * in handoff/legal/T-511-copy-rulings-ajay.md.
 *
 * A. isPartyNonAnswer M6 table (must block, must pass, Ajay's numbered and Hindi forms).
 * B. buildBrief on plaint_declaration (defendant_name) and on a no-pack brief (fixed.other_party):
 *    a typed or described non-answer blocks Confirm whatever the ledger holds.
 * C. Controls that stay confirmable, and the ledger exemption for an EMPTY value.
 * D. Routes: generate-from-brief with a ledger holding the value -> 400 brief_not_confirmed, no Ink;
 *    the real web path (/intake/brief/update with ledger_edits, then Confirm).
 * E. P1a: the signed prompt line, read from the signed file, is in both Reception prompts.
 *
 * Fictional data only. No network, no model call.
 */
import './setupEnv';
import './setupDb';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { TEMPLATE_CIVIL_PLAINT_SETTING } from '../config/catalogue/template-switches';
import { isEmptyOrNonAnswer, isPartyNonAnswer } from '../config/intake/signed-confirm-messages';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { Generation } from '../models/Generation.model';
import { LawieDocument } from '../models/Document.model';
import { User } from '../models/User.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { createLedger, currentState, loadOwnLedger } from '../services/fact-ledger.service';
import {
  buildBrief,
  buildChecklist,
  fixedChecklist,
  FIXED_KEYS,
  GivenValue,
  ledgerGivenKeys,
} from '../services/intake-brief';
import {
  RECEPTION_GUIDED_SYSTEM_PROMPT,
  RECEPTION_PACK_SYSTEM_PROMPT,
} from '../services/intake.prompts';
import { loadRulePack } from '../services/rule-pack.service';

jest.setTimeout(60_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const USER_ID = '507f1f77bcf86cd79943966c';
const OID = new mongoose.Types.ObjectId(USER_ID);
const MODEL = 'claude-sonnet-4-5-20250929';
const START_INK = 2000;

const DECL = 'plaint_declaration';
const COURT = { state: 'bihar', court_type: 'civil_court', court: 'civil_court_patna' };
const ANUSHKA = 'Not known (a person claiming through a forged sale deed dated 12.02.2025)';

const lastSeg = (k: string) => k.split('.').pop()!;
const declChecklist = buildChecklist(loadRulePack(DECL)!);
const keyOf = (name: string): string => {
  const item = declChecklist.find((i) => lastSeg(i.key) === name);
  if (!item) throw new Error(`no ${name} on ${DECL}`);
  return item.key;
};
const DEF = keyOf('defendant_name');
const PLT = keyOf('plaintiff_name');
const declKind = { id: DECL, name: DECL, court_document: true };

const given = (key: string, value: string, source: 'user' | 'description' = 'user'): GivenValue =>
  ({ key, value, source }) as GivenValue;
const fact = (key: string, text: string) => ({ key, display: text, value: text });

function declBrief(
  defendant: string | null,
  source: 'user' | 'description' = 'user',
  ledger = true,
) {
  const values: GivenValue[] = [given(PLT, 'Sample Person 1')];
  if (defendant !== null) values.push(given(DEF, defendant, source));
  const ledgerGiven =
    ledger && defendant !== null ? ledgerGivenKeys([fact(DEF, defendant)]) : undefined;
  return buildBrief({
    kind: declKind,
    checklist: declChecklist,
    values,
    court: COURT,
    ...(ledgerGiven ? { ledgerGiven } : {}),
  } as any);
}

// ── A. The M6 matcher table ──────────────────────────────────────────────────

describe('T-668c A: isPartyNonAnswer, AJ-668c-M6', () => {
  const MUST_BLOCK = [
    // Ajay's named results
    'Defendant: Not known',
    'Defendant No. 1 - unknown',
    'D1: N/A',
    'प्रतिवादी: पता नहीं',
    'Defendant not known',
    'Defendant',
    'Accused:',
    // Ajay's numbered forms
    'Respondent 2: nil',
    'Defendant no. 3 – none',
    'Defendant #4 — unknown',
    'D-2: nil',
    'P1 - N/A',
    'The Respondents 2 — none',
    'The defendant: Not known',
    'DEFENDANT:   NOT KNOWN',
    '  Defendant  :  not known  ',
    'Opposite Party: unknown',
    'Complainant: N/A',
    'Petitioner - nil',
    'Applicant: Not known (a person claiming)',
    'Name: unknown',
    // Hindi and Hinglish
    'प्रतिवादी संख्या 1: पता नहीं',
    'प्रतिवादीगण: पता नहीं',
    'वादी: पता नहीं',
    'आरोपी - पता नहीं',
    'प्रतिवादी',
    'prativadi: unknown',
    'vadi - nil',
    'aaropi: N/A',
    // a description that is itself the Anushka non-answer
    ANUSHKA,
    'Not known (a person claiming)',
  ];
  const MUST_PASS = [
    'Defendant Traders Pvt Ltd',
    'Respondent: Not Known Traders',
    'Defendant: Na-Young Kim',
    'Applicant: Na. Muthukumar',
    'Not Known Traders, a partnership firm',
    'Not Known Traders',
    'Nilesh',
    'Nagendra',
    'Na. Muthukumar',
    'Party Hall Pvt Ltd',
    'Sample Person 2',
    'Defendant: Sample Person 2',
    'Respondent No. 1: Sample Person 2',
    'Unknownia Traders',
    'The Defender Company',
    'Partyline Services',
    'Accused Sample Person 2',
  ];

  it.each(MUST_BLOCK)('blocks %j', (v) => {
    expect(isPartyNonAnswer(v)).toBe(true);
  });
  it.each(MUST_PASS)('passes %j', (v) => {
    expect(isPartyNonAnswer(v)).toBe(false);
  });

  it('the strip is for the check only: relief and restraint stay exact (isEmptyOrNonAnswer unchanged)', () => {
    expect(isEmptyOrNonAnswer('Defendant: Not known')).toBe(false);
    expect(isEmptyOrNonAnswer('Not known (a person claiming)')).toBe(false);
    expect(isEmptyOrNonAnswer('Not known')).toBe(true);
  });

  it('a list blocks only when every entry does', () => {
    expect(isPartyNonAnswer(['Defendant: Not known', 'D2: nil'])).toBe(true);
    expect(isPartyNonAnswer(['Defendant: Not known', 'Sample Person 2'])).toBe(false);
  });
});

// ── B. buildBrief: a non-answer blocks whatever the ledger holds ─────────────

describe('T-668c B: plaint_declaration, defendant_name (the real key)', () => {
  it('sanity: a real defendant with a ledger fact can confirm', () => {
    const b = declBrief('Sample Person 2');
    expect(b.confirm_blockers).not.toContain('parties');
    expect(b.can_confirm).toBe(true);
  });

  it('a. typed "Not known (...)" with a ledger fact holding the same value: blocked', () => {
    const g = ledgerGivenKeys([fact(DEF, ANUSHKA)]);
    expect(g.has(DEF)).toBe(false); // the ledger does not count it as given
    const b = declBrief(ANUSHKA, 'user', true);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toContain('parties');
    expect(b.confirm_missing_party_keys).toContain(DEF);
    expect(b.ledger_given_keys ?? []).not.toContain(DEF);
  });

  it('a. the same with no ledger: blocked', () => {
    const b = declBrief(ANUSHKA, 'user', false);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_missing_party_keys).toContain(DEF);
  });

  it('a. even if the ledger WERE to list the key as given, a typed non-answer is still missing', () => {
    const b = buildBrief({
      kind: declKind,
      checklist: declChecklist,
      values: [given(PLT, 'Sample Person 1'), given(DEF, ANUSHKA)],
      court: COURT,
      ledgerGiven: new Set([DEF]),
    } as any);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toContain('parties');
    expect(b.confirm_missing_party_keys).toContain(DEF);
  });

  it('b. source description, value "Defendant: Not known": blocked (M6)', () => {
    const b = declBrief('Defendant: Not known', 'description', true);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toContain('parties');
    expect(b.confirm_missing_party_keys).toContain(DEF);
    expect(b.ledger_given_keys ?? []).not.toContain(DEF);
  });

  it('b. ledger fact display "Defendant: Not known" with a different value is not given', () => {
    const g = ledgerGivenKeys([
      { key: DEF, display: 'Defendant: Not known', value: 'Sample Person 2' },
    ]);
    expect(g.has(DEF)).toBe(false);
  });

  it.each([
    'Defendant: Not known',
    'Defendant No. 1 - unknown',
    'प्रतिवादी: पता नहीं',
    'Defendant',
  ])('b. typed %j: blocked, with and without a ledger', (v) => {
    for (const ledger of [true, false]) {
      const b = declBrief(v, 'user', ledger);
      expect(b.can_confirm).toBe(false);
      expect(b.confirm_missing_party_keys).toContain(DEF);
    }
  });

  it('the plaintiff gets the same rule', () => {
    const b = buildBrief({
      kind: declKind,
      checklist: declChecklist,
      values: [given(PLT, 'Plaintiff: Not known'), given(DEF, 'Sample Person 2')],
      court: COURT,
      ledgerGiven: ledgerGivenKeys([fact(PLT, 'Plaintiff: Not known')]),
    } as any);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_missing_party_keys).toEqual([PLT]);
  });
});

describe('T-668c B: fixed.other_party in a no-pack brief', () => {
  const noPack = (value: string, ledger: boolean) =>
    buildBrief({
      kind: { id: null, name: 'Document', court_document: true },
      checklist: fixedChecklist(true),
      values: [
        given(FIXED_KEYS.firstParty, 'Sample Person 1'),
        given(FIXED_KEYS.otherParty, value),
        given(FIXED_KEYS.facts, 'A sample dispute about Plot 000.'),
        given(FIXED_KEYS.relief, 'A sample declaration.'),
      ],
      court: COURT,
      ...(ledger ? { ledgerGiven: ledgerGivenKeys([fact(FIXED_KEYS.otherParty, value)]) } : {}),
    } as any);

  it('the ledger no longer treats a non-answer on the generic party key as given', () => {
    expect(ledgerGivenKeys([fact(FIXED_KEYS.otherParty, ANUSHKA)]).has(FIXED_KEYS.otherParty)).toBe(
      false,
    );
    expect(
      ledgerGivenKeys([fact(FIXED_KEYS.firstParty, 'Defendant: Not known')]).has(
        FIXED_KEYS.firstParty,
      ),
    ).toBe(false);
    expect(
      ledgerGivenKeys([fact(FIXED_KEYS.otherParty, 'Sample Person 2')]).has(FIXED_KEYS.otherParty),
    ).toBe(true);
  });

  it('c. typed "Not known (...)" on fixed.other_party (observed behaviour, see report)', () => {
    const b = noPack(ANUSHKA, true);
    // The no-pack brief is not on the non-answer packs, so confirmState keeps the emptiness-only
    // check there. This records what the code does today; the lead decides if no-pack needs more.
    expect(b.confirm_missing_party_keys ?? []).not.toContain(FIXED_KEYS.otherParty);
    expect(b.ledger_given_keys ?? []).not.toContain(FIXED_KEYS.otherParty);
  });
});

// ── C. Controls ──────────────────────────────────────────────────────────────

describe('T-668c C: controls stay confirmable', () => {
  it.each([
    'Not Known Traders, a partnership firm',
    'Respondent: Not Known Traders',
    'Defendant: Na-Young Kim',
    'Defendant Traders Pvt Ltd',
    'Applicant: Na. Muthukumar',
  ])('typed %j, with the ledger: can confirm', (v) => {
    const b = declBrief(v, 'user', true);
    expect(b.confirm_blockers).not.toContain('parties');
    expect(b.can_confirm).toBe(true);
    expect(b.ledger_given_keys ?? []).toContain(DEF);
  });

  it('a ledger-held real name with an empty typed value: the exemption still works', () => {
    const b = buildBrief({
      kind: declKind,
      checklist: declChecklist,
      values: [given(PLT, 'Sample Person 1')],
      court: COURT,
      ledgerGiven: ledgerGivenKeys([fact(DEF, 'Sample Person 2')]),
    } as any);
    expect(b.confirm_blockers).not.toContain('parties');
    expect(b.can_confirm).toBe(true);
  });

  it('control: the same empty typed value with NO ledger name is blocked', () => {
    const b = declBrief(null, 'user', false);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_missing_party_keys).toContain(DEF);
  });
});

// ── D. Routes ────────────────────────────────────────────────────────────────

const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test Advocate',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

const storedFact = (key: string, text: string) => ({
  id: `f-${lastSeg(key)}`,
  key,
  label: lastSeg(key),
  type: 'person_name',
  value: text,
  display: text,
  raw_span: text,
  source: 'user',
  confidence: 1,
  required_in_draft: true,
});

async function ledgerWith(held: Record<string, string>): Promise<string> {
  const doc = await createLedger({
    userId: USER_ID,
    documentKind: DECL,
    intakeId: 't668c',
    state: { facts: Object.entries(held).map(([k, v]) => storedFact(k, v)) as any, unresolved: [] },
  });
  return String(doc._id);
}

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await redis.flushall();
  await AppSetting.create({ key: 'ai.intake_model', value: 'claude-haiku-4-5-20251001' });
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
  await AppSetting.create({ key: TEMPLATE_CIVIL_PLAINT_SETTING, value: 'on' });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
  });
  await Court.create({
    courtId: 'civil_court_patna',
    name: 'Civil Court, Patna',
    designation: 'CIVIL JUDGE (JUNIOR DIVISION), PATNA',
    courtType: 'civil_court',
    state: 'Bihar',
    stateId: 'bihar',
    city: 'Patna',
    formattingRulesRef: 'civil_court_generic',
  });
  await createVerifiedUser({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: START_INK,
  });
});

async function expectNothingRan() {
  expect(mockMessagesStream).not.toHaveBeenCalled();
  expect(await Generation.countDocuments({})).toBe(0);
  expect(await LawieDocument.countDocuments({})).toBe(0);
  const u = (await User.collection.findOne({ _id: OID })) as unknown as {
    inkTopup: number;
    inkSub: number;
    inkHolds: unknown[];
  };
  expect(u.inkTopup).toBe(START_INK);
  expect(u.inkSub).toBe(0);
  expect(u.inkHolds).toEqual([]);
  const rows = await mongoose.connection
    .db!.collection('inkledger')
    .find({ userId: OID })
    .toArray();
  expect(rows).toEqual([]);
}

/** The web's payload shape (OneFlow.update): values carry source 'user' and the item label. */
const webValues = (defendant: string) => [
  { key: PLT, value: 'Sample Person 1', source: 'user', label: 'Plaintiff name' },
  { key: DEF, value: defendant, source: 'user', label: 'Defendant name' },
];

const update = (body: Record<string, unknown>) =>
  request(app)
    .post('/intake/brief/update')
    .set(headers())
    .send({ kind: DECL, court: COURT, ...body });

const generate = (body: Record<string, unknown>) =>
  request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({ kind: DECL, court: COURT, ...body });

describe('T-668c D1: POST /generate-from-brief, ledger holding the non-answer', () => {
  it('d. "Not known (...)" typed and in the ledger: 400 brief_not_confirmed, blockers [parties], no Ink', async () => {
    const ledger_id = await ledgerWith({ [DEF]: ANUSHKA });
    const res = await generate({ ledger_id, values: webValues(ANUSHKA) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('brief_not_confirmed');
    expect(res.body.blockers).toEqual(['parties']);
    await expectNothingRan();
  });

  it('d. "Defendant: Not known" typed and in the ledger: 400, no Ink (M6)', async () => {
    const ledger_id = await ledgerWith({ [DEF]: 'Defendant: Not known' });
    const res = await generate({ ledger_id, values: webValues('Defendant: Not known') });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('brief_not_confirmed');
    expect(res.body.blockers).toEqual(['parties']);
    await expectNothingRan();
  });

  it('d. a real name typed and a non-answer in the ledger: not stopped for the party', async () => {
    const ledger_id = await ledgerWith({ [DEF]: 'Sample Person 2' });
    const res = await generate({ ledger_id, values: webValues('Sample Person 2') });
    expect(res.status).not.toBe(404);
    expect(res.body?.error).not.toBe('brief_not_confirmed');
  });

  it.each(['Not Known Traders, a partnership firm', 'Defendant: Na-Young Kim'])(
    'e. control %j with the ledger: not stopped by brief_not_confirmed',
    async (name) => {
      const ledger_id = await ledgerWith({ [DEF]: name });
      const res = await generate({ ledger_id, values: webValues(name) });
      expect(res.status).not.toBe(404);
      expect(res.body?.error).not.toBe('brief_not_confirmed');
    },
  );

  it('e. a ledger-held real name with an empty typed defendant: not stopped for the party', async () => {
    const ledger_id = await ledgerWith({ [DEF]: 'Sample Person 2' });
    const res = await generate({ ledger_id, values: webValues('Sample Person 2').slice(0, 1) });
    expect(res.status).not.toBe(404);
    expect(res.body?.error).not.toBe('brief_not_confirmed');
  });
});

describe('T-668c D2: run 5c scenario 2 through the real update -> confirm path (ledger on)', () => {
  /**
   * What the browser does (OneFlow.handleValue): on blur it puts the typed text in `values`
   * (source 'user', the item label) AND sends it as ledger_edits {key, text}; the service
   * writes a ledger fact; the next Confirm sends ledger_id. Starts from an empty ledger.
   */
  async function typeAndBlur(text: string) {
    const ledger_id = await ledgerWith({});
    const res = await update({
      ledger_id,
      ledger_edits: [{ key: DEF, text }],
      values: webValues(text),
    });
    return { ledger_id, res };
  }

  it('observed (run 5c scenario 2): after blur the defendant_name fact has display = the typed text verbatim (no label prefix) and value = the person-name key', async () => {
    const { ledger_id, res } = await typeAndBlur(ANUSHKA);
    expect(res.status).toBe(200);
    const doc = await loadOwnLedger(ledger_id, USER_ID);
    const f = currentState(doc!).facts.find((x) => x.key === DEF);
    expect(f).toBeDefined();
    // display is the typed text, byte for byte; value is normalizePersonName's key (letters and
    // digits only, lower case). Neither is label-prefixed by the web or the service.
    expect(f!.display).toBe(ANUSHKA);
    expect(f!.value).toBe('notknownapersonclaimingthroughaforgedsaledeeddated12022025');
    expect(f!.raw_span).toBe(ANUSHKA);
    expect(f!.source).toBe('asked');
    expect(res.body.ledger_results).toEqual([{ key: DEF, status: 'saved', display: ANUSHKA }]);
  });

  it('after blur the brief the web gets back is blocked and the key is not in ledger_given_keys', async () => {
    const { res } = await typeAndBlur(ANUSHKA);
    const b = res.body.brief;
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toContain('parties');
    expect(b.confirm_missing_party_keys).toContain(DEF);
    expect(b.ledger_given_keys ?? []).not.toContain(DEF);
  });

  it('Confirm after that blur: 400 brief_not_confirmed, no Ink, no model call', async () => {
    const { ledger_id } = await typeAndBlur(ANUSHKA);
    const res = await generate({ ledger_id, values: webValues(ANUSHKA) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('brief_not_confirmed');
    expect(res.body.blockers).toEqual(['parties']);
    await expectNothingRan();
  });

  it('the ledger already held a real defendant (read from the description); typing the non-answer over it and blurring: blocked', async () => {
    const ledger_id = await ledgerWith({ [DEF]: 'Sample Person 2' });
    const res = await update({
      ledger_id,
      ledger_edits: [{ key: DEF, text: ANUSHKA }],
      values: webValues(ANUSHKA),
    });
    expect(res.status).toBe(200);
    expect(res.body.brief.can_confirm).toBe(false);
    expect(res.body.brief.confirm_missing_party_keys).toContain(DEF);
    expect(res.body.brief.ledger_given_keys ?? []).not.toContain(DEF);
    const confirm = await generate({ ledger_id, values: webValues(ANUSHKA) });
    expect(confirm.status).toBe(400);
    expect(confirm.body.error).toBe('brief_not_confirmed');
    await expectNothingRan();
  });

  it('a label-prefixed typed "Defendant: Not known (...)" and blur: blocked (M6), with the value kept as typed', async () => {
    const text = `Defendant: ${ANUSHKA}`;
    const { ledger_id, res } = await typeAndBlur(text);
    expect(res.body.brief.can_confirm).toBe(false);
    expect(res.body.brief.confirm_missing_party_keys).toContain(DEF);
    expect(res.body.brief.ledger_given_keys ?? []).not.toContain(DEF);
    expect(res.body.brief.items.find((i: any) => i.key === DEF).value).toBe(text);
    const confirm = await generate({ ledger_id, values: webValues(text) });
    expect(confirm.status).toBe(400);
    expect(confirm.body.error).toBe('brief_not_confirmed');
    await expectNothingRan();
  });

  it('control: a real name typed and blurred is given, and the brief can confirm', async () => {
    const { res } = await typeAndBlur('Sample Person 2');
    expect(res.body.brief.confirm_blockers).not.toContain('parties');
    expect(res.body.brief.ledger_given_keys).toContain(DEF);
  });
});

// ── E. P1a: the signed prompt line ───────────────────────────────────────────

describe('T-668c E: AJ-668c-P1a, the signed line is in every prompt that asks the user questions', () => {
  const SIGNED = path.resolve(__dirname, '../../../../handoff/legal/T-511-copy-rulings-ajay.md');
  function signedLine(): string {
    const row = fs
      .readFileSync(SIGNED, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('| AJ-668c-P1 |'));
    if (!row) throw new Error('AJ-668c-P1 row not found in the signed file');
    const m = /\*\*Signed, byte for byte:\*\* `([^`]+)`/.exec(row);
    if (!m) throw new Error('signed line not found in the AJ-668c-P1 row');
    return m[1];
  }

  it('the signed line is read from the signed file (not empty, names the roles)', () => {
    const line = signedLine();
    expect(line.length).toBeGreaterThan(200);
    expect(line.startsWith('For a required party (plaintiff, defendant,')).toBe(true);
  });

  it.each([
    ['RECEPTION_PACK_SYSTEM_PROMPT', RECEPTION_PACK_SYSTEM_PROMPT],
    ['RECEPTION_GUIDED_SYSTEM_PROMPT', RECEPTION_GUIDED_SYSTEM_PROMPT],
  ])('%s holds the line byte for byte, once', (_name, prompt) => {
    const line = signedLine();
    expect(prompt).toContain(line);
    expect(prompt.split(line).length - 1).toBe(1);
    // as its own line, not glued into another sentence
    expect(prompt.split('\n')).toContain(line);
  });
});
