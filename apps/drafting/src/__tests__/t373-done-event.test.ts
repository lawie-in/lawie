/**
 * T-373 phase 2: the `done` event of POST /generate-from-brief carries
 * `rendered` on a D1 draft and derives `missingClauses` from it; a non-D1 draft
 * is unchanged. The route does not pass a skeleton loader yet, so
 * streamGenerateFromBrief is stubbed with a D1-shaped result and the real
 * route, hold, save and sendDone run around it. (Not reached through the
 * model: that part is t373-structured-drafter.test.ts.)
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { STARTING_DRAFT_LABEL } from '../services/brief-drafter';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';

const mockGenerate = jest.fn();
jest.mock('../services/ai.service', () => ({
  ...jest.requireActual('../services/ai.service'),
  streamGenerateFromBrief: (...args: unknown[]) => mockGenerate(...args),
}));

const MODEL = 'claude-sonnet-4-5-20250929';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439091';
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

// The first ground of the pack is "False implication". Two tests below lean on that.
const PACK = loadRulePack('bail_regular')!;
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

function post(body: Record<string, unknown>) {
  return request(app).post('/generate-from-brief').set(headers()).send(body);
}

function event(text: string, name: string): Record<string, unknown> | null {
  const blocks = text.split('\n\n').filter((b) => b.startsWith(`event: ${name}\n`));
  if (blocks.length === 0) return null;
  return JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]) as Record<string, unknown>;
}

/** What streamGenerateFromBrief returns, with what the route reads. */
function fakeResult(extra: Record<string, unknown>) {
  return {
    fullText: 'The body.',
    sectionsCited: [],
    filingChecklist: [],
    aiModel: MODEL,
    transport: 'direct',
    usage: { inputTokens: 10, outputTokens: 10, llmCalls: 1, usageSource: 'provider' },
    bodyParaCount: 3,
    repaired: false,
    warnings: [],
    startingDraft: false,
    labelReason: null,
    mandatoryClausesComplete: true,
    missingClauses: [],
    ...extra,
  };
}

beforeEach(async () => {
  mockGenerate.mockReset();
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
  await createVerifiedUser({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
});

const RENDERED = [
  { clauseId: 'opening', status: 'ok' },
  { clauseId: 'facts', status: 'fallback', reason: 'unverified' },
  { clauseId: 'antecedents', status: 'missing', missing: ['Criminal antecedents'] },
];

describe('the done event on a D1 draft', () => {
  it('carries rendered[] as the renderer gave it', async () => {
    mockGenerate.mockResolvedValue(
      fakeResult({ rendered: RENDERED, startingDraft: true, labelReason: 'x' }),
    );
    const res = await post({ kind: 'bail_regular', values: VALUES, court, paragraphs: 12 });
    expect(res.status).toBe(200);
    const done = event(res.text, 'done')!;
    expect(done.rendered).toEqual(RENDERED);
    expect(done.startingDraft).toBe(true);
    expect(done.startingDraftLabel).toBe(STARTING_DRAFT_LABEL);
  });

  it('missingClauses is derived from rendered[] (id, title), not from result.missingClauses', async () => {
    mockGenerate.mockResolvedValue(
      fakeResult({
        rendered: RENDERED,
        missingClauses: [{ id: 'stale', title: 'Stale', reason: 'no_report' }],
      }),
    );
    const res = await post({ kind: 'bail_regular', values: VALUES, court, paragraphs: 12 });
    expect(event(res.text, 'done')!.missingClauses).toEqual([
      { id: 'antecedents', title: 'Criminal antecedents' },
    ]);
  });

  it('a D1 draft with nothing missing has an empty missingClauses even if the stale list is not', async () => {
    mockGenerate.mockResolvedValue(
      fakeResult({
        rendered: RENDERED.slice(0, 2),
        missingClauses: [{ id: 'stale', title: 'Stale', reason: 'no_report' }],
      }),
    );
    const res = await post({ kind: 'bail_regular', values: VALUES, court, paragraphs: 12 });
    expect(event(res.text, 'done')!.missingClauses).toEqual([]);
  });

  it('rendered[] holds ids, statuses, blank labels and reasons only', async () => {
    mockGenerate.mockResolvedValue(fakeResult({ rendered: RENDERED }));
    const res = await post({ kind: 'bail_regular', values: VALUES, court, paragraphs: 12 });
    for (const r of event(res.text, 'done')!.rendered as Array<Record<string, unknown>>) {
      for (const k of Object.keys(r))
        expect(['clauseId', 'status', 'missing', 'reason']).toContain(k);
    }
  });
});

describe('the done event on a non-D1 draft is unchanged', () => {
  it('has no rendered key and reports result.missingClauses as (id, title)', async () => {
    mockGenerate.mockResolvedValue(
      fakeResult({
        missingClauses: [{ id: 'prayer', title: 'The prayer', reason: 'paragraph_not_found' }],
        mandatoryClausesComplete: false,
        startingDraft: true,
        labelReason: 'This draft does not cover: The prayer. Add them before use.',
      }),
    );
    const res = await post({ kind: 'bail_regular', values: VALUES, court, paragraphs: 12 });
    const done = event(res.text, 'done')!;
    expect(done).not.toHaveProperty('rendered');
    expect(done.missingClauses).toEqual([{ id: 'prayer', title: 'The prayer' }]);
    expect(done.mandatoryClausesComplete).toBe(false);
  });
});

it('the pack used by the harness is the regular bail pack', () => {
  expect(buildChecklist(loadRulePack('bail_regular')!).length).toBeGreaterThan(0);
});
