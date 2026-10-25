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

import { AppSetting } from '../models/AppSetting.model';
import {
  GenerationFailedError,
  streamGenerateFromTemplate,
  TemplateGenerateInput,
} from '../services/ai.service';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { loadTemplateConfig, TemplateConfig } from '../services/template-engine.service';
import { asyncIterable } from './sdkStream';

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

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

// Every test sets its own model answer; nothing carries over from the one before.
beforeEach(() => {
  mockMessagesStream.mockReset();
});

/** One SDK stream: text, then the provider's input and output token counts. */
function sdkAnswer(text: string, input: number, output: number) {
  return asyncIterable([
    { type: 'message_start', message: { usage: { input_tokens: input, output_tokens: 0 } } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text } },
    { type: 'message_delta', usage: { output_tokens: output } },
  ]);
}

const BASE_INPUT = {
  formData: {},
  userId: 'user-1',
  runId: 'test-run-id',
  runSequence: 1,
  runType: 'initial' as const,
};

beforeEach(async () => {
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-5-20250929' });
  mockMessagesStream.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('streamGenerateFromTemplate — multi-section usage accumulation', () => {
  it('sums usage and llmCalls across both ai_generated sections', async () => {
    mockMessagesStream
      .mockResolvedValueOnce(sdkAnswer('first section text', 100, 20))
      .mockResolvedValueOnce(sdkAnswer('second section text', 50, 10));

    const input: TemplateGenerateInput = { ...BASE_INPUT, templateConfig: twoSectionConfig() };
    const result = await streamGenerateFromTemplate(input, fakeRes());

    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
    expect(result.usage.llmCalls).toBe(2);
    expect(result.usage.inputTokens).toBe(150); // 100 + 50
    expect(result.usage.outputTokens).toBe(30); // 20 + 10
    expect(result.usage.usageSource).toBe('provider');
    expect(result.usage.calls).toHaveLength(2);
    expect(result.aiModel).toBe('claude-sonnet-4-5-20250929');
    expect(result.transport).toBe('direct');
    expect(result.bodyParaCount).toBeGreaterThanOrEqual(0);
  });

  it('marks a call "estimated" when the provider reports no usage at all', async () => {
    mockMessagesStream
      .mockResolvedValueOnce(
        asyncIterable([
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'no usage here' } },
        ]),
      )
      .mockResolvedValueOnce(sdkAnswer('second section text', 50, 10));

    const input: TemplateGenerateInput = { ...BASE_INPUT, templateConfig: twoSectionConfig() };
    const result = await streamGenerateFromTemplate(input, fakeRes());

    expect(result.usage.usageSource).toBe('mixed');
    const estimatedCall = result.usage.calls.find((c) => c.usageSource === 'estimated')!;
    expect(estimatedCall.inputTokens).toBe(0);
    expect(estimatedCall.outputTokens).toBeGreaterThan(0); // estimateOutputTokens('no usage here')
  });

  it("a failure on the second call still reports the first call's usage via GenerationFailedError", async () => {
    mockMessagesStream
      .mockResolvedValueOnce(sdkAnswer('first section text', 100, 20))
      .mockRejectedValueOnce(new Error('503 service unavailable'));

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
    expect(failErr.transport).toBe('direct');
    // The pipeline writes the SSE error event but does NOT end the response —
    // the route ends it only after the failed Generation row is persisted,
    // so a fast retry can never race that write (found via a live browser
    // check during T-003).
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: error'));
    expect(res.end).not.toHaveBeenCalled();
  });
});
