/**
 * T-147e — what the runner puts in front of the drafting service before it
 * loads it. Nothing in the service changes: the runner swaps two modules in
 * Node's require cache, exactly as the service's own tests swap them.
 *
 * - `@anthropic-ai/sdk`: in `--dry-run`, a stub that answers each call with
 *   the fixture's recorded reply, chosen by the call's system prompt; both
 *   `messages.stream` and (T-373, the D1 Drafter) `messages.parse`. In
 *   `--real`, a pass-through to the real SDK that keeps a copy of the
 *   extraction pass's reply in memory (for `--calibrate`). It is never logged.
 * - `ioredis`: always ioredis-mock. Redis holds only the intake limits and the
 *   intake cache; a fresh one per fixture means no limit trips across fifteen
 *   matters and no cached answer skips a real call.
 *
 * Must run before anything from apps/drafting/src is required.
 */
import { dirname, join } from 'path';

import { RecordedReplies } from './types';

export const DRAFTING_DIR = join(__dirname, '..', '..', '..', 'apps', 'drafting');
const FROM_DRAFTING = { paths: [join(DRAFTING_DIR, 'src', 'services')] };

/** Require a module exactly as the drafting service resolves it, so both share one instance. */
export function requireFromDrafting<T = unknown>(name: string): T {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(require.resolve(name, FROM_DRAFTING)) as T;
}

export type CallPurpose = 'reception' | 'extract' | 'drafter' | 'repair' | 'fact_repair' | 'other';

/** A text block of a system prompt, as the SDK's `TextBlockParam` (T-437 sends cached blocks). */
interface SystemTextBlock {
  type: 'text';
  text: string;
  cache_control?: unknown;
}

/** A request's `system`: a plain string, or an array of text blocks. */
export type SystemParam = string | SystemTextBlock[];

interface StreamParams {
  model: string;
  max_tokens: number;
  system: SystemParam;
  messages: Array<{ role: string; content: string }>;
  /** T-453: the stage's effort; the stub accepts it and ignores it. */
  output_config?: { effort?: string };
}

/**
 * The text of a request's `system`, whichever form it was sent in. T-437:
 * the D1 call sends its system prompt as cached text blocks, not a string.
 */
export function systemText(system: SystemParam): string {
  return typeof system === 'string' ? system : system.map((b) => b.text).join('');
}

/** Which pipeline call a request is, read from its system prompt. */
export function purposeOf(system: string): CallPurpose {
  const ip = requireFromDrafting<Record<string, string>>(
    join(DRAFTING_DIR, 'src', 'services', 'intake.prompts'),
  );
  const dp = requireFromDrafting<Record<string, string>>(
    join(DRAFTING_DIR, 'src', 'services', 'drafter.prompts'),
  );
  if (system === ip.EXTRACT_SYSTEM_PROMPT) return 'extract';
  if (system === ip.RECEPTION_PACK_SYSTEM_PROMPT) return 'reception';
  if (
    system === dp.DRAFTER_LEDGER_SYSTEM_PROMPT ||
    system === dp.DRAFTER_PACK_SYSTEM_PROMPT ||
    // T-373: the structured call of a pack on a signed skeleton (ADR-025 D1).
    system === dp.DRAFTER_D1_SYSTEM_PROMPT
  )
    return 'drafter';
  if (
    system === dp.DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT ||
    system === dp.DRAFTER_REPAIR_SYSTEM_PROMPT
  )
    return 'repair';
  if (system === dp.DRAFTER_FACT_REPAIR_SYSTEM_PROMPT) return 'fact_repair';
  return 'other';
}

/** The stream events of one answer, in the shapes the SDK emits. Token counts are estimates. */
export function stubEvents(text: string, params: StreamParams): unknown[] {
  const promptChars =
    systemText(params.system).length + params.messages.map((m) => m.content).join('').length;
  const input = Math.ceil(promptChars / 4);
  return [
    { type: 'message_start', message: { usage: { input_tokens: input, output_tokens: 0 } } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text } },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: Math.ceil(text.length / 4) },
    },
  ];
}

/** The structured-output request of `messages.parse` (T-373), as far as the stub reads it. */
interface ParseParams extends StreamParams {
  output_config?: { effort?: string; format?: { parse?: (content: string) => unknown } };
}

/**
 * T-373: the answer of a stubbed `messages.parse`, in the shape the SDK
 * returns. The recorded reply is handed to the request's own output-format
 * parser, as the SDK does, so a malformed recording reads as the service
 * would read a malformed answer. Token counts are estimates.
 */
export function stubParsedMessage(text: string, params: ParseParams): unknown {
  const parse = params.output_config?.format?.parse;
  let parsed: unknown = null;
  if (parse) parsed = parse(text);
  else {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  const promptChars =
    systemText(params.system).length + params.messages.map((m) => m.content).join('').length;
  const input = Math.ceil(promptChars / 4);
  return {
    type: 'message',
    role: 'assistant',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text, parsed_output: parsed }],
    parsed_output: parsed,
    usage: { input_tokens: input, output_tokens: Math.ceil(text.length / 4) },
  };
}

async function* iterate(items: unknown[]): AsyncGenerator<unknown> {
  for (const i of items) yield i;
}

export interface ModelSeam {
  /** Dry-run: the replies for the fixture about to run. */
  setReplies(r: RecordedReplies | null): void;
  /** Every reply text of the extraction pass since the last call, then cleared. In memory only. */
  takeExtractReplies(): string[];
  /** Calls by purpose since the last call, then cleared. */
  takeCalls(): CallPurpose[];
}

/** Install the SDK seam. `mode` 'stub' never touches the network. */
export function installModelSeam(mode: 'stub' | 'real'): ModelSeam {
  const sdkPath = require.resolve('@anthropic-ai/sdk', FROM_DRAFTING);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const real = require(sdkPath) as Record<string, unknown> & { default?: unknown };
  const RealAnthropic = (real.default ?? real.Anthropic ?? real) as new (o?: unknown) => {
    messages: { stream(p: StreamParams): unknown; parse(p: ParseParams): Promise<unknown> };
  };
  let replies: RecordedReplies | null = null;
  let extracts: string[] = [];
  let calls: CallPurpose[] = [];

  const stubText = (p: CallPurpose): string => {
    if (!replies) throw new Error('golden-set stub: no recorded replies for this fixture');
    switch (p) {
      case 'reception':
        return replies.reception;
      case 'extract':
        return replies.extract;
      case 'drafter':
        return replies.drafter;
      case 'repair':
        return replies.repair ?? replies.drafter;
      case 'fact_repair':
        return replies.fact_repair ?? '';
      default:
        throw new Error('golden-set stub: a model call the golden set does not expect');
    }
  };

  class GoldenAnthropic extends RealAnthropic {
    constructor(opts?: unknown) {
      super(opts);
      const realMessages = this.messages;
      Object.defineProperty(this, 'messages', {
        configurable: true,
        value: {
          stream: (params: StreamParams) => {
            const purpose = purposeOf(systemText(params.system));
            calls.push(purpose);
            if (mode === 'stub') {
              const text = stubText(purpose);
              if (purpose === 'extract') extracts.push(text);
              return iterate(stubEvents(text, params));
            }
            // Real: pass through, keeping the extraction reply in memory only.
            const upstream = realMessages.stream(params) as AsyncIterable<unknown>;
            if (purpose !== 'extract') return upstream;
            return (async function* tap() {
              let text = '';
              for await (const ev of upstream) {
                const e = ev as { type?: string; delta?: { type?: string; text?: string } };
                if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta')
                  text += e.delta.text ?? '';
                yield ev;
              }
              extracts.push(text);
            })();
          },
          // T-373: the D1 Drafter's structured call (not streamed).
          parse: async (params: ParseParams) => {
            const purpose = purposeOf(systemText(params.system));
            calls.push(purpose);
            if (mode === 'stub') return stubParsedMessage(stubText(purpose), params);
            return realMessages.parse(params);
          },
        },
      });
    }
  }

  const fake = { ...real, __esModule: true, default: GoldenAnthropic, Anthropic: GoldenAnthropic };
  const entry = require.cache[sdkPath];
  if (!entry) throw new Error('golden-set: the SDK did not load');
  entry.exports = fake;

  return {
    setReplies: (r) => {
      replies = r;
    },
    takeExtractReplies: () => {
      const out = extracts;
      extracts = [];
      return out;
    },
    takeCalls: () => {
      const out = calls;
      calls = [];
      return out;
    },
  };
}

/** Swap ioredis for ioredis-mock, for the drafting service only. */
export function installRedisMock(): void {
  const path = require.resolve('ioredis', FROM_DRAFTING);
  const mock = requireFromDrafting<unknown>('ioredis-mock');
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports: mock,
    path: dirname(path),
    children: [],
    paths: [],
  } as unknown as NodeJS.Module;
}
