/**
 * AI Document Generation Service — Two Pipelines
 *
 * LEGACY pipeline (streamGenerateDocument):
 *   Layer 1: Prompt Assembly (prompt-assembler.ts)
 *   Layer 2: Post-Processing (post-processor.ts)
 *   Layer 3: Validation (validator.ts)
 *
 * CONFIG-DRIVEN pipeline (streamGenerateFromTemplate) — SCRUM-43:
 *   Reads template config JSON → renders template sections (zero AI)
 *   → AI generates only ai_generated sections → validates → assembles
 *
 * This file orchestrates both pipelines and handles streaming.
 */
import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';

import bnsMapping from '../config/bns-mapping.json';
import { env } from '../config/env';
import { Court } from '../models/Court.model';
import type { RunType } from '../models/Generation.model';

import { APP_SETTING_KEYS, AppSettingMissingError, getAppSetting } from './app-settings.service';
import {
  estimateOutputTokens,
  parseAnthropicStreamEvent,
  parseOpenAIStreamLine,
  UsageMeter,
  UsageTotals,
} from './llm-usage';
import { postProcess } from './post-processor';
import { assemblePrompt, PromptInput } from './prompt-assembler';
import { convertOldReferencesInText } from './sections.service';
import {
  TemplateConfig,
  RenderedSection,
  CourtLookupData,
  buildPlaceholderContext,
  renderTemplateSection,
  buildAISystemPrompt,
  buildAIUserPrompt,
  assembleDocument,
  detectCoherenceMismatches,
  loadCourtRule,
  detectLeakedPlaceholders,
  sanitiseAIBody,
} from './template-engine.service';
import {
  validate,
  ValidationWarning,
  detectOldLawReferences,
  buildSectionsCited,
  extractBNSSectionNumbers,
  validateBNSWhitelist,
  checkFactSectionSanity,
} from './validator';

/**
 * Anthropic SDK client — used only when HELICONE_API_KEY is NOT set (direct API calls).
 */
const directClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

/**
 * Draft usage for one streamLLM call. Passed in by the caller and mutated in
 * place as usage data arrives, so a mid-stream throw still leaves whatever was
 * captured up to that point on the object the caller holds a reference to —
 * this is how "tokens used so far" survives a failed generation (T-003).
 * `usageSource` stays 'none' until the provider actually reports a number;
 * the caller (the pipeline, via UsageMeter) falls back to estimating output
 * tokens from the accumulated text when it's still 'none' after the call.
 */
export interface CallUsageDraft {
  inputTokens: number;
  outputTokens: number;
  usageSource: 'provider' | 'none';
  /** Resolved model id and transport for this call — same for every call in one request. */
  model?: string;
  transport?: 'direct' | 'helicone';
}

/**
 * Stream text tokens from the LLM.
 *
 * - When HELICONE_API_KEY is set: calls Helicone AI Gateway (OpenAI-compat endpoint)
 *   using native fetch — this is the same endpoint verified working in Postman.
 * - When not set: falls back to Anthropic SDK directly.
 *
 * Yields raw text chunks as they arrive. If `usage` is passed, it's updated
 * in place as token counts become available (never with prompt/document text —
 * only the numeric counts the provider reports). Parsing itself lives in
 * llm-usage.ts as pure functions so it's tested without a network.
 */
export async function* streamLLM(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  trackingHeaders: Record<string, string> = {},
  usage?: CallUsageDraft,
): AsyncGenerator<string> {
  // Model lives in the AppSetting Mongo collection — NOT in env or in the
  // codebase (per founder instruction 2026-05-11). If unset, getAppSetting
  // throws AppSettingMissingError which propagates to the route → emitted as
  // SSE `event: error` so the advocate sees a clear "configure ai.drafting_model
  // in /admin/ai-config" message.
  const model = await getAppSetting(APP_SETTING_KEYS.DRAFTING_MODEL);
  const transport: CallUsageDraft['transport'] = env.HELICONE_API_KEY ? 'helicone' : 'direct';
  if (usage) {
    usage.model = model;
    usage.transport = transport;
  }

  if (env.HELICONE_API_KEY) {
    // Helicone AI Gateway — OpenAI-compatible, supports Claude model aliases.
    // stream_options.include_usage asks for a final chunk carrying token
    // counts (OpenAI streaming convention) — without it the gateway never
    // reports usage on a streamed response. Confirmed live against the real
    // gateway (T-003 spike, 3 Oct 2026): works when `model` is a full dated
    // model id — a bare alias can make the gateway switch providers, or 500.
    const resp = await fetch(env.HELICONE_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.HELICONE_API_KEY}`,
        ...trackingHeaders,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Helicone AI Gateway ${resp.status}: ${err}`);
    }

    if (!resp.body) throw new Error('Helicone AI Gateway returned no response body');
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ') || line.trim() === 'data: [DONE]') continue;
        try {
          const fragment = parseOpenAIStreamLine(JSON.parse(line.slice(6)));
          if (fragment.text) yield fragment.text;
          if (
            usage &&
            (fragment.inputTokens !== undefined || fragment.outputTokens !== undefined)
          ) {
            if (fragment.inputTokens !== undefined) usage.inputTokens = fragment.inputTokens;
            if (fragment.outputTokens !== undefined) usage.outputTokens = fragment.outputTokens;
            usage.usageSource = 'provider';
          }
        } catch {
          // malformed SSE line — skip
        }
      }
    }
  } else {
    // Direct Anthropic SDK — no proxy. Usage arrives incrementally on
    // message_start (initial input_tokens) and message_delta (cumulative
    // output_tokens near the end) — reading it off these events rather than
    // only from stream.finalMessage() means a mid-stream throw still leaves
    // the last-seen counts on `usage`. Confirmed live (T-003 spike).
    const stream = await directClient.messages.stream({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    for await (const event of stream) {
      const fragment = parseAnthropicStreamEvent(event);
      if (fragment.text) yield fragment.text;
      if (usage && (fragment.inputTokens !== undefined || fragment.outputTokens !== undefined)) {
        if (fragment.inputTokens !== undefined) usage.inputTokens = fragment.inputTokens;
        if (fragment.outputTokens !== undefined) usage.outputTokens = fragment.outputTokens;
        usage.usageSource = 'provider';
      }
    }
  }
}

// ── AI error classification ────────────────────────────────────────────────
//
// Surfaces a user-readable reason + a retryable flag for every kind of failure
// the LLM stream can produce (Helicone gateway non-2xx, Anthropic 429/5xx,
// network/socket drop, missing response body, etc). The route handler emits
// this via `event: error` SSE; the frontend renders it in the
// generation_failed pipeline state.

interface ClassifiedLlmError {
  /** Stable code for telemetry / future translation */
  code:
    | 'rate_limited'
    | 'provider_unavailable'
    | 'auth'
    | 'invalid_request'
    | 'network'
    | 'unknown';
  /** One-line copy shown directly to the advocate */
  userMessage: string;
  /** Whether re-clicking "Try again" is likely to succeed */
  retryable: boolean;
}

function classifyLlmError(err: unknown): ClassifiedLlmError {
  // App-setting missing — model not configured in DB. Surface the exact key
  // so the founder knows what to set in /admin/ai-config.
  if (err instanceof AppSettingMissingError) {
    return {
      code: 'auth',
      userMessage: `AI model is not configured. The founder must set "${err.key}" in /admin/ai-config before drafts can be generated.`,
      retryable: false,
    };
  }

  const msg = err instanceof Error ? err.message : String(err);

  // Helicone gateway throws "Helicone AI Gateway <status>: <body>"
  const heliconeStatus = msg.match(/Helicone AI Gateway (\d{3})/);
  const status = heliconeStatus ? parseInt(heliconeStatus[1], 10) : undefined;

  if (status === 429 || /rate.?limit|too many requests/i.test(msg)) {
    return {
      code: 'rate_limited',
      userMessage:
        'The AI service is currently rate-limited. Please wait a few seconds and try again.',
      retryable: true,
    };
  }
  if ((status && status >= 500) || /overload|unavailable|temporarily/i.test(msg)) {
    return {
      code: 'provider_unavailable',
      userMessage:
        'The AI service is temporarily unavailable. Please try again in a moment — your inputs are saved.',
      retryable: true,
    };
  }
  if (status === 401 || status === 403 || /unauthorized|forbidden|invalid.?api.?key/i.test(msg)) {
    return {
      code: 'auth',
      userMessage:
        'The drafting service could not authenticate with the AI provider. Please contact support — this is a server-side configuration issue.',
      retryable: false,
    };
  }
  if (status === 400 || /invalid.?request|bad.?request|context.?length|max.?tokens/i.test(msg)) {
    return {
      code: 'invalid_request',
      userMessage:
        'The AI rejected the prompt for this draft. Try shortening the facts narrative, then generate again.',
      retryable: false,
    };
  }
  if (
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket hang up|no response body/i.test(
      msg,
    )
  ) {
    return {
      code: 'network',
      userMessage: 'Network error reaching the AI service. Check your connection and try again.',
      retryable: true,
    };
  }
  return {
    code: 'unknown',
    userMessage:
      'The AI service returned an unexpected error. Please try again. If this keeps happening, contact support.',
    retryable: true,
  };
}

/** Sentinel thrown after a mid-stream LLM failure so the route handler knows
 *  the SSE has already been ended and not to re-emit `done`. Carries whatever
 *  usage was captured before the failure (T-003) so the route can still
 *  record a Generation row for the attempt instead of losing it. */
export class GenerationFailedError extends Error {
  readonly code: ClassifiedLlmError['code'];
  readonly usage: UsageTotals;
  readonly aiModel?: string;
  readonly transport?: 'direct' | 'helicone';
  constructor(
    message: string,
    code: ClassifiedLlmError['code'],
    usage: UsageTotals,
    aiModel?: string,
    transport?: 'direct' | 'helicone',
  ) {
    super(message);
    this.name = 'GenerationFailedError';
    this.code = code;
    this.usage = usage;
    this.aiModel = aiModel;
    this.transport = transport;
  }
}

/**
 * Build per-request Helicone tracking headers for the AI Gateway — including
 * the run id/sequence (T-003 §3.8) so our rows can be cross-checked against
 * Helicone's own records.
 */
function heliconeHeaders(
  userId?: string,
  templateId?: string,
  runId?: string,
  runSequence?: number,
  runType?: RunType,
): Record<string, string> {
  if (!env.HELICONE_API_KEY) return {};
  const headers: Record<string, string> = {};
  if (userId) headers['Helicone-User-Id'] = userId;
  if (templateId) headers['Helicone-Property-Template'] = templateId;
  if (runId) headers['Helicone-Property-Run-Id'] = runId;
  if (runSequence !== undefined) headers['Helicone-Property-Run-Sequence'] = String(runSequence);
  if (runType) headers['Helicone-Property-Run-Type'] = runType; // T-110
  return headers;
}

export type DocTypeKey = keyof typeof bnsMapping;

export interface GenerateDocumentInput extends PromptInput {
  userId?: string;
  runId: string;
  runSequence: number;
  /** T-110 */
  runType: RunType;
}

export interface GenerateDocumentResult {
  /** Full formatted text (after post-processing) */
  fullText: string;
  /** Filing checklist items from document-rule config */
  filingChecklist: string[];
  /** Sections cited in the document (for DB storage) */
  sectionsCited: string[];
  /** Whether all mandatory clauses were found */
  mandatoryClausesComplete: boolean;
  /** Validation warnings (old-law refs, unknown sections, missing clauses) */
  warnings: ValidationWarning[];
  /** Real token usage for this generation (T-003) */
  usage: UsageTotals;
  aiModel?: string;
  transport?: 'direct' | 'helicone';
}

/**
 * Legacy validateBnsSections — kept for backwards compatibility.
 * The new validator.ts provides richer validation.
 */
export function validateBnsSections(docType: string, generatedText: string): string[] {
  // bns-mapping.json now carries non-doctype keys (_meta, alias maps) that the
  // TS type widens into the union. Narrow with a structural guard so the legacy
  // doc-type-keyed lookup still works.
  const mapping = bnsMapping[docType as DocTypeKey] as
    | { sections?: { number: string; description?: string }[] }
    | undefined;
  if (!mapping || !Array.isArray(mapping.sections)) return [];

  const knownSections = new Set(mapping.sections.map((s) => s.number));
  const sectionPattern = /(?:section|sec\.?|u\/s)\s+(\d+[A-Z]?(?:\([a-z0-9]+\))?)/gi;
  const matches = [...generatedText.matchAll(sectionPattern)];
  const mentioned = matches.map((m) => m[1]);

  const unmatched = mentioned.filter((s) => !knownSections.has(s));
  return [...new Set(unmatched)];
}

/**
 * Stream a document generation response using the three-layer pipeline.
 *
 * Flow:
 * 1. Layer 1: Assemble prompt from modular configs
 * 2. Stream AI response to client
 * 3. Layer 2: Post-process the complete text (formatting, verification, advocate block)
 * 4. Layer 3: Validate (section refs, old-law detection, mandatory clauses)
 * 5. Send post-processed appendages + validation warnings + done event
 */
export async function streamGenerateDocument(
  input: GenerateDocumentInput,
  res: Response,
): Promise<GenerateDocumentResult> {
  // ── Layer 1: Prompt Assembly ────────────────────────────────────────────────
  const { systemPrompt, userPrompt, docRule, courtRule } = await assemblePrompt(input);

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // ── Stream AI Response ──────────────────────────────────────────────────────
  let rawText = '';
  const meter = new UsageMeter();
  const draft: CallUsageDraft = { inputTokens: 0, outputTokens: 0, usageSource: 'none' };

  try {
    for await (const text of streamLLM(
      systemPrompt,
      userPrompt,
      4096,
      heliconeHeaders(input.userId, input.docType, input.runId, input.runSequence, input.runType),
      draft,
    )) {
      rawText += text;
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    meter.record({
      sectionId: 'legacy',
      inputTokens: draft.inputTokens,
      outputTokens:
        draft.usageSource === 'provider' ? draft.outputTokens : estimateOutputTokens(rawText),
      usageSource: draft.usageSource === 'provider' ? 'provider' : 'estimated',
    });
  } catch (llmErr) {
    // Mirrors the config-driven pipeline's per-section handling below — SSE
    // headers are already on the wire so a 5xx status isn't possible; emit a
    // structured `event: error` instead. `draft` carries whatever was
    // captured before the failure so the route can still record it.
    meter.record({
      sectionId: 'legacy',
      inputTokens: draft.inputTokens,
      outputTokens:
        draft.usageSource === 'provider' ? draft.outputTokens : estimateOutputTokens(rawText),
      usageSource: draft.usageSource === 'provider' ? 'provider' : 'estimated',
    });
    const classified = classifyLlmError(llmErr);
    if (process.env.NODE_ENV !== 'test') {
      console.error(
        `[drafting] LLM stream failed (legacy generate, runId=${input.runId}, runSequence=${input.runSequence}, runType=${input.runType}):`,
        llmErr instanceof Error ? llmErr.message : llmErr,
      );
    }
    res.write(
      `event: error\ndata: ${JSON.stringify({
        reason: classified.userMessage,
        retryable: classified.retryable,
        code: classified.code,
        runId: input.runId,
      })}\n\n`,
    );
    // Not res.end() here — the route ends the response only after the
    // failed Generation row is persisted, so a fast retry's resolveRun
    // query is guaranteed to find this attempt rather than racing it.
    throw new GenerationFailedError(
      classified.userMessage,
      classified.code,
      meter.totals(),
      draft.model,
      draft.transport,
    );
  }

  // ── Layer 2: Post-Processing ────────────────────────────────────────────────
  // Detect DV/dowry cases for special prayer conditions (CLO fix #8)
  const dvKeywords =
    /498a|dowry|domestic violence|cruelty by husband|bns 85|bns 86|stridhan|dv act|pwdva/i;
  const isDvCase = dvKeywords.test(input.keyFacts) || dvKeywords.test(rawText);

  const { formattedText, filingChecklist, appendedSections } = postProcess({
    rawText,
    docRule,
    courtRule,
    partyDetails: input.partyDetails,
    advocateName: input.advocateName,
    advocateEnrollment: input.advocateEnrollment,
    courtName: input.courtName,
    isDvCase,
  });

  // Stream the post-processed appendages to the client
  // (verification, advocate block, disclaimer were appended to rawText)
  const appendedText = formattedText.slice(rawText.length);
  if (appendedText) {
    res.write(`data: ${JSON.stringify({ text: appendedText })}\n\n`);
  }

  // Send filing checklist as a separate event
  if (filingChecklist.length > 0) {
    res.write(`event: checklist\ndata: ${JSON.stringify({ items: filingChecklist })}\n\n`);
  }

  // Send appended sections info for transparency
  if (appendedSections.length > 0) {
    res.write(`event: postprocess\ndata: ${JSON.stringify({ appendedSections })}\n\n`);
  }

  // ── Layer 3: Validation ─────────────────────────────────────────────────────
  const validationResult = await validate(formattedText, docRule);

  // Send validation warnings
  if (validationResult.warnings.length > 0) {
    res.write(
      `event: warning\ndata: ${JSON.stringify({ warnings: validationResult.warnings })}\n\n`,
    );
  }

  // NOTE: done event and res.end() are handled by the route handler
  // so it can include the docId after persisting to DB.

  return {
    fullText: formattedText,
    filingChecklist,
    sectionsCited: validationResult.sectionsCited,
    mandatoryClausesComplete: validationResult.mandatoryClausesComplete,
    warnings: validationResult.warnings,
    usage: meter.totals(),
    aiModel: draft.model,
    transport: draft.transport,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG-DRIVEN PIPELINE (SCRUM-43)
// Template JSON drives everything — form, prompts, formatting, validation.
// AI generates ONLY sections marked type: ai_generated.
// ═══════════════════════════════════════════════════════════════════════════

export interface TemplateGenerateInput {
  templateConfig: TemplateConfig;
  formData: Record<string, unknown>;
  advocateName?: string;
  enrollmentNumber?: string;
  userId?: string;
  runId: string;
  runSequence: number;
  /** T-110 */
  runType: RunType;
}

export interface TemplateGenerateResult {
  fullText: string;
  sections: RenderedSection[];
  filingChecklist: string[];
  sectionsCited: string[];
  mandatoryClausesComplete: boolean;
  warnings: ValidationWarning[];
  /** Real token usage summed across every ai_generated section's LLM call (T-003) */
  usage: UsageTotals;
  aiModel?: string;
  transport?: 'direct' | 'helicone';
  /** Paragraph count of the final draft, from assembleDocument */
  bodyParaCount: number;
}

/**
 * Stream a document generation using the config-driven pipeline.
 *
 * Flow:
 * 1. Build placeholder context from form data + computed fields
 * 2. Auto-convert old-law references in text fields
 * 3. Render all template sections (zero AI — placeholder replacement only)
 * 4. Stream AI for ai_generated sections
 * 5. Assemble full document in section order
 * 6. Validate per template's validation_rules
 * 7. Send SSE events (checklist, warnings, done)
 */
export async function streamGenerateFromTemplate(
  input: TemplateGenerateInput,
  res: Response,
): Promise<TemplateGenerateResult> {
  const { templateConfig, formData, advocateName, enrollmentNumber } = input;

  // ── Auto-convert old-law references in text fields ─────────────────────────
  const convertedFormData = { ...formData };
  if (templateConfig.validation_rules.auto_convert_old_to_new) {
    for (const step of templateConfig.form_schema.steps) {
      for (const field of step.fields) {
        if (
          field.auto_convert_old &&
          typeof convertedFormData[field.field_id] === 'string' &&
          (convertedFormData[field.field_id] as string).length > 0
        ) {
          const { converted } = await convertOldReferencesInText(
            convertedFormData[field.field_id] as string,
          );
          convertedFormData[field.field_id] = converted;
        }
      }
    }
  }

  // ── Look up court data from DB (SCRUM-50) ─────────────────────────────────
  let courtData: CourtLookupData | undefined;
  const courtId = String(convertedFormData.court_name ?? '');
  if (courtId) {
    try {
      const court = await Court.findOne({ courtId, isActive: true }).maxTimeMS(5000).lean();
      if (court) {
        const courtRule = loadCourtRule(court.formattingRulesRef);
        courtData = {
          designation: court.designation,
          city: court.city,
          caseNomenclature: court.caseNomenclature,
          formattingRulesRef: court.formattingRulesRef,
          courtRule: courtRule ?? undefined,
        };
      }
    } catch (dbErr) {
      console.warn(
        `[drafting] Court lookup failed for "${courtId}", using defaults:`,
        dbErr instanceof Error ? dbErr.message : dbErr,
      );
    }
  }

  // ── Build placeholder context ──────────────────────────────────────────────
  const ctx = buildPlaceholderContext(
    templateConfig,
    convertedFormData,
    {
      advocateName,
      enrollmentNumber,
    },
    courtData,
  );

  // ── Set up SSE headers ─────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // ── Render all sections ────────────────────────────────────────────────────
  const renderedSections: RenderedSection[] = [];
  const meter = new UsageMeter();
  let aiModel: string | undefined;
  let transport: 'direct' | 'helicone' | undefined;

  for (const section of templateConfig.document_structure.sections) {
    if (section.type === 'template') {
      // Pure placeholder replacement — zero AI
      const rendered = renderTemplateSection(section, ctx);
      renderedSections.push(rendered);
    } else if (section.type === 'ai_generated') {
      // Stream AI generation for this section
      const systemPrompt = buildAISystemPrompt(templateConfig, courtData?.courtRule);
      const userPrompt = buildAIUserPrompt(section, ctx);

      let aiText = '';
      const draft: CallUsageDraft = { inputTokens: 0, outputTokens: 0, usageSource: 'none' };

      try {
        for await (const text of streamLLM(
          systemPrompt,
          userPrompt,
          8192,
          heliconeHeaders(
            input.userId,
            templateConfig.template_id,
            input.runId,
            input.runSequence,
            input.runType,
          ),
          draft,
        )) {
          aiText += text;
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
        aiModel = draft.model;
        transport = draft.transport;
        meter.record({
          sectionId: section.section_id,
          inputTokens: draft.inputTokens,
          outputTokens:
            draft.usageSource === 'provider' ? draft.outputTokens : estimateOutputTokens(aiText),
          usageSource: draft.usageSource === 'provider' ? 'provider' : 'estimated',
        });
      } catch (llmErr) {
        // AI provider / Helicone / network failure mid-stream. SSE headers are
        // already on the wire so we CAN'T set a 5xx status — emit a structured
        // `event: error` instead. The frontend renders this in the
        // generation_failed pipeline state with the reason + a retry button.
        // Count this attempt and fold in whatever tokens it captured before
        // throwing, so the caller can still record a Generation row for it.
        aiModel = draft.model;
        transport = draft.transport;
        meter.record({
          sectionId: section.section_id,
          inputTokens: draft.inputTokens,
          outputTokens:
            draft.usageSource === 'provider' ? draft.outputTokens : estimateOutputTokens(aiText),
          usageSource: draft.usageSource === 'provider' ? 'provider' : 'estimated',
        });
        const classified = classifyLlmError(llmErr);
        if (process.env.NODE_ENV !== 'test') {
          console.error(
            `[drafting] LLM stream failed (section ${section.section_id}, runId=${input.runId}, runSequence=${input.runSequence}, runType=${input.runType}):`,
            llmErr instanceof Error ? llmErr.message : llmErr,
          );
        }
        res.write(
          `event: error\ndata: ${JSON.stringify({
            section: section.section_id,
            reason: classified.userMessage,
            retryable: classified.retryable,
            code: classified.code,
            runId: input.runId,
          })}\n\n`,
        );
        // Not res.end() here — the route ends the response only after the
        // failed Generation row is persisted, so a fast retry's resolveRun
        // query is guaranteed to find this attempt rather than racing it.
        throw new GenerationFailedError(
          classified.userMessage,
          classified.code,
          meter.totals(),
          aiModel,
          transport,
        );
      }

      // SCRUM-62: strip duplicate cause-title (A7) and disclaimer (A6) injected by AI
      renderedSections.push({
        section_id: section.section_id,
        type: 'ai_generated',
        content: sanitiseAIBody(aiText),
        alignment: section.alignment,
      });
    }
  }

  // ── Assemble full document ─────────────────────────────────────────────────
  const { fullText, bodyParaCount } = assembleDocument(renderedSections);

  // Update body_para_count in the context and re-render verification if needed
  ctx.body_para_count = String(bodyParaCount);

  // Stream the template sections (cause title, prayer, verification, etc.)
  // These come AFTER the AI body in the SSE stream
  const templateParts: string[] = [];
  for (const section of renderedSections) {
    if (section.type === 'template') {
      // Replace any remaining {body_para_count} references
      let content = section.content;
      if (content.includes('{body_para_count}')) {
        content = content.replace(/\{body_para_count\}/g, String(bodyParaCount));
      }
      templateParts.push(content);
    }
  }

  // Send template sections as a structured event (frontend assembles the final doc)
  res.write(
    `event: template_sections\ndata: ${JSON.stringify({
      sections: renderedSections.map((s) => ({
        section_id: s.section_id,
        type: s.type,
        content:
          s.type === 'template' && s.content.includes('{body_para_count}')
            ? s.content.replace(/\{body_para_count\}/g, String(bodyParaCount))
            : s.content,
        alignment: s.alignment,
        style: s.style,
      })),
    })}\n\n`,
  );

  // ── Filing checklist from config ───────────────────────────────────────────
  const filingChecklist = templateConfig.filing_checklist.map((item) =>
    item.replace(/\{(\w+)\}/g, (_m, key: string) => ctx[key] ?? '_____'),
  );

  if (filingChecklist.length > 0) {
    res.write(`event: checklist\ndata: ${JSON.stringify({ items: filingChecklist })}\n\n`);
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  const allWarnings: ValidationWarning[] = [];

  // SCRUM-54 B1: Detect placeholder leakage in template sections
  for (const section of templateConfig.document_structure.sections) {
    if (section.type === 'template' && section.template) {
      const leaked = detectLeakedPlaceholders(section.template, ctx);
      for (const key of leaked) {
        allWarnings.push({
          type: 'missing_clause',
          message: `Unfilled placeholder "{${key}}" in section "${section.section_id}". Please provide this field or it will appear as a blank in the document.`,
          details: { clauseId: key },
        });
      }
    }
  }

  // Check for old-law references in AI-generated text
  const aiSections = renderedSections.filter((s) => s.type === 'ai_generated');
  const aiText = aiSections.map((s) => s.content).join('\n');

  const oldLawWarnings = await detectOldLawReferences(aiText);
  allWarnings.push(...oldLawWarnings);

  // SCRUM-64 (b): BNS whitelist validation — flag hallucinated section numbers
  const bnsCited = extractBNSSectionNumbers(aiText);
  const bnsWhitelistWarnings = validateBNSWhitelist(bnsCited);
  allWarnings.push(...bnsWhitelistWarnings);

  // SCRUM-64 (c): Fact↔section sanity — BNS 103 (Murder) requires death keywords in facts
  if (templateConfig.category === 'criminal') {
    const factsNarrative = String(convertedFormData.facts_narrative ?? '');
    const sanitySanityWarnings = checkFactSectionSanity(factsNarrative, bnsCited);
    allWarnings.push(...sanitySanityWarnings);
  }

  // SCRUM-67: Grounds-vs-facts coherence — emit a warning per mismatch so the
  // frontend can show review chips on the editor. The actual prompt-side
  // reconciliation already happened in buildAIUserPrompt before generation.
  const groundsValue =
    convertedFormData.grounds_for_bail ??
    convertedFormData.grounds_for_quashing ??
    convertedFormData.grounds;
  const factsForCoherence = String(
    convertedFormData.facts_narrative ?? convertedFormData.facts ?? '',
  );
  if (groundsValue && factsForCoherence) {
    const coherenceMismatches = detectCoherenceMismatches(
      groundsValue as string | string[],
      factsForCoherence,
    );
    for (const m of coherenceMismatches) {
      allWarnings.push({
        type: 'coherence_mismatch',
        message: m.warning_message,
        details: { rule: m.rule_id, ground: m.ground_label },
      });
    }
  }

  const sectionsCited = buildSectionsCited(fullText);

  // Check mandatory sections from validation_rules
  const mandatorySections = templateConfig.validation_rules.mandatory_sections;
  const renderedIds = new Set(renderedSections.map((s) => s.section_id));
  let mandatoryClausesComplete = true;
  for (const required of mandatorySections) {
    if (!renderedIds.has(required)) {
      mandatoryClausesComplete = false;
      allWarnings.push({
        type: 'missing_clause',
        message: `Required section "${required}" is missing from the document.`,
        details: { clauseId: required },
      });
    }
  }

  // Check min body paragraphs
  if (templateConfig.validation_rules.min_body_paragraphs) {
    if (bodyParaCount < templateConfig.validation_rules.min_body_paragraphs) {
      allWarnings.push({
        type: 'missing_clause',
        message: `Body has ${bodyParaCount} paragraphs (minimum: ${templateConfig.validation_rules.min_body_paragraphs}).`,
      });
    }
  }

  // Fact-alteration check: compare user-provided facts against AI output
  if (templateConfig.validation_rules.fact_alteration_check) {
    const factsField = convertedFormData.facts_narrative;
    if (typeof factsField === 'string' && factsField.length > 0) {
      const factAlterationWarning = checkFactAlteration(factsField, aiText);
      if (factAlterationWarning) {
        allWarnings.push(factAlterationWarning);
      }
    }
  }

  // Identity-preservation check: applicant_name and father_name must appear in AI body
  if (aiText.length > 0) {
    const applicantName = String(convertedFormData.applicant_name ?? '');
    if (applicantName && !aiText.includes(applicantName)) {
      allWarnings.push({
        type: 'fact_alteration',
        message: `AI body does not contain the applicant name "${applicantName}" as provided in form data. The AI may have substituted party identity.`,
        details: { field: 'applicant_name', expected: applicantName },
      });
    }
    const fatherName = String(convertedFormData.father_name ?? '');
    if (fatherName && !aiText.includes(fatherName)) {
      allWarnings.push({
        type: 'fact_alteration',
        message: `AI body does not contain the father name "${fatherName}" as provided in form data. The AI may have invented a different parentage.`,
        details: { field: 'father_name', expected: fatherName },
      });
    }
  }

  if (allWarnings.length > 0) {
    res.write(`event: warning\ndata: ${JSON.stringify({ warnings: allWarnings })}\n\n`);
  }

  return {
    fullText,
    sections: renderedSections,
    filingChecklist,
    sectionsCited,
    mandatoryClausesComplete,
    warnings: allWarnings,
    usage: meter.totals(),
    aiModel,
    transport,
    bodyParaCount,
  };
}

/**
 * Basic fact-alteration check: extract key entities (numbers, dates, names in caps)
 * from user facts and verify they appear in AI output.
 *
 * SCRUM-54 B4: Dates are normalised to DD.MM.YYYY in the AI prompt context,
 * so we check all equivalent representations of each date (ISO, DD.MM.YYYY, DD/MM/YYYY).
 */
function checkFactAlteration(userFacts: string, aiOutput: string): ValidationWarning | null {
  // Extract FIR numbers, dates, and proper nouns from user input
  const firPattern = /\b\d+\/\d{4}\b/g;
  const datePattern = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g;

  const firNumbers = userFacts.match(firPattern) ?? [];
  const dates = userFacts.match(datePattern) ?? [];

  const missing: string[] = [];

  for (const fir of firNumbers) {
    if (!aiOutput.includes(fir)) {
      missing.push(`FIR number ${fir}`);
    }
  }

  for (const date of dates) {
    // Generate all common format variants of this date for comparison
    const variants = getDateVariants(date);
    const found = variants.some((v) => aiOutput.includes(v));
    if (!found) {
      missing.push(`Date ${date}`);
    }
  }

  if (missing.length > 0) {
    return {
      type: 'missing_clause',
      message: `Fact-alteration warning: the following user-provided details may not appear in the AI draft: ${missing.join(', ')}. Please verify.`,
    };
  }

  return null;
}

/**
 * Given a date string in any common format, return all equivalent representations
 * so the fact-alteration check doesn't false-positive on format differences.
 */
function getDateVariants(dateStr: string): string[] {
  const variants = [dateStr];
  const parts = dateStr.split(/[/.-]/);
  if (parts.length !== 3) return variants;

  let day: string, month: string, year: string;

  // Detect format: YYYY-MM-DD (ISO) vs DD/MM/YYYY or DD.MM.YYYY
  if (parts[0].length === 4) {
    // ISO format: YYYY-MM-DD
    [year, month, day] = parts;
  } else {
    // Indian format: DD/MM/YYYY or DD.MM.YYYY
    [day, month, year] = parts;
  }

  // Normalise to 2-digit day/month
  day = day.padStart(2, '0');
  month = month.padStart(2, '0');
  if (year.length === 2) year = `20${year}`;

  // All common output formats
  variants.push(`${day}.${month}.${year}`); // DD.MM.YYYY
  variants.push(`${day}/${month}/${year}`); // DD/MM/YYYY
  variants.push(`${day}-${month}-${year}`); // DD-MM-YYYY
  variants.push(`${year}-${month}-${day}`); // YYYY-MM-DD (ISO)

  return [...new Set(variants)];
}
