/**
 * T-292 — the match prompt no longer asks the model for a matter label.
 * AC1: no label rule or key; the category rule and key stay, list unchanged.
 * AC2: the rest of the prompt is unchanged (pinned by hash, checked against
 *      the base version with only the two edits applied, plus anchor lines).
 * AC3: a reply without a label gives the same decision and stored event.
 */
import './setupDb';
import { createHash } from 'crypto';
import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { Event } from '../models/Event.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { DEMAND_CATEGORIES, decideMatch } from '../services/intake.service';
import { MATCH_SYSTEM_PROMPT } from '../services/intake.prompts';
import { sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

jest.setTimeout(180_000);

const MODEL = 'claude-haiku-4-5-20251001';
const USER_ID = '507f1f77bcf86cd799439072';

const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

// SHA-256 of MATCH_SYSTEM_PROMPT as applied for T-292 (base minus the label
// rule line and the `"label": string, ` key). Any further edit changes it and
// needs Ajay's sign-off, then a new hash here.
// T-482 (Ajay 9ad6a8f1): the "match terms" rule line was added; the hash below is of the prompt
// with it. The earlier hash (9b5d2d0f...) is still the prompt minus that one line (t482 test).
const PROMPT_SHA256 = 'a07fd3a5817188e16f5b9cae7ebe2afdf3fedcfd6a51ef0af7bca532b6b4633b';

describe('T-292 match prompt: no label', () => {
  it('contains no "label" anywhere, as a rule or a JSON key', () => {
    expect(MATCH_SYSTEM_PROMPT).not.toMatch(/label/i);
  });

  it('keeps the category rule and the category key', () => {
    expect(MATCH_SYSTEM_PROMPT).toContain('- category: one word guess such as ');
    expect(MATCH_SYSTEM_PROMPT).toContain('"category": string}');
    expect(MATCH_SYSTEM_PROMPT).toContain('"is_court_document": boolean, "category": string}');
  });

  it('the category word list equals DEMAND_CATEGORIES', () => {
    const m = MATCH_SYSTEM_PROMPT.match(/- category: one word guess such as ([^\n]*)\./);
    expect(m).not.toBeNull();
    expect(m![1].split(', ')).toEqual([...DEMAND_CATEGORIES]);
  });

  it('the rest of the prompt is unchanged (anchors)', () => {
    const lines = MATCH_SYSTEM_PROMPT.split('\n');
    expect(lines[0]).toBe('You sort requests for an Indian legal drafting service.');
    expect(MATCH_SYSTEM_PROMPT).toContain('- Bail: a person who has already been arrested');
    expect(MATCH_SYSTEM_PROMPT).toContain('- is_legal_drafting false: the request is not');
    expect(MATCH_SYSTEM_PROMPT).toContain('- is_court_document true when the document would be');
    expect(MATCH_SYSTEM_PROMPT).toContain(
      '{"template_id": string or null, "confidence": "high" | "medium" | "low", "alternatives": [template_id, ...], "is_legal_drafting": boolean, "is_court_document": boolean, "category": string}',
    );
  });

  it('the whole prompt is pinned (base with only the two label edits)', () => {
    expect(createHash('sha256').update(MATCH_SYSTEM_PROMPT).digest('hex')).toBe(PROMPT_SHA256);
  });
});

describe('T-292 decideMatch: a reply without a label', () => {
  const allowed = new Set(['bail_regular']);
  const base = {
    template_id: 'bail_regular',
    confidence: 'high',
    alternatives: [],
    is_legal_drafting: true,
    is_court_document: true,
    category: 'criminal',
  };

  it.each([
    ['matched', base],
    ['guided', { ...base, confidence: 'low' }],
    ['needs_choice', { ...base, confidence: 'medium' }],
    ['no_match', { ...base, template_id: 'invented' }],
  ])('%s: same decision with and without a label key', (_n, reply) => {
    const without = decideMatch(reply, allowed);
    const withLabel = decideMatch({ ...reply, label: 'Bail for Ram Kumar' }, allowed);
    expect(without).toEqual(withLabel);
    expect(without.category).toBe('criminal');
    expect(JSON.stringify(without)).not.toMatch(/label/i);
  });
});

describe('T-292 intake path: stored event for a reply without a label', () => {
  beforeEach(async () => {
    _clearAppSettingsCache();
    await redis.flushall();
    await AppSetting.create({ key: 'ai.intake_model', value: MODEL });
    await AppSetting.create({
      key: `ai.rates.${MODEL}`,
      value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
    });
  });

  it('the request does not ask for a label and the event has none', async () => {
    mockMessagesStream.mockReset();
    mockMessagesStream.mockResolvedValueOnce(
      sdkAnswer(
        JSON.stringify({
          template_id: null,
          confidence: 'low',
          alternatives: [],
          is_legal_drafting: true,
          is_court_document: false,
          category: 'civil',
        }),
        900,
        120,
      ),
    );
    const res = await request(app)
      .post('/intake')
      .set(headers())
      .send({ description: 'I need a document for a dispute about a boundary wall.' });
    expect(res.status).toBe(200);

    const sent = JSON.stringify(mockMessagesStream.mock.calls[0]);
    expect(sent).not.toMatch(/"label"|label:/i);

    const ev = await Event.findOne({ type: 'demand.no_template' }).lean();
    expect(ev).not.toBeNull();
    expect(ev!.metadata).not.toHaveProperty('label');
    expect(ev!.metadata).toMatchObject({ category: 'civil', isCourtDocument: false });
  });
});
