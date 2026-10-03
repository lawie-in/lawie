/**
 * T-003 — streamLLM usage capture, both paths.
 *
 * Doesn't hit a real DB (no Generation/route involved) but does need
 * app-settings.service's getAppSetting, which reads Mongo — so setupDb is
 * still required to back the AppSetting lookup.
 */
import './setupEnv';
import './setupDb';

// Mock the Anthropic SDK at module level — ai.service.ts builds a singleton
// `directClient` at import time, so the mock has to be in place before that
// import runs. `mockMessagesStream` (name starts with "mock") is the one
// exception jest's hoisting allows a jest.mock() factory to close over.
const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { stream: mockMessagesStream },
  })),
}));

import { env } from '../config/env';
import { AppSetting } from '../models/AppSetting.model';
import { streamLLM, LlmUsage } from '../services/ai.service';
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
  await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-20250514' });
  mockMessagesStream.mockReset();
});

afterEach(() => {
  env.HELICONE_API_KEY = '';
  jest.restoreAllMocks();
});

describe('streamLLM — direct Anthropic path (no HELICONE_API_KEY)', () => {
  it('captures input/output tokens from message_start and message_delta', async () => {
    mockMessagesStream.mockResolvedValue(
      asyncIterable([
        { type: 'message_start', message: { usage: { input_tokens: 120, output_tokens: 0 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } },
        { type: 'message_delta', usage: { output_tokens: 42, input_tokens: 120 } },
        { type: 'message_stop' },
      ]),
    );

    const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
    const text = await drain(streamLLM('system', 'user', 4096, {}, usage));

    expect(text).toBe('Hello world');
    expect(usage.inputTokens).toBe(120);
    expect(usage.outputTokens).toBe(42);
  });

  it('leaves whatever was captured before a mid-stream throw', async () => {
    mockMessagesStream.mockResolvedValue(
      asyncIterable(
        [
          { type: 'message_start', message: { usage: { input_tokens: 80, output_tokens: 0 } } },
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } },
        ],
        true,
      ),
    );

    const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };

    await expect(drain(streamLLM('system', 'user', 4096, {}, usage))).rejects.toThrow(
      'socket hang up',
    );

    // message_start already landed before the throw — not lost.
    expect(usage.inputTokens).toBe(80);
    expect(usage.outputTokens).toBe(0);
  });

  it('does not throw when no usage sink is passed', async () => {
    mockMessagesStream.mockResolvedValue(
      asyncIterable([
        { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } },
      ]),
    );

    await expect(drain(streamLLM('system', 'user', 4096))).resolves.toBe('hi');
  });
});

describe('streamLLM — Helicone path (HELICONE_API_KEY set)', () => {
  beforeEach(() => {
    env.HELICONE_API_KEY = 'test-helicone-key';
  });

  function sseResponse(lines: string[]): { ok: true; body: ReadableStream<Uint8Array> } {
    const encoder = new TextEncoder();
    let i = 0;
    return {
      ok: true,
      body: new ReadableStream({
        pull(controller) {
          if (i < lines.length) {
            controller.enqueue(encoder.encode(lines[i++] + '\n'));
          } else {
            controller.close();
          }
        },
      }),
    };
  }

  it('captures usage from the final include_usage chunk', async () => {
    const chunks = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello ' } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'world' } }] })}`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 200, completion_tokens: 55 } })}`,
      'data: [DONE]',
    ];

    const fetchMock = jest.fn().mockResolvedValue(sseResponse(chunks));
    global.fetch = fetchMock as unknown as typeof fetch;

    const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
    const text = await drain(streamLLM('system', 'user', 4096, {}, usage));

    expect(text).toBe('Hello world');
    expect(usage.inputTokens).toBe(200);
    expect(usage.outputTokens).toBe(55);

    // Requested include_usage so the gateway actually sends the final chunk.
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it('leaves usage at 0 when the stream fails before the final usage chunk arrives', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 503, text: async () => 'down' });
    global.fetch = fetchMock as unknown as typeof fetch;

    const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
    await expect(drain(streamLLM('system', 'user', 4096, {}, usage))).rejects.toThrow(
      /Helicone AI Gateway 503/,
    );
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
  });
});
