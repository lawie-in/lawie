/**
 * T-105 — POST /intake/brief and POST /intake/brief/update (ADR-021 sections
 * 3.2 to 3.4; rules and prompts signed by Ajay in T-127 and T-107).
 *
 * Covers: a request with a rule pack, one without, a change of kind, a date
 * with and without a stated meaning, the court never coming from the model,
 * the court-document confirm rule, the 2-round limit, a repeated description,
 * a request that is not legal drafting, the never-draft list, a model failure,
 * the switch, the limits, and no user text in usage rows or logs.
 *
 * The rules themselves are tested without a database in intake-brief.test.ts.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { env } from '../config/env';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { Event } from '../models/Event.model';
import { LlmAuxCall } from '../models/LlmAuxCall.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { INTAKE_LIMITS } from '../services/intake.service';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439081';
const MODEL = 'claude-haiku-4-5-20251001';
const INTAKE_ID = '44444444-4444-4444-8444-444444444444';

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

const CONSENT =
  'I, Suresh Prasad, own shop no. 4 in Boring Road, Patna. I want to give consent to Mohan Traders ' +
  'to use it as their registered office.';

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

function mockModel(...contents: string[]) {
  const fetchMock = jest.fn();
  for (const c of contents) fetchMock.mockResolvedValueOnce(sse(c));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function bodyOf(fetchMock: jest.Mock, n: number) {
  return JSON.parse((fetchMock.mock.calls[n][1] as { body: string }).body);
}

function match(templateId: string | null, confidence: 'high' | 'medium' | 'low', extra = {}) {
  return JSON.stringify({
    template_id: templateId,
    confidence,
    alternatives: [],
    is_legal_drafting: true,
    is_court_document: templateId !== null,
    label: 'legal document',
    category: 'other',
    ...extra,
  });
}

const MATCH_BAIL = match('bail_regular', 'high');
const MATCH_NONE = match(null, 'low', {
  is_court_document: false,
  label: 'consent letter for premises',
});

/** What a careless model might return: a wrong date, a court and a police station. */
const RECEPTION_BAIL = JSON.stringify({
  outcome: 'read',
  read: [
    { id: 'applicant_name', value: 'Ram Kumar', quote: 'My client Ram Kumar' },
    { id: 'fir_number', value: '124/2026', quote: 'FIR No. 124/2026' },
    { id: 'fir_date', value: '2026-03-15', quote: 'arrested on 15/03/2026 in FIR No. 124/2026' },
    { id: 'court', value: 'Sessions Court, Patna', quote: 'He lives at 123 Main St, Patna' },
    { id: 'police_station', value: 'Kotwali', quote: 'at Kotwali police station' },
    { id: 'father_name', value: 'Shri Hari Prasad', quote: 'son of Shri Hari Kumar' },
  ],
  conflicts: [],
  questions: [
    { id: 'fir_date', question: 'On what date was the FIR registered?' },
    { id: 'court', question: 'Which court will this be filed in?' },
  ],
});

const EMPTY_READ = JSON.stringify({ outcome: 'read', read: [], conflicts: [], questions: [] });

interface Item {
  key: string;
  value: string | string[] | null;
  source: string | null;
  please_check: boolean;
}

function itemOf(brief: { items: Item[] }, key: string): Item | undefined {
  return brief.items.find((i) => i.key === key);
}

function post(body: Record<string, unknown>, plan = 'free') {
  return request(app).post('/intake/brief').set(headers(plan)).send(body);
}

beforeEach(async () => {
  _clearAppSettingsCache();
  await redis.flushall();
  env.HELICONE_API_KEY = 'test-helicone-key';
  await AppSetting.create({ key: 'ai.intake_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
  });
});

afterEach(() => {
  env.HELICONE_API_KEY = '';
  jest.restoreAllMocks();
});

describe('POST /intake/brief — a request with a rule pack', () => {
  it('returns one brief: what the user wrote, nothing the model added, and questions for what is missing', async () => {
    const fetchMock = mockModel(MATCH_BAIL, RECEPTION_BAIL);
    const res = await post({ description: DESCRIPTION });

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('brief');
    const { brief, questions } = res.body;
    expect(brief.kind).toEqual({
      id: 'bail_regular',
      name: expect.any(String),
      court_document: true,
    });

    // Read with a quote: kept, and marked for the user to check.
    expect(itemOf(brief, 'applicant_name')).toMatchObject({
      value: 'Ram Kumar',
      source: 'description',
      please_check: true,
    });
    expect(itemOf(brief, 'fir_number')?.value).toBe('124/2026');
    // The date of arrest is not the date of the FIR.
    expect(itemOf(brief, 'fir_date')?.value).toBeNull();
    expect(brief.loose_dates).toEqual([
      { value: '2026-03-15', kind: 'arrest', meaning: 'Date of arrest' },
    ]);
    // Words the user did not write are dropped.
    expect(itemOf(brief, 'father_name')?.value).toBeNull();
    // The court never comes from the model. The police station does, when the advocate wrote it (T-139).
    expect(brief.court).toEqual({ state: null, court_type: null, court: null });
    expect(itemOf(brief, 'court')).toBeUndefined();
    expect(itemOf(brief, 'police_station')).toMatchObject({
      value: 'Kotwali',
      source: 'description',
      please_check: true,
    });
    expect(JSON.stringify(brief)).not.toContain('Sessions Court');

    // A court document cannot be confirmed without the court.
    expect(brief).toMatchObject({
      can_confirm: false,
      confirm_blockers: ['court'],
      confirm_message: 'Choose the court to continue.',
    });
    expect(brief.still_unknown.map((u: { key: string }) => u.key)).toEqual(
      expect.arrayContaining(['fir_date', 'father_name']),
    );

    // At most 5 questions a round, 2 rounds, and only about the checklist.
    expect(questions.length).toBeLessThanOrEqual(10);
    expect(questions.filter((q: { round: number }) => q.round === 1).length).toBeLessThanOrEqual(5);
    const byKey = new Map(
      questions.map((q: { key: string; question: string }) => [q.key, q.question]),
    );
    expect(byKey.get('fir_date')).toBe('On what date was the FIR registered?');
    expect(byKey.has('court')).toBe(false);
    expect(byKey.has('applicant_name')).toBe(false);
    // Given in the description, so neither asked nor "still unknown" (T-139).
    expect(byKey.has('police_station')).toBe(false);
    expect(brief.still_unknown.map((u: { key: string }) => u.key)).not.toContain('police_station');

    // Two model calls: the match, then Reception with the checklist and never the court.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const reception = bodyOf(fetchMock, 1);
    const sent = JSON.stringify(reception.messages);
    expect(sent).toContain('fir_number | FIR Number | text | required');
    expect(sent).toContain('You never write any part of the document');
    expect(sent).toContain('police_station |');
    expect(sent).not.toContain('court_type |');
  });

  it('records each model call under the intake id, with tokens and cost and no user text', async () => {
    mockModel(MATCH_BAIL, RECEPTION_BAIL);
    const logs = (['info', 'error', 'warn', 'log'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    const res = await post({ description: DESCRIPTION, intake_id: INTAKE_ID });
    expect(res.body.intake_id).toBe(INTAKE_ID);

    const rows = await LlmAuxCall.find({ intakeId: INTAKE_ID }).sort({ createdAt: 1 }).lean();
    expect(rows.map((r) => r.purpose).sort()).toEqual(['intake_match', 'intake_reception']);
    for (const row of rows) {
      expect(row).toMatchObject({ status: 'completed', inputTokens: 900, outputTokens: 120 });
      expect(row.costUsd).toBeGreaterThan(0);
    }
    const stored = JSON.stringify(rows);
    const logged = JSON.stringify(logs.flatMap((l) => l.mock.calls));
    for (const text of ['Ram Kumar', 'Kotwali', '124/2026', 'Main St']) {
      expect(stored).not.toContain(text);
      expect(logged).not.toContain(text);
    }
    expect(logged).toContain('brief built');
  });

  it('a malformed Reception answer still gives a brief, with questions written from the labels', async () => {
    mockModel(MATCH_BAIL, 'Sorry, here is some text that is not JSON');
    const res = await post({ description: DESCRIPTION });
    expect(res.body.outcome).toBe('brief');
    expect(itemOf(res.body.brief, 'applicant_name')?.value).toBeNull();
    expect(res.body.questions.length).toBe(10);
    expect(res.body.questions[0].question).toMatch(/^Please give: /);
  });

  it('a date with its meaning stated is placed, by the code if the model leaves it out', async () => {
    mockModel(MATCH_BAIL, EMPTY_READ);
    const res = await post({
      description:
        'Bail application for my client. FIR No. 124/2026 dated 10/03/2026 at Kotwali, he is in custody since 15/03/2026.',
    });
    expect(itemOf(res.body.brief, 'fir_date')).toMatchObject({
      value: '2026-03-10',
      source: 'description',
      please_check: true,
    });
    expect(itemOf(res.body.brief, 'custody_since')?.value).toBe('2026-03-15');
    expect(res.body.brief.loose_dates).toEqual([]);
  });

  it('the pick after "Which document do you need?" skips the match call', async () => {
    const fetchMock = mockModel(RECEPTION_BAIL);
    const res = await post({
      description: DESCRIPTION,
      kind: 'bail_regular',
      intake_id: INTAKE_ID,
    });
    expect(res.body.outcome).toBe('brief');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(bodyOf(fetchMock, 0).messages)).toContain('CHECKLIST');
  });
});

describe('POST /intake/brief — the kind of document', () => {
  it('when the match is unsure, up to 3 kinds are offered and nothing is read', async () => {
    const fetchMock = mockModel(
      match('bail_regular', 'medium', { alternatives: ['bail_before_magistrate', 'not_a_pack'] }),
    );
    const res = await post({
      description:
        'Need a bail application for my client in a case under section 85 BNS at Mahila Thana.',
    });
    expect(res.body.outcome).toBe('needs_choice');
    expect(res.body.choices).toEqual([
      { kind: 'bail_regular', name: expect.any(String) },
      { kind: 'bail_before_magistrate', name: expect.any(String) },
    ]);
    expect(res.body.brief).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('the bail guard applies: an arrested person is never taken straight to anticipatory bail', async () => {
    const fetchMock = mockModel(match('bail_anticipatory', 'high'));
    const res = await post({ description: DESCRIPTION });
    expect(res.body.outcome).toBe('needs_choice');
    expect(res.body.choices.map((c: { kind: string }) => c.kind)).toEqual([
      'bail_regular',
      'bail_anticipatory',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('changing the kind keeps what the user typed, reads again for the new kind, and counts against the intake', async () => {
    mockModel(MATCH_BAIL, RECEPTION_BAIL);
    await post({ description: DESCRIPTION, intake_id: INTAKE_ID });

    const fetchMock = mockModel(RECEPTION_BAIL);
    const res = await post({
      description: DESCRIPTION,
      kind: 'bail_anticipatory',
      intake_id: INTAKE_ID,
      keep: [
        { key: 'applicant_name', value: 'Ram Kumar Singh' },
        { key: 'custody_since', value: '2026-03-15', label: 'In custody since' },
      ],
      court: { state: 'Bihar', court_type: 'sessions', court: 'Sessions Court, Patna' },
    });
    expect(res.body.outcome).toBe('brief');
    const { brief } = res.body;
    expect(brief.kind.id).toBe('bail_anticipatory');
    // What the user typed wins over what is read, and is not marked "please check".
    expect(itemOf(brief, 'applicant_name')).toMatchObject({
      value: 'Ram Kumar Singh',
      source: 'user',
      please_check: false,
    });
    expect(itemOf(brief, 'fir_number')?.value).toBe('124/2026');
    // The court the user chose is kept. A value the new kind has no place for is not lost.
    expect(brief.court).toEqual({
      state: 'Bihar',
      court_type: 'sessions',
      court: 'Sessions Court, Patna',
    });
    expect(brief.unplaced).toEqual([{ label: 'In custody since', value: '2026-03-15' }]);
    expect(brief.can_confirm).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The first request counted against the user. The change counts against the intake.
    expect(await redis.get(`intake:followups:${INTAKE_ID}`)).toBe('1');
    expect(await redis.get(`intake:burst:${USER_ID}`)).toBe('1');
  });

  it('an intake id the user never started is counted as a first request, not a follow-up', async () => {
    mockModel(RECEPTION_BAIL);
    const res = await post({
      description: DESCRIPTION,
      kind: 'bail_regular',
      intake_id: INTAKE_ID,
    });
    expect(res.body.outcome).toBe('brief');
    expect(await redis.get(`intake:burst:${USER_ID}`)).toBe('1');
    expect(await redis.get(`intake:followups:${INTAKE_ID}`)).toBeNull();
  });

  it('a kind that is not a rule pack is no match, with no model call', async () => {
    const fetchMock = mockModel();
    const res = await post({ description: DESCRIPTION, kind: 'not_a_pack', intake_id: INTAKE_ID });
    expect(res.body.outcome).toBe('no_match');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /intake/brief — a request with no rule pack', () => {
  const QUESTIONS = JSON.stringify({
    outcome: 'questions',
    document_kind: 'consent letter for use of premises',
    court_document: false,
    questions: [
      { id: 'q1', question: 'For how long is the consent given?', about: 'fact' },
      { id: 'q2', question: 'Is any rent or fee payable?', about: 'amount' },
    ],
  });
  const BRIEF = JSON.stringify({
    outcome: 'brief',
    document_kind: 'consent letter for use of premises',
    court_document: false,
    brief: {
      purpose: 'Owner consents to use of premises as registered office',
      from: 'Suresh Prasad',
      to: 'Mohan Traders',
      other_parties: [],
      court_or_authority: null,
      facts: [
        { text: 'The owner owns shop no. 4.', source: 'own shop no. 4 in Boring Road, Patna' },
        { text: 'Consent is for three years.', source: 'for three years from 01/04/2026' },
        { text: 'The rent is Rs. 10,000.', source: 'rent of Rs. 10,000 per month' },
      ],
      requests: ['give consent to Mohan Traders to use it as their registered office'],
      amounts: [],
      dates: ['01/04/2026'],
      sections_given: [],
      language: 'en',
      unknowns: ['whether any rent is payable'],
    },
  });
  const ANSWERS = [
    { question: 'For how long is the consent given?', answer: 'for three years from 01/04/2026' },
    { question: 'Is any rent or fee payable?', answer: 'not decided' },
  ];

  it('round 1 asks, round 2 returns the brief, and a demand signal is saved once with no user text', async () => {
    const fetchMock = mockModel(MATCH_NONE, QUESTIONS, BRIEF);
    const first = await post({ description: CONSENT, intake_id: INTAKE_ID });
    expect(first.body).toMatchObject({ outcome: 'questions', next_round: 2 });
    expect(
      first.body.questions.map((q: { key: string; round: number }) => [q.key, q.round]),
    ).toEqual([
      ['q1', 1],
      ['q2', 1],
    ]);
    expect(first.body.brief).toBeUndefined();
    // Strict mode, round 1, and the prompt that never drafts.
    const sent = JSON.stringify(bodyOf(fetchMock, 1).messages);
    expect(sent).toContain('MODE: strict');
    expect(sent).toContain('ROUND: 1');
    expect(sent).toContain('ROUND: 1, 2 or 3.');

    const second = await post({
      description: CONSENT,
      intake_id: INTAKE_ID,
      round: 2,
      answers: ANSWERS,
    });
    expect(second.body.outcome).toBe('brief');
    const { brief } = second.body;
    expect(brief.kind).toEqual({
      id: null,
      name: 'consent letter for use of premises',
      court_document: false,
    });
    expect(itemOf(brief, 'fixed.first_party')?.value).toBe('Suresh Prasad');
    expect(itemOf(brief, 'fixed.other_party')?.value).toBe('Mohan Traders');
    // Facts are kept in the user's own words. The invented rent is dropped.
    expect(itemOf(brief, 'fixed.facts')?.value).toBe(
      'own shop no. 4 in Boring Road, Patna\nfor three years from 01/04/2026',
    );
    expect(JSON.stringify(brief)).not.toContain('10,000');
    expect(brief.still_unknown.map((u: { label: string }) => u.label)).toEqual(
      expect.arrayContaining(['whether any rent is payable']),
    );
    // Not a court document: it can be confirmed with things still unknown.
    expect(brief.can_confirm).toBe(true);
    expect(second.body.questions).toEqual([]);

    // The match is not called again for the same description: 3 model calls in all.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const round2 = JSON.stringify(bodyOf(fetchMock, 2).messages);
    expect(round2).toContain('ROUND: 2');
    expect(round2).toContain('for three years from 01/04/2026');

    const events = await Event.find({ type: 'demand.no_template' }).lean();
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toMatchObject({
      intakeId: INTAKE_ID,
      label: 'consent letter for premises',
    });
    expect(JSON.stringify(events)).not.toContain('Suresh');
    const rows = await LlmAuxCall.find({ intakeId: INTAKE_ID }).lean();
    expect(rows.map((r) => r.purpose).sort()).toEqual([
      'intake_match',
      'intake_reception',
      'intake_reception',
    ]);
  });

  it('two rounds and no more: a model that still asks in round 3 gets no third round', async () => {
    const fetchMock = mockModel(MATCH_NONE, QUESTIONS);
    const res = await post({
      description: CONSENT,
      intake_id: INTAKE_ID,
      round: 3,
      answers: ANSWERS,
    });
    expect(res.body.outcome).toBe('unavailable');
    expect(res.body.questions).toBeUndefined();
    expect(JSON.stringify(bodyOf(fetchMock, 1).messages)).toContain('ROUND: 3');
  });

  it('never more than 5 questions in a round', async () => {
    const many = JSON.stringify({
      outcome: 'questions',
      document_kind: 'letter',
      court_document: false,
      questions: Array.from({ length: 9 }, (_, i) => ({
        id: `q${i + 1}`,
        question: `Question number ${i + 1}?`,
      })),
    });
    mockModel(MATCH_NONE, many);
    const res = await post({ description: CONSENT });
    expect(res.body.questions).toHaveLength(5);
  });

  it('a court request with no rule pack is a court document, whatever the model says', async () => {
    const courtBrief = JSON.stringify({
      outcome: 'brief',
      document_kind: 'application for return of seized vehicle',
      court_document: false,
      brief: {
        from: 'Ram Kumar',
        to: 'State of Bihar',
        court_or_authority: 'Chief Judicial Magistrate, Patna',
        facts: [{ text: 'Vehicle seized.', source: 'my motorcycle was seized by Kotwali police' }],
        requests: [],
        unknowns: [],
      },
    });
    mockModel(match(null, 'low', { is_court_document: false }), courtBrief);
    const res = await post({
      description:
        'I am Ram Kumar. my motorcycle was seized by Kotwali police in a case against State of Bihar. ' +
        'I need an application to the magistrate for its release.',
    });
    expect(res.body.outcome).toBe('brief');
    const { brief } = res.body;
    expect(brief.kind.court_document).toBe(true);
    expect(brief.court).toEqual({ state: null, court_type: null, court: null });
    expect(JSON.stringify(brief)).not.toContain('Chief Judicial Magistrate');
    expect(brief).toMatchObject({ can_confirm: false, confirm_blockers: ['court'] });
  });

  it('the never-draft list: nothing for the Supreme Court without a rule pack', async () => {
    const fetchMock = mockModel(match(null, 'low'));
    const res = await post({
      description:
        'Draft a transfer petition before the Supreme Court of India for my client Ram Kumar.',
    });
    expect(res.body.outcome).toBe('no_match');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a request Reception refuses is no match', async () => {
    mockModel(MATCH_NONE, JSON.stringify({ outcome: 'refused' }));
    const res = await post({
      description: 'Make a consent letter dated last year so it looks like it was signed in 2025.',
    });
    expect(res.body.outcome).toBe('no_match');
    expect(res.body.brief).toBeUndefined();
  });
});

describe('POST /intake/brief — not legal drafting, failures and the switch', () => {
  it('a request that is not legal drafting is no match, with one model call', async () => {
    const fetchMock = mockModel(match(null, 'low', { is_legal_drafting: false }));
    const res = await post({ description: 'What is the best cricket team in India this year?' });
    expect(res.body.outcome).toBe('no_match');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await Event.countDocuments({})).toBe(0);
  });

  it('Reception saying "not legal" on a picked kind is no match', async () => {
    mockModel(JSON.stringify({ outcome: 'not_legal' }));
    const res = await post({
      description: DESCRIPTION,
      kind: 'bail_regular',
      intake_id: INTAKE_ID,
    });
    expect(res.body.outcome).toBe('no_match');
  });

  it('a model failure is "unavailable", and a failed usage row is saved', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'down',
    }) as unknown as typeof fetch;
    const res = await post({ description: DESCRIPTION });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('unavailable');
    const row = await LlmAuxCall.findOne({ intakeId: res.body.intake_id }).lean();
    expect(row).toMatchObject({ purpose: 'intake_match', status: 'failed' });
  });

  it('a failure in Reception is "unavailable" too, and is not kept for the next try', async () => {
    const failing = jest.fn();
    failing.mockResolvedValueOnce(sse(MATCH_BAIL));
    failing.mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'down' });
    global.fetch = failing as unknown as typeof fetch;
    const first = await post({ description: DESCRIPTION, intake_id: INTAKE_ID });
    expect(first.body.outcome).toBe('unavailable');

    // The next try calls Reception again; only the match is answered from the cache.
    const fetchMock = mockModel(RECEPTION_BAIL);
    const second = await post({ description: DESCRIPTION, intake_id: INTAKE_ID });
    expect(second.body.outcome).toBe('brief');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('with no model setting it is "unavailable", with no model call', async () => {
    await AppSetting.deleteOne({ key: 'ai.intake_model' });
    _clearAppSettingsCache();
    const fetchMock = mockModel();
    const res = await post({ description: DESCRIPTION });
    expect(res.body.outcome).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('both routes are closed while describe-first is off for the user', async () => {
    await AppSetting.updateOne({ key: 'feature.describe_first' }, { value: 'off' });
    _clearAppSettingsCache();
    const fetchMock = mockModel();
    const brief = await post({ description: DESCRIPTION });
    expect(brief.status).toBe(404);
    const update = await request(app)
      .post('/intake/brief/update')
      .set(headers())
      .send({ kind: 'bail_regular', values: [] });
    expect(update.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('400 for a bad request, and the message never repeats what was sent', async () => {
    const short = await post({ description: 'help' });
    expect(short.status).toBe(400);
    const badKind = await post({ description: DESCRIPTION, kind: '../../etc/passwd' });
    expect(badKind.status).toBe(400);
    expect(JSON.stringify(badKind.body)).not.toContain('passwd');
    const noIntake = await post({ description: DESCRIPTION, round: 2, answers: [] });
    expect(noIntake.status).toBe(400);
    const long = await post({ description: 'a'.repeat(4001) });
    expect(long.status).toBe(400);
    expect(JSON.stringify(long.body)).not.toContain('aaaa');
  });
});

describe('POST /intake/brief — a repeated description and the limits', () => {
  it('sending the same description again makes no new model call and uses no quota', async () => {
    const first = mockModel(MATCH_BAIL, RECEPTION_BAIL);
    const a = await post({ description: DESCRIPTION, intake_id: INTAKE_ID });
    expect(first).toHaveBeenCalledTimes(2);

    const second = mockModel();
    const b = await post({ description: DESCRIPTION, intake_id: INTAKE_ID });
    expect(second).not.toHaveBeenCalled();
    expect(b.body).toEqual(a.body);

    expect(await redis.get(`intake:burst:${USER_ID}`)).toBe('1');
    expect(await LlmAuxCall.countDocuments({ intakeId: INTAKE_ID })).toBe(2);
    // What is kept for the repeat cannot be read.
    const keys = await redis.keys('intake:cache:*');
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      const stored = `${key} ${await redis.get(key)}`;
      expect(stored).not.toContain('Ram Kumar');
      expect(stored).not.toContain('bail_regular');
    }
  });

  it('another user sending the same words gets their own model calls', async () => {
    mockModel(MATCH_BAIL, RECEPTION_BAIL);
    await post({ description: DESCRIPTION });
    const fetchMock = mockModel(MATCH_BAIL, RECEPTION_BAIL);
    const other = await request(app)
      .post('/intake/brief')
      .set(headers('free', '507f1f77bcf86cd799439082'))
      .send({ description: DESCRIPTION });
    expect(other.body.outcome).toBe('brief');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('the 11th new description within 10 minutes gets 429, and no model call', async () => {
    for (let i = 0; i < INTAKE_LIMITS.burstMax; i++) {
      mockModel(match(null, 'low', { is_legal_drafting: false }));
      const ok = await post({ description: `${DESCRIPTION} Matter number ${i}.` });
      expect(ok.status).toBe(200);
    }
    const fetchMock = mockModel();
    const res = await post({ description: `${DESCRIPTION} One more.` });
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: 'intake_limit' });
    expect(res.headers['retry-after']).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('changes of kind are capped for one intake', async () => {
    mockModel(MATCH_BAIL, EMPTY_READ);
    await post({ description: DESCRIPTION, intake_id: INTAKE_ID });
    const kinds = [
      'bail_anticipatory',
      'bail_before_magistrate',
      'default_bail',
      'interim_bail',
      'bail_cancellation',
      'surrender_application',
    ];
    expect(kinds).toHaveLength(INTAKE_LIMITS.followUpsPerIntake);
    for (const kind of kinds) {
      mockModel(EMPTY_READ);
      const ok = await post({ description: DESCRIPTION, kind, intake_id: INTAKE_ID });
      expect([kind, ok.status, ok.body.outcome]).toEqual([kind, 200, 'brief']);
    }
    const fetchMock = mockModel();
    const res = await post({
      description: DESCRIPTION,
      kind: 'suspension_of_sentence',
      intake_id: INTAKE_ID,
    });
    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
    // The user's own limit was touched once, by the first request.
    expect(await redis.get(`intake:burst:${USER_ID}`)).toBe('1');
  });
});

describe('POST /intake/brief/update — no model call', () => {
  function update(body: Record<string, unknown>) {
    return request(app).post('/intake/brief/update').set(headers()).send(body);
  }
  const court = { state: 'Bihar', court_type: 'sessions', court: 'Sessions Court, Patna' };

  it('a court document can be confirmed once the court is chosen and the parties are named', async () => {
    const fetchMock = mockModel();
    const without = await update({
      kind: 'bail_regular',
      values: [
        {
          key: 'applicant_name',
          value: 'Ram Kumar',
          source: 'description',
          quote: 'My client Ram Kumar',
        },
      ],
    });
    expect(without.body.brief).toMatchObject({ can_confirm: false, confirm_blockers: ['court'] });
    expect(itemOf(without.body.brief, 'applicant_name')).toMatchObject({ please_check: true });

    const noParty = await update({ kind: 'bail_regular', values: [], court });
    expect(noParty.body.brief).toMatchObject({ can_confirm: false, confirm_blockers: ['parties'] });

    const ready = await update({
      kind: 'bail_regular',
      values: [
        { key: 'applicant_name', value: 'Ram Kumar' },
        { key: 'fir_date', value: '2026-03-10' },
      ],
      court,
    });
    expect(ready.status).toBe(200);
    expect(ready.body.brief).toMatchObject({ can_confirm: true, confirm_message: null, court });
    expect(itemOf(ready.body.brief, 'fir_date')).toMatchObject({
      value: '2026-03-10',
      source: 'user',
    });
    // Confirming is allowed with required facts still unknown: they become visible blanks.
    expect(ready.body.brief.still_unknown.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a document that is not for a court can be confirmed with nothing given', async () => {
    const res = await update({ kind: 'nda', values: [] });
    expect(res.body.brief).toMatchObject({
      can_confirm: true,
      kind: { id: 'nda', court_document: false },
    });
  });

  it('works for a document with no rule pack', async () => {
    const res = await update({
      kind: 'none',
      kind_name: 'application for return of seized vehicle',
      court_document: true,
      values: [
        { key: 'fixed.first_party', value: 'Ram Kumar' },
        { key: 'fixed.other_party', value: 'State of Bihar' },
        { key: 'date.arrest', value: '2026-03-15' },
      ],
      court,
    });
    expect(res.body.brief).toMatchObject({
      can_confirm: true,
      kind: { id: null, name: 'application for return of seized vehicle', court_document: true },
    });
    expect(itemOf(res.body.brief, 'date.arrest')).toMatchObject({ value: '2026-03-15' });
  });

  it('no rule pack: a court signal in the user’s words makes it a court document, whatever was sent', async () => {
    const res = await update({
      kind: 'none',
      kind_name: 'letter to the landlord',
      court_document: false,
      values: [
        { key: 'fixed.first_party', value: 'Ram Kumar' },
        { key: 'fixed.facts', value: 'The suit for eviction is pending.' },
      ],
    });
    expect(res.body.brief).toMatchObject({
      can_confirm: false,
      kind: { id: null, court_document: true },
    });

    const plain = await update({
      kind: 'none',
      kind_name: 'letter to the landlord',
      court_document: false,
      values: [
        { key: 'fixed.first_party', value: 'Ram Kumar' },
        { key: 'fixed.facts', value: 'The rent was paid late in March.' },
      ],
    });
    expect(plain.body.brief).toMatchObject({
      can_confirm: true,
      kind: { id: null, court_document: false },
    });
  });

  it('lists the dates in the description that are still not placed, when it is sent', async () => {
    const res = await update({
      kind: 'bail_regular',
      values: [{ key: 'fir_date', value: '2026-03-10' }],
      description: 'FIR dated 10/03/2026. He was arrested on 15/03/2026.',
    });
    expect(res.body.brief.loose_dates).toEqual([
      { value: '2026-03-15', kind: 'arrest', meaning: 'Date of arrest' },
    ]);
  });

  it('404 for a kind that is not a rule pack, 400 for a bad request', async () => {
    expect((await update({ kind: 'not_a_pack', values: [] })).status).toBe(404);
    expect((await update({ values: [] })).status).toBe(400);
    expect((await update({ kind: 'bail_regular', values: [{ key: 'x' }] })).status).toBe(400);
  });
});
