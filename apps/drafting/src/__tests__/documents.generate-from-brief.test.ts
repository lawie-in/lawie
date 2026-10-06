/**
 * T-106 — POST /generate-from-brief (ADR-021 sections 3.5, 3.6 and 5; prompts
 * and rules signed by Ajay in T-127).
 *
 * Covers: a draft with a rule pack that passes, one with a clause missing
 * before and after the repair pass, a blank for an unknown, a failed run, the
 * label, the records, the charge, and the things that stop a draft before any
 * model call.
 *
 * Every model answer here is a fixture. The helpers are tested without a
 * database in brief-drafter.test.ts.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { env } from '../config/env';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER, STARTING_DRAFT_LABEL } from '../services/brief-drafter';
import {
  DRAFTER_PACK_SYSTEM_PROMPT,
  DRAFTER_REPAIR_SYSTEM_PROMPT,
} from '../services/drafter.prompts';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { decrypt } from '../utils/encryption';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439091';
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

const PACK = loadRulePack('bail_regular')!;
const CLAUSE_IDS = PACK.mandatoryClauses.map((c) => c.id);
// The first ground of the pack is "False implication". Two tests below lean on that.
const FIRST_GROUND = buildChecklist(PACK).find((i) => i.key === 'grounds_for_bail')!.options[0];

const court = { state: 'bihar', court_type: 'sessions', court: COURT_ID };

/** Every required fact of a regular bail application, as the user confirmed it. */
const VALUES = [
  {
    key: 'applicant_name',
    value: 'Ram Kumar',
    source: 'description',
    quote: 'My client Ram Kumar',
  },
  { key: 'father_name', value: 'Shri Hari Kumar' },
  { key: 'applicant_age', value: '32' },
  { key: 'address', value: '123 Main St, Patna' },
  { key: 'fir_number', value: '124/2026' },
  { key: 'fir_date', value: '2026-03-10' },
  { key: 'police_station', value: 'Kotwali' },
  { key: 'sections_charged', value: ['318'] },
  { key: 'currently_in_custody', value: 'Yes — Judicial custody' },
  {
    key: 'facts_narrative',
    // "wrongly named" is what makes the facts support the ground chosen below.
    value:
      'The applicant was wrongly named in the FIR and falsely implicated due to a family land dispute.',
  },
  { key: 'grounds_for_bail', value: [FIRST_GROUND] },
];

const BODY = [
  '1. That the applicant Ram Kumar, son of Shri Hari Kumar, is a law-abiding citizen.',
  '2. That FIR No. 124/2026 dated 10.03.2026 was registered at PS Kotwali under Section 318 of BNS.',
  '3. That the applicant is in judicial custody. He was wrongly named in the FIR and falsely implicated due to a family land dispute.',
  '4. That the applicant has deep roots in society and will not flee from justice.',
].join('\n\n');

const UNDERTAKING =
  '5. That the applicant undertakes to abide by every condition this Court may impose.';

function report(overrides: Record<string, string> = {}): string {
  return CLAUSE_IDS.map((id) => `${id}: ${overrides[id] ?? '1'}`).join('\n');
}

function drafterAnswer(body = BODY, overrides: Record<string, string> = {}): string {
  return `${body}\n\n${CLAUSES_MARKER}\n${report(overrides)}`;
}

function sse(content: string, promptTokens = 4000, completionTokens = 800) {
  const lines = [
    // Two chunks, so the marker is not always whole in one.
    `data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(0, content.length - 40) } }] })}`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(content.length - 40) } }] })}`,
    `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens } })}`,
    'data: [DONE]',
  ];
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    body: new ReadableStream({
      pull(controller) {
        if (i < lines.length) controller.enqueue(encoder.encode(lines[i++] + '\n'));
        else controller.close();
      },
    }),
  };
}

function mockModel(...contents: string[]) {
  const fetchMock = jest.fn();
  for (const c of contents) fetchMock.mockResolvedValueOnce(sse(c));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function bodyOf(fetchMock: jest.Mock, n: number) {
  return JSON.parse((fetchMock.mock.calls[n][1] as { body: string }).body) as {
    messages: Array<{ role: string; content: string }>;
  };
}

/** The last `event: name` payload in an SSE response body. */
function event(text: string, name: string): Record<string, unknown> | null {
  const blocks = text.split('\n\n').filter((b) => b.startsWith(`event: ${name}\n`));
  if (blocks.length === 0) return null;
  return JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]) as Record<string, unknown>;
}

function post(body: Record<string, unknown>, userId = USER_ID) {
  return request(app).post('/generate-from-brief').set(headers(userId)).send(body);
}

async function seedUser(userId: string, inkTopup = 2000) {
  await User.create({
    _id: userId,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup,
  });
}

beforeEach(async () => {
  _clearAppSettingsCache();
  env.HELICONE_API_KEY = 'test-helicone-key';
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
  await seedUser(USER_ID);
});

afterEach(() => {
  env.HELICONE_API_KEY = '';
  jest.restoreAllMocks();
});

describe('POST /generate-from-brief — a draft that passes', () => {
  it('writes the body under the rule pack, adds the fixed parts from the brief, and carries no label', async () => {
    const fetchMock = mockModel(drafterAnswer());
    const res = await post({ kind: 'bail_regular', values: VALUES, court, paragraphs: 12 });

    expect(res.status).toBe(200);
    const done = event(res.text, 'done');
    expect(done).toMatchObject({
      complete: true,
      mandatoryClausesComplete: true,
      missingClauses: [],
      repaired: false,
      startingDraft: false,
      startingDraftLabel: null,
      labelReason: null,
    });
    expect(event(res.text, 'warning')).toBeNull();
    expect(event(res.text, 'repair')).toBeNull();

    // The clause report is for the server. It never reaches the user.
    expect(res.text).not.toContain(CLAUSES_MARKER);
    expect(res.text).not.toContain('no_flight_risk');

    // The fixed parts come from the brief and the courts data, not from the model.
    const sections = (
      event(res.text, 'template_sections')!.sections as Array<{
        section_id: string;
        type: string;
        content: string;
      }>
    ).reduce<Record<string, string>>((all, s) => ({ ...all, [s.section_id]: s.content }), {});
    expect(Object.keys(sections)).toEqual([
      'cause_title',
      'application_heading',
      'addressing_clause',
      'body',
      'prayer',
      'verification',
      'advocate_block',
    ]);
    expect(sections.cause_title).toContain('DISTRICT & SESSIONS JUDGE, PATNA');
    expect(sections.cause_title).toContain('Ram Kumar');
    expect(sections.prayer).toContain('FIR No. 124/2026 dated 10.03.2026');
    expect(sections.body).toBe(BODY);
    expect(sections.verification).toContain('I, Ram Kumar, the Applicant');
    expect(sections.verification).toContain('Verified at Patna');

    // One Drafter call, with Ajay's prompt and the brief.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = bodyOf(fetchMock, 0).messages;
    expect(sent[0].content).toBe(DRAFTER_PACK_SYSTEM_PROMPT);
    expect(sent[1].content).toContain('"date_of": "Date of FIR"');
    expect(sent[1].content).toContain('"date": "10.03.2026"');
    expect(sent[1].content).toContain('SYSTEM PARTS:\n- cause title');
    expect(sent[1].content).toContain('TARGET: 12');
    expect(sent[1].content).toContain('"court": "DISTRICT & SESSIONS JUDGE, PATNA"');
  });

  it('saves the document, the encrypted brief, one usage row, and charges once', async () => {
    mockModel(drafterAnswer());
    const intakeId = '55555555-5555-4555-8555-555555555555';
    const res = await post({ kind: 'bail_regular', values: VALUES, court, intake_id: intakeId });
    const done = event(res.text, 'done')!;

    const doc = await LawieDocument.findById(done.docId as string).lean();
    expect(doc).toMatchObject({
      rulePackId: 'bail_regular',
      startingDraft: false,
      courtName: COURT_ID,
      courtType: 'sessions',
      runId: res.headers['x-run-id'],
      runSequence: 1,
    });
    expect(doc!.title).toContain('DISTRICT & SESSIONS JUDGE, PATNA');
    // Case details are not in the unencrypted field. The brief is stored encrypted.
    expect(doc!.formInputs).toEqual({ template_id: 'bail_regular', source: 'brief' });
    expect(doc!.brief).not.toContain('Ram Kumar');
    const savedBrief = JSON.parse(decrypt(doc!.brief!)) as { kind: string; values: unknown[] };
    expect(savedBrief.kind).toBe('bail_regular');
    expect(savedBrief.values).toHaveLength(VALUES.length);
    expect(decrypt(doc!.generatedContent)).toContain('falsely implicated');

    const gen = await Generation.findOne({ userId: USER_ID }).lean();
    expect(gen).toMatchObject({
      status: 'completed',
      templateId: 'bail_regular',
      runType: 'initial',
      intakeId,
      llmCalls: 1,
      inputTokens: 4000,
      outputTokens: 800,
      paragraphCount: 4,
      costStatus: 'priced',
    });
    expect(String(gen!.documentId)).toBe(String(doc!._id));

    // The editor gets the label state from the server.
    const fetched = await request(app)
      .get(`/${String(doc!._id)}`)
      .set(headers());
    expect(fetched.body).toMatchObject({
      rulePackId: 'bail_regular',
      startingDraft: false,
      startingDraftLabel: null,
    });
  });

  it('a document that is not for a court is drafted with no court and nothing given', async () => {
    const nda = loadRulePack('nda')!;
    mockModel(
      `1. The parties agree to keep information confidential.\n\n${CLAUSES_MARKER}\n${nda.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n')}`,
    );
    const res = await post({ kind: 'nda', values: [] });
    expect(res.status).toBe(200);
    const done = event(res.text, 'done')!;
    expect(done.complete).toBe(true);
    const doc = await LawieDocument.findById(done.docId as string).lean();
    expect(doc).toMatchObject({ rulePackId: 'nda', courtName: '' });
  });
});

describe('POST /generate-from-brief — a mandatory clause is missing', () => {
  it('one repair pass adds it: no label, two model calls on one run, one charge', async () => {
    const fetchMock = mockModel(
      drafterAnswer(BODY, { no_flight_risk: 'MISSING' }),
      drafterAnswer(`${BODY}\n\n${UNDERTAKING}`, { no_flight_risk: '5' }),
    );
    const res = await post({ kind: 'bail_regular', values: VALUES, court });

    expect(event(res.text, 'repair')).toEqual({ missing: 1 });
    expect(event(res.text, 'done')).toMatchObject({
      missingClauses: [],
      repaired: true,
      startingDraft: false,
      mandatoryClausesComplete: true,
    });
    const sections = event(res.text, 'template_sections')!.sections as Array<{
      section_id: string;
      content: string;
    }>;
    expect(sections.find((s) => s.section_id === 'body')!.content).toContain(UNDERTAKING);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const repair = bodyOf(fetchMock, 1).messages;
    expect(repair[0].content).toBe(DRAFTER_REPAIR_SYSTEM_PROMPT);
    expect(repair[1].content).toContain('MISSING: no_flight_risk');
    expect(repair[1].content).toContain('<document>\n1. That the applicant Ram Kumar');

    // The repair's tokens are recorded under the same run. The user is charged once.
    const rows = await Generation.find({ userId: USER_ID }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      llmCalls: 2,
      inputTokens: 8000,
      outputTokens: 1600,
      runSequence: 1,
    });
  });

  it('still missing after the repair pass: the draft carries the label and says what is missing', async () => {
    mockModel(
      drafterAnswer(BODY, { no_flight_risk: 'MISSING' }),
      drafterAnswer(BODY, { no_flight_risk: 'MISSING' }),
    );
    const res = await post({ kind: 'bail_regular', values: VALUES, court });
    const title = PACK.mandatoryClauses.find((c) => c.id === 'no_flight_risk')!.title;

    expect(event(res.text, 'done')).toMatchObject({
      mandatoryClausesComplete: false,
      missingClauses: [{ id: 'no_flight_risk', title }],
      repaired: false,
      startingDraft: true,
      startingDraftLabel: STARTING_DRAFT_LABEL,
      labelReason: `This draft does not cover: ${title}. Add them before use.`,
    });
    const warnings = event(res.text, 'warning')!.warnings as Array<{
      type: string;
      details?: { clauseId?: string };
    }>;
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'missing_clause',
          details: { clauseId: 'no_flight_risk' },
        }),
      ]),
    );

    const doc = await LawieDocument.findOne({ userId: USER_ID }).lean();
    expect(doc!.startingDraft).toBe(true);
    const fetched = await request(app)
      .get(`/${String(doc!._id)}`)
      .set(headers());
    expect(fetched.body).toMatchObject({
      startingDraft: true,
      startingDraftLabel: STARTING_DRAFT_LABEL,
    });
    // The user cannot clear the label.
    await request(app)
      .patch(`/${String(doc!._id)}`)
      .set(headers())
      .send({ startingDraft: false, status: 'finalised' });
    expect((await LawieDocument.findById(doc!._id).lean())!.startingDraft).toBe(true);
  });

  it('a repair that rewrites the draft is refused: the first draft is kept, with the label', async () => {
    mockModel(
      drafterAnswer(BODY, { no_flight_risk: 'MISSING' }),
      drafterAnswer(`1. A different document altogether.\n\n${UNDERTAKING}`, {
        no_flight_risk: '5',
      }),
    );
    const res = await post({ kind: 'bail_regular', values: VALUES, court });
    expect(event(res.text, 'done')).toMatchObject({ repaired: false, startingDraft: true });
    const sections = event(res.text, 'template_sections')!.sections as Array<{
      section_id: string;
      content: string;
    }>;
    expect(sections.find((s) => s.section_id === 'body')!.content).toBe(BODY);
  });

  it('a repair call that fails does not fail the draft', async () => {
    const fetchMock = jest.fn();
    fetchMock.mockResolvedValueOnce(sse(drafterAnswer(BODY, { no_flight_risk: 'MISSING' })));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'down' });
    global.fetch = fetchMock as unknown as typeof fetch;
    const res = await post({ kind: 'bail_regular', values: VALUES, court });
    expect(event(res.text, 'done')).toMatchObject({
      complete: true,
      repaired: false,
      startingDraft: true,
    });
    expect(await Generation.countDocuments({ userId: USER_ID, status: 'completed' })).toBe(1);
  });

  it('with no clause report at all, every clause the system did not add counts as missing', async () => {
    mockModel(BODY, BODY);
    const res = await post({ kind: 'bail_regular', values: VALUES, court });
    const done = event(res.text, 'done')!;
    expect(done.startingDraft).toBe(true);
    expect((done.missingClauses as Array<{ id: string }>).map((m) => m.id)).toEqual(
      expect.arrayContaining(['grounds', 'fir_details', 'no_flight_risk']),
    );
  });
});

describe('POST /generate-from-brief — nothing the brief does not give', () => {
  it('an unknown becomes a visible blank, in the fixed parts and in what the Drafter is told', async () => {
    const fetchMock = mockModel(drafterAnswer('1. That the applicant Ram Kumar seeks bail.'));
    const res = await post({
      kind: 'bail_regular',
      values: [{ key: 'applicant_name', value: 'Ram Kumar' }],
      court,
    });
    expect(res.status).toBe(200);
    const sections = event(res.text, 'template_sections')!.sections as Array<{
      section_id: string;
      content: string;
    }>;
    const prayer = sections.find((s) => s.section_id === 'prayer')!.content;
    expect(prayer).toContain('FIR No. [To be confirmed: FIR number]');
    expect(prayer).toContain('dated [To be confirmed: date of FIR]');
    const sent = bodyOf(fetchMock, 0).messages[1].content;
    expect(sent).toContain('"blank": "[To be confirmed: date of FIR]"');
    expect(sent).not.toContain('124/2026');
  });

  it('facts that do not support the ground chosen are a finding, and the draft carries the label', async () => {
    mockModel(drafterAnswer());
    const values = VALUES.map((v) =>
      v.key === 'facts_narrative'
        ? { ...v, value: 'The applicant was arrested after a family land dispute.' }
        : v,
    );
    const res = await post({ kind: 'bail_regular', values, court });
    const warnings = event(res.text, 'warning')!.warnings as Array<{ type: string }>;
    expect(warnings.map((w) => w.type)).toEqual(['coherence_mismatch']);
    expect(event(res.text, 'done')).toMatchObject({
      startingDraft: true,
      startingDraftLabel: STARTING_DRAFT_LABEL,
      missingClauses: [],
    });
  });

  it('a date or a section in the body that is not in the brief is a finding, and the draft carries the label', async () => {
    mockModel(
      drafterAnswer(
        `${BODY}\n\n5. That the chargesheet was filed on 20.04.2026 and Section 309 of BNS is not made out.`,
      ),
    );
    const res = await post({ kind: 'bail_regular', values: VALUES, court });
    const warnings = event(res.text, 'warning')!.warnings as Array<{
      type: string;
      message: string;
    }>;
    expect(warnings.map((w) => w.message).join(' | ')).toContain(
      'a date that is not in your brief: 20.04.2026',
    );
    expect(
      warnings.some((w) => w.type === 'invalid_section' && w.message.includes('Section 309')),
    ).toBe(true);
    expect(event(res.text, 'done')).toMatchObject({ startingDraft: true, missingClauses: [] });
    expect(String(event(res.text, 'done')!.labelReason)).toMatch(/checks? did not pass/);
  });
});

describe('POST /generate-from-brief — what stops a draft before any model call', () => {
  async function expectNothingHappened(fetchMock: jest.Mock) {
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await Generation.countDocuments({})).toBe(0);
    expect(await LawieDocument.countDocuments({})).toBe(0);
    expect((await User.findById(USER_ID).lean())!.inkTopup).toBe(2000);
  }

  it('a court document with no court: 400, with the line Ajay wrote', async () => {
    const fetchMock = mockModel();
    const res = await post({ kind: 'bail_regular', values: VALUES });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'brief_not_confirmed',
      message: 'Choose the court to continue.',
      blockers: ['court'],
    });
    await expectNothingHappened(fetchMock);
  });

  it('a court document with no party named: 400', async () => {
    const fetchMock = mockModel();
    const res = await post({ kind: 'bail_regular', values: [], court });
    expect(res.status).toBe(400);
    expect(res.body.blockers).toEqual(['parties']);
    await expectNothingHappened(fetchMock);
  });

  it('a court that is not in the courts data: 400. The court is never free text', async () => {
    const fetchMock = mockModel();
    const res = await post({
      kind: 'bail_regular',
      values: VALUES,
      court: { ...court, court: 'Some Court I Typed' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('court_not_found');
    expect(JSON.stringify(res.body)).not.toContain('Some Court');
    await expectNothingHappened(fetchMock);
  });

  it('a kind that is not a rule pack: 404', async () => {
    const fetchMock = mockModel();
    expect((await post({ kind: 'not_a_pack', values: [] })).status).toBe(404);
    await expectNothingHappened(fetchMock);
  });

  it('a bad request: 400, and the message never repeats what was sent', async () => {
    const fetchMock = mockModel();
    const res = await post({ kind: '../../etc/passwd', values: [] });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('passwd');
    expect((await post({ kind: 'bail_regular', values: [{ key: 'x' }], court })).status).toBe(400);
    await expectNothingHappened(fetchMock);
  });

  it('describe-first off for the user: 404', async () => {
    await AppSetting.updateOne({ key: 'feature.describe_first' }, { value: 'off' });
    _clearAppSettingsCache();
    const fetchMock = mockModel();
    expect((await post({ kind: 'bail_regular', values: VALUES, court })).status).toBe(404);
    await expectNothingHappened(fetchMock);
  });

  it('not enough Ink: 402', async () => {
    const poor = '507f1f77bcf86cd799439092';
    await seedUser(poor, 0);
    const fetchMock = mockModel();
    const res = await post({ kind: 'bail_regular', values: VALUES, court }, poor);
    expect(res.status).toBe(402);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /generate-from-brief — a failed run', () => {
  it('is recorded as failed, saves no document, charges nothing, and a retry keeps the run', async () => {
    const failing = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 503, text: async () => 'down' });
    global.fetch = failing as unknown as typeof fetch;
    const first = await post({ kind: 'bail_regular', values: VALUES, court });
    expect(first.status).toBe(200);
    expect(first.text).toContain('event: error');
    expect(first.text).not.toContain('event: done');
    const runId = first.headers['x-run-id'];

    expect(await LawieDocument.countDocuments({})).toBe(0);
    expect(await Generation.findOne({ runId }).lean()).toMatchObject({
      status: 'failed',
      templateId: 'bail_regular',
      runSequence: 1,
      runType: 'initial',
    });

    mockModel(drafterAnswer());
    const retry = await post({ kind: 'bail_regular', values: VALUES, court, run_id: runId });
    expect(retry.headers['x-run-id']).toBe(runId);
    expect(retry.headers['x-run-sequence']).toBe('2');
    expect(event(retry.text, 'done')).toMatchObject({ complete: true, startingDraft: false });
    expect(await Generation.countDocuments({ runId })).toBe(2);
    expect(await LawieDocument.countDocuments({})).toBe(1);
  });
});
