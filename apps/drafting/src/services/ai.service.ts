import Anthropic from '@anthropic-ai/sdk';
import { Response } from 'express';

import bnsMapping from '../config/bns-mapping.json';
import { env } from '../config/env';

import { convertOldReferencesInText } from './sections.service';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const DISCLAIMER =
  '\n\n---\n**DISCLAIMER:** AI-assisted draft — verify with applicable law before filing. Lawie does not provide legal advice.';

export type DocTypeKey = keyof typeof bnsMapping;

export interface GenerateDocumentInput {
  docType: string;
  courtName: string;
  courtType: string;
  partyDetails: {
    petitioner?: string;
    respondent?: string;
    applicant?: string;
    accused?: string;
    plaintiff?: string;
    defendant?: string;
    [key: string]: string | undefined;
  };
  keyFacts: string;
  reliefPrayer: string;
  advocateName?: string;
  advocateEnrollment?: string;
}

/**
 * Build a structured prompt for the given document type.
 * References BNS/BNSS sections (not old IPC/CrPC) where applicable.
 */
async function buildPrompt(input: GenerateDocumentInput): Promise<string> {
  const mapping = bnsMapping[input.docType as DocTypeKey];
  const sectionHints = mapping
    ? `\nRelevant statutory provisions under ${mapping.act}:\n` +
      mapping.sections.map((s) => `  - Section ${s.number}: ${s.description}`).join('\n')
    : '';

  const partyLines = Object.entries(input.partyDetails)
    .filter(([, v]) => v)
    .map(([role, name]) => `${role.charAt(0).toUpperCase() + role.slice(1)}: ${name}`)
    .join('\n');

  // Auto-convert any old-law references (IPC/CrPC/IEA) in user input to new codes
  const { converted: convertedFacts } = await convertOldReferencesInText(input.keyFacts);
  const { converted: convertedRelief } = await convertOldReferencesInText(input.reliefPrayer);

  return `You are a senior Indian advocate drafting a court-ready legal document.
Document type: ${input.docType.replace(/_/g, ' ').toUpperCase()}
Court: ${input.courtName} (${input.courtType.replace(/_/g, ' ')})

Parties:
${partyLines || 'Not specified'}

Key facts:
${convertedFacts}

Relief/Prayer sought:
${convertedRelief}
${sectionHints}

IMPORTANT INSTRUCTIONS:
1. Use BNS/BNSS (Bharatiya Nyaya Sanhita 2023 / Bharatiya Nagarik Suraksha Sanhita 2023) section numbers — do NOT reference old IPC or CrPC section numbers.
2. Format the document with proper headings, numbered paragraphs, and formal legal language appropriate for Indian courts.
3. Include the date and place as placeholders: [DATE] and [PLACE].
4. Include signature block for the advocate${input.advocateName ? ` (${input.advocateName}${input.advocateEnrollment ? ', Enrl. No. ' + input.advocateEnrollment : ''})` : ''}.
5. Keep the document professional, concise, and court-ready.
6. Do not include any commentary, explanations, or notes outside the document itself.

Draft the complete document now:`;
}

/**
 * Validate section numbers in the generated text against the BNS mapping.
 * Returns section numbers mentioned in the text that are not in our mapping.
 */
export function validateBnsSections(docType: string, generatedText: string): string[] {
  const mapping = bnsMapping[docType as DocTypeKey];
  if (!mapping) return [];

  const knownSections = new Set(mapping.sections.map((s) => s.number));

  // Match patterns like "Section 480", "Sec. 103", "u/s 481", "under Section 103"
  const sectionPattern = /(?:section|sec\.?|u\/s)\s+(\d+[A-Z]?(?:\([a-z0-9]+\))?)/gi;
  const matches = [...generatedText.matchAll(sectionPattern)];
  const mentioned = matches.map((m) => m[1]);

  const unmatched = mentioned.filter((s) => !knownSections.has(s));
  return [...new Set(unmatched)];
}

/**
 * Stream a document generation response back to an Express Response object.
 * Sends SSE-style text/event-stream with:
 *   - data: chunks of the generated text
 *   - event: done (with validation warnings if any)
 *   - event: error (on failure)
 */
export async function streamGenerateDocument(
  input: GenerateDocumentInput,
  res: Response,
): Promise<string> {
  const prompt = await buildPrompt(input);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  let fullText = '';

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta' &&
      chunk.delta.text
    ) {
      fullText += chunk.delta.text;
      res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
    }
  }

  // Append disclaimer
  res.write(`data: ${JSON.stringify({ text: DISCLAIMER })}\n\n`);
  fullText += DISCLAIMER;

  // Validate BNS sections and send warnings
  const unmatchedSections = validateBnsSections(input.docType, fullText);
  if (unmatchedSections.length > 0) {
    res.write(
      `event: warning\ndata: ${JSON.stringify({
        message: 'Some section numbers could not be verified against the BNS/BNSS mapping',
        sections: unmatchedSections,
      })}\n\n`,
    );
  }

  res.write(`event: done\ndata: ${JSON.stringify({ complete: true })}\n\n`);
  res.end();

  return fullText;
}
