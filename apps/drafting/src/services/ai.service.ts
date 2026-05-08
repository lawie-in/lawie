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
 * Stream text tokens from the LLM.
 *
 * - When HELICONE_API_KEY is set: calls Helicone AI Gateway (OpenAI-compat endpoint)
 *   using native fetch — this is the same endpoint verified working in Postman.
 * - When not set: falls back to Anthropic SDK directly.
 *
 * Yields raw text chunks as they arrive.
 */
async function* streamLLM(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  trackingHeaders: Record<string, string> = {},
): AsyncGenerator<string> {
  if (env.HELICONE_API_KEY) {
    // Helicone AI Gateway — OpenAI-compatible, supports Claude model aliases
    const resp = await fetch(env.HELICONE_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.HELICONE_API_KEY}`,
        ...trackingHeaders,
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        stream: true,
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
          const data = JSON.parse(line.slice(6));
          const text = data.choices?.[0]?.delta?.content;
          if (text) yield text;
        } catch {
          // malformed SSE line — skip
        }
      }
    }
  } else {
    // Direct Anthropic SDK — no proxy
    const stream = await directClient.messages.stream({
      model: env.ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta' &&
        chunk.delta.text
      ) {
        yield chunk.delta.text;
      }
    }
  }
}

/**
 * Build per-request Helicone tracking headers for the AI Gateway.
 * Returns empty object when Helicone is not configured.
 */
function heliconeHeaders(userId?: string, templateId?: string): Record<string, string> {
  if (!env.HELICONE_API_KEY) return {};
  const headers: Record<string, string> = {};
  if (userId) headers['Helicone-User-Id'] = userId;
  if (templateId) headers['Helicone-Property-Template'] = templateId;
  return headers;
}

export type DocTypeKey = keyof typeof bnsMapping;

export interface GenerateDocumentInput extends PromptInput {
  userId?: string;
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
}

/**
 * Legacy validateBnsSections — kept for backwards compatibility.
 * The new validator.ts provides richer validation.
 */
export function validateBnsSections(docType: string, generatedText: string): string[] {
  const mapping = bnsMapping[docType as DocTypeKey];
  if (!mapping) return [];

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

  for await (const text of streamLLM(
    systemPrompt,
    userPrompt,
    4096,
    heliconeHeaders(input.userId, input.docType),
  )) {
    rawText += text;
    res.write(`data: ${JSON.stringify({ text })}\n\n`);
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
}

export interface TemplateGenerateResult {
  fullText: string;
  sections: RenderedSection[];
  filingChecklist: string[];
  sectionsCited: string[];
  mandatoryClausesComplete: boolean;
  warnings: ValidationWarning[];
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

      for await (const text of streamLLM(
        systemPrompt,
        userPrompt,
        8192,
        heliconeHeaders(input.userId, templateConfig.template_id),
      )) {
        aiText += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
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
