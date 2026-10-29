/**
 * T-683 phase 2: the v3 Extractor on the intake paths (/intake/brief and
 * /intake/brief/update). The Anthropic SDK is stubbed (v2 calls) and
 * extractTurn is mocked (no v3 model call, ever). In-memory Mongo.
 */
import '../setupDb';
import request from 'supertest';

const mockStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  require('../sdkStream').sdkModuleStub((...a: unknown[]) => mockStream(...a)),
);
const mockExtractTurn = jest.fn();
jest.mock('../../services/v3/extractor.service', () => ({
  ...jest.requireActual('../../services/v3/extractor.service'),
  extractTurn: (...a: unknown[]) => mockExtractTurn(...a),
}));

import app from '../../app';
import redis from '../../config/redis';
import { AppSetting } from '../../models/AppSetting.model';
import { LlmAuxCall } from '../../models/LlmAuxCall.model';
import * as credits from '../../services/credits.service';
import { _clearAppSettingsCache } from '../../services/app-settings.service';
import { buildChecklist } from '../../services/intake-brief';
import { loadRulePack } from '../../services/rule-pack.service';
import { _clearV3StageCache } from '../../services/v3/stage';
import { validateExtraction } from '../../services/v3/validate';
import type { ExtractResult } from '../../services/v3/types';
import { sdkAnswer } from '../sdkStream';
import { seedVerifiedUsers } from '../verifiedUser';

const SECRET = process.env.INTERNAL_SECRET!;
const USER = '507f1f77bcf86cd799439091';
const INTAKE = '66666666-6666-4666-8666-666666666666';
const DESC =
  'Regular bail application for Sample Person 1 in FIR No. 55/2026. Arrested on 05.03.2026.';
const EMPTY_READ = JSON.stringify({ outcome: 'read', read: [], conflicts: [], questions: [] });
const V2_EXTRACT = JSON.stringify({
  facts: [{ key: 'fir_number', span: '55/2026', confidence: 0.99 }],
});

const headers = () => ({
  'x-internal-secret': SECRET,
  'x-user-id': USER,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

const cand = (
  key: string,
  value: string | string[] | number,
  type: 'text' | 'date' | 'money' | 'name' | 'choice' | 'list',
  quote: string,
  kind: 'description' | 'answer' = 'description',
  turn = 0,
) => ({ key, value, type, source: { kind, turn, quote }, confidence: 0.97 });

const result = (over: Partial<ExtractResult> = {}): ExtractResult => ({
  candidates: [],
  conflicts: [],
  nonAnswers: [],
  unresolved: [],
  ...over,
});

/**
 * A result built the way production builds it: through validateExtraction, so
 * every candidate carries its provenance tag (Arjun 9a). No test-only hook.
 */
interface ModelFact {
  key: string;
  value: unknown;
  quote: string;
  source?: 'description' | 'answer';
  turn?: number;
  confidence?: number;
}
function viaValidate(
  facts: ModelFact[],
  opts: {
    description?: string;
    answers?: Array<{ turn: number; askedKeys: string[]; text: string }>;
    non_answers?: Array<{ key: string; quote: string; turn: number }>;
    unresolved?: string[];
  } = {},
): ExtractResult {
  const out = validateExtraction(
    {
      facts: facts.map((f) => ({
        key: f.key,
        source: f.source ?? 'description',
        turn: f.turn ?? 0,
        quote: f.quote,
        value: f.value,
        confidence: f.confidence ?? 0.97,
      })),
      non_answers: (opts.non_answers ?? []).map((n) => ({ ...n, source: 'answer' })),
      unresolved: opts.unresolved ?? [],
    },
    {
      checklist: buildChecklist(loadRulePack('bail_regular')!),
      description: opts.description ?? DESC,
      answers: opts.answers ?? [],
      today: '2026-10-29',
    },
  );
  return out.result;
}
const answerOf = (turn: number, key: string, text: string) => ({ turn, askedKeys: [key], text });

const okOutcome = (r: ExtractResult) => ({
  status: 'ok' as const,
  result: r,
  dropped: {},
  usage: {
    model: 'claude-extractor-test',
    effort: 'medium' as const,
    usage: {
      inputTokens: 900,
      outputTokens: 80,
      usageSource: 'provider' as const,
      transport: 'direct' as const,
    },
    durationMs: 120,
    status: 'completed' as const,
  },
});

async function setStage(v: string | null) {
  await AppSetting.deleteOne({ key: 'feature.drafting_v3_stage' });
  if (v !== null) await AppSetting.create({ key: 'feature.drafting_v3_stage', value: v });
  _clearAppSettingsCache();
  _clearV3StageCache();
}

/** The v2 calls of a describe: Reception, then the extraction. */
function mockV2Describe() {
  mockStream.mockReset();
  mockStream
    .mockResolvedValueOnce(sdkAnswer(EMPTY_READ, 900, 120))
    .mockResolvedValueOnce(sdkAnswer(V2_EXTRACT, 900, 120));
}

function describe_(intakeId = INTAKE) {
  return request(app)
    .post('/intake/brief')
    .set(headers())
    .send({ description: DESC, intake_id: intakeId, kind: 'bail_regular' });
}
function update_(ledgerId: string, edits: Array<{ key: string; text: string }>) {
  return request(app)
    .post('/intake/brief/update')
    .set(headers())
    .send({
      kind: 'bail_regular',
      ledger_id: ledgerId,
      description: DESC,
      values: [],
      ledger_edits: edits.map((e) => ({ ...e, from_question: true })),
    });
}

/** Ids, timestamps and the user-agnostic noise stripped, for a deep comparison. */
function normal(body: Record<string, unknown>): unknown {
  return JSON.parse(
    JSON.stringify(body)
      .replace(/[0-9a-f]{24}/g, 'ID')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'UUID')
      .replace(/"(created|updated)At":"[^"]*"/g, '"$1At":"T"'),
  );
}

seedVerifiedUsers(USER);

beforeEach(async () => {
  mockStream.mockReset();
  mockExtractTurn.mockReset();
  await redis.flushall();
  await AppSetting.create({ key: 'ai.intake_model', value: 'claude-haiku-4-5-20251001' });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
  _clearAppSettingsCache();
  _clearV3StageCache();
});
afterEach(() => jest.restoreAllMocks());

describe('stage 0 (and no setting): v2 unchanged, no v3_extract call', () => {
  it.each([null, '0', 'garbage'])(
    'setting %p: no extractor call, two v2 calls, no v3 row',
    async (v) => {
      await setStage(v);
      mockV2Describe();
      const res = await describe_();
      expect(res.status).toBe(200);
      expect(res.body.outcome).toBe('brief');
      expect(mockExtractTurn).not.toHaveBeenCalled();
      expect(mockStream).toHaveBeenCalledTimes(2);
      const rows = await LlmAuxCall.find({ intakeId: INTAKE }).lean();
      expect(rows.map((r) => r.purpose)).not.toContain('v3_extract');
    },
  );

  it('the brief and the ledger equal the same call with the v3 code mocked out', async () => {
    // A: stage 0 by setting. B: the stage reader replaced by a constant 0 and the extractor throwing.
    await setStage('0');
    mockV2Describe();
    const a = await describe_('77777777-7777-4777-8777-777777777771');
    const stage = await import('../../services/v3/stage');
    jest.spyOn(stage, 'v3Stage').mockResolvedValue(0);
    mockExtractTurn.mockImplementation(() => {
      throw new Error('v3 must not run');
    });
    mockV2Describe();
    const b = await describe_('77777777-7777-4777-8777-777777777772');
    expect(a.status).toBe(200);
    expect(normal(a.body.brief)).toEqual(normal(b.body.brief));
    expect(normal(a.body.ledger.facts)).toEqual(normal(b.body.ledger.facts));
    expect(mockExtractTurn).not.toHaveBeenCalled();
  });

  it('updateLedger at stage 0 makes no extractor call and writes the edits exactly as sent', async () => {
    await setStage('0');
    mockV2Describe();
    const d = await describe_();
    const res = await update_(d.body.ledger.ledger_id, [{ key: 'named_in_fir', text: 'नहीं' }]);
    expect(res.status).toBe(200);
    expect(mockExtractTurn).not.toHaveBeenCalled();
    // v2 cannot read नहीं for a Yes / No / Not known choice: no version is written (stage 1 writes No).
    expect(
      res.body.ledger.facts.find((f: { key: string }) => f.key === 'named_in_fir'),
    ).toBeUndefined();
  });
});

describe('stage 1, ok: candidates reach the brief and the ledger, no second v2 extract call', () => {
  it('describe: one v2 call (Reception), the extractor once at turn 0, the ledger written from the candidates', async () => {
    await setStage('1');
    mockExtractTurn.mockResolvedValue(
      okOutcome(
        viaValidate([
          { key: 'fir_number', value: '55/2026', quote: 'FIR No. 55/2026' },
          { key: 'arrest_date', value: '2026-03-05', quote: 'Arrested on 05.03.2026' },
        ]),
      ),
    );
    mockStream.mockReset();
    mockStream.mockResolvedValueOnce(sdkAnswer(EMPTY_READ, 900, 120));
    const res = await describe_();
    expect(res.status).toBe(200);
    expect(mockExtractTurn).toHaveBeenCalledTimes(1);
    const arg = mockExtractTurn.mock.calls[0][0] as {
      turn: number;
      description: string;
      intakeId: string;
    };
    expect(arg.turn).toBe(0);
    expect(arg.description).toBe(DESC);
    // Reception only: the v2 intake_extract call is not made.
    expect(mockStream).toHaveBeenCalledTimes(1);
    const keys = res.body.ledger.facts.map((f: { key: string }) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['fir_number', 'arrest_date']));
    const items = JSON.stringify(res.body.brief);
    expect(items).toContain('55/2026');
    // The LlmAuxCall row for the call, purpose v3_extract, from the outcome's usage.
    const rows = await LlmAuxCall.find({ intakeId: INTAKE }).lean();
    expect(rows.map((r) => r.purpose)).toContain('v3_extract');
    expect(rows.map((r) => r.purpose)).not.toContain('intake_extract');
  });

  it('a key with a non-answer, a conflict or unresolved gets no read, and is asked again', async () => {
    await setStage('1');
    mockExtractTurn.mockResolvedValue(
      okOutcome({
        ...viaValidate([{ key: 'fir_number', value: '55/2026', quote: 'FIR No. 55/2026' }]),
        unresolved: ['arrest_date'],
        nonAnswers: [{ key: 'police_station', quote: 'Not known' }],
      }),
    );
    mockStream.mockReset();
    mockStream.mockResolvedValueOnce(sdkAnswer(EMPTY_READ, 900, 120));
    const res = await describe_();
    const keys = res.body.ledger.facts.map((f: { key: string }) => f.key);
    expect(keys).toContain('fir_number');
    expect(keys).not.toContain('arrest_date');
    expect(keys).not.toContain('police_station');
  });
});

describe('stage 1, degraded: the v2 path runs', () => {
  it.each(['timeout', 'model_unset', 'user_cap', 'bad_json'])(
    '%s: v2 extraction is called, v3 never reaches the ledger',
    async (reason) => {
      await setStage('1');
      mockExtractTurn.mockResolvedValue({ status: 'degraded', reason });
      mockV2Describe();
      const res = await describe_();
      expect(res.status).toBe(200);
      expect(mockStream).toHaveBeenCalledTimes(2);
      const keys = res.body.ledger.facts.map((f: { key: string }) => f.key);
      expect(keys).toEqual(['fir_number']);
      const rows = await LlmAuxCall.find({ intakeId: INTAKE }).lean();
      expect(rows.map((r) => r.purpose)).toContain('intake_extract');
    },
  );

  it('an extractor that throws also falls back to v2', async () => {
    await setStage('1');
    mockExtractTurn.mockRejectedValue(new Error('boom'));
    mockV2Describe();
    const res = await describe_();
    expect(res.body.outcome).toBe('brief');
    expect(mockStream).toHaveBeenCalledTimes(2);
  });

  it('a degraded outcome with usage still writes its v3_extract row; the brief is v2', async () => {
    await setStage('1');
    const o = okOutcome(result());
    mockExtractTurn.mockResolvedValue({
      status: 'degraded',
      reason: 'timeout',
      usage: { ...o.usage, status: 'failed' },
    });
    mockV2Describe();
    await describe_();
    const rows = await LlmAuxCall.find({ intakeId: INTAKE }).lean();
    const v3 = rows.filter((r) => r.purpose === 'v3_extract');
    expect(v3).toHaveLength(1);
    expect(v3[0].status).toBe('failed');
  });
});

describe('the updateLedger turn (stage 1)', () => {
  async function startLedger() {
    await setStage('1');
    mockExtractTurn.mockResolvedValueOnce(okOutcome(result()));
    mockStream.mockReset();
    mockStream.mockResolvedValueOnce(sdkAnswer(EMPTY_READ, 900, 120));
    const d = await describe_();
    expect(d.status).toBe(200);
    mockExtractTurn.mockReset();
    return d.body.ledger.ledger_id as string;
  }
  const valueOf = (
    res: { body: { ledger: { facts: Array<Record<string, unknown>> } } },
    key: string,
  ) => res.body.ledger.facts.find((f) => f.key === key);

  it('नहीं is written as No; the extractor gets each edit as an answer for its own key', async () => {
    const ledgerId = await startLedger();
    mockExtractTurn.mockResolvedValue(
      okOutcome(
        viaValidate(
          [{ key: 'named_in_fir', value: 'No', quote: 'नहीं', source: 'answer', turn: 1 }],
          { description: '', answers: [answerOf(1, 'named_in_fir', 'नहीं')] },
        ),
      ),
    );
    const res = await update_(ledgerId, [{ key: 'named_in_fir', text: 'नहीं' }]);
    expect(res.status).toBe(200);
    expect(mockExtractTurn).toHaveBeenCalledTimes(1);
    const arg = mockExtractTurn.mock.calls[0][0] as {
      turn: number;
      description: string;
      answers: Array<{ turn: number; askedKeys: string[]; text: string }>;
    };
    expect(arg.answers).toEqual([{ turn: 1, askedKeys: ['named_in_fir'], text: 'नहीं' }]);
    expect(arg.turn).toBeGreaterThanOrEqual(1);
    // The description is not stored, so it is not sent on an update.
    expect(arg.description).toBe('');
    const f = valueOf(res, 'named_in_fir');
    expect(JSON.stringify(f)).toContain('No');
    expect(JSON.stringify(f)).not.toContain('नहीं"}');
  });

  it('a Hindi station answer is written as the cleaned value, not as typed', async () => {
    const ledgerId = await startLedger();
    mockExtractTurn.mockResolvedValue(
      okOutcome(
        viaValidate(
          [
            {
              key: 'police_station',
              value: 'Govindpura',
              quote: 'थाना Govindpura',
              source: 'answer',
              turn: 1,
            },
          ],
          { description: '', answers: [answerOf(1, 'police_station', 'थाना Govindpura')] },
        ),
      ),
    );
    const res = await update_(ledgerId, [{ key: 'police_station', text: 'थाना Govindpura' }]);
    const f = valueOf(res, 'police_station');
    expect(JSON.stringify(f)).toContain('Govindpura');
    expect(JSON.stringify(f)).not.toContain('थाना');
  });

  it('an unreadable answer is written as typed', async () => {
    const ledgerId = await startLedger();
    mockExtractTurn.mockResolvedValue(okOutcome(result({ unresolved: ['applicant_occupation'] })));
    const res = await update_(ledgerId, [
      { key: 'applicant_occupation', text: 'kuch kaam karta hai' },
    ]);
    expect(res.status).toBe(200);
    expect(JSON.stringify(valueOf(res, 'applicant_occupation'))).toContain('kuch kaam karta hai');
  });

  // ── Arjun 9a: only verbatim or signed-rule values are written ─────────────
  const upd = async (key: string, text: string, value: unknown) => {
    const ledgerId = await startLedger();
    mockExtractTurn.mockResolvedValue(
      okOutcome(
        viaValidate([{ key, value, quote: text, source: 'answer', turn: 1 }], {
          description: '',
          answers: [answerOf(1, key, text)],
        }),
      ),
    );
    return update_(ledgerId, [{ key, text }]);
  };

  it('9a: a date in words is written, read by the v2 normaliser', async () => {
    const res = await upd('arrest_date', '5 March 2026', '2026-03-05');
    expect(res.status).toBe(200);
    expect(JSON.stringify(valueOf(res, 'arrest_date'))).toContain('5 March 2026');
  });

  it('9a: a station needing transliteration (थाना कोतवाली -> Thana Kotwali) is held: nothing written, no raw words', async () => {
    const res = await upd('police_station', 'थाना कोतवाली', 'Thana Kotwali');
    expect(res.status).toBe(200);
    expect(valueOf(res, 'police_station')).toBeUndefined();
    expect(JSON.stringify(res.body.ledger)).not.toContain('कोतवाली');
    expect(JSON.stringify(res.body.ledger)).not.toContain('Kotwali');
  });

  it('9a: model-rendered prose from Hinglish is held: nothing written, raw words never in the ledger', async () => {
    const res = await upd(
      'recovery_status',
      'Koi recovery nahi hui',
      'No recovery was made from the applicant.',
    );
    expect(res.status).toBe(200);
    expect(valueOf(res, 'recovery_status')).toBeUndefined();
    const all = JSON.stringify(res.body.ledger);
    expect(all).not.toContain('nahi hui');
    expect(all).not.toContain('No recovery was made');
  });

  it('9a: a v3 non-answer edit is an empty edit: no fact, "पता नहीं" never a value', async () => {
    const ledgerId = await startLedger();
    mockExtractTurn.mockResolvedValue(
      okOutcome(
        viaValidate([], {
          description: '',
          answers: [answerOf(1, 'police_station', 'पता नहीं')],
          non_answers: [{ key: 'police_station', quote: 'पता नहीं', turn: 1 }],
        }),
      ),
    );
    const res = await update_(ledgerId, [{ key: 'police_station', text: 'पता नहीं' }]);
    expect(res.status).toBe(200);
    expect(valueOf(res, 'police_station')).toBeUndefined();
    expect(JSON.stringify(res.body.ledger)).not.toContain('पता नहीं');
  });

  it('a degraded turn writes the edits as typed (v2)', async () => {
    const ledgerId = await startLedger();
    mockExtractTurn.mockResolvedValue({ status: 'degraded', reason: 'timeout' });
    const res = await update_(ledgerId, [{ key: 'applicant_occupation', text: 'Mason' }]);
    expect(res.status).toBe(200);
    expect(JSON.stringify(valueOf(res, 'applicant_occupation'))).toContain('Mason');
  });

  it('a candidate for a key the user did not edit is not written (T-685)', async () => {
    const ledgerId = await startLedger();
    mockExtractTurn.mockResolvedValue(
      okOutcome(
        result({
          candidates: [
            cand('applicant_occupation', 'Mason', 'text', 'Mason', 'answer', 1),
            cand('fir_number', '99/2026', 'text', 'Mason', 'answer', 1),
          ],
        }),
      ),
    );
    const res = await update_(ledgerId, [{ key: 'applicant_occupation', text: 'Mason' }]);
    expect(valueOf(res, 'fir_number')).toBeUndefined();
  });

  it('an empty edit makes no extractor call', async () => {
    const ledgerId = await startLedger();
    mockExtractTurn.mockResolvedValue(okOutcome(result()));
    await update_(ledgerId, [{ key: 'applicant_occupation', text: '   ' }]);
    expect(mockExtractTurn).not.toHaveBeenCalled();
  });
});

describe('no quota, no follow-up unit, no Ink for the v3 call', () => {
  it('a stage-1 describe spends exactly what a stage-0 describe spends: one burst unit, no follow-up', async () => {
    await setStage('0');
    mockV2Describe();
    await describe_('88888888-8888-4888-8888-888888888881');
    const burst0 = await redis.get(`intake:burst:${USER}`);
    const quota = async () =>
      (await redis.keys('intake:*'))
        .filter((k) => !k.startsWith('intake:cache:'))
        .map((k) => k.replace(/[0-9a-f-]{36}/, 'ID'))
        .sort();
    const keys0 = await quota();
    await redis.flushall();

    await setStage('1');
    mockExtractTurn.mockResolvedValue(
      okOutcome(result({ candidates: [cand('fir_number', '55/2026', 'text', 'FIR No. 55/2026')] })),
    );
    mockStream.mockReset();
    mockStream.mockResolvedValueOnce(sdkAnswer(EMPTY_READ, 900, 120));
    await describe_('88888888-8888-4888-8888-888888888882');
    const keys1 = await quota();
    expect(await redis.get(`intake:burst:${USER}`)).toBe(burst0);
    expect(keys1).toEqual(keys0);
    expect(await redis.keys('intake:followups:*')).toEqual([]);
  });

  it('updateLedger at stage 1 changes no intake quota key and takes no Ink', async () => {
    await setStage('1');
    mockExtractTurn.mockResolvedValueOnce(okOutcome(result()));
    mockStream.mockReset();
    mockStream.mockResolvedValueOnce(sdkAnswer(EMPTY_READ, 900, 120));
    const d = await describe_();
    const before = await Promise.all(
      (await redis.keys('*')).sort().map(async (k) => [k, await redis.get(k).catch(() => null)]),
    );
    const hold = jest.spyOn(credits, 'holdInk');
    mockExtractTurn.mockResolvedValue(
      okOutcome(
        viaValidate(
          [{ key: 'named_in_fir', value: 'No', quote: 'नहीं', source: 'answer', turn: 1 }],
          { description: '', answers: [answerOf(1, 'named_in_fir', 'नहीं')] },
        ),
      ),
    );
    const res = await update_(d.body.ledger.ledger_id, [{ key: 'named_in_fir', text: 'नहीं' }]);
    expect(res.status).toBe(200);
    const after = await Promise.all(
      (await redis.keys('*')).sort().map(async (k) => [k, await redis.get(k).catch(() => null)]),
    );
    expect(after).toEqual(before);
    expect(hold).not.toHaveBeenCalled();
    expect(await redis.keys('intake:followups:*')).toEqual([]);
  });
});

describe('police station per T-612 (6a) through the update turn (stage 1)', () => {
  it('"थाना Govindpura" (space only) stays "Thana Govindpura"; "Thana: Govindpura" becomes "Govindpura"', async () => {
    const { validateExtraction } = await import('../../services/v3/validate');
    const { buildChecklist } = await import('../../services/intake-brief');
    const { loadRulePack } = await import('../../services/rule-pack.service');
    const checklist = buildChecklist(loadRulePack('bail_regular')!);
    const run = (quote: string, value: string) =>
      validateExtraction(
        {
          facts: [
            { key: 'police_station', source: 'answer', turn: 1, quote, value, confidence: 0.97 },
          ],
        },
        {
          checklist,
          description: '',
          answers: [{ turn: 1, askedKeys: ['police_station'], text: quote }],
        },
      ).result.candidates[0]?.value;
    expect(run('थाना Govindpura', 'Thana Govindpura')).toBe('Thana Govindpura');
    expect(run('Thana: Govindpura', 'Thana: Govindpura')).toBe('Govindpura');
    expect(run('Govindpura Police Station', 'Govindpura Police Station')).toBe('Govindpura');
    expect(run('थाना कोतवाली', 'Thana Kotwali')).toBe('Thana Kotwali');
  });
});

// ── Review round 1 (a94b3733): the stale, wiped and held answers, through the routes ──

describe('round 1: a reused or in-flight turn runs v2 and writes nothing stale', () => {
  async function startLedger() {
    await setStage('1');
    mockExtractTurn.mockResolvedValueOnce(okOutcome(result()));
    mockStream.mockReset();
    mockStream.mockResolvedValueOnce(sdkAnswer(EMPTY_READ, 900, 120));
    const d = await describe_();
    expect(d.status).toBe(200);
    mockExtractTurn.mockReset();
    return d.body.ledger.ledger_id as string;
  }
  const fact = (
    res: { body: { ledger: { facts: Array<Record<string, unknown>> } } },
    key: string,
  ) => res.body.ledger.facts.find((f) => f.key === key);
  const oldNo = () =>
    viaValidate([{ key: 'named_in_fir', value: 'No', quote: 'नहीं', source: 'answer', turn: 1 }], {
      description: '',
      answers: [answerOf(1, 'named_in_fir', 'नहीं')],
    });

  it('update, reused: an old "No" never overwrites the new "haan"; the edit goes in as typed (v2)', async () => {
    const ledgerId = await startLedger();
    mockExtractTurn.mockResolvedValue({ status: 'reused', result: oldNo() });
    const res = await update_(ledgerId, [{ key: 'named_in_fir', text: 'haan' }]);
    expect(res.status).toBe(200);
    expect(mockExtractTurn).toHaveBeenCalledTimes(1);
    // The results line for the edit is not a "skipped" hold: v2 handled the edit as sent.
    expect(res.body.results?.[0]?.status ?? 'saved').not.toBe('skipped');
    expect(JSON.stringify(fact(res, 'named_in_fir') ?? {})).not.toContain('No');
  });

  it('update, reused, a text answer: the new words are written, not the reused reading', async () => {
    const ledgerId = await startLedger();
    mockExtractTurn.mockResolvedValue({
      status: 'reused',
      result: viaValidate(
        [
          {
            key: 'applicant_occupation',
            value: 'Mason',
            quote: 'Mason',
            source: 'answer',
            turn: 1,
          },
        ],
        { description: '', answers: [answerOf(1, 'applicant_occupation', 'Mason')] },
      ),
    });
    const res = await update_(ledgerId, [{ key: 'applicant_occupation', text: 'Welder' }]);
    const f = JSON.stringify(fact(res, 'applicant_occupation'));
    expect(f).toContain('Welder');
    expect(f).not.toContain('Mason');
  });

  it('update, ok but the candidate is an older reading (quote not in the edit): held, nothing written', async () => {
    const ledgerId = await startLedger();
    mockExtractTurn.mockResolvedValue(okOutcome(oldNo()));
    const res = await update_(ledgerId, [{ key: 'named_in_fir', text: 'haan' }]);
    expect(res.status).toBe(200);
    expect(fact(res, 'named_in_fir')).toBeUndefined();
  });

  it('describe, reused: the v2 extraction runs and the reused reading is not written', async () => {
    await setStage('1');
    mockExtractTurn.mockResolvedValue({
      status: 'reused',
      result: viaValidate([{ key: 'fir_number', value: '99/2026', quote: 'FIR No. 55/2026' }]),
    });
    mockV2Describe();
    const res = await describe_();
    expect(res.status).toBe(200);
    expect(mockStream).toHaveBeenCalledTimes(2);
    const f = JSON.stringify(
      res.body.ledger.facts.find((x: { key: string }) => x.key === 'fir_number'),
    );
    expect(f).toContain('55/2026');
    expect(f).not.toContain('99/2026');
  });

  it('update, in_flight (a second turn of the run): the edits go in as typed (v2), no hold', async () => {
    const ledgerId = await startLedger();
    mockExtractTurn.mockResolvedValue({ status: 'degraded', reason: 'in_flight' });
    const res = await update_(ledgerId, [{ key: 'applicant_occupation', text: 'Mason' }]);
    expect(res.status).toBe(200);
    expect(JSON.stringify(fact(res, 'applicant_occupation'))).toContain('Mason');
  });

  it('describe, in_flight: the v2 extraction runs', async () => {
    await setStage('1');
    mockExtractTurn.mockResolvedValue({ status: 'degraded', reason: 'in_flight' });
    mockV2Describe();
    const res = await describe_();
    expect(res.status).toBe(200);
    expect(mockStream).toHaveBeenCalledTimes(2);
    expect(res.body.ledger.facts.map((f: { key: string }) => f.key)).toEqual(['fir_number']);
  });
});

describe('round 1: a non-answer is the quote, and a partial one keeps the rest', () => {
  async function startLedger() {
    await setStage('1');
    mockExtractTurn.mockResolvedValueOnce(okOutcome(result()));
    mockStream.mockReset();
    mockStream.mockResolvedValueOnce(sdkAnswer(EMPTY_READ, 900, 120));
    const d = await describe_();
    mockExtractTurn.mockReset();
    return d.body.ledger.ledger_id as string;
  }
  const fact = (
    res: { body: { ledger: { facts: Array<Record<string, unknown>> } } },
    key: string,
  ) => res.body.ledger.facts.find((f) => f.key === key);

  it('update: quote "Rahul Sharma", value "Not known": the name is written as typed, not wiped', async () => {
    const ledgerId = await startLedger();
    mockExtractTurn.mockResolvedValue(
      okOutcome(
        viaValidate(
          [
            {
              key: 'applicant_name',
              value: 'Not known',
              quote: 'Rahul Sharma',
              source: 'answer',
              turn: 1,
            },
          ],
          { description: '', answers: [answerOf(1, 'applicant_name', 'Rahul Sharma')] },
        ),
      ),
    );
    const res = await update_(ledgerId, [{ key: 'applicant_name', text: 'Rahul Sharma' }]);
    expect(res.status).toBe(200);
    const f = JSON.stringify(fact(res, 'applicant_name'));
    expect(f).toContain('Rahul Sharma');
    expect(f).not.toContain('Not known');
  });

  it('describe: value "Not known" on a real name in the description: no "Not known" fact is written', async () => {
    await setStage('1');
    mockExtractTurn.mockResolvedValue(
      okOutcome(
        viaValidate([{ key: 'applicant_name', value: 'Not known', quote: 'Sample Person 1' }]),
      ),
    );
    mockStream.mockReset();
    mockStream.mockResolvedValueOnce(sdkAnswer(EMPTY_READ, 900, 120));
    const res = await describe_();
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body.ledger)).not.toContain('Not known');
  });

  it('update: "पता नहीं, Ramesh" with a partial non-answer and no candidate: held, key asked again, raw text never in the ledger', async () => {
    const ledgerId = await startLedger();
    const text = 'पता नहीं, Ramesh';
    mockExtractTurn.mockResolvedValue(
      okOutcome(
        viaValidate([], {
          description: '',
          answers: [answerOf(1, 'father_name', text)],
          non_answers: [{ key: 'father_name', quote: 'पता नहीं', turn: 1 }],
        }),
      ),
    );
    const res = await update_(ledgerId, [{ key: 'father_name', text }]);
    expect(res.status).toBe(200);
    expect(fact(res, 'father_name')).toBeUndefined();
    expect(JSON.stringify(res.body.ledger)).not.toContain('पता नहीं');
    expect(JSON.stringify(res.body.ledger)).not.toContain('Ramesh');
  });

  it.todo(
    'T-671 AJ-671-M1: "pata nahi sir" (Latin partial non-answer, trailing courtesy word) is held once T-671 adds the Latin forms and the courtesy-tail rule',
  );

  it('update: "पता नहीं, Ramesh" with a "Ramesh" candidate: the ledger holds exactly "Ramesh"', async () => {
    const ledgerId = await startLedger();
    const text = 'पता नहीं, Ramesh';
    mockExtractTurn.mockResolvedValue(
      okOutcome(
        viaValidate(
          [{ key: 'father_name', value: 'Ramesh', quote: 'Ramesh', source: 'answer', turn: 1 }],
          {
            description: '',
            answers: [answerOf(1, 'father_name', text)],
            non_answers: [{ key: 'father_name', quote: 'पता नहीं', turn: 1 }],
          },
        ),
      ),
    );
    const res = await update_(ledgerId, [{ key: 'father_name', text }]);
    expect(res.status).toBe(200);
    const f = fact(res, 'father_name') as Record<string, unknown>;
    expect(f).toBeDefined();
    expect(JSON.stringify(f)).toContain('Ramesh');
    expect(JSON.stringify(res.body.ledger)).not.toContain('पता नहीं');
  });
});

describe('round 1: raw Latin Hinglish is held, and brief and ledger agree on the user characters', () => {
  async function startLedger() {
    await setStage('1');
    mockExtractTurn.mockResolvedValueOnce(okOutcome(result()));
    mockStream.mockReset();
    mockStream.mockResolvedValueOnce(sdkAnswer(EMPTY_READ, 900, 120));
    const d = await describe_();
    mockExtractTurn.mockReset();
    return d.body.ledger.ledger_id as string;
  }

  it('update: a raw "Koi recovery nahi hui" value is held: nothing written, raw words not in the ledger', async () => {
    const ledgerId = await startLedger();
    const text = 'Koi recovery nahi hui';
    mockExtractTurn.mockResolvedValue(
      okOutcome(
        viaValidate(
          [{ key: 'recovery_status', value: text, quote: text, source: 'answer', turn: 1 }],
          {
            description: '',
            answers: [answerOf(1, 'recovery_status', text)],
          },
        ),
      ),
    );
    const res = await update_(ledgerId, [{ key: 'recovery_status', text }]);
    expect(res.status).toBe(200);
    expect(
      res.body.ledger.facts.find((f: { key: string }) => f.key === 'recovery_status'),
    ).toBeUndefined();
    expect(JSON.stringify(res.body.ledger)).not.toContain('nahi hui');
  });

  it('describe: the brief and the ledger carry the same text, in the user case (not the model case)', async () => {
    await setStage('1');
    mockExtractTurn.mockResolvedValue(
      okOutcome(
        viaValidate([
          { key: 'applicant_name', value: 'sample person 1', quote: 'Sample Person 1' },
        ]),
      ),
    );
    mockStream.mockReset();
    mockStream.mockResolvedValueOnce(sdkAnswer(EMPTY_READ, 900, 120));
    const res = await describe_();
    expect(res.status).toBe(200);
    const ledgerFact = JSON.stringify(
      res.body.ledger.facts.find((f: { key: string }) => f.key === 'applicant_name'),
    );
    expect(ledgerFact).toContain('Sample Person 1');
    expect(ledgerFact).not.toContain('sample person 1');
    const brief = JSON.stringify(res.body.brief);
    expect(brief).toContain('Sample Person 1');
    expect(brief).not.toContain('sample person 1');
  });
});
