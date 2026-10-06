/**
 * Intake prompts — ADR-019 §3.4, §3.5, §4.1, §4.2.
 *
 * LEGAL CONTENT. Listed in .claude/docs/legal-content-paths.md.
 * Status: written by Vishal on 4 Oct 2026 for T-101 and approved by Ajay the
 * same day. The bail line in MATCH_SYSTEM_PROMPT is Ajay's text from T-127,
 * section 5.2 (6 Oct 2026, T-122). Any later change needs his sign-off.
 *
 * The prompts never decide what reaches the user on their own. The server
 * enforces every rule again: unknown ids become no match, values without a
 * matching quote are dropped, court-data fields are never accepted, types
 * and options are checked (intake.service.ts).
 */
import type { FormField } from './template-engine.service';

export interface CatalogueEntry {
  template_id: string;
  display_name: string;
  category: string;
  description: string;
}

export const MATCH_SYSTEM_PROMPT = `You sort requests for an Indian legal drafting service.
The user describes a matter in their own words. You decide which document template, from the catalogue given, fits the document they need.

Rules:
- Choose only a template_id that appears in the catalogue, copied exactly. Never invent one.
- confidence "high": exactly one template clearly fits.
- confidence "medium": two or three templates could fit and the description does not settle which. List them in alternatives, best first.
- confidence "low": no template in the catalogue fits the document they need, but it is a legal drafting request. Set template_id to null.
- Bail: a person who has already been arrested or is in custody needs regular bail. A person who has not been arrested and expects to be arrested needs anticipatory bail. Never choose an anticipatory bail template when the description says the person has been arrested or is in custody. Never choose a regular bail template when the description says the person has not been arrested. If the description does not say which, use confidence "medium" and list both.
- is_legal_drafting false: the request is not for a legal document at all (for example general questions, chat, or unrelated tasks). Set template_id to null.
- is_court_document true when the document would be filed in or addressed to a court or tribunal, or the description mentions a court, an FIR, a case number, bail, a petition, an appeal, a suit or a writ.
- label: a short generic name for the document requested, at most 8 words. Do not include any person's name, any number, any date, any place or any organisation name.
- category: one word guess such as criminal, civil, family, property, consumer, corporate, labour, notice, affidavit, agreement, other.

Reply with JSON only, no other text, in exactly this shape:
{"template_id": string or null, "confidence": "high" | "medium" | "low", "alternatives": [template_id, ...], "is_legal_drafting": boolean, "is_court_document": boolean, "label": string, "category": string}`;

export function buildMatchUserPrompt(description: string, catalogue: CatalogueEntry[]): string {
  const lines = catalogue.map(
    (t) => `${t.template_id} | ${t.display_name} | ${t.category} | ${oneLine(t.description, 140)}`,
  );
  return `Catalogue (template_id | name | category | description):
${lines.join('\n')}

User's description:
<description>
${description}
</description>`;
}

export const FILL_SYSTEM_PROMPT = `You read a user's description of a legal matter and copy out the details it states, into the fields of a form.

Rules:
- Fill a field only when the description itself states the value. Never infer, complete, assume or guess.
- For every value, give quote: the exact words from the description the value was read from, copied character for character.
- Names, FIR numbers, section numbers, dates, amounts, addresses and enrolment numbers: copy them as the user wrote them. Pass old law section numbers (IPC, CrPC, Evidence Act) through as written. Do not convert them.
- Dates: give the value as YYYY-MM-DD, and the quote as the user wrote the date.
- Choice fields: the value must be one of the option ids listed for that field. Give the quote that supports the choice.
- Narrative fields (facts, grounds, background): use the user's own words. You may shorten by leaving words out. Never add a fact, name, date, amount or section that the user did not write.
- If the description states two different values for the same field, leave that field out.
- Leave out any field the description does not state. An empty result is acceptable.

Reply with JSON only, no other text, in exactly this shape:
{"fields": [{"field_id": string, "value": string or [string, ...], "quote": string}]}`;

export function buildFillUserPrompt(description: string, fields: FormField[]): string {
  const lines = fields.map((f) => {
    const parts = [`${f.field_id} | ${f.label} | ${f.type}`];
    if (f.options && f.options.length > 0) {
      parts.push(
        `options: ${f.options.map((o) => `${o.id} (${oneLine(o.label, 60)})`).join(', ')}`,
      );
    }
    if (f.type === 'multi_select_search' || f.type === 'checkbox_group')
      parts.push('list of values');
    return parts.join(' | ');
  });
  return `Form fields (field_id | label | type | options):
${lines.join('\n')}

User's description:
<description>
${description}
</description>`;
}

function oneLine(s: string, max: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
