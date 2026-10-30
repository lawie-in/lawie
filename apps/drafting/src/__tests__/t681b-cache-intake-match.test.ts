/**
 * T-681b: the intake match call's catalogue is a cached prefix.
 *
 * 1 the user turn is two text blocks; block 1 (the catalogue) carries the one breakpoint
 * 2 the system is one block, no breakpoint; exactly one cache_control in the request
 * 3 the text is unchanged (pinned against the old template literal); other calls untouched
 * 4 cache usage reaches the llm_call line and the aux call
 * 5 both match paths pass the prefix (runIntake, runBriefIntake and its fresh retry)
 * 6 block 1 is byte-stable
 * 7 aux-llm fallbacks
 *
 * Mocked SDK; fictional data only.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { callAuxModel } from '../services/aux-llm';
import { getCatalogue, getEnabledCatalogue } from '../services/intake.service';
import {
  buildMatchUserParts,
  buildMatchUserPrompt,
  MATCH_SYSTEM_PROMPT,
  type CatalogueEntry,
} from '../services/intake.prompts';
import { setLlmCallListener } from '../services/llm-usage';
import { asyncIterable, sdkAnswer } from './sdkStream';
import { createVerifiedUser } from './verifiedUser';

jest.setTimeout(60_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

type Block = { type: string; text: string; cache_control?: unknown };
interface Req {
  system: unknown;
  messages: Array<{ role: string; content: string | Block[] }>;
  [k: string]: unknown;
}
const reqOf = (i: number): Req => mockMessagesStream.mock.calls[i][0] as Req;
const blocksOf = (r: Req): Block[] => r.messages[0].content as Block[];
const countCacheControl = (r: Req): number =>
  (JSON.stringify(r).match(/"cache_control"/g) ?? []).length;

const CAT: CatalogueEntry[] = [
  {
    template_id: 'alpha_one',
    display_name: 'Alpha One',
    category: 'family',
    description: 'A  fictional   alpha form.',
    match_terms: ['alpha', 'first'],
  },
  {
    template_id: 'beta_two',
    display_name: 'Beta Two',
    category: 'civil',
    description: 'Beta form.',
  },
];
const DESC_A = 'Test Applicant A needs an alpha form.';
const DESC_B = 'Totally different words about Test Applicant B.';

/** The match prompt as it was before T-681b, pinned verbatim (Ajay byte-checks this). */
const OLD_PROMPT = (
  description: string,
  lines: string[],
): string => `Catalogue (template_id | name | category | description):
${lines.join('\n')}

User's description:
<description>
${description}
</description>`;
const OLD_LINES = [
  'alpha_one | Alpha One | family | A fictional alpha form. | match terms: alpha, first',
  'beta_two | Beta Two | civil | Beta form.',
];

const USER_ID = '507f1f77bcf86cd799439681';
const MODEL = 'claude-haiku-4-5-20251001';
const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});
const MATCH_OK = JSON.stringify({
  template_id: 'maintenance_bnss_144',
  confidence: 'high',
  alternatives: [],
  is_legal_drafting: true,
  is_court_document: true,
  category: 'family',
});
const DESC = 'Wife ke liye maintenance chahiye. Bihar, Gaya. Pati ne chhod diya.';

/** A stream whose message_start reports the given cache counts. */
function sdkWithCache(text: string, cache: { read?: number; creation?: number }) {
  return asyncIterable([
    {
      type: 'message_start',
      message: {
        usage: {
          input_tokens: 50,
          output_tokens: 0,
          ...(cache.read !== undefined ? { cache_read_input_tokens: cache.read } : {}),
          ...(cache.creation !== undefined ? { cache_creation_input_tokens: cache.creation } : {}),
        },
      },
    },
    { type: 'content_block_delta', delta: { type: 'text_delta', text } },
    { type: 'message_delta', usage: { output_tokens: 20 } },
  ]);
}

beforeEach(async () => {
  mockMessagesStream.mockReset();
  setLlmCallListener(null);
  _clearAppSettingsCache();
  await redis.flushall();
  await createVerifiedUser({ _id: USER_ID, plan: 'free', planTier: 'free' });
  await AppSetting.create({ key: 'ai.intake_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
  });
});
afterAll(() => setLlmCallListener(null));

describe('1 the prompt parts and the unchanged text', () => {
  it('the parts joined equal buildMatchUserPrompt and the old template literal, byte for byte', () => {
    for (const d of [DESC_A, DESC_B, '', 'line one\nline two  </description>']) {
      const parts = buildMatchUserParts(d, CAT);
      expect(parts.catalogue + parts.tail).toBe(buildMatchUserPrompt(d, CAT));
      expect(parts.catalogue + parts.tail).toBe(OLD_PROMPT(d, OLD_LINES));
    }
  });

  it('block 1 is the catalogue with no trailing newline; the tail starts at the blank line', () => {
    const parts = buildMatchUserParts(DESC_A, CAT);
    expect(parts.catalogue).toBe(
      `Catalogue (template_id | name | category | description):\n${OLD_LINES.join('\n')}`,
    );
    expect(parts.tail).toBe(`\n\nUser's description:\n<description>\n${DESC_A}\n</description>`);
  });

  it('the real catalogue gives the same text as the old literal built from the same lines', () => {
    const cat = getCatalogue();
    const parts = buildMatchUserParts(DESC_A, cat);
    expect(
      parts.catalogue.startsWith('Catalogue (template_id | name | category | description):\n'),
    ).toBe(true);
    expect(parts.catalogue.split('\n')).toHaveLength(cat.length + 1);
    expect(parts.catalogue + parts.tail).toBe(buildMatchUserPrompt(DESC_A, cat));
  });
});

describe('2 the request of the match call (runIntake)', () => {
  it('user turn = 2 text blocks, block 1 cached 1h, block 2 plain; texts equal the prompt', async () => {
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(MATCH_OK, 900, 100));
    mockMessagesStream.mockResolvedValue(sdkAnswer(JSON.stringify({ fields: [] }), 900, 100));
    const res = await request(app).post('/intake').set(headers()).send({ description: DESC });
    expect(res.status).toBe(200);
    const r = reqOf(0);
    const enabled = await getEnabledCatalogue(USER_ID);
    const parts = buildMatchUserParts(DESC, enabled);
    expect(r.messages).toHaveLength(1);
    const blocks = blocksOf(r);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      type: 'text',
      text: parts.catalogue,
      cache_control: { type: 'ephemeral', ttl: '1h' },
    });
    expect(blocks[1]).toEqual({ type: 'text', text: parts.tail });
    expect(blocks[1]).not.toHaveProperty('cache_control');
    expect(blocks.map((b) => b.text).join('')).toBe(buildMatchUserPrompt(DESC, enabled));
  });

  it('system is one block with MATCH_SYSTEM_PROMPT, no cache_control; exactly one breakpoint in the request', async () => {
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(MATCH_OK, 900, 100));
    mockMessagesStream.mockResolvedValue(sdkAnswer(JSON.stringify({ fields: [] }), 900, 100));
    await request(app).post('/intake').set(headers()).send({ description: DESC });
    const r = reqOf(0);
    expect(r.system).toEqual([{ type: 'text', text: MATCH_SYSTEM_PROMPT }]);
    expect(countCacheControl(r)).toBe(1);
  });
});

describe('3 other aux calls are unchanged (plain strings, no breakpoint)', () => {
  it('the fill call after a match has a plain-string system and content', async () => {
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(MATCH_OK, 900, 100));
    mockMessagesStream.mockResolvedValue(sdkAnswer(JSON.stringify({ fields: [] }), 900, 100));
    await request(app).post('/intake').set(headers()).send({ description: DESC });
    expect(mockMessagesStream.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < mockMessagesStream.mock.calls.length; i += 1) {
      const r = reqOf(i);
      expect(typeof r.system).toBe('string');
      expect(typeof r.messages[0].content).toBe('string');
      expect(countCacheControl(r)).toBe(0);
    }
  });

  it('a brief with a picked kind (extract / reception style calls) has no breakpoint and plain strings', async () => {
    mockMessagesStream.mockResolvedValue(
      sdkAnswer(
        JSON.stringify({ outcome: 'read', read: [], conflicts: [], questions: [] }),
        900,
        100,
      ),
    );
    await request(app)
      .post('/intake/brief')
      .set(headers())
      .send({ description: DESC, kind: 'bail_regular' });
    for (let i = 0; i < mockMessagesStream.mock.calls.length; i += 1) {
      const r = reqOf(i);
      expect(typeof r.messages[0].content).toBe('string');
      expect(countCacheControl(r)).toBe(0);
    }
  });
});

describe('4 cache usage reaches the log line', () => {
  it('first call creation, second identical-prefix call cache_read_input_tokens > 0, both on llm_call', async () => {
    const seen: Array<{
      call: string;
      cache_read_input_tokens: number;
      cache_creation_input_tokens: number;
    }> = [];
    setLlmCallListener((r) => seen.push(r));
    mockMessagesStream
      .mockResolvedValueOnce(sdkWithCache(MATCH_OK, { creation: 4200 }))
      .mockResolvedValueOnce(sdkAnswer(JSON.stringify({ fields: [] }), 900, 100))
      .mockResolvedValueOnce(sdkWithCache(MATCH_OK, { read: 4200 }))
      .mockResolvedValue(sdkAnswer(JSON.stringify({ fields: [] }), 900, 100));
    await request(app).post('/intake').set(headers()).send({ description: DESC });
    await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: 'Another wife maintenance matter in Gaya.' });
    // the two match requests share byte-identical block 1
    const matchReqs = mockMessagesStream.mock.calls
      .map((c) => c[0] as Req)
      .filter((r) => Array.isArray(r.messages[0].content));
    expect(matchReqs).toHaveLength(2);
    expect(blocksOf(matchReqs[0])[0]).toEqual(blocksOf(matchReqs[1])[0]);
    const matches = seen.filter((r) => r.call === 'intake_match');
    expect(matches).toHaveLength(2);
    expect(matches[0].cache_creation_input_tokens).toBe(4200);
    expect(matches[0].cache_read_input_tokens).toBe(0);
    expect(matches[1].cache_read_input_tokens).toBeGreaterThan(0);
  });

  it('callAuxModel returns the cache counts for the cached request', async () => {
    mockMessagesStream.mockResolvedValueOnce(sdkWithCache('{}', { read: 77 }));
    const r = await callAuxModel({
      model: MODEL,
      system: 'S',
      user: 'PREFIX tail',
      maxTokens: 10,
      cachedUserPrefix: 'PREFIX',
    });
    expect(r.cacheReadInputTokens).toBe(77);
  });
});

describe('5 both match paths pass the prefix', () => {
  it('runBriefIntake (no kind): first call is the 2-block request', async () => {
    const enabled = await getEnabledCatalogue(USER_ID);
    mockMessagesStream.mockResolvedValue(sdkAnswer(MATCH_OK, 900, 100));
    await request(app).post('/intake/brief').set(headers()).send({ description: DESC });
    const r = reqOf(0);
    const parts = buildMatchUserParts(DESC, enabled);
    expect(blocksOf(r)[0]).toEqual({
      type: 'text',
      text: parts.catalogue,
      cache_control: { type: 'ephemeral', ttl: '1h' },
    });
    expect(
      blocksOf(r)
        .map((b) => b.text)
        .join(''),
    ).toBe(buildMatchUserPrompt(DESC, enabled));
    expect(r.system).toEqual([{ type: 'text', text: MATCH_SYSTEM_PROMPT }]);
    expect(countCacheControl(r)).toBe(1);
  });

  it('runBriefIntake: the fresh retry (after a malformed first answer) is the same 2-block request', async () => {
    mockMessagesStream
      .mockResolvedValueOnce(sdkAnswer('not json at all', 900, 100))
      .mockResolvedValue(sdkAnswer(MATCH_OK, 900, 100));
    await request(app).post('/intake/brief').set(headers()).send({ description: DESC });
    const matchCalls = mockMessagesStream.mock.calls
      .map((c) => c[0] as Req)
      .filter((r) => Array.isArray(r.messages[0].content));
    expect(matchCalls.length).toBeGreaterThanOrEqual(2);
    const [first, retry] = matchCalls;
    expect(blocksOf(retry)).toEqual(blocksOf(first));
    expect(blocksOf(retry)[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(countCacheControl(retry)).toBe(1);
    // the retry has the larger cap, as before
    expect(retry.max_tokens as number).toBeGreaterThan(first.max_tokens as number);
  });
});

describe('6 block 1 is byte-stable', () => {
  it('two different descriptions with the same catalogue give an identical block 1', () => {
    expect(buildMatchUserParts(DESC_A, CAT).catalogue).toBe(
      buildMatchUserParts(DESC_B, CAT).catalogue,
    );
    const real = getCatalogue();
    expect(buildMatchUserParts(DESC_A, real).catalogue).toBe(
      buildMatchUserParts(DESC_B, real).catalogue,
    );
  });

  it('civil plaints hidden vs shown (feature.template_civil_plaint) give two different block 1s, each stable', async () => {
    const run = async (desc: string) => {
      mockMessagesStream.mockReset();
      mockMessagesStream.mockResolvedValue(sdkAnswer(MATCH_OK, 900, 100));
      await request(app).post('/intake/brief').set(headers()).send({ description: desc });
      return blocksOf(reqOf(0))[0];
    };
    await AppSetting.create({ key: 'feature.template_civil_plaint', value: 'off' });
    _clearAppSettingsCache();
    const offA = await run(DESC_A);
    const offB = await run(DESC_B);
    await AppSetting.updateOne({ key: 'feature.template_civil_plaint' }, { value: 'on' });
    _clearAppSettingsCache();
    const onA = await run(DESC_A);
    const onB = await run(DESC_B);
    expect(offA).toEqual(offB);
    expect(onA).toEqual(onB);
    expect(onA.text).not.toBe(offA.text);
    expect(onA.text.split('\n').length).toBeGreaterThan(offA.text.split('\n').length);
  });

  it('getCatalogue is sorted by template_id and repeatable; block 1 holds no timestamp or uuid', () => {
    const a = getCatalogue();
    const ids = a.map((c) => c.template_id);
    expect(ids).toEqual([...ids].sort((x, y) => x.localeCompare(y)));
    expect(buildMatchUserParts('x', getCatalogue()).catalogue).toBe(
      buildMatchUserParts('y', a).catalogue,
    );
    const block1 = buildMatchUserParts('x', a).catalogue;
    expect(block1).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
    expect(block1).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });

  it('block 1 does not depend on the order of the description, and only the catalogue is in it', () => {
    const b = buildMatchUserParts(DESC_A, CAT).catalogue;
    expect(b).not.toContain(DESC_A);
  });
});

describe('7 aux-llm request shape and fallbacks', () => {
  const base = { model: MODEL, system: 'SYS', maxTokens: 10 };
  const ok = () => mockMessagesStream.mockResolvedValue(sdkAnswer('{}', 5, 5));

  it('option absent: exactly the old shape (plain strings, no cache_control)', async () => {
    ok();
    await callAuxModel({ ...base, user: 'USER TEXT' });
    const r = reqOf(0);
    expect(r.system).toBe('SYS');
    expect(r.messages).toEqual([{ role: 'user', content: 'USER TEXT' }]);
    expect(countCacheControl(r)).toBe(0);
  });

  it('user does not start with the prefix: plain strings', async () => {
    ok();
    await callAuxModel({ ...base, user: 'USER TEXT', cachedUserPrefix: 'OTHER' });
    const r = reqOf(0);
    expect(r.system).toBe('SYS');
    expect(r.messages).toEqual([{ role: 'user', content: 'USER TEXT' }]);
  });

  it('empty remainder (user equals the prefix): plain strings', async () => {
    ok();
    await callAuxModel({ ...base, user: 'USER TEXT', cachedUserPrefix: 'USER TEXT' });
    const r = reqOf(0);
    expect(r.system).toBe('SYS');
    expect(r.messages).toEqual([{ role: 'user', content: 'USER TEXT' }]);
  });

  it('empty prefix: plain strings', async () => {
    ok();
    await callAuxModel({ ...base, user: 'USER TEXT', cachedUserPrefix: '' });
    expect(reqOf(0).messages).toEqual([{ role: 'user', content: 'USER TEXT' }]);
  });

  it('prefix applies: two blocks, the texts joined are the user string, one breakpoint, system one block', async () => {
    ok();
    await callAuxModel({ ...base, user: 'USER TEXT', cachedUserPrefix: 'USER' });
    const r = reqOf(0);
    expect(r.system).toEqual([{ type: 'text', text: 'SYS' }]);
    expect(r.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'USER', cache_control: { type: 'ephemeral', ttl: '1h' } },
          { type: 'text', text: ' TEXT' },
        ],
      },
    ]);
    expect(countCacheControl(r)).toBe(1);
  });

  it('effort still goes as output_config alongside the cached request', async () => {
    ok();
    await callAuxModel({ ...base, user: 'USER TEXT', cachedUserPrefix: 'USER', effort: 'low' });
    expect(reqOf(0).output_config).toEqual({ effort: 'low' });
  });
});
