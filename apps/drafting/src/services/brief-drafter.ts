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
 * 6). Do not change them without his sign-off.
 */
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

export interface DrafterBrief {
  document: string;
  court: string | null;
  parties: Array<{ key: string; what: string; value: string | string[] }>;
  facts: Array<{ key: string; what: string; value: string | string[] }>;
  dates: Array<{ key: string; date_of: string; date: string }>;
  numbers: Array<{ key: string; what: string; value: string | string[] }>;
  asked_for: Array<{ key: string; what: string; value: string | string[] }>;
  other: Array<{ what: string; value: string | string[] }>;
  unknown: Array<{ what: string; blank: string }>;
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
  const out: DrafterBrief = {
    document: brief.kind.name,
    court: brief.kind.court_document ? (courtLine ?? '[To be confirmed: court]') : null,
    parties: [],
    facts: [],
    dates: [],
    numbers: [],
    asked_for: [],
    other: brief.unplaced.map((u) => ({ what: u.label, value: u.value })),
    unknown: brief.still_unknown.map((u) => ({ what: u.label, blank: u.placeholder })),
    described: typeof described === 'string' && described.trim() !== '' ? described.trim() : null,
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
/** A word the Drafter was told to keep for its clause report, in square brackets. */
const SYSTEM_WORD = /\[[^[\]\n]*\bSYSTEM\b[^[\]\n]*\]/g;

/** The words of three letters or more and every number in a text, for comparing two texts. */
function factTokens(text: string): string[] {
  const flat = normalise(text).replace(/(\d),(?=\d)/g, '$1');
  return (flat.match(/[\p{L}\p{M}]{3,}|\d+/gu) ?? []).map((t) => t.toLowerCase());
}

/** True when a block says nothing the system's own text does not say: no new word, no new number. */
function saysNothingNew(blockText: string, systemTokens: Set<string>): boolean {
  return factTokens(blockText).every((t) => systemTokens.has(t));
}

/**
 * Takes out of the Drafter's text what the system has already put on the
 * page: a second cause title, addressee, heading, closing or signature line,
 * and the word SYSTEM in brackets, which belongs to the clause report.
 *
 * Ajay's condition (T-136, condition 4): a repeat is removed only where it
 * carries no word and no number that the system's own part does not carry.
 * Anything else stays and is reported by `checkOneDocument`. A numbered
 * paragraph is never removed.
 */
export function removeRepeatedParts(
  body: string,
  system: SystemText,
): { body: string; removed: string[] } {
  const removed: string[] = [];
  const cleaned = body
    .replace(SYSTEM_WORD, (m) => {
      removed.push(m);
      return '';
    })
    .replace(/[ \t]+\n/g, '\n');

  // A paragraph number always opens a block of its own, so a title written
  // straight above "1." is seen as the separate thing it is.
  const blocks = cleaned
    .replace(/\n(?=\s*\d+[.)]\s)/g, '\n\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b !== '');
  const first = blocks.findIndex((b) => PARAGRAPH_START.test(b));
  if (first === -1) {
    return { body: removed.length > 0 ? blocks.join('\n\n') : body, removed };
  }
  let last = blocks.length - 1;
  while (last > first && !PARAGRAPH_START.test(blocks[last]) && !SUB_POINT.test(blocks[last])) {
    last -= 1;
  }

  const beforeTokens = new Set(factTokens(system.before));
  const afterTokens = new Set(factTokens(system.after));
  const kept: string[] = [];
  blocks.forEach((b, i) => {
    const leading = i < first && system.before !== '';
    const trailing = i > last && system.after !== '';
    if (
      (leading && saysNothingNew(b, beforeTokens)) ||
      (trailing && saysNothingNew(b, afterTokens))
    ) {
      removed.push(b);
      return;
    }
    kept.push(b);
  });
  if (removed.length === 0) return { body, removed };
  return { body: kept.join('\n\n'), removed };
}

/** A line that opens or closes a document of its own, whatever kind of document it is. */
const DOCUMENT_EDGE = [
  /^to,?$/i,
  /^from,?$/i,
  /^to\s+whom(?:soever)?\s+it\s+may\s+concern\b/i,
  /^yours\s+(?:faithfully|sincerely|truly)\b/i,
  /^deponent\.?$/i,
  /^(?:place|date|dated)\s*:/i,
];
/** The opening line of a separate document (rule 9 of the Drafter's prompt). */
const SEPARATE_DOCUMENT = /^(AFFIDAVIT|VAKALATNAMA|INDEX|COVERING LETTER|MEMO OF APPEARANCE)\b/;

function comparable(line: string): string {
  return normalise(line.replace(/[*_#:.,]/g, ' '));
}

/**
 * Finding C4 (Ajay, T-136): a part in the Drafter's text that the system did
 * not add and that reads like a second document. Looked for only where the
 * system has put parts around the text; where the Drafter writes the whole
 * document, its headings are its own.
 */
export function checkOneDocument(
  body: string,
  system: SystemText,
  documentName: string,
): ValidationWarning[] {
  if (system.before === '' && system.after === '') return [];
  const headings = new Set(system.headings.map(comparable).filter((h) => h.length > 0));
  const name = documentName.toUpperCase();
  const warnings: ValidationWarning[] = [];
  const seen = new Set<string>();
  const blocks = body.replace(/\n(?=\s*\d+[.)]\s)/g, '\n\n').split(/\n\s*\n/);
  for (const block of blocks) {
    if (PARAGRAPH_START.test(block) || SUB_POINT.test(block)) continue;
    for (const raw of block.split('\n')) {
      const line = raw.replace(/^[\s*_#]+|[\s*_#]+$/g, '').trim();
      if (line === '') continue;
      const separate = SEPARATE_DOCUMENT.exec(line);
      const odd =
        headings.has(comparable(line)) ||
        DOCUMENT_EDGE.some((re) => re.test(line)) ||
        (separate !== null && !name.includes(separate[1]));
      if (!odd || seen.has(comparable(line))) continue;
      seen.add(comparable(line));
      const shown = line.length > 80 ? `${line.slice(0, 79)}…` : line;
      warnings.push({
        type: 'fact_alteration',
        message: `The draft has a part that may not belong: "${shown}". Check that the draft is one document.`,
        details: { field: 'part', expected: shown },
      });
    }
  }
  return warnings;
}

// ── Everything in the brief is in the draft (T-136) ─────────────────────────

/** A date as a user reads it in a finding about the brief: 12.09.2026. */
function shownDate(isoDate: string): string {
  return filingDate(isoDate);
}

function numbersIn(text: string): Set<string> {
  return new Set(normalise(text).replace(/(\d),(?=\d)/g, '$1').match(/\d+/g) ?? []);
}

/**
 * True when a short fact of the brief is in the document: every number of
 * it, and most of its words. Word order and small words are not compared, so
 * "Saraidhela PS" is found in "P.S. Saraidhela".
 */
function factIsIn(value: string, documentWords: Set<string>, documentNumbers: Set<string>): boolean {
  const tokens = factTokens(value);
  if (tokens.length === 0) return true;
  const numbers = tokens.filter((t) => /^\d+$/.test(t));
  const words = tokens.filter((t) => !/^\d+$/.test(t));
  if (numbers.some((n) => !documentNumbers.has(n))) return false;
  if (words.length === 0) return true;
  const present = words.filter((w) => documentWords.has(w)).length;
  return present / words.length >= 0.6;
}

/**
 * Findings C1, C2 and the one for a date of the description (Ajay, T-136):
 * a date, a name, a number or a fact placed under "other" that the brief
 * holds and the document does not. `documentText` is the whole document: the
 * parts the system adds and the Drafter's text. Nothing is put into the draft
 * here; the advocate is told.
 *
 * Compared: every date; the parties' names; the numbers; the facts under
 * "other". A choice is not, because the draft does not print its label. A
 * long account is compared by its dates only.
 */
export function checkBriefIsUsed(
  documentText: string,
  brief: Brief,
  described?: string | null,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const documentDates = new Set(datesInText(documentText));
  const documentWords = new Set(factTokens(documentText).filter((t) => !/^\d+$/.test(t)));
  const documentNumbers = numbersIn(documentText);
  const told = new Set<string>();

  // C1: a date of the brief.
  const briefDates = new Map<string, string>();
  for (const item of brief.items) {
    if (isEmpty(item.value)) continue;
    const values = Array.isArray(item.value) ? item.value : [item.value as string];
    const what = item.kind === 'date' ? (item.meaning ?? item.label) : item.label;
    for (const v of values) {
      const dates = /^\d{4}-\d{2}-\d{2}$/.test(v) ? [v] : datesInText(v);
      for (const d of dates) if (!briefDates.has(d)) briefDates.set(d, what);
    }
  }
  for (const u of brief.unplaced) {
    for (const v of Array.isArray(u.value) ? u.value : [u.value]) {
      for (const d of datesInText(v)) if (!briefDates.has(d)) briefDates.set(d, u.label);
    }
  }
  for (const [date, what] of briefDates) {
    if (documentDates.has(date)) continue;
    told.add(date);
    warnings.push({
      type: 'fact_alteration',
      message: `Your brief has a date the draft does not use: ${shownDate(date)} (${what}). Add it or check the draft.`,
      details: { field: 'date', expected: shownDate(date) },
    });
  }

  // A date only the description gives, shown as the advocate wrote it.
  for (const d of datesAsWritten(described ?? '')) {
    if (documentDates.has(d.value) || briefDates.has(d.value) || told.has(d.value)) continue;
    told.add(d.value);
    warnings.push({
      type: 'fact_alteration',
      message: `Your description has a date the draft does not use: ${d.words}. If you changed this date on the brief, ignore this. Otherwise add it or check the draft.`,
      details: { field: 'date', expected: d.words },
    });
  }

  // C2: a name, a number, or a fact under "other".
  const missing = (label: string, value: string): void => {
    const shown = value.length > 120 ? `${value.slice(0, 119)}…` : value;
    warnings.push({
      type: 'fact_alteration',
      message: `We could not find this from your brief in the draft: ${label}: ${shown}. Add it or check the draft.`,
      details: { field: label, expected: shown },
    });
  };
  for (const item of brief.items) {
    if (isEmpty(item.value)) continue;
    if (item.kind === 'date' || item.kind === 'choice' || item.kind === 'choices') continue;
    if (item.kind === 'narrative') continue;
    if (item.part !== 'parties' && item.part !== 'numbers') continue;
    const values = Array.isArray(item.value) ? item.value : [item.value as string];
    const lost = values.filter((v) => !factIsIn(v, documentWords, documentNumbers));
    if (lost.length > 0) missing(item.label, lost.join(', '));
  }
  for (const u of brief.unplaced) {
    const values = Array.isArray(u.value) ? u.value : [u.value];
    const lost = values.filter(
      (v) => v.length <= 300 && !factIsIn(v, documentWords, documentNumbers),
    );
    if (lost.length > 0) missing(u.label, lost.join(', '));
  }
  return warnings;
}

// ── No period the brief does not state (T-136) ──────────────────────────────

const NUMBER_WORDS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  fifteen: '15',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  sixty: '60',
  ninety: '90',
};
const PERIOD = new RegExp(
  `\\b(\\d+|${Object.keys(NUMBER_WORDS).join('|')}|several|few|many)(?:\\s*\\(\\d+\\))?\\s+(day|week|month|year)s?\\b`,
  'gi',
);

/** Each period a text states, as "3 day": the count as a number, and the unit. */
function periodsIn(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of text.matchAll(PERIOD)) {
    const count = NUMBER_WORDS[m[1].toLowerCase()] ?? m[1].toLowerCase();
    const key = `${count} ${m[2].toLowerCase()}`;
    if (!out.has(key)) out.set(key, m[0].replace(/\s+/g, ' '));
  }
  return out;
}

/**
 * Finding C3 (Ajay, T-136): a length of time in the Drafter's text that
 * nothing it was given states. `known` is every text the Drafter was given:
 * the brief, the description, the rule pack and the system's parts. A period
 * the pack gives, such as the fifteen days of a statutory notice, is the
 * law's period and is never reported (his condition 3). A count that is a
 * number of the brief (an age, a term in months) is the brief's own.
 */
export function checkPeriods(body: string, known: string[], brief: Brief): ValidationWarning[] {
  const stated = new Set<string>();
  for (const text of known) for (const key of periodsIn(text).keys()) stated.add(key);
  const numbers = new Set<string>();
  for (const item of brief.items) {
    if (typeof item.value === 'string' && /^\d+$/.test(item.value.trim())) {
      numbers.add(item.value.trim());
    }
  }
  const warnings: ValidationWarning[] = [];
  for (const [key, words] of periodsIn(body)) {
    if (stated.has(key) || numbers.has(key.split(' ')[0])) continue;
    warnings.push({
      type: 'fact_alteration',
      message: `The draft states a period that is not in your brief: ${words}. Check it before use.`,
      details: { field: 'period', expected: words },
    });
  }
  return warnings;
}

/** Every text of a rule pack that the Drafter is given, for telling the law's own periods. */
export function packTexts(pack: RulePack): string[] {
  return [
    ...pack.draftingInstructions,
    ...pack.mandatoryClauses.flatMap((c) => [c.title, c.detail ?? '', c.fixedText ?? '', ...c.parts]),
    ...pack.relevantActs.flatMap((a) => a.sections.map((x) => x.description ?? '')),
    pack.prayerTemplate ?? '',
    pack.verificationTemplate ?? '',
  ];
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

export interface GuidedDrafterBrief extends DrafterBrief {
  /** Rule 3 of the prompt names this key. */
  sections_given: string[];
}

/** The confirmed brief as the Drafter reads it when there is no rule pack. */
export function guidedDrafterBrief(brief: Brief, courtLine: string | null): GuidedDrafterBrief {
  return { ...drafterBrief(brief, courtLine), sections_given: sectionsGiven(textValues(brief)) };
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
