/**
 * T-453 — the D1 structured call (messages.parse) keeps output_config.format
 * and adds output_config.effort from ai.effort.body; never thinking or
 * budget_tokens; one llm_call line (call d1). SDK stubbed, no database.
 */
import './setupEnv';

import { Response } from 'express';

import logger from '../config/logger';
import { streamGenerateFromBrief } from '../services/ai.service';
import { loadAvermentLists } from '../services/averments';
import { buildBrief, buildChecklist, GivenValue } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { loadTemplateConfig } from '../services/template-engine.service';
import type { Skeleton } from '../types/skeleton';
import { loadFixtureSkeleton, regularBase } from './fixtures/t373';
import { sdkModuleStub } from './sdkStream';

const mockStream = jest.fn();
const mockParse = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub(
    (...args: unknown[]) => mockStream(...args),
    (...args: unknown[]) => mockParse(...args),
  ),
);
let bodyEffort: string | undefined;
jest.mock('../services/app-settings.service', () => ({
  ...jest.requireActual('../services/app-settings.service'),
  getAppSetting: jest.fn(async (key: string) => {
    if (key === 'ai.effort.body') {
      if (bodyEffort === undefined) throw new Error('missing');
      return bodyEffort;
    }
    return 'claude-sonnet-4-5-20250929';
  }),
}));
jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
  lookupOldToNew: jest.fn(async () => null),
}));

void sdkModuleStub;
const skeleton: Skeleton = loadFixtureSkeleton('bail_regular');
const pack = loadRulePack('bail_regular')!;

async function runD1() {
  const facts = regularBase();
  const u = (key: string, value: string): GivenValue => ({ source: 'user', key, value });
  const brief = buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: true },
    checklist: buildChecklist(pack),
    values: facts.filter((f) => f.key !== 'grounds_for_bail').map((f) => u(f.key, f.display)),
  });
  const res = {
    setHeader: jest.fn(),
    write: jest.fn(() => true),
    end: jest.fn(),
    headersSent: false,
  };
  try {
    await streamGenerateFromBrief(
      {
        pack,
        templateConfig: loadTemplateConfig('bail_regular')!,
        brief,
        ledger: { facts, lists: loadAvermentLists('bail_regular') },
        language: 'en',
        targetParagraphs: 12,
        advocateName: 'Test Advocate',
        userId: 'u1',
        runId: 'run-77',
        runSequence: 1,
        runType: 'initial',
        loadSkeleton: () => skeleton,
      },
      res as unknown as Response,
    );
  } catch {
    // A null parsed_output ends in an error; only the call shape matters here.
  }
}

const unparsed = {
  parsed_output: null,
  content: [],
  stop_reason: 'max_tokens',
  usage: { input_tokens: 9, output_tokens: 4 },
};

beforeEach(() => {
  mockStream.mockReset();
  mockParse.mockReset();
  bodyEffort = undefined;
});
afterEach(() => jest.restoreAllMocks());

describe('callD1Drafter (T-453)', () => {
  it('sends output_config.format AND the default body effort (medium); no thinking or budget_tokens', async () => {
    mockParse.mockResolvedValue(unparsed);
    await runD1();
    const call = mockParse.mock.calls[0][0];
    expect(call.output_config.format.type).toBe('json_schema');
    expect(call.output_config.effort).toBe('medium');
    expect(call).not.toHaveProperty('thinking');
    expect(JSON.stringify(call)).not.toContain('budget_tokens');
  });

  it('sends the configured ai.effort.body value', async () => {
    bodyEffort = 'high';
    mockParse.mockResolvedValue(unparsed);
    await runD1();
    expect(mockParse.mock.calls[0][0].output_config.effort).toBe('high');
    expect(mockParse.mock.calls[0][0].output_config.format.type).toBe('json_schema');
  });

  it('an invalid value falls back to medium', async () => {
    bodyEffort = 'bogus';
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    mockParse.mockResolvedValue(unparsed);
    await runD1();
    expect(mockParse.mock.calls[0][0].output_config.effort).toBe('medium');
  });

  it('logs one llm_call per parse: body, d1, effort, stop_reason, token counts, no text', async () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    mockParse.mockResolvedValue(unparsed);
    await runD1();
    const lines = info.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .filter((o) => o?.event === 'llm_call' && o.call === 'd1');
    expect(lines.length).toBe(mockParse.mock.calls.length);
    expect(lines[0]).toMatchObject({
      stage: 'body',
      call: 'd1',
      effort: 'medium',
      status: 'completed',
      stop_reason: 'max_tokens',
      input_tokens: 9,
      output_tokens: 4,
    });
    expect(Object.keys(lines[0])).not.toContain('userId');
    expect(JSON.stringify(lines)).not.toContain('u1"');
  });

  it('logs status failed when parse throws', async () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    mockParse.mockRejectedValue(new Error('api down'));
    await runD1();
    const lines = info.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .filter((o) => o?.event === 'llm_call' && o.call === 'd1');
    expect(lines[0]).toMatchObject({ status: 'failed', stage: 'body' });
  });
});
