/**
 * aux-llm — one small model call for auxiliary steps (intake now; Reception,
 * review and preflight later). ADR-019 §3.7 / §3.12.
 *
 * Why not streamLLM: it reads `ai.drafting_model` and lives in ai.service.ts,
 * which ADR-019 §3.12 says intake must not touch. This file holds no prompt
 * text — prompts live in intake.prompts.ts (legal content).
 *
 * Uses the same transport rules and the same stream parsers as streamLLM
 * (T-003): Helicone gateway with `stream_options.include_usage` when
 * HELICONE_API_KEY is set, the Anthropic SDK directly otherwise. Streaming is
 * used even for these short calls because that is the path the T-003 spike
 * verified returns usage through Helicone.
 */
import Anthropic from '@anthropic-ai/sdk';

import { env } from '../config/env';

import {
  estimateOutputTokens,
  parseAnthropicStreamEvent,
  parseOpenAIStreamLine,
} from './llm-usage';

const directClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export interface AuxCallInput {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  /** Helicone-* headers; ignored on the direct path. */
  heliconeHeaders?: Record<string, string>;
}

export interface AuxCallUsage {
  inputTokens: number;
  outputTokens: number;
  usageSource: 'provider' | 'estimated';
  transport: 'helicone' | 'direct';
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
  const transport: AuxCallUsage['transport'] = env.HELICONE_API_KEY ? 'helicone' : 'direct';
  let text = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let sawUsage = false;

  const usageNow = (): AuxCallUsage => ({
    inputTokens,
    outputTokens: sawUsage ? outputTokens : text ? estimateOutputTokens(text) : 0,
    usageSource: sawUsage ? 'provider' : 'estimated',
    transport,
  });

  try {
    if (transport === 'helicone') {
      const resp = await fetch(env.HELICONE_GATEWAY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.HELICONE_API_KEY}`,
          ...(input.heliconeHeaders ?? {}),
        },
        body: JSON.stringify({
          model: input.model,
          max_tokens: input.maxTokens,
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.user },
          ],
        }),
      });
      if (!resp.ok) {
        // The body is not read into the message: it can echo the request.
        throw new Error(`Helicone AI Gateway ${resp.status}`);
      }
      if (!resp.body) throw new Error('Helicone AI Gateway returned no response body');
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ') || line.trim() === 'data: [DONE]') continue;
          try {
            const f = parseOpenAIStreamLine(JSON.parse(line.slice(6)));
            if (f.text) text += f.text;
            if (f.inputTokens !== undefined) {
              inputTokens = f.inputTokens;
              sawUsage = true;
            }
            if (f.outputTokens !== undefined) {
              outputTokens = f.outputTokens;
              sawUsage = true;
            }
          } catch {
            // malformed SSE line — skip
          }
        }
      }
    } else {
      const stream = await directClient.messages.stream({
        model: input.model,
        max_tokens: input.maxTokens,
        system: input.system,
        messages: [{ role: 'user', content: input.user }],
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
      }
    }
  } catch (err) {
    throw new AuxCallError(err instanceof Error ? err.message : 'aux call failed', usageNow());
  }

  return { text, ...usageNow() };
}
