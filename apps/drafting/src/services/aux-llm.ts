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

/** Thrown on any transport failure; carries whatever usage was seen. */
export class AuxCallError extends Error {
  readonly usage: AuxCallUsage;
  constructor(message: string, usage: AuxCallUsage) {
    super(message);
    this.name = 'AuxCallError';
    this.usage = usage;
  }
}

export async function callAuxModel(input: AuxCallInput): Promise<AuxCallResult> {
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
    const stream = await directClient.messages.stream({
      model: input.model,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: [{ role: 'user', content: input.user }],
      ...(input.effort ? { output_config: { effort: input.effort } } : {}),
    });
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
