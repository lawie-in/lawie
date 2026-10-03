/**
 * T-003 — streamLLM usage capture, both paths. Parsing itself is covered by
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

import { env } from '../config/env';
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
  env.HELICONE_API_KEY = '';
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
    const text = await drain(streamLLM('system', 'user', 4096, {}, usage));

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
    await expect(drain(streamLLM('system', 'user', 4096, {}, usage))).rejects.toThrow(
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

describe('streamLLM — Helicone path', () => {
  beforeEach(() => {
    env.HELICONE_API_KEY = 'test-helicone-key';
  });

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

  it('captures usage from the final include_usage chunk, requests it in the body', async () => {
    const chunks = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello ' } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'world' } }] })}`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 200, completion_tokens: 55 } })}`,
      'data: [DONE]',
    ];
    const fetchMock = jest.fn().mockResolvedValue(sseResponse(chunks));
    global.fetch = fetchMock as unknown as typeof fetch;

    const usage: CallUsageDraft = { inputTokens: 0, outputTokens: 0, usageSource: 'none' };
    const text = await drain(streamLLM('system', 'user', 4096, {}, usage));

    expect(text).toBe('Hello world');
    expect(usage.inputTokens).toBe(200);
    expect(usage.outputTokens).toBe(55);
    expect(usage.usageSource).toBe('provider');
    expect(usage.transport).toBe('helicone');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it('leaves usageSource "none" when the stream fails before the final usage chunk arrives', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 503, text: async () => 'down' });
    global.fetch = fetchMock as unknown as typeof fetch;

    const usage: CallUsageDraft = { inputTokens: 0, outputTokens: 0, usageSource: 'none' };
    await expect(drain(streamLLM('system', 'user', 4096, {}, usage))).rejects.toThrow(
      /Helicone AI Gateway 503/,
    );
    expect(usage.usageSource).toBe('none');
  });
});
