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
import { seedVerifiedUsers } from './verifiedUser';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { Event } from '../models/Event.model';
import { LlmAuxCall } from '../models/LlmAuxCall.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { DEMAND_CATEGORIES, INTAKE_LIMITS } from '../services/intake.service';
import { SdkStreamParams, sdkAnswer } from './sdkStream';
const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

// Every test sets its own model answer; nothing carries over from the one before.
beforeEach(() => {
  mockMessagesStream.mockReset();
});

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
  return sdkAnswer(content, promptTokens, completionTokens);
}

function mockModel(...contents: string[]) {
  const fetchMock = mockMessagesStream.mockReset();
  for (const c of contents) fetchMock.mockResolvedValueOnce(sse(c));
  return fetchMock;
}

function bodyOf(fetchMock: jest.Mock, n: number) {
  const p = fetchMock.mock.calls[n][0] as SdkStreamParams;
  return { ...p, messages: [{ role: 'system', content: p.system }, ...p.messages] };
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
  await AppSetting.create({ key: 'ai.intake_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
  });
});

afterEach(() => {
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
    // T-190: bail_regular now has an arrest_date fact, so the stated arrest date
    // lands on it (it was a loose date before the pack had a place for it).
    expect(itemOf(brief, 'arrest_date')).toMatchObject({
      value: '2026-03-15',
      source: 'description',
    });
    expect(brief.loose_dates).toEqual([]);
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
      expect.arrayContaining(['father_name']),
    );

    // T-245a (Addendum 1, last row): fir_date is optional now, so it is not still_unknown.
    expect(brief.still_unknown.map((u: { key: string }) => u.key)).not.toContain('fir_date');

    // At most 5 questions a round, 2 rounds, and only about the checklist.
    expect(questions.length).toBeLessThanOrEqual(10);
    expect(questions.filter((q: { round: number }) => q.round === 1).length).toBeLessThanOrEqual(5);
    const byKey = new Map(
      questions.map((q: { key: string; question: string }) => [q.key, q.question]),
    );
    // T-245a (Addendum 5 #3, 41a4b27): fir_date is optional but asked, with the question Ajay
    // signed at 940ef87.
    expect(byKey.get('fir_date')).toBe(
      'On what date was the FIR registered, or the complaint filed if there is no FIR?',
    );
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
    expect(events[0].metadata).toMatchObject({ intakeId: INTAKE_ID });
    expect(events[0].metadata).not.toHaveProperty('label');
    expect(DEMAND_CATEGORIES as readonly string[]).toContain(
      (events[0].metadata as { category: string }).category,
    );
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
    mockMessagesStream.mockReset().mockRejectedValue(new Error('503 service unavailable'));
    const res = await post({ description: DESCRIPTION });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('unavailable');
    const row = await LlmAuxCall.findOne({ intakeId: res.body.intake_id }).lean();
    expect(row).toMatchObject({ purpose: 'intake_match', status: 'failed' });
  });

  it('a failure in Reception is "unavailable" too, and is not kept for the next try', async () => {
    const failing = mockMessagesStream.mockReset();
    failing.mockResolvedValueOnce(sse(MATCH_BAIL));
    failing.mockRejectedValueOnce(new Error('503 service unavailable'));
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

// T-677: section numbers (148A, 138, 483) used to be stripped from the document
// label with every other digit, giving "CAVEAT PETITION UNDER SECTION A CPC".
describe('T-677 — section numbers survive in the document label', () => {
  function briefWithKind(kind: unknown) {
    const b: Record<string, unknown> = {
      outcome: 'brief',
      court_document: false,
      brief: {
        from: 'Ram Kumar',
        to: 'Mohan Traders',
        facts: [{ text: 'A fact.', source: 'own shop no. 4 in Boring Road, Patna' }],
        requests: [],
        unknowns: [],
      },
    };
    if (kind !== undefined) b.document_kind = kind;
    return JSON.stringify(b);
  }

  let freshId = 0;
  async function nameViaModel(kind: unknown): Promise<string> {
    mockModel(MATCH_NONE, briefWithKind(kind));
    // The brief is cached per intake_id: a fresh id for every call.
    freshId += 1;
    const intakeId = `55555555-5555-4555-8555-${String(freshId).padStart(12, '0')}`;
    const res = await post({ description: CONSENT, intake_id: intakeId });
    expect(res.body.outcome).toBe('brief');
    return res.body.brief.kind.name;
  }

  async function nameViaUpdate(kindName: string): Promise<string> {
    const res = await request(app)
      .post('/intake/brief/update')
      .set(headers())
      .send({ kind: 'none', kind_name: kindName, court_document: false, values: [] });
    expect(res.status).toBe(200);
    return res.body.brief.kind.name;
  }

  const KEPT = [
    'Caveat petition under Section 148A CPC',
    'NI Act Section 138 Complaint for dishonoured cheque',
    'Application under Section 483 BNSS',
  ];

  describe('the intake model path', () => {
    it.each(KEPT)('keeps the section number byte for byte: %s', async (label) => {
      expect(await nameViaModel(label)).toBe(label);
    });

    it('never gives the broken caveat title the user saw', async () => {
      const caveat = await nameViaModel('Caveat petition under Section 148A CPC');
      expect(caveat).not.toBe('Caveat petition under Section A CPC');
      expect(caveat).toContain('148A');
    });

    it('never gives the broken NI Act title the user saw', async () => {
      const ni = await nameViaModel('NI Act Section 138 Complaint for dishonoured cheque');
      expect(ni).not.toBe('NI Act Section Complaint for dishonoured cheque');
      expect(ni).not.toBe('Section NI Act Complaint for dishonoured cheque');
      expect(ni).toContain('138');
    });

    it.each([
      ['missing', undefined],
      ['a number', 483],
      ['null', null],
      ['an object', { a: 1 }],
      ['an empty string', ''],
      ['only digits', '12345'],
    ])('document_kind that is %s falls back to Document', async (_n, kind) => {
      expect(await nameViaModel(kind)).toBe('Document');
    });
  });

  describe('the /update path (the web echoes kind_name back)', () => {
    it.each([
      ...KEPT,
      'Application for bail under BNSS 483',
      'Petition under Sections 138 and 141 NI Act',
      'Complaint u/s 138/142 NI Act',
      'Cruelty s. 498-A IPC',
    ])('keeps the section number byte for byte: %s', async (label) => {
      expect(await nameViaUpdate(label)).toBe(label);
    });

    it('is a fixed point: sending back the name it returned changes nothing', async () => {
      for (const label of [
        ...KEPT,
        'Quashing under Section 528 BNSS in FIR No. 456/2023',
        'Bail application in FIR No. 123/2024',
      ]) {
        const first = await nameViaUpdate(label);
        const second = await nameViaUpdate(first);
        expect(second).toBe(first);
      }
    });

    it('an absent kind_name falls back to Document', async () => {
      const res = await request(app)
        .post('/intake/brief/update')
        .set(headers())
        .send({ kind: 'none', court_document: false, values: [] });
      expect(res.body.brief.kind.name).toBe('Document');
    });
  });

  describe('digits that are not section numbers are still dropped', () => {
    it.each([
      ['Bail application in FIR No. 123/2024', 'Bail application in FIR No. /'],
      ['Bail application 2024', 'Bail application'],
      ['Section 123456', 'Section'],
      ['FIR Section 99999999', 'FIR Section'],
      ['Call 9876543210', 'Call'],
      ["Mother's 2 children", "Mother's children"],
      ['IPC 123/2024 case', 'IPC / case'],
      [
        'Quashing under Section 528 BNSS in FIR No. 456/2023',
        'Quashing under Section 528 BNSS in FIR No. /',
      ],
      ['W.P. No. 1234/2022 under Article 226', 'W.P. No. / under Article 226'],
      ['CRL.M.C. 5678/2021 u/s 482 CrPC', 'CRL.M.C. / u/s 482 CrPC'],
    ])('%s', async (label, expected) => {
      expect(await nameViaUpdate(label)).toBe(expected);
      expect(await nameViaModel(label)).toBe(expected);
    });

    it('a FIR and year in the label never reach the name', async () => {
      const name = await nameViaUpdate('Bail application in FIR No. 123/2024');
      expect(name).not.toContain('123');
      expect(name).not.toContain('2024');
    });
  });

  describe('table of kept section forms', () => {
    it.each([
      'Application under CPC 148A',
      'Petition u/s 482 & 483',
      'Section 138, 141 NI Act',
      'Order 39 Rule 1 CPC',
      'Article 226 writ',
      'Application for bail under BNSS 483',
    ])('%s is unchanged', async (label) => {
      expect(await nameViaUpdate(label)).toBe(label);
    });
  });

  describe('the other guards are unchanged', () => {
    it('labels with no digits come through unchanged', async () => {
      expect(await nameViaUpdate('letter to the landlord')).toBe('letter to the landlord');
    });

    it('collapses whitespace and trims', async () => {
      expect(await nameViaUpdate('  Caveat \t petition   under\nSection   148A  CPC  ')).toBe(
        'Caveat petition under Section 148A CPC',
      );
    });

    it('caps the label at 80 characters', async () => {
      expect(await nameViaUpdate('x'.repeat(100))).toBe('x'.repeat(80));
      expect(await nameViaModel('x'.repeat(200))).toBe('x'.repeat(80));
    });

    // Changed in round 2: the old test locked a cut that left "Section 1".
    // Now the cap never leaves half a provision number.
    it('cap: a cut inside a number token backs up to the last space', async () => {
      const label = `${'a'.repeat(70)} Section 148A CPC`;
      const out = await nameViaUpdate(label);
      expect(out).toBe(`${'a'.repeat(70)} Section`);
      expect(out).toHaveLength(78);
      expect(await nameViaModel(label)).toBe(out);
    });

    it('cap: a cut inside "148A" itself never leaves 1, 14 or 148', async () => {
      for (const n of [68, 69, 70, 71]) {
        const out = await nameViaUpdate(`${'a'.repeat(n)} Section 148A CPC`);
        expect(out).toBe(`${'a'.repeat(n)} Section`);
        expect(out).not.toMatch(/\d/);
      }
    });

    it('cap: a cut that lands on a space keeps the 80 characters', async () => {
      const out = await nameViaUpdate(`${'a'.repeat(72)} Section 148A CPC`);
      expect(out).toBe(`${'a'.repeat(72)} Section`);
      expect(out).toHaveLength(80);
    });

    it('cap: a token with no digit is cut where it falls', async () => {
      const label = `${'a'.repeat(70)} Sectionxyz CPC`;
      const out = await nameViaUpdate(label);
      expect(out).toBe(label.slice(0, 80));
      expect(out).toHaveLength(80);
    });

    it('cap: no whitespace at all is cut at exactly 80', async () => {
      expect(await nameViaUpdate('x'.repeat(100))).toBe('x'.repeat(80));
    });

    it('cap: a label under 80 with a number is untouched', async () => {
      const label = `${'a'.repeat(40)} Section 148A CPC`;
      expect(await nameViaUpdate(label)).toBe(label);
    });
  });

  describe('round 2: bracketed sub-sections, plurals, r/w, PII shapes, chain cap', () => {
    const BRACKETS = [
      'Application under Section 156(3) CrPC',
      'Application u/s 175(3) BNSS',
      'Section 3(1)(r) SC/ST Act',
      'Section 156(3)',
      'CrPC 156(3)',
    ];
    const PLURALS = [
      'Order XXXIX Rules 1 and 2',
      'Order XXXIX Rule 1',
      'Order 39 Rules 1 and 2 CPC',
    ];
    const CHAINS = [
      'Sections 138 & 141 r/w 142',
      'Section 138 read with 141',
      'Section 1234',
      'Section 138/142/143',
    ];

    it.each([...BRACKETS, ...PLURALS])('model path keeps: %s', async (label) => {
      expect(await nameViaModel(label)).toBe(label);
    });

    it.each([...BRACKETS, ...PLURALS, ...CHAINS])('/update keeps: %s', async (label) => {
      expect(await nameViaUpdate(label)).toBe(label);
    });

    it.each([...BRACKETS, ...PLURALS, ...CHAINS])('/update is a fixed point: %s', async (label) => {
      const first = await nameViaUpdate(label);
      expect(await nameViaUpdate(first)).toBe(first);
    });

    it('a bracketed number is not stripped to an empty bracket', async () => {
      const out = await nameViaUpdate('Application under Section 156(3) CrPC');
      expect(out).toContain('156(3)');
      expect(out).not.toContain('()');
    });

    it.each([
      ['Bail order 2024', 'Bail order'],
      ['Order 9876', 'Order'],
      ['Rule 4111', 'Rule'],
      ['Article 2024 matter', 'Article matter'],
      ['Section 138/2024', 'Section 138/'],
      ['Order 12-03-2024', 'Order 12--'],
      ['Order 987-654-3210', 'Order 987--'],
      ['Section 1234-5678-9012', 'Section 1234--'],
      ['Section 1,2,3,4,5', 'Section 1,2,3,4,'],
    ])('PII or case shape is dropped: %s', async (label, expected) => {
      expect(await nameViaUpdate(label)).toBe(expected);
      expect(await nameViaModel(label)).toBe(expected);
    });

    it('a date, phone or Aadhaar-shaped tail never survives', async () => {
      for (const [label, secret] of [
        ['Order 987-654-3210', '3210'],
        ['Section 1234-5678-9012', '9012'],
        ['Order 12-03-2024', '2024'],
        ['Section 138/2024', '2024'],
      ]) {
        expect(await nameViaUpdate(label)).not.toContain(secret);
      }
    });

    it('a chain keeps at most 4 numbers', async () => {
      const out = await nameViaUpdate('Section 1, 2, 3, 4, 5, 6 NI Act');
      expect(out).not.toMatch(/[5-6]/);
      expect(out).toContain('1, 2, 3, 4');
    });
  });
});

seedVerifiedUsers('507f1f77bcf86cd799439081', '507f1f77bcf86cd799439082');
