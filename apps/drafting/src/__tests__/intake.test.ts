/**
 * T-101 — POST /intake (ADR-019 §3.3–§3.10, §4.1, §4.2).
 *
 * Covers: match, needs_choice, guided, no match (not legal / unknown id /
 * malformed), missing fields, invalid values dropped (no quote, invented
 * words, bad option, court-data field, wrong date, number boundary,
 * contradiction), rate limits (burst and daily), unavailable paths, usage
 * rows without content, no description text in logs, intake_id carried to
 * the Generation row.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { env } from '../config/env';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { Event } from '../models/Event.model';
import { Generation } from '../models/Generation.model';
import { LlmAuxCall } from '../models/LlmAuxCall.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { datesInText, decideMatch, INTAKE_LIMITS } from '../services/intake.service';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439071';
const MODEL = 'claude-haiku-4-5-20251001';

function headers(plan = 'free', userId = USER_ID) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': plan,
    'x-user-role': 'Client',
  };
}

const DESCRIPTION =
  'My client Ram Kumar, son of Shri Hari Kumar, aged 32, was arrested on 15/03/2026 in FIR No. 124/2026 ' +
  'at Kotwali police station under section 103 BNS. He has been in judicial custody since then. ' +
  'He lives at 123 Main St, Patna. He was falsely implicated because of a family land dispute.';

function sse(content: string, promptTokens = 900, completionTokens = 120) {
  const lines = [
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`,
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

const MATCH_HIGH = JSON.stringify({
  template_id: 'bail_regular',
  confidence: 'high',
  alternatives: [],
  is_legal_drafting: true,
  is_court_document: true,
  label: 'regular bail application',
  category: 'criminal',
});

function fillJson(fields: Array<{ field_id: string; value: unknown; quote: string }>) {
  return JSON.stringify({ fields });
}

const GOOD_FILL = fillJson([
  { field_id: 'applicant_name', value: 'Ram Kumar', quote: 'My client Ram Kumar' },
  { field_id: 'father_name', value: 'Shri Hari Kumar', quote: 'son of Shri Hari Kumar' },
  { field_id: 'applicant_age', value: 32, quote: 'aged 32' },
  { field_id: 'fir_number', value: '124/2026', quote: 'FIR No. 124/2026' },
  { field_id: 'fir_date', value: '2026-03-15', quote: 'arrested on 15/03/2026' },
  { field_id: 'sections_charged', value: ['103'], quote: 'under section 103 BNS' },
  { field_id: 'address', value: '123 Main St, Patna', quote: 'He lives at 123 Main St, Patna' },
]);

function mockModel(...contents: string[]) {
  const fetchMock = jest.fn();
  for (const c of contents) fetchMock.mockResolvedValueOnce(sse(c));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function bodyOf(fetchMock: jest.Mock, n: number) {
  return JSON.parse((fetchMock.mock.calls[n][1] as { body: string }).body);
}

beforeEach(async () => {
  _clearAppSettingsCache();
  await redis.flushall();
  env.HELICONE_API_KEY = 'test-helicone-key';
  await AppSetting.create({ key: 'ai.intake_model', value: MODEL });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
  });
});

afterEach(() => {
  env.HELICONE_API_KEY = '';
  jest.restoreAllMocks();
});

describe('POST /intake — match and fill', () => {
  it('matched: returns template, quote-backed fields, and the required fields still missing', async () => {
    const fetchMock = mockModel(MATCH_HIGH, GOOD_FILL);
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: DESCRIPTION, language: 'en' });

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('matched');
    expect(res.body.template_id).toBe('bail_regular');
    expect(res.body.intake_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.fields.applicant_name).toEqual({
      value: 'Ram Kumar',
      source: 'description',
      quote: 'My client Ram Kumar',
    });
    expect(res.body.fields.fir_date.value).toBe('2026-03-15');
    expect(res.body.fields.sections_charged.value).toEqual(['103']);
    expect(res.body.fields.language).toEqual({ value: 'en', source: 'user' });
    // Court-data fields are never filled, so they are always missing.
    expect(res.body.missing).toEqual(
      expect.arrayContaining(['state', 'court_type', 'court_name', 'facts_narrative']),
    );
    expect(res.body.missing).not.toContain('applicant_name');
    // T-102: round-1 questions come with the match, at most 5, only for missing fields.
    expect(res.body.questions.length).toBeLessThanOrEqual(5);
    for (const q of res.body.questions) expect(res.body.missing).toContain(q.field_id);
    expect(res.body.form_data.applicant_name).toBe('Ram Kumar');
    expect(res.body.fields.applicant_age.value).toBe('32'); // sent as a JSON number
    // No route, mode or confidence leaks to the user.
    expect(JSON.stringify(res.body)).not.toMatch(/confidence|light|strict|route/);

    // Caps: 300 tokens on match, 1500 on fill; the model id from settings.
    expect(bodyOf(fetchMock, 0)).toMatchObject({
      model: MODEL,
      max_tokens: INTAKE_LIMITS.matchMaxTokens,
    });
    expect(bodyOf(fetchMock, 1)).toMatchObject({
      model: MODEL,
      max_tokens: INTAKE_LIMITS.fillMaxTokens,
    });
    // The fill call never offers the court-data fields to the model.
    const fillPrompt = bodyOf(fetchMock, 1).messages[1].content as string;
    expect(fillPrompt).not.toMatch(/^court_name \|/m);
    expect(fillPrompt).toMatch(/^applicant_name \|/m);
  });

  it('records two usage rows with tokens and cost, and no description text', async () => {
    mockModel(MATCH_HIGH, GOOD_FILL);
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: DESCRIPTION });
    const rows = await LlmAuxCall.find({ intakeId: res.body.intake_id }).lean();
    expect(rows.map((r) => r.purpose).sort()).toEqual(['intake_fill', 'intake_match']);
    for (const r of rows) {
      expect(r.status).toBe('completed');
      expect(r.inputTokens).toBe(900);
      expect(r.outputTokens).toBe(120);
      expect(r.usageSource).toBe('provider');
      expect(r.costStatus).toBe('priced');
      expect(r.costUsd).toBeCloseTo((900 / 1e6) * 1 + (120 / 1e6) * 5, 9);
      expect(JSON.stringify(r)).not.toMatch(/Ram Kumar|Kotwali|124\/2026/);
    }
  });

  it('sends Helicone omit headers and no description text reaches the logs', async () => {
    const logs: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error'] as const) {
      jest
        .spyOn(console, m)
        .mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(' ')));
    }
    const fetchMock = mockModel(MATCH_HIGH, GOOD_FILL);
    await request(app).post('/intake').set(headers()).send({ description: DESCRIPTION });
    const h = (fetchMock.mock.calls[0][1] as { headers: Record<string, string> }).headers;
    expect(h['Helicone-Omit-Request']).toBe('true');
    expect(h['Helicone-Omit-Response']).toBe('true');
    expect(h['Helicone-Property-Purpose']).toBe('intake_match');
    expect(logs.join('\n')).not.toMatch(/Ram Kumar|Kotwali|124\/2026|Main St/);
  });

  it('intake spends no Ink', async () => {
    await User.create({
      _id: USER_ID,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: 2000,
    });
    mockModel(MATCH_HIGH, GOOD_FILL);
    await request(app).post('/intake').set(headers()).send({ description: DESCRIPTION });
    const user = await User.findById(USER_ID).lean();
    expect(user!.inkTopup).toBe(2000);
  });

  it('a template the plan does not include is matched with needs_upgrade', async () => {
    const proTemplate = (await import('../services/template-engine.service'))
      .listTemplateConfigs()
      .find((t) => t.plan_access === 'pro');
    if (!proTemplate) return; // catalogue has no pro template today
    mockModel(
      JSON.stringify({
        template_id: proTemplate.template_id,
        confidence: 'high',
        alternatives: [],
        is_legal_drafting: true,
        is_court_document: false,
        label: 'x',
        category: 'civil',
      }),
      fillJson([]),
    );
    const res = await request(app)
      .post('/intake')
      .set(headers('free'))
      .send({ description: DESCRIPTION });
    expect(res.body.outcome).toBe('matched');
    expect(res.body.needs_upgrade).toBe(true);
  });
});

describe('POST /intake — invalid values are dropped and listed as missing', () => {
  it('drops values without a matching quote, invented words, bad options, court fields, wrong dates, and partial numbers', async () => {
    mockModel(
      MATCH_HIGH,
      fillJson([
        { field_id: 'applicant_name', value: 'Ram Kumar', quote: 'Ram Kumar Singh of Danapur' }, // quote not in description
        {
          field_id: 'father_name',
          value: 'Shri Hari Kumar Singh',
          quote: 'son of Shri Hari Kumar',
        }, // adds a word
        { field_id: 'currently_in_custody', value: 'in_jail_forever', quote: 'judicial custody' }, // not an option
        { field_id: 'court_name', value: 'district_sessions_patna', quote: 'Patna' }, // courts data: never filled
        { field_id: 'police_station', value: 'Kotwali', quote: 'Kotwali police station' }, // §4.1.2
        { field_id: 'fir_date', value: '2026-03-16', quote: 'arrested on 15/03/2026' }, // date not in quote
        { field_id: 'applicant_age', value: '3', quote: 'aged 32' }, // "3" is not "32"
        { field_id: 'made_up_field', value: 'x', quote: 'Patna' },
      ]),
    );
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: DESCRIPTION });
    expect(res.body.outcome).toBe('matched');
    expect(res.body.fields).toEqual({});
    expect(res.body.missing).toEqual(
      expect.arrayContaining([
        'applicant_name',
        'father_name',
        'currently_in_custody',
        'court_name',
        'police_station',
        'fir_date',
        'applicant_age',
      ]),
    );
  });

  it('a field given two different values is left empty (§4.1.5); a valid option is kept', async () => {
    mockModel(
      MATCH_HIGH,
      fillJson([
        { field_id: 'applicant_age', value: '32', quote: 'aged 32' },
        { field_id: 'applicant_age', value: '33', quote: 'aged 32' },
        {
          field_id: 'currently_in_custody',
          value: 'yes_judicial',
          quote: 'He has been in judicial custody since then',
        },
      ]),
    );
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: DESCRIPTION });
    expect(res.body.fields.applicant_age).toBeUndefined();
    expect(res.body.missing).toContain('applicant_age');
    expect(res.body.fields.currently_in_custody.value).toBe('yes_judicial');
  });

  it('narrative fields keep the user own words, trimmed with an ellipsis', async () => {
    mockModel(
      MATCH_HIGH,
      fillJson([
        {
          field_id: 'facts_narrative',
          value:
            'He has been in judicial custody since then … He was falsely implicated because of a family land dispute.',
          quote:
            'He has been in judicial custody since then. He lives at 123 Main St, Patna. He was falsely implicated because of a family land dispute.',
        },
      ]),
    );
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: DESCRIPTION });
    expect(res.body.fields.facts_narrative).toBeDefined();
  });

  it('a real name from outside its own quote is dropped (§4.1.3)', async () => {
    mockModel(
      MATCH_HIGH,
      fillJson([
        // "Hari Kumar" is in the description, but not in this quote.
        { field_id: 'applicant_name', value: 'Hari Kumar', quote: 'My client Ram Kumar' },
        // Narrative cut with an ellipsis: the later part is outside the quote.
        {
          field_id: 'facts_narrative',
          value:
            'He has been in judicial custody since then … He was falsely implicated because of a family land dispute.',
          quote: 'He was falsely implicated because of a family land dispute.',
        },
      ]),
    );
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: DESCRIPTION });
    expect(res.body.outcome).toBe('matched');
    expect(res.body.fields.applicant_name).toBeUndefined();
    expect(res.body.fields.facts_narrative).toBeUndefined();
    expect(res.body.missing).toContain('applicant_name');
  });

  it('malformed fill output fills nothing and everything required is missing', async () => {
    mockModel(MATCH_HIGH, 'Sorry, I cannot help with that.');
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: DESCRIPTION });
    expect(res.body.outcome).toBe('matched');
    expect(res.body.fields).toEqual({});
    expect(res.body.missing.length).toBeGreaterThan(5);
  });
});

describe('POST /intake — other outcomes', () => {
  it('medium confidence asks the user to choose, never picks (§4.2.2); unknown ids are left out', async () => {
    mockModel(
      JSON.stringify({
        template_id: 'bail_regular',
        confidence: 'medium',
        alternatives: ['bail_anticipatory', 'not_a_template'],
        is_legal_drafting: true,
        is_court_document: true,
        label: 'bail',
        category: 'criminal',
      }),
    );
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: DESCRIPTION });
    expect(res.body.outcome).toBe('needs_choice');
    expect(res.body.choices.map((c: { template_id: string }) => c.template_id)).toEqual([
      'bail_regular',
      'bail_anticipatory',
    ]);
    expect(res.body.fields).toBeUndefined();
  });

  it('after needs_choice, sending the picked template_id runs only the fill call', async () => {
    const fetchMock = mockModel(GOOD_FILL);
    const intakeId = '33333333-3333-4333-8333-333333333333';
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: DESCRIPTION, template_id: 'bail_regular', intake_id: intakeId });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({
      outcome: 'matched',
      intake_id: intakeId,
      template_id: 'bail_regular',
    });
  });

  it('a picked template_id outside the catalogue is no match, with no model call', async () => {
    const fetchMock = mockModel();
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: DESCRIPTION, template_id: 'not_a_template' });
    expect(res.body.outcome).toBe('no_match');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no template fits → guided, with a demand signal that holds no description text', async () => {
    mockModel(
      JSON.stringify({
        template_id: null,
        confidence: 'low',
        alternatives: [],
        is_legal_drafting: true,
        is_court_document: false,
        label: 'consent letter for Ram 124 premises',
        category: 'other',
      }),
    );
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: DESCRIPTION });
    expect(res.body.outcome).toBe('guided');
    expect(res.body.template_id).toBeUndefined();
    const ev = await Event.findOne({ type: 'demand.no_template' }).lean();
    expect(ev!.metadata).toMatchObject({
      intakeId: res.body.intake_id,
      isCourtDocument: false,
      category: 'other',
    });
    expect(String((ev!.metadata as { label: string }).label)).not.toMatch(/\d/);
  });

  it('a template id not on the allowlist → no match and a demand signal', async () => {
    mockModel(
      JSON.stringify({
        template_id: 'invented_template',
        confidence: 'high',
        alternatives: [],
        is_legal_drafting: true,
        is_court_document: false,
        label: 'something',
        category: 'civil',
      }),
    );
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: DESCRIPTION });
    expect(res.body.outcome).toBe('no_match');
    const ev = await Event.findOne({ type: 'demand.no_match' }).lean();
    expect(ev!.metadata).toMatchObject({ reason: 'unknown_template' });
  });

  it('not a legal drafting request → no match, no demand signal', async () => {
    mockModel(
      JSON.stringify({
        template_id: null,
        confidence: 'low',
        alternatives: [],
        is_legal_drafting: false,
        is_court_document: false,
        label: 'weather',
        category: 'other',
      }),
    );
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: 'What will the weather be like in Patna tomorrow afternoon?' });
    expect(res.body.outcome).toBe('no_match');
    expect(await Event.countDocuments({})).toBe(0);
  });

  it('malformed match output → no match (§4.2.3)', async () => {
    mockModel('not json at all');
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: DESCRIPTION });
    expect(res.body.outcome).toBe('no_match');
  });
});

describe('POST /intake — unavailable and bad input', () => {
  it('missing ai.intake_model → unavailable, no model call, no quota used', async () => {
    await AppSetting.deleteOne({ key: 'ai.intake_model' });
    _clearAppSettingsCache();
    const fetchMock = mockModel();
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: DESCRIPTION });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a bare model alias → unavailable (Helicone needs a dated id)', async () => {
    await AppSetting.updateOne({ key: 'ai.intake_model' }, { value: 'claude-haiku-4-5' });
    _clearAppSettingsCache();
    const fetchMock = mockModel();
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: DESCRIPTION });
    expect(res.body.outcome).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a gateway failure → unavailable, and a failed usage row is still saved', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'down',
    }) as unknown as typeof fetch;
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: DESCRIPTION });
    expect(res.body.outcome).toBe('unavailable');
    const row = await LlmAuxCall.findOne({ intakeId: res.body.intake_id }).lean();
    expect(row).toMatchObject({ purpose: 'intake_match', status: 'failed' });
  });

  it('400 for a description that is too short or too long', async () => {
    const short = await request(app).post('/intake').set(headers()).send({ description: 'help' });
    expect(short.status).toBe(400);
    const long = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: 'a'.repeat(4001) });
    expect(long.status).toBe(400);
    expect(JSON.stringify(long.body)).not.toContain('aaaa');
  });
});

describe('POST /intake — rate limits (hard block)', () => {
  it('the 11th intake within 10 minutes gets 429 with a retry time, and no model call', async () => {
    for (let i = 0; i < INTAKE_LIMITS.burstMax; i++) {
      mockModel('not json');
      const ok = await request(app)
        .post('/intake')
        .set(headers())
        .send({ description: DESCRIPTION });
      expect(ok.status).toBe(200);
    }
    const fetchMock = mockModel();
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: DESCRIPTION });
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.body.retry_after_seconds).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the daily cap blocks a Free user at 40 and a paid user at 150', async () => {
    const day = (() => {
      const ist = new Date(Date.now() + 330 * 60_000);
      return ist.toISOString().slice(0, 10).replace(/-/g, '');
    })();
    await redis.set(`intake:day:${USER_ID}:${day}`, String(INTAKE_LIMITS.dailyFree));
    const fetchMock = mockModel();
    const free = await request(app)
      .post('/intake')
      .set(headers('free'))
      .send({ description: DESCRIPTION });
    expect(free.status).toBe(429);
    expect(free.body.message).toMatch(/today's quota/);
    expect(fetchMock).not.toHaveBeenCalled();

    mockModel('not json');
    const paid = await request(app)
      .post('/intake')
      .set(headers('pro'))
      .send({ description: DESCRIPTION });
    expect(paid.status).toBe(200);
  });
});

describe('generate-from-template — intake_id is stored on the Generation row', () => {
  it('carries intake_id through', async () => {
    await User.create({
      _id: USER_ID,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: 2000,
    });
    await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-5-20250929' });
    mockModel('1. Body.');
    const intakeId = '44444444-4444-4444-8444-444444444444';
    await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({
        template_id: 'bail_regular',
        intake_id: intakeId,
        form_data: {
          fir_number: '124/2026',
          fir_date: '2026-03-15',
          police_station: 'Kotwali, Patna',
          sections_charged: ['103'],
          currently_in_custody: 'yes_judicial',
          custody_since: '2026-03-15',
          state: 'bihar',
          court_type: 'sessions',
          court_name: 'district_sessions_patna',
          applicant_name: 'Ram Kumar',
          father_name: 'Shri Hari Kumar',
          applicant_age: '32',
          address: '123 Main St',
          language: 'en',
          facts_narrative:
            'The accused was falsely implicated in FIR 124/2026 due to family dispute.',
          grounds_for_bail: ['false_implication', 'no_flight_risk'],
        },
      });
    const gen = await Generation.findOne({ userId: USER_ID }).lean();
    expect(gen!.intakeId).toBe(intakeId);
  });
});

describe('pure helpers', () => {
  it('datesInText reads Indian date formats, day first', () => {
    expect(datesInText('on 15/03/2026')).toEqual(['2026-03-15']);
    expect(datesInText('on 5.3.2026')).toEqual(['2026-03-05']);
    expect(datesInText('on 15th March, 2026')).toEqual(['2026-03-15']);
    expect(datesInText('on March 15, 2026')).toEqual(['2026-03-15']);
    expect(datesInText('on 31/02/2026')).toEqual([]);
  });

  it('decideMatch: high with unknown id is no match; low is guided', () => {
    const allowed = new Set(['a']);
    expect(
      decideMatch({ template_id: 'b', confidence: 'high', is_legal_drafting: true }, allowed).kind,
    ).toBe('no_match');
    expect(
      decideMatch({ template_id: null, confidence: 'low', is_legal_drafting: true }, allowed).kind,
    ).toBe('guided');
    expect(
      decideMatch({ template_id: 'a', confidence: 'weird', is_legal_drafting: true }, allowed).kind,
    ).toBe('no_match');
    expect(decideMatch(null, allowed).kind).toBe('no_match');
  });
});
