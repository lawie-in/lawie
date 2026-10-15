/**
 * T-431 — the deponent on the counter and rejoinder affidavit DRAFTING paths.
 *
 * Rule: Arjun's scope ruling (15 Oct 2026) on Ajay's side rule (T-381 Addendum 5).
 * Both drafting paths (template form, brief) take the deponent and the client's
 * side from the T-424 resolver (client_role, then the signed row, then refuse),
 * never from applicant_name. Signed row: counter_affidavit -> respondent,
 * rejoinder_affidavit -> petitioner. The model's system prompt ends with one
 * DEPONENT line for these two packs only (legal content: Ajay signs the wording).
 *
 * Expected names and sides are written out here from the T-424 rule, not
 * computed by the code under test.
 */
import './setupEnv';
import './setupDb';

import { Response } from 'express';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { User } from '../models/User.model';
import {
  BriefGenerateInput,
  GenerationFailedError,
  resolveSidedDeponent,
  streamGenerateFromBrief,
  streamGenerateFromTemplate,
  TemplateGenerateInput,
} from '../services/ai.service';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { updateBrief } from '../services/intake.service';
import { loadRulePack } from '../services/rule-pack.service';
import {
  buildPlaceholderContext,
  loadCourtRule,
  loadTemplateConfig,
  TemplateConfig,
} from '../services/template-engine.service';
import * as templateEngine from '../services/template-engine.service';
import { SdkStreamParams, sdkAnswer, systemText } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const USER_ID = '507f1f77bcf86cd7994390d2';
const MODEL = 'claude-sonnet-4-5-20250929';
const PETITIONER = 'Nita Lal';
const RESPONDENT = 'Mohan Lal';
const APPLICANT = 'Flat Applicant';
const RAW = 'Raw Client Deponent';

type Side = 'petitioner' | 'respondent';
interface Case {
  pack: 'counter_affidavit' | 'rejoinder_affidavit';
  role: string | undefined; // the client_role answer; undefined = not answered
  side: Side; // who must swear
}
// T-424 Addendum 5: an answered role wins; else the signed row.
const CASES: Case[] = [
  { pack: 'counter_affidavit', role: 'respondent', side: 'respondent' },
  { pack: 'counter_affidavit', role: 'petitioner', side: 'petitioner' },
  { pack: 'counter_affidavit', role: undefined, side: 'respondent' },
  { pack: 'rejoinder_affidavit', role: 'petitioner', side: 'petitioner' },
  { pack: 'rejoinder_affidavit', role: 'respondent', side: 'respondent' },
  { pack: 'rejoinder_affidavit', role: undefined, side: 'petitioner' },
];
const NAME: Record<Side, string> = { petitioner: PETITIONER, respondent: RESPONDENT };
// Party labels: the defaults with no court, and bihar_district's court rule
// (config/court-rules/bihar_district.json party_labels) when a court is chosen.
const LABEL: Record<Side, string> = { petitioner: 'Petitioner', respondent: 'Respondent' };
const BIHAR_LABEL: Record<Side, string> = { petitioner: 'Applicant', respondent: 'Opposite Party' };
// Ajay's exact text (CLO, 15 Oct 2026), written out by hand: a wording change must fail here.
const lineOf = (side: Side, labels: Record<Side, string> = LABEL, name: string = NAME[side]) =>
  `DEPONENT: This affidavit and its verification are sworn by a natural person, in the first person. Where "${name}", the ${labels[side]} (${side} side), is an individual, that individual is the deponent. Where it is a company, bank, body or department, the deponent is the officer named in the deponent designation, who swears as its authorised representative. Never write the entity itself as "I". If the user has typed a deponent name, use that name and do not substitute another. If none is given for an entity, leave a blank for the deponent's name and designation. Do not invent one. Never name anyone from the other side as the deponent.`;

/** The T-424 / annexures-card wording for what is missing. */
const MISSING_LINE = {
  role: "Add the client's role to this draft, then try again.",
  name: "Add the client's name to this draft, then try again.",
  opposite: "Add the opposite party's name to this draft, then try again.",
  nameAndOpposite:
    "Add the client's name and the opposite party's name to this draft, then try again.",
};

function systemsOf(): string[] {
  return mockMessagesStream.mock.calls.map((c) => systemText((c[0] as SdkStreamParams).system));
}
const countOf = (hay: string, needle: string) => hay.split(needle).length - 1;

function event(text: string, name: string): Record<string, any> | null {
  const blocks = text.split('\n\n').filter((b) => b.startsWith(`event: ${name}\n`));
  if (blocks.length === 0) return null;
  return JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]);
}

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
});

// ═══ Template form path ═══════════════════════════════════════════════════════

function fakeRes(): Response & { written: () => string } {
  const write = jest.fn();
  const res = { setHeader: jest.fn(), write, end: jest.fn(), headersSent: false };
  return Object.assign(res, {
    written: () => write.mock.calls.map((c) => String(c[0])).join(''),
  }) as unknown as Response & { written: () => string };
}

function templateInput(
  pack: string,
  formData: Record<string, unknown>,
  config?: TemplateConfig,
): TemplateGenerateInput {
  const base = config ?? loadTemplateConfig(pack)!;
  return {
    templateConfig: {
      ...base,
      validation_rules: { ...base.validation_rules, auto_convert_old_to_new: false },
    },
    formData,
    userId: USER_ID,
    runId: 'run-t431',
    runSequence: 1,
    runType: 'initial',
  };
}

function formFor(role: string | undefined, extra: Record<string, unknown> = {}) {
  return {
    petitioner_name: PETITIONER,
    respondent_name: RESPONDENT,
    applicant_name: APPLICANT,
    ...(role !== undefined ? { client_role: role } : {}),
    ...extra,
  };
}

describe("T-431 AC1/AC3: template form path — the deponent is the T-424 resolver's", () => {
  it.each(CASES)('$pack, client_role=$role -> $side swears', async (c) => {
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer('1. That the facts are as stated.', 10, 5));
    await streamGenerateFromTemplate(templateInput(c.pack, formFor(c.role)), fakeRes());

    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    const system = systemsOf()[0];
    expect(countOf(system, 'DEPONENT: ')).toBe(1);
    expect(system).toContain(lineOf(c.side));
    // applicant_name is never the deponent, and the other side is not named as one
    expect(system).not.toContain(APPLICANT);
    const other: Side = c.side === 'petitioner' ? 'respondent' : 'petitioner';
    expect(system).not.toContain(`Where "${NAME[other]}"`);
    expect(system).not.toContain(lineOf(other));
    expect(system).not.toContain(NAME[other]);
  });

  it('the line is the last thing in the system prompt (one appended line)', async () => {
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer('1. x.', 10, 5));
    await streamGenerateFromTemplate(
      templateInput('counter_affidavit', formFor(undefined)),
      fakeRes(),
    );
    expect(systemsOf()[0].endsWith(`\n\n${lineOf('respondent')}`)).toBe(true);
  });
});

describe('T-431 AC3: template path — a raw client deponent_name / client_side is ignored', () => {
  it.each(CASES)('$pack, client_role=$role', async (c) => {
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer('1. x.', 10, 5));
    const wrongSide = c.side === 'petitioner' ? 'respondent' : 'petitioner';
    await streamGenerateFromTemplate(
      templateInput(
        c.pack,
        formFor(c.role, {
          deponent_name: RAW,
          client_side: wrongSide,
          deponent_address: 'Raw Address',
          deponent_age: '99',
          deponent_father_name: 'Raw Father',
          'parties.deponent_name': RAW,
          'parties.client_side': wrongSide,
        }),
      ),
      fakeRes(),
    );
    const call = mockMessagesStream.mock.calls[0][0] as SdkStreamParams;
    const system = systemText(call.system);
    expect(system).toContain(lineOf(c.side));
    expect(system).not.toContain(RAW);
    expect(call.messages[0].content).not.toContain(RAW);
    expect(call.messages[0].content).not.toContain('Raw Address');
    expect(call.messages[0].content).not.toContain('Raw Father');
  });

  it('a raw deponent_name with no side resolvable does not stand in: the draft is refused', async () => {
    const res = fakeRes();
    await expect(
      streamGenerateFromTemplate(
        templateInput('counter_affidavit', { deponent_name: RAW, client_side: 'respondent' }),
        res,
      ),
    ).rejects.toMatchObject({ code: 'party_details_missing' });
    expect(mockMessagesStream).not.toHaveBeenCalled();
  });
});

describe('T-431 AC3: template path — no side resolved -> refuse (T-424), no model call', () => {
  // The client is the row's side (counter: respondent, rejoinder: petitioner);
  // the "client missing" case therefore has only the other side's name.
  const refusalsFor = (pack: string) => {
    const rowSide: Side = pack === 'counter_affidavit' ? 'respondent' : 'petitioner';
    const otherSide: Side = rowSide === 'respondent' ? 'petitioner' : 'respondent';
    return [
      {
        name: 'unknown client_role "accused"',
        form: { petitioner_name: PETITIONER, respondent_name: RESPONDENT, client_role: 'accused' },
        missing: ['client_role'],
        line: MISSING_LINE.role,
      },
      {
        name: 'the client name is missing',
        form: { [`${otherSide}_name`]: NAME[otherSide] },
        missing: ['client_name'],
        line: MISSING_LINE.name,
      },
      {
        name: 'the opposite party is missing',
        form: { [`${rowSide}_name`]: NAME[rowSide] },
        missing: ['opposite_party_name'],
        line: MISSING_LINE.opposite,
      },
      {
        name: 'no party at all',
        form: { applicant_name: APPLICANT },
        missing: ['client_name', 'opposite_party_name'],
        line: MISSING_LINE.nameAndOpposite,
      },
    ];
  };

  describe.each(['counter_affidavit', 'rejoinder_affidavit'])('%s', (pack) => {
    it.each(refusalsFor(pack))('$name', async ({ form, missing, line }) => {
      const res = fakeRes();
      let caught: unknown;
      try {
        await streamGenerateFromTemplate(templateInput(pack, form), res);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(GenerationFailedError);
      const failed = caught as GenerationFailedError;
      expect(failed.code).toBe('party_details_missing');
      expect(failed.message).toBe(line);
      expect(failed.usage.llmCalls).toBe(0);
      expect(failed.usage.inputTokens).toBe(0);
      expect(failed.usage.outputTokens).toBe(0);
      expect(mockMessagesStream).not.toHaveBeenCalled();

      const sent = event(res.written(), 'error')!;
      expect(sent).toMatchObject({
        section: 'body',
        reason: line,
        retryable: false,
        code: 'party_details_missing',
        error: 'party_details_missing',
        missing,
        runId: 'run-t431',
      });
      // the refusal never names the applicant as a stand-in
      expect(res.written()).not.toContain(APPLICANT);
    });
  });
});

describe('T-431: other packs are unchanged', () => {
  it('a non-sided pack (bail_regular) has no DEPONENT line and no refusal', async () => {
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer('1. x.', 10, 5));
    await streamGenerateFromTemplate(
      templateInput('bail_regular', {
        applicant_name: 'Ram Kumar',
        deponent_name: RAW,
        client_side: 'respondent',
      }),
      fakeRes(),
    );
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(systemsOf()[0]).not.toContain('DEPONENT:');
    expect(systemsOf()[0]).not.toContain('DEPONENT: ');
    expect(systemsOf()[0]).not.toContain('authorised representative');
  });

  it('the non-sided prompt is the same with and without a sided pack having run first', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer('1. x.', 10, 5));
    await streamGenerateFromTemplate(
      templateInput('bail_regular', { applicant_name: 'A' }),
      fakeRes(),
    );
    const before = systemsOf()[0];
    mockMessagesStream.mockClear();
    await streamGenerateFromTemplate(
      templateInput('counter_affidavit', formFor('respondent')),
      fakeRes(),
    );
    mockMessagesStream.mockClear();
    await streamGenerateFromTemplate(
      templateInput('bail_regular', { applicant_name: 'A' }),
      fakeRes(),
    );
    expect(systemsOf()[0]).toBe(before);
  });
});

describe('T-431: resolveSidedDeponent', () => {
  it('is null for a non-sided pack, with any input', () => {
    expect(resolveSidedDeponent('bail_regular', { a: 1 }, {})).toBeNull();
    expect(resolveSidedDeponent('vakalatnama', {}, { client_role: 'petitioner' })).toBeNull();
    expect(resolveSidedDeponent('toString', {}, {})).toBeNull();
  });

  it("strips dotted and undotted deponent_* / client_side, sets the resolver's, keeps the rest", () => {
    const r = resolveSidedDeponent(
      'counter_affidavit',
      {
        court_type: 'sessions',
        deponent_name: RAW,
        'parties.deponent_name': RAW,
        'parties.client_side': 'petitioner',
        client_side: 'petitioner',
      },
      { respondent_name: RESPONDENT, petitioner_name: PETITIONER },
    );
    expect(r).toEqual({
      kind: 'resolved',
      formData: { court_type: 'sessions', deponent_name: RESPONDENT, client_side: 'respondent' },
    });
  });

  it('refuses with what is missing', () => {
    expect(resolveSidedDeponent('rejoinder_affidavit', {}, { client_role: 'accused' })).toEqual({
      kind: 'refused',
      missing: ['client_role'],
    });
  });
});

// ═══ Brief path (POST /generate-from-brief) ═══════════════════════════════════

const court = { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' };
const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'a@test.com',
  'x-user-name': 'A',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});
function post(body: Record<string, unknown>) {
  return request(app).post('/generate-from-brief').set(headers()).send(body);
}
function briefValues(role: string | undefined, extra: Array<{ key: string; value: string }> = []) {
  return [
    { key: 'petitioner_name', value: PETITIONER },
    { key: 'respondent_name', value: RESPONDENT },
    { key: 'applicant_name', value: APPLICANT },
    ...(role !== undefined ? [{ key: 'client_role', value: role }] : []),
    ...extra,
  ];
}
const answerFor = (pack: string, over: Record<string, string> = {}) => {
  const rp = loadRulePack(pack)!;
  const report = rp.mandatoryClauses.map((m) => `${m.id}: ${over[m.id] ?? '1'}`).join('\n');
  return `1. That the deponent states the facts below.\n\n${CLAUSES_MARKER}\n${report}`;
};

// The route builds the brief from the pack's own brief items. For these two packs
// those are parties.petitioner_name / parties.respondent_name, never client_role
// (T-423 AC2: a raw value that is not a brief item is not read). So through the
// route the side is the signed row's. A client_role item is exercised below by
// calling streamGenerateFromBrief with a brief that holds one.
const ROW_CASES = CASES.filter((c) => c.role === undefined);

function briefInput(
  pack: string,
  items: Array<{ key: string; value: string }>,
  drop: string[] = [],
  runId = 'run-t431-brief',
): BriefGenerateInput {
  const pk = loadRulePack(pack)!;
  const templateConfig = loadTemplateConfig(pack)!;
  const brief = updateBrief({
    kind: pack,
    values: [
      { key: 'petitioner_name', value: PETITIONER, source: 'user' },
      { key: 'respondent_name', value: RESPONDENT, source: 'user' },
    ],
    court,
  } as any)!;
  // the advocate's answers as brief items, as the resolver reads them
  const seen = new Set(items.map((i) => i.key));
  const base = brief.items.filter(
    (i) => !seen.has(i.key.split('.').pop()!) && !drop.includes(i.key.split('.').pop()!),
  );
  brief.items = [...base, ...items.map((i) => ({ ...i, source: 'user' }) as any)];
  return {
    pack: pk,
    templateConfig,
    brief,
    language: 'en',
    targetParagraphs: 6,
    userId: USER_ID,
    runId,
    runSequence: 1,
    runType: 'initial',
    loadSkeleton: () => null,
  };
}

describe('T-431: brief path', () => {
  beforeEach(async () => {
    await Court.create({
      courtId: 'district_sessions_patna',
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

  describe('through POST /generate-from-brief (the signed row; client_role is not a brief item)', () => {
    it.each(ROW_CASES)('$pack, no client_role -> $side swears', async (c) => {
      mockMessagesStream.mockResolvedValueOnce(sdkAnswer(answerFor(c.pack), 4000, 800));
      const res = await post({ kind: c.pack, values: briefValues(c.role), court });

      expect(res.status).toBe(200);
      expect(event(res.text, 'error')).toBeNull();
      expect(mockMessagesStream).toHaveBeenCalledTimes(1);
      const call = mockMessagesStream.mock.calls[0][0] as SdkStreamParams;
      const system = systemText(call.system);
      expect(countOf(system, 'DEPONENT: ')).toBe(1);
      expect(system.endsWith(`\n\n${lineOf(c.side, BIHAR_LABEL)}`)).toBe(true);
      expect(system).not.toContain(APPLICANT);
      // the line varies per request, so this prompt is a plain string, not the cached block form
      expect(typeof call.system).toBe('string');
    });

    it.each(ROW_CASES)(
      '$pack: a raw deponent_name / client_side / client_role is ignored',
      async (c) => {
        mockMessagesStream.mockResolvedValueOnce(sdkAnswer(answerFor(c.pack), 4000, 800));
        const wrong: Side = c.side === 'petitioner' ? 'respondent' : 'petitioner';
        const res = await post({
          kind: c.pack,
          values: briefValues(undefined, [
            { key: 'deponent_name', value: RAW },
            { key: 'parties.deponent_name', value: RAW },
            { key: 'client_side', value: wrong },
            { key: 'client_role', value: wrong },
          ]),
          court,
        });
        expect(res.status).toBe(200);
        const call = mockMessagesStream.mock.calls[0][0] as SdkStreamParams;
        expect(systemText(call.system)).toContain(lineOf(c.side, BIHAR_LABEL));
        expect(systemText(call.system)).not.toContain(RAW);
        // (the raw keys still ride in the BRIEF's "other" notes in the user prompt; see the report)
      },
    );

    it('the clause-repair call carries the same line (counter_affidavit)', async () => {
      const pack = 'counter_affidavit';
      const first = loadRulePack(pack)!.mandatoryClauses[0].id;
      // the first answer reports a clause at paragraph 9 (absent): the repair pass runs
      mockMessagesStream.mockResolvedValueOnce(
        sdkAnswer(answerFor(pack, { [first]: '9' }), 4000, 800),
      );
      mockMessagesStream.mockResolvedValueOnce(sdkAnswer(answerFor(pack), 400, 80));
      const res = await post({ kind: pack, values: briefValues(undefined), court });
      expect(res.status).toBe(200);
      expect(mockMessagesStream).toHaveBeenCalledTimes(2);
      for (const system of systemsOf()) {
        expect(countOf(system, 'DEPONENT: ')).toBe(1);
        expect(system.endsWith(`\n\n${lineOf('respondent', BIHAR_LABEL)}`)).toBe(true);
      }
    });

    it('a non-sided pack (bail_regular) keeps the cached system prompt and has no DEPONENT line', async () => {
      mockMessagesStream.mockResolvedValueOnce(sdkAnswer(answerFor('bail_regular'), 4000, 800));
      const res = await post({
        kind: 'bail_regular',
        values: [
          { key: 'applicant_name', value: 'Ram Kumar' },
          { key: 'deponent_name', value: RAW },
        ],
        court,
      });
      expect(res.status).toBe(200);
      const call = mockMessagesStream.mock.calls[0][0] as SdkStreamParams;
      expect(Array.isArray(call.system)).toBe(true); // T-437 cached blocks, as before
      expect(systemText(call.system)).not.toContain('DEPONENT:');
    });

    it.each(['counter_affidavit', 'rejoinder_affidavit'])(
      '%s: with a party missing the route stops at the brief gate: no model call, nothing charged',
      async (pack) => {
        const res = await post({
          kind: pack,
          values: [{ key: 'deponent_name', value: RAW }],
          court,
        });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('brief_not_confirmed');
        expect(mockMessagesStream).not.toHaveBeenCalled();
        expect(res.text).not.toContain(RAW);
        expect((await User.findById(USER_ID).lean())!.inkTopup).toBe(2000);
      },
    );
  });

  describe('streamGenerateFromBrief with a client_role in the brief (T-424 order: role, row, refuse)', () => {
    it.each(CASES)('$pack, client_role=$role -> $side swears', async (c) => {
      mockMessagesStream.mockResolvedValueOnce(sdkAnswer(answerFor(c.pack), 4000, 800));
      const items = c.role !== undefined ? [{ key: 'client_role', value: c.role }] : [];
      await streamGenerateFromBrief(briefInput(c.pack, items), fakeRes());
      expect(mockMessagesStream).toHaveBeenCalledTimes(1);
      const system = systemsOf()[0];
      expect(countOf(system, 'DEPONENT: ')).toBe(1);
      expect(system.endsWith(`\n\n${lineOf(c.side)}`)).toBe(true);
      expect(system).not.toContain(APPLICANT);
    });

    it.each(['counter_affidavit', 'rejoinder_affidavit'])(
      '%s: an unknown client_role "accused" -> refuse, no model call, zero usage',
      async (pack) => {
        const res = fakeRes();
        let caught: unknown;
        try {
          await streamGenerateFromBrief(
            briefInput(pack, [{ key: 'client_role', value: 'accused' }]),
            res,
          );
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(GenerationFailedError);
        const failed = caught as GenerationFailedError;
        expect(failed.code).toBe('party_details_missing');
        expect(failed.message).toBe(MISSING_LINE.role);
        expect(failed.usage.llmCalls).toBe(0);
        expect(failed.usage.inputTokens).toBe(0);
        expect(mockMessagesStream).not.toHaveBeenCalled();
        expect(event(res.written(), 'error')).toMatchObject({
          code: 'party_details_missing',
          missing: ['client_role'],
          reason: MISSING_LINE.role,
        });
      },
    );

    describe.each(['counter_affidavit', 'rejoinder_affidavit'])('%s: no side -> refuse', (pack) => {
      const rowSide: Side = pack === 'counter_affidavit' ? 'respondent' : 'petitioner';
      const otherSide: Side = rowSide === 'respondent' ? 'petitioner' : 'respondent';
      const REFUSALS = [
        {
          name: 'the client name is missing',
          drop: [`${rowSide}_name`],
          missing: ['client_name'],
          line: MISSING_LINE.name,
        },
        {
          name: 'the opposite party is missing',
          drop: [`${otherSide}_name`],
          missing: ['opposite_party_name'],
          line: MISSING_LINE.opposite,
        },
        {
          name: 'both parties missing (a raw deponent_name does not stand in)',
          drop: ['petitioner_name', 'respondent_name'],
          extra: [{ key: 'deponent_name', value: RAW }],
          missing: ['client_name', 'opposite_party_name'],
          line: MISSING_LINE.nameAndOpposite,
        },
      ];

      it.each(REFUSALS)('$name', async ({ drop, extra, missing, line }) => {
        const res = fakeRes();
        let caught: unknown;
        try {
          await streamGenerateFromBrief(briefInput(pack, extra ?? [], drop), res);
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(GenerationFailedError);
        const failed = caught as GenerationFailedError;
        expect(failed.code).toBe('party_details_missing');
        expect(failed.message).toBe(line);
        expect(failed.usage.llmCalls).toBe(0);
        expect(failed.usage.inputTokens).toBe(0);
        expect(failed.usage.outputTokens).toBe(0);
        expect(mockMessagesStream).not.toHaveBeenCalled();
        expect(event(res.written(), 'error')).toMatchObject({
          section: 'body',
          reason: line,
          retryable: false,
          code: 'party_details_missing',
          error: 'party_details_missing',
          missing,
        });
        expect(res.written()).not.toContain(RAW);
      });
    });

    it('a client_role item left unconfirmed is not read: the row decides', async () => {
      mockMessagesStream.mockResolvedValueOnce(
        sdkAnswer(answerFor('counter_affidavit'), 4000, 800),
      );
      const input = briefInput('counter_affidavit', [{ key: 'client_role', value: 'petitioner' }]);
      input.brief.items = input.brief.items.map((i) =>
        i.key === 'client_role' ? ({ ...i, unconfirmed: true } as any) : i,
      );
      await streamGenerateFromBrief(input, fakeRes());
      expect(systemsOf()[0].endsWith(`\n\n${lineOf('respondent')}`)).toBe(true);
    });
  });
});

// ═══ template-engine.service.ts: the verification text ═══════════════════════

describe('T-431: template-engine verification on a sided pack', () => {
  const bihar = loadCourtRule('bihar_district');
  const courtData = {
    designation: 'DISTRICT & SESSIONS JUDGE, PATNA',
    city: 'Patna',
    caseNomenclature: 'Misc. Case',
    formattingRulesRef: 'bihar_district',
    courtType: 'sessions',
    state: 'Bihar',
    courtRule: bihar ?? undefined,
  };

  function verification(pack: string, form: Record<string, unknown>, withCourt: boolean): string {
    const config = loadTemplateConfig(pack)!;
    return buildPlaceholderContext(config, form, undefined, withCourt ? courtData : undefined)
      .verification_text!;
  }

  it('the fixture court rule has a verification format (else the court-rule case proves nothing)', () => {
    expect(bihar?.verification_format).toContain('{deponent_name}');
  });

  describe.each(['counter_affidavit', 'rejoinder_affidavit'])('%s', (pack) => {
    describe.each([true, false])('court rule present: %s', (withCourt) => {
      it.each(['petitioner', 'respondent'] as Side[])('client side %s', (side) => {
        const text = verification(
          pack,
          {
            applicant_name: APPLICANT,
            petitioner_name: PETITIONER,
            respondent_name: RESPONDENT,
            deponent_name: NAME[side],
            client_side: side,
          },
          withCourt,
        );
        expect(text).toContain(NAME[side]);
        const labels = withCourt ? BIHAR_LABEL : LABEL;
        expect(text).toContain(`the ${labels[side]} herein above named`);
        expect(text).not.toContain(APPLICANT);
        const other: Side = side === 'petitioner' ? 'respondent' : 'petitioner';
        expect(text).not.toContain(`the ${labels[other]} herein above named`);
      });

      it('no side resolved: the blank, never applicant_name and never a guessed label', () => {
        const text = verification(pack, { applicant_name: APPLICANT }, withCourt);
        expect(text).not.toContain(APPLICANT);
        expect(text).toContain('I, _____');
        expect(text).toContain('the _____ herein above named');
      });
    });
  });

  it.each([true, false])(
    'a non-sided pack still reads applicant_name and the petitioner label (court rule %s)',
    (withCourt) => {
      const text = verification(
        'bail_regular',
        { applicant_name: 'Ram Kumar', deponent_name: RAW, client_side: 'respondent' },
        withCourt,
      );
      expect(text).toContain('Ram Kumar');
      expect(text).not.toContain(RAW);
      // party_label_petitioner: the court rule's "Applicant", else the default
      expect(text).toContain(
        `the ${withCourt ? BIHAR_LABEL.petitioner : LABEL.petitioner} herein above named`,
      );
    },
  );
});

// ═══ Stray client-render keys on a sided pack (round 2) ══════════════════════

describe('T-431: stray client-render keys are stripped on a sided pack', () => {
  const STRAY = {
    applicant_name: 'Stray Applicant',
    'parties.applicant_name': 'Stray Dotted Applicant',
    party_name: 'Stray Party',
    address: 'Stray Address Line',
    applicant_address: 'Stray Applicant Address',
    age: '77',
    applicant_age: '78',
    father_name: 'Stray Father',
    parent_name: 'Stray Parent',
  };

  describe.each(['counter_affidavit', 'rejoinder_affidavit'])('%s', (pack) => {
    it('resolveSidedDeponent drops them (dotted or not) and keeps parties, designation', () => {
      const r = resolveSidedDeponent(
        pack,
        {
          ...STRAY,
          'parties.address': 'Dotted Stray Address',
          'parties.age': '55',
          'parties.father_name': 'Dotted Stray Father',
          petitioner_name: PETITIONER,
          'parties.respondent_name': RESPONDENT,
          deponent_designation: 'Chief Manager',
          court_type: 'sessions',
        },
        { petitioner_name: PETITIONER, respondent_name: RESPONDENT },
      );
      expect(r!.kind).toBe('resolved');
      const out = (r as { formData: Record<string, unknown> }).formData;
      for (const k of [
        'applicant_name',
        'parties.applicant_name',
        'party_name',
        'address',
        'applicant_address',
        'age',
        'applicant_age',
        'father_name',
        'parent_name',
        'parties.address',
        'parties.age',
        'parties.father_name',
      ]) {
        expect(out).not.toHaveProperty(k);
      }
      expect(out).toMatchObject({
        petitioner_name: PETITIONER,
        'parties.respondent_name': RESPONDENT,
        deponent_designation: 'Chief Manager',
        court_type: 'sessions',
      });
    });

    it('on the template path none reaches the model and there is no IMMUTABLE APPLICANT IDENTITY', async () => {
      mockMessagesStream.mockResolvedValueOnce(sdkAnswer('1. x.', 10, 5));
      await streamGenerateFromTemplate(
        templateInput(
          pack,
          formFor(undefined, { ...STRAY, deponent_designation: 'Chief Manager' }),
        ),
        fakeRes(),
      );
      const call = mockMessagesStream.mock.calls[0][0] as SdkStreamParams;
      const user = String(call.messages[0].content);
      const system = systemText(call.system);
      expect(user).not.toContain('IMMUTABLE APPLICANT IDENTITY');
      for (const v of Object.values(STRAY).concat(['Flat Applicant'])) {
        expect(user).not.toContain(v);
        expect(system).not.toContain(v);
      }
      // the parties' own names survive (the respondent rides in IMMUTABLE PARTY NAME)
      expect(user).toContain(RESPONDENT);
    });

    it('on the template path the context built has no stray key; designation and party names survive', async () => {
      const spy = jest.spyOn(templateEngine, 'buildPlaceholderContext');
      try {
        mockMessagesStream.mockResolvedValueOnce(sdkAnswer('1. x.', 10, 5));
        await streamGenerateFromTemplate(
          templateInput(
            pack,
            formFor(undefined, { ...STRAY, deponent_designation: 'Chief Manager' }),
          ),
          fakeRes(),
        );
        const given = spy.mock.calls[0][1] as Record<string, unknown>;
        for (const k of Object.keys(STRAY)) expect(given).not.toHaveProperty(k);
        expect(given).toMatchObject({
          petitioner_name: PETITIONER,
          respondent_name: RESPONDENT,
          deponent_designation: 'Chief Manager',
        });
      } finally {
        spy.mockRestore();
      }
    });
  });
});

// ═══ Dotted, production-shaped keys (promoted field ids are dotted) ══════════

describe('T-431: dotted production-shaped form keys', () => {
  const DOTTED_CASES: Array<{ pack: 'counter_affidavit' | 'rejoinder_affidavit'; side: Side }> = [
    { pack: 'counter_affidavit', side: 'respondent' },
    { pack: 'rejoinder_affidavit', side: 'petitioner' },
  ];

  it.each(DOTTED_CASES)(
    '$pack: deponent line, dotted deponent_* stripped, resolver re-adds age and address',
    async (c) => {
      mockMessagesStream.mockResolvedValueOnce(sdkAnswer('1. x.', 10, 5));
      const form = {
        'parties.petitioner_name': PETITIONER,
        'parties.respondent_name': RESPONDENT,
        'parties.deponent_age': '41',
        'parties.deponent_address': '12 Resolved Road, Patna',
        'parties.deponent_designation': 'Chief Manager',
        'parties.deponent_name': RAW,
        'parties.client_side': c.side === 'petitioner' ? 'respondent' : 'petitioner',
        'parties.applicant_name': APPLICANT,
      };
      await streamGenerateFromTemplate(templateInput(c.pack, form), fakeRes());

      const call = mockMessagesStream.mock.calls[0][0] as SdkStreamParams;
      const system = systemText(call.system);
      const user = String(call.messages[0].content);
      expect(countOf(system, 'DEPONENT: ')).toBe(1);
      expect(system.endsWith(`\n\n${lineOf(c.side)}`)).toBe(true);
      expect(system).not.toContain(RAW);
      expect(user).not.toContain(RAW);
      expect(user).not.toContain(APPLICANT);
      expect(user).not.toContain('IMMUTABLE APPLICANT IDENTITY');
    },
  );

  it.each(DOTTED_CASES)(
    '$pack: the form handed to the context has the resolver deponent_age/address',
    async (c) => {
      const spy = jest.spyOn(templateEngine, 'buildPlaceholderContext');
      try {
        mockMessagesStream.mockResolvedValueOnce(sdkAnswer('1. x.', 10, 5));
        await streamGenerateFromTemplate(
          templateInput(c.pack, {
            'parties.petitioner_name': PETITIONER,
            'parties.respondent_name': RESPONDENT,
            'parties.deponent_age': '41',
            'parties.deponent_address': '12 Resolved Road, Patna',
            'parties.deponent_designation': 'Chief Manager',
            'parties.deponent_name': RAW,
          }),
          fakeRes(),
        );
        const given = spy.mock.calls[0][1] as Record<string, unknown>;
        expect(given).not.toHaveProperty('parties.deponent_age');
        expect(given).not.toHaveProperty('parties.deponent_address');
        expect(given).not.toHaveProperty('parties.deponent_name');
        expect(given).toMatchObject({
          'parties.deponent_designation': 'Chief Manager',
          deponent_name: NAME[c.side],
          client_side: c.side,
          deponent_age: '41',
          deponent_address: '12 Resolved Road, Patna',
        });
      } finally {
        spy.mockRestore();
      }
    },
  );

  it.each(DOTTED_CASES)('$pack: resolveSidedDeponent output for the dotted form', (c) => {
    const form = {
      'parties.petitioner_name': PETITIONER,
      'parties.respondent_name': RESPONDENT,
      'parties.deponent_age': '41',
      'parties.deponent_address': '12 Resolved Road, Patna',
      'parties.deponent_designation': 'Chief Manager',
      'parties.deponent_name': RAW,
    };
    const r = resolveSidedDeponent(c.pack, form, form);
    expect(r!.kind).toBe('resolved');
    const out = (r as { formData: Record<string, unknown> }).formData;
    expect(out).not.toHaveProperty('parties.deponent_age');
    expect(out).not.toHaveProperty('parties.deponent_address');
    expect(out).not.toHaveProperty('parties.deponent_name');
    expect(out).toMatchObject({
      'parties.petitioner_name': PETITIONER,
      'parties.respondent_name': RESPONDENT,
      'parties.deponent_designation': 'Chief Manager',
      deponent_name: NAME[c.side],
      client_side: c.side,
      deponent_age: '41',
      deponent_address: '12 Resolved Road, Patna',
    });
  });
});
