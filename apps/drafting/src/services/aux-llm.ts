/**
 * aux-llm — one small model call for auxiliary steps (intake now; Reception,
 * review and preflight later). ADR-019 §3.7 / §3.12.
 *
 * Why not streamLLM: it reads `ai.drafting_model` and lives in ai.service.ts,
 * which ADR-019 §3.12 says intake must not touch. This file holds no prompt
 * text — prompts live in intake.prompts.ts (legal content).
 *
 * Uses the same transport and the same stream parser as streamLLM: the
 * Anthropic SDK directly (T-003, T-118). Streaming is used even for these
 * short calls so usage is read the same way as for a draft.
 */
import Anthropic from '@anthropic-ai/sdk';

import { env } from '../config/env';

import { AiEffort, estimateOutputTokens, parseAnthropicStreamEvent } from './llm-usage';

const directClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export interface AuxCallInput {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  /** T-453: output_config.effort. Omitted from the request when absent. */
  effort?: AiEffort;
}

export interface AuxCallUsage {
  inputTokens: number;
  outputTokens: number;
  usageSource: 'provider' | 'estimated';
  transport: 'direct';
  /** T-453: cache counts and stop reason, for the llm_call log line. Absent when not reported. */
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  stopReason?: string;
}

export interface AuxCallResult extends AuxCallUsage {
  text: string;
}

/**
 * T-683: per-call options. Every field is optional and absent by default, so a
 * v2 caller that passes nothing sends exactly the request it sent before.
 */
export interface AuxCallOptions {
  /** Aborts the request (the v3 Extractor's 20 s timeout). An abort is thrown as AuxCallError. */
  signal?: AbortSignal;
  /**
   * Send `system` as one text block with a 1h cache breakpoint (T-437's
   * option A, as ai.service.ts `cachedSystemBlocks` with SYSTEM_CACHE_TTL).
   * Only for a system prompt that is a constant, never for text built per request.
   */
  cacheSystem?: boolean;
}

/**
 * The cache TTL of a cached system block: the same value as ai.service.ts
 * SYSTEM_CACHE_TTL. Not imported, because this file must not load ai.service
 * (ADR-019 §3.12, header above).
 */
export const AUX_SYSTEM_CACHE_TTL = '1h' as const;

/** Thrown on any transport failure; carries whatever usage was seen. */
export class AuxCallError extends Error {
  readonly usage: AuxCallUsage;
  constructor(message: string, usage: AuxCallUsage) {
    super(message);
    this.name = 'AuxCallError';
    this.usage = usage;
  }
}

export async function callAuxModel(
  input: AuxCallInput,
  options: AuxCallOptions = {},
): Promise<AuxCallResult> {
  const transport: AuxCallUsage['transport'] = 'direct';
  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let sawUsage = false;
  let cacheReadInputTokens: number | undefined;
  let cacheCreationInputTokens: number | undefined;
  let stopReason: string | undefined;

  const usageNow = (): AuxCallUsage => ({
    inputTokens,
    outputTokens: sawUsage ? outputTokens : text ? estimateOutputTokens(text) : 0,
    usageSource: sawUsage ? 'provider' : 'estimated',
    transport,
    ...(cacheReadInputTokens !== undefined ? { cacheReadInputTokens } : {}),
    ...(cacheCreationInputTokens !== undefined ? { cacheCreationInputTokens } : {}),
    ...(stopReason !== undefined ? { stopReason } : {}),
  });

  try {
    const params: Anthropic.MessageStreamParams = {
      model: input.model,
      max_tokens: input.maxTokens,
      system: options.cacheSystem
        ? [
            {
              type: 'text',
              text: input.system,
              cache_control: { type: 'ephemeral', ttl: AUX_SYSTEM_CACHE_TTL },
            },
          ]
        : input.system,
      messages: [{ role: 'user', content: input.user }],
      ...(input.effort ? { output_config: { effort: input.effort } } : {}),
    };
    // T-683: request options only when a signal is given, so a v2 call is sent exactly as before.
    const stream = options.signal
      ? await directClient.messages.stream(params, { signal: options.signal })
      : await directClient.messages.stream(params);
    for await (const event of stream) {
      const f = parseAnthropicStreamEvent(event);
      if (f.text) text += f.text;
      if (f.inputTokens !== undefined) {
        inputTokens = f.inputTokens;
        sawUsage = true;
      }
      if (f.outputTokens !== undefined) {
        outputTokens = f.outputTokens;
        sawUsage = true;
      }
      if (f.cacheReadInputTokens !== undefined) cacheReadInputTokens = f.cacheReadInputTokens;
      if (f.cacheCreationInputTokens !== undefined)
        cacheCreationInputTokens = f.cacheCreationInputTokens;
      if (f.stopReason !== undefined) stopReason = f.stopReason;
    }
  } catch (err) {
    throw new AuxCallError(err instanceof Error ? err.message : 'aux call failed', usageNow());
  }

  return { text, ...usageNow() };
}
