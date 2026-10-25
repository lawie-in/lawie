/**
 * T-003 / T-118 — streamLLM usage capture (direct Anthropic SDK). Parsing itself is covered by
 * llm-usage.test.ts (pure, no network); this file covers streamLLM's own
 * plumbing — draft.model/transport, usageSource flip to 'provider', and that
 * a mid-stream throw leaves whatever was captured.
 */
import './setupEnv';
import './setupDb';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { stream: mockMessagesStream },
  })),
}));

import { AppSetting } from '../models/AppSetting.model';
import { CallUsageDraft, streamLLM } from '../services/ai.service';
import { _clearAppSettingsCache } from '../services/app-settings.service';

function asyncIterable<T>(items: T[], failAfter = false): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]: () => {
      let i = 0;
      return {
        next: async () => {
          if (i < items.length) return { value: items[i++], done: false };
          if (failAfter) throw new Error('socket hang up');
          return { value: undefined as unknown as T, done: true };
        },
      };
    },
  };
}

async function drain(gen: AsyncGenerator<string>): Promise<string> {
  let out = '';
  for await (const chunk of gen) out += chunk;
  return out;
}

beforeEach(async () => {
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-5-20250929' });
  mockMessagesStream.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('streamLLM — direct Anthropic path', () => {
  it('captures tokens, model and transport; marks usageSource provider', async () => {
    mockMessagesStream.mockResolvedValue(
      asyncIterable([
        { type: 'message_start', message: { usage: { input_tokens: 120, output_tokens: 0 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } },
        { type: 'message_delta', usage: { output_tokens: 42 } },
      ]),
    );

    const usage: CallUsageDraft = { inputTokens: 0, outputTokens: 0, usageSource: 'none' };
    const text = await drain(streamLLM('system', 'user', 4096, usage));

    expect(text).toBe('Hello world');
    expect(usage).toEqual({
      inputTokens: 120,
      outputTokens: 42,
      usageSource: 'provider',
      model: 'claude-sonnet-4-5-20250929',
      transport: 'direct',
    });
  });

  it('leaves usageSource "none" and whatever was captured before a mid-stream throw', async () => {
    mockMessagesStream.mockResolvedValue(
      asyncIterable(
        [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } }],
        true,
      ),
    );

    const usage: CallUsageDraft = { inputTokens: 0, outputTokens: 0, usageSource: 'none' };
    await expect(drain(streamLLM('system', 'user', 4096, usage))).rejects.toThrow(
      'socket hang up',
    );
    expect(usage.usageSource).toBe('none');
    expect(usage.inputTokens).toBe(0);
  });

  it('does not throw when no usage sink is passed', async () => {
    mockMessagesStream.mockResolvedValue(
      asyncIterable([{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } }]),
    );
    await expect(drain(streamLLM('system', 'user', 4096))).resolves.toBe('hi');
  });
});
