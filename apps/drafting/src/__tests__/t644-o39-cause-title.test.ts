/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * T-644 (O.39 cause title prints {plaintiff}/{defendant}). Legal sign-off: Ajay,
 * AJ-644-M1 (84311835) and AJ-644-M2 (d1849cdf) in handoff/legal/T-511-copy-rulings-ajay.md.
 *
 * AC1 (names fill the cause title): sections A-D.
 * AC2 (a missing party is asked for; no raw token reaches the draft): sections A, E, F.
 * AC3 (the logged case, fictional data only): section A.
 * AC4 (signed lines byte for byte, M2 line order): sections E, F.
 *
 * The signed strings are typed here on purpose, copied from Ajay's file, not imported from
 * the code's constants. The test does not read handoff/. No model call, no network.
 */
import './setupEnv';
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { O39_CONFIRM_MESSAGES } from '../config/intake/signed-confirm-messages';
import { formRequiredFieldBlock } from '../services/form-ledger';
import {
  buildBrief,
  buildChecklist,
  GivenValue,
  withoutLedgerGiven,
} from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { loadAllDocRules } from '../services/template-promoter';
import {
  buildPlaceholderContext,
  CourtLookupData,
  detectLeakedPlaceholders,
  loadCourtRule,
  renderTemplateSection,
  replacePlaceholders,
  TemplateConfig,
} from '../services/template-engine.service';

jest.setTimeout(60_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

// ── Signed strings (AJ-644-M1, AJ-644-M2; T-127 court line; T-613 §(g) field lines) ──────
const PLAINTIFF_EN = "Add the plaintiff's name to continue.";
const PLAINTIFF_HI = 'आगे बढ़ने के लिए वादी का नाम जोड़िए।';
const DEFENDANT_EN = "Add the defendant's name to continue.";
const DEFENDANT_HI = 'आगे बढ़ने के लिए प्रतिवादी का नाम जोड़िए।';
const COURT_EN = 'Choose the court to continue.';
const RELIEF_EN = 'Add the relief sought in the main suit to continue.';
const RESTRAINT_EN = 'Add the acts the defendant should be restrained from, to continue.';

// Fictional data only.
const PLAINTIFF = 'Ramesh Kumar Verma';
const DEFENDANT = 'Sunita Devi Agarwal';

const O39 = 'temporary_injunction_o39';
const { configs, byFile } = loadAllDocRules();
const config = (id: string) => configs.get(byFile.get(`${id}.json`)!.template_id) as TemplateConfig;

const courtData = (): CourtLookupData => ({
  designation: 'CIVIL JUDGE (JUNIOR DIVISION), PATNA',
  city: 'Patna',
  caseNomenclature: 'Title Suit No. 245 of 2026',
  formattingRulesRef: 'civil_court_generic',
  courtType: 'civil_court',
  courtRule: loadCourtRule('civil_court_generic') ?? undefined,
});

function ctxFor(id: string, formData: Record<string, unknown>) {
  return buildPlaceholderContext(config(id), formData, { advocateName: 'Adv. A' }, courtData());
}

function causeTitle(id: string, formData: Record<string, unknown>): string {
  const cfg = config(id);
  const ctx = ctxFor(id, formData);
  const s = cfg.document_structure.sections.find((x) => x.section_id === 'cause_title')!;
  return renderTemplateSection(s, ctx).content;
}

const BOTH = { plaintiff_name: PLAINTIFF, defendant_name: DEFENDANT };

// ── A. The logged case: an old-format cause title with {plaintiff}/{defendant} ───────────
describe('T-644 A: the logged case (old-format O.39 cause title)', () => {
  const OLD =
    'IN THE MATTER OF:\n{plaintiff} ... Plaintiff/Applicant\nVERSUS\n{defendant} ... Defendant/Non-Applicant';
  const ctx = ctxFor(O39, BOTH);

  it('renders both names, no raw token and no blank before Plaintiff/Defendant', () => {
    const out = replacePlaceholders(OLD, ctx);
    expect(out).toContain(`${PLAINTIFF} ... Plaintiff/Applicant`);
    expect(out).toContain(`${DEFENDANT} ... Defendant/Non-Applicant`);
    expect(out).not.toMatch(/\{(plaintiff|defendant)\}/);
    expect(out).not.toMatch(/_____\s*\.\.\.\s*(Plaintiff|Defendant)/);
  });

  it('detectLeakedPlaceholders does not report plaintiff or defendant', () => {
    expect(detectLeakedPlaceholders(OLD, ctx)).toEqual([]);
  });

  it('control: before the aliases, a context without the names still reports them', () => {
    const empty = ctxFor(O39, {});
    expect(detectLeakedPlaceholders(OLD, empty).sort()).toEqual(['defendant', 'plaintiff']);
  });
});

// ── B. The current O.39 pack ─────────────────────────────────────────────────────────────
describe('T-644 B: the O.39 pack cause title', () => {
  it('prints both names, with no blank or token in the parties lines', () => {
    const out = causeTitle(O39, BOTH);
    expect(out).toContain(`${PLAINTIFF} ... Plaintiff/Applicant`);
    expect(out).toContain(`${DEFENDANT} ... Defendant/Non-Applicant`);
    expect(out).not.toMatch(/\{(plaintiff|defendant)(_name)?\}/);
  });
});

// ── C. The 5 fully fixed plaint packs ────────────────────────────────────────────────────
describe.each([
  'plaint_declaration',
  'plaint_eviction',
  'plaint_injunction',
  'plaint_recovery',
  'plaint_specific_performance',
])('T-644 C: %s cause title', (id) => {
  it('prints both names', () => {
    const out = causeTitle(id, BOTH);
    expect(out).toContain(`${PLAINTIFF} ... Plaintiff`);
    expect(out).toContain(`${DEFENDANT} ... Defendant`);
    expect(out).not.toMatch(/\{(plaintiff|defendant)\}/);
  });
  it('is not reported as leaked', () => {
    const cfg = config(id);
    const s = cfg.document_structure.sections.find((x) => x.section_id === 'cause_title')!;
    const leaked = detectLeakedPlaceholders(s.template!, ctxFor(id, BOTH));
    expect(leaked).not.toContain('plaintiff');
    expect(leaked).not.toContain('defendant');
  });
});

describe('T-644 C: replication and written statement (one party each)', () => {
  it('replication prints the plaintiff', () => {
    expect(causeTitle('replication', { plaintiff_name: PLAINTIFF })).toContain(
      `${PLAINTIFF} ... Plaintiff`,
    );
  });
  it('written statement prints the defendant', () => {
    expect(causeTitle('written_statement', { defendant_name: DEFENDANT })).toContain(
      `${DEFENDANT} ... Defendant`,
    );
  });
});

// ── D. A party not held: unchanged ───────────────────────────────────────────────────────
describe('T-644 D: a party that is not held still blanks (unchanged)', () => {
  it('plaint_recovery with only the plaintiff: defendant stays _____', () => {
    const out = causeTitle('plaint_recovery', { plaintiff_name: PLAINTIFF });
    expect(out).toContain(`${PLAINTIFF} ... Plaintiff`);
    expect(out).toMatch(/_____ \.\.\. Defendant/);
  });
  it('an explicit alias value in the context is not overwritten', () => {
    const out = replacePlaceholders('{plaintiff}', { ...ctxFor(O39, BOTH), plaintiff: 'Kept' });
    expect(out).toBe('Kept');
  });
});

// ── E. Form route ────────────────────────────────────────────────────────────────────────
const USER_ID = '507f1f77bcf86cd799439644';
const OID = new mongoose.Types.ObjectId(USER_ID);
const MODEL = 'claude-sonnet-4-5-20250929';
const START_INK = 2000;

const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

const FORM: Record<string, unknown> = {
  state: 'bihar',
  court_type: 'civil_court',
  court_name: 'bihar_civil_junior_patna',
  plaintiff_name: PLAINTIFF,
  defendant_name: DEFENDANT,
  suit_number: 'Title Suit No. 245 of 2026',
  subject_matter: 'Plot 4, Patna',
  main_suit_relief: 'Declaration of title',
  type_of_injunction_sought: 'prohibitory_injunction_o39_r1',
  prima_facie_case: 'Title deed.',
  balance_of_convenience: 'Favours the plaintiff.',
  irreparable_injury: 'Loss of the plot.',
  acts_complained_of: 'Threat to build.',
  restraint_sought: 'raising any construction',
  ex_parte_sought: false,
  undertaking_offered: 'Yes.',
  supporting_documents: 'Sale deed.',
  advocate_name: 'Adv. A',
  advocate_enrollment: 'BR/1/2020',
  language: 'en',
};

const postO39 = (over: Record<string, unknown> = {}, drop: string[] = []) => {
  const form = { ...FORM, ...over };
  for (const k of drop) delete form[k];
  return request(app)
    .post('/generate-from-template')
    .set(headers())
    .send({ template_id: O39, form_data: form });
};

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

describe('T-644 E: form route, a missing party is asked for before any Ink hold', () => {
  beforeEach(async () => {
    mockMessagesStream.mockReset();
    _clearAppSettingsCache();
    await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
    await AppSetting.create({
      key: `ai.rates.${MODEL}`,
      value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
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

  it('missing plaintiff: 400, the signed plaintiff line only', async () => {
    const res = await postO39({}, ['plaintiff_name']);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'brief_not_confirmed',
      message: PLAINTIFF_EN,
      blockers: ['required_fields'],
      confirm_blocking_keys: ['plaintiff_name'],
    });
    await expectNothingRan();
  });

  it('missing defendant: 400, the signed defendant line only', async () => {
    const res = await postO39({ defendant_name: '' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'brief_not_confirmed',
      message: DEFENDANT_EN,
      blockers: ['required_fields'],
      confirm_blocking_keys: ['defendant_name'],
    });
    await expectNothingRan();
  });

  it('both missing: plaintiff line, then defendant line', async () => {
    const res = await postO39({}, ['plaintiff_name', 'defendant_name']);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('brief_not_confirmed');
    expect(res.body.message).toBe(`${PLAINTIFF_EN}\n${DEFENDANT_EN}`);
    expect(res.body.confirm_blocking_keys).toEqual(['plaintiff_name', 'defendant_name']);
    expect(JSON.stringify(res.body)).not.toContain('Form validation failed');
    await expectNothingRan();
  });

  it('parties and both fields missing: parties first, then the field lines, in order', async () => {
    const res = await postO39({ main_suit_relief: '', restraint_sought: '' }, [
      'plaintiff_name',
      'defendant_name',
    ]);
    expect(res.status).toBe(400);
    expect(res.body.message.split('\n')).toEqual([
      PLAINTIFF_EN,
      DEFENDANT_EN,
      RELIEF_EN,
      RESTRAINT_EN,
    ]);
    await expectNothingRan();
  });

  it.each([
    ['plaintiff_name', 'Not known', PLAINTIFF_EN],
    ['defendant_name', 'Not known', DEFENDANT_EN],
    ['plaintiff_name', '  N/A ', PLAINTIFF_EN],
    ['defendant_name', 'पता नहीं', DEFENDANT_EN],
  ])('a non-answer in %s (%j): 400 with the signed line', async (field, value, line) => {
    const res = await postO39({ [field]: value });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('brief_not_confirmed');
    expect(res.body.message).toBe(line);
    expect(res.body.confirm_blocking_keys).toEqual([field]);
    await expectNothingRan();
  });
});

describe('T-644 E: formRequiredFieldBlock (unit)', () => {
  const rest = {
    main_suit_relief: 'Declaration of title',
    restraint_sought: 'raising construction',
  };

  it('both parties held: null', () => {
    expect(formRequiredFieldBlock(O39, { ...BOTH, ...rest })).toBeNull();
  });
  it('a longer answer containing a non-answer word is a name, not blocked', () => {
    expect(
      formRequiredFieldBlock(O39, {
        ...rest,
        plaintiff_name: 'None Kumar Verma',
        defendant_name: DEFENDANT,
      }),
    ).toBeNull();
  });
  it('another template is unchanged: null', () => {
    // T-668: plaint_recovery is no longer "another template" (AJ-668-M3); a pack outside the 8 is.
    expect(formRequiredFieldBlock('bail_regular', {})).toBeNull();
  });
});

// ── F. Brief route: confirmState ─────────────────────────────────────────────────────────
describe('T-644 F: brief route (confirmState), O.39', () => {
  const pack = loadRulePack(O39)!;
  const checklist = buildChecklist(pack);
  const kind = { id: O39, name: 'Temporary Injunction (O.39)', court_document: true };
  const COURT = { state: 'bihar', court_type: 'civil', court: 'civil_court_patna' };
  const NO_COURT = { state: null, court_type: null, court: null } as any;
  const user = (key: string, value: string): GivenValue => ({ key, value, source: 'user' });
  const RELIEF = user('main_suit_relief', 'Declaration of title');
  const RESTRAINT = user('restraint_sought', 'raising any construction on the suit land');
  const P = user('plaintiff_name', PLAINTIFF);
  const D = user('defendant_name', DEFENDANT);
  const brief = (values: GivenValue[], court: any = COURT) =>
    buildBrief({ kind, checklist, values, court } as any);

  it('court and both parties missing: court line, plaintiff, defendant, then the field lines', () => {
    const b = brief([], NO_COURT);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_blockers).toEqual(['court', 'parties', 'required_fields']);
    expect(b.confirm_message!.split('\n')).toEqual([
      COURT_EN,
      PLAINTIFF_EN,
      DEFENDANT_EN,
      RELIEF_EN,
      RESTRAINT_EN,
    ]);
    expect(b.confirm_message).not.toContain('Choose the court and add the parties');
  });

  it('court chosen, both parties missing: plaintiff then defendant, no court line', () => {
    const b = brief([RELIEF, RESTRAINT]);
    expect(b.confirm_blockers).toEqual(['parties']);
    expect(b.confirm_message).toBe(`${PLAINTIFF_EN}\n${DEFENDANT_EN}`);
  });

  it('only the plaintiff missing: one line, the plaintiff line', () => {
    const b = brief([D, RELIEF, RESTRAINT]);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_message).toBe(PLAINTIFF_EN);
  });

  it('only the defendant missing: one line, the defendant line', () => {
    const b = brief([P, RELIEF, RESTRAINT]);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_message).toBe(DEFENDANT_EN);
  });

  it('court missing, parties held: the court line alone before the fields', () => {
    const b = brief([P, D], NO_COURT);
    expect(b.confirm_message!.split('\n')).toEqual([COURT_EN, RELIEF_EN, RESTRAINT_EN]);
  });

  it.each(['Not known', 'unknown', 'N/A', ' NIL ', 'नहीं पता'])(
    'a non-answer %j as the plaintiff blocks like a missing party (§(j)3)',
    (word) => {
      const b = brief([user('plaintiff_name', word), D, RELIEF, RESTRAINT]);
      expect(b.can_confirm).toBe(false);
      expect(b.confirm_blockers).toContain('parties');
      expect(b.confirm_message).toBe(PLAINTIFF_EN);
    },
  );

  it('a non-answer as the defendant blocks with the defendant line', () => {
    const b = brief([P, user('defendant_name', 'Not known'), RELIEF, RESTRAINT]);
    expect(b.can_confirm).toBe(false);
    expect(b.confirm_message).toBe(DEFENDANT_EN);
  });

  it('both parties real, court chosen, fields held: can confirm', () => {
    const b = brief([P, D, RELIEF, RESTRAINT]);
    expect(b.can_confirm).toBe(true);
    expect(b.confirm_message).toBeNull();
    expect(b.confirm_blockers).toEqual([]);
  });

  it('confirm_blocking_keys stays the required fields only (the web focuses [0])', () => {
    const b = brief([]);
    expect((b.confirm_blocking_keys ?? []).map((k) => k.split('.').pop())).toEqual([
      'main_suit_relief',
      'restraint_sought',
    ]);
  });

  it('withoutLedgerGiven: a party the ledger holds is not asked for, the other still is', () => {
    const b = withoutLedgerGiven(brief([RELIEF, RESTRAINT]), new Set(['plaintiff_name']));
    expect(b.confirm_message).toBe(DEFENDANT_EN);
  });

  it('withoutLedgerGiven: no court, no parties: court line, then both party lines in order', () => {
    const b = withoutLedgerGiven(
      brief([RELIEF, RESTRAINT], NO_COURT),
      new Set(['main_suit_relief']),
    );
    expect(b.confirm_message!.split('\n')).toEqual([COURT_EN, PLAINTIFF_EN, DEFENDANT_EN]);
  });

  describe('confirm_missing_party_keys', () => {
    const last = (keys: string[] | undefined) => (keys ?? []).map((k) => k.split('.').pop());
    const partyKey = (b: ReturnType<typeof brief>, name: string) =>
      b.items.find((i) => i.key.split('.').pop() === name)!.key;

    it('both missing: [plaintiff, defendant], in the order of their lines', () => {
      const b = brief([RELIEF, RESTRAINT]);
      expect(b.confirm_missing_party_keys).toEqual([
        partyKey(b, 'plaintiff_name'),
        partyKey(b, 'defendant_name'),
      ]);
      expect(last(b.confirm_missing_party_keys)).toEqual(['plaintiff_name', 'defendant_name']);
      // one key per party line, same order as confirm_message
      expect(b.confirm_message!.split('\n').slice(0, 2)).toEqual([PLAINTIFF_EN, DEFENDANT_EN]);
    });

    it('court missing too: the list is still the parties only, after the court line', () => {
      const b = brief([], NO_COURT);
      expect(last(b.confirm_missing_party_keys)).toEqual(['plaintiff_name', 'defendant_name']);
      expect(b.confirm_message!.split('\n')[0]).toBe(COURT_EN);
    });

    it('only the plaintiff missing', () => {
      const b = brief([D, RELIEF, RESTRAINT]);
      expect(last(b.confirm_missing_party_keys)).toEqual(['plaintiff_name']);
    });

    it('only the defendant missing', () => {
      const b = brief([P, RELIEF, RESTRAINT]);
      expect(last(b.confirm_missing_party_keys)).toEqual(['defendant_name']);
    });

    it('a non-answer counts as missing', () => {
      const b = brief([user('plaintiff_name', 'Not known'), D, RELIEF, RESTRAINT]);
      expect(last(b.confirm_missing_party_keys)).toEqual(['plaintiff_name']);
      const b2 = brief([P, user('defendant_name', 'N/A'), RELIEF, RESTRAINT]);
      expect(last(b2.confirm_missing_party_keys)).toEqual(['defendant_name']);
    });

    it('absent (not an empty array) when no party is missing', () => {
      const b = brief([P, D]);
      expect('confirm_missing_party_keys' in b).toBe(false);
      const b2 = brief([P, D, RELIEF, RESTRAINT], NO_COURT);
      expect('confirm_missing_party_keys' in b2).toBe(false);
    });

    it('withoutLedgerGiven: the ledger gives the plaintiff, only the defendant is listed', () => {
      const base = brief([RELIEF, RESTRAINT]);
      const b = withoutLedgerGiven(base, new Set([partyKey(base, 'plaintiff_name')]));
      expect(b.confirm_missing_party_keys).toEqual([partyKey(base, 'defendant_name')]);
      expect(b.confirm_message).toBe(DEFENDANT_EN);
    });

    it('withoutLedgerGiven: the ledger gives both, the old list is dropped, not carried over', () => {
      const base = brief([RELIEF, RESTRAINT]);
      expect(base.confirm_missing_party_keys).toHaveLength(2);
      const b = withoutLedgerGiven(
        base,
        new Set([partyKey(base, 'plaintiff_name'), partyKey(base, 'defendant_name')]),
      );
      expect('confirm_missing_party_keys' in b).toBe(false);
      expect(b.confirm_blockers).not.toContain('parties');
    });

    it('withoutLedgerGiven: a key that is not a party leaves the list as recomputed (unchanged)', () => {
      const base = brief([RELIEF, RESTRAINT]);
      const b = withoutLedgerGiven(base, new Set(['main_suit_relief']));
      expect(b.confirm_missing_party_keys).toEqual(base.confirm_missing_party_keys);
    });

    it('withoutLedgerGiven with an empty set returns the brief as it was, with ledger_given_keys: [] (T-655)', () => {
      const base = brief([RELIEF, RESTRAINT]);
      expect(withoutLedgerGiven(base, new Set())).toEqual({ ...base, ledger_given_keys: [] });
    });
  });
});

describe('T-644 F: other packs are unchanged', () => {
  it('a non-O.39 pack never carries confirm_missing_party_keys, even with a party missing', () => {
    const pack = loadRulePack('bail_before_magistrate');
    const kind = { id: 'bail_before_magistrate', name: 'Bail', court_document: true };
    const b = buildBrief({
      kind,
      checklist: buildChecklist(pack ?? loadRulePack(O39)!),
      values: [],
    } as any);
    expect(b.confirm_blockers).toContain('parties');
    expect('confirm_missing_party_keys' in b).toBe(false);
    const w = withoutLedgerGiven(b, new Set(['x']));
    expect('confirm_missing_party_keys' in w).toBe(false);
  });

  it('a non-O.39 court pack with no court and no parties still gets the combined line', () => {
    const pack = loadRulePack('bail_before_magistrate');
    const kind = { id: 'bail_before_magistrate', name: 'Bail', court_document: true };
    const b = buildBrief({
      kind,
      checklist: buildChecklist(pack ?? loadRulePack(O39)!),
      values: [],
    } as any);
    expect(b.confirm_message).toBe('Choose the court and add the parties to continue.');
  });

  it('the O.39 signed HI lines are the ones Ajay signed (byte for byte)', () => {
    expect(O39_CONFIRM_MESSAGES.plaintiff_name).toEqual({ en: PLAINTIFF_EN, hi: PLAINTIFF_HI });
    expect(O39_CONFIRM_MESSAGES.defendant_name).toEqual({ en: DEFENDANT_EN, hi: DEFENDANT_HI });
  });
});
