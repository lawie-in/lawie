/**
 * T-118 — helpers for faking the Anthropic SDK's `messages.stream()` in tests.
 * Every model call goes straight to the SDK now, so tests replace the SDK
 * module (see the `jest.mock('@anthropic-ai/sdk', ...)` in each test file) and
 * feed it the same event shapes the real stream emits.
 */

export interface SdkUsage {
  input: number;
  output: number;
}

/** What streamLLM hands to `messages.stream()`. */
export interface SdkStreamParams {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: string; content: string }>;
}

export function asyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]: () => {
      let i = 0;
      return {
        next: async () =>
          i < items.length
            ? { value: items[i++], done: false }
            : { value: undefined as unknown as T, done: true },
      };
    },
  };
}

/** The events of one successful stream: input tokens, two text chunks, output tokens. */
export function sdkEvents(content: string, usage: SdkUsage = { input: 4000, output: 800 }) {
  const cut = Math.max(0, content.length - 40);
  return [
    { type: 'message_start', message: { usage: { input_tokens: usage.input, output_tokens: 0 } } },
    {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: content.slice(0, cut) },
    },
    {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: content.slice(cut) },
    },
    { type: 'message_delta', usage: { output_tokens: usage.output } },
  ];
}

/** What `messages.stream()` resolves to for one successful answer. */
export function sdkStreamOf(content: string, usage?: SdkUsage): AsyncIterable<unknown> {
  return asyncIterable(sdkEvents(content, usage));
}

/** The SDK module stub: `new Anthropic()` gives a client whose stream is `streamFn`. */
export function sdkModuleStub(streamFn: (...args: unknown[]) => unknown) {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({ messages: { stream: streamFn } })),
  };
}

/** One successful stream: the text, then the provider's token counts. */
export function sdkAnswer(text: string, input: number, output: number): AsyncIterable<unknown> {
  return asyncIterable([
    { type: 'message_start', message: { usage: { input_tokens: input, output_tokens: 0 } } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text } },
    { type: 'message_delta', usage: { output_tokens: output } },
  ]);
}
