/**
 * Rule-pack loader (T-124, ADR-021 section 3.7).
 *
 * One function, `loadRulePack(id)`, returns a document's rules in the same shape
 * for every file in `src/config/document-rules/`. The files are written in several
 * shapes and with differing key names; this module reads them and changes nothing.
 *
 * It only reads. No form is built from the result and no file is written here.
 * `template-promoter.ts` keeps building forms for the current generation path.
 *
 * `form_schema` shapes read (to list the facts a document needs):
 *   steps        { steps: [{ title, fields: [{ field_id, label, required }] }] }
 *   list         [{ name, label, required }]
 *   fields       { fields: [{ id, label, required }] }
 *   json_schema  { type: 'object', required: [...], properties: { ... } }
 *   groups       { <key>: field definition | section of fields | { type: 'object', required: [...] } }
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import type { AvermentLists } from './averments';
import { normaliseOption } from './template-promoter';

// ── Output shape ────────────────────────────────────────────────────────────

export type RulePackSchemaShape =
  | 'steps'
  | 'list'
  | 'fields'
  | 'json_schema'
  | 'groups'
  | 'absent'
  | 'unknown';

export interface RulePackFact {
  /**
   * Unique within the pack: `<group>.<name>` when the pack nests the fact under a group
   * (two groups may both have a `name`), else `<name>`. Steps are headings, not nesting.
   */
  key: string;
  /** The group the pack puts this fact in, or null when the pack has no groups. */
  group: string | null;
  name: string;
  label: string;
  /** The type as the pack writes it ('text', 'date', 'string', …), or null when not given. */
  type: string | null;
  /** True only when the pack itself marks this fact as required. */
  required: boolean;
  /** Allowed values, as labels. Empty when the pack lists none. */
  options: string[];
  /** The option ids, in the same order as `options` (T-153). Only when the pack lists options. */
  option_ids?: string[];
  /** The pack's `show_if` (or `depends_on`) condition, as written (T-153). */
  show_if?: string;
  /**
   * T-190: the pack's own question for this fact, exactly as the file writes it
   * (legal content, signed by Ajay). `source: 'pack'` marks where it came from:
   * only a question with this origin is asked as written, at any length.
   */
  question?: { text: string; source: 'pack' };
  /** T-190: the pack asks this optional fact when it is empty (`ask_when_empty: true`). */
  ask_when_empty?: true;
}

/**
 * How much a pack says about a group's facts.
 *   full        each fact is written out (label, type, required)
 *   names_only  the group only lists the names of its required facts
 *   none        the group names no facts at all
 */
export type RulePackGroupDetail = 'full' | 'names_only' | 'none';

export interface RulePackGroup {
  name: string;
  label: string;
  /** Whether the pack marks the whole group as required. Null when it does not say. */
  required: boolean | null;
  /** True when the pack marks the group as optional. */
  optional: boolean;
  factCount: number;
  detail: RulePackGroupDetail;
  note: string | null;
}

export interface RulePackClause {
  id: string;
  title: string;
  /** What the clause must cover, in the pack's words. */
  detail: string | null;
  /** Fixed wording the pack supplies for the clause, when it supplies any. */
  fixedText: string | null;
  required: boolean;
  appliesWhen: string | null;
  statutoryBasis: string | null;
  /** Sub-clauses or listed parts of the clause. */
  parts: string[];
  /** Keys on the clause that this loader does not interpret, kept as written. */
  extra: Record<string, unknown>;
}

export interface RulePackCauseTitle {
  format: string;
  caseNomenclature: string | null;
  partyDesignations: Array<{ role: string; label: string }>;
}

export interface RulePackValidationRule {
  rule: string;
  detail: string | null;
  severity: string | null;
}

export interface RulePackAct {
  act: string;
  sections: Array<{ number: string; description: string | null }>;
  note: string | null;
  appliesWhen: string | null;
  stateSpecific: boolean;
}

export interface RulePack {
  id: string;
  name: string;
  category: string | null;
  schemaShape: RulePackSchemaShape;
  facts: RulePackFact[];
  groups: RulePackGroup[];
  mandatoryClauses: RulePackClause[];
  causeTitle: RulePackCauseTitle | null;
  prayerTemplate: string | null;
  verificationTemplate: string | null;
  draftingInstructions: string[];
  validationRules: RulePackValidationRule[];
  filingChecklist: string[];
  relevantActs: RulePackAct[];
  courtLevels: string[];
  /** Top-level keys in the file that this loader does not return. */
  unreadKeys: string[];
  /** Anything in the file the loader could not read as expected. */
  notes: string[];
}

export class RulePackError extends Error {
  constructor(
    public readonly packId: string,
    message: string,
  ) {
    super(`Rule pack '${packId}': ${message}`);
    this.name = 'RulePackError';
  }
}

// ── Small helpers ───────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function strings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(str).filter((s): s is string => s !== null);
}

function firstStr(...values: unknown[]): string | null {
  for (const v of values) {
    const s = str(v);
    if (s !== null) return s;
  }
  return null;
}

function humanise(id: string): string {
  const words = id
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/** Option labels from `['A', 'B']` or `[{ label }, { value }, { id }]`. */
function optionLabels(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const o of v) {
    if (typeof o === 'string' || typeof o === 'number') {
      out.push(String(o));
    } else if (isObj(o)) {
      const label = firstStr(o.label, o.name, o.value, o.id);
      if (label !== null) out.push(label);
    }
  }
  return out;
}

// ── Facts: one reader per form_schema shape ─────────────────────────────────

interface FactsResult {
  shape: RulePackSchemaShape;
  facts: RulePackFact[];
  groups: RulePackGroup[];
}

function factFromDef(
  group: string | null,
  name: string,
  def: Obj,
  required: boolean,
  keyByGroup = true,
): RulePackFact {
  // Some packs use `name` for the label when the key is `id`.
  const nameAsLabel = str(def.name) !== null && def.name !== name ? def.name : null;
  return {
    key: group === null || !keyByGroup ? name : `${group}.${name}`,
    group,
    name,
    label: firstStr(def.label, def.title, nameAsLabel) ?? humanise(name),
    type: str(def.type),
    required,
    options: optionLabels(def.options ?? def.enum ?? def.values),
    ...optionIdsAndCondition(def),
    ...packQuestion(def),
  };
}

/**
 * T-190: the pack's question and `ask_when_empty`, when the pack gives them.
 * The text is kept byte for byte: it is Ajay's signed wording.
 */
function packQuestion(def: Obj): Pick<RulePackFact, 'question' | 'ask_when_empty'> {
  const out: Pick<RulePackFact, 'question' | 'ask_when_empty'> = {};
  if (typeof def.question === 'string' && def.question.trim() !== '') {
    out.question = { text: def.question, source: 'pack' };
  }
  if (def.ask_when_empty === true) out.ask_when_empty = true;
  return out;
}

/**
 * The option ids and the show_if condition, so the brief can hide a fact the
 * form hides (T-153). Ids come from `template-promoter`'s `normaliseOption`,
 * so they cannot drift from the form's. One id per label `optionLabels` keeps,
 * in the same order, so `option_ids[i]` is the id of `options[i]`.
 */
function optionIdsAndCondition(def: Obj): Pick<RulePackFact, 'option_ids' | 'show_if'> {
  const out: Pick<RulePackFact, 'option_ids' | 'show_if'> = {};
  const raw = def.options ?? def.enum ?? def.values;
  if (Array.isArray(raw)) {
    const ids: string[] = [];
    raw.forEach((o, idx) => {
      if (typeof o === 'string' || typeof o === 'number') {
        ids.push(normaliseOption(o, idx)?.id ?? `opt_${idx}`);
      } else if (isObj(o)) {
        if (firstStr(o.label, o.name, o.value, o.id) !== null) {
          ids.push(normaliseOption(o, idx)?.id ?? `opt_${idx}`);
        }
      }
    });
    if (ids.length > 0) out.option_ids = ids;
  }
  const cond = str(def.show_if) ?? str(def.depends_on);
  if (cond !== null) out.show_if = cond;
  return out;
}

/** A list of field definitions keyed by `field_id`, `id` or `name`. */
function factsFromList(
  list: unknown[],
  group: string | null,
  where: string,
  notes: string[],
  keyByGroup = true,
): RulePackFact[] {
  const out: RulePackFact[] = [];
  list.forEach((item, idx) => {
    if (!isObj(item)) {
      notes.push(`${where}[${idx}]: not an object, skipped`);
      return;
    }
    const name = firstStr(item.field_id, item.id, item.name);
    if (name === null) {
      notes.push(`${where}[${idx}]: no field_id, id or name, skipped`);
      return;
    }
    out.push(factFromDef(group, name, item, item.required === true, keyByGroup));
  });
  return out;
}

/** `{ type: 'object', required: [...], properties: {...} }`, nested objects become groups. */
function factsFromJsonSchema(
  schema: Obj,
  group: string | null,
  where: string,
  notes: string[],
  facts: RulePackFact[],
  groups: RulePackGroup[],
): void {
  const props = isObj(schema.properties) ? schema.properties : {};
  const requiredList = strings(schema.required);
  for (const [key, def] of Object.entries(props)) {
    if (!isObj(def)) {
      notes.push(`${where}.properties.${key}: not an object, skipped`);
      continue;
    }
    if (isObj(def.properties)) {
      const groupName = group === null ? key : `${group}.${key}`;
      const before = facts.length;
      factsFromJsonSchema(def, groupName, `${where}.properties.${key}`, notes, facts, groups);
      const count = facts.filter((f, i) => i >= before && f.group === groupName).length;
      groups.push({
        name: groupName,
        label: firstStr(def.title, def.label) ?? humanise(key),
        required: requiredList.includes(key),
        optional: def.optional === true,
        factCount: count,
        detail: count > 0 ? 'full' : 'none',
        note: firstStr(def.note, def.description),
      });
      continue;
    }
    facts.push(factFromDef(group, key, def, requiredList.includes(key)));
  }
}

/** A field definition has a `type` that is not 'object'. Anything else is a group. */
function looksLikeFieldDef(o: Obj): boolean {
  return typeof o.type === 'string' && o.type !== 'object';
}

function factsFromGroups(
  schema: Obj,
  notes: string[],
  facts: RulePackFact[],
  groups: RulePackGroup[],
): void {
  for (const [key, sub] of Object.entries(schema)) {
    if (!isObj(sub)) {
      notes.push(`form_schema.${key}: not an object, skipped`);
      continue;
    }

    // (a) The key is itself a fact.
    if (looksLikeFieldDef(sub)) {
      facts.push(factFromDef(null, key, sub, sub.required === true));
      continue;
    }

    const optional = sub.optional === true;
    const label = firstStr(sub.title, sub.label) ?? humanise(key);
    const note = firstStr(sub.note, sub.description);

    // (b) A group written as a JSON Schema object with its facts spelled out.
    if (sub.type === 'object' && isObj(sub.properties)) {
      const before = facts.length;
      factsFromJsonSchema(sub, key, `form_schema.${key}`, notes, facts, groups);
      const count = facts.filter((f, i) => i >= before && f.group === key).length;
      groups.push({
        name: key,
        label,
        required: optional ? false : null,
        optional,
        factCount: count,
        detail: count > 0 ? 'full' : 'none',
        note,
      });
      continue;
    }

    // (c) A group that only lists the names of its required facts.
    if (sub.type === 'object') {
      const names = strings(sub.required);
      for (const name of names) {
        facts.push({
          key: `${key}.${name}`,
          group: key,
          name,
          label: `${label}: ${humanise(name).toLowerCase()}`,
          type: null,
          // The facts are required when the group applies. An optional group may not apply.
          required: !optional,
          options: [],
        });
      }
      groups.push({
        name: key,
        label,
        required: optional ? false : null,
        optional,
        factCount: names.length,
        detail: names.length > 0 ? 'names_only' : 'none',
        note,
      });
      continue;
    }

    // (d) A plain section: `{ <fact>: { type, label, required } }`.
    let count = 0;
    for (const [factKey, def] of Object.entries(sub)) {
      if (!isObj(def)) {
        notes.push(`form_schema.${key}.${factKey}: not an object, skipped`);
        continue;
      }
      facts.push(factFromDef(key, factKey, def, def.required === true));
      count += 1;
    }
    groups.push({
      name: key,
      label,
      required: null,
      optional,
      factCount: count,
      detail: count > 0 ? 'full' : 'none',
      note,
    });
  }
}

function readFacts(schema: unknown, notes: string[]): FactsResult {
  const facts: RulePackFact[] = [];
  const groups: RulePackGroup[] = [];

  if (schema === undefined || schema === null) {
    return { shape: 'absent', facts, groups };
  }
  if (Array.isArray(schema)) {
    return { shape: 'list', facts: factsFromList(schema, null, 'form_schema', notes), groups };
  }
  if (!isObj(schema)) {
    notes.push(`form_schema: unsupported root (${typeof schema}), no facts read`);
    return { shape: 'unknown', facts, groups };
  }

  if (Array.isArray(schema.steps)) {
    schema.steps.forEach((step, idx) => {
      if (!isObj(step)) {
        notes.push(`form_schema.steps[${idx}]: not an object, skipped`);
        return;
      }
      const name = firstStr(step.title, step.name) ?? `Step ${idx + 1}`;
      const list = Array.isArray(step.fields) ? step.fields : [];
      const stepFacts = factsFromList(list, name, `form_schema.steps[${idx}].fields`, notes, false);
      facts.push(...stepFacts);
      groups.push({
        name,
        label: name,
        required: null,
        optional: false,
        factCount: stepFacts.length,
        detail: stepFacts.length > 0 ? 'full' : 'none',
        note: null,
      });
    });
    return { shape: 'steps', facts, groups };
  }

  if (Array.isArray(schema.fields)) {
    return {
      shape: 'fields',
      facts: factsFromList(schema.fields, null, 'form_schema.fields', notes),
      groups,
    };
  }

  if (schema.type === 'object' && isObj(schema.properties)) {
    factsFromJsonSchema(schema, null, 'form_schema', notes, facts, groups);
    return { shape: 'json_schema', facts, groups };
  }

  factsFromGroups(schema, notes, facts, groups);
  return { shape: 'groups', facts, groups };
}

// ── Mandatory clauses ───────────────────────────────────────────────────────

const CLAUSE_KNOWN_KEYS = new Set([
  'id',
  'clause_id',
  'name',
  'title',
  'description',
  'content_guidance',
  'note',
  'content',
  'required',
  'must_appear',
  'applies_when',
  'statutory_basis',
  'subclauses',
  'fields',
]);

function readClause(raw: unknown, idx: number, notes: string[]): RulePackClause | null {
  if (typeof raw === 'string') {
    const title = str(raw);
    if (title === null) return null;
    return {
      id: slug(title) || `clause_${idx + 1}`,
      title,
      detail: null,
      fixedText: null,
      required: true,
      appliesWhen: null,
      statutoryBasis: null,
      parts: [],
      extra: {},
    };
  }
  if (!isObj(raw)) {
    notes.push(`mandatory clause ${idx + 1}: not a string or an object, skipped`);
    return null;
  }
  const title = firstStr(raw.name, raw.title, raw.id, raw.clause_id);
  if (title === null) {
    notes.push(`mandatory clause ${idx + 1}: no name or title, skipped`);
    return null;
  }
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!CLAUSE_KNOWN_KEYS.has(k)) extra[k] = v;
  }
  const parts = strings(raw.subclauses);
  return {
    id: firstStr(raw.id, raw.clause_id) ?? (slug(title) || `clause_${idx + 1}`),
    title,
    detail: firstStr(raw.description, raw.content_guidance, raw.note),
    fixedText: str(raw.content),
    // A clause is mandatory unless the pack says otherwise.
    required: raw.required !== false && raw.must_appear !== false,
    appliesWhen: str(raw.applies_when),
    statutoryBasis: str(raw.statutory_basis),
    parts: parts.length > 0 ? parts : strings(raw.fields),
    extra,
  };
}

function readClauses(pack: Obj, notes: string[]): RulePackClause[] {
  const camel = Array.isArray(pack.mandatoryClauses) ? pack.mandatoryClauses : [];
  const snake = Array.isArray(pack.mandatory_clauses) ? pack.mandatory_clauses : [];
  // Where a pack has both lists, `mandatoryClauses` is the detailed one.
  const source = camel.length > 0 ? camel : snake;
  if (camel.length > 0 && snake.length > 0) {
    notes.push(
      `both mandatoryClauses (${camel.length}) and mandatory_clauses (${snake.length}) are present, mandatoryClauses is used`,
    );
  }
  const out: RulePackClause[] = [];
  source.forEach((raw, idx) => {
    const clause = readClause(raw, idx, notes);
    if (clause !== null) out.push(clause);
  });
  return out;
}

/**
 * The mandatory clauses of a raw document-rule object, read the same way as
 * `readRulePack` reads them: `mandatoryClauses` or `mandatory_clauses`, with
 * `mandatoryClauses` used when both are present. Anything the reader could not
 * use is described in `notes`. Pure: no disk access.
 */
export function readMandatoryClauses(source: unknown, notes: string[] = []): RulePackClause[] {
  if (!isObj(source)) return [];
  return readClauses(source, notes);
}

// ── Fixed parts ─────────────────────────────────────────────────────────────

function readCauseTitle(raw: unknown): RulePackCauseTitle | null {
  const asString = str(raw);
  if (asString !== null) {
    return { format: asString, caseNomenclature: null, partyDesignations: [] };
  }
  if (!isObj(raw)) return null;
  const format = str(raw.format);
  if (format === null) return null;
  const designations: Array<{ role: string; label: string }> = [];
  if (Array.isArray(raw.partyDesignations)) {
    for (const d of raw.partyDesignations) {
      if (!isObj(d)) continue;
      const role = str(d.role);
      if (role !== null) designations.push({ role, label: str(d.label) ?? humanise(role) });
    }
  }
  return {
    format,
    caseNomenclature: str(raw.caseNomenclature),
    partyDesignations: designations,
  };
}

// ── Drafting instructions ───────────────────────────────────────────────────

/** Keys whose list items are already complete instructions and need no label. */
const INSTRUCTION_LIST_KEYS = new Set(['promptInstructions', 'drafting_rules']);

function flattenInstructions(value: unknown, label: string | null, out: string[]): void {
  const text = str(value);
  if (text !== null) {
    out.push(label === null ? text : `${label}: ${text}`);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenInstructions(item, label, out);
    return;
  }
  if (isObj(value)) {
    for (const [key, sub] of Object.entries(value)) {
      const own = INSTRUCTION_LIST_KEYS.has(key) ? null : humanise(key);
      const next =
        label !== null && own !== null ? `${label}, ${own.toLowerCase()}` : (own ?? label);
      flattenInstructions(sub, next, out);
    }
  }
}

function readDraftingInstructions(pack: Obj): string[] {
  const out: string[] = [];
  flattenInstructions(pack.prompt_context, null, out);
  flattenInstructions(pack.promptInstructions, null, out);
  return [...new Set(out)];
}

// ── Validation rules ────────────────────────────────────────────────────────

function readValidationRules(raw: unknown, notes: string[]): RulePackValidationRule[] {
  if (raw === undefined || raw === null) return [];
  const out: RulePackValidationRule[] = [];

  if (Array.isArray(raw)) {
    raw.forEach((item, idx) => {
      const text = str(item);
      if (text !== null) {
        out.push({ rule: text, detail: null, severity: null });
        return;
      }
      if (isObj(item)) {
        const rule = firstStr(item.rule, item.name, item.id);
        if (rule !== null) {
          out.push({
            rule,
            detail: firstStr(item.check, item.description, item.detail),
            severity: str(item.severity),
          });
          return;
        }
      }
      notes.push(`validation_rules[${idx}]: not read`);
    });
    return out;
  }

  if (isObj(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      const text = str(value);
      out.push({
        rule: key,
        detail: text ?? (value === undefined ? null : JSON.stringify(value)),
        severity: null,
      });
    }
    return out;
  }

  notes.push(`validation_rules: unsupported shape (${typeof raw}), none read`);
  return out;
}

// ── Relevant acts ───────────────────────────────────────────────────────────

function readSections(
  raw: unknown,
  prefix: string,
): Array<{ number: string; description: string | null }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ number: string; description: string | null }> = [];
  for (const s of raw) {
    if (typeof s === 'string' || typeof s === 'number') {
      const text = String(s).trim();
      if (text.length > 0) out.push({ number: `${prefix}${text}`, description: null });
    } else if (isObj(s)) {
      const number = firstStr(s.number, s.section, s.article);
      if (number !== null) {
        out.push({ number: `${prefix}${number}`, description: str(s.description) });
      }
    }
  }
  return out;
}

function readActs(raw: unknown, where: string, notes: string[]): RulePackAct[] {
  if (!Array.isArray(raw)) return [];
  const out: RulePackAct[] = [];
  raw.forEach((item, idx) => {
    const text = str(item);
    if (text !== null) {
      out.push({ act: text, sections: [], note: null, appliesWhen: null, stateSpecific: false });
      return;
    }
    if (isObj(item)) {
      const act = firstStr(item.act, item.name);
      if (act !== null) {
        out.push({
          act,
          sections: [
            ...readSections(item.sections, ''),
            ...readSections(item.provisions, ''),
            ...readSections(item.articles, 'Article '),
          ],
          note: firstStr(item.notes, item.note),
          appliesWhen: firstStr(item.applies_when, item.applicableWhen),
          stateSpecific: item.state_specific === true,
        });
        return;
      }
    }
    notes.push(`${where}[${idx}]: no act name, skipped`);
  });
  return out;
}

// ── Filing checklist ────────────────────────────────────────────────────────

/** `filingChecklist`, or `filing_checklist` when the camelCase list is empty or absent. */
function readChecklist(pack: Obj): string[] {
  const checklist = strings(pack.filingChecklist);
  return checklist.length > 0 ? checklist : strings(pack.filing_checklist);
}

// ── Readers shared with the legacy prompt/validate path (T-182) ─────────────
// Pure: no disk access. Each reads one part of a raw document-rule object the
// same way `readRulePack` does.

/** The relevant acts in one raw list (for example a rule file's `relevantActs`). */
export function readActList(
  raw: unknown,
  where = 'relevantActs',
  notes: string[] = [],
): RulePackAct[] {
  return readActs(raw, where, notes);
}

/** Drafting instructions from `prompt_context` and `promptInstructions`. */
export function readDraftingInstructionList(source: unknown): string[] {
  if (!isObj(source)) return [];
  return readDraftingInstructions(source);
}

/** The filing checklist, from `filingChecklist` or `filing_checklist`. */
export function readFilingChecklist(source: unknown): string[] {
  if (!isObj(source)) return [];
  return readChecklist(source);
}

// ── The pack ────────────────────────────────────────────────────────────────

const READ_KEYS = new Set([
  '_meta',
  'template_id',
  'docType',
  'title',
  'displayName',
  'category',
  'form_schema',
  'mandatory_clauses',
  'mandatoryClauses',
  'causeTitle',
  'prayerTemplate',
  'verificationTemplate',
  'prompt_context',
  'promptInstructions',
  'validation_rules',
  'filing_checklist',
  'filingChecklist',
  'relevantActs',
  'relatedActs',
  'court_levels',
]);

/** Turn the parsed contents of one rule file into the common shape. Pure: no disk access. */
export function readRulePack(id: string, source: unknown): RulePack {
  if (!isObj(source)) {
    throw new RulePackError(id, 'the file does not hold a JSON object');
  }
  const notes: string[] = [];

  for (const key of ['template_id', 'docType']) {
    const declared = str(source[key]);
    if (declared !== null && declared !== id) {
      notes.push(`${key} is '${declared}' but the file is '${id}.json'`);
    }
  }

  const { shape, facts, groups } = readFacts(source.form_schema, notes);

  const seen = new Set<string>();
  for (const fact of facts) {
    if (seen.has(fact.key)) notes.push(`fact '${fact.key}' appears more than once`);
    seen.add(fact.key);
  }

  return {
    id,
    name: firstStr(source.displayName, source.title) ?? humanise(id),
    category: str(source.category),
    schemaShape: shape,
    facts,
    groups,
    mandatoryClauses: readClauses(source, notes),
    causeTitle: readCauseTitle(source.causeTitle),
    prayerTemplate: str(source.prayerTemplate),
    verificationTemplate: str(source.verificationTemplate),
    draftingInstructions: readDraftingInstructions(source),
    validationRules: readValidationRules(source.validation_rules, notes),
    filingChecklist: readChecklist(source),
    relevantActs: [
      ...readActs(source.relevantActs, 'relevantActs', notes),
      ...readActs(source.relatedActs, 'relatedActs', notes),
    ],
    courtLevels: strings(source.court_levels),
    unreadKeys: Object.keys(source).filter((k) => !READ_KEYS.has(k)),
    notes,
  };
}

// ── Disk access ─────────────────────────────────────────────────────────────

export const RULE_PACKS_DIR = join(__dirname, '..', 'config', 'document-rules');

/** A pack id is a file name without `.json`. Nothing else is ever read from disk. */
const PACK_ID = /^[a-z0-9_]+$/;

const cache = new Map<string, RulePack>();

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** The ids of every rule pack, in alphabetical order. */
export function listRulePackIds(dir: string = RULE_PACKS_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .filter((id) => PACK_ID.test(id))
    .sort();
}

/**
 * The rules for one kind of document, in the same shape for every pack.
 *
 * Returns null when there is no pack with that id, which is the "no pack" case in
 * ADR-021. Throws `RulePackError` when the pack exists but cannot be read. The
 * result is frozen and shared between callers.
 */
export function loadRulePack(id: string, dir: string = RULE_PACKS_DIR): RulePack | null {
  // The id can come from a model's answer, so it is checked before it touches a path.
  if (typeof id !== 'string' || !PACK_ID.test(id)) return null;

  const useCache = dir === RULE_PACKS_DIR;
  if (useCache) {
    const hit = cache.get(id);
    if (hit !== undefined) return hit;
  }

  let text: string;
  try {
    text = readFileSync(join(dir, `${id}.json`), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new RulePackError(id, `could not be read (${(err as Error).message})`);
  }

  let source: unknown;
  try {
    source = JSON.parse(text);
  } catch (err) {
    throw new RulePackError(id, `is not valid JSON (${(err as Error).message})`);
  }

  const pack = deepFreeze(readRulePack(id, source));
  if (useCache) cache.set(id, pack);
  return pack;
}

export interface RulePackLoadResult {
  packs: RulePack[];
  errors: Array<{ id: string; message: string }>;
}

/** Load every pack. One unreadable pack does not stop the others. */
export function loadAllRulePacks(dir: string = RULE_PACKS_DIR): RulePackLoadResult {
  const packs: RulePack[] = [];
  const errors: Array<{ id: string; message: string }> = [];
  for (const id of listRulePackIds(dir)) {
    try {
      const pack = loadRulePack(id, dir);
      if (pack !== null) packs.push(pack);
    } catch (err) {
      errors.push({ id, message: (err as Error).message });
    }
  }
  return { packs, errors };
}

/** For tests: forget the packs and skeletons already read. */
export function clearRulePackCache(): void {
  cache.clear();
  skeletonCache.clear();
}

// ── Clause skeletons (T-374, ADR-025 D1) ────────────────────────────────────
//
// One Ajay-signed skeleton per pack, at `_skeletons/<packId>.json`, generated byte for
// byte from the fenced JSON block of `handoff/legal/skeleton-<packId>-signed.md`.
// No file → `loadSkeleton` returns null and the pack stays on today's path; that is
// the only switch (ADR-025 call shape 4). The loader reads every field Ajay writes and
// drops none: a field it does not know fails validation instead of being ignored.

// Skeleton types: moves to types/skeleton.ts (T-373).

/** `fixed`: the signed text, slots filled from ledger facts. `advocate`: the advocate's own words. */
export type SkeletonSource = 'fixed' | 'advocate';

/** A value a condition compares a ledger fact with. */
export type SkeletonValue = string | number | boolean;

/**
 * The values of `in` / `not_in`: a list written in the skeleton, or a string naming a list:
 * a top-level value-list key of the skeleton (`none_values`, `antecedents_none_values`, any
 * key matching `SKELETON_VALUE_LIST_KEY`), or `<entry>.equals` (that averment's signed list).
 */
export type SkeletonValueSet = SkeletonValue[] | string;

/** A test on one ledger key. Exactly one of `in`, `not_in`, `present` (validated). */
export interface SkeletonKeyCondition {
  key: string;
  in?: SkeletonValueSet;
  not_in?: SkeletonValueSet;
  present?: boolean;
}

/** Every inner condition holds. */
export interface SkeletonAllOfCondition {
  all_of: SkeletonCondition[];
}

export type SkeletonCondition = SkeletonKeyCondition | SkeletonAllOfCondition;

/** One option of a list clause, keyed by the pack's option id. */
export interface SkeletonListItem {
  text?: string;
  slots?: string[];
  /** A condition the item needs; when it fails the item renders its MISSING form. */
  requires?: SkeletonCondition;
  missing_label?: string;
  /** Render another clause of the skeleton in place of this item. */
  use_clause?: string;
}

export interface SkeletonVariant {
  when: SkeletonCondition;
  text: string;
  slots?: string[];
}

/** A slot whose value is mapped from another ledger value, not taken from a fact. */
export interface SkeletonDerivedSlot {
  from: string;
  map: Record<string, string>;
}

export interface SkeletonClause {
  id: string;
  order: number;
  required: boolean;
  source: SkeletonSource;
  text?: string;
  slots?: string[];
  /** Advocate clauses: the ledger key whose own words fill the clause. */
  slot?: string;
  intro?: string;
  list?: boolean;
  /** List clauses: the pack field whose ticked options select the items. */
  from?: string;
  items?: Record<string, SkeletonListItem>;
  when?: SkeletonCondition;
  variants?: SkeletonVariant[];
  missing_label?: string;
  derived?: Record<string, SkeletonDerivedSlot>;
  /** Render the clause only when this slot has a fact. */
  render_if_any_slot?: string;
  /** `<clauseId>` or `<clauseId>.<itemId>`: skip this clause when that one rendered. */
  skip_if_rendered?: string;
  t327_brief_blank_covers?: boolean;
}

export interface Skeleton {
  pack: string;
  version: number;
  /** Reference to the signed none-phrasings list, e.g. "first_bail_application.equals (T-334)". */
  none_values?: string;
  /**
   * Ajay's own none list for the antecedents clause (re-sign d87355a), written inline.
   * Not in T-373's ae56036 type. Validation also accepts any other top-level key matching
   * `SKELETON_VALUE_LIST_KEY`; such a key needs a field here when Ajay signs one (left out
   * of the type so T-373's `Skeleton` stays assignable both ways).
   */
  antecedents_none_values?: string[];
  /**
   * In T-373's type for structural identity. Not a field of the signed JSON (validation
   * rejects it there) and not set by this loader.
   */
  mandatoryClauses?: string[];
  clauses: SkeletonClause[];
}

/** The loader's shape as T-373 injects it: a pack with no skeleton stays on today's path. */
export type LoadSkeleton = (packId: string) => Skeleton | null;

export const SKELETONS_DIR = join(RULE_PACKS_DIR, '_skeletons');

const skeletonCache = new Map<string, Skeleton>();

/** For tests: forget the skeletons already read. */
export function clearSkeletonCache(): void {
  skeletonCache.clear();
}

const SKELETON_KEYS = new Set(['pack', 'version', 'none_values', 'clauses']);

function isSkeletonTopKey(k: string): boolean {
  return SKELETON_KEYS.has(k) || SKELETON_VALUE_LIST_KEY.test(k);
}
const SKELETON_CLAUSE_KEYS = new Set([
  'id',
  'order',
  'required',
  'source',
  'text',
  'slots',
  'slot',
  'intro',
  'list',
  'from',
  'items',
  'when',
  'variants',
  'missing_label',
  'derived',
  'render_if_any_slot',
  'skip_if_rendered',
  't327_brief_blank_covers',
]);
const SKELETON_ITEM_KEYS = new Set(['text', 'slots', 'requires', 'missing_label', 'use_clause']);
const SKELETON_VARIANT_KEYS = new Set(['when', 'text', 'slots']);
const SKELETON_DERIVED_KEYS = new Set(['from', 'map']);
const SKELETON_SOURCES = new Set<string>(['fixed', 'advocate']);

const SLOT_NAME = /^[a-z0-9_]+$/;
const EQUALS_REF = /^[a-z0-9_]+\.equals$/;
/**
 * Top-level value-list keys a condition's `in` / `not_in` string may name: `none_values`
 * and any `<name>_none_values` Ajay signs, e.g. `antecedents_none_values`.
 */
export const SKELETON_VALUE_LIST_KEY = /^(?:[a-z0-9]+_)*none_values$/;
const PLACEHOLDER = /\{([^{}]*)\}/g;

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * A raw value for an error message: quoted only when it is an id (the PACK_ID / slot-name
 * pattern), otherwise "an invalid id", so a message never carries arbitrary file text.
 */
function quoteId(v: unknown): string {
  return typeof v === 'string' && (PACK_ID.test(v) || SLOT_NAME.test(v))
    ? `'${v}'`
    : 'an invalid id';
}

function unknownKeys(o: Obj, known: Set<string>, where: string, errors: string[]): void {
  for (const k of Object.keys(o)) {
    if (!known.has(k)) errors.push(`${where}: unknown field ${quoteId(k)}`);
  }
}

/** The placeholder names in a text. Names that are not slot ids are reported. */
function placeholders(text: string, where: string, errors: string[]): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER)) {
    const name = m[1];
    if (!SLOT_NAME.test(name)) {
      errors.push(`${where}: a placeholder is not a slot id`);
      continue;
    }
    out.add(name);
  }
  return out;
}

/** `slots` is optional; when given it is a list of unique slot ids. */
function readSlotList(v: unknown, where: string, errors: string[]): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    errors.push(`${where}: slots is not an array`);
    return [];
  }
  const out: string[] = [];
  v.forEach((s, i) => {
    if (typeof s !== 'string' || !SLOT_NAME.test(s)) {
      errors.push(`${where}: slots[${i}] is not a slot id`);
      return;
    }
    if (out.includes(s)) errors.push(`${where}: slot '${s}' is listed twice`);
    out.push(s);
  });
  return out;
}

/**
 * Every `{slot}` in the text is listed in `slots` or is a derived slot, and every
 * listed slot appears in the text.
 */
function checkTextSlots(
  text: unknown,
  slotsRaw: unknown,
  derived: Set<string>,
  where: string,
  errors: string[],
): Set<string> {
  const slots = readSlotList(slotsRaw, where, errors);
  if (!nonEmptyString(text)) {
    errors.push(`${where}: text is missing or empty`);
    return new Set();
  }
  const used = placeholders(text, where, errors);
  for (const name of used) {
    if (!slots.includes(name) && !derived.has(name)) {
      errors.push(`${where}: placeholder '${name}' is not listed in slots`);
    }
  }
  for (const s of slots) {
    if (!used.has(s)) errors.push(`${where}: slot '${s}' does not appear in the text`);
  }
  return used;
}

function checkValueList(
  v: unknown,
  op: string,
  where: string,
  refs: Set<string>,
  errors: string[],
): void {
  if (typeof v === 'string') {
    // A string names a top-level value list of this skeleton, or an averment's signed list.
    if (SKELETON_VALUE_LIST_KEY.test(v)) {
      refs.add(v);
      return;
    }
    if (!EQUALS_REF.test(v)) {
      errors.push(
        `${where}: ${op} is a string but names neither a top-level value list nor '<entry>.equals'`,
      );
    }
    return;
  }
  if (!Array.isArray(v) || v.length === 0) {
    errors.push(`${where}: ${op} is not a non-empty array or a reference`);
    return;
  }
  v.forEach((x, i) => {
    const ok =
      (typeof x === 'string' && x.length > 0) ||
      typeof x === 'boolean' ||
      (typeof x === 'number' && Number.isFinite(x));
    if (!ok) errors.push(`${where}: ${op}[${i}] is not a string, number or boolean`);
  });
}

function checkCondition(c: unknown, where: string, refs: Set<string>, errors: string[]): void {
  if (!isObj(c)) {
    errors.push(`${where}: condition is not an object`);
    return;
  }
  if ('all_of' in c) {
    unknownKeys(c, new Set(['all_of']), where, errors);
    if (!Array.isArray(c.all_of) || c.all_of.length === 0) {
      errors.push(`${where}: all_of is not a non-empty array`);
      return;
    }
    c.all_of.forEach((sub, i) => checkCondition(sub, `${where}.all_of[${i}]`, refs, errors));
    return;
  }
  unknownKeys(c, new Set(['key', 'in', 'not_in', 'present']), where, errors);
  if (typeof c.key !== 'string' || !SLOT_NAME.test(c.key)) {
    errors.push(`${where}: key is not a ledger key id`);
  }
  const tests = ['in', 'not_in', 'present'].filter((t) => t in c);
  if (tests.length !== 1) {
    errors.push(`${where}: needs exactly one of in, not_in, present`);
    return;
  }
  if (tests[0] === 'present') {
    if (typeof c.present !== 'boolean') errors.push(`${where}: present is not a boolean`);
    return;
  }
  checkValueList(c[tests[0]], tests[0], where, refs, errors);
}

/**
 * Check a parsed skeleton file. Pure: no disk access. Returns the errors, empty when the
 * skeleton is valid. Messages carry ids only, never the signed wording.
 *
 * `packId` is the file's id. With `pack` (the pack read by `loadRulePack`), a list clause's
 * `from` must name a pack field with options and its items' keys must be exactly that
 * field's option ids (Arjun, T-374: never a parallel list). Slots are not checked against
 * the pack's form fields: ledger keys that are not form fields are valid slots (Ajay).
 */
export function validateSkeleton(raw: unknown, pack: RulePack | null, packId?: string): string[] {
  const errors: string[] = [];
  if (!isObj(raw)) return ['the skeleton is not a JSON object'];
  for (const k of Object.keys(raw)) {
    if (!isSkeletonTopKey(k)) errors.push(`skeleton: unknown field ${quoteId(k)}`);
  }

  const expectedId = packId ?? pack?.id;
  if (typeof raw.pack !== 'string') {
    errors.push('pack is missing or not a string');
  } else if (expectedId !== undefined && raw.pack !== expectedId) {
    errors.push(
      `pack is ${quoteId(raw.pack)} but the file is ${
        PACK_ID.test(expectedId) ? `'${expectedId}.json'` : 'an invalid id'
      }`,
    );
  }
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1) {
    errors.push('version is not a positive integer');
  }
  if (raw.none_values !== undefined && !nonEmptyString(raw.none_values)) {
    errors.push('none_values is not a non-empty string');
  }
  // Other value lists (`<name>_none_values`): an inline list of unique non-empty strings
  // only. Only `none_values` is a reference string.
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'none_values' || !SKELETON_VALUE_LIST_KEY.test(k)) continue;
    if (!Array.isArray(v) || v.length === 0) {
      errors.push(`${k} is not a non-empty array of strings`);
      continue;
    }
    const seen = new Set<string>();
    v.forEach((x, i) => {
      if (!nonEmptyString(x)) errors.push(`${k}[${i}] is not a non-empty string`);
      else if (seen.has(x)) errors.push(`${k}[${i}] repeats an earlier entry`);
      else seen.add(x);
    });
  }
  if (!Array.isArray(raw.clauses) || raw.clauses.length === 0) {
    errors.push('clauses is not a non-empty array');
    return errors;
  }

  const refs = new Set<string>();
  const ids = new Map<string, Obj>();
  const orders = new Map<number, string>();
  const crossRefs: Array<() => void> = [];

  raw.clauses.forEach((c, idx) => {
    if (!isObj(c)) {
      errors.push(`clauses[${idx}]: not an object`);
      return;
    }
    const id = typeof c.id === 'string' && SLOT_NAME.test(c.id) ? c.id : null;
    const where = id !== null ? `clause '${id}'` : `clauses[${idx}]`;
    if (id === null) errors.push(`${where}: id is missing or not an id`);
    else if (ids.has(id)) errors.push(`${where}: id is used more than once`);
    else ids.set(id, c);

    unknownKeys(c, SKELETON_CLAUSE_KEYS, where, errors);

    if (typeof c.order !== 'number' || !Number.isFinite(c.order)) {
      errors.push(`${where}: order is not a number`);
    } else if (orders.has(c.order)) {
      errors.push(`${where}: order ${c.order} is also used by clause '${orders.get(c.order)}'`);
    } else {
      orders.set(c.order, id ?? `clauses[${idx}]`);
    }
    if (typeof c.required !== 'boolean') errors.push(`${where}: required is not a boolean`);
    if (typeof c.source !== 'string' || !SKELETON_SOURCES.has(c.source)) {
      errors.push(`${where}: source is not 'fixed' or 'advocate'`);
    }
    for (const k of ['intro', 'missing_label'] as const) {
      if (c[k] !== undefined && !nonEmptyString(c[k])) {
        errors.push(`${where}: ${k} is not a non-empty string`);
      }
    }
    if (c.list !== undefined && typeof c.list !== 'boolean') {
      errors.push(`${where}: list is not a boolean`);
    }
    if (c.t327_brief_blank_covers !== undefined && typeof c.t327_brief_blank_covers !== 'boolean') {
      errors.push(`${where}: t327_brief_blank_covers is not a boolean`);
    }
    if (c.when !== undefined) checkCondition(c.when, `${where}.when`, refs, errors);

    // Derived slots.
    const derived = new Set<string>();
    if (c.derived !== undefined) {
      if (!isObj(c.derived)) {
        errors.push(`${where}: derived is not an object`);
      } else {
        for (const [name, d] of Object.entries(c.derived)) {
          const dw = `${where}.derived ${quoteId(name)}`;
          if (!SLOT_NAME.test(name)) errors.push(`${dw}: not a slot id`);
          derived.add(name);
          if (!isObj(d)) {
            errors.push(`${dw}: not an object`);
            continue;
          }
          unknownKeys(d, SKELETON_DERIVED_KEYS, dw, errors);
          if (typeof d.from !== 'string' || !SLOT_NAME.test(d.from)) {
            errors.push(`${dw}: from is not a ledger key id`);
          }
          if (!isObj(d.map) || Object.keys(d.map).length === 0) {
            errors.push(`${dw}: map is not a non-empty object`);
          } else {
            for (const [k, v] of Object.entries(d.map)) {
              if (!nonEmptyString(v))
                errors.push(`${dw}: map ${quoteId(k)} is not a non-empty string`);
            }
          }
        }
      }
    }

    // Texts and their slots: the clause text, each variant, each item.
    const usedSlots = new Set<string>();
    const itemSlots = new Set<string>();
    const hasText = c.text !== undefined;
    const hasVariants = c.variants !== undefined;
    const hasItems = c.items !== undefined;

    if (hasText && hasVariants) errors.push(`${where}: has both text and variants`);
    if (c.slots !== undefined && !hasText) errors.push(`${where}: has slots but no text`);
    if (hasText) {
      for (const s of checkTextSlots(c.text, c.slots, derived, where, errors)) usedSlots.add(s);
    }
    if (hasVariants) {
      if (!Array.isArray(c.variants) || c.variants.length === 0) {
        errors.push(`${where}: variants is not a non-empty array`);
      } else {
        c.variants.forEach((v, i) => {
          const vw = `${where}.variants[${i}]`;
          if (!isObj(v)) {
            errors.push(`${vw}: not an object`);
            return;
          }
          unknownKeys(v, SKELETON_VARIANT_KEYS, vw, errors);
          if (v.when === undefined) errors.push(`${vw}: when is missing`);
          else checkCondition(v.when, `${vw}.when`, refs, errors);
          for (const s of checkTextSlots(v.text, v.slots, derived, vw, errors)) usedSlots.add(s);
        });
      }
    }
    // Source rules.
    if (c.source === 'advocate') {
      if (typeof c.slot !== 'string' || !SLOT_NAME.test(c.slot)) {
        errors.push(`${where}: advocate clause has no slot`);
      }
      if (hasText) errors.push(`${where}: advocate clause has text`);
      if (hasVariants) errors.push(`${where}: advocate clause has variants`);
      if (hasItems) errors.push(`${where}: advocate clause has items`);
    } else if (c.source === 'fixed') {
      if (c.slot !== undefined) errors.push(`${where}: slot is only for advocate clauses`);
      if (!hasText && !hasVariants && !hasItems) {
        errors.push(`${where}: fixed clause has no text, variants or items`);
      }
    }

    // List clauses.
    if (c.list === true && !hasItems && c.source !== 'advocate') {
      errors.push(`${where}: list clause has no items and is not an advocate list`);
    }
    if (hasItems && c.list !== true) errors.push(`${where}: has items but list is not true`);
    if (c.from !== undefined && !hasItems) errors.push(`${where}: has from but no items`);
    if (hasItems) {
      if (typeof c.from !== 'string' || !SLOT_NAME.test(c.from)) {
        errors.push(`${where}: items need from (the pack field whose options they follow)`);
      }
      if (!isObj(c.items) || Object.keys(c.items).length === 0) {
        errors.push(`${where}: items is not a non-empty object`);
      } else {
        for (const [itemId, item] of Object.entries(c.items)) {
          const iw = `${where} item ${quoteId(itemId)}`;
          if (!isObj(item)) {
            errors.push(`${iw}: not an object`);
            continue;
          }
          unknownKeys(item, SKELETON_ITEM_KEYS, iw, errors);
          if (item.requires !== undefined) {
            checkCondition(item.requires, `${iw}.requires`, refs, errors);
          }
          if (item.missing_label !== undefined && !nonEmptyString(item.missing_label)) {
            errors.push(`${iw}: missing_label is not a non-empty string`);
          }
          if (item.use_clause !== undefined) {
            if (item.text !== undefined || item.slots !== undefined) {
              errors.push(`${iw}: has use_clause and text or slots`);
            }
            const target = item.use_clause;
            crossRefs.push(() => {
              if (typeof target !== 'string' || !ids.has(target)) {
                errors.push(`${iw}: use_clause names no clause of this skeleton`);
              } else if (target === id) {
                errors.push(`${iw}: use_clause names its own clause`);
              }
            });
          } else {
            for (const s of checkTextSlots(item.text, item.slots, derived, iw, errors)) {
              itemSlots.add(s);
            }
          }
        }
      }
    }
    for (const name of derived) {
      if (!usedSlots.has(name) && !itemSlots.has(name)) {
        errors.push(`${where}: derived slot ${quoteId(name)} does not appear in any text`);
      }
    }

    // render_if_any_slot: one of the clause's own slots (an advocate clause's is its `slot`).
    if (c.render_if_any_slot !== undefined) {
      const r = c.render_if_any_slot;
      const ownSlot =
        typeof r === 'string' && (usedSlots.has(r) || (c.source === 'advocate' && c.slot === r));
      if (!ownSlot) {
        errors.push(`${where}: render_if_any_slot is not one of the clause's slots`);
      }
    }

    // skip_if_rendered: '<clause>' or '<clause>.<item>'.
    if (c.skip_if_rendered !== undefined) {
      const ref = c.skip_if_rendered;
      crossRefs.push(() => {
        if (typeof ref !== 'string') {
          errors.push(`${where}: skip_if_rendered is not a string`);
          return;
        }
        const [clauseId, itemId, ...rest] = ref.split('.');
        const target = ids.get(clauseId);
        if (target === undefined || rest.length > 0) {
          errors.push(`${where}: skip_if_rendered names no clause of this skeleton`);
        } else if (clauseId === id) {
          errors.push(`${where}: skip_if_rendered names its own clause`);
        } else if (
          itemId !== undefined &&
          !(isObj(target.items) && Object.prototype.hasOwnProperty.call(target.items, itemId))
        ) {
          errors.push(`${where}: skip_if_rendered names no item of clause ${quoteId(clauseId)}`);
        }
      });
    }

    // Arjun's rule: list items follow the pack's option ids exactly.
    if (pack !== null && hasItems && typeof c.from === 'string' && isObj(c.items)) {
      const from = c.from;
      const fact = pack.facts.find((f) => f.name === from || f.key === from);
      if (fact === undefined) {
        errors.push(`${where}: from ${quoteId(from)} is not a field of pack ${quoteId(pack.id)}`);
      } else if (fact.option_ids === undefined || fact.option_ids.length === 0) {
        errors.push(
          `${where}: from ${quoteId(from)} has no options in pack ${quoteId(pack.id)}, so items cannot follow them`,
        );
      } else {
        const want = new Set(fact.option_ids);
        const have = Object.keys(c.items);
        for (const k of have) {
          if (!want.has(k)) {
            errors.push(`${where}: item ${quoteId(k)} is not an option id of ${quoteId(from)}`);
          }
        }
        for (const k of want) {
          if (!have.includes(k)) {
            errors.push(`${where}: option id ${quoteId(k)} of ${quoteId(from)} has no item`);
          }
        }
      }
    }
  });

  for (const check of crossRefs) check();

  for (const name of refs) {
    if (raw[name] === undefined) {
      errors.push(`a condition names '${name}' but the skeleton has no top-level '${name}'`);
    }
  }
  return errors;
}

/** A trailing parenthesised note on a reference, e.g. the " (T-334)" in `none_values`. */
const REF_NOTE = /\s*\([^()]*\)\s*$/;

/**
 * The averment entry ids a skeleton's `<entry>.equals` references name: every such string
 * in a `when`, a variant's `when` or an item's `requires` (through `all_of`), and the top-level
 * `none_values` with its trailing note stripped. Pure. A `none_values` that is not an
 * `<entry>.equals` reference after stripping is returned in `badNoneValues`.
 */
export function skeletonEqualsRefs(raw: unknown): { entries: string[]; badNoneValues: boolean } {
  const entries = new Set<string>();
  let badNoneValues = false;
  if (!isObj(raw)) return { entries: [], badNoneValues };

  const visit = (c: unknown): void => {
    if (!isObj(c)) return;
    if (Array.isArray(c.all_of)) {
      c.all_of.forEach(visit);
      return;
    }
    for (const op of ['in', 'not_in']) {
      const v = c[op];
      if (typeof v === 'string' && EQUALS_REF.test(v)) entries.add(v.slice(0, -'.equals'.length));
    }
  };

  if (typeof raw.none_values === 'string') {
    const ref = raw.none_values.replace(REF_NOTE, '');
    if (EQUALS_REF.test(ref)) entries.add(ref.slice(0, -'.equals'.length));
    else badNoneValues = true;
  }
  if (Array.isArray(raw.clauses)) {
    for (const c of raw.clauses) {
      if (!isObj(c)) continue;
      visit(c.when);
      if (Array.isArray(c.variants)) for (const v of c.variants) if (isObj(v)) visit(v.when);
      if (isObj(c.items)) for (const i of Object.values(c.items)) if (isObj(i)) visit(i.requires);
    }
  }
  return { entries: [...entries], badNoneValues };
}

/** True when the pack's averment lists have an entry `id` whose key condition carries an `equals` list. */
function hasEqualsList(lists: AvermentLists, id: string): boolean {
  const conditions = [
    ...lists.banned.filter((e) => e.id === id).map((e) => e.unlocked_by),
    ...lists.allowed.filter((e) => e.id === id).map((e) => e.requires),
  ];
  return conditions.some(
    (c) =>
      isObj(c) && Array.isArray((c as Obj).equals) && ((c as Obj).equals as unknown[]).length > 0,
  );
}

/**
 * The pack's averment lists. `averments.ts` reads `RULE_PACKS_DIR` from this module when it
 * loads, so a top-level import back would be circular (and crash when this module loads
 * first); it is required on first use instead.
 */
function loadPackAvermentLists(packId: string, avermentsDir: string | undefined): AvermentLists {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const averments = require('./averments') as typeof import('./averments');
  return avermentsDir === undefined
    ? averments.loadAvermentLists(packId)
    : averments.loadAvermentLists(packId, avermentsDir);
}

/**
 * The signed clause skeleton for a pack, or null when the pack has none (ADR-025 D1).
 *
 * Null is the only switch: a pack with no skeleton stays on today's path. Throws
 * `RulePackError` when the file exists but cannot be read, is not JSON, is not valid,
 * has no rule pack, or names an `<entry>.equals` list (in a condition or in `none_values`)
 * that the pack's averment lists do not carry. The result is frozen and shared between callers. Slot names are
 * returned as Ajay wrote them, which are the pack's own ledger keys (ADR-025 rule 7);
 * see `resolveSlot` for the other spelling of an aliased key.
 */
export function loadSkeleton(
  packId: string,
  dir: string = SKELETONS_DIR,
  packDir: string = RULE_PACKS_DIR,
  avermentsDir?: string,
): Skeleton | null {
  // The id can come from a model's answer, so it is checked before it touches a path.
  if (typeof packId !== 'string' || !PACK_ID.test(packId)) return null;

  const useCache =
    dir === SKELETONS_DIR && packDir === RULE_PACKS_DIR && avermentsDir === undefined;
  if (useCache) {
    const hit = skeletonCache.get(packId);
    if (hit !== undefined) return hit;
  }

  let text: string;
  try {
    text = readFileSync(join(dir, `${packId}.json`), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new RulePackError(packId, `skeleton could not be read (${(err as Error).message})`);
  }

  let source: unknown;
  try {
    source = JSON.parse(text);
  } catch (err) {
    // The parser's message can quote the signed text; keep only the position.
    const pos = /position (\d+)/.exec((err as Error).message);
    throw new RulePackError(
      packId,
      `skeleton is not valid JSON${pos !== null ? ` (at position ${pos[1]})` : ''}`,
    );
  }

  const pack = loadRulePack(packId, packDir);
  if (pack === null) throw new RulePackError(packId, 'skeleton has no rule pack');

  const errors = validateSkeleton(source, pack, packId);
  if (errors.length > 0) {
    throw new RulePackError(packId, `skeleton is not valid: ${errors.join('; ')}`);
  }

  // Every `<entry>.equals` reference must name a signed list the pack's averments carry.
  const { entries, badNoneValues } = skeletonEqualsRefs(source);
  if (badNoneValues) {
    throw new RulePackError(packId, "skeleton none_values is not an '<entry>.equals' reference");
  }
  if (entries.length > 0) {
    let lists: AvermentLists;
    try {
      lists = loadPackAvermentLists(packId, avermentsDir);
    } catch {
      throw new RulePackError(packId, 'skeleton: the averment lists could not be read');
    }
    for (const entry of entries) {
      if (!hasEqualsList(lists, entry)) {
        throw new RulePackError(
          packId,
          `skeleton names '${entry}.equals', but no averment entry '${entry}' carries an equals list`,
        );
      }
    }
  }

  const skeleton = deepFreeze(source as Skeleton);
  if (useCache) skeletonCache.set(packId, skeleton);
  return skeleton;
}

// T-373's injected loader type: a compile-time check that loadSkeleton satisfies it.
const loadSkeletonAsInjected: LoadSkeleton = loadSkeleton;
void loadSkeletonAsInjected;

// ── Slot aliases (Arjun, 13 Oct 2026, T-374 option (b): two maps, two jobs) ──
// `FIELD_ALIASES` / `applyFieldAliases` (T-382) are the "Field aliases" block at the end
// of this file.

function own(o: object, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

/**
 * ADR-025 slot-list rule 7: the three ledger keys spelt differently across the bail packs.
 * A lookup only, read in either direction by `resolveSlot`; it never writes or adds a key
 * to form data.
 */
export const SLOT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  father_name: 'applicant_parentage',
  address: 'applicant_address',
  sections_charged: 'offences_alleged',
});

/**
 * The key a pack's ledger uses for a skeleton slot: the slot itself when the pack has a
 * field of that name; else its `SLOT_ALIASES` partner (either direction) when the pack has
 * that one; else the slot unchanged (ledger keys that are not form fields, such as
 * `facts_narrative`, are valid slots). Skeletons are written in their own pack's names,
 * so for them this returns the slot as written. Reads only.
 */
export function resolveSlot(
  packId: string,
  slot: string,
  packDir: string = RULE_PACKS_DIR,
): string {
  const pack = loadRulePack(packId, packDir);
  if (pack === null) return slot;
  const has = (name: string): boolean => pack.facts.some((f) => f.name === name || f.key === name);
  if (has(slot)) return slot;
  const other = own(SLOT_ALIASES, slot)
    ? SLOT_ALIASES[slot]
    : Object.keys(SLOT_ALIASES).find((k) => SLOT_ALIASES[k] === slot);
  if (other !== undefined && has(other)) return other;
  return slot;
}

// ── Gap report ──────────────────────────────────────────────────────────────

export interface RulePackGaps {
  id: string;
  name: string;
  schemaShape: RulePackSchemaShape;
  factCount: number;
  requiredFactCount: number;
  /** Groups that name no facts at all. */
  emptyGroups: string[];
  /** Groups that list the names of their facts and nothing else about them. */
  namesOnlyGroups: string[];
  /** Groups the pack marks as required while marking none of their facts as required. */
  requiredGroupsWithNoRequiredFact: string[];
  /** Fixed parts the pack does not have: 'cause title', 'prayer', 'verification'. */
  absentFixedParts: string[];
  clauseCount: number;
  hasDraftingInstructions: boolean;
  notes: string[];
}

export function findRulePackGaps(pack: RulePack): RulePackGaps {
  const absent: string[] = [];
  if (pack.causeTitle === null) absent.push('cause title');
  if (pack.prayerTemplate === null) absent.push('prayer');
  if (pack.verificationTemplate === null) absent.push('verification');
  return {
    id: pack.id,
    name: pack.name,
    schemaShape: pack.schemaShape,
    factCount: pack.facts.length,
    requiredFactCount: pack.facts.filter((f) => f.required).length,
    emptyGroups: pack.groups.filter((g) => g.detail === 'none').map((g) => g.name),
    namesOnlyGroups: pack.groups.filter((g) => g.detail === 'names_only').map((g) => g.name),
    requiredGroupsWithNoRequiredFact: pack.groups
      .filter(
        (g) => g.required === true && !pack.facts.some((f) => f.group === g.name && f.required),
      )
      .map((g) => g.name),
    absentFixedParts: absent,
    clauseCount: pack.mandatoryClauses.length,
    hasDraftingInstructions: pack.draftingInstructions.length > 0,
    notes: [...pack.notes],
  };
}

function cell(items: string[]): string {
  return items.length === 0 ? 'None' : items.map((i) => `\`${i}\``).join(', ');
}

/** The report for T-128, as Markdown. `generatedOn` is a date such as '6 Oct 2026'. */
export function buildRulePackReport(result: RulePackLoadResult, generatedOn: string): string {
  const gaps = result.packs.map(findRulePackGaps);
  const count = (test: (g: RulePackGaps) => boolean): number => gaps.filter(test).length;
  const shapes = new Map<string, number>();
  for (const g of gaps) shapes.set(g.schemaShape, (shapes.get(g.schemaShape) ?? 0) + 1);

  const lines: string[] = [];
  lines.push('# Rule-pack report');
  lines.push('');
  lines.push(
    `Written by \`yarn workspace @lawie/drafting report:rule-packs\` on ${generatedOn} (T-124). Do not edit by hand; run the script again.`,
  );
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(
    `- Packs read: ${result.packs.length}. Packs that could not be read: ${result.errors.length}.`,
  );
  lines.push(
    `- Shape of the facts: ${[...shapes.entries()].map(([s, n]) => `${n} \`${s}\``).join(', ')}.`,
  );
  lines.push(`- Packs with no required fact: ${count((g) => g.requiredFactCount === 0)}.`);
  lines.push(
    `- Packs with a group that names no facts: ${count((g) => g.emptyGroups.length > 0)}.`,
  );
  lines.push(
    `- Packs with a group that gives only the names of its facts: ${count((g) => g.namesOnlyGroups.length > 0)}.`,
  );
  lines.push(
    `- Packs with a required group in which no fact is marked required: ${count((g) => g.requiredGroupsWithNoRequiredFact.length > 0)}.`,
  );
  lines.push(
    `- Packs with no cause title: ${count((g) => g.absentFixedParts.includes('cause title'))}.`,
  );
  lines.push(`- Packs with no prayer: ${count((g) => g.absentFixedParts.includes('prayer'))}.`);
  lines.push(
    `- Packs with no verification: ${count((g) => g.absentFixedParts.includes('verification'))}.`,
  );
  lines.push(`- Packs with no mandatory clause: ${count((g) => g.clauseCount === 0)}.`);
  lines.push(`- Packs with no drafting instructions: ${count((g) => !g.hasDraftingInstructions)}.`);
  lines.push('');

  if (result.errors.length > 0) {
    lines.push('## Packs that could not be read');
    lines.push('');
    for (const e of result.errors) lines.push(`- \`${e.id}\`: ${e.message}`);
    lines.push('');
  }

  lines.push('## Every pack');
  lines.push('');
  lines.push(
    '| Pack | Shape | Facts | Required facts | Groups that name no facts | Groups with names only | Required groups with no required fact | Fixed parts absent | Clauses |',
  );
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const g of gaps) {
    lines.push(
      `| \`${g.id}\` | ${g.schemaShape} | ${g.factCount} | ${g.requiredFactCount} | ${cell(g.emptyGroups)} | ${cell(g.namesOnlyGroups)} | ${cell(g.requiredGroupsWithNoRequiredFact)} | ${g.absentFixedParts.length === 0 ? 'None' : g.absentFixedParts.join(', ')} | ${g.clauseCount} |`,
    );
  }
  lines.push('');

  const withNotes = gaps.filter((g) => g.notes.length > 0);
  lines.push('## What the loader could not read as expected');
  lines.push('');
  if (withNotes.length === 0) {
    lines.push('Nothing.');
  } else {
    for (const g of withNotes) {
      for (const note of g.notes) lines.push(`- \`${g.id}\`: ${note}`);
    }
  }
  lines.push('');

  const unread = new Map<string, string[]>();
  for (const pack of result.packs) {
    for (const key of pack.unreadKeys) unread.set(key, [...(unread.get(key) ?? []), pack.id]);
  }
  lines.push('## Keys in the files that the loader does not return');
  lines.push('');
  if (unread.size === 0) {
    lines.push('None.');
  } else {
    lines.push('| Key | Packs | Which |');
    lines.push('|---|---|---|');
    for (const [key, ids] of [...unread.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const which =
        ids.length > 6
          ? `${ids.slice(0, 6).join(', ')} and ${ids.length - 6} more`
          : ids.join(', ');
      lines.push(`| \`${key}\` | ${ids.length} | ${which} |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Field aliases (T-382)
// ---------------------------------------------------------------------------

/**
 * One-direction rewrite map for stored form-data keys: old key -> new key.
 *
 * Per Arjun's ruling (13 Oct 2026, 8cfbce3, handoff/tickets/T-374-*.md,
 * "two alias maps, not one"): `FIELD_ALIASES` (T-382) rewrites a stored key
 * on read, in one direction only. It is NOT the skeleton slot lookup:
 * `SLOT_ALIASES` (ADR-025 L102) resolves a skeleton slot against a pack's own
 * key in either direction, never writes to form data, and lands separately
 * with T-374.
 */
export const FIELD_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  advocate_enrolment: 'advocate_enrollment',
  // T-451 alias, remove in the post-v1 cleanup
  bhajan_lal_categories_invoked: 'quashing_categories_invoked',
});

/**
 * Old keys in {@link FIELD_ALIASES} that are deleted after aliasing, so nothing
 * downstream (the verifier included) sees two keys for one fact (Arjun, 15 Oct
 * 2026, T-451). `advocate_enrolment` is not listed: T-382 keeps the old key.
 */
// T-451 alias, remove in the post-v1 cleanup
const REPLACED_FIELD_ALIAS_KEYS: ReadonlySet<string> = new Set(['bhajan_lal_categories_invoked']);

/**
 * Stored option ids renamed by Ajay (T-245 file, T-451 answers, db89fdde):
 * pack id -> field key -> (old option id -> new option id). The old value is
 * replaced. Applied only for that pack (Arjun, 15 Oct 2026): fir_quashing's
 * ids are not touched.
 */
// T-451 alias, remove in the post-v1 cleanup
export const OPTION_VALUE_ALIASES: Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>
> = Object.freeze({
  quashing_528_bnss: Object.freeze({
    grounds_for_quashing: Object.freeze({
      no_offence_disclosed_bhajan_lal_cat_1: 'no_offence_disclosed',
      ingredients_not_made_out_bhajan_lal_cat_2: 'ingredients_not_made_out',
      facts_absurd_inherently_improbable_bhajan_lal_cat_3: 'facts_absurd_inherently_improbable',
      express_legal_bar_bhajan_lal_cat_4: 'express_legal_bar',
      civil_dispute_criminal_colour_bhajan_lal_cat_5: 'civil_dispute_criminal_colour',
      mala_fide_personal_vendetta_bhajan_lal_cat_6: 'mala_fide_personal_vendetta',
      procedural_illegality_bhajan_lal_cat_7: 'procedural_illegality',
    }),
  }),
  // T-451 alias, remove in the post-v1 cleanup
  gpa: Object.freeze({
    includes_power_to_sell: Object.freeze({
      yes_flag_suraj_lamp_warning: 'yes_flag_title_warning',
    }),
  }),
});

/**
 * Maps one stored answer through `map`: a string, each string in an array, or
 * each key of a plain object (`{ option_id: true }`; an existing new key wins
 * over a renamed old one). Anything else is returned unchanged. Never mutates
 * `value`.
 */
function mapOptionValue(value: unknown, map: Readonly<Record<string, string>>): unknown {
  const has = (k: string): boolean => Object.prototype.hasOwnProperty.call(map, k);
  if (typeof value === 'string') return has(value) ? map[value] : value;
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' && has(v) ? map[v] : v));
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    // An own key such as `__proto__` (from JSON.parse) is copied as a key, never set as the prototype.
    const put = (k: string, v: unknown): void => {
      Object.defineProperty(out, k, {
        value: v,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    };
    for (const [k, v] of Object.entries(src)) if (!has(k)) put(k, v);
    for (const [k, v] of Object.entries(src)) {
      if (has(k) && !Object.prototype.hasOwnProperty.call(out, map[k])) put(map[k], v);
    }
    return out;
  }
  return value;
}

/**
 * Returns a shallow copy of `data` where, for each `old -> new` pair in
 * {@link FIELD_ALIASES}, the value under `old` is copied to `new` when `old`
 * is present and `new` is absent. Presence means an own property, so an
 * explicit `undefined`/`null` under `new` counts as present and is not
 * overwritten.
 *
 * Old keys in `REPLACED_FIELD_ALIAS_KEYS` (T-451) are then deleted from the
 * copy, whether or not they were copied; other old keys (T-382) are kept.
 * Then, when the pack is in {@link OPTION_VALUE_ALIASES}, a stored answer under
 * one of that pack's keys has its old option ids replaced by the new ones. The
 * pack is `packId` when given (non-empty), else the stored `template_id`; with
 * neither, no option id is mapped.
 *
 * Never overwrites `new`, never mutates `data`.
 *
 * Non-object input: `null` or `undefined` yields a new empty object `{}`;
 * any other non-object (string, number, boolean) or an array is returned
 * unchanged (same reference, not copied).
 */
export function applyFieldAliases(
  data: Record<string, unknown>,
  packId?: string | null,
): Record<string, unknown> {
  if (data === null || data === undefined) return {};
  if (typeof data !== 'object' || Array.isArray(data)) return data;
  const out: Record<string, unknown> = { ...data };
  for (const [oldKey, newKey] of Object.entries(FIELD_ALIASES)) {
    if (
      Object.prototype.hasOwnProperty.call(out, oldKey) &&
      !Object.prototype.hasOwnProperty.call(out, newKey)
    ) {
      out[newKey] = out[oldKey];
    }
    if (REPLACED_FIELD_ALIAS_KEYS.has(oldKey)) delete out[oldKey];
  }
  const pack =
    typeof packId === 'string' && packId.trim() !== ''
      ? packId.trim()
      : typeof out.template_id === 'string'
        ? out.template_id.trim()
        : '';
  const packMaps = Object.prototype.hasOwnProperty.call(OPTION_VALUE_ALIASES, pack)
    ? OPTION_VALUE_ALIASES[pack]
    : undefined;
  if (packMaps) {
    for (const [key, map] of Object.entries(packMaps)) {
      if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = mapOptionValue(out[key], map);
    }
  }
  return out;
}
