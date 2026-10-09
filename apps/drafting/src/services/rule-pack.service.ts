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
  };
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

/** For tests: forget the packs already read. */
export function clearRulePackCache(): void {
  cache.clear();
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
