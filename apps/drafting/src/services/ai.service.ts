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
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import type { AutoParseableOutputFormat } from '@anthropic-ai/sdk/lib/parser';
import type { LedgerFact, LedgerUnresolvedFact } from '@lawie/shared';
import { Response } from 'express';

import bnsMapping from '../config/bns-mapping.json';
import { env } from '../config/env';
import { Court } from '../models/Court.model';
import type { FactDiffPath } from '../models/FactDiff.model';
import type { RunType } from '../models/Generation.model';
import type { LoadSkeleton, Skeleton } from '../types/skeleton';
import { startSseKeepAlive } from '../utils/sse-keepalive';

import { APP_SETTING_KEYS, AppSettingMissingError, getAppSetting } from './app-settings.service';
import { AvermentLists, resolveAverments } from './averments';
import {
  briefText,
  buildDrafterUserPrompt,
  buildLedgerDrafterUserPrompt,
  buildLedgerRepairUserPrompt,
  ledgerCitationSources,
  ledgerDrafterFacts,
  LedgerDrafterPromptInput,
  ledgerFactText,
  ledgerSkeletonBrief,
  checkCourtProvisions,
  courtProvisions,
  buildGuidedDrafterUserPrompt,
  buildRepairUserPrompt,
  checkAgainstBrief,
  checkBriefIsUsed,
  checkOneDocument,
  checkPeriods,
  DrafterPromptInput,
  drafterBrief,
  findMissingClauses,
  formDataFromBrief,
  guidedDrafterBrief,
  keepsEveryParagraph,
  labelReason,
  MissingClause,
  missingFromRendered,
  needsStartingDraftLabel,
  packTexts,
  paragraphNumbers,
  recordAgainAfterCodeEdit,
  removeRepeatedParts,
  splitDrafterOutput,
  systemParts,
  systemTextAround,
  TrailerFilter,
  withoutDisclaimers,
  withoutDisclaimerText,
} from './brief-drafter';
import { citationWarnings, removeUngivenCitations } from './citation-check';
import {
  buildDraftParagraphsSchema,
  D1DrafterFact,
  d1DrafterFacts,
  draftFactRefs,
  DraftParagraphsOutput,
  packOptionIds,
  readDraftParagraphs,
  RenderedClause,
  renderDraft,
  skeletonTexts,
  skeletonValueLists,
  statedByValueIn,
} from './draft-renderer';
import {
  DRAFTER_D1_SYSTEM_PROMPT,
  DRAFTER_GUIDED_SYSTEM_PROMPT,
  DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT,
  DRAFTER_LEDGER_SYSTEM_PROMPT,
  DRAFTER_PACK_SYSTEM_PROMPT,
  DRAFTER_REPAIR_SYSTEM_PROMPT,
} from './drafter.prompts';
import {
  FactCheckOutcome,
  FactDiffDraft,
  FactViolation,
  splitParagraphs,
  verifyAndRepair,
  verifyDraft,
} from './fact-verifier';
import { Brief, buildChecklist, FIXED_KEYS } from './intake-brief';
import {
  estimateOutputTokens,
  parseAnthropicMessageUsage,
  parseAnthropicStreamEvent,
  UsageMeter,
  UsageTotals,
} from './llm-usage';
import { postProcess } from './post-processor';
import { assemblePrompt, PromptInput } from './prompt-assembler';
import { loadSkeleton as loadSignedSkeleton } from './rule-pack.service';
import type { RulePack } from './rule-pack.service';
import { convertOldReferencesInText } from './sections.service';
import {
  TemplateConfig,
  RenderedSection,
  CourtLookupData,
  buildPlaceholderContext,
  sectionContext,
  renderTemplateSection,
  buildAISystemPrompt,
  buildAIUserPrompt,
  assembleDocument,
  detectCoherenceMismatches,
  loadCourtRule,
  detectLeakedPlaceholders,
  sanitiseAIBody,
  promptPartyDesignations,
  TO_BE_CONFIRMED_DESIGNATION_RULE,
  CourtRuleData,
  PLACEHOLDER_ALIASES,
  MONTH_NAMES,
} from './template-engine.service';
import {
  validate,
  ValidationWarning,
  buildSectionsCited,
  extractBNSSectionNumbers,
  checkDraftCitations,
  checkFactSectionSanity,
} from './validator';

/**
 * Anthropic SDK client — every model call goes straight to Anthropic (T-118).
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
  transport?: 'direct';
}

/**
 * Stream text tokens from the LLM, calling the Anthropic SDK directly (T-118).
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
  usage?: CallUsageDraft,
): AsyncGenerator<string> {
  // Model lives in the AppSetting Mongo collection — NOT in env or in the
  // codebase (per founder instruction 2026-05-11). If unset, getAppSetting
  // throws AppSettingMissingError which propagates to the route → emitted as
  // SSE `event: error` so the advocate sees a clear "configure ai.drafting_model
  // in /admin/ai-config" message.
  const model = await getAppSetting(APP_SETTING_KEYS.DRAFTING_MODEL);
  if (usage) {
    usage.model = model;
    usage.transport = 'direct';
  }

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

// ── AI error classification ────────────────────────────────────────────────
//
// Surfaces a user-readable reason + a retryable flag for every kind of failure
// the LLM stream can produce (Anthropic 429/5xx, network/socket drop, etc).
// Classification is by the SDK error's HTTP status, then by message text.
// The route handler emits
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

/**
 * HTTP status of a failed Anthropic call, read from the SDK's own error
 * (`Anthropic.APIError.status`). Undefined for anything else, including a
 * connection error, which the SDK raises with no status. The typeof guard
 * keeps this safe when the SDK module is replaced by a stub without APIError.
 */
function providerStatus(err: unknown): number | undefined {
  const APIError = Anthropic.APIError;
  if (typeof APIError !== 'function' || !(err instanceof APIError)) return undefined;
  return typeof err.status === 'number' ? err.status : undefined;
}

/**
 * True for the SDK's connection failures (`Anthropic.APIConnectionError` and
 * its subclass `APIConnectionTimeoutError`), which carry no HTTP status.
 * Guarded like providerStatus for a stubbed SDK module.
 */
function isProviderConnectionError(err: unknown): boolean {
  const classes = [Anthropic.APIConnectionError, Anthropic.APIConnectionTimeoutError];
  return classes.some((C) => typeof C === 'function' && err instanceof C);
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

  const RATE_LIMITED: ClassifiedLlmError = {
    code: 'rate_limited',
    userMessage:
      'The AI service is currently rate-limited. Please wait a few seconds and try again.',
    retryable: true,
  };
  const PROVIDER_UNAVAILABLE: ClassifiedLlmError = {
    code: 'provider_unavailable',
    userMessage:
      'The AI service is temporarily unavailable. Please try again in a moment — your inputs are saved.',
    retryable: true,
  };
  const AUTH: ClassifiedLlmError = {
    code: 'auth',
    userMessage:
      'The drafting service could not authenticate with the AI provider. Please contact support — this is a server-side configuration issue.',
    retryable: false,
  };
  const INVALID_REQUEST: ClassifiedLlmError = {
    code: 'invalid_request',
    userMessage:
      'The AI rejected the prompt for this draft. Try shortening the facts narrative, then generate again.',
    retryable: false,
  };
  const NETWORK: ClassifiedLlmError = {
    code: 'network',
    userMessage: 'Network error reaching the AI service. Check your connection and try again.',
    retryable: true,
  };
  const UNKNOWN: ClassifiedLlmError = {
    code: 'unknown',
    userMessage:
      'The AI service returned an unexpected error. Please try again. If this keeps happening, contact support.',
    retryable: true,
  };

  // An Anthropic SDK error with an HTTP status is classified by the status
  // alone (T-118). The message text is never consulted for it.
  const status = providerStatus(err);
  if (status !== undefined) {
    if (status === 429) return RATE_LIMITED;
    if (status >= 500) return PROVIDER_UNAVAILABLE;
    if (status === 401 || status === 403) return AUTH;
    if (status >= 400) return INVALID_REQUEST;
    return UNKNOWN;
  }

  // No status: connection errors and anything that is not an SDK API error.
  const msg = err instanceof Error ? err.message : String(err);
  if (/rate.?limit|too many requests/i.test(msg)) return RATE_LIMITED;
  if (/overload|unavailable|temporarily/i.test(msg)) return PROVIDER_UNAVAILABLE;
  if (/unauthorized|forbidden|invalid.?api.?key/i.test(msg)) return AUTH;
  if (/invalid.?request|bad.?request|context.?length|max.?tokens/i.test(msg)) {
    return INVALID_REQUEST;
  }
  if (
    isProviderConnectionError(err) ||
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket hang up|no response body|connection error/i.test(
      msg,
    )
  ) {
    return NETWORK;
  }
  return UNKNOWN;
}

/** Sentinel thrown after a mid-stream LLM failure so the route handler knows
 *  the SSE has already been ended and not to re-emit `done`. Carries whatever
 *  usage was captured before the failure (T-003) so the route can still
 *  record a Generation row for the attempt instead of losing it. */
export class GenerationFailedError extends Error {
  readonly code: ClassifiedLlmError['code'];
  readonly usage: UsageTotals;
  readonly aiModel?: string;
  readonly transport?: 'direct';
  constructor(
    message: string,
    code: ClassifiedLlmError['code'],
    usage: UsageTotals,
    aiModel?: string,
    transport?: 'direct',
  ) {
    super(message);
    this.name = 'GenerationFailedError';
    this.code = code;
    this.usage = usage;
    this.aiModel = aiModel;
    this.transport = transport;
  }
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
  transport?: 'direct';
}

/**
 * Placeholders a template section left unfilled.
 *
 * T-146: only a field the user is asked for (one in the form schema) becomes a
 * check message. A camelCase alias (`{applicant}`) is reported under the form
 * field it reads (`applicant_name`), by that field's id and label, never under
 * the alias. A system-owned placeholder (court, aliases with no form source,
 * deferred counts) left unfilled is an engine fault: it is logged, never put to
 * the user, and the placeholder-coverage test is what catches it.
 */
export function leakedPlaceholderWarnings(
  templateConfig: TemplateConfig,
  ctx: Record<string, string>,
): ValidationWarning[] {
  const userFields = new Map<string, string>();
  for (const step of templateConfig.form_schema.steps) {
    for (const field of step.fields) userFields.set(field.field_id, field.label ?? field.field_id);
  }
  const aliasSources = new Map<string, readonly string[]>(PLACEHOLDER_ALIASES);
  const warnings: ValidationWarning[] = [];
  for (const section of templateConfig.document_structure.sections) {
    if (section.type !== 'template' || !section.template) continue;
    const reported = new Set<string>();
    for (const key of detectLeakedPlaceholders(section.template, sectionContext(section, ctx))) {
      const fieldId = userFields.has(key)
        ? key
        : aliasSources.get(key)?.find((s) => userFields.has(s));
      if (!fieldId) {
        if (process.env.NODE_ENV !== 'test') {
          console.error(
            `[drafting] System placeholder "{${key}}" unfilled (template=${templateConfig.template_id}, section=${section.section_id})`,
          );
        }
        continue;
      }
      if (reported.has(fieldId)) continue;
      reported.add(fieldId);
      const label = userFields.get(fieldId) ?? fieldId;
      warnings.push({
        type: 'missing_clause',
        message: `Unfilled field "${label}" ({${fieldId}}) in section "${section.section_id}". Please provide this field or it will appear as a blank in the document.`,
        details: { clauseId: fieldId },
      });
    }
  }
  return warnings;
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
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const stopKeepAlive = startSseKeepAlive(res);
  try {
    // ── Stream AI Response ──────────────────────────────────────────────────────
    let rawText = '';
    const meter = new UsageMeter();
    const draft: CallUsageDraft = { inputTokens: 0, outputTokens: 0, usageSource: 'none' };

    try {
      for await (const text of streamLLM(systemPrompt, userPrompt, 4096, draft)) {
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
  } finally {
    stopKeepAlive();
  }
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
  transport?: 'direct';
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
          courtType: court.courtType,
          state: court.state,
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
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const stopKeepAlive = startSseKeepAlive(res);
  try {
    // ── Render all sections ────────────────────────────────────────────────────
    const renderedSections: RenderedSection[] = [];
    const meter = new UsageMeter();
    let aiModel: string | undefined;
    let transport: 'direct' | undefined;

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
          for await (const text of streamLLM(systemPrompt, userPrompt, 8192, draft)) {
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
          // AI provider / network failure mid-stream. SSE headers are
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
    allWarnings.push(...leakedPlaceholderWarnings(templateConfig, ctx));

    // Check for old-law references in AI-generated text
    const aiSections = renderedSections.filter((s) => s.type === 'ai_generated');
    const aiText = aiSections.map((s) => s.content).join('\n');

    // T-346: old-law (T-270 ruling A), BNS whitelist (SCRUM-64 b), other five codes (T-333).
    allWarnings.push(...(await checkDraftCitations(aiText)));

    // SCRUM-64 (c): Fact↔section sanity — BNS 103 (Murder) requires death keywords in facts
    if (templateConfig.category === 'criminal') {
      const factsNarrative = String(convertedFormData.facts_narrative ?? '');
      // T-333 ruling B: explicit cites only, not numbers inside an expanded range.
      const sanitySanityWarnings = checkFactSectionSanity(
        factsNarrative,
        extractBNSSectionNumbers(aiText, { includeRangeInner: false }),
      );
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
  } finally {
    stopKeepAlive();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BRIEF PIPELINE (T-106, ADR-021 sections 3.5 and 3.6)
// A confirmed brief and a rule pack go in. The Drafter writes the body in one
// call. Code adds the cause title, the prayer, the verification and the other
// fixed parts from the brief, as the template pipeline does. Then every
// mandatory clause is checked, one repair pass runs if one is missing, and the
// rule checks run. The template pipeline above is not changed by any of this.
// ═══════════════════════════════════════════════════════════════════════════

export interface BriefGenerateInput {
  pack: RulePack;
  templateConfig: TemplateConfig;
  /** The brief as the server worked it out again from what the user confirmed. */
  brief: Brief;
  /**
   * The matter as the advocate typed it, word for word (T-136). It goes to the
   * Drafter under "described" and is read by the checks. It is never logged.
   */
  described?: string | null;
  /**
   * T-147c: present only when `feature.fact_ledger` is on and the request
   * carried a ledger of this user's, for this document. The Drafter is then
   * given the ledger's facts and the pack's skeleton, and nothing else: no
   * brief value, no description. The parts the system adds (cause title,
   * prayer, verification) are rendered by the unchanged template code
   * (ADR-021) from `ledgerSkeletonBrief`: ledger displays for the items the
   * ledger holds, `{{MISSING: label}}` for every item it does not, and the
   * brief's other notes dropped. The checks read the same brief. Absent: the
   * Drafter and the system parts work exactly as before T-147c.
   */
  ledger?: {
    /** The current version's facts. */
    facts: LedgerFact[];
    /** The pack's averment lists (`loadAvermentLists`). */
    lists: AvermentLists;
    /**
     * T-147d: the current version's unresolved items. Read by the fact verifier and,
     * since T-338, by the `ledgerDrafterFacts` call (unresolved keys become visible blanks).
     */
    unresolved?: LedgerUnresolvedFact[];
  };
  language: 'en' | 'hi' | 'bilingual';
  /** The number of numbered paragraphs wanted in the body. */
  targetParagraphs: number;
  /** The court the user chose, from the courts data. Absent on a document that has no court. */
  courtData?: CourtLookupData;
  advocateName?: string;
  enrollmentNumber?: string;
  userId?: string;
  runId: string;
  runSequence: number;
  runType: RunType;
  /**
   * T-373 (ADR-025 D1): the pack's signed skeleton source. Absent: T-374's
   * `loadSkeleton` from rule-pack.service.ts (the `_skeletons/` files).
   * Injected so tests can pass a fixture or `() => null`. Returning null: no
   * skeleton, and the draft takes today's path unchanged. A loader throw (a
   * skeleton file that exists but is not valid) propagates; it never falls
   * back to today's path.
   */
  loadSkeleton?: LoadSkeleton;
}

export interface BriefGenerateResult extends TemplateGenerateResult {
  /** Mandatory clauses still not covered after the repair pass. */
  missingClauses: MissingClause[];
  /** True when the repair pass ran and its result was kept. */
  repaired: boolean;
  /** ADR-021 rule 6: true unless every mandatory clause is present and every check passed. */
  startingDraft: boolean;
  /** The line shown with a labelled draft (T-127, section 7.3). */
  labelReason: string | null;
  /** T-147d: the fact verifier's outcome. Present only on the legacy ledger path; never on D1. */
  factCheck?: FactCheckOutcome;
  /**
   * T-373 (Arjun's ruling B): on a D1 pack the read-only verifier's findings,
   * for the fact-diff log only, tagged with the path to pass to
   * writeFactCheckLog. Nothing here is shown to the advocate: the panel and the
   * label read `rendered`. Absent on every other draft.
   */
  factDiff?: { outcome: FactCheckOutcome; path: FactDiffPath };
  /**
   * T-373 (ADR-025 D1): each clause the renderer printed, in order, with its
   * status. Present only on a pack with a signed skeleton; the checks panel
   * is built from this list.
   */
  rendered?: RenderedClause[];
}

/**
 * T-158: the Drafter's party-designation lines for its COURT RULE block, from
 * the same helper as buildAISystemPrompt's PARTY DESIGNATIONS block. The
 * Drafter prompt puts "- " before each line itself, so the C2 rule
 * (AJ-2026-10-08-T158-diff) is pushed without its own leading "- " and prints
 * exactly as signed.
 */
export function drafterPartyDesignationLines(
  courtRule: CourtRuleData | undefined,
  templateId: string,
): string[] {
  if (!courtRule) return [];
  const { entries, needsToBeConfirmedRule } = promptPartyDesignations(courtRule, templateId);
  const lines = entries.map(([role, label]) => `Party designation, ${role}: "${label}"`);
  if (needsToBeConfirmedRule) lines.push(TO_BE_CONFIRMED_DESIGNATION_RULE.replace(/^- /, ''));
  return lines;
}

export async function streamGenerateFromBrief(
  input: BriefGenerateInput,
  res: Response,
): Promise<BriefGenerateResult> {
  const { pack, templateConfig, courtData } = input;
  // T-147c: with the ledger, everything the system writes and every check reads
  // the ledger's displays; without it, the brief exactly as before.
  const brief = input.ledger ? ledgerSkeletonBrief(input.brief, input.ledger.facts) : input.brief;

  // ── The brief as form values, for the parts the system adds ───────────────
  const formData = formDataFromBrief(brief, templateConfig, input.language);
  const converted: Record<string, unknown> = {};
  if (templateConfig.validation_rules.auto_convert_old_to_new) {
    for (const step of templateConfig.form_schema.steps) {
      for (const field of step.fields) {
        const value = formData[field.field_id];
        if (field.auto_convert_old && typeof value === 'string' && value.length > 0) {
          const result = await convertOldReferencesInText(value);
          formData[field.field_id] = result.converted;
          converted[field.field_id] = result.converted;
        }
      }
    }
  }

  const ctx = buildPlaceholderContext(
    templateConfig,
    formData,
    { advocateName: input.advocateName, enrollmentNumber: input.enrollmentNumber },
    courtData,
  );

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const stopKeepAlive = startSseKeepAlive(res);
  try {
    // ── The parts the system adds, in the template's order ────────────────────
    // They are written first, so that the Drafter is shown what stands above its
    // text and what follows it (T-136). The number of the last paragraph is
    // filled in once the body is known.
    const renderedSections: RenderedSection[] = [];
    let bodyAt = -1;
    for (const section of templateConfig.document_structure.sections) {
      if (section.type === 'template') {
        renderedSections.push(renderTemplateSection(section, ctx));
      } else if (bodyAt < 0) {
        // One body, where the template's first AI section sits. Any further AI
        // section of the old form pipeline has no place here.
        bodyAt = renderedSections.length;
        renderedSections.push({
          section_id: 'body',
          type: 'ai_generated',
          content: '',
          alignment: section.alignment,
        });
      }
    }
    if (bodyAt < 0) {
      bodyAt = renderedSections.length;
      renderedSections.push({ section_id: 'body', type: 'ai_generated', content: '' });
    }
    const systemText = systemTextAround(renderedSections);

    // ── What the Drafter is given ─────────────────────────────────────────────
    const parts = systemParts(templateConfig);
    const courtRule = courtData?.courtRule;
    // The provision that follows the court chosen (T-135).
    const provisions = courtProvisions(templateConfig, ctx);
    const promptInput: DrafterPromptInput = {
      pack,
      brief: drafterBrief(
        brief,
        ctx.court_designation || courtData?.designation || null,
        converted,
        input.described,
        // T-365 AC1: the profile name (T-300) means the advocate name is not unknown.
        input.advocateName,
      ),
      statedInstructions: provisions
        .map((p) => p.instruction)
        .filter((i): i is string => i !== null),
      systemParts: parts,
      systemText,
      courtRules: [
        ...(courtRule?.localRules ?? []),
        // T-149 / T-158: the same labels as buildAISystemPrompt's PARTY
        // DESIGNATIONS block: matter-type labels, no "not applicable" state,
        // and the C2 rule when a label is a "[To be confirmed: ...]" blank.
        ...drafterPartyDesignationLines(courtRule, templateConfig.template_id),
      ],
      target: input.targetParagraphs,
      language: input.language,
    };
    // T-147c: with the ledger, the Drafter's facts come from it alone. The
    // description is not given to the Drafter and is not read by the checks.
    const ledgerInput: LedgerDrafterPromptInput | null = input.ledger
      ? {
          pack: promptInput.pack,
          statedInstructions: promptInput.statedInstructions,
          systemParts: promptInput.systemParts,
          systemText: promptInput.systemText,
          courtRules: promptInput.courtRules,
          target: promptInput.target,
          language: promptInput.language,
          facts: ledgerDrafterFacts(
            input.ledger.facts,
            buildChecklist(pack),
            ctx.court_designation || courtData?.designation || null,
            brief.kind.court_document,
            // T-338: an unresolved optional key with no fact is a visible blank.
            (input.ledger.unresolved ?? []).map((u) => u.key),
            // T-365 AC1: with a profile name, advocate_name is not missing.
            input.advocateName,
          ),
          averments: resolveAverments(input.ledger.lists, input.ledger.facts),
        }
      : null;
    const described = ledgerInput ? null : input.described;
    /**
     * The Drafter's text as it goes into the document: no disclaimer, no word
     * SYSTEM in brackets, and no repeat of a part the system has written, where
     * the repeat says nothing that part does not (Ajay's condition 4).
     */
    const cleaned = (text: string): string =>
      removeRepeatedParts(withoutDisclaimerText(text), systemText).body;

    const meter = new UsageMeter();
    let aiModel: string | undefined;
    let transport: 'direct' | undefined;

    // ── The body: one Drafter call (decision D6) ──────────────────────────────
    let raw = '';
    const draft: CallUsageDraft = { inputTokens: 0, outputTokens: 0, usageSource: 'none' };
    const filter = new TrailerFilter();
    const recordCall = (sectionId: string, d: CallUsageDraft, text: string): void => {
      aiModel = d.model ?? aiModel;
      transport = d.transport ?? transport;
      meter.record({
        sectionId,
        inputTokens: d.inputTokens,
        outputTokens: d.usageSource === 'provider' ? d.outputTokens : estimateOutputTokens(text),
        usageSource: d.usageSource === 'provider' ? 'provider' : 'estimated',
      });
    };
    // ── T-373 (ADR-025 D1): a pack with a signed skeleton is filled, not written ─
    // Everything after this point, for such a pack, is in d1GenerateFromBrief.
    // A pack with no skeleton goes on below exactly as before.
    const skeleton = d1SkeletonFor(input);
    if (skeleton && ledgerInput && input.ledger) {
      return await d1GenerateFromBrief({
        input,
        res,
        skeleton,
        ledger: input.ledger,
        ledgerInput,
        promptInput,
        brief,
        formData,
        ctx,
        renderedSections,
        bodyAt,
        systemText,
        provisions,
        meter,
        recordCall,
        callInfo: () => ({ aiModel, transport }),
      });
    }

    try {
      for await (const text of streamLLM(
        ledgerInput ? DRAFTER_LEDGER_SYSTEM_PROMPT : DRAFTER_PACK_SYSTEM_PROMPT,
        ledgerInput
          ? buildLedgerDrafterUserPrompt(ledgerInput)
          : buildDrafterUserPrompt(promptInput),
        8192,
        draft,
      )) {
        raw += text;
        // The clause report after the document is for the server, never for the user.
        const visible = filter.push(text);
        // T-147d: on the ledger path nothing of the body reaches the advocate
        // before the fact verifier has read it; the checked body is sent with
        // the system's parts below.
        if (visible && !ledgerInput) res.write(`data: ${JSON.stringify({ text: visible })}\n\n`);
      }
      const tail = filter.end();
      if (tail && !ledgerInput) res.write(`data: ${JSON.stringify({ text: tail })}\n\n`);
      recordCall('body', draft, raw);
    } catch (llmErr) {
      recordCall('body', draft, raw);
      const classified = classifyLlmError(llmErr);
      if (process.env.NODE_ENV !== 'test') {
        console.error(
          `[drafting] Drafter stream failed (kind=${pack.id}, runId=${input.runId}, runSequence=${input.runSequence}, runType=${input.runType}):`,
          llmErr instanceof Error ? llmErr.name : 'unknown',
        );
      }
      res.write(
        `event: error\ndata: ${JSON.stringify({
          section: 'body',
          reason: classified.userMessage,
          retryable: classified.retryable,
          code: classified.code,
          runId: input.runId,
        })}\n\n`,
      );
      // The route ends the response after the failed Generation row is saved.
      throw new GenerationFailedError(
        classified.userMessage,
        classified.code,
        meter.totals(),
        aiModel,
        transport,
      );
    }

    let output = splitDrafterOutput(raw);
    output = { ...output, body: cleaned(output.body) };
    // T-200: the brief for cues, the language for fixed wording, and the text
    // recorded for each clause without cues (R2b), kept for every later check.
    let recorded = new Map<string, string>();
    const notChecked = new Map<string, string>();
    const clauseCheck = { brief, language: input.language, notChecked };
    let missing = findMissingClauses(pack, output, parts, { ...clauseCheck, recorded });
    let repaired = false;

    // ── One repair pass, at our cost (decision D3) ────────────────────────────
    if (missing.length > 0 && output.body.length > 0) {
      res.write(`event: repair\ndata: ${JSON.stringify({ missing: missing.length })}\n\n`);
      let repairRaw = '';
      const repairDraft: CallUsageDraft = { inputTokens: 0, outputTokens: 0, usageSource: 'none' };
      try {
        const missingIds = missing.map((m) => m.id);
        for await (const text of streamLLM(
          ledgerInput ? DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT : DRAFTER_REPAIR_SYSTEM_PROMPT,
          ledgerInput
            ? buildLedgerRepairUserPrompt(ledgerInput, output.body, missingIds)
            : buildRepairUserPrompt(promptInput, output.body, missingIds),
          8192,
          repairDraft,
        )) {
          repairRaw += text;
        }
        recordCall('repair', repairDraft, repairRaw);
        const second = splitDrafterOutput(repairRaw);
        const secondBody = cleaned(second.body);
        // The repair may add clauses and nothing else. If it dropped or rewrote
        // a paragraph, the first draft is kept and the clauses stay missing.
        if (secondBody.length > 0 && keepsEveryParagraph(output.body, secondBody)) {
          const candidate = { body: secondBody, report: second.report };
          // Checked against the texts recorded so far (R2b). A clause the repair
          // adds is recorded from the repair's own report.
          const candidateRecorded = new Map(recorded);
          const stillMissing = findMissingClauses(pack, candidate, parts, {
            ...clauseCheck,
            recorded: candidateRecorded,
          });
          if (stillMissing.length < missing.length) {
            output = candidate;
            missing = stillMissing;
            recorded = candidateRecorded;
            repaired = true;
          }
        }
      } catch (repairErr) {
        // A failed repair never fails the draft. Its tokens are still counted.
        recordCall('repair', repairDraft, repairRaw);
        if (process.env.NODE_ENV !== 'test') {
          console.error(
            `[drafting] Repair pass failed (kind=${pack.id}, runId=${input.runId}):`,
            repairErr instanceof Error ? repairErr.name : 'unknown',
          );
        }
      }
    }

    // ── No case law on its own (T-148) ─────────────────────────────────────────
    // A case citation the advocate did not give, in the brief or in their own
    // words, is replaced by the blank. Rule-pack text is never a source.
    // With the ledger (T-147c), only the ledger's facts are a source.
    const citations = removeUngivenCitations(
      output.body,
      ledgerInput
        ? ledgerCitationSources(ledgerInput.facts)
        : [briefText(brief), input.described ?? ''],
    );
    // T-200, R2b.1: a code edit records the changed paragraphs again.
    recordAgainAfterCodeEdit(output.report, output.body, citations.text, recorded, missing);
    output = { ...output, body: citations.text };

    // ── The fact verifier (T-147d): the ledger path only ──────────────────────
    // Every ledger draft is checked against the ledger in code. On failure one
    // targeted repair of the offending paragraphs runs, on the same model,
    // token cap and usage meter as the repair above; anything still wrong
    // becomes {{MISSING: label}}. A draft that passes is unchanged. Nothing
    // here is logged but ids and counts.
    let factCheck: FactCheckOutcome | undefined;
    if (ledgerInput && input.ledger) {
      const ledger = input.ledger;
      factCheck = await verifyAndRepair(
        {
          body: output.body,
          facts: ledger.facts,
          unresolved: ledger.unresolved ?? [],
          lists: ledger.lists,
          skeleton: [
            systemText.before,
            systemText.after,
            ...(ledgerInput.facts.court ? [ledgerInput.facts.court] : []),
            ...(promptInput.statedInstructions ?? []),
          ],
          packText: packTexts(pack),
        },
        async (system, user) => {
          res.write(`event: repair\ndata: ${JSON.stringify({ facts: true })}\n\n`);
          let factRaw = '';
          const factDraft: CallUsageDraft = {
            inputTokens: 0,
            outputTokens: 0,
            usageSource: 'none',
          };
          try {
            for await (const text of streamLLM(system, user, 8192, factDraft)) factRaw += text;
            recordCall('fact_repair', factDraft, factRaw);
            return factRaw;
          } catch (factErr) {
            // A failed repair never fails the draft: the placeholders follow. Its tokens are counted.
            recordCall('fact_repair', factDraft, factRaw);
            if (process.env.NODE_ENV !== 'test') {
              console.error(
                `[drafting] Fact repair pass failed (kind=${pack.id}, runId=${input.runId}):`,
                factErr instanceof Error ? factErr.name : 'unknown',
              );
            }
            return null;
          }
        },
      );
      // T-200: the fact check's edits record the changed paragraphs again. With
      // no model repair applied (afterRepair null) only code edited the body
      // (R2b.1). With one, a paragraph counts only when its change stays inside
      // a sentence the fact check flagged (R2b.4). Spans are in the body it read.
      const factParas = splitParagraphs(output.body);
      const flagged =
        factCheck.afterRepair === null
          ? undefined
          : factCheck.initial
              .filter((v) => v.check !== 'dropped' && factParas[v.paragraphIndex] !== undefined)
              .map((v) => {
                const from = factParas[v.paragraphIndex].start + v.charOffset;
                return { from, to: from + v.length };
              });
      recordAgainAfterCodeEdit(
        output.report,
        output.body,
        factCheck.body,
        recorded,
        missing,
        flagged,
      );
      // A citation the repair may have added goes the same way as above (T-148).
      const checkedBody = removeUngivenCitations(
        factCheck.body,
        ledgerCitationSources(ledgerInput.facts),
      ).text;
      // T-200, R2b.1: a code edit records the changed paragraphs again.
      recordAgainAfterCodeEdit(output.report, factCheck.body, checkedBody, recorded, missing);
      output = { ...output, body: checkedBody };
      // T-147e (T-147d review follow-up): the verifier may strip a sentence or
      // replace a paragraph, so the mandatory clauses are checked again on the
      // body as it will be delivered. Re-signed by Ajay (CLO) for T-147e.
      if (!factCheck.passed) {
        missing = findMissingClauses(pack, output, parts, { ...clauseCheck, recorded });
      }
    }

    // ── The body takes its place among the parts the system wrote ─────────────
    renderedSections[bodyAt] = { ...renderedSections[bodyAt], content: output.body };

    const { fullText, bodyParaCount } = assembleDocument(renderedSections);
    ctx.body_para_count = String(bodyParaCount);
    /** Each part as it prints: the number of the last paragraph filled in. */
    const printed = renderedSections.map((s) =>
      s.type === 'template' && s.content.includes('{body_para_count}')
        ? s.content.replace(/\{body_para_count\}/g, String(bodyParaCount))
        : s.content,
    );

    res.write(
      `event: template_sections\ndata: ${JSON.stringify({
        sections: renderedSections.map((s, i) => ({
          section_id: s.section_id,
          type: s.type,
          content: printed[i],
          alignment: s.alignment,
          style: s.style,
        })),
      })}\n\n`,
    );

    const checklistSource =
      templateConfig.filing_checklist.length > 0
        ? templateConfig.filing_checklist
        : pack.filingChecklist;
    const filingChecklist = checklistSource.map((item) =>
      item.replace(/\{(\w+)\}/g, (_m, key: string) => ctx[key] ?? '_____'),
    );
    if (filingChecklist.length > 0) {
      res.write(`event: checklist\ndata: ${JSON.stringify({ items: filingChecklist })}\n\n`);
    }

    // ── Checks: the ones the template pipeline runs, then the brief's own ─────
    const allWarnings: ValidationWarning[] = [];
    const body = output.body;
    const given = new Map<string, string>();
    for (const item of brief.items) {
      if (typeof item.value === 'string' && item.value.length > 0) given.set(item.key, item.value);
    }

    allWarnings.push(...leakedPlaceholderWarnings(templateConfig, ctx));

    // T-346: old-law (T-270 ruling A), BNS whitelist (SCRUM-64 b), other five codes (T-333).
    allWarnings.push(...(await checkDraftCitations(body)));

    const facts =
      given.get('facts_narrative') ?? given.get('facts') ?? given.get('fixed.facts') ?? '';
    if (templateConfig.category === 'criminal' && facts) {
      // T-333 ruling B: explicit cites only, not numbers inside an expanded range.
      allWarnings.push(
        ...checkFactSectionSanity(
          facts,
          extractBNSSectionNumbers(body, { includeRangeInner: false }),
        ),
      );
    }

    const grounds = formData.grounds_for_bail ?? formData.grounds_for_quashing ?? formData.grounds;
    const groundsGiven = brief.items.some(
      (i) =>
        ['grounds_for_bail', 'grounds_for_quashing', 'grounds'].includes(i.key) && i.value !== null,
    );
    if (groundsGiven && grounds && facts) {
      for (const m of detectCoherenceMismatches(grounds as string | string[], facts)) {
        allWarnings.push({
          type: 'coherence_mismatch',
          message: m.warning_message,
          details: { rule: m.rule_id, ground: m.ground_label },
        });
      }
    }

    if (templateConfig.validation_rules.fact_alteration_check && facts) {
      const altered = checkFactAlteration(facts, body);
      if (altered) allWarnings.push(altered);
    }

    for (const [key, what] of [
      ['applicant_name', 'applicant name'],
      ['father_name', 'father name'],
    ]) {
      const value = given.get(key);
      if (value && body.length > 0 && !body.includes(value)) {
        allWarnings.push({
          type: 'fact_alteration',
          message: `The body does not contain the ${what} "${value}" as given in the brief. Check that the party is named correctly.`,
          details: { field: key, expected: value },
        });
      }
    }

    // Nothing in the body that the brief and the pack do not give (ADR-021, rule 2).
    allWarnings.push(...checkAgainstBrief(body, brief, pack));

    // The provision the application is made under follows the court (T-135).
    allWarnings.push(...checkCourtProvisions(body, provisions));

    // One document, with what the advocate gave (T-136; the wording is Ajay's).
    // A part that may not belong:
    allWarnings.push(...checkOneDocument(body, systemText, pack.name));
    // A date, a name, a number or a fact of the brief that the document does not
    // hold, read against the whole document as it prints, not the body alone:
    allWarnings.push(...checkBriefIsUsed(printed.join('\n\n'), brief, described));
    // A length of time that nothing the Drafter was given states:
    allWarnings.push(
      ...checkPeriods(
        body,
        [
          briefText(brief),
          described ?? '',
          ...(ledgerInput ? [ledgerFactText(ledgerInput.facts)] : []),
          ...packTexts(pack),
          ...(promptInput.statedInstructions ?? []),
          ...promptInput.courtRules,
          systemText.before,
          systemText.after,
        ],
        brief,
      ),
    );

    // A case citation the advocate did not give was removed (T-148):
    allWarnings.push(...citationWarnings(citations.removed));

    // Every mandatory clause of the pack (ADR-021, rule 1).
    for (const clause of missing) {
      allWarnings.push({
        type: 'missing_clause',
        message: `This draft does not cover "${clause.title}". Add it before use.`,
        details: { clauseId: clause.id },
      });
    }
    // T-200, R1.7: fixed wording is English, so on another language it is not checked.
    for (const [clauseId, title] of notChecked) {
      allWarnings.push({
        type: 'missing_clause',
        message: `Fixed wording of ${title} not checked: the draft is not in English.`,
        details: { clauseId },
      });
    }

    if (allWarnings.length > 0) {
      res.write(`event: warning\ndata: ${JSON.stringify({ warnings: allWarnings })}\n\n`);
    }

    return {
      fullText,
      sections: renderedSections,
      filingChecklist,
      sectionsCited: buildSectionsCited(fullText),
      mandatoryClausesComplete: missing.length === 0,
      warnings: allWarnings,
      usage: meter.totals(),
      aiModel,
      transport,
      bodyParaCount,
      missingClauses: missing,
      repaired,
      // T-147d: a draft the fact verifier had to change is never delivered as clean.
      startingDraft: needsStartingDraftLabel(missing, allWarnings) || Boolean(factCheck?.banner),
      labelReason: labelReason(missing, allWarnings),
      ...(factCheck ? { factCheck } : {}),
    };
  } finally {
    stopKeepAlive();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// T-373 (ADR-025 D1): THE DRAFTER FILLS A SIGNED SKELETON
// For a pack with a signed skeleton, on the ledger path, in English: one
// structured-output call (`messages.parse`, no forced tool; Arjun's D1 call
// shape), one retry if it returns nothing usable, then the code renderer
// (draft-renderer.ts). No ===CLAUSES=== trailer, no clause check or clause
// repair, no model fact repair; the fact verifier runs read-only for the
// fact-diff log. The checks panel reads the renderer's `rendered[]`. Each step
// is its own small function so a ruling change touches one place.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The default skeleton source: T-374's loader, read from `_skeletons/<pack>.json`.
 * Null (no file) is the only switch to today's path (ADR-025 call shape 4).
 */
const signedSkeleton: LoadSkeleton = (packId) => loadSignedSkeleton(packId);

/** Output cap for the D1 call (Arjun's D1 call shape). */
const D1_MAX_TOKENS = 16000;

/** Calls made before giving up on a structured answer: the first and one retry (Arjun, D1 call shape 2). */
const D1_ATTEMPTS = 2;

/**
 * The skeleton for this draft, or null for today's path. Only on the ledger
 * path, and only in English: the signed wording is English, and a Hindi or
 * bilingual draft stays on today's path until Ajay signs those texts.
 */
function d1SkeletonFor(input: BriefGenerateInput): Skeleton | null {
  if (!input.ledger || input.language !== 'en') return null;
  const skeleton = (input.loadSkeleton ?? signedSkeleton)(input.pack.id);
  return skeleton && skeleton.clauses.length > 0 ? skeleton : null;
}

/** The structured call returned no usable answer twice. Classified as an unknown, retryable failure. */
export class StructuredOutputMissingError extends Error {
  constructor() {
    super('The Drafter returned no structured output');
    this.name = 'StructuredOutputMissingError';
  }
}

/** The user prompt for DRAFTER_D1_SYSTEM_PROMPT: DOCUMENT, FACTS and SKELETON. */
export function buildD1DrafterUserPrompt(
  documentName: string,
  facts: readonly D1DrafterFact[],
  skeleton: Skeleton,
): string {
  return [
    `DOCUMENT: ${documentName.replace(/\s+/g, ' ').trim().slice(0, 160)}`,
    `FACTS:\n${JSON.stringify(facts, null, 1)}`,
    `SKELETON:\n${JSON.stringify(skeleton.clauses, null, 1)}`,
  ].join('\n\n');
}

/**
 * The structured-output format for one request. `transform: false`: the SDK's
 * transform (0.91.0) moves `enum` into the description, which would turn the
 * clauseId / factRef enums into a hint the API does not enforce. The schema
 * from buildDraftParagraphsSchema is already strict (every object closed,
 * every field required), so it is sent as built. `parse` is ours so that a
 * malformed answer reads as null (one retry follows) instead of throwing and
 * losing the response's usage.
 */
function d1OutputFormat(
  schema: ReturnType<typeof buildDraftParagraphsSchema>,
): AutoParseableOutputFormat<DraftParagraphsOutput | null> {
  const base = jsonSchemaOutputFormat(schema as Parameters<typeof jsonSchemaOutputFormat>[0], {
    transform: false,
  });
  return {
    type: base.type,
    schema: base.schema,
    parse: (content: string) => {
      try {
        return readDraftParagraphs(JSON.parse(content));
      } catch {
        return null;
      }
    },
  };
}

/**
 * One D1 call, not streamed (the SSE keep-alive covers the wait). Usage is
 * read off the response into `usage` (numbers only). Null when the answer is
 * not usable structured output; throws on an API or network failure.
 */
async function callD1Drafter(
  system: string,
  user: string,
  format: AutoParseableOutputFormat<DraftParagraphsOutput | null>,
  usage: CallUsageDraft,
): Promise<DraftParagraphsOutput | null> {
  const model = await getAppSetting(APP_SETTING_KEYS.DRAFTING_MODEL);
  usage.model = model;
  usage.transport = 'direct';
  const message = await directClient.messages.parse({
    model,
    max_tokens: D1_MAX_TOKENS,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { format },
  });
  const counts = parseAnthropicMessageUsage(message);
  if (counts.inputTokens !== undefined || counts.outputTokens !== undefined) {
    if (counts.inputTokens !== undefined) usage.inputTokens = counts.inputTokens;
    if (counts.outputTokens !== undefined) usage.outputTokens = counts.outputTokens;
    usage.usageSource = 'provider';
  }
  return message.parsed_output ?? null;
}

/**
 * The fact verifier as a read-only check (Arjun, D1 call shape 3): the body
 * is not changed, nothing is repaired, and every finding is recorded as
 * `flagged` for the fact-diff log the route writes. No banner: on D1 a ledger
 * fact with no clause is left out on purpose (T-359), and the banner's notes
 * say the draft was changed, which it is not.
 */
function d1FactCheck(body: string, violations: FactViolation[]): FactCheckOutcome {
  const records: FactDiffDraft[] = violations.map((v) => ({
    check: v.check,
    entityType: v.entityType,
    bannedEntryId: v.bannedEntryId ?? null,
    ledgerKey: v.ledgerKey,
    label: v.label,
    paragraphIndex: v.paragraphIndex,
    charOffset: v.charOffset,
    ledgerValue: v.ledgerValue,
    draftValue: v.draftValue,
    resolution: 'flagged',
    phase: 'initial',
  }));
  return {
    body,
    passed: violations.length === 0,
    repairRan: false,
    repairFixed: false,
    initial: violations,
    afterRepair: null,
    records,
    banner: null,
    placeholdersAdded: 0,
  };
}

/** The clauses the renderer printed with a blank, for the checks panel and the label. */
function d1MissingClauses(rendered: readonly RenderedClause[]): MissingClause[] {
  return missingFromRendered(rendered);
}

interface D1Context {
  input: BriefGenerateInput;
  res: Response;
  skeleton: Skeleton;
  ledger: NonNullable<BriefGenerateInput['ledger']>;
  ledgerInput: LedgerDrafterPromptInput;
  promptInput: DrafterPromptInput;
  brief: Brief;
  formData: Record<string, unknown>;
  ctx: Record<string, string>;
  renderedSections: RenderedSection[];
  bodyAt: number;
  systemText: ReturnType<typeof systemTextAround>;
  provisions: ReturnType<typeof courtProvisions>;
  meter: UsageMeter;
  recordCall: (sectionId: string, d: CallUsageDraft, text: string) => void;
  callInfo: () => { aiModel?: string; transport?: 'direct' };
}

/**
 * The checks on a D1 draft. Kept: unfilled template fields, the citation
 * checks, the fact-section sanity check, coherence, the court provision, the
 * removed case citations, and one finding per clause the renderer printed
 * with a blank. Not run (ADR-025 renderer rule 5): the clause trailer and
 * findMissingClauses, checkPeriods, and the prose matchers built on nameIsIn
 * (checkBriefIsUsed, the party-name check) with checkAgainstBrief,
 * checkOneDocument and the fact-alteration check: the body is signed text
 * and the advocate's own words, so they would only report false findings.
 */
async function d1Warnings(
  c: D1Context,
  body: string,
  removedCitations: Parameters<typeof citationWarnings>[0],
  missing: readonly MissingClause[],
): Promise<ValidationWarning[]> {
  const { templateConfig } = c.input;
  const warnings: ValidationWarning[] = [];
  const given = new Map<string, string>();
  for (const item of c.brief.items) {
    if (typeof item.value === 'string' && item.value.length > 0) given.set(item.key, item.value);
  }
  warnings.push(...leakedPlaceholderWarnings(templateConfig, c.ctx));
  warnings.push(...(await checkDraftCitations(body)));
  const facts =
    given.get('facts_narrative') ?? given.get('facts') ?? given.get('fixed.facts') ?? '';
  if (templateConfig.category === 'criminal' && facts) {
    warnings.push(
      ...checkFactSectionSanity(
        facts,
        extractBNSSectionNumbers(body, { includeRangeInner: false }),
      ),
    );
  }
  const grounds =
    c.formData.grounds_for_bail ?? c.formData.grounds_for_quashing ?? c.formData.grounds;
  const groundsGiven = c.brief.items.some(
    (i) =>
      ['grounds_for_bail', 'grounds_for_quashing', 'grounds'].includes(i.key) && i.value !== null,
  );
  if (groundsGiven && grounds && facts) {
    for (const m of detectCoherenceMismatches(grounds as string | string[], facts)) {
      warnings.push({
        type: 'coherence_mismatch',
        message: m.warning_message,
        details: { rule: m.rule_id, ground: m.ground_label },
      });
    }
  }
  warnings.push(...checkCourtProvisions(body, c.provisions));
  warnings.push(...citationWarnings(removedCitations));
  for (const clause of missing) {
    warnings.push({
      type: 'missing_clause',
      message: `This draft does not cover "${clause.title}". Add it before use.`,
      details: { clauseId: clause.id },
    });
  }
  return warnings;
}

/** The body for a pack with a signed skeleton: one structured call, then the renderer. */
async function d1GenerateFromBrief(c: D1Context): Promise<BriefGenerateResult> {
  const { input, res, skeleton, ledger, ledgerInput, promptInput, systemText } = c;
  const { pack, templateConfig } = input;

  // ── The one structured call, with one retry (Arjun, D1 call shape 1 and 2) ──
  const format = d1OutputFormat(
    buildDraftParagraphsSchema(skeleton, draftFactRefs(skeleton, ledger.facts)),
  );
  const user = buildD1DrafterUserPrompt(
    pack.name,
    d1DrafterFacts(skeleton, ledger.facts),
    skeleton,
  );
  const failed = (err: unknown): GenerationFailedError => {
    const classified = classifyLlmError(err);
    if (process.env.NODE_ENV !== 'test') {
      console.error(
        `[drafting] Drafter structured call failed (kind=${pack.id}, runId=${input.runId}, runSequence=${input.runSequence}, runType=${input.runType}):`,
        err instanceof Error ? err.name : 'unknown',
      );
    }
    res.write(
      `event: error\ndata: ${JSON.stringify({
        section: 'body',
        reason: classified.userMessage,
        retryable: classified.retryable,
        code: classified.code,
        runId: input.runId,
      })}\n\n`,
    );
    const { aiModel, transport } = c.callInfo();
    // The route ends the response after the failed Generation row is saved.
    return new GenerationFailedError(
      classified.userMessage,
      classified.code,
      c.meter.totals(),
      aiModel,
      transport,
    );
  };
  let output: DraftParagraphsOutput | null = null;
  for (let attempt = 0; attempt < D1_ATTEMPTS && output === null; attempt++) {
    const sectionId = attempt === 0 ? 'body' : 'body_retry';
    const draft: CallUsageDraft = { inputTokens: 0, outputTokens: 0, usageSource: 'none' };
    try {
      output = await callD1Drafter(DRAFTER_D1_SYSTEM_PROMPT, user, format, draft);
      c.recordCall(sectionId, draft, '');
    } catch (llmErr) {
      c.recordCall(sectionId, draft, '');
      throw failed(llmErr);
    }
  }
  // Never a blank draft (Arjun, D1 call shape 2).
  if (output === null) throw failed(new StructuredOutputMissingError());

  // ── The renderer ──────────────────────────────────────────────────────────
  const checklist = buildChecklist(pack);
  const verifierSources = {
    unresolved: ledger.unresolved ?? [],
    lists: ledger.lists,
    packText: packTexts(pack),
  };
  const rendered = renderDraft({
    skeleton,
    output,
    facts: ledger.facts,
    labels: Object.fromEntries(checklist.map((i) => [i.key, i.label])),
    clauseLabels: Object.fromEntries(pack.mandatoryClauses.map((m) => [m.id, m.title])),
    optionIds: packOptionIds(pack.facts),
    valueLists: skeletonValueLists(skeleton, ledger.lists),
    // Rule 3: an own-words paragraph is checked against its fact alone.
    verifier: { ...verifierSources, skeleton: [] },
  });
  // Ajay (T-373): every own-words fallback is logged. Ids, the reason and
  // counts only, never text. Arjun (bcdf5b7): the fallback rate per pack, as
  // fallbacks out of the own-words clauses printed, in the same line, so the
  // stop list can be tuned.
  if (process.env.NODE_ENV !== 'test') {
    const ownIds = new Set(
      skeleton.clauses.filter((cl) => cl.source === 'advocate').map((cl) => cl.id),
    );
    const ownPrinted = rendered.rendered.filter((r) => ownIds.has(r.clauseId)).length;
    const rate = `fallbacks=${rendered.fallbacks.length}, ownWordsClauses=${ownPrinted}`;
    for (const f of rendered.fallbacks) {
      console.warn(
        `[drafting] D1 own-words fallback (kind=${pack.id}, runId=${input.runId}, clause=${f.clauseId}, reason=${f.reason}, ${rate})`,
      );
    }
  }

  // ── No case law on its own (T-148): kept on D1 ────────────────────────────
  const citations = removeUngivenCitations(rendered.body, ledgerCitationSources(ledgerInput.facts));
  const body = citations.text;

  // ── The fact verifier, read-only (Arjun, D1 call shape 3) ─────────────────
  // An `unsupported` date or amount stated by value in a held own-words fact's
  // raw_span is the advocate's own statement, not a finding (the renderer's rule).
  const ownWordsKeys = new Set(
    skeleton.clauses
      .filter((cl) => cl.source === 'advocate')
      .map((cl) => cl.slot ?? cl.from)
      .filter((k): k is string => typeof k === 'string'),
  );
  const statedByAdvocate = statedByValueIn(
    ledger.facts.filter((f) => ownWordsKeys.has(f.key)).map((f) => f.raw_span ?? ''),
  );
  const factCheck = d1FactCheck(
    body,
    verifyDraft({
      ...verifierSources,
      body,
      facts: ledger.facts,
      skeleton: [
        systemText.before,
        systemText.after,
        ...(ledgerInput.facts.court ? [ledgerInput.facts.court] : []),
        ...(promptInput.statedInstructions ?? []),
        ...skeletonTexts(skeleton),
      ],
    }).filter((v) => !statedByAdvocate(v)),
  );

  // ── The body takes its place among the parts the system wrote ─────────────
  const renderedSections = c.renderedSections;
  renderedSections[c.bodyAt] = { ...renderedSections[c.bodyAt], content: body };
  const { fullText, bodyParaCount } = assembleDocument(renderedSections);
  c.ctx.body_para_count = String(bodyParaCount);
  const printed = renderedSections.map((s) =>
    s.type === 'template' && s.content.includes('{body_para_count}')
      ? s.content.replace(/\{body_para_count\}/g, String(bodyParaCount))
      : s.content,
  );
  res.write(
    `event: template_sections\ndata: ${JSON.stringify({
      sections: renderedSections.map((s, i) => ({
        section_id: s.section_id,
        type: s.type,
        content: printed[i],
        alignment: s.alignment,
        style: s.style,
      })),
    })}\n\n`,
  );

  const checklistSource =
    templateConfig.filing_checklist.length > 0
      ? templateConfig.filing_checklist
      : pack.filingChecklist;
  const filingChecklist = checklistSource.map((item) =>
    item.replace(/\{(\w+)\}/g, (_m, key: string) => c.ctx[key] ?? '_____'),
  );
  if (filingChecklist.length > 0) {
    res.write(`event: checklist\ndata: ${JSON.stringify({ items: filingChecklist })}\n\n`);
  }

  // ── The checks panel: from rendered[] (ADR-025 renderer rule 5) ───────────
  const missing = d1MissingClauses(rendered.rendered);
  const warnings = await d1Warnings(c, body, citations.removed, missing);
  if (warnings.length > 0) {
    res.write(`event: warning\ndata: ${JSON.stringify({ warnings })}\n\n`);
  }

  const { aiModel, transport } = c.callInfo();
  return {
    fullText,
    sections: renderedSections,
    filingChecklist,
    sectionsCited: buildSectionsCited(fullText),
    mandatoryClausesComplete: missing.length === 0,
    warnings,
    usage: c.meter.totals(),
    aiModel,
    transport,
    bodyParaCount,
    missingClauses: missing,
    repaired: false,
    // T-373: the label reads rendered[] (a clause printed with a blank labels the draft).
    startingDraft: needsStartingDraftLabel(missing, warnings, rendered.rendered),
    labelReason: labelReason(missing, warnings, rendered.rendered),
    // Arjun B: no factCheck on D1; the findings go to the fact-diff log tagged d1.
    factDiff: { outcome: factCheck, path: 'd1' },
    rendered: rendered.rendered,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BRIEF PIPELINE, NO RULE PACK (T-106 part 2, ADR-021 section 3.6)
// There is no rule pack, so there are no fixed parts to add and no mandatory
// clauses to check. The Drafter writes the whole document from the confirmed
// brief under Ajay's rules (T-107, section 6). The free checks run, and the
// draft always carries the starting-draft label.
// ═══════════════════════════════════════════════════════════════════════════

export interface GuidedGenerateInput {
  /** The brief as the server worked it out again from what the user confirmed. Its kind has no id. */
  brief: Brief;
  language: 'en' | 'hi' | 'bilingual';
  targetParagraphs: number;
  /** The court the user chose, from the courts data. Absent when the document is not for a court. */
  courtData?: CourtLookupData;
  /** The advocate's profile name (T-300), when the profile has one. Only read to drop advocate_name from the unknowns (T-365 AC1). */
  advocateName?: string;
  userId?: string;
  runId: string;
  runSequence: number;
  runType: RunType;
}

/** A party value this short is a name, and a name must be in the draft as written. */
const NAME_WORDS_MAX = 6;

export async function streamGenerateGuided(
  input: GuidedGenerateInput,
  res: Response,
): Promise<BriefGenerateResult> {
  const { brief, courtData } = input;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const stopKeepAlive = startSseKeepAlive(res);
  try {
    const userPrompt = buildGuidedDrafterUserPrompt({
      // T-365 AC1: with a profile name, advocate_name is not unknown.
      brief: guidedDrafterBrief(brief, courtData?.designation ?? null, input.advocateName),
      target: input.targetParagraphs,
      language: input.language,
    });

    const meter = new UsageMeter();
    let aiModel: string | undefined;
    let transport: 'direct' | undefined;
    let raw = '';
    const draft: CallUsageDraft = { inputTokens: 0, outputTokens: 0, usageSource: 'none' };
    const recordCall = (): void => {
      aiModel = draft.model ?? aiModel;
      transport = draft.transport ?? transport;
      meter.record({
        sectionId: 'body',
        inputTokens: draft.inputTokens,
        outputTokens:
          draft.usageSource === 'provider' ? draft.outputTokens : estimateOutputTokens(raw),
        usageSource: draft.usageSource === 'provider' ? 'provider' : 'estimated',
      });
    };
    try {
      for await (const text of streamLLM(DRAFTER_GUIDED_SYSTEM_PROMPT, userPrompt, 8192, draft)) {
        raw += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
      recordCall();
    } catch (llmErr) {
      recordCall();
      const classified = classifyLlmError(llmErr);
      if (process.env.NODE_ENV !== 'test') {
        console.error(
          `[drafting] Drafter stream failed (kind=none, runId=${input.runId}, runSequence=${input.runSequence}, runType=${input.runType}):`,
          llmErr instanceof Error ? llmErr.name : 'unknown',
        );
      }
      res.write(
        `event: error\ndata: ${JSON.stringify({
          section: 'body',
          reason: classified.userMessage,
          retryable: classified.retryable,
          code: classified.code,
          runId: input.runId,
        })}\n\n`,
      );
      // The route ends the response after the failed Generation row is saved.
      throw new GenerationFailedError(
        classified.userMessage,
        classified.code,
        meter.totals(),
        aiModel,
        transport,
      );
    }

    // The whole document is the Drafter's. Only a disclaimer it was told not to write is taken out,
    // and a case citation the advocate did not give (T-148).
    const citations = removeUngivenCitations(withoutDisclaimers(raw), [briefText(brief)]);
    const fullText = citations.text;
    const renderedSections: RenderedSection[] = [
      { section_id: 'body', type: 'ai_generated', content: fullText },
    ];
    res.write(
      `event: template_sections\ndata: ${JSON.stringify({
        sections: renderedSections.map((s) => ({
          section_id: s.section_id,
          type: s.type,
          content: s.content,
        })),
      })}\n\n`,
    );

    // ── The free checks (T-107, section 9, condition 3): always run, always shown ──
    const allWarnings: ValidationWarning[] = [];
    // T-346: old-law (T-270 ruling A), BNS whitelist (SCRUM-64 b), other five codes (T-333).
    allWarnings.push(...(await checkDraftCitations(fullText)));

    const given = briefText(brief);
    if (given) {
      const altered = checkFactAlteration(given, fullText);
      if (altered) allWarnings.push(altered);
    }

    for (const [key, what] of [
      [FIXED_KEYS.firstParty, 'person the document is for'],
      [FIXED_KEYS.otherParty, 'person or authority it is addressed to'],
    ]) {
      const value = brief.items.find((i) => i.key === key)?.value;
      if (typeof value !== 'string' || value.length === 0 || fullText.length === 0) continue;
      if (value.trim().split(/\s+/).length > NAME_WORDS_MAX) continue;
      if (!fullText.includes(value)) {
        allWarnings.push({
          type: 'fact_alteration',
          message: `The draft does not contain the ${what} as given in the brief: "${value}". Check that the name is written correctly.`,
          details: { field: key, expected: value },
        });
      }
    }

    // Nothing in the draft that the brief does not give (T-107, section 6, rules 1 and 3).
    allWarnings.push(...checkAgainstBrief(fullText, brief, null));
    // A case citation the advocate did not give was removed (T-148).
    allWarnings.push(...citationWarnings(citations.removed));

    if (allWarnings.length > 0) {
      res.write(`event: warning\ndata: ${JSON.stringify({ warnings: allWarnings })}\n\n`);
    }

    return {
      fullText,
      sections: renderedSections,
      filingChecklist: [],
      sectionsCited: buildSectionsCited(fullText),
      // There is no rule pack, so there are no mandatory clauses to be complete or missing.
      mandatoryClausesComplete: false,
      warnings: allWarnings,
      usage: meter.totals(),
      aiModel,
      transport,
      bodyParaCount: paragraphNumbers(fullText).size,
      missingClauses: [],
      repaired: false,
      // T-127, section 7.3: with no rule pack the label is always on, with no line under it.
      startingDraft: true,
      labelReason: null,
    };
  } finally {
    stopKeepAlive();
  }
}

/**
 * Basic fact-alteration check: extract key entities (numbers, dates, names in caps)
 * from user facts and verify they appear in AI output.
 *
 * SCRUM-54 B4, T-340: the template parts print dates as "D Month YYYY"
 * (e.g. "10 March 2026") and the facts may give them as numbers, so we check
 * every equivalent form of each date (see getDateVariants).
 */
function checkFactAlteration(userFacts: string, aiOutput: string): ValidationWarning | null {
  // Extract FIR numbers, dates, and proper nouns from user input
  // "124/2026" is an FIR or case number. The "04/2026" inside the date "01/04/2026" is not.
  const firPattern = /(?<!\d[/.-])\b\d+\/\d{4}\b/g;
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
    const found = variants.some((v) =>
      new RegExp(`(?<!\\d)${v.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?!\\d)`).test(aiOutput),
    );
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
 *
 * T-340 (Ajay): a numeric date is read day first only (Indian form), so
 * "03.10.2026" is 3 October 2026, never 10 March. Its variants are the numeric
 * forms plus "D Month YYYY" and "DD Month YYYY" (full English month name) for
 * the same day, month and year only.
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

  // T-340: the month-name forms the template parts print, for this date only.
  const monthName = MONTH_NAMES[Number(month) - 1];
  const dayNumber = Number(day);
  if (monthName !== undefined && dayNumber >= 1 && dayNumber <= 31) {
    variants.push(`${dayNumber} ${monthName} ${year}`); // D Month YYYY
    variants.push(`${day} ${monthName} ${year}`); // DD Month YYYY
  }

  return [...new Set(variants)];
}
