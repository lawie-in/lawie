/**
 * T-489: the mandamus form asks for the statute that imposes the duty and for the grievance.
 * Ajay's signed text: handoff/legal/T-245-old-new-law-switch-signed.md, section "T-489", ref 8e85ec44;
 * alias ruling f68d5592. Strings below are typed here on purpose, byte for byte.
 *
 *  AC1  Mandamus asks both fields (exact label, help, placeholder; optional); statutory_duty is gone.
 *  AC2  The draft uses them: cause title lines, and the body prompt's six instructions + Prayer.
 *  AC3  Empty keeps the signed T-479 blanks.
 *  AC4  An old statutory_duty answer fills statute_invoked; no other pack changes.
 *
 * Real loadRulePack / loadTemplateConfig / buildBrief / formDataFromBrief / ledgerSkeletonBrief /
 * buildPlaceholderContext / buildAIUserPrompt. No model call and no database.
 */
import './setupEnv';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import type { LedgerFact } from '@lawie/shared';

import { formDataFromBrief, ledgerSkeletonBrief } from '../services/brief-drafter';
import { buildBrief, buildChecklist, type Brief, type GivenValue } from '../services/intake-brief';
import { applyFieldAliases, FIELD_ALIASES, loadRulePack } from '../services/rule-pack.service';
import {
  buildAIUserPrompt,
  buildPlaceholderContext,
  clearConfigCache,
  loadTemplateConfig,
  renderTemplateSection,
} from '../services/template-engine.service';

const STATUTE_BLANK = '[To be confirmed: statute or rule imposing the duty]';
const GRIEVANCE_BLANK = '[To be confirmed: grievance in brief]';

const GENERAL_LINE =
  'Each paragraph uses only facts from the brief. A missing fact is printed as its [To be confirmed: …] blank.';
const INSTRUCTIONS = [
  "State who the petitioner is and how the authority's failure affects the petitioner directly.",
  "State the petitioner's legal right to have the act done, as it arises from {statute_invoked}.",
  'State that the respondent is a public authority under a legal duty to do the act, and the source of that duty in {statute_invoked}.',
  'State the date and the manner in which the petitioner asked the respondent to act, and that the respondent has refused or failed to act. If no demand is given, write: That the petitioner made a representation to the respondent on [To be confirmed: date and mode of the demand made to the respondent].',
  'State how long the act has been pending, using only dates from the brief.',
  'State that the petitioner has no other equally efficacious remedy. If the brief names one that was used, say what became of it.',
];
const NO_JUDGMENT =
  'Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].';

const BASE = { petitioner_name: 'Sample Petitioner', respondent_authority: 'Sample Authority' };
type Values = Record<string, string>;

function causeTitle(form: Record<string, unknown>): string {
  clearConfigCache();
  const config = loadTemplateConfig('mandamus')!;
  const ctx = buildPlaceholderContext(config, form, { advocateName: 'Adv. A' });
  const s = config.document_structure.sections.find((x) => x.section_id === 'cause_title')!;
  return renderTemplateSection(s, ctx).content;
}

function briefFor(values: Values): Brief {
  const pack = loadRulePack('mandamus')!;
  const given: GivenValue[] = Object.entries(values).map(([key, value]) => ({
    key,
    value,
    source: 'user' as const,
  }));
  return buildBrief({
    kind: { id: 'mandamus', name: 'mandamus', court_document: true },
    checklist: buildChecklist(pack),
    values: given,
  });
}

const formOfBrief = (b: Brief) => formDataFromBrief(b, loadTemplateConfig('mandamus')!, 'en');
const viaForm = (v: Values) => causeTitle(v);
const viaBrief = (v: Values) => causeTitle(formOfBrief(briefFor(v)));
const viaLedger = (v: Values) => {
  const facts = Object.entries(v).map(
    ([k, x]) =>
      ({ key: k, label: k, type: 'text', display: x, source: 'asked' }) as never as LedgerFact,
  );
  return causeTitle(
    formDataFromBrief(
      ledgerSkeletonBrief(briefFor({}), facts),
      loadTemplateConfig('mandamus')!,
      'en',
    ),
  );
};

const mandamus = JSON.parse(
  readFileSync(join(__dirname, '../config/document-rules/mandamus.json'), 'utf8'),
);

// ── AC1: the form ───────────────────────────────────────────────────────────────────────────

describe('T-489 AC1: the mandamus form', () => {
  const fields = mandamus.form_schema.fields ?? mandamus.form_schema;

  it("statute_invoked has Ajay's label, help and placeholder, and is optional", () => {
    expect(fields.statute_invoked).toEqual({
      type: 'string',
      label: 'Law or rule that places the duty on the authority',
      required: false,
      help: 'The Act, rule, scheme or notification under which the authority must act, with the section or rule if known.',
      placeholder: 'e.g. Section 12 of the … Act / Rule 5 of the … Rules',
    });
  });

  it("grievance_summary has Ajay's label, help and placeholder, and is optional", () => {
    expect(fields.grievance_summary).toEqual({
      type: 'string',
      label: 'What the authority has failed to do',
      required: false,
      help: 'One or two lines: the act the authority was bound to do and has not done.',
      placeholder: "e.g. failure to decide the petitioner's application dated … for …",
    });
  });

  it('statutory_duty is not a form field, and refusal_or_inaction is kept', () => {
    expect(fields).not.toHaveProperty('statutory_duty');
    expect(fields).toHaveProperty('refusal_or_inaction');
  });

  it('the checklist built from the pack asks both fields and not statutory_duty', () => {
    const keys = buildChecklist(loadRulePack('mandamus')!).map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['statute_invoked', 'grievance_summary']));
    expect(keys).not.toContain('statutory_duty');
  });
});

// ── AC2 + AC3: the cause title ──────────────────────────────────────────────────────────────

describe.each([
  ['form path', viaForm],
  ['brief path', viaBrief],
  ['ledger path', viaLedger],
])('T-489 cause title, %s', (name, render) => {
  const given: Values = {
    ...BASE,
    statute_invoked: 'Section 12 of the Sample Act',
    grievance_summary: 'failure to decide the application',
  };

  it('with values the lines print the values', () => {
    const t = render(given);
    expect(t).toContain('AND IN THE MATTER OF: Section 12 of the Sample Act;');
    expect(t).toContain('AND IN THE MATTER OF: failure to decide the application;');
    expect(t).not.toContain(STATUTE_BLANK);
    expect(t).not.toContain(GRIEVANCE_BLANK);
  });

  it('empty prints the signed blanks, byte for byte', () => {
    const t = render(BASE);
    expect(t).toContain(`AND IN THE MATTER OF: ${STATUTE_BLANK};`);
    expect(t).toContain(`AND IN THE MATTER OF: ${GRIEVANCE_BLANK};`);
  });

  it(`${name}: no MISSING or raw braces`, () => {
    expect(render(given)).not.toMatch(/MISSING|\{|\}/);
    expect(render(BASE)).not.toMatch(/MISSING|\{|\}/);
  });
});

// ── AC2: the body prompt ────────────────────────────────────────────────────────────────────

describe('T-489 body prompt', () => {
  const body = (form: Record<string, unknown>) => {
    clearConfigCache();
    const config = loadTemplateConfig('mandamus')!;
    const ctx = buildPlaceholderContext(config, form, { advocateName: 'Adv. A' });
    const s = config.document_structure.sections.find((x) => x.type === 'ai_generated')!;
    return buildAIUserPrompt(s, ctx);
  };
  const filled = body({
    ...BASE,
    statute_invoked: 'Section 12 of the Sample Act',
    grievance_summary: 'failure to decide the application',
  });

  it('carries the general line, then the six instructions in order, byte for byte', () => {
    let at = filled.indexOf(GENERAL_LINE);
    expect(at).toBeGreaterThanOrEqual(0);
    INSTRUCTIONS.forEach((ins, i) => {
      const filledIns = ins.replace(/\{statute_invoked\}/g, 'Section 12 of the Sample Act');
      const found = filled.indexOf(filledIns, at + 1);
      expect({ n: i + 1, found: found > at }).toEqual({ n: i + 1, found: true });
      at = found;
    });
  });

  it('{statute_invoked} and {grievance_summary} are filled; the Prayer names the grievance', () => {
    expect(filled).toContain(
      'Prayer: mandamus directing the respondent to do the act named in failure to decide the application within a time the Court may fix.',
    );
    expect(filled).toContain('as it arises from Section 12 of the Sample Act.');
    expect(filled).not.toMatch(/\{statute_invoked\}|\{grievance_summary\}/);
  });

  it('with no values the T-479 blanks stand in, with no raw braces', () => {
    const empty = body(BASE);
    expect(empty).toContain(`as it arises from ${STATUTE_BLANK}.`);
    expect(empty).toContain(`named in ${GRIEVANCE_BLANK} within a time`);
    expect(empty).not.toMatch(/\{statute_invoked\}|\{grievance_summary\}/);
  });

  it('the old structure items are gone', () => {
    for (const old of [
      'Statutory duty — provision verbatim',
      'Legal right of petitioner',
      'Alternative remedy',
    ]) {
      expect(filled).not.toContain(old);
    }
  });

  it('names no judgment, and the no-judgment line is last in promptInstructions (t448)', () => {
    expect(mandamus.prompt_context.promptInstructions).toEqual([NO_JUDGMENT]);
    expect(filled).toContain(NO_JUDGMENT);
    expect(filled).not.toMatch(/\bv\.? |\bvs\.?\b|AIR \d{4}|SCC|Maneka|Bhajan/i);
  });
});

// ── AC4: the read-time alias ────────────────────────────────────────────────────────────────

describe('T-489 AC4: statutory_duty -> statute_invoked', () => {
  const OLD = 'Old saved duty text';

  it('the alias map has statutory_duty -> statute_invoked', () => {
    expect(FIELD_ALIASES.statutory_duty).toBe('statute_invoked');
  });

  it('form path: an old answer fills statute_invoked, and the old key is not kept', () => {
    const out = applyFieldAliases({ ...BASE, statutory_duty: OLD }, 'mandamus');
    expect(out.statute_invoked).toBe(OLD);
    expect(out).not.toHaveProperty('statutory_duty');
    // documents.routes.ts applies the alias to the posted form before it renders.
    expect(causeTitle(out)).toContain(`AND IN THE MATTER OF: ${OLD};`);
  });

  it('form path: statute_invoked wins when both are given', () => {
    const t = causeTitle(
      applyFieldAliases({ ...BASE, statutory_duty: OLD, statute_invoked: 'New text' }, 'mandamus'),
    );
    expect(t).toContain('AND IN THE MATTER OF: New text;');
    expect(t).not.toContain(OLD);
  });

  it('the old answer also fills the body prompt', () => {
    clearConfigCache();
    const config = loadTemplateConfig('mandamus')!;
    const form = applyFieldAliases({ ...BASE, statutory_duty: OLD }, 'mandamus');
    const ctx = buildPlaceholderContext(config, form, {});
    const s = config.document_structure.sections.find((x) => x.type === 'ai_generated')!;
    expect(buildAIUserPrompt(s, ctx)).toContain(`as it arises from ${OLD}.`);
  });

  it('stored-brief path: a saved statutory_duty item fills statute_invoked', () => {
    // A pre-T-489 brief has the old item and none of the new ones.
    const b = briefFor(BASE);
    const item = { ...b.items[0], key: 'statutory_duty', label: 'Statutory Duty', value: OLD };
    const kept = b.items.filter((i) => i.key !== 'statute_invoked');
    const old: Brief = { ...b, items: [...kept, item] };
    expect(causeTitle(formOfBrief(old))).toContain(`AND IN THE MATTER OF: ${OLD};`);
  });

  it('stored-brief path: statute_invoked wins when both are on the brief', () => {
    const b = briefFor({ ...BASE, statute_invoked: 'New text' });
    const item = { ...b.items[0], key: 'statutory_duty', label: 'Statutory Duty', value: OLD };
    const t = causeTitle(formOfBrief({ ...b, items: [...b.items, item] }));
    expect(t).toContain('AND IN THE MATTER OF: New text;');
    expect(t).not.toContain(OLD);
  });

  it('ledger path: KNOWN LIMIT, pinned as it is. ledgerSkeletonBrief keeps only current checklist keys, so an old statutory_duty fact is not carried and the signed blank prints', () => {
    const t = viaLedger({ ...BASE, statutory_duty: OLD });
    expect(t).toContain(`AND IN THE MATTER OF: ${STATUTE_BLANK};`);
    expect(t).not.toContain(OLD);
  });

  describe('no other pack changes', () => {
    const dir = join(__dirname, '../config/document-rules');
    const others = readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== 'mandamus.json')
      .map((f) => f.replace(/\.json$/, ''));

    it('there are other packs to check', () => {
      expect(others.length).toBeGreaterThan(50);
    });

    it('no other pack has a statutory_duty form field, so real input never carries the alias key', () => {
      const offenders = others.filter((id) => {
        const p = JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8'));
        return JSON.stringify(p.form_schema ?? {}).includes('"statutory_duty"');
      });
      expect(offenders).toEqual([]);
    });

    it('real input (every form field filled) renders identically with and without the alias step', () => {
      for (const id of others) {
        const p = JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8'));
        const fields = p.form_schema?.fields ?? p.form_schema ?? {};
        const form: Record<string, unknown> = {};
        for (const k of Object.keys(fields)) form[k] = `sample ${k}`;
        const aliased = applyFieldAliases(form, id);
        // statute_invoked / grievance_summary stay whatever the pack itself declares
        expect({ id, keys: Object.keys(aliased).sort() }).toEqual({
          id,
          keys: Object.keys(form).sort(),
        });
        for (const k of Object.keys(form)) {
          if (k === 'statute_invoked') continue;
          expect({ id, k, v: aliased[k] }).toEqual({ id, k, v: form[k] });
        }
      }
    });
  });
});
