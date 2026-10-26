/**
 * T-610 — regular bail cannot be started by describing the matter.
 *
 * Root cause (Arjun, from the drafting log: 5 no_match answers, 3 of them
 * stop_reason max_tokens at the 300 cap, 2 clean ~54-token answers with an
 * off-list id): the old decideMatch had no alias lookup and no fallback; any
 * malformed, truncated or off-list answer became no_match; and bad answers
 * were cached for 30 minutes.
 *
 * Both inputs (Anushka's 657-character matter and the one-line version) are
 * driven through POST /intake/brief with a mocked SDK. Also covered: the
 * keyword pass (Ajay's signed table and tie rules T610-T1 to T6), the retry at
 * 600 tokens, the top-3 pick, what is and is not cached, and no Ink.
 * No real model is called.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import keywordFile from '../config/intake/match-keywords.json';
import { AppSetting } from '../models/AppSetting.model';
import { User } from '../models/User.model';
import { Event } from '../models/Event.model';
import { createVerifiedUser, seedVerifiedUsers } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import {
  decideFromAnswer,
  decideMatch,
  INTAKE_LIMITS,
  LEGACY_MATCH_CONFIDENCE,
  MATCH_PICK_THRESHOLD,
  readMatchAnswer,
  resolveTemplateId,
} from '../services/intake.service';
import { MATCH_SYSTEM_PROMPT } from '../services/intake.prompts';
import {
  loadMatchKeywords,
  matchKeywords,
  normaliseForKeywords,
  parseMatchKeywords,
  rankKeywordCandidates,
  resetMatchKeywords,
} from '../services/intake-keyword-match';
import { asyncIterable, SdkStreamParams, sdkAnswer, systemText } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439610';
const MODEL = 'claude-haiku-4-5-20251001';

function headers() {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': USER_ID,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

// ── The two inputs ──────────────────────────────────────────────────────────

const LONG_MATTER =
  'Ramesh Kumar Yadav (34) was arrested in FIR 412/2026 dated 17 Oct 2026 at Kadamkuan PS, Patna ' +
  'under BNS 318(4) and 316(2). He took Rs 2,40,000 for a shop lease and has already returned ' +
  'Rs 1,00,000. No antecedents. He is the sole earner for a family of five. His wife and two ' +
  'young children and his elderly mother depend on him, and he has lived at the same address in ' +
  'Patna for twelve years. The chargesheet has not been filed. He is ready to give sureties and ' +
  'to abide by any condition the court imposes. The magistrate refused bail on 21 Oct 2026. ' +
  'Need a regular bail application before the Sessions Court under s.483 BNSS.';
const GIBBERISH = 'qwerty zxcvb asdfg hjkl poiuy mnbvc lkjhg qazwsx edcrfv tgbyhn ujmik';
const ONE_LINER = 'regular bail application for my client arrested in a cheating case';

const INPUTS: Array<[string, string]> = [
  ['the long matter', LONG_MATTER],
  ['the one-liner', ONE_LINER],
];

// ── Model answers and the scripted SDK ──────────────────────────────────────

function answer(templateId: string | null, confidence: 'high' | 'medium' | 'low', extra = {}) {
  return JSON.stringify({
    template_id: templateId,
    confidence,
    alternatives: [],
    is_legal_drafting: true,
    is_court_document: templateId !== null,
    label: 'regular bail application',
    category: 'criminal',
    ...extra,
  });
}

const MATCH_HIGH = answer('bail_regular', 'high');
/** A MATCH answer cut off at the 300-token cap. */
const TRUNCATED = '{"template_id": "bail_regular", "confidence": "hi';
const EMPTY_READ = JSON.stringify({ outcome: 'read', read: [], conflicts: [], questions: [] });

interface Step {
  text: string;
  stop?: 'max_tokens' | 'end_turn';
}

function stream(step: Step): AsyncIterable<unknown> {
  return asyncIterable([
    { type: 'message_start', message: { usage: { input_tokens: 900, output_tokens: 0 } } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: step.text } },
    {
      type: 'message_delta',
      delta: { stop_reason: step.stop ?? 'end_turn' },
      usage: { output_tokens: 54 },
    },
  ]);
}

/**
 * MATCH calls take the next step from `matchSteps` (a call past the end fails
 * the test); every other call (the reading of the brief) gets an empty read.
 */
function scriptModel(...matchSteps: Array<string | Step>) {
  const steps = matchSteps.map((s) => (typeof s === 'string' ? { text: s } : s));
  let next = 0;
  mockMessagesStream.mockReset();
  mockMessagesStream.mockImplementation(async (params: SdkStreamParams) => {
    if (systemText(params.system) === MATCH_SYSTEM_PROMPT) {
      const step = steps[next++];
      if (!step) throw new Error('unexpected extra MATCH call');
      return stream(step);
    }
    return sdkAnswer(EMPTY_READ, 900, 20);
  });
  return mockMessagesStream;
}

function matchCalls(): SdkStreamParams[] {
  return mockMessagesStream.mock.calls
    .map((c) => c[0] as SdkStreamParams)
    .filter((p) => systemText(p.system) === MATCH_SYSTEM_PROMPT);
}

function post(body: Record<string, unknown>) {
  return request(app).post('/intake/brief').set(headers()).send(body);
}

function kinds(res: { body: { choices: Array<{ kind: string }> } }): string[] {
  return res.body.choices.map((c) => c.kind);
}

seedVerifiedUsers(USER_ID);

beforeEach(async () => {
  mockMessagesStream.mockReset();
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

// ── The inputs ──────────────────────────────────────────────────────────────

describe('T-610 the inputs', () => {
  it('the long matter is about 600 characters and says the Magistrate refused bail', () => {
    expect(LONG_MATTER.length).toBeGreaterThan(550);
    expect(LONG_MATTER.length).toBeLessThan(700);
    expect(LONG_MATTER).toContain('magistrate refused bail');
  });

  it('the keyword pass alone puts bail_regular first for both inputs, no other bail pack ahead', () => {
    for (const [, text] of INPUTS) {
      expect(rankKeywordCandidates(text)[0]).toMatchObject({ templateId: 'bail_regular' });
    }
    const ids = rankKeywordCandidates(LONG_MATTER).map((c) => c.templateId);
    expect(ids).not.toContain('bail_anticipatory');
    expect(ids).not.toContain('default_bail');
    expect(ids).not.toContain('bail_cancellation');
  });
});

describe.each(INPUTS)('T-610 POST /intake/brief with %s', (_name, description) => {
  it('(a) the model answers bail_regular high: matched, one MATCH call at 300 tokens', async () => {
    const fetchMock = scriptModel(MATCH_HIGH);
    const res = await post({ description });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('brief');
    expect(res.body.brief.kind).toMatchObject({ id: 'bail_regular' });
    expect(matchCalls()).toHaveLength(1);
    expect((fetchMock.mock.calls[0][0] as SdkStreamParams).max_tokens).toBe(
      INTAKE_LIMITS.matchMaxTokens,
    );
    expect(INTAKE_LIMITS.matchMaxTokens).toBe(300);
  });

  it('(b) the model answers the alias "bail_application" high: resolved to bail_regular, matched, no retry', async () => {
    scriptModel(answer('bail_application', 'high'));
    const res = await post({ description });
    expect(res.body.outcome).toBe('brief');
    expect(res.body.brief.kind).toMatchObject({ id: 'bail_regular' });
    expect(matchCalls()).toHaveLength(1);
  });

  it('(c) a truncated first answer (stop_reason max_tokens): exactly one retry at 600 tokens, then matched', async () => {
    const fetchMock = scriptModel({ text: TRUNCATED, stop: 'max_tokens' }, MATCH_HIGH);
    const res = await post({ description });
    expect(res.body.outcome).toBe('brief');
    expect(res.body.brief.kind).toMatchObject({ id: 'bail_regular' });
    const calls = matchCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0].max_tokens).toBe(300);
    expect(calls[1].max_tokens).toBe(600);
    expect(INTAKE_LIMITS.matchRetryMaxTokens).toBe(600);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('(c) a truncated answer and a bad retry: needs_choice with bail_regular first, never no_match', async () => {
    scriptModel({ text: TRUNCATED, stop: 'max_tokens' }, { text: TRUNCATED, stop: 'max_tokens' });
    const res = await post({ description });
    expect(res.body.outcome).toBe('needs_choice');
    expect(kinds(res)[0]).toBe('bail_regular');
    expect(res.body.choices.length).toBeLessThanOrEqual(3);
    expect(matchCalls()).toHaveLength(2);
    expect(res.body.brief).toBeUndefined();
  });

  it('(c) a non-JSON first answer and a good retry: matched', async () => {
    scriptModel('Sorry, I cannot help with that.', MATCH_HIGH);
    const res = await post({ description });
    expect(res.body.outcome).toBe('brief');
    expect(res.body.brief.kind).toMatchObject({ id: 'bail_regular' });
    expect(matchCalls()).toHaveLength(2);
  });

  it('(d) a clean off-list id (regular_bail_483) twice: needs_choice with bail_regular first', async () => {
    scriptModel(answer('regular_bail_483', 'high'), answer('regular_bail_483', 'high'));
    const res = await post({ description });
    expect(res.body.outcome).toBe('needs_choice');
    expect(kinds(res)[0]).toBe('bail_regular');
    expect(matchCalls()).toHaveLength(2);
  });

  it('(d) is_legal_drafting true with no allowed id: needs_choice with bail_regular first', async () => {
    scriptModel(answer(null, 'high'));
    const res = await post({ description });
    expect(res.body.outcome).toBe('needs_choice');
    expect(kinds(res)[0]).toBe('bail_regular');
  });

  it('(d) a low-confidence answer with no template: still a pick with bail_regular first', async () => {
    scriptModel(answer(null, 'low'));
    const res = await post({ description });
    expect(res.body.outcome).toBe('needs_choice');
    expect(kinds(res)[0]).toBe('bail_regular');
  });

  it('(e) medium bail_regular with bail_before_magistrate: needs_choice, bail_regular first', async () => {
    scriptModel(answer('bail_regular', 'medium', { alternatives: ['bail_before_magistrate'] }));
    const res = await post({ description });
    expect(res.body.outcome).toBe('needs_choice');
    expect(kinds(res)).toEqual(expect.arrayContaining(['bail_regular', 'bail_before_magistrate']));
    expect(kinds(res)[0]).toBe('bail_regular');
    expect(res.body.choices.length).toBeLessThanOrEqual(3);
    expect(res.body.choices[0]).toEqual({ kind: 'bail_regular', name: expect.any(String) });
  });

  it('is_legal_drafting false: the keywords still give a pick, never "not found"', async () => {
    scriptModel(answer(null, 'low', { is_legal_drafting: false }));
    const res = await post({ description });
    expect(res.body.outcome).toBe('needs_choice');
    expect(kinds(res)[0]).toBe('bail_regular');
  });

  it('never no_match and never a brief before the user picks, whatever the answer', async () => {
    for (const bad of [TRUNCATED, '', 'null', '{}', answer('nonsense_id', 'high')]) {
      await redis.flushall();
      scriptModel(bad, bad);
      const res = await post({ description });
      expect(res.body.outcome).not.toBe('no_match');
      expect(res.body.outcome).toBe('needs_choice');
      expect(kinds(res)[0]).toBe('bail_regular');
    }
  });

  it('spends no Ink on a match, a pick or a retry', async () => {
    await createVerifiedUser({
      _id: USER_ID,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: 2000,
    });
    scriptModel(MATCH_HIGH);
    await post({ description });
    await redis.flushall();
    scriptModel(TRUNCATED, TRUNCATED);
    const pick = await post({ description });
    expect(pick.body.outcome).toBe('needs_choice');
    await redis.flushall();
    scriptModel(answer('bail_regular', 'medium', { alternatives: ['bail_before_magistrate'] }));
    await post({ description });
    const user = await User.findById(USER_ID).lean();
    expect(user!.inkTopup).toBe(2000);
  });

  it('logs the decision with ids only, never the description', async () => {
    const logs: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error'] as const) {
      jest
        .spyOn(console, m)
        .mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(' ')));
    }
    scriptModel(TRUNCATED, TRUNCATED);
    await post({ description });
    const line = logs.find((l) => l.includes('[intake] match decided'));
    expect(line).toBeDefined();
    expect(line).toContain('outcome=needs_choice');
    expect(line).toContain('answer=malformed');
    expect(line).toContain('retried=true');
    expect(line).toContain('top=bail_regular');
    expect(logs.join('\n')).not.toMatch(/Ramesh|Kadamkuan|412\/2026|cheating case/);
  });
});

// ── Caching ─────────────────────────────────────────────────────────────────

describe('T-610 what the MATCH cache keeps', () => {
  it('matched IS cached: a second identical request makes no MATCH call', async () => {
    scriptModel(MATCH_HIGH);
    const first = await post({ description: LONG_MATTER });
    expect(first.body.outcome).toBe('brief');
    expect(matchCalls()).toHaveLength(1);
    const second = await post({ description: LONG_MATTER });
    expect(second.body.outcome).toBe('brief');
    expect(second.body.brief.kind).toMatchObject({ id: 'bail_regular' });
    expect(matchCalls()).toHaveLength(1);
  });

  it('a retry that fixes a truncated answer caches the good answer, not the truncated one', async () => {
    scriptModel({ text: TRUNCATED, stop: 'max_tokens' }, MATCH_HIGH);
    await post({ description: LONG_MATTER });
    expect(matchCalls()).toHaveLength(2);
    const again = await post({ description: LONG_MATTER });
    expect(again.body.outcome).toBe('brief');
    expect(matchCalls()).toHaveLength(2);
  });

  it('a malformed answer (and the fallback pick built on it) is NOT cached', async () => {
    scriptModel(TRUNCATED, TRUNCATED, MATCH_HIGH);
    const first = await post({ description: LONG_MATTER });
    expect(first.body.outcome).toBe('needs_choice');
    expect(matchCalls()).toHaveLength(2);
    const second = await post({ description: LONG_MATTER });
    expect(matchCalls()).toHaveLength(3); // a new model call, not the cached failure
    expect(second.body.outcome).toBe('brief');
    expect(second.body.brief.kind).toMatchObject({ id: 'bail_regular' });
  });

  it('an off-list answer is NOT cached', async () => {
    const offList = answer('regular_bail_483', 'high');
    scriptModel(offList, offList, MATCH_HIGH);
    const first = await post({ description: ONE_LINER });
    expect(first.body.outcome).toBe('needs_choice');
    const second = await post({ description: ONE_LINER });
    expect(matchCalls()).toHaveLength(3);
    expect(second.body.outcome).toBe('brief');
  });

  it('a pick built from a clean medium answer is NOT cached (a fallback pick is never written)', async () => {
    const medium = answer('bail_regular', 'medium', { alternatives: ['bail_before_magistrate'] });
    scriptModel(medium, MATCH_HIGH);
    const first = await post({ description: ONE_LINER });
    expect(first.body.outcome).toBe('needs_choice');
    const second = await post({ description: ONE_LINER });
    expect(matchCalls()).toHaveLength(2);
    expect(second.body.outcome).toBe('brief');
  });

  it('a no_match is NOT cached', async () => {
    const gibberish = answer(null, 'low', { is_legal_drafting: false });
    scriptModel(gibberish, gibberish);
    const text = GIBBERISH;
    expect((await post({ description: text })).body.outcome).toBe('no_match');
    expect((await post({ description: text })).body.outcome).toBe('no_match');
    expect(matchCalls()).toHaveLength(2);
  });

  it('a guided intake: round 2 reuses round 1 decision and makes NO MATCH call', async () => {
    const description =
      'I, Suresh Prasad, own shop no. 4 in Boring Road, Patna. I want to give consent to Mohan Traders ' +
      'to use it as their registered office.';
    const intakeId = '55555555-5555-4555-8555-555555555555';
    const questions = JSON.stringify({
      outcome: 'questions',
      document_kind: 'consent letter for use of premises',
      court_document: false,
      questions: [{ id: 'q1', question: 'For how long is the consent given?', about: 'fact' }],
    });
    const brief = JSON.stringify({
      outcome: 'brief',
      document_kind: 'consent letter for use of premises',
      court_document: false,
      brief: {
        purpose: 'Owner consents to use of premises as registered office',
        from: 'Suresh Prasad',
        to: 'Mohan Traders',
        other_parties: [],
        court_or_authority: null,
        facts: [{ text: 'The owner owns shop no. 4.', source: 'own shop no. 4 in Boring Road' }],
        requests: [],
        amounts: [],
        dates: [],
        sections_given: [],
        language: 'en',
        unknowns: [],
      },
    });
    const guidedMatch = answer(null, 'low', { is_court_document: false, category: 'other' });
    let matches = 0;
    mockMessagesStream.mockReset();
    mockMessagesStream.mockImplementation(async (params: SdkStreamParams) => {
      if (systemText(params.system) === MATCH_SYSTEM_PROMPT) {
        matches += 1;
        return sdkAnswer(guidedMatch, 900, 54);
      }
      const sent = JSON.stringify(params.messages);
      return sdkAnswer(sent.includes('ROUND: 2') ? brief : questions, 900, 80);
    });

    const first = await post({ description, intake_id: intakeId });
    expect(first.body.outcome).toBe('questions');
    expect(matches).toBe(1);
    const second = await post({
      description,
      intake_id: intakeId,
      round: 2,
      answers: [{ question: 'For how long is the consent given?', answer: 'three years' }],
    });
    expect(second.body.outcome).toBe('brief');
    expect(matches).toBe(1);
  });
});

// ── No keyword hits: nothing to fall back on ────────────────────────────────

describe('T-610 gibberish and not-legal stay no_match', () => {
  it('a not-legal answer with no keyword hits is no_match (and no retry)', async () => {
    scriptModel(answer(null, 'low', { is_legal_drafting: false }));
    const res = await post({ description: 'what is the weather in Patna today' });
    expect(res.body.outcome).toBe('no_match');
    expect(matchCalls()).toHaveLength(1);
  });

  it('a malformed answer twice with no keyword hits is no_match', async () => {
    scriptModel(TRUNCATED, TRUNCATED);
    const res = await post({ description: GIBBERISH });
    expect(res.body.outcome).toBe('no_match');
    expect(matchCalls()).toHaveLength(2);
  });
});

// ── decideMatch and the helpers, no database ────────────────────────────────

describe('T-610 decideMatch, resolveTemplateId and the threshold', () => {
  const allowed = new Set(['bail_regular', 'bail_anticipatory', 'bail_before_magistrate']);

  it('constants: threshold 0.75, high is above it, medium and low are below', () => {
    expect(MATCH_PICK_THRESHOLD).toBe(0.75);
    expect(LEGACY_MATCH_CONFIDENCE.high).toBeGreaterThanOrEqual(MATCH_PICK_THRESHOLD);
    expect(LEGACY_MATCH_CONFIDENCE.medium).toBeLessThan(MATCH_PICK_THRESHOLD);
    expect(LEGACY_MATCH_CONFIDENCE.low).toBeLessThan(MATCH_PICK_THRESHOLD);
  });

  it('resolveTemplateId: exact, normalised, alias; an unknown id is null', () => {
    expect(resolveTemplateId('bail_regular', allowed)).toBe('bail_regular');
    expect(resolveTemplateId(' Bail-Regular ', allowed)).toBe('bail_regular');
    expect(resolveTemplateId('bail_application', allowed)).toBe('bail_regular');
    expect(resolveTemplateId('regular_bail_483', allowed)).toBeNull();
  });

  it('a malformed or off-list answer is a keyword pick, or no_match without keywords', () => {
    expect(decideMatch(null, allowed, ['bail_regular'])).toMatchObject({
      kind: 'needs_choice',
      choices: ['bail_regular'],
    });
    expect(decideMatch(null, allowed)).toMatchObject({ kind: 'no_match' });
    const offList = JSON.parse(answer('nonsense', 'high'));
    expect(decideMatch(offList, allowed)).toMatchObject({ kind: 'no_match' });
    expect(decideMatch(offList, allowed, ['bail_regular', 'bail_before_magistrate'])).toMatchObject(
      { kind: 'needs_choice', choices: ['bail_regular', 'bail_before_magistrate'] },
    );
  });

  it('keywords never give matched on their own', () => {
    const none = JSON.parse(answer(null, 'low'));
    expect(decideMatch(none, allowed, ['bail_regular']).kind).toBe('needs_choice');
    expect(decideMatch(none, allowed, ['bail_regular']).templateId).toBeUndefined();
  });

  it('at most 3 choices, model confidence first', () => {
    const wide = JSON.parse(
      answer('bail_before_magistrate', 'medium', {
        alternatives: ['bail_regular', 'bail_anticipatory', 'nonsense'],
      }),
    );
    const d = decideMatch(wide, allowed);
    expect(d.kind).toBe('needs_choice');
    expect(d.choices!.length).toBeLessThanOrEqual(3);
    expect(d.choices![0]).toBe('bail_before_magistrate');
  });
});

// ── Keyword pass (Ajay's signed rules) ──────────────────────────────────────

function ids(text: string): string[] {
  return rankKeywordCandidates(text).map((c) => c.templateId);
}

describe('T-610 keyword pass', () => {
  it('T1: a Magistrate refused bail: bail_regular first, even with s.437 CrPC', () => {
    const text = 'The magistrate refused bail under s.437 CrPC. Need a bail application now.';
    const ranked = ids(text);
    expect(ranked[0]).toBe('bail_regular');
    // the 437 CrPC phrase does match bail_before_magistrate, but ranks behind
    expect(ranked).toContain('bail_before_magistrate');
    for (const phrase of [
      'magistrate rejected bail',
      'bail was rejected by the magistrate',
      'the CJM rejected bail',
      'bail refused by the Magistrate under 437 CrPC',
    ]) {
      expect(ids(phrase + ' and we want bail')[0]).toBe('bail_regular');
    }
  });

  it('T1 needs the word bail: "magistrate refused" alone adds nothing', () => {
    expect(ids('The magistrate refused the request.')).toEqual([]);
  });

  it('T2: a bare 482 or 482 CrPC adds no weight; 482 BNSS with bail is anticipatory', () => {
    expect(ids('petition under section 482 for bail')).toEqual([]);
    expect(ids('bail under s.482 CrPC')).toEqual([]);
    expect(ids('quash the FIR u/s 482 CrPC')).toEqual([]);
    expect(ids('482 BNSS anticipatory bail')[0]).toBe('bail_anticipatory');
    expect(ids('bail under s.482 BNSS')[0]).toBe('bail_anticipatory');
  });

  it('T3: "chargesheet not filed" alone is not default_bail; its own phrases are', () => {
    expect(ids('The chargesheet has not been filed. Need bail.')).not.toContain('default_bail');
    expect(ids('charge sheet pending, need bail')).not.toContain('default_bail');
    expect(ids('chargesheet not filed, need bail')).not.toContain('default_bail');
    expect(ids('default bail u/s 187(3) BNSS')[0]).toBe('default_bail');
    expect(ids('statutory bail, chargesheet not filed in 90 days')[0]).toBe('default_bail');
    expect(ids('bail under 167(2) CrPC')[0]).toBe('default_bail');
  });

  it('T4: bail_cancellation only on its own phrases', () => {
    expect(ids('the accused is in custody and I need bail')).not.toContain('bail_cancellation');
    expect(ids('application for cancellation of bail of the co-accused')[0]).toBe(
      'bail_cancellation',
    );
    expect(ids('we want to cancel the bail granted to him')[0]).toBe('bail_cancellation');
  });

  it('T5: anticipatory and regular phrases both found: neither is ranked, the model decides', () => {
    const both = ids('He wants anticipatory bail, not regular bail, in the Sessions Court.');
    expect(both).not.toContain('bail_regular');
    expect(both).not.toContain('bail_anticipatory');
    // other packs are unaffected
    expect(ids('anticipatory bail or regular bail, and interim bail meanwhile')).toEqual([
      'interim_bail',
    ]);
  });

  it('T6: "magistrate" alone is not a keyword', () => {
    expect(ids('magistrate')).toEqual([]);
    expect(ids('The Magistrate listed the matter for hearing.')).toEqual([]);
  });

  it('rule 3: a section number counts only with bail / जमानत', () => {
    expect(ids('application under s.483 BNSS')).toEqual([]);
    expect(ids('section 439 CrPC')).toEqual([]);
    expect(ids('application under s.483 BNSS for bail')[0]).toBe('bail_regular');
    expect(ids('धारा 483 BNSS जमानत')[0]).toBe('bail_regular');
  });

  it('normalisation: s., sec., section, u/s prefixes and the CrPC forms, any case', () => {
    expect(ids('Section 439 Cr.P.C. bail')[0]).toBe('bail_regular');
    expect(ids('u/s 483 BNSS bail')[0]).toBe('bail_regular');
    expect(ids('Sec. 439 Cr PC bail')[0]).toBe('bail_regular');
    expect(ids('S.439 CRPC bail')[0]).toBe('bail_regular');
    expect(ids('REGULAR BAIL')[0]).toBe('bail_regular');
    expect(normaliseForKeywords('u/s 483 BNSS')).toBe('483 bnss');
    expect(normaliseForKeywords('Section 439 Cr.P.C.')).toBe('439 crpc');
    expect(normaliseForKeywords('Cr PC')).toBe('crpc');
  });

  it('Hindi: नियमित ज़मानत (with the nukta) and नियमित जमानत both give bail_regular', () => {
    const plain = 'नियमित जमानत';
    const decomposed = 'नियमित ज़मानत';
    const precomposed = 'नियमित ज़मानत';
    for (const text of [plain, decomposed, precomposed]) {
      expect(ids(text)[0]).toBe('bail_regular');
    }
    expect(ids('अग्रिम ज़मानत')[0]).toBe('bail_anticipatory');
    expect(ids('अंतरिम ज़मानत')[0]).toBe('interim_bail');
  });

  it('Latin phrases match on word boundaries only', () => {
    expect(ids('irregular bail')).not.toContain('bail_regular');
    expect(ids('cancel bailiff')).not.toContain('bail_cancellation');
  });

  it('only allowed ids are returned', () => {
    const only = new Set(['bail_before_magistrate']);
    expect(
      rankKeywordCandidates('The magistrate refused bail under s.437 CrPC', only).map(
        (c) => c.templateId,
      ),
    ).toEqual(['bail_before_magistrate']);
  });

  it('a malformed table gives an empty pass and never throws', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    resetMatchKeywords();
    expect(parseMatchKeywords(null)).toEqual({});
    expect(parseMatchKeywords([])).toEqual({});
    expect(parseMatchKeywords({ bail_regular: 'regular bail' })).toEqual({});
    expect(rankKeywordCandidates('regular bail', undefined, {})).toEqual([]);
    resetMatchKeywords();
  });
});

// ── The table is legal content: pin it ──────────────────────────────────────

describe('T-610 match-keywords.json is Ajay signed table (26 Oct 2026, section B)', () => {
  const SIGNED = {
    bail_regular: [
      'regular bail',
      'sessions court bail',
      'bail before the sessions',
      'bail in the high court',
      '483 bnss',
      '439 crpc',
      'नियमित जमानत',
    ],
    bail_anticipatory: [
      'anticipatory bail',
      'apprehension of arrest',
      'apprehends arrest',
      'pre-arrest bail',
      '482 bnss',
      '438 crpc',
      'अग्रिम जमानत',
    ],
    bail_before_magistrate: [
      'bail before the magistrate',
      'magistrate bail',
      '480 bnss',
      '437 crpc',
    ],
    default_bail: ['default bail', 'statutory bail', '187(3) bnss', '167(2) crpc'],
    interim_bail: ['interim bail', 'temporary bail', 'अंतरिम जमानत'],
    bail_cancellation: ['cancellation of bail', 'cancel bail', 'cancel the bail', '439(2) crpc'],
  };

  it('parses to exactly the signed table, in the same key order', () => {
    expect(keywordFile).toEqual(SIGNED);
    expect(Object.keys(keywordFile)).toEqual(Object.keys(SIGNED));
    for (const [id, list] of Object.entries(SIGNED)) {
      expect((keywordFile as Record<string, string[]>)[id]).toEqual(list);
    }
  });

  it('the loader returns the same table', () => {
    resetMatchKeywords();
    expect(loadMatchKeywords()).toEqual(SIGNED);
  });
});

describe('T-610 MATCH_SYSTEM_PROMPT carries Ajay signed bail lines (section A), once each', () => {
  const LINES = [
    '- Bail: a person who has already been arrested or is in custody needs regular bail. A person who has not been arrested and expects to be arrested needs anticipatory bail (bail_anticipatory: s.482 BNSS, old s.438 CrPC). Never choose an anticipatory bail template when the description says the person has been arrested or is in custody. Never choose a regular bail template when the description says the person has not been arrested. If the description does not say which, use confidence "medium" and list both.',
    '- Regular bail, which court: an application to the Court of Session or the High Court (s.483 BNSS, old s.439 CrPC) is bail_regular, including when a Magistrate has already refused bail. An application to a Magistrate (s.480 BNSS, old s.437 CrPC) is bail_before_magistrate. If the description names neither court, choose bail_regular with confidence "medium" and list bail_before_magistrate second.',
    '- Default bail: choose default_bail only when the description asks for default or statutory bail because the police report was not filed within the period allowed (s.187(3) BNSS, old s.167(2) CrPC). A chargesheet that is still pending does not, on its own, make it default bail.',
    '- Interim bail: choose interim_bail only when the description asks for interim or temporary bail until the main bail application is decided, or for a short period.',
    '- Cancellation: choose bail_cancellation only when the description asks to cancel bail already granted to another person. Never choose it for a person who is seeking bail.',
    "- Section 482: s.482 of the old CrPC is not bail; it is the High Court's inherent power (now s.528 BNSS). Treat s.482 as anticipatory bail only when the description says BNSS or asks for anticipatory bail.",
  ];

  it.each(LINES.map((l, i) => [i + 1, l]))(
    'bail line %i is present once, byte for byte',
    (_i, line) => {
      expect(MATCH_SYSTEM_PROMPT.split(`${line}\n`)).toHaveLength(2);
    },
  );

  it('the six lines are consecutive and in the signed order', () => {
    expect(MATCH_SYSTEM_PROMPT).toContain(`${LINES.join('\n')}\n`);
  });
});

// ── Anushka's facts only: T1 alone must carry it ────────────────────────────

// Built only from the facts of her item 1. It names no court, and has neither
// "regular bail" nor a s.483 phrase, so only T610-T1 (magistrate refused + bail) can rank it.
const ANUSHKA_FACTS_ONLY =
  'Ramesh Kumar Yadav (34) was arrested in FIR 412/2026 dated 17 Oct 2026 at Kadamkuan PS, Patna ' +
  'under BNS 318(4) and 316(2). He took Rs 2,40,000 for a shop lease and has already returned ' +
  'Rs 1,00,000. No antecedents. He is the sole earner for a family of five. The chargesheet has ' +
  'not been filed. He is ready to give sureties. The magistrate refused bail on 21 Oct 2026.';

describe('T-610 facts-only fixture (no court named, no "regular bail", no s.483)', () => {
  it('the fixture really lacks the free phrases, and T1 alone ranks bail_regular first', () => {
    expect(ANUSHKA_FACTS_ONLY).not.toMatch(/regular|483|sessions|high court/i);
    expect(ANUSHKA_FACTS_ONLY).toContain('magistrate refused bail');
    expect(ids(ANUSHKA_FACTS_ONLY)).toEqual(['bail_regular']);
  });

  it('truncated twice: needs_choice with bail_regular first', async () => {
    scriptModel({ text: TRUNCATED, stop: 'max_tokens' }, { text: TRUNCATED, stop: 'max_tokens' });
    const res = await post({ description: ANUSHKA_FACTS_ONLY });
    expect(res.body.outcome).toBe('needs_choice');
    expect(kinds(res)[0]).toBe('bail_regular');
    expect(matchCalls()).toHaveLength(2);
  });

  it('off-list twice: needs_choice with bail_regular first', async () => {
    const offList = answer('regular_bail_483', 'high');
    scriptModel(offList, offList);
    const res = await post({ description: ANUSHKA_FACTS_ONLY });
    expect(res.body.outcome).toBe('needs_choice');
    expect(kinds(res)[0]).toBe('bail_regular');
    expect(matchCalls()).toHaveLength(2);
  });

  it('a good bail_regular high: matched', async () => {
    scriptModel(MATCH_HIGH);
    const res = await post({ description: ANUSHKA_FACTS_ONLY });
    expect(res.body.outcome).toBe('brief');
    expect(res.body.brief.kind).toMatchObject({ id: 'bail_regular' });
  });
});

// ── T5 pair fallback (Ajay F2/F2a/F2b) ──────────────────────────────────────
// Both the anticipatory and the regular phrase sets match, and the model fails
// twice: exactly two cards (bail_regular, bail_anticipatory), `unranked: true`.
// The bail guard reorders on the arrest cue. "438 crpc" with the word bail is
// an anticipatory phrase that is not an arrest cue, so each cue can be set alone.

const T5_ARRESTED =
  'Client was arrested on 3 Oct 2026 and is in judicial custody. Please prepare a regular bail ' +
  'application. The old file also mentions s.438 CrPC bail.';
const T5_EXPECTS =
  'Client has not been arrested but apprehends arrest in a cheating case. Unsure whether to file ' +
  'regular bail or anticipatory bail.';
const T5_BOTH =
  'Client was arrested in one FIR but apprehends arrest in another FIR. Needs regular bail and ' +
  'also s.438 CrPC bail.';
const T5_NONE =
  'Client needs regular bail. The old file also mentions s.438 CrPC bail. Nothing else is known.';
const T5_WITH_INTERIM = `${T5_ARRESTED} Also interim bail until the hearing.`;

const OFF_LIST = answer('regular_bail_483', 'high');
const MALFORMED_TWICE: Step[] = [
  { text: TRUNCATED, stop: 'max_tokens' },
  { text: TRUNCATED, stop: 'max_tokens' },
];

describe('T-610 T5 pair fallback: the fixtures', () => {
  it.each([
    ['arrested', T5_ARRESTED],
    ['expects', T5_EXPECTS],
    ['both', T5_BOTH],
    ['none', T5_NONE],
    ['with interim', T5_WITH_INTERIM],
  ])('%s: T5 removes both bail ids and keeps the pair', (_n, text) => {
    const m = matchKeywords(text);
    expect(m.t5Pair).toEqual(['bail_regular', 'bail_anticipatory']);
    expect(m.candidates.map((c) => c.templateId)).not.toContain('bail_regular');
    expect(m.candidates.map((c) => c.templateId)).not.toContain('bail_anticipatory');
  });
});

describe('T-610 T5 pair + the model fails twice', () => {
  const FAILURES: Array<[string, Step[]]> = [
    ['truncated', MALFORMED_TWICE],
    ['off-list', [{ text: OFF_LIST }, { text: OFF_LIST }]],
    ['malformed then off-list', [{ text: TRUNCATED, stop: 'max_tokens' }, { text: OFF_LIST }]],
  ];

  describe.each(FAILURES)('%s', (_n, steps) => {
    it.each([
      ['arrested cue', T5_ARRESTED, ['bail_regular', 'bail_anticipatory']],
      ['expects-arrest cue', T5_EXPECTS, ['bail_anticipatory', 'bail_regular']],
      ['both cues', T5_BOTH, ['bail_regular', 'bail_anticipatory']],
      ['no cue', T5_NONE, ['bail_regular', 'bail_anticipatory']],
    ])('%s: exactly the two cards in the guard order, unranked', async (_c, text, expected) => {
      scriptModel(...steps);
      const res = await post({ description: text });
      expect(res.status).toBe(200);
      expect(res.body.outcome).toBe('needs_choice');
      expect(kinds(res)).toEqual(expected);
      expect(res.body.unranked).toBe(true);
      expect(res.body.brief).toBeUndefined();
      expect(matchCalls()).toHaveLength(2);
    });
  });

  it('is not cached: a second identical request makes new MATCH calls', async () => {
    scriptModel(...MALFORMED_TWICE, ...MALFORMED_TWICE);
    const first = await post({ description: T5_ARRESTED });
    expect(first.body.unranked).toBe(true);
    expect(matchCalls()).toHaveLength(2);
    const second = await post({ description: T5_ARRESTED });
    expect(second.body.outcome).toBe('needs_choice');
    expect(second.body.unranked).toBe(true);
    expect(matchCalls()).toHaveLength(4);
  });

  it('spends no Ink', async () => {
    await createVerifiedUser({
      _id: USER_ID,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: 2000,
    });
    scriptModel(...MALFORMED_TWICE);
    const res = await post({ description: T5_ARRESTED });
    expect(res.body.unranked).toBe(true);
    const user = await User.findById(USER_ID).lean();
    expect(user!.inkTopup).toBe(2000);
  });

  it('is never no_match and always exactly two cards, even when interim bail also matches', async () => {
    expect(ids(T5_WITH_INTERIM)).toContain('interim_bail');
    for (const text of [T5_WITH_INTERIM, `${T5_EXPECTS} Also interim bail until the hearing.`]) {
      await redis.flushall();
      scriptModel(...MALFORMED_TWICE);
      const res = await post({ description: text });
      expect(res.body.outcome).toBe('needs_choice');
      expect(res.body.choices).toHaveLength(2);
      expect(kinds(res).sort()).toEqual(['bail_anticipatory', 'bail_regular']);
      expect(kinds(res)).not.toContain('interim_bail');
      expect(res.body.unranked).toBe(true);
    }
  });
});

describe('T-610 T5 pair + a good model answer: the model decides, no unranked key', () => {
  it('a good first answer (matched)', async () => {
    scriptModel(MATCH_HIGH);
    const res = await post({ description: T5_ARRESTED });
    expect(res.body.outcome).toBe('brief');
    expect(res.body.brief.kind).toMatchObject({ id: 'bail_regular' });
    expect(res.body).not.toHaveProperty('unranked');
    expect(matchCalls()).toHaveLength(1);
  });

  it('a good answer on the retry (matched)', async () => {
    scriptModel({ text: TRUNCATED, stop: 'max_tokens' }, MATCH_HIGH);
    const res = await post({ description: T5_ARRESTED });
    expect(res.body.outcome).toBe('brief');
    expect(res.body.brief.kind).toMatchObject({ id: 'bail_regular' });
    expect(res.body).not.toHaveProperty('unranked');
    expect(matchCalls()).toHaveLength(2);
  });

  it('a good medium answer (its own pick, not the T5 pair)', async () => {
    scriptModel(answer('bail_regular', 'medium', { alternatives: ['bail_before_magistrate'] }));
    const res = await post({ description: T5_NONE });
    expect(res.body.outcome).toBe('needs_choice');
    expect(kinds(res)[0]).toBe('bail_regular');
    expect(kinds(res)).toContain('bail_before_magistrate');
    expect(res.body).not.toHaveProperty('unranked');
  });
});

describe('T-610 every other needs_choice has no unranked key', () => {
  it('a medium answer', async () => {
    scriptModel(answer('bail_regular', 'medium', { alternatives: ['bail_before_magistrate'] }));
    const res = await post({ description: ONE_LINER });
    expect(res.body.outcome).toBe('needs_choice');
    expect(res.body).not.toHaveProperty('unranked');
  });

  it('a keyword fallback after two failures (no T5 pair)', async () => {
    for (const text of [ONE_LINER, LONG_MATTER, ANUSHKA_FACTS_ONLY]) {
      await redis.flushall();
      scriptModel(...MALFORMED_TWICE);
      const res = await post({ description: text });
      expect(res.body.outcome).toBe('needs_choice');
      expect(res.body).not.toHaveProperty('unranked');
    }
  });

  it('a not-legal answer with keyword hits', async () => {
    scriptModel(answer(null, 'low', { is_legal_drafting: false }));
    const res = await post({ description: ONE_LINER });
    expect(res.body.outcome).toBe('needs_choice');
    expect(res.body).not.toHaveProperty('unranked');
  });
});

describe('T-610 one of the two ids not allowed: no pair', () => {
  const BOTH_IDS = new Set(['bail_regular', 'bail_anticipatory', 'interim_bail']);

  it('matchKeywords: the pair is set only when both are found and allowed', () => {
    expect(matchKeywords(T5_ARRESTED, BOTH_IDS).t5Pair).toEqual([
      'bail_regular',
      'bail_anticipatory',
    ]);
    expect(matchKeywords(T5_ARRESTED).t5Pair).toEqual(['bail_regular', 'bail_anticipatory']);
    expect(matchKeywords(T5_ARRESTED, new Set(['bail_regular', 'interim_bail'])).t5Pair).toBeNull();
    expect(
      matchKeywords(T5_ARRESTED, new Set(['bail_anticipatory', 'interim_bail'])).t5Pair,
    ).toBeNull();
    expect(matchKeywords(T5_ARRESTED, new Set()).t5Pair).toBeNull();
    // only one of the two found
    expect(matchKeywords(ONE_LINER, BOTH_IDS).t5Pair).toBeNull();
    expect(matchKeywords('anticipatory bail for my client', BOTH_IDS).t5Pair).toBeNull();
    expect(matchKeywords('gibberish with no bail words at all', BOTH_IDS).t5Pair).toBeNull();
  });

  it('matchKeywords candidates equal rankKeywordCandidates', () => {
    for (const text of [T5_ARRESTED, T5_WITH_INTERIM, ONE_LINER, LONG_MATTER, ANUSHKA_FACTS_ONLY]) {
      for (const allowed of [undefined, BOTH_IDS]) {
        expect(matchKeywords(text, allowed).candidates).toEqual(
          rankKeywordCandidates(text, allowed),
        );
      }
    }
  });

  it('decideFromAnswer: no pair, a failed answer gives the earlier keyword pick or no_match', () => {
    const allowed = new Set(['bail_regular', 'interim_bail']);
    const failed = readMatchAnswer(null, allowed);
    const m = matchKeywords(T5_WITH_INTERIM, allowed);
    expect(m.t5Pair).toBeNull();
    const ids2 = m.candidates.map((c) => c.templateId);
    const pick = decideFromAnswer(failed, ids2, m.t5Pair);
    expect(pick).toMatchObject({ kind: 'needs_choice', choices: ['interim_bail'] });
    expect(pick.t5Fallback).toBeUndefined();
    const none = decideFromAnswer(failed, [], matchKeywords(T5_ARRESTED, allowed).t5Pair);
    expect(none.kind).toBe('no_match');
    expect(none.t5Fallback).toBeUndefined();
  });

  it('decideFromAnswer: with the pair, a failed answer is exactly the two cards, flagged', () => {
    const failed = readMatchAnswer(null, new Set(['bail_regular', 'bail_anticipatory']));
    const d = decideFromAnswer(failed, ['interim_bail'], ['bail_regular', 'bail_anticipatory']);
    expect(d).toMatchObject({
      kind: 'needs_choice',
      choices: ['bail_regular', 'bail_anticipatory'],
      t5Fallback: true,
    });
    // a good answer ignores the pair
    const good = readMatchAnswer(JSON.parse(MATCH_HIGH), new Set(['bail_regular']));
    const g = decideFromAnswer(good, [], ['bail_regular', 'bail_anticipatory']);
    expect(g).toMatchObject({ kind: 'matched', templateId: 'bail_regular' });
    expect(g.t5Fallback).toBeUndefined();
  });
});

describe('T-610 the log line has t5Fallback and no description text', () => {
  async function runLogged(text: string, ...steps: Array<string | Step>) {
    const logs: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error'] as const) {
      jest
        .spyOn(console, m)
        .mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(' ')));
    }
    scriptModel(...steps);
    await post({ description: text });
    return logs;
  }

  it('t5Fallback=true on the pair, and none of the description in any log', async () => {
    const logs = await runLogged(T5_ARRESTED, ...MALFORMED_TWICE);
    const line = logs.find((l) => l.includes('[intake] match decided'));
    expect(line).toContain('t5Fallback=true');
    expect(line).toContain('outcome=needs_choice');
    expect(logs.join('\n')).not.toMatch(/judicial custody|3 Oct 2026|old file/);
  });

  it('t5Fallback=false otherwise', async () => {
    const matched = await runLogged(T5_ARRESTED, MATCH_HIGH);
    expect(matched.find((l) => l.includes('[intake] match decided'))).toContain('t5Fallback=false');
    jest.restoreAllMocks();
    await redis.flushall();
    const pick = await runLogged(ONE_LINER, ...MALFORMED_TWICE);
    expect(pick.find((l) => l.includes('[intake] match decided'))).toContain('t5Fallback=false');
  });
});

describe('T-610 F3: bailable / non-bailable count as the bail word for rule 3', () => {
  it.each([
    'bailable offence under section 483 BNSS',
    'non-bailable offence under section 483 BNSS',
    'Non-Bailable offence, u/s 483 BNSS',
    'जमानती अपराध, 483 BNSS',
    'गैर-जमानती अपराध, 483 BNSS',
    'गैर-ज़मानती अपराध, 483 BNSS',
  ])('%s: the section phrase scores bail_regular', (text) => {
    expect(ids(text)[0]).toBe('bail_regular');
  });

  it('a section number with none of those words still scores nothing', () => {
    expect(ids('offence under section 483 BNSS')).toEqual([]);
    expect(ids('अपराध 483 BNSS')).toEqual([]);
  });
});

// ── T610-E1 (Ajay, ca507e9b): T5 pair + is_legal_drafting false = the F2 fallback ──

describe('T-610 E1: T5 pair + the model says not legal drafting', () => {
  const NOT_LEGAL = answer(null, 'low', { is_legal_drafting: false });
  const PAIR = ['bail_regular', 'bail_anticipatory'];

  it.each([
    ['arrested cue', T5_ARRESTED, PAIR],
    ['expects-arrest cue', T5_EXPECTS, ['bail_anticipatory', 'bail_regular']],
    ['both cues', T5_BOTH, PAIR],
    ['no cue', T5_NONE, PAIR],
    ['arrested cue with interim bail also matching', T5_WITH_INTERIM, PAIR],
    [
      'expects cue with interim bail also matching',
      `${T5_EXPECTS} Also interim bail until the hearing.`,
      ['bail_anticipatory', 'bail_regular'],
    ],
  ])('%s: exactly the two cards in the guard order, unranked', async (_c, text, expected) => {
    scriptModel(NOT_LEGAL);
    const res = await post({ description: text });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('needs_choice');
    expect(kinds(res)).toEqual(expected);
    expect(res.body.choices).toHaveLength(2);
    expect(res.body.unranked).toBe(true);
    expect(res.body.brief).toBeUndefined();
  });

  it('makes exactly one MATCH call (no retry)', async () => {
    scriptModel(NOT_LEGAL);
    const res = await post({ description: T5_ARRESTED });
    expect(res.body.unranked).toBe(true);
    expect(matchCalls()).toHaveLength(1);
  });

  it('is not cached: a second identical request makes a new MATCH call', async () => {
    scriptModel(NOT_LEGAL, NOT_LEGAL);
    const first = await post({ description: T5_ARRESTED });
    expect(first.body.unranked).toBe(true);
    expect(matchCalls()).toHaveLength(1);
    const second = await post({ description: T5_ARRESTED });
    expect(second.body.outcome).toBe('needs_choice');
    expect(second.body.unranked).toBe(true);
    expect(matchCalls()).toHaveLength(2);
  });

  it('spends no Ink', async () => {
    await createVerifiedUser({
      _id: USER_ID,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: 2000,
    });
    scriptModel(NOT_LEGAL);
    const res = await post({ description: T5_ARRESTED });
    expect(res.body.unranked).toBe(true);
    const user = await User.findById(USER_ID).lean();
    expect(user!.inkTopup).toBe(2000);
  });

  it('records no demand.no_match event', async () => {
    scriptModel(NOT_LEGAL);
    const res = await post({ description: T5_ARRESTED });
    expect(res.body.unranked).toBe(true);
    expect(await Event.countDocuments({ type: 'demand.no_match' })).toBe(0);
  });

  it('only one phrase set (regular bail): the keyword pick, no unranked key', async () => {
    expect(matchKeywords(ONE_LINER).t5Pair).toBeNull();
    scriptModel(NOT_LEGAL);
    const res = await post({ description: ONE_LINER });
    expect(res.body.outcome).toBe('needs_choice');
    expect(kinds(res)).toEqual(ids(ONE_LINER).slice(0, kinds(res).length));
    expect(kinds(res)).toContain('bail_regular');
    expect(res.body).not.toHaveProperty('unranked');
    expect(matchCalls()).toHaveLength(1);
  });

  it('only one phrase set (anticipatory bail): the keyword pick, no unranked key', async () => {
    const text = 'anticipatory bail for my client, he fears arrest in a cheating case';
    expect(matchKeywords(text).t5Pair).toBeNull();
    scriptModel(NOT_LEGAL);
    const res = await post({ description: text });
    expect(res.body.outcome).toBe('needs_choice');
    expect(kinds(res)).toContain('bail_anticipatory');
    expect(res.body).not.toHaveProperty('unranked');
  });

  it('gibberish (no keywords) is still no_match', async () => {
    scriptModel(NOT_LEGAL);
    const res = await post({ description: GIBBERISH });
    expect(res.body.outcome).toBe('no_match');
    expect(res.body).not.toHaveProperty('unranked');
    expect(matchCalls()).toHaveLength(1);
  });

  it('decideFromAnswer: not legal + pair is exactly the two cards, flagged', () => {
    const notLegal = readMatchAnswer(JSON.parse(NOT_LEGAL), new Set(PAIR));
    const d = decideFromAnswer(notLegal, ['interim_bail'], ['bail_regular', 'bail_anticipatory']);
    expect(d).toMatchObject({ kind: 'needs_choice', choices: PAIR, t5Fallback: true });
  });

  it('decideFromAnswer: not legal + pair ids not allowed (no pair) is the keyword pick or no_match', () => {
    const allowed = new Set(['bail_regular', 'interim_bail']);
    const notLegal = readMatchAnswer(JSON.parse(NOT_LEGAL), allowed);
    const m = matchKeywords(T5_WITH_INTERIM, allowed);
    expect(m.t5Pair).toBeNull();
    const pick = decideFromAnswer(
      notLegal,
      m.candidates.map((c) => c.templateId),
      m.t5Pair,
    );
    expect(pick).toMatchObject({ kind: 'needs_choice', choices: ['interim_bail'] });
    expect(pick.t5Fallback).toBeUndefined();
    const none = decideFromAnswer(notLegal, [], m.t5Pair);
    expect(none.kind).toBe('no_match');
    expect(none.t5Fallback).toBeUndefined();
  });
});
