/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * T-655 (a ledger-held "Not known" must not clear O.39 required items).
 * Legal sign-off: Ajay, AJ-644-M3 (af6fb9e8): a section (j)3 non-answer is no fact on
 * every path (brief text, ledger, form). Signed ask lines: AJ-644-M1
 * (handoff/legal/T-511-copy-rulings-ajay.md) for the parties, T-613 (g) for the fields.
 *
 * AC1 (a ledger-held non-answer for the four keys does not clear the block, the signed ask
 *      shows): sections A, B, C, D.
 * AC2 (one copy of the non-answer list, FR-5a): section F.
 * AC3 (each of the four keys via the ledger path, fictional data): sections A to D.
 *
 * The signed strings are typed here on purpose, copied from Ajay's file (checked byte for
 * byte against it with grep -F), not imported from the code's constants. No model call.
 */
import './setupEnv';
import './setupDb';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { O39_NON_ANSWERS } from '../config/intake/o39-confirm-messages';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { Generation } from '../models/Generation.model';
import { LawieDocument } from '../models/Document.model';
import { User } from '../models/User.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { createLedger } from '../services/fact-ledger.service';
import {
  buildBrief,
  buildChecklist,
  buildQuestions,
  GivenValue,
  ledgerGivenKeys,
  withoutLedgerGiven,
} from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';

jest.setTimeout(60_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

// ── Signed strings (AJ-644-M1, T-613 (g)) ────────────────────────────────────────────────
const PLAINTIFF_EN = "Add the plaintiff's name to continue.";
const DEFENDANT_EN = "Add the defendant's name to continue.";
const RELIEF_EN = 'Add the relief sought in the main suit to continue.';
const RESTRAINT_EN = 'Add the acts the defendant should be restrained from, to continue.';

type Key = 'plaintiff_name' | 'defendant_name' | 'main_suit_relief' | 'restraint_sought';
const KEYS: Key[] = ['plaintiff_name', 'defendant_name', 'main_suit_relief', 'restraint_sought'];
const LINE: Record<Key, string> = {
  plaintiff_name: PLAINTIFF_EN,
  defendant_name: DEFENDANT_EN,
  main_suit_relief: RELIEF_EN,
  restraint_sought: RESTRAINT_EN,
};

// Fictional data only.
const REAL: Record<Key, string> = {
  plaintiff_name: 'Sample Person 1',
  defendant_name: 'Sample Person 2',
  main_suit_relief: 'Declaration of title over Plot 000, Sample Nagar, Patna',
  restraint_sought: 'raising any construction on Plot 000',
};

// The four non-answers the ruling names, all of them on the section (j)3 list.
const NON_ANSWERS = ['Not known', 'N/A', 'nil', 'पता नहीं'];

const O39 = 'temporary_injunction_o39';
const pack = loadRulePack(O39)!;
const checklist = buildChecklist(pack);
const kind = { id: O39, name: 'Temporary Injunction (O.39)', court_document: true };
const COURT = { state: 'bihar', court_type: 'civil_court', court: 'civil_court_patna' };

/** The checklist's own key for a field (it may be section-prefixed). */
const keyOf = (name: Key): string => {
  const item = checklist.find((i) => i.key.split('.').pop() === name);
  if (!item) throw new Error(`no ${name} on the O.39 checklist`);
  return item.key;
};
const lastOf = (k: string) => k.split('.').pop()!;

const given = (key: string, value: string): GivenValue => ({ key, value, source: 'user' });
/** An O.39 brief with every field held except `except`. */
function briefExcept(except: Key) {
  const values = KEYS.filter((k) => k !== except).map((k) => given(keyOf(k), REAL[k]));
  return buildBrief({ kind, checklist, values, court: COURT } as any);
}
const ledgerFact = (name: Key, text: string) => ({
  key: keyOf(name),
  display: text,
  value: text,
});

/**
 * What buildQuestions asks for the four O.39 fields. The O.39 pack has more than ten other
 * unanswered items, so with the whole brief the ten-question cap hides these four; the rows
 * are narrowed to them so the cap does not decide the result.
 */
function askedFor(b: ReturnType<typeof buildBrief>, g: ReadonlySet<string>): string[] {
  const four = new Set(KEYS.map(keyOf));
  const narrowed = { ...b, items: b.items.filter((i) => four.has(i.key)) };
  return buildQuestions(narrowed, new Map(), new Set(), new Set(), {
    checklist,
    ledgerGiven: g,
  }).map((q) => q.key);
}

describe('T-655 sanity: the fixtures are what the cases below assume', () => {
  it('the four non-answers are on the signed list', () => {
    for (const w of NON_ANSWERS) expect(O39_NON_ANSWERS).toContain(w);
  });
  it('an O.39 brief with all four fields held can confirm (so a block below is the non-answer)', () => {
    const values = KEYS.map((k) => given(keyOf(k), REAL[k]));
    const b = buildBrief({ kind, checklist, values, court: COURT } as any);
    expect(b.can_confirm).toBe(true);
    expect(b.confirm_message).toBeNull();
  });
});

// ── A. ledgerGivenKeys: a non-answer is no fact ──────────────────────────────────────────
describe.each(KEYS)('T-655 A: ledgerGivenKeys, %s', (name) => {
  it.each(NON_ANSWERS)('a ledger-held %j is not given', (word) => {
    const out = ledgerGivenKeys([ledgerFact(name, word)]);
    expect(out.has(keyOf(name))).toBe(false);
    expect(out.size).toBe(0);
  });

  it('a padded, upper-case non-answer is not given either (trimmed, case-insensitive)', () => {
    expect(ledgerGivenKeys([ledgerFact(name, '  NOT KNOWN ')]).size).toBe(0);
  });

  it('a non-answer in the value alone (display is a name) is not given', () => {
    const out = ledgerGivenKeys([{ key: keyOf(name), display: REAL[name], value: 'N/A' }]);
    expect(out.has(keyOf(name))).toBe(false);
  });

  it('a real fictional value is given', () => {
    const out = ledgerGivenKeys([ledgerFact(name, REAL[name])]);
    expect(out.has(keyOf(name))).toBe(true);
  });

  it('a longer answer that contains a non-answer word is a value, so it is given', () => {
    const out = ledgerGivenKeys([ledgerFact(name, `${REAL[name]} (nil claim)`)]);
    expect(out.has(keyOf(name))).toBe(true);
  });

  it('the non-answer for this key does not hide another key that holds a real value', () => {
    const other = KEYS.find((k) => k !== name)!;
    const out = ledgerGivenKeys([ledgerFact(name, 'Not known'), ledgerFact(other, REAL[other])]);
    expect([...out]).toEqual([keyOf(other)]);
  });
});

// ── B. withoutLedgerGiven: the block stays, the signed ask shows ─────────────────────────
describe.each(['plaintiff_name', 'defendant_name'] as Key[])(
  'T-655 B: withoutLedgerGiven, party %s held as a non-answer',
  (name) => {
    it.each(NON_ANSWERS)('%j: still listed, still blocks, the signed line shows', (word) => {
      const base = briefExcept(name);
      const g = ledgerGivenKeys([ledgerFact(name, word)]);
      const b = withoutLedgerGiven(base, g);
      expect(b.can_confirm).toBe(false);
      expect(b.confirm_blockers).toContain('parties');
      expect(b.confirm_missing_party_keys).toEqual([keyOf(name)]);
      expect(b.confirm_message).toBe(LINE[name]);
      expect(b.ledger_given_keys).toEqual([]);
    });

    it('control: the same party as a real value clears the block', () => {
      const base = briefExcept(name);
      const g = ledgerGivenKeys([ledgerFact(name, REAL[name])]);
      const b = withoutLedgerGiven(base, g);
      expect(b.can_confirm).toBe(true);
      expect(b.confirm_message).toBeNull();
      expect('confirm_missing_party_keys' in b).toBe(false);
      expect(b.ledger_given_keys).toEqual([keyOf(name)]);
    });
  },
);

describe('T-655 B: both parties held as non-answers (plaintiff line, then defendant line)', () => {
  it.each(NON_ANSWERS)('%j', (word) => {
    const base = buildBrief({
      kind,
      checklist,
      values: [
        given(keyOf('main_suit_relief'), REAL.main_suit_relief),
        given(keyOf('restraint_sought'), REAL.restraint_sought),
      ],
      court: COURT,
    } as any);
    const g = ledgerGivenKeys([
      ledgerFact('plaintiff_name', word),
      ledgerFact('defendant_name', word),
    ]);
    const b = withoutLedgerGiven(base, g);
    expect(b.confirm_message).toBe(`${PLAINTIFF_EN}\n${DEFENDANT_EN}`);
    expect(b.confirm_missing_party_keys!.map(lastOf)).toEqual(['plaintiff_name', 'defendant_name']);
  });
});

// ── C. withoutLedgerGiven + buildQuestions: relief and restraint stay asked ──────────────
describe.each(['main_suit_relief', 'restraint_sought'] as Key[])(
  'T-655 C: %s held as a non-answer',
  (name) => {
    it.each(NON_ANSWERS)('%j: stays still-unknown, stays asked, the signed line shows', (word) => {
      const base = briefExcept(name);
      expect(base.still_unknown.map((u) => u.key)).toContain(keyOf(name));
      const g = ledgerGivenKeys([ledgerFact(name, word)]);
      const b = withoutLedgerGiven(base, g);
      expect(b.still_unknown.map((u) => u.key)).toContain(keyOf(name));
      expect(b.can_confirm).toBe(false);
      expect(b.confirm_blockers).toContain('required_fields');
      expect(b.confirm_message).toBe(LINE[name]);
      expect(b.ledger_given_keys).toEqual([]);
      expect(askedFor(b, g)).toContain(keyOf(name));
    });

    it('control: a real value is given, off still-unknown, and not asked', () => {
      const base = briefExcept(name);
      const g = ledgerGivenKeys([ledgerFact(name, REAL[name])]);
      const b = withoutLedgerGiven(base, g);
      expect(b.still_unknown.map((u) => u.key)).not.toContain(keyOf(name));
      expect(b.ledger_given_keys).toEqual([keyOf(name)]);
      expect(askedFor(b, g)).not.toContain(keyOf(name));
    });
  },
);

// ── D. buildBrief with ledgerGiven, and ledger_given_keys ────────────────────────────────
describe('T-655 D: buildBrief and ledger_given_keys', () => {
  it.each(KEYS)('%s as a non-answer: ledger_given_keys leaves it out, the block stays', (name) => {
    const values = KEYS.filter((k) => k !== name).map((k) => given(keyOf(k), REAL[k]));
    const g = ledgerGivenKeys(KEYS.map((k) => ledgerFact(k, k === name ? 'N/A' : REAL[k])));
    const b = buildBrief({ kind, checklist, values, court: COURT, ledgerGiven: g } as any);
    expect(b.ledger_given_keys).not.toContain(keyOf(name));
    expect([...b.ledger_given_keys!].sort()).toEqual(
      KEYS.filter((k) => k !== name)
        .map(keyOf)
        .sort(),
    );
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_message).toBe(LINE[name]);
  });

  it('no ledger given: the field is absent (the web fails closed)', () => {
    const b = buildBrief({ kind, checklist, values: [], court: COURT } as any);
    expect('ledger_given_keys' in b).toBe(false);
  });

  it('an empty given set: withoutLedgerGiven sets an empty list, the brief is otherwise the same', () => {
    const base = briefExcept('plaintiff_name');
    const b = withoutLedgerGiven(base, new Set());
    expect(b).toEqual({ ...base, ledger_given_keys: [] });
  });
});

// ── E. Non-O.39 pack is unchanged ────────────────────────────────────────────────────────
describe('T-655 E: a pack that is not O.39 is unchanged', () => {
  const bail = loadRulePack('bail_regular')!;
  const bailList = buildChecklist(bail);
  const bailKind = { id: bail.id, name: bail.name, court_document: true };
  const BAIL_COURT = { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' };

  it("a ledger 'Not known' on a bail party still counts as given", () => {
    const out = ledgerGivenKeys([
      { key: 'applicant_name', display: 'Not known', value: 'Not known' },
      { key: 'father_name', display: 'N/A', value: 'N/A' },
    ]);
    expect(out.has('applicant_name')).toBe(true);
    expect(out.has('father_name')).toBe(true);
  });

  it('bail brief: the ledger-held party still lifts the parties block, as before', () => {
    const values = [given('father_name', 'Sample Person 3')];
    const base = buildBrief({
      kind: bailKind,
      checklist: bailList,
      values,
      court: BAIL_COURT,
    } as any);
    expect(base.confirm_blockers).toContain('parties');
    const g = ledgerGivenKeys([
      { key: 'applicant_name', display: 'Not known', value: 'Not known' },
    ]);
    const b = withoutLedgerGiven(base, g);
    expect(b.confirm_blockers).not.toContain('parties');
    expect(b.ledger_given_keys).toEqual(['applicant_name']);
  });
});

// ── G. Routes ────────────────────────────────────────────────────────────────────────────
const USER_ID = '507f1f77bcf86cd799439655';
const OID = new mongoose.Types.ObjectId(USER_ID);
const MODEL = 'claude-sonnet-4-5-20250929';
const START_INK = 2000;

const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test Advocate',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

/** A ledger fact as the service stores it. */
const storedFact = (name: Key, text: string) => ({
  id: `f-${name}`,
  key: keyOf(name),
  label: name,
  type: name.endsWith('_name') ? 'person_name' : 'text',
  value: text,
  display: text,
  raw_span: text,
  source: 'user',
  confidence: 1,
  required_in_draft: true,
});

async function ledgerWith(held: Partial<Record<Key, string>>): Promise<string> {
  const facts = (Object.entries(held) as Array<[Key, string]>).map(([k, v]) => storedFact(k, v));
  const doc = await createLedger({
    userId: USER_ID,
    documentKind: O39,
    intakeId: 't655',
    state: { facts: facts as any, unresolved: [] },
  });
  return String(doc._id);
}

/** Every O.39 field held as a real value in `values`, except `except`. */
const valuesExcept = (except: Key) =>
  KEYS.filter((k) => k !== except).map((k) => ({ key: keyOf(k), value: REAL[k] }));

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await redis.flushall();
  await AppSetting.create({ key: 'ai.intake_model', value: 'claude-haiku-4-5-20251001' });
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
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

const update = (body: Record<string, unknown>) =>
  request(app)
    .post('/intake/brief/update')
    .set(headers())
    .send({ kind: O39, court: COURT, ...body });

describe('T-655 G1: POST /intake/brief/update with a ledger holding a non-answer', () => {
  it.each(KEYS)('%s held as "N/A": the brief keeps the block and the signed line', async (name) => {
    const ledger_id = await ledgerWith({ [name]: 'N/A' });
    const res = await update({ ledger_id, ledger_edits: [], values: valuesExcept(name) });
    expect(res.status).toBe(200);
    const b = res.body.brief;
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_message).toBe(LINE[name]);
    expect(b.ledger_given_keys ?? []).not.toContain(keyOf(name));
    if (name.endsWith('_name')) {
      expect(b.confirm_blockers).toContain('parties');
      expect(b.confirm_missing_party_keys).toEqual([keyOf(name)]);
    } else {
      expect(b.confirm_blockers).toContain('required_fields');
    }
  });

  it.each(NON_ANSWERS)(
    'plaintiff held as %j: blocked with the signed plaintiff line',
    async (w) => {
      const ledger_id = await ledgerWith({ plaintiff_name: w });
      const res = await update({
        ledger_id,
        ledger_edits: [],
        values: valuesExcept('plaintiff_name'),
      });
      expect(res.status).toBe(200);
      expect(res.body.brief.can_confirm).toBe(false);
      expect(res.body.brief.confirm_message).toBe(PLAINTIFF_EN);
      expect(res.body.brief.ledger_given_keys).not.toContain(keyOf('plaintiff_name'));
    },
  );

  it.each(KEYS)('control: %s held as a real value is given', async (name) => {
    const ledger_id = await ledgerWith({ [name]: REAL[name] });
    const res = await update({ ledger_id, ledger_edits: [], values: valuesExcept(name) });
    expect(res.status).toBe(200);
    expect(res.body.brief.ledger_given_keys).toContain(keyOf(name));
    // A party the ledger holds lifts the parties block. Relief and restraint are required
    // fields the brief itself must hold (requiredItemBlockers is unchanged by T-655), so the
    // ledger value is given (off still-unknown) but the required_fields line is not lifted.
    if (name.endsWith('_name')) expect(res.body.brief.can_confirm).toBe(true);
    else {
      expect(
        (res.body.brief.still_unknown as Array<{ key: string }>).map((u) => u.key),
      ).not.toContain(keyOf(name));
    }
  });

  it('with no ledger sent, ledger_given_keys is absent (nothing counts as given)', async () => {
    const res = await update({ values: valuesExcept('plaintiff_name') });
    expect(res.status).toBe(200);
    expect(res.body.brief.ledger_given_keys).toBeUndefined();
    expect(res.body.brief.can_confirm).toBe(false);
  });
});

describe('T-655 G2: POST /generate-from-brief, an O.39 ledger holding a non-answer', () => {
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

  const generate = (body: Record<string, unknown>) =>
    request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({ kind: O39, court: COURT, ...body });

  it('plaintiff "N/A" in the ledger: 400 brief_not_confirmed, the signed line, nothing ran', async () => {
    const ledger_id = await ledgerWith({ plaintiff_name: 'N/A' });
    const res = await generate({ ledger_id, values: valuesExcept('plaintiff_name') });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('brief_not_confirmed');
    expect(res.body.message).toBe(PLAINTIFF_EN);
    expect(res.body.blockers).toContain('parties');
    await expectNothingRan();
  });

  it.each(KEYS.flatMap((k) => NON_ANSWERS.map((w) => [k, w] as [Key, string])))(
    '%s held as %j: 400 brief_not_confirmed with the signed line, before any Ink hold',
    async (name, word) => {
      const ledger_id = await ledgerWith({ [name]: word });
      const res = await generate({ ledger_id, values: valuesExcept(name) });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('brief_not_confirmed');
      expect(res.body.message).toBe(LINE[name]);
      await expectNothingRan();
    },
  );

  it('control: the same ledger with a real plaintiff is not stopped by brief_not_confirmed', async () => {
    const ledger_id = await ledgerWith({ plaintiff_name: REAL.plaintiff_name });
    const res = await generate({ ledger_id, values: valuesExcept('plaintiff_name') });
    expect(res.body?.error).not.toBe('brief_not_confirmed');
    expect(res.status).not.toBe(400);
  });
});

// ── F. FR-5a: one copy of the non-answer list ────────────────────────────────────────────
describe('T-655 F (FR-5a): one copy of the section (j)3 list', () => {
  const SRC = path.resolve(__dirname, '..');
  const WEB_SRC = path.resolve(__dirname, '../../../web/src');
  function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '__tests__' || e.name === 'node_modules' || e.name === '.next') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
  }
  const read = (p: string) => fs.readFileSync(p, 'utf8');
  const rel = (p: string) => path.relative(SRC, p);

  it('intake-brief.ts gets its non-answer check from o39-confirm-messages.ts', () => {
    const src = read(path.join(SRC, 'services/intake-brief.ts'));
    expect(src).toMatch(
      /import\s*\{[^}]*\bisEmptyOrNonAnswer\b[^}]*\}\s*from\s*'\.\.\/config\/intake\/o39-confirm-messages'/,
    );
    expect(src).toMatch(
      /import\s*\{[^}]*\bisO39RequiredField\b[^}]*\}\s*from\s*'\.\.\/config\/intake\/o39-confirm-messages'/,
    );
  });

  it('intake-brief.ts holds no copy of the section (j)3 list', () => {
    const src = read(path.join(SRC, 'services/intake-brief.ts'));
    for (const w of ["'N/A'", "'NA'", "'पता नहीं'", "'नहीं पता'", "'Not known'"]) {
      expect(src).not.toContain(w);
    }
    // The T-190 NONE_ANSWERS list (earlier bail applications, other keys) predates T-655 and is
    // a different list; it is the only line with 'nil'.
    const nilLines = src.split('\n').filter((l) => l.includes("'nil'"));
    expect(nilLines).toHaveLength(1);
    expect(nilLines[0]).toContain("['none', 'nil', 'no', 'not applicable'");
  });

  it('no drafting source file but the signed one holds the list (form-ledger.ts FR-9 lists predate T-655)', () => {
    const holders = walk(SRC)
      .filter((p) => {
        const s = read(p);
        return s.includes("'नहीं पता'") && s.includes("'पता नहीं'");
      })
      .map(rel)
      .sort();
    // o39-confirm-messages.ts is the signed list. form-ledger.ts has the older FR-9
    // NO_FACT_ANSWERS list (Ajay 4813ba79), not added by T-655; this pins that no third copy appears.
    expect(holders).toEqual(['config/intake/o39-confirm-messages.ts', 'services/form-ledger.ts']);
  });

  it('the web holds no copy of the list and no ledger judge (the mirror is deleted)', () => {
    const files = walk(WEB_SRC);
    expect(files.length).toBeGreaterThan(50);
    for (const p of files) {
      const s = read(p);
      expect(`${p}:${s.includes('पता नहीं') && s.includes('नहीं पता')}`).toMatch(/:false$/);
      expect(`${p}:${/export function ledgerGivenKeys\b/.test(s)}`).toMatch(/:false$/);
    }
    const intake = path.join(WEB_SRC, 'components/intake');
    for (const f of ['BriefStep.tsx', 'OneFlow.tsx', 'briefTypes.ts']) {
      expect(read(path.join(intake, f))).not.toMatch(/\bledgerGivenKeys\s*\(/);
    }
  });
});
