/**
 * T-003 — streamGenerateFromTemplate usage accumulation across a
 * multi-section document, and GenerationFailedError carrying partial usage
 * (as UsageTotals) when one of several LLM calls fails mid-stream.
 *
 * Uses the real bail_regular template config as a base, cloned with a second
 * synthetic ai_generated section so there are two LLM calls to sum across —
 * no real template ships with more than one today.
 */
import './setupEnv';
import './setupDb';

import { Response } from 'express';

import { env } from '../config/env';
import { AppSetting } from '../models/AppSetting.model';
import {
  GenerationFailedError,
  streamGenerateFromTemplate,
  TemplateGenerateInput,
} from '../services/ai.service';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { loadTemplateConfig, TemplateConfig } from '../services/template-engine.service';

function fakeRes(): Response {
  return {
    setHeader: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    headersSent: false,
  } as unknown as Response;
}

function twoSectionConfig(): TemplateConfig {
  const base = loadTemplateConfig('bail_regular')!;
  return {
    ...base,
    validation_rules: { ...base.validation_rules, auto_convert_old_to_new: false },
    document_structure: {
      sections: [
        ...base.document_structure.sections,
        { section_id: 'extra_body', type: 'ai_generated', prompt_context: 'Write a short note.' },
      ],
    },
  };
}

function sseResponse(lines: string[]) {
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

function usageChunk(text: string, promptTokens: number, completionTokens: number): string[] {
  return [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`,
    `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens } })}`,
    'data: [DONE]',
  ];
}

const BASE_INPUT = { formData: {}, userId: 'user-1', runId: 'test-run-id', runSequence: 1 };

beforeEach(async () => {
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-5-20250929' });
  env.HELICONE_API_KEY = 'test-helicone-key';
});

afterEach(() => {
  env.HELICONE_API_KEY = '';
  jest.restoreAllMocks();
});

describe('streamGenerateFromTemplate — multi-section usage accumulation', () => {
  it('sums usage and llmCalls across both ai_generated sections', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(sseResponse(usageChunk('first section text', 100, 20)))
      .mockResolvedValueOnce(sseResponse(usageChunk('second section text', 50, 10)));
    global.fetch = fetchMock as unknown as typeof fetch;

    const input: TemplateGenerateInput = { ...BASE_INPUT, templateConfig: twoSectionConfig() };
    const result = await streamGenerateFromTemplate(input, fakeRes());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.usage.llmCalls).toBe(2);
    expect(result.usage.inputTokens).toBe(150); // 100 + 50
    expect(result.usage.outputTokens).toBe(30); // 20 + 10
    expect(result.usage.usageSource).toBe('provider');
    expect(result.usage.calls).toHaveLength(2);
    expect(result.aiModel).toBe('claude-sonnet-4-5-20250929');
    expect(result.transport).toBe('helicone');
    expect(result.bodyParaCount).toBeGreaterThanOrEqual(0);
  });

  it('marks a call "estimated" when the provider reports no usage at all', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        sseResponse([
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'no usage here' } }] })}`,
          'data: [DONE]',
        ]),
      )
      .mockResolvedValueOnce(sseResponse(usageChunk('second section text', 50, 10)));
    global.fetch = fetchMock as unknown as typeof fetch;

    const input: TemplateGenerateInput = { ...BASE_INPUT, templateConfig: twoSectionConfig() };
    const result = await streamGenerateFromTemplate(input, fakeRes());

    expect(result.usage.usageSource).toBe('mixed');
    const estimatedCall = result.usage.calls.find((c) => c.usageSource === 'estimated')!;
    expect(estimatedCall.inputTokens).toBe(0);
    expect(estimatedCall.outputTokens).toBeGreaterThan(0); // estimateOutputTokens('no usage here')
  });

  it("a failure on the second call still reports the first call's usage via GenerationFailedError", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(sseResponse(usageChunk('first section text', 100, 20)))
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'gateway down' });
    global.fetch = fetchMock as unknown as typeof fetch;

    const input: TemplateGenerateInput = { ...BASE_INPUT, templateConfig: twoSectionConfig() };
    const res = fakeRes();
    let caught: unknown;
    try {
      await streamGenerateFromTemplate(input, res);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(GenerationFailedError);
    const failErr = caught as GenerationFailedError;
    // First call succeeded (100/20); second call attempted but failed before
    // any usage chunk arrived, so it's recorded as a 0-input estimated call —
    // nothing is lost, nothing is fabricated for the half that never ran.
    expect(failErr.usage.llmCalls).toBe(2);
    expect(failErr.usage.inputTokens).toBe(100);
    expect(failErr.usage.outputTokens).toBeGreaterThanOrEqual(20);
    expect(failErr.aiModel).toBe('claude-sonnet-4-5-20250929');
    expect(failErr.transport).toBe('helicone');
    expect(res.end).toHaveBeenCalled();
  });
});
