/**
 * T-678 (P1): a written statement withheld because "defendant" in the summons label was a date cue.
 *
 * T678-1  party-role, court and generic words are never date cues (every pack)
 * T678-2  a text-held (P2) date with no date-role cue in its sentence passes; a real cue
 *         still repairs, then asks
 * T678-3  the P2 question, byte for byte against the signed file; P1 line unchanged
 * (a)     on a withhold: one log line (run, kind, rule, code, keys), Generation.failure stored
 *
 * Anushka's matter, fictional names. The model is the Anthropic SDK stub.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import './setupDb';
import type { LedgerFact } from '@lawie/shared';
import type { Response } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { LawieDocument } from '../models/Document.model';
import { Court } from '../models/Court.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { factConflictLine, withholdDraft } from '../services/ai.service';
import { loadAvermentLists } from '../services/averments';
import { packTexts } from '../services/brief-drafter';
import { UsageMeter } from '../services/llm-usage';
import {
  conflictsOf,
  verifyAndRepair,
  verifyDraft,
  VerifierInput,
} from '../services/fact-verifier';
import { listRulePackIds, loadRulePack } from '../services/rule-pack.service';
import { sdkAnswer } from './sdkStream';

jest.setTimeout(60_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const USER_ID = '507f1f77bcf86cd799439678';
const OID = new mongoose.Types.ObjectId(USER_ID);
const MODEL = 'claude-sonnet-4-5-20250929';
const START_INK = 2000;
const PACK = 'written_statement';

function fact(key: string, label: string, type: string, value: unknown, display: string) {
  return {
    id: `f_${key}`,
    key,
    label,
    type,
    value,
    display,
    raw_span: display,
    source: 'user',
    confidence: 0.99,
    required_in_draft: false,
  } as unknown as LedgerFact;
}

const WS_LABELS = Object.fromEntries(loadRulePack(PACK)!.facts.map((f) => [f.key, f.label]));
const SUMMONS_LABEL = WS_LABELS.summons_service_date;
const PLEAS_LABEL = WS_LABELS.additional_pleas;
const PLEAS_TEXT =
  'The Defendant repaid the loan in full to the Plaintiff on 15.06.2025 by bank transfer, before the suit was filed.';

const WS_FACTS = [
  fact('plaintiff_name', 'Plaintiff full name', 'person_name', 'sampleperson2', 'Sample Person 2'),
  fact('defendant_name', 'Defendant full name', 'person_name', 'sampleperson1', 'Sample Person 1'),
  fact('summons_service_date', SUMMONS_LABEL, 'date', '2026-10-05', '5 October 2026'),
  fact('additional_pleas', PLEAS_LABEL, 'text', PLEAS_TEXT, PLEAS_TEXT),
];

function inputOf(packId: string, body: string, facts: LedgerFact[]): VerifierInput {
  return {
    body,
    facts,
    unresolved: [],
    versions: [{ version: 1, facts, unresolved: [], createdAt: new Date(), reason: 'extract' }],
    lists: loadAvermentLists(packId),
    skeleton: [],
    packText: packTexts(loadRulePack(packId)!),
    packId,
  } as unknown as VerifierInput;
}
const ws = (body: string) => inputOf(PACK, body, WS_FACTS);
const dateFindings = (i: VerifierInput) =>
  verifyDraft(i).filter((v) => v.entityType === 'date' && v.check !== 'dropped');
const repairSpy = (reply: string | null) =>
  jest.fn(async (_s: string, _u: string): Promise<string | null> => reply);

// the draft as the model writes it: Anushka's matter
const REPAID = '3. That the Defendant repaid the entire loan to the Plaintiff on 15.06.2025.';
const SERVED = '2. That the summons were served on the Defendant on 05.10.2026.';
const WS_DRAFT = ['1. That the Defendant files this written statement.', SERVED, REPAID].join(
  '\n\n',
);
// the same date used in the role of the dated field
const MISPLACED = '2. That the summons were served on 15.06.2025.';
const MISPLACED_DRAFT = [
  '1. That the Defendant files this written statement.',
  MISPLACED,
  SERVED,
].join('\n\n');

// ─── T678-1 ──────────────────────────────────────────────────────────────────
describe('T678-1: role words are never date cues, in any template', () => {
  // Ajay T678-1 + T678-1a (f343661a): the signed non-cue list, EN, HI and Hinglish
  const EN_WORDS = [
    'day',
    'date',
    'court',
    'plaintiff',
    'defendant',
    'applicant',
    'petitioner',
    'respondent',
    'complainant',
    'accused',
    'appellant',
    'revisionist',
    'caveator',
    'opposite party',
    'landlord',
    'tenant',
    'deponent',
    'witness',
    'decree-holder',
    'judgment-debtor',
  ];
  const HI = [
    'वादी',
    'प्रतिवादी',
    'आवेदक',
    'याचिकाकर्ता',
    'प्रत्यर्थी',
    'परिवादी',
    'शिकायतकर्ता',
    'अभियुक्त',
    'आरोपी',
    'न्यायालय',
    'अपीलार्थी',
    'विपक्षी',
    'मकान मालिक',
    'किरायेदार',
    'साक्षी',
    'वादीगण',
    'प्रतिवादीगण',
    'आवेदकगण',
    'याचिकाकर्तागण',
    'प्रत्यर्थीगण',
  ];
  const HINGLISH = [
    'vadi',
    'prativadi',
    'aavedak',
    'avedak',
    'abhiyukt',
    'aaropi',
    'aropi',
    'shikayatkarta',
    'nyayalay',
    'kirayedar',
  ];
  const plural = (w: string) => (/^[a-z]/.test(w) ? `${w}s` : w);
  const ROLES = [...EN_WORDS, ...EN_WORDS.map(plural), ...HI, ...HINGLISH];
  const ids = listRulePackIds();
  const packs = ids.map((id) => loadRulePack(id)).filter((p) => p !== null);

  it('the document-rules packs are found and some have date facts', () => {
    expect(packs.length).toBeGreaterThan(10);
    expect(packs.flatMap((p) => p!.facts.filter((f) => f.type === 'date')).length).toBeGreaterThan(
      20,
    );
  });

  it('a sentence of role words only, with an unheld date, never reads as the role of any date fact (no conflict) in any pack', () => {
    // Cues are private to the verifier: observed through its behaviour. If a role word were a
    // cue of a held date fact, the unheld date would be a conflict (differs), not just unsupported.
    const bad: string[] = [];
    for (const p of packs) {
      for (const f of p!.facts.filter((x) => x.type === 'date')) {
        const held = fact(f.key, f.label, 'date', '2026-01-10', '10 January 2026');
        const own = new Set(
          `${f.label} ${f.key}`
            .toLowerCase()
            .split(/[^\p{L}]+/u)
            .filter(Boolean)
            .map((w) => w.slice(0, 6)),
        );
        for (const role of ROLES) {
          // a role word sharing a 6-letter stem with a word of the field's own label
          // (complaint/complainant, petition/petitioner) is that field's own cue, legitimately
          if (role.split(/[^\p{L}]+/u).some((w) => own.has(w.slice(0, 6)))) continue;
          const body = `1. That the ${role} on 11 February 2026.`;
          const conflicts = verifyDraft(inputOf(p!.id, body, [held])).filter(
            (v) => v.conflict || v.reason === 'differs',
          );
          if (conflicts.length > 0) bad.push(`${p!.id}:${f.key}:${role}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('a multi-word phrase ("opposite party") is removed as a phrase; "party" alone in another label is still a cue', () => {
    const run = (label: string, sentence: string) =>
      verifyDraft(
        inputOf(PACK, `1. ${sentence} on 11 February 2026.`, [
          fact('some_date', label, 'date', '2026-01-10', '10 January 2026'),
        ]),
      ).filter((v) => v.conflict || v.reason === 'differs');
    // "party" is also a generic stop word (CUE_STOP), so the single-word half uses "holder"
    expect(run('Date of notice to opposite party', 'That the opposite party was present')).toEqual(
      [],
    );
    expect(run('Date of notice to opposite party', 'That notice was sent')).not.toEqual([]);
    expect(run('Date of decree holder notice', 'That the decree holder was present')).toEqual([]);
    expect(run('Date of holder notice', 'That the holder was present')).not.toEqual([]);
  });

  it('the summons field still has its own cues: "summons served" is a cue, "Defendant" is not', () => {
    const own = verifyDraft(ws('1. That summons were served on 07.10.2026.')).filter(
      (v) => v.entityType === 'date' && v.reason === 'differs',
    );
    expect(own.length).toBeGreaterThan(0);
    const roleOnly = verifyDraft(ws('1. That the Defendant paid on 07.10.2026.')).filter(
      (v) => v.reason === 'differs' || v.conflict,
    );
    expect(roleOnly).toEqual([]);
  });
});

// ─── T678-2 ──────────────────────────────────────────────────────────────────
describe('T678-2: a text-held date passes without a date-role cue; with one, repair then ask', () => {
  it('Anushka: "the Defendant repaid ... on 15.06.2025" with summons 05.10.2026 has no conflict and no date finding', async () => {
    expect(conflictsOf(verifyDraft(ws(WS_DRAFT)))).toEqual([]);
    expect(dateFindings(ws(WS_DRAFT))).toEqual([]);
    const repair = repairSpy(null);
    const out = await verifyAndRepair(ws(WS_DRAFT), repair);
    expect(repair).not.toHaveBeenCalled();
    expect(out.body).toBe(WS_DRAFT);
    expect(out.body).not.toMatch(/MISSING/);
    expect(out.conflicts ?? []).toEqual([]);
  });

  it('a real cue ("summons served on" the text-held date) is a P2 conflict naming the summons field and the text fact', () => {
    const vs = dateFindings(ws(MISPLACED_DRAFT));
    expect(vs).toHaveLength(1);
    expect(vs[0].conflict).toMatchObject({
      kind: 'wrong_label',
      rule: 'P2',
      keyA: 'summons_service_date',
      keyB: 'additional_pleas',
      labelA: SUMMONS_LABEL,
      labelB: PLEAS_LABEL,
    });
  });

  it('with a real cue it repairs once, then asks; a repair that removes the misuse delivers', async () => {
    const stuck = repairSpy(`[[P1]]\n${MISPLACED}`);
    const out = await verifyAndRepair(ws(MISPLACED_DRAFT), stuck);
    expect(stuck).toHaveBeenCalledTimes(1);
    expect(out.conflicts ?? []).toHaveLength(1);
    expect(out.body).toContain('15.06.2025');

    const fixed = repairSpy(`[[P1]]\n${SERVED}`);
    const ok = await verifyAndRepair(ws(MISPLACED_DRAFT), fixed);
    expect(fixed).toHaveBeenCalledTimes(1);
    expect(ok.conflicts ?? []).toEqual([]);
  });
});

// ─── T678-3 ──────────────────────────────────────────────────────────────────
describe('T678-3: the P2 question, byte for byte', () => {
  const signed = readFileSync(
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'handoff',
      'legal',
      'T-611-fact-checker-policy-signed.md',
    ),
    'utf8',
  );
  const P2_SIGNED =
    'The draft gives <value> as the <label A>, but your facts give it in the <label B>. Which is right?';
  const P1_SIGNED =
    'The draft gives <value> as the <label A>, but your facts give it as the <label B>. Which is right?';
  const fill = (t: string) =>
    t.replace('<value>', '15.06.2025').replace('<label A>', 'LA').replace('<label B>', 'LB');

  it('the signed file carries the P2 text (T678-3 row)', () => {
    expect(signed).toContain(P2_SIGNED);
  });
  it('P2 line equals the signed text with the slots filled', () => {
    expect(factConflictLine('15.06.2025', 'LA', 'LB', true)).toBe(fill(P2_SIGNED));
  });
  it('the P1 line is unchanged (default and explicit false)', () => {
    expect(factConflictLine('15.06.2025', 'LA', 'LB')).toBe(fill(P1_SIGNED));
    expect(factConflictLine('15.06.2025', 'LA', 'LB', false)).toBe(fill(P1_SIGNED));
  });
});

// ─── rule tag, log line, failure ─────────────────────────────────────────────
function fakeRes() {
  const writes: string[] = [];
  const res = {
    headersSent: false,
    setHeader: jest.fn(),
    write: jest.fn((s: string) => (writes.push(s), true)),
    end: jest.fn(),
  };
  return { res: res as unknown as Response, writes };
}
const quiet = () =>
  (['info', 'log', 'warn', 'error', 'debug'] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation(() => undefined),
  );
const loggedOf = (spies: jest.SpyInstance[]) =>
  spies
    .flatMap((s) => s.mock.calls)
    .map((c) => c.map(String).join(' '))
    .join('\n');

describe('the rule tag and the withhold log line', () => {
  const conflict = (rule: 'P1' | 'P2' | 'P3' | undefined, kind: 'wrong_label' | 'mismatch') => ({
    code: 'fact_conflict' as const,
    conflict: {
      kind,
      ...(rule ? { rule } : {}),
      keyA: 'summons_service_date',
      labelA: 'LA',
      keyB: kind === 'wrong_label' ? 'additional_pleas' : null,
      labelB: kind === 'wrong_label' ? 'LB' : null,
      value: '15.06.2025',
      heldValue: kind === 'mismatch' ? '5 October 2026' : null,
    },
  });

  it('the verifier tags P1 (held under a label) and P2 (held in a text fact)', () => {
    const p2 = dateFindings(ws(MISPLACED_DRAFT))[0].conflict!;
    expect(p2.rule).toBe('P2');
    const held = [
      fact('summons_service_date', SUMMONS_LABEL, 'date', '2026-10-05', '5 October 2026'),
      fact('ws_filing_date', WS_LABELS.ws_filing_date, 'date', '2026-10-20', '20 October 2026'),
    ];
    const p1 = verifyDraft(inputOf(PACK, '1. That summons was served on 20.10.2026.', held)).filter(
      (v) => v.conflict,
    );
    expect(p1[0]?.conflict?.rule).toBe('P1');
  });

  it('the log line has run, kind, rule, code and keys, and no value or user text', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const spies = quiet();
    try {
      const { res, writes } = fakeRes();
      const err = withholdDraft(
        res,
        'run-678',
        PACK,
        conflict('P2', 'wrong_label'),
        new UsageMeter().totals(),
      );
      const logged = loggedOf(spies);
      expect(logged).toContain(
        '[drafting] draft withheld (run=run-678, kind=written_statement, rule=P2, code=fact_conflict, keys=summons_service_date,additional_pleas)',
      );
      expect(logged).not.toContain('15.06.2025');
      expect(logged).not.toContain('Which is right');
      expect(err.failure).toEqual({
        code: 'fact_conflict',
        rule: 'P2',
        keyA: 'summons_service_date',
        keyB: 'additional_pleas',
      });
      const payload = writes.join('');
      expect(payload).toContain('but your facts give it in the LB. Which is right?');
    } finally {
      process.env.NODE_ENV = prev;
      spies.forEach((s) => s.mockRestore());
    }
  });

  it('a conflict with no rule tag falls back by kind: P1 for wrong_label (as-line), P3 for mismatch', () => {
    const a = withholdDraft(
      fakeRes().res,
      'r',
      PACK,
      conflict(undefined, 'wrong_label'),
      new UsageMeter().totals(),
    );
    expect(a.failure).toMatchObject({ rule: 'P1', keyB: 'additional_pleas' });
    const b = withholdDraft(
      fakeRes().res,
      'r',
      PACK,
      conflict(undefined, 'mismatch'),
      new UsageMeter().totals(),
    );
    expect(b.failure).toMatchObject({
      code: 'fact_conflict',
      rule: 'P3',
      keyA: 'summons_service_date',
    });
    expect(b.failure).not.toHaveProperty('keyB');
  });
});

// ─── through the route (the brief route runs the full verifier and the gate) ──
const COURT_ID = 'district_sessions_patna';
const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});
async function ledger() {
  const facts = WS_FACTS.map((f) => ({ ...f, required_in_draft: true, source: 'user' }));
  const doc = await FactLedgerModel.create({
    userId: USER_ID,
    documentKind: PACK,
    runType: 'user',
    currentVersion: 1,
    versions: [{ version: 1, facts, unresolved: [], createdAt: new Date(), reason: 'extract' }],
  });
  return String(doc._id);
}
const postWs = async () =>
  request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({
      kind: PACK,
      values: [
        { key: 'plaintiff_name', value: 'Sample Person 2' },
        { key: 'defendant_name', value: 'Sample Person 1' },
        { key: 'summons_service_date', value: '2026-10-05' },
        { key: 'additional_pleas', value: PLEAS_TEXT },
      ],
      court: { state: 'bihar', court_type: 'sessions', court: COURT_ID },
      ledger_id: await ledger(),
    });
function events(text: string, name: string): Array<Record<string, any>> {
  return text
    .split('\n\n')
    .filter((b) => b.startsWith(`event: ${name}\n`))
    .map((b) => JSON.parse(b.split('\ndata: ')[1]));
}
const rawUser = async () =>
  (await User.collection.findOne({ _id: OID })) as unknown as {
    inkTopup: number;
    inkSub: number;
    inkHolds: unknown[];
  };
const inkRows = () =>
  mongoose.connection
    .db!.collection('inkledger')
    .find({ userId: OID, reason: 'generate' })
    .toArray();
async function expectNoInkTaken() {
  const u = await rawUser();
  expect(u.inkTopup).toBe(START_INK);
  expect(u.inkSub).toBe(0);
  expect(u.inkHolds).toEqual([]);
  expect(await inkRows()).toEqual([]);
  expect(await LawieDocument.countDocuments({})).toBe(0);
}

describe('T-678 through POST /generate-from-brief (written_statement)', () => {
  beforeEach(async () => {
    mockMessagesStream.mockReset();
    _clearAppSettingsCache();
    await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
    await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
    await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
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
    await createVerifiedUser({
      _id: USER_ID,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: START_INK,
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('Anushka: the draft with "the Defendant repaid ... on 15.06.2025" is delivered, not withheld; no stop, no repair, no failed row', async () => {
    const spies = quiet();
    mockMessagesStream.mockResolvedValue(sdkAnswer(WS_DRAFT, 4000, 800));
    const res = await postWs();
    expect(events(res.text, 'error')).toEqual([]);
    expect(events(res.text, 'done')).toHaveLength(1);
    expect(res.text).not.toContain('fact_conflict');
    // no fact-repair call (the second call is the clause check, not a repair)
    const prompts = mockMessagesStream.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(prompts.filter((t) => t.includes('VIOLATIONS'))).toEqual([]);
    expect(await Generation.countDocuments({ userId: USER_ID, status: 'failed' })).toBe(0);
    expect(await Generation.countDocuments({ userId: USER_ID, failure: { $exists: true } })).toBe(
      0,
    );
    expect(loggedOf(spies)).not.toContain('draft withheld');
    expect((await rawUser()).inkHolds).toEqual([]);
  });

  it('a real cue withholds with the P2 question, no Ink, a failed row with failure {code, rule, keyA, keyB}, one log line', async () => {
    const spies = quiet();
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    mockMessagesStream.mockResolvedValue(sdkAnswer(MISPLACED_DRAFT, 4000, 800));
    let res;
    try {
      res = await postWs();
    } finally {
      process.env.NODE_ENV = prev;
    }
    const errs = events(res.text, 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ code: 'fact_conflict', retryable: false });
    expect(errs[0].reason).toBe(
      `The draft gives 15.06.2025 as the ${SUMMONS_LABEL}, but your facts give it in the ${PLEAS_LABEL}. Which is right?`,
    );
    expect(res.text).not.toContain('event: done');
    const gens = await Generation.find({ userId: USER_ID }).lean();
    expect(gens.map((g) => g.status)).toEqual(['failed']);
    expect(gens[0].failure).toMatchObject({
      code: 'fact_conflict',
      rule: 'P2',
      keyA: 'summons_service_date',
      keyB: 'additional_pleas',
    });
    await expectNoInkTaken();
    const logged = loggedOf(spies);
    const lines = logged.split('\n').filter((l) => l.includes('draft withheld'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^\[drafting\] draft withheld \(run=\S+, kind=written_statement, rule=P2, code=fact_conflict, keys=summons_service_date,additional_pleas\)$/,
    );
    expect(logged).not.toContain('15.06.2025');
    expect(logged).not.toContain('Sample Person');
  });
});
