/**
 * T-683 phase 1: aux-llm's new AuxCallOptions (signal, cacheSystem). The SDK is
 * stubbed; no real model call.
 */
import '../setupEnv';

const mockStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { stream: (...a: unknown[]) => mockStream(...a) },
  })),
}));

import { AUX_SYSTEM_CACHE_TTL, AuxCallError, callAuxModel } from '../../services/aux-llm';
import { asyncIterable } from '../sdkStream';

const events = () =>
  asyncIterable([
    {
      type: 'message_start',
      message: { usage: { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 30 } },
    },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"facts":[]}' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 12 } },
  ]);

const INPUT = { model: 'claude-test', system: 'SYSTEM TEXT', user: 'USER TEXT', maxTokens: 300 };

beforeEach(() => {
  mockStream.mockReset();
  mockStream.mockImplementation(() => events());
});

describe('callAuxModel: no options (every v2 caller)', () => {
  it('calls stream with ONE argument, and the same params as before', async () => {
    const r = await callAuxModel(INPUT);
    expect(mockStream).toHaveBeenCalledTimes(1);
    expect(mockStream.mock.calls[0]).toHaveLength(1);
    expect(mockStream.mock.calls[0][0]).toEqual({
      model: 'claude-test',
      max_tokens: 300,
      system: 'SYSTEM TEXT',
      messages: [{ role: 'user', content: 'USER TEXT' }],
    });
    expect(r.text).toBe('{"facts":[]}');
    expect(r).toMatchObject({ inputTokens: 100, outputTokens: 12, stopReason: 'end_turn' });
  });

  it('effort alone still adds only output_config and a string system', async () => {
    await callAuxModel({ ...INPUT, effort: 'low' });
    expect(mockStream.mock.calls[0]).toHaveLength(1);
    const p = mockStream.mock.calls[0][0];
    expect(p.output_config).toEqual({ effort: 'low' });
    expect(typeof p.system).toBe('string');
  });

  it('an empty options object is the same as none', async () => {
    await callAuxModel(INPUT, {});
    expect(mockStream.mock.calls[0]).toHaveLength(1);
    expect(typeof mockStream.mock.calls[0][0].system).toBe('string');
  });

  it('cacheSystem false is the same as none', async () => {
    await callAuxModel(INPUT, { cacheSystem: false });
    expect(mockStream.mock.calls[0]).toHaveLength(1);
    expect(mockStream.mock.calls[0][0].system).toBe('SYSTEM TEXT');
  });
});

describe('callAuxModel: signal', () => {
  it('passes the signal to stream as request options', async () => {
    const ctrl = new AbortController();
    await callAuxModel(INPUT, { signal: ctrl.signal });
    expect(mockStream.mock.calls[0]).toHaveLength(2);
    expect(mockStream.mock.calls[0][1]).toEqual({ signal: ctrl.signal });
    expect(mockStream.mock.calls[0][1].signal).toBe(ctrl.signal);
    // The request body is unchanged by a signal.
    expect(mockStream.mock.calls[0][0].system).toBe('SYSTEM TEXT');
  });

  it('an aborted stream is thrown as AuxCallError carrying the usage seen so far', async () => {
    mockStream.mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          type: 'message_start',
          message: { usage: { input_tokens: 77, output_tokens: 0 } },
        };
        throw new Error('Request was aborted.');
      },
    }));
    const ctrl = new AbortController();
    await expect(callAuxModel(INPUT, { signal: ctrl.signal })).rejects.toBeInstanceOf(AuxCallError);
    await callAuxModel(INPUT, { signal: ctrl.signal }).catch((e: AuxCallError) => {
      expect(e.message).toBe('Request was aborted.');
      expect(e.usage.inputTokens).toBe(77);
    });
  });

  it('a stream() that throws is an AuxCallError too', async () => {
    mockStream.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(callAuxModel(INPUT)).rejects.toBeInstanceOf(AuxCallError);
  });
});

describe('callAuxModel: cacheSystem', () => {
  it('sends the system as one text block with a 1h ephemeral cache_control', async () => {
    await callAuxModel(INPUT, { cacheSystem: true });
    const p = mockStream.mock.calls[0][0];
    expect(p.system).toEqual([
      { type: 'text', text: 'SYSTEM TEXT', cache_control: { type: 'ephemeral', ttl: '1h' } },
    ]);
    expect(AUX_SYSTEM_CACHE_TTL).toBe('1h');
    // No signal: still one argument.
    expect(mockStream.mock.calls[0]).toHaveLength(1);
  });

  it('works together with a signal and effort', async () => {
    const ctrl = new AbortController();
    await callAuxModel({ ...INPUT, effort: 'low' }, { cacheSystem: true, signal: ctrl.signal });
    const [p, o] = mockStream.mock.calls[0];
    expect(p.system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(p.output_config).toEqual({ effort: 'low' });
    expect(o.signal).toBe(ctrl.signal);
    // The user message is never cached.
    expect(p.messages).toEqual([{ role: 'user', content: 'USER TEXT' }]);
  });

  it('reports the cache counts the provider sends', async () => {
    const r = await callAuxModel(INPUT, { cacheSystem: true });
    expect(r.cacheReadInputTokens).toBe(30);
  });
});
