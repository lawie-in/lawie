/**
 * From a confirmed brief to the Drafter, and back (T-106, ADR-021 sections
 * 3.5 and 3.6).
 *
 * This file has no I/O: no model call, no database, no logging. It builds
 * what the Drafter is given, cuts the clause report off what it returns,
 * decides which mandatory clauses are missing, and checks that the body holds
 * no date or section the brief and the rule pack do not give.
 *
 * LEGAL CONTENT: the rules are Ajay's, signed in T-127
 * (`handoff/design/T-127-one-flow-rules-and-prompts.md`, sections 4 and 7.3),
 * in ADR-021, section 5, and for a request with no rule pack in T-107
 * (`handoff/design/T-107-guided-draft-rules-and-prompts.md`, sections 4 and
 * 6). The parts the Drafter is shown, the removal of a repeated part, and the
 * findings on dates, facts, periods and parts are signed in T-136
 * (`handoff/design/T-136-drafter-rules-signed.md`, 7 Oct 2026, two parts, with
 * conditions). Do not change them without his sign-off.
 */
import { dateKindLabel, statedDates } from './intake-brief';
import type { Brief, BriefItem } from './intake-brief';
import { datesAsWritten, datesInText, normalise } from './intake-text';
import type { RulePack, RulePackClause } from './rule-pack.service';
import type { RenderedSection, TemplateConfig } from './template-engine.service';
import { extractSectionReferences, ValidationWarning } from './validator';

/** The line the Drafter writes between the document and its clause report. */
export const CLAUSES_MARKER = '===CLAUSES===';

/** T-107, section 4. The user cannot remove either. */
export const STARTING_DRAFT_LABEL = 'Starting draft — review before use · not court-verified';
export const STARTING_DRAFT_FOOTER =
  'Starting draft prepared with AI assistance from the details you gave. Not checked against court rules. Review every line before use. Lawie does not provide legal advice.';

export const TARGET_PARAGRAPHS = { min: 5, max: 40, fallback: 15 } as const;

// ── The parts the system adds ───────────────────────────────────────────────

export interface SystemPart {
  sectionId: string;
  label: string;
}

/** Every part of the document that code renders from the brief. The Drafter does not write these. */
export function systemParts(config: TemplateConfig): SystemPart[] {
  return config.document_structure.sections
    .filter((s) => s.type === 'template')
    .map((s) => ({ sectionId: s.section_id, label: s.section_id.replace(/_/g, ' ') }));
}

// ── Form values for the parts the system adds ───────────────────────────────

function isEmpty(v: string | string[] | null): boolean {
  return v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

/**
 * The brief as the values the existing template sections expect.
 *
 * - A choice is stored in the brief by its label. The template's own logic
 *   compares option ids, so a label is turned back into its id where the
 *   template has that option.
 * - A fact that is not given becomes its visible blank, so the cause title
 *   or the prayer shows "[To be confirmed: ...]" and never a guess.
 * - The court is the one the user chose from the courts data.
 */
export function formDataFromBrief(
  brief: Brief,
  config: TemplateConfig,
  language: string,
): Record<string, unknown> {
  const optionIds = new Map<string, Map<string, string>>();
  for (const step of config.form_schema.steps) {
    for (const field of step.fields) {
      if (!field.options || field.options.length === 0) continue;
      const byLabel = new Map<string, string>();
      for (const o of field.options) {
        byLabel.set(normalise(o.label), o.id);
        byLabel.set(normalise(o.id), o.id);
      }
      optionIds.set(field.field_id, byLabel);
    }
  }
  const toId = (key: string, label: string): string =>
    optionIds.get(key)?.get(normalise(label)) ?? label;

  const data: Record<string, unknown> = {};
  for (const item of brief.items) {
    if (isEmpty(item.value)) {
      data[item.key] = item.placeholder;
    } else if (Array.isArray(item.value)) {
      data[item.key] = item.value.map((v) => toId(item.key, v));
    } else {
      data[item.key] = toId(item.key, item.value as string);
    }
  }
  if (brief.court.state) data.state = brief.court.state;
  if (brief.court.court_type) data.court_type = brief.court.court_type;
  if (brief.court.court) data.court_name = brief.court.court;
  data.language = language;
  return data;
}

// ── What the Drafter is given ───────────────────────────────────────────────

function oneLine(s: string, max: number): string {
  const flat = s.replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** 2026-03-15 -> 15.03.2026, the form Indian filings use. Anything else is left as written. */
function filingDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value;
}

function shown(item: BriefItem, converted?: Record<string, unknown>): string | string[] {
  const override = converted?.[item.key];
  const value = (typeof override === 'string' ? override : item.value) as string | string[];
  if (item.kind === 'date' && typeof value === 'string') return filingDate(value);
  return value;
}

/** The parts of the confirmed brief, as every Drafter reads them. */
interface BriefParts {
  document: string;
  court: string | null;
  parties: Array<{ key: string; what: string; value: string | string[] }>;
  facts: Array<{ key: string; what: string; value: string | string[] }>;
  dates: Array<{ key: string; date_of: string; date: string }>;
  numbers: Array<{ key: string; what: string; value: string | string[] }>;
  asked_for: Array<{ key: string; what: string; value: string | string[] }>;
  other: Array<{ what: string; value: string | string[] }>;
  unknown: Array<{ what: string; blank: string }>;
}

export interface DrafterBrief extends BriefParts {
  /**
   * The matter as the advocate first described it, word for word (T-136).
   * Only what the advocate typed: nothing a model wrote and nothing read from
   * a file. Null when the request did not carry it.
   */
  described: string | null;
}

/**
 * The confirmed brief as the Drafter reads it. Each fact keeps its key, so a
 * pack instruction that names a fact still reads correctly. `courtLine` is the
 * court's designation from the courts data. `converted` holds text values
 * after old-law section numbers were converted, by key.
 */
export function drafterBrief(
  brief: Brief,
  courtLine: string | null,
  converted?: Record<string, unknown>,
  described?: string | null,
): DrafterBrief {
  return {
    ...briefParts(brief, courtLine, converted),
    described: typeof described === 'string' && described.trim() !== '' ? described.trim() : null,
  };
}

function briefParts(
  brief: Brief,
  courtLine: string | null,
  converted?: Record<string, unknown>,
): BriefParts {
  const out: BriefParts = {
    document: brief.kind.name,
    court: brief.kind.court_document ? (courtLine ?? '[To be confirmed: court]') : null,
    parties: [],
    facts: [],
    dates: [],
    numbers: [],
    asked_for: [],
    other: brief.unplaced.map((u) => ({ what: u.label, value: u.value })),
    unknown: brief.still_unknown.map((u) => ({ what: u.label, blank: u.placeholder })),
  };
  for (const item of brief.items) {
    if (isEmpty(item.value)) continue;
    const value = shown(item, converted);
    if (item.part === 'dates') {
      out.dates.push({
        key: item.key,
        date_of: item.meaning ?? item.label,
        date: value as string,
      });
      continue;
    }
    const entry = { key: item.key, what: item.label, value };
    if (item.part === 'parties') out.parties.push(entry);
    else if (item.part === 'numbers') out.numbers.push(entry);
    else if (item.part === 'relief') out.asked_for.push(entry);
    else out.facts.push(entry);
  }
  return out;
}

/** One line per mandatory clause: id | title | what it must cover | fixed wording, if any. */
export function clauseLines(pack: RulePack): string[] {
  return pack.mandatoryClauses
    .filter((c) => c.required)
    .map((c) => {
      const covers = [c.detail, c.parts.length > 0 ? `Parts: ${c.parts.join('; ')}` : null]
        .filter((x): x is string => x !== null)
        .join(' ');
      const applies = c.appliesWhen ? ` (only when: ${c.appliesWhen})` : '';
      return [
        c.id,
        oneLine(c.title, 160),
        oneLine(`${covers}${applies}`, 600) || '-',
        c.fixedText ? oneLine(c.fixedText, 1500) : '-',
      ].join(' | ');
    });
}

export function actLines(pack: RulePack): string[] {
  return pack.relevantActs.map((a) => {
    const sections = a.sections
      .map((s) => (s.description ? `${s.number} (${oneLine(s.description, 120)})` : s.number))
      .join('; ');
    const when = a.appliesWhen ? ` [only when: ${oneLine(a.appliesWhen, 120)}]` : '';
    return sections ? `${a.act}: ${sections}${when}` : `${a.act}${when}`;
  });
}

export interface DrafterPromptInput {
  pack: RulePack;
  brief: DrafterBrief;
  /**
   * Instructions the system states for this draft, such as the provision the
   * application is made under before the court chosen (T-135). They come
   * first, ahead of the pack's own.
   */
  statedInstructions?: string[];
  systemParts: SystemPart[];
  /** The text of those parts as it stands on the page, around the Drafter's text (T-136). */
  systemText?: SystemText;
  /** The court's own rules, one per line, when the court is known. */
  courtRules: string[];
  target: number;
  language: string;
}

function block(name: string, lines: string[]): string {
  return `${name}:\n${lines.length > 0 ? lines.join('\n') : 'none'}`;
}

function commonBlocks(input: DrafterPromptInput): string[] {
  return [
    `DOCUMENT: ${oneLine(input.pack.name, 160)}`,
    `BRIEF:\n${JSON.stringify(input.brief, null, 1)}`,
    block(
      'CLAUSES (id | title | what it must cover | fixed wording, if any)',
      clauseLines(input.pack),
    ),
    block(
      'INSTRUCTIONS',
      [...(input.statedInstructions ?? []), ...input.pack.draftingInstructions].map(
        (i) => `- ${i}`,
      ),
    ),
    block(
      'ACTS',
      actLines(input.pack).map((a) => `- ${a}`),
    ),
    block(
      'COURT RULE',
      input.courtRules.map((r) => `- ${r}`),
    ),
    block(
      'SYSTEM PARTS',
      input.systemParts.map((p) => `- ${p.label}`),
    ),
    `BEFORE YOUR TEXT:\n${input.systemText?.before || 'none'}`,
    `AFTER YOUR TEXT:\n${input.systemText?.after || 'none'}`,
  ];
}

export function buildDrafterUserPrompt(input: DrafterPromptInput): string {
  return [...commonBlocks(input), `TARGET: ${input.target}`, `LANGUAGE: ${input.language}`].join(
    '\n\n',
  );
}

export function buildRepairUserPrompt(
  input: DrafterPromptInput,
  documentText: string,
  missingIds: string[],
): string {
  return [
    ...commonBlocks(input),
    `LANGUAGE: ${input.language}`,
    `DOCUMENT TEXT:\n<document>\n${documentText}\n</document>`,
    `MISSING: ${missingIds.join(', ')}`,
  ].join('\n\n');
}

export function clampTarget(n: number | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return TARGET_PARAGRAPHS.fallback;
  return Math.min(TARGET_PARAGRAPHS.max, Math.max(TARGET_PARAGRAPHS.min, Math.round(n)));
}

// ── Streaming: the clause report never reaches the user ─────────────────────

/**
 * Passes the document through as it streams and holds back the clause report.
 * Text is released only once it cannot be the start of the marker line.
 */
export class TrailerFilter {
  private held = '';
  private cut = false;

  push(chunk: string): string {
    if (this.cut) return '';
    this.held += chunk;
    const at = this.held.indexOf(CLAUSES_MARKER);
    if (at >= 0) {
      const out = this.held.slice(0, at);
      this.held = '';
      this.cut = true;
      return out;
    }
    let keep = Math.min(this.held.length, CLAUSES_MARKER.length - 1);
    while (keep > 0 && !CLAUSES_MARKER.startsWith(this.held.slice(this.held.length - keep))) {
      keep -= 1;
    }
    const out = this.held.slice(0, this.held.length - keep);
    this.held = this.held.slice(this.held.length - keep);
    return out;
  }

  /** What is still held when the stream ends: text that was not a marker after all. */
  end(): string {
    const out = this.cut ? '' : this.held;
    this.held = '';
    return out;
  }
}

// ── The clause report ───────────────────────────────────────────────────────

export type ClauseStatus =
  | { kind: 'paragraphs'; numbers: number[] }
  | { kind: 'system' }
  | { kind: 'missing' };

export interface DrafterOutput {
  /** The document, with everything from the marker line onwards cut off. */
  body: string;
  /** Null when the Drafter wrote no report at all. */
  report: Map<string, ClauseStatus> | null;
}

function parseNumbers(text: string): number[] {
  const out: number[] = [];
  for (const raw of text.split(/[,;]|\band\b/)) {
    // "paras 4-6", "paragraph 3" and "3" all name paragraphs.
    const part = raw.replace(/^\s*(?:paras?\.?|paragraphs?)\s*/i, '').trim();
    const range = /^(\d{1,3})\s*(?:-|–|to)\s*(\d{1,3})$/.exec(part);
    if (range) {
      const from = +range[1];
      const to = +range[2];
      if (to >= from && to - from <= 60) for (let n = from; n <= to; n += 1) out.push(n);
      continue;
    }
    if (/^\d{1,3}$/.test(part)) out.push(+part);
  }
  return out;
}

export function splitDrafterOutput(text: string): DrafterOutput {
  const at = text.indexOf(CLAUSES_MARKER);
  if (at < 0) return { body: text.trim(), report: null };
  const body = text.slice(0, at).trim();
  const report = new Map<string, ClauseStatus>();
  for (const line of text.slice(at + CLAUSES_MARKER.length).split('\n')) {
    const m = /^\s*[-*]?\s*([A-Za-z0-9_.-]+)\s*:\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const id = m[1];
    const value = m[2];
    if (report.has(id)) continue;
    if (/^system\b/i.test(value)) report.set(id, { kind: 'system' });
    else if (/^missing\b/i.test(value)) report.set(id, { kind: 'missing' });
    else report.set(id, { kind: 'paragraphs', numbers: parseNumbers(value) });
  }
  return { body, report };
}

/** The numbers of the numbered paragraphs in the body: "1.", "2.", ... at the start of a line. */
export function paragraphNumbers(body: string): Set<number> {
  const out = new Set<number>();
  for (const m of body.matchAll(/^\s*(\d{1,3})\.\s/gm)) out.add(+m[1]);
  return out;
}

/** Which system part a clause belongs to, by what it is called. Null when it belongs to none. */
const CLAUSE_TO_PART: Array<{ clause: RegExp; part: RegExp }> = [
  { clause: /cause[\s_-]*title|court[\s_-]*header/i, part: /^(cause_title|header)$/ },
  { clause: /prayer|relief|demand/i, part: /^(prayer|demand_clause)$/ },
  { clause: /verif|affirmation/i, part: /^verification$/ },
  { clause: /advocate|counsel|signature|execution/i, part: /^(advocate_block|closing)$/ },
  { clause: /heading|subject/i, part: /(_heading|^subject_line)$/ },
  { clause: /address/i, part: /^addressing_clause$/ },
  { clause: /recital/i, part: /^recitals$/ },
  // T-136: the warning of prosecution stands in the demand the system adds.
  { clause: /prosecution[\s_-]*warning/i, part: /^demand_clause$/ },
];

/** True when the system did add the part this clause belongs to. */
export function coveredBySystemPart(clause: RulePackClause, parts: SystemPart[]): boolean {
  const name = `${clause.id} ${clause.title}`;
  return CLAUSE_TO_PART.some(
    (rule) => rule.clause.test(name) && parts.some((p) => rule.part.test(p.sectionId)),
  );
}

/**
 * True when the body carries the clause's fixed wording. The wording has
 * blanks that the Drafter fills, so the test is on the words between the
 * blanks: each stretch of 12 characters or more must appear, in order.
 */
export function hasFixedWording(body: string, fixedText: string): boolean {
  const normBody = normalise(body);
  const stretches = fixedText
    .split(/\{\{[^}]*\}\}|\{[^}]*\}|\[[^\]]*\]|_{3,}/)
    .map((s) => normalise(s).replace(/^[\s.,;:]+|[\s.,;:]+$/g, ''))
    .filter((s) => s.length >= 12);
  if (stretches.length === 0) return true;
  let from = 0;
  for (const stretch of stretches) {
    const at = normBody.indexOf(stretch, from);
    if (at < 0) return false;
    from = at + stretch.length;
  }
  return true;
}

export interface MissingClause {
  id: string;
  title: string;
  reason:
    | 'no_report'
    | 'reported_missing'
    | 'paragraph_not_found'
    | 'wording_not_found'
    | 'not_a_system_part';
}

/**
 * The mandatory clauses the draft does not cover (T-127, section 4, server
 * step 2). A clause counts as missing when the Drafter says so, when it has
 * no line, when a paragraph on its line is not in the body, when its fixed
 * wording is not in the body, or when it is reported as a system part that the
 * system did not add.
 *
 * A clause that applies only in some cases is not checked: code cannot tell
 * whether the case arises. An optional clause is never missing.
 */
export function findMissingClauses(
  pack: RulePack,
  output: DrafterOutput,
  parts: SystemPart[],
): MissingClause[] {
  const inBody = paragraphNumbers(output.body);
  const missing: MissingClause[] = [];
  for (const clause of pack.mandatoryClauses) {
    if (!clause.required || clause.appliesWhen !== null) continue;
    const add = (reason: MissingClause['reason']): void => {
      missing.push({ id: clause.id, title: clause.title, reason });
    };
    const status = output.report?.get(clause.id);
    if (!status) {
      // With no line from the Drafter, a part the system added still counts.
      if (!coveredBySystemPart(clause, parts)) add('no_report');
      continue;
    }
    if (status.kind === 'missing') {
      add('reported_missing');
    } else if (status.kind === 'system') {
      if (!coveredBySystemPart(clause, parts)) add('not_a_system_part');
    } else if (status.numbers.length === 0 || !status.numbers.every((n) => inBody.has(n))) {
      add('paragraph_not_found');
    } else if (clause.fixedText !== null && !hasFixedWording(output.body, clause.fixedText)) {
      add('wording_not_found');
    }
  }
  return missing;
}

/**
 * The repair pass may add clauses and nothing else (T-127, section 4.1). True
 * when every paragraph of the first body is still in the repaired one, word
 * for word, numbers aside.
 */
export function keepsEveryParagraph(before: string, after: string): boolean {
  const normAfter = normalise(after);
  const paragraphs = before
    .split(/\n\s*\n+/)
    .map((p) => normalise(p.replace(/^\s*\d{1,3}\.\s+/, '')))
    .filter((p) => p.length >= 20);
  return paragraphs.every((p) => normAfter.includes(p));
}

// ── Nothing in the body that the brief and the pack do not give ─────────────

function textValues(brief: Brief): string[] {
  const out: string[] = [];
  for (const item of brief.items) {
    if (typeof item.value === 'string') out.push(item.value);
    else if (Array.isArray(item.value)) out.push(...item.value);
  }
  for (const u of brief.unplaced) out.push(...(Array.isArray(u.value) ? u.value : [u.value]));
  return out;
}

/** "S.36-42 (injunctions)" -> ["36", "42"]. The bare section numbers a text holds. */
function sectionNumbers(text: string): string[] {
  return (text.match(/\d+[A-Za-z]{0,2}/g) ?? []).map((n) => n.toUpperCase());
}

/**
 * Findings for a date or a section number in the body that is in neither the
 * brief nor the rule pack (ADR-021, rule 2). These are for the advocate to
 * check: the code does not remove anything from the draft.
 */
export function checkAgainstBrief(
  body: string,
  brief: Brief,
  pack: RulePack | null,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const given = textValues(brief);

  const knownDates = new Set<string>();
  for (const v of given) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) knownDates.add(v);
    for (const d of datesInText(v)) knownDates.add(d);
  }
  for (const date of datesInText(body)) {
    if (knownDates.has(date)) continue;
    warnings.push({
      type: 'fact_alteration',
      message: `The draft has a date that is not in your brief: ${filingDate(date)}. Check it before use.`,
      details: { field: 'date', expected: filingDate(date) },
    });
  }

  const knownSections = new Set<string>();
  for (const act of pack?.relevantActs ?? []) {
    for (const s of act.sections) for (const n of sectionNumbers(s.number)) knownSections.add(n);
  }
  for (const v of given) for (const n of sectionNumbers(v)) knownSections.add(n);
  const flagged = new Set<string>();
  for (const ref of extractSectionReferences(body)) {
    const base = (ref.section.match(/^\d+[A-Za-z]{0,2}/)?.[0] ?? ref.section).toUpperCase();
    if (knownSections.has(base) || flagged.has(base)) continue;
    flagged.add(base);
    warnings.push({
      type: 'invalid_section',
      message: pack
        ? `Section ${ref.section}${ref.code ? ` ${ref.code}` : ''} is in the draft but not in your brief or in the rules for this document. Verify before filing.`
        : `Section ${ref.section}${ref.code ? ` ${ref.code}` : ''} is in the draft but not in your brief. Verify before filing.`,
      details: { section: ref.section, code: ref.code || undefined },
    });
  }
  // The second and later numbers of a list: "Sections 481 and 482" (T-135).
  for (const base of citedSectionNumbers(body)) {
    if (knownSections.has(base) || flagged.has(base)) continue;
    flagged.add(base);
    warnings.push({
      type: 'invalid_section',
      message: pack
        ? `Section ${base} is in the draft but not in your brief or in the rules for this document. Verify before filing.`
        : `Section ${base} is in the draft but not in your brief. Verify before filing.`,
      details: { section: base },
    });
  }
  return warnings;
}

// ── What the system has already written (T-136) ─────────────────────────────

export interface SystemText {
  /** The parts that stand above the Drafter's text, as they will print. */
  before: string;
  /** The parts that follow it. */
  after: string;
  /** The first line of each part, for telling a repeated heading. */
  headings: string[];
}

/**
 * The text of the parts the system adds, split around the place of the
 * Drafter's text. The Drafter is shown both so that it writes neither again.
 * The number of the last paragraph is not known yet, so its place is marked.
 */
export function systemTextAround(
  sections: Array<Pick<RenderedSection, 'type' | 'content'>>,
): SystemText {
  const before: string[] = [];
  const after: string[] = [];
  const headings: string[] = [];
  let bodySeen = false;
  for (const section of sections) {
    if (section.type !== 'template') {
      bodySeen = true;
      continue;
    }
    const text = section.content.replace(/\{body_para_count\}/g, '[last paragraph]').trim();
    if (text === '') continue;
    (bodySeen ? after : before).push(text);
    const first = text.split('\n').find((l) => l.trim() !== '');
    if (first) headings.push(first.trim());
  }
  return { before: before.join('\n\n'), after: after.join('\n\n'), headings };
}

/** A numbered paragraph of the body: "1. ..." or "1) ...". */
const PARAGRAPH_START = /^\s*\d+[.)]\s/;
/** A sub-point of one: "(a) ...", "(ii) ...". */
const SUB_POINT = /^\s*\((?:[a-z]{1,2}|[ivxlc]+|\d{1,2})\)\s/i;
/** A paragraph number or the mark of a sub-point with nothing after it. */
const ONLY_A_NUMBER = /^\s*(?:\d+[.)]|\((?:[a-z]{1,2}|[ivxlc]+|\d{1,2})\))\s*$/i;
/**
 * The word SYSTEM belongs to the clause report. In the document it is a note
 * on a part the system adds: anything in square brackets that holds the word,
 * and the word alone in round brackets, or after a dash or a colon in them.
 */
const SYSTEM_NOTE =
  /[ \t]?(?:\[[^[\]\n]*\bSYSTEM\b[^[\]\n]*\]|\(\s*(?:[^()\n]{0,60}?[—–:-]\s*)?SYSTEM\s*\))/g;

/**
 * Every word, number and sign of a text, in order. Two texts with the same
 * tokens say the same thing: only case, spacing and punctuation can differ.
 */
function everyToken(text: string): string[] {
  const flat = normalise(text).replace(/(\p{N}),(?=\p{N})/gu, '$1');
  return flat.match(/[\p{L}\p{M}]+|\p{N}+|[\p{Sc}%&+=<>@§/]/gu) ?? [];
}

interface TextBlock {
  /** The lines of the text this block holds: from `from` up to, not including, `to`. */
  from: number;
  to: number;
  lines: string[];
  /** It opens with a paragraph number. */
  paragraph: boolean;
  /** It opens with the mark of a sub-point. */
  subPoint: boolean;
}

/** A text cut into blocks. A blank line ends a block, and a paragraph number always opens one. */
function blocksOf(text: string): TextBlock[] {
  const lines = text.split('\n');
  const blocks: TextBlock[] = [];
  let from = -1;
  const close = (to: number): void => {
    if (from < 0) return;
    const own = lines.slice(from, to);
    blocks.push({
      from,
      to,
      lines: own,
      paragraph: PARAGRAPH_START.test(own[0]),
      subPoint: SUB_POINT.test(own[0]),
    });
    from = -1;
  };
  lines.forEach((line, i) => {
    if (line.trim() === '') {
      close(i);
      return;
    }
    if (from >= 0 && PARAGRAPH_START.test(line)) close(i);
    if (from < 0) from = i;
  });
  close(lines.length);
  return blocks;
}

interface SystemLines {
  /** Every token of the text, in order. */
  tokens: string[];
  /** Where a line starts and where one ends, as places in `tokens`. */
  starts: Set<number>;
  ends: Set<number>;
  /** Each line as its tokens, joined. */
  whole: Set<string>;
  /** Lines with no token, such as a rule to sign on, as written. */
  bare: Set<string>;
}

function linesOfSystem(text: string): SystemLines {
  const out: SystemLines = {
    tokens: [],
    starts: new Set(),
    ends: new Set(),
    whole: new Set(),
    bare: new Set(),
  };
  for (const line of text.split('\n')) {
    const tokens = everyToken(line);
    if (tokens.length === 0) {
      if (line.trim() !== '') out.bare.add(line.trim());
      continue;
    }
    out.starts.add(out.tokens.length);
    out.tokens.push(...tokens);
    out.ends.add(out.tokens.length);
    out.whole.add(tokens.join(' '));
  }
  return out;
}

function sameRun(all: string[], at: number, run: string[]): boolean {
  if (at + run.length > all.length) return false;
  for (let i = 0; i < run.length; i += 1) if (all[at + i] !== run[i]) return false;
  return true;
}

/**
 * True when a block is whole lines of the system's own text, in the system's
 * order, and nothing else. Such a block carries no fact, name, date, amount,
 * section or relief that the system's part does not carry: every word, number
 * and sign of it is there already, as the same lines. One token more, one
 * fewer or one different, and it is not a repeat.
 */
function repeatsWholeLines(block: string, system: SystemLines): boolean {
  const tokens = everyToken(block);
  if (tokens.length === 0) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '');
    return lines.length > 0 && lines.every((l) => system.bare.has(l));
  }
  for (const start of system.starts) {
    if (system.ends.has(start + tokens.length) && sameRun(system.tokens, start, tokens)) {
      return true;
    }
  }
  return false;
}

/**
 * Takes out of the Drafter's text what the system has already put on the
 * page, and the word SYSTEM in brackets, which belongs to the clause report.
 *
 * Ajay's condition (T-136, part 1, condition 4): a repeat is removed only
 * where it carries no fact, name, date, amount, section or relief that the
 * system's own part does not carry. Here that means: text with no paragraph
 * number, standing above the first numbered paragraph or below the last, that
 * is whole lines of the system's text on that side and nothing else.
 *
 * A repeated part goes as a whole or not at all. It runs from a line that is
 * the heading of one of the system's parts to the next such line. Its blocks,
 * read together, must be one unbroken run of whole lines of the system's
 * text, in the system's order. Lines of the system's text put together in
 * another order or with lines left out between them (a name under the wrong
 * heading, the parties changed over) are not a repeat. Then all of it stays,
 * heading included, and `checkOneDocument` reports it: a heading is never
 * taken off text that the advocate must still see. A numbered paragraph and a
 * sub-point are never removed, and nothing is removed on a side where the
 * system wrote nothing.
 *
 * A numbered paragraph that held nothing but a SYSTEM note is left as a bare
 * number. That line is taken out too, so that the paragraph is not counted as
 * written and its clause is seen as not covered. The other paragraphs keep
 * their numbers: the numbering then has a gap, and nothing is renumbered.
 */
export function removeRepeatedParts(
  body: string,
  system: SystemText,
): { body: string; removed: string[] } {
  const removed: string[] = [];
  const source = body.split('\n');
  const lines: string[] = [];
  source.forEach((line, i) => {
    const without = line.replace(SYSTEM_NOTE, (note) => {
      removed.push(note.trim());
      return '';
    });
    if (without !== line && ONLY_A_NUMBER.test(without)) {
      // Nothing is left of the paragraph unless its text carries on below.
      const next = (source[i + 1] ?? '').replace(SYSTEM_NOTE, '');
      if (next.trim() === '' || PARAGRAPH_START.test(next) || SUB_POINT.test(next)) return;
    }
    lines.push(without);
  });
  const text = lines.join('\n');

  const gone = new Set<number>();
  const blocks = blocksOf(text);
  const first = blocks.findIndex((b) => b.paragraph);
  if (first >= 0) {
    let last = blocks.length - 1;
    while (last > first && !blocks[last].paragraph && !blocks[last].subPoint) last -= 1;
    const headings = new Set(system.headings.map((h) => everyToken(h).join(' ')));
    const opensPart = (block: TextBlock): boolean =>
      headings.has(everyToken(block.lines[0]).join(' '));
    const zones: Array<{ blocks: TextBlock[]; side: SystemLines | null }> = [
      {
        blocks: blocks.slice(0, first),
        side: system.before === '' ? null : linesOfSystem(system.before),
      },
      {
        blocks: blocks.slice(last + 1),
        side: system.after === '' ? null : linesOfSystem(system.after),
      },
    ];
    for (const { blocks: zone, side } of zones) {
      if (side === null) continue;
      const repeated: TextBlock[][] = [];
      for (const block of zone) {
        if (repeated.length === 0 || opensPart(block)) repeated.push([]);
        repeated[repeated.length - 1].push(block);
      }
      for (const part of repeated) {
        const texts = part.map((b) => b.lines.join('\n'));
        // The part is judged as one text: each block being a line of the
        // system's is not enough, they must follow each other as its lines do.
        const same =
          part.every((b) => !b.paragraph && !b.subPoint) &&
          repeatsWholeLines(texts.join('\n'), side);
        if (!same) continue;
        part.forEach((b, k) => {
          removed.push(texts[k].trim());
          for (let n = b.from; n < b.to; n += 1) gone.add(n);
        });
      }
    }
  }

  if (removed.length === 0) return { body, removed };
  const kept = text
    .split('\n')
    .filter((_line, n) => !gone.has(n))
    .join('\n');
  return {
    body: kept
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    removed,
  };
}

/**
 * Lines that a document has once: the addressee, the closing, the salutation,
 * the subject line, the line between the parties, a party's line in the cause
 * title, and the name of the court. One in the Drafter's text is a second one
 * only where the system's parts already show one of the same kind.
 */
const PART_LINES: RegExp[] = [
  /^(?:to|from)\s*,?$/i,
  /^yours\s+(?:faithfully|sincerely|truly|respectfully|obediently)\b/i,
  /^(?:(?:dear|respected)\s+)?(?:sir|madam|sirs)(?:\s*\/\s*(?:sir|madam))?\s*[,:]?$/i,
  /^(?:subject|sub|ref|reference|re)\s*[:.-]/i,
  /^(?:versus|vs\.?|v\/s\.?)$/i,
  /\.{2,}\s*(?:applicant|petitioner|respondent|accused|complainant|appellant|plaintiff|defendant|opposite\s+party)/i,
];
/** The name of a court, as the heading of a document. */
const COURT_LINE = /^(?:before|in)\s+the\s+(?:hon'?ble\s+)?(?:[a-z&.,' ]{0,40}\s)?court\b/i;
/** The addressee: the first of the lines above. */
const ADDRESSEE = PART_LINES[0];
/** The line giving the place or the date of the document. */
const PLACE_OR_DATE = /^(?:place|date|dated)\s*[:-]/i;
/** The words of a prayer and of a verification, for one written again without its heading. */
const PRAYER_WORDS = /\bprayed\s+that\b|\bprayer\b/i;
const VERIFICATION_WORDS = /\bdo\s+hereby\s+verify\b|\bverified\s+at\b/i;
const TO_WHOM = /^to\s+whom(?:soever)?\s+it\s+may\s+concern\b/i;
const DEPONENT = /^deponent\.?$/i;
/** The opening line of a separate document (rule 9 of the Drafter's prompt). */
const SEPARATE_DOCUMENT =
  /^(affidavit|vakalatnama|index|covering\s+letter|memo\s+of\s+appearance)\b/i;
/** A whole line in square brackets that is not one of the blanks the Drafter is told to write. */
const NOTE_LINE = /^\[[^\]]*\]$/;
const BLANK_LINE = /^\[(?:To be confirmed:|Section — verify before filing\]|Authority — add if)/;

/** A line as it reads with the marks of emphasis around it taken off. */
function bareLine(line: string): string {
  return line.replace(/^[\s*#`>]+|[\s*#`]+$/g, '');
}

/** A heading or a title, not a sentence of the body. */
function readsLikeHeading(line: string): boolean {
  if (line.length > 120) return false;
  return !/[.;]$/.test(line) || line === line.toUpperCase();
}

function startsWith(all: string[], opening: string[]): boolean {
  return opening.length <= all.length && sameRun(all, 0, opening);
}

/**
 * Finding C4 (Ajay, T-136): a part in the Drafter's text that reads like a
 * second part or a second document. Looked for only where the system has put
 * parts around the text; where the Drafter writes the whole document, its
 * headings are its own. One finding for a block, with the line as written.
 *
 * What counts: a line that is a line of the system's parts, or opens like one
 * of their headings; a second addressee, salutation, subject line, closing,
 * court name, party line, or line of place and date; "To whom it may concern";
 * the opening of a separate document; a note in brackets where a part would
 * stand; a prayer or a verification written again outside the numbered
 * paragraphs; and the word SYSTEM. The first line of a numbered paragraph is
 * body text and is read only for the word SYSTEM: a part written again inside
 * a numbered paragraph is not seen here.
 */
export function checkOneDocument(
  body: string,
  system: SystemText,
  documentName: string,
): ValidationWarning[] {
  if (system.before === '' && system.after === '') return [];
  const systemText = `${system.before}\n${system.after}`;
  const lines = linesOfSystem(systemText);
  const shown = systemText
    .split('\n')
    .map(bareLine)
    .filter((l) => l !== '');
  const headings = system.headings.map((h) => everyToken(h)).filter((h) => h.length > 0);
  const headingLines = new Set(headings.map((h) => h.join(' ')));
  const kindShown = PART_LINES.map((kind) => shown.some((l) => kind.test(l)));
  const courtShown = shown.some((l) => COURT_LINE.test(l));
  const placeShown = shown.some((l) => PLACE_OR_DATE.test(l));
  const addresseeShown = shown.some((l) => ADDRESSEE.test(l));
  const verificationShown = shown.some((l) => /^verification\b/i.test(l) || DEPONENT.test(l));
  const prayerShown = shown.some((l) => /^prayer\b/i.test(l));
  const name = documentName.toLowerCase();

  const blocks = blocksOf(body);
  const first = blocks.findIndex((b) => b.paragraph);
  let last = blocks.length - 1;
  while (last > first && !blocks[last].paragraph && !blocks[last].subPoint) last -= 1;

  const isOdd = (line: string, opensParagraph: boolean, inside: boolean, outer: boolean) => {
    if (/\bSYSTEM\b/.test(line)) return true;
    if (opensParagraph) return false;
    const tokens = everyToken(line);
    const joined = tokens.join(' ');
    const heading = readsLikeHeading(line);
    // A line of the system's parts, written again.
    if (tokens.length > 0 && (inside ? headingLines : lines.whole).has(joined)) return true;
    if (heading) {
      // A title that opens like one of theirs, or one of theirs cut short or carried on.
      for (const h of headings) {
        if (h.length >= 2 && tokens.length >= 2 && (startsWith(tokens, h) || startsWith(h, tokens)))
          return true;
        // "PRAYER CLAUSE", "DEMAND NOTICE": a heading of theirs with a word or two added.
        if (
          !inside &&
          h.length === 1 &&
          h[0].length >= 5 &&
          tokens.length <= 3 &&
          tokens[0] === h[0]
        )
          return true;
      }
      if (courtShown && COURT_LINE.test(line)) return true;
      const separate = SEPARATE_DOCUMENT.exec(line);
      if (separate !== null && !name.includes(separate[1].toLowerCase().replace(/\s+/g, ' ')))
        return true;
    }
    if (PART_LINES.some((kind, k) => kindShown[k] && kind.test(line))) return true;
    if (addresseeShown && TO_WHOM.test(line)) return true;
    if (verificationShown && DEPONENT.test(line)) return true;
    if (placeShown && !inside && PLACE_OR_DATE.test(line)) return true;
    if (NOTE_LINE.test(line) && !BLANK_LINE.test(line)) return true;
    // Above the first paragraph and below the last: a prayer or a verification
    // written again, and a stretch of the system's own words.
    if (outer && prayerShown && PRAYER_WORDS.test(line)) return true;
    if (outer && verificationShown && VERIFICATION_WORDS.test(line)) return true;
    if (outer && tokens.length >= 4) {
      for (let at = 0; at + tokens.length <= lines.tokens.length; at += 1) {
        if (sameRun(lines.tokens, at, tokens)) return true;
      }
    }
    return false;
  };

  const warnings: ValidationWarning[] = [];
  const seen = new Set<string>();
  blocks.forEach((block, i) => {
    const numbered = block.paragraph || block.subPoint;
    const outer = !numbered && (first === -1 || i < first || i > last);
    for (let n = 0; n < block.lines.length; n += 1) {
      const line = bareLine(block.lines[n]);
      if (line === '') continue;
      // A line under a numbered paragraph is part of the body, unless it is the last paragraph.
      const inside = numbered && n > 0 && i !== last;
      if (!isOdd(line, numbered && n === 0, inside, outer)) continue;
      const key = everyToken(line).join(' ') || line;
      if (seen.has(key)) break;
      seen.add(key);
      const written = block.lines[n].trim();
      const quoted = written.length > 120 ? `${written.slice(0, 119)}…` : written;
      warnings.push({
        type: 'fact_alteration',
        message: `The draft has a part that may not belong: "${quoted}". Check that the draft is one document.`,
        details: { field: 'part', expected: quoted },
      });
      break;
    }
  });
  return warnings;
}

// ── Everything in the brief is in the draft (T-136) ─────────────────────────

/** Words that carry no fact of their own. They are not compared. */
const SMALL_WORDS = new Set(
  (
    'the and for that this these those with from into onto upon has had have having was were are ' +
    'been being his her him she they them their its our your you who whom whose which what when ' +
    'where why how but also will would shall should may might can could did does doing done there ' +
    'here then than such said same any all some each every both per via vide etc about above after ' +
    'before between during since until till through under over against while because however ' +
    'therefore thus hence namely very just too now yet own'
  ).split(' '),
);
/** How a party is called. A draft says "the applicant" where the advocate wrote "my client". */
const ROLE_WORDS = new Set(
  (
    'client applicant applicants accused petitioner petitioners respondent respondents complainant ' +
    'informant plaintiff defendant appellant noticee sender drawer payee deponent undersigned ' +
    'advocate counsel shri smt sri kumari mrs learned'
  ).split(' '),
);

/** The words of three letters or more in a text, small words left out. */
function factWords(text: string): string[] {
  return (normalise(text).match(/[\p{L}\p{M}]{3,}/gu) ?? []).filter((w) => !SMALL_WORDS.has(w));
}

/** Every number in a text, with the commas of Indian and Western grouping taken out. */
function factNumbers(text: string): string[] {
  return (
    normalise(text)
      .replace(/(\d),(?=\d)/g, '$1')
      .match(/\d+/g) ?? []
  );
}

/** "rejected" and "rejection" are one word here: a word is told by its first five letters. */
function stem(word: string): string {
  return word.length > 5 ? word.slice(0, 5) : word;
}

function withoutDates(text: string): string {
  let out = text;
  for (const d of datesAsWritten(text)) out = out.split(d.words).join(' ');
  return out;
}

/** One paragraph of the document, or two that follow each other, as the words and numbers in it. */
interface Stretch {
  words: Set<string>;
  stems: Set<string>;
  numbers: Set<string>;
}

function stretchesOf(documentText: string): Stretch[] {
  const one = blocksOf(documentText).map((b) => {
    const text = b.lines.join(' ');
    const words: string[] = normalise(text).match(/[\p{L}\p{M}]{3,}/gu) ?? [];
    return {
      words: new Set(words),
      stems: new Set(words.map(stem)),
      numbers: new Set(factNumbers(text)),
    };
  });
  const out: Stretch[] = [...one];
  for (let i = 0; i + 1 < one.length; i += 1) {
    out.push({
      words: new Set([...one[i].words, ...one[i + 1].words]),
      stems: new Set([...one[i].stems, ...one[i + 1].stems]),
      numbers: new Set([...one[i].numbers, ...one[i + 1].numbers]),
    });
  }
  return out;
}

/**
 * A name or a number of the brief: every word and every number of it must
 * stand together, in one paragraph of the document or in two that follow each
 * other. The order does not matter, so "Saraidhela PS" is found in
 * "P.S. Saraidhela".
 */
function nameIsIn(value: string, stretches: Stretch[]): boolean {
  const words = factWords(value);
  const numbers = factNumbers(value);
  if (words.length === 0 && numbers.length === 0) return true;
  return stretches.some(
    (s) => words.every((w) => s.words.has(w)) && numbers.every((n) => s.numbers.has(n)),
  );
}

/** The share of a sentence's words that must stand together for it to count as there. */
const SENTENCE_SHARE = 0.7;

/**
 * A sentence of the brief: every number of it, and seven in ten of its words,
 * must stand together in one paragraph of the document or in two that follow
 * each other. The order does not matter. Small words, the words for a party
 * and the parties' own names are not counted, and a date is left to the
 * finding on dates. A sentence with nothing left to count is not compared.
 */
function sentenceIsIn(sentence: string, stretches: Stretch[], names: Set<string>): boolean {
  const text = withoutDates(sentence);
  const words = [
    ...new Set(
      factWords(text)
        .filter((w) => !ROLE_WORDS.has(w) && !names.has(w))
        .map(stem),
    ),
  ];
  const numbers = factNumbers(text);
  if (words.length === 0 && numbers.length === 0) return true;
  const needed = Math.ceil(words.length * SENTENCE_SHARE);
  return stretches.some(
    (s) =>
      numbers.every((n) => s.numbers.has(n)) &&
      words.filter((w) => s.stems.has(w)).length >= needed,
  );
}

/** A full stop after one of these does not end a sentence: "FIR No. 124", "P.S. Saraidhela". */
const NOT_AN_END =
  /(?:^|[\s(])(?:\p{Lu}|no|nos|rs|dr|mr|mrs|ms|smt|sh|shri|st|vs|ps|adv|hon|ld|sec|ss|cr|crl|misc|u\/s|s\/o|d\/o|w\/o|r\/o|p\.s|i\.e|e\.g|w\.e\.f)\.$/iu;

/** A long text cut into its sentences. */
function sentencesOf(text: string): string[] {
  const pieces = text
    .split(/(?:\n|;|।)+|(?<=[.?!])\s+(?=[\p{Lu}\p{Lo}\p{N}"'([])/u)
    .map((p) => p.trim())
    .filter((p) => p !== '');
  const out: string[] = [];
  let held = '';
  for (const piece of pieces) {
    held = held === '' ? piece : `${held} ${piece}`;
    if (NOT_AN_END.test(held)) continue;
    out.push(held);
    held = '';
  }
  if (held !== '') out.push(held);
  return out;
}

/**
 * Findings C1, C2 and D2 (Ajay, T-136): a date, a name, a number or a fact
 * that the brief holds and the document does not, and a date that only the
 * advocate's description gives. `documentText` is the whole document as it
 * will print: the parts the system adds and the Drafter's text. Nothing is put
 * into the draft here; the advocate is told.
 *
 * Compared: every date; the parties and the numbers, each as a name; every
 * long account of the brief and everything under "other", sentence by
 * sentence. A choice is not compared, because the draft does not print its
 * label. Nor is the description, beyond its dates: there is no signed finding
 * for it.
 *
 * What this cannot see: a date written without a year; a date that is in the
 * document but against another event; a fact put in other words; a word of
 * two letters, such as "no".
 */
export function checkBriefIsUsed(
  documentText: string,
  brief: Brief,
  described?: string | null,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const documentDates = new Set(datesInText(documentText));
  const stretches = stretchesOf(documentText);

  // C1: a date of the brief. A date with a place of its own says what it is the date of.
  const briefDates = new Map<string, { shown: string; what: string }>();
  for (const item of brief.items) {
    if (item.kind !== 'date' || typeof item.value !== 'string') continue;
    for (const date of /^\d{4}-\d{2}-\d{2}$/.test(item.value)
      ? [item.value]
      : datesInText(item.value)) {
      if (!briefDates.has(date)) {
        briefDates.set(date, { shown: filingDate(date), what: item.meaning ?? item.label });
      }
    }
  }
  // A date inside a text of the brief: shown as written, with what its own words say it is.
  const fromText = (text: string, label: string): void => {
    const stated = new Map(statedDates(text).map((d) => [d.value, d.kind]));
    for (const d of datesAsWritten(text)) {
      if (briefDates.has(d.value)) continue;
      const kind = stated.get(d.value) ?? null;
      briefDates.set(d.value, {
        shown: d.words,
        what: (kind ? dateKindLabel(kind) : null) ?? label,
      });
    }
  };
  for (const item of brief.items) {
    if (item.kind === 'date' || isEmpty(item.value)) continue;
    for (const v of Array.isArray(item.value) ? item.value : [item.value as string]) {
      fromText(v, item.label);
    }
  }
  for (const u of brief.unplaced) {
    for (const v of Array.isArray(u.value) ? u.value : [u.value]) fromText(v, u.label);
  }
  for (const [date, { shown, what }] of briefDates) {
    if (documentDates.has(date)) continue;
    warnings.push({
      type: 'fact_alteration',
      message: `Your brief has a date the draft does not use: ${shown} (${what}). Add it or check the draft.`,
      details: { field: 'date', expected: shown },
    });
  }

  // D2: a date only the description gives, shown exactly as the advocate wrote it.
  for (const d of datesAsWritten(described ?? '')) {
    if (documentDates.has(d.value) || briefDates.has(d.value)) continue;
    warnings.push({
      type: 'fact_alteration',
      message: `Your description has a date the draft does not use: ${d.words}. If you changed this date on the brief, ignore this. Otherwise add it or check the draft.`,
      details: { field: 'date', expected: d.words },
    });
  }

  // C2: a name, a number, or a fact.
  const told = new Set<string>();
  const missing = (label: string, value: string): void => {
    // The finding's own full stop follows the value, so the value's is left off.
    const flat = value
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.\u0964]+$/, '');
    const shown = flat.length > 120 ? `${flat.slice(0, 119)}…` : flat;
    if (told.has(`${label}\n${shown}`)) return;
    told.add(`${label}\n${shown}`);
    warnings.push({
      type: 'fact_alteration',
      message: `We could not find this from your brief in the draft: ${label}: ${shown}. Add it or check the draft.`,
      details: { field: label, expected: shown },
    });
  };
  const names = new Set<string>();
  for (const item of brief.items) {
    if (!item.party_name || typeof item.value !== 'string') continue;
    for (const w of factWords(item.value)) names.add(w);
  }
  const bySentence = (label: string, value: string): void => {
    for (const sentence of sentencesOf(value)) {
      if (!sentenceIsIn(sentence, stretches, names)) missing(label, sentence);
    }
  };
  for (const item of brief.items) {
    if (isEmpty(item.value)) continue;
    const values = Array.isArray(item.value) ? item.value : [item.value as string];
    if (item.kind === 'narrative') {
      for (const v of values) bySentence(item.label, v);
      continue;
    }
    if (item.kind === 'date' || item.kind === 'choice' || item.kind === 'choices') continue;
    if (item.part !== 'parties' && item.part !== 'numbers') continue;
    const lost = values.filter((v) => !nameIsIn(v, stretches));
    if (lost.length > 0) missing(item.label, lost.join(', '));
  }
  for (const u of brief.unplaced) {
    for (const v of Array.isArray(u.value) ? u.value : [u.value]) bySentence(u.label, v);
  }
  return warnings;
}

// ── No period the brief does not state (T-136) ──────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};
const NUMBER_WORD = `(?:${Object.keys(NUMBER_WORDS).join('|')})`;
/** "three", "twenty-one", "one hundred and eighty". */
const NUMBER_IN_WORDS = `${NUMBER_WORD}(?:[\\s-]+(?:and[\\s-]+)?${NUMBER_WORD})*`;
const PERIOD_UNIT = '(day|week|fortnight|month|year|hour)s?';
/** Between a count and its unit: a space, a hyphen, an underscore (a clause id), or a closing bracket. */
const PERIOD_JOIN = '(?:[\\s_]+|\\s*[-\\u2010-\\u2015]\\s*|\\)\\s+)';
/**
 * A length of time, in every form the packs and a draft write one: "15 days",
 * "fifteen days", "fifteen (15) days", "15 (fifteen) days", "15-day", "7+ years",
 * "30 clear days", "several months".
 */
const PERIOD = new RegExp(
  `(?<![\\p{L}\\p{N}.])(\\d+(?:\\.\\d+)?|${NUMBER_IN_WORDS}|several|few|many)\\+?` +
    `(?:\\s*\\(\\s*(\\d+|${NUMBER_IN_WORDS})\\s*\\))?` +
    `(?:\\s+(?:clear|calendar|working|business|consecutive|whole|full|more|further|additional))?` +
    `${PERIOD_JOIN}${PERIOD_UNIT}(?![\\p{L}\\p{N}])`,
  'giu',
);
/** "3-5 years", "7 to 10 days", "30/90 days": the first count of a range. The second is read as any other. */
const PERIOD_RANGE = new RegExp(
  `(?<![\\p{L}\\p{N}.])(\\d+)\\s*(?:[-\\u2010-\\u2015/]|to)\\s*\\d+\\+?${PERIOD_JOIN}${PERIOD_UNIT}(?![\\p{L}\\p{N}])`,
  'giu',
);
/** "over a month", "within a week": one of the unit, said with "a". */
const PERIOD_OF_ONE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:for|over|about|approximately|around|nearly|almost|than|past|last|within|after)` +
    `\\s+an?\\s+${PERIOD_UNIT}(?![\\p{L}\\p{N}])`,
  'giu',
);
/** "a week", with nothing before it. Read only in what the Drafter was given, never in its text. */
const ONE_OF_A_UNIT = new RegExp(
  `(?<![\\p{L}\\p{N}])an?\\s+${PERIOD_UNIT}(?![\\p{L}\\p{N}])`,
  'giu',
);

/** "fifteen" -> "15", "twenty-one" -> "21", "one hundred and eighty" -> "180", "15" -> "15". */
function countOf(written: string): string {
  const flat = written.toLowerCase();
  if (/^\d/.test(flat)) return String(Number(flat));
  let total = 0;
  let seen = false;
  for (const word of flat.split(/[\s-]+/)) {
    if (word === 'hundred') {
      total = (total === 0 ? 1 : total) * 100;
      seen = true;
    } else if (word in NUMBER_WORDS) {
      total += NUMBER_WORDS[word];
      seen = true;
    }
  }
  return seen ? String(total) : flat;
}

interface StatedPeriod {
  /** "3 day": the count as a number, and the unit. */
  key: string;
  /** The words as written. */
  words: string;
  /** Where the words stand in the text, with its white space made single spaces. */
  at: number;
}

/**
 * Each period a text states. `given` is for a text the Drafter was given: there
 * "a week" counts as one week even with no word before it, so that a period
 * the pack gives loosely is still known.
 */
function periodsIn(text: string, given = false): StatedPeriod[] {
  const out: StatedPeriod[] = [];
  const flat = text.replace(/\s+/g, ' ');
  for (const m of flat.matchAll(PERIOD)) {
    // "15 (fifteen)" and "fifteen (15)" are both 15: the figure is taken where there is one.
    const figure = [m[1], m[2]].find((c) => c !== undefined && /^\d/.test(c));
    out.push({
      key: `${countOf(figure ?? m[1])} ${m[3].toLowerCase()}`,
      words: m[0],
      at: m.index ?? 0,
    });
  }
  for (const m of flat.matchAll(PERIOD_RANGE)) {
    out.push({ key: `${countOf(m[1])} ${m[2].toLowerCase()}`, words: m[0], at: m.index ?? 0 });
  }
  for (const m of flat.matchAll(given ? ONE_OF_A_UNIT : PERIOD_OF_ONE)) {
    out.push({ key: `1 ${m[1].toLowerCase()}`, words: m[0], at: m.index ?? 0 });
  }
  return out.sort((x, y) => x.at - y.at);
}

/**
 * Finding C3 (Ajay, T-136): a length of time in the Drafter's text that
 * nothing it was given states. `known` is every text the Drafter was given:
 * the brief, the description, the rule pack, the court's rules and the
 * system's parts. A period any of them gives, such as the fifteen days of a
 * statutory notice, is never reported (his condition 3): both sides are read
 * by the same reader, so the form it is written in does not matter. A count
 * that is a number of the brief (an age, a term in months) is the brief's own.
 */
export function checkPeriods(body: string, known: string[], brief: Brief): ValidationWarning[] {
  const stated = new Set<string>();
  for (const text of known) for (const p of periodsIn(text, true)) stated.add(p.key);
  const numbers = new Set<string>();
  for (const item of brief.items) {
    if (typeof item.value === 'string' && /^\d+$/.test(item.value.trim())) {
      numbers.add(String(Number(item.value.trim())));
    }
  }
  const warnings: ValidationWarning[] = [];
  const told = new Set<string>();
  for (const { key, words } of periodsIn(body)) {
    if (stated.has(key) || numbers.has(key.split(' ')[0]) || told.has(key)) continue;
    told.add(key);
    warnings.push({
      type: 'fact_alteration',
      message: `The draft states a period that is not in your brief: ${words}. Check it before use.`,
      details: { field: 'period', expected: words },
    });
  }
  return warnings;
}

/**
 * Every text of a rule pack that the Drafter is given, and the prayer and the
 * verification it supplies, for telling the law's own periods.
 */
export function packTexts(pack: RulePack): string[] {
  return [
    pack.name,
    ...pack.draftingInstructions,
    ...clauseLines(pack),
    ...pack.mandatoryClauses.flatMap((c) => [
      c.title,
      c.detail ?? '',
      c.fixedText ?? '',
      c.appliesWhen ?? '',
      ...c.parts,
    ]),
    ...actLines(pack),
    ...pack.relevantActs.flatMap((a) => [
      a.act,
      a.appliesWhen ?? '',
      ...a.sections.flatMap((s) => [s.number, s.description ?? '']),
    ]),
    pack.prayerTemplate ?? '',
    pack.verificationTemplate ?? '',
  ].filter((t) => t !== '');
}

// ── The provision that depends on the court (T-135) ─────────────────────────

/** The blank a system part shows where no provision can be stated. */
export const SECTION_BLANK = '[Section — verify before filing]';

export interface CourtProvision {
  /** The computed field that holds it, e.g. "bail_section". */
  field: string;
  /** The provision for the court chosen, or null when this kind of court has none. */
  value: string | null;
  /** The provisions the same field gives for other kinds of court. */
  others: string[];
  /** The instruction for the Drafter, filled in. Null when there is no value. */
  instruction: string | null;
}

/**
 * Every provision of this document that follows the court. A template says so
 * by giving a computed field a value for each kind of court (`value_map`).
 * `resolved` holds the computed fields as worked out for the court chosen.
 * The provisions and the instruction wording are Ajay's (T-135, signed
 * 6 Oct 2026); none of it is decided here.
 */
export function courtProvisions(
  config: TemplateConfig,
  resolved: Record<string, string | undefined>,
): CourtProvision[] {
  const out: CourtProvision[] = [];
  for (const [field, def] of Object.entries(config.computed_fields)) {
    if (!def.value_map) continue;
    const all = [...new Set(Object.values(def.value_map))];
    const current = resolved[field];
    const value = current !== undefined && all.includes(current) ? current : null;
    out.push({
      field,
      value,
      others: all.filter((v) => v !== value),
      instruction:
        value !== null && def.instruction ? def.instruction.replace(/\{value\}/g, value) : null,
    });
  }
  return out;
}

/** Every section number in a text, lists included: "Sections 481 and 482" gives both. */
export function citedSectionNumbers(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(SECTION_OPENING)) {
    // A sub-section in brackets, "483(3)", is not a section of its own.
    const numbers = m[0].replace(/\([a-z0-9]+\)/g, '');
    for (const n of numbers.match(/\d+[A-Za-z]{0,2}/g) ?? []) out.add(n.toUpperCase());
  }
  return out;
}

/**
 * Findings on the provision that follows the court: the court chosen has
 * none, or the body cites the provision that belongs to another kind of
 * court. For the advocate to check; nothing is removed from the draft.
 */
export function checkCourtProvisions(
  body: string,
  provisions: CourtProvision[],
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const cited = citedSectionNumbers(body);
  for (const p of provisions) {
    if (p.value === null) {
      warnings.push({
        type: 'invalid_section',
        message:
          'We could not state the provision for this kind of court. Check that the court can hear this application, and add the provision before filing.',
        details: { field: p.field },
      });
      continue;
    }
    for (const other of p.others) {
      if (!cited.has(other.toUpperCase())) continue;
      warnings.push({
        type: 'invalid_section',
        message: `The draft cites Section ${other}. Before the court you chose, this application is made under Section ${p.value}. Check it before filing.`,
        details: { section: other, field: p.field, expected: p.value },
      });
    }
  }
  return warnings;
}

// ── A request with no rule pack (T-107, section 6) ──────────────────────────

/** The words that open a section reference, in the user's own text. */
const SECTION_OPENING =
  /(?:\b(?:[Ss]ections?|[Ss]ec\.?|[Uu]\/[Ss])|धारा)\s*\d+[A-Za-z]{0,2}(?:\s*\([a-z0-9]+\))*(?:\s*(?:,|\/|&|and|read\s+with|r\/w)\s*\d+[A-Za-z]{0,2}(?:\s*\([a-z0-9]+\))*)*/g;

/**
 * The name of the law, when it follows the numbers at once: "of the
 * Negotiable Instruments Act, 1881", or a short name in capitals such as
 * "BNS" or "CrPC". Anything else after the numbers is not taken.
 */
const LAW_NAME =
  /^\s+(?:of\s+)?(?:the\s+)?(?:(?:[A-Z][A-Za-z.&]*\s+){0,7}(?:Act|Code|Sanhita|Adhiniyam|Rules|Constitution)(?:,?\s*\d{4})?|[A-Z][A-Za-z.]{0,7}[A-Z][A-Za-z.]{0,4}(?![A-Za-z]))/;

/**
 * The section references the advocate wrote, each exactly as written. The
 * Drafter may cite these and no others (T-107, section 6, rule 3). Code reads
 * them from the confirmed brief: nothing here comes from a model.
 */
export function sectionsGiven(texts: string[]): string[] {
  const out: string[] = [];
  for (const text of texts) {
    for (const m of text.matchAll(SECTION_OPENING)) {
      const rest = text.slice((m.index ?? 0) + m[0].length);
      const law = LAW_NAME.exec(rest);
      const ref = `${m[0]}${law ? law[0] : ''}`.replace(/\s+/g, ' ').trim();
      if (!out.includes(ref)) out.push(ref);
      if (out.length === 40) return out;
    }
  }
  return out;
}

export interface GuidedDrafterBrief extends BriefParts {
  /** Rule 3 of the prompt names this key. */
  sections_given: string[];
}

/**
 * The confirmed brief as the Drafter reads it when there is no rule pack. It
 * has no "described": the prompt for these documents does not name it (T-145).
 */
export function guidedDrafterBrief(brief: Brief, courtLine: string | null): GuidedDrafterBrief {
  return { ...briefParts(brief, courtLine), sections_given: sectionsGiven(textValues(brief)) };
}

/**
 * What the Drafter is given when there is no rule pack. Light mode is not
 * used yet (T-127, section 3.1), so the mode is always strict.
 */
export function buildGuidedDrafterUserPrompt(input: {
  brief: GuidedDrafterBrief;
  target: number;
  language: string;
}): string {
  return [
    'MODE: strict',
    `TARGET: ${input.target}`,
    `LANGUAGE: ${input.language}`,
    `BRIEF:\n${JSON.stringify(input.brief, null, 1)}`,
  ].join('\n\n');
}

/**
 * The Drafter is told to write no disclaimer (rule 9): the system adds the
 * label and the footer. A paragraph that is only a disclaimer or a note to the
 * reader is taken out. Nothing else is touched: with no rule pack the court's
 * name and the parties are part of what the Drafter writes.
 */
export function withoutDisclaimers(text: string): string {
  return text
    .split(/\n\s*\n+/)
    .filter((para) => {
      const t = para.trim();
      if (!t) return false;
      if (/^(?:DISCLAIMER|NOTE)\s*:/i.test(t)) return false;
      if (/AI[\s-]assisted draft/i.test(t)) return false;
      if (/Lawie does not provide legal advice/i.test(t)) return false;
      return true;
    })
    .join('\n\n')
    .trim();
}

/** A line that is the disclaimer the system adds itself (SCRUM-62). */
function isDisclaimer(text: string): boolean {
  return (
    /AI[\s-]assisted draft/i.test(text) ||
    /^DISCLAIMER\s*:/i.test(text) ||
    /Lawie does not provide legal advice/i.test(text)
  );
}

/**
 * For a draft with a rule pack: a paragraph that is only the disclaimer the
 * system adds itself is taken out, as the form pipeline does (SCRUM-62). A
 * numbered paragraph or a sub-point is never taken out: where a disclaimer
 * stands in the same block as one, only the disclaimer's own lines go, and a
 * numbered line stays whatever it says. A court name in the body is left alone
 * here: a repeated part is removed only under Ajay's condition, by
 * `removeRepeatedParts` (T-136).
 */
export function withoutDisclaimerText(text: string): string {
  const kept: string[] = [];
  for (const para of text.split(/\n\n+/)) {
    if (!para.trim()) continue;
    const lines = para.split('\n');
    const numbered = (l: string): boolean => PARAGRAPH_START.test(l) || SUB_POINT.test(l);
    if (!lines.some(numbered)) {
      if (!isDisclaimer(para.trim())) kept.push(para);
      continue;
    }
    const own = lines.filter((l) => numbered(l) || !isDisclaimer(l.trim()));
    kept.push(own.join('\n'));
  }
  return kept.join('\n\n').trim();
}

/** Every text the user gave in the brief, for the checks that read it. */
export function briefText(brief: Brief): string {
  return textValues(brief).join('\n');
}

// ── The label (ADR-021, rule 6) ─────────────────────────────────────────────

/**
 * A draft with a rule pack carries no starting-draft label only when every
 * mandatory clause is present and every check passes. One missing clause or
 * one finding, and it carries the label.
 */
export function needsStartingDraftLabel(
  missing: MissingClause[],
  warnings: ValidationWarning[],
): boolean {
  return missing.length > 0 || warnings.length > 0;
}

/** The line shown with a labelled draft (T-127, section 7.3). */
export function labelReason(
  missing: MissingClause[],
  warnings: ValidationWarning[],
): string | null {
  if (missing.length > 0) {
    return `This draft does not cover: ${missing.map((m) => m.title).join('; ')}. Add them before use.`;
  }
  if (warnings.length > 0) {
    return `${warnings.length} ${warnings.length === 1 ? 'check' : 'checks'} did not pass. See the findings.`;
  }
  return null;
}
