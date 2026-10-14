/**
 * T-440: a date answered "Not known" prints "[To be confirmed: <what it is the date of,
 * lower case>]" on every path (Ajay, 49a8eaa addendum; a9bc957 Q1-Q4; 4b46053; 69ac17a).
 * No database, no model call.
 *
 * AC1 blank on the template, brief, ledger and D1 paths; AC2 nothing computed from an
 * unknown date; AC3 the signed prompt line and the "DATES MARKED AS NOT KNOWN:" block;
 * AC4 the same blank on all paths.
 */
import './setupEnv';

import type { LedgerFact } from '@lawie/shared';

import {
  drafterBrief,
  guidedDrafterBrief,
  formDataFromBrief,
  isNotKnownDate,
  ledgerDrafterFacts,
  ledgerSkeletonBrief,
  notKnownDateKeys,
  packTexts,
} from '../services/brief-drafter';
import {
  DRAFTER_D1_SYSTEM_PROMPT,
  DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT,
  DRAFTER_LEDGER_SYSTEM_PROMPT,
  DRAFTER_PACK_SYSTEM_PROMPT,
  DRAFTER_REPAIR_SYSTEM_PROMPT,
  NOT_KNOWN_DATE_LINE,
} from '../services/drafter.prompts';
import { packOptionIds, renderDraft, skeletonValueLists } from '../services/draft-renderer';
import { loadAvermentLists } from '../services/averments';
import { buildBrief, buildChecklist, type Brief, type GivenValue } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { S138_LINE_TEXTS, formatS138Line, s138DateChecks } from '../services/s138-date-checks';
import {
  buildAISystemPrompt,
  buildAIUserPrompt,
  buildPlaceholderContext,
  clearConfigCache,
  loadTemplateConfig,
  replacePlaceholders,
} from '../services/template-engine.service';
import { missingAsBlanks } from '../utils/missingAsBlanks';
import { fact, loadFixtureSkeleton, regularBase } from './fixtures/t373';

// Ajay's signed line, typed here as signed (a9bc957), so a reword of the constant fails.
const SIGNED_LINE =
  'A date marked as not known is unknown: copy its blank exactly as given, never state or infer the date, and do not say whether any period, deadline or limitation that depends on it is met or missed.';
const ARREST_BLANK = '[To be confirmed: date of arrest]';
const NOTICE_BLANK = '[To be confirmed: date the notice is sent]';
const MEMO_BLANK = '[To be confirmed: date the return memo was received]';

const BAIL = 'bail_regular';
const S138 = 'legal_notice_s138';
const kind = (id: string) => ({ id, name: id, court_document: id === BAIL });
const user = (key: string, value: string): GivenValue => ({ key, value, source: 'user' });
const checklistOf = (id: string) => buildChecklist(loadRulePack(id)!);
const briefOf = (id: string, values: GivenValue[]): Brief =>
  buildBrief({ kind: kind(id), checklist: checklistOf(id), values });

const arrestNotKnown = () => briefOf(BAIL, [user('arrest_date', 'Not known')]);
const arrestEmpty = () => briefOf(BAIL, []);
const arrestTyped = () => briefOf(BAIL, [user('arrest_date', '2026-06-10')]);

describe('the signed line', () => {
  it('the exported constant is byte-exact', () => {
    expect(NOT_KNOWN_DATE_LINE).toBe(SIGNED_LINE);
  });

  it.each([
    ['PACK', DRAFTER_PACK_SYSTEM_PROMPT],
    ['REPAIR', DRAFTER_REPAIR_SYSTEM_PROMPT],
    ['LEDGER', DRAFTER_LEDGER_SYSTEM_PROMPT],
    ['LEDGER_REPAIR', DRAFTER_LEDGER_REPAIR_SYSTEM_PROMPT],
    ['D1', DRAFTER_D1_SYSTEM_PROMPT],
  ])('AC3: %s carries it exactly once', (_n, prompt) => {
    expect(prompt.split(SIGNED_LINE)).toHaveLength(2);
  });

  it('AC3: it ends the DATES rule (brief, ledger) and D1 rule 3', () => {
    const line = (p: string, re: RegExp) => p.split('\n').find((l) => re.test(l))!;
    expect(line(DRAFTER_PACK_SYSTEM_PROMPT, /^3\. DATES/).endsWith(SIGNED_LINE)).toBe(true);
    expect(line(DRAFTER_LEDGER_SYSTEM_PROMPT, /^3\. DATES/).endsWith(SIGNED_LINE)).toBe(true);
    expect(line(DRAFTER_D1_SYSTEM_PROMPT, /^3\. ADVOCATE CLAUSES/).endsWith(SIGNED_LINE)).toBe(
      true,
    );
  });

  it('AC3: the template system prompt carries it in rule 7', () => {
    clearConfigCache();
    const config = loadTemplateConfig(S138)!;
    const p = buildAISystemPrompt(config);
    expect(p.split(SIGNED_LINE)).toHaveLength(2);
    expect(p.split('\n').find((l) => l.startsWith('7. '))).toContain(SIGNED_LINE);
  });
});

describe('brief path', () => {
  it('a date answered "Not known" is a not-known date; empty and typed ones are not', () => {
    expect(notKnownDateKeys(arrestNotKnown())).toEqual(['arrest_date']);
    expect(notKnownDateKeys(arrestEmpty())).toEqual([]);
    expect(notKnownDateKeys(arrestTyped())).toEqual([]);
    const item = arrestNotKnown().items.find((i) => i.key === 'arrest_date')!;
    expect(isNotKnownDate(item)).toBe(true);
  });

  it('AC1: the Drafter is told the date is unknown, with the lower-case meaning blank', () => {
    const u = drafterBrief(arrestNotKnown(), null).unknown;
    expect(u).toContainEqual({ what: 'Date of arrest', blank: ARREST_BLANK, not_known: true });
    expect(JSON.stringify(drafterBrief(arrestNotKnown(), null).dates)).not.toContain('2026');
  });

  it('a date merely left empty is not marked not_known', () => {
    const u = drafterBrief(arrestEmpty(), null).unknown;
    expect(u.some((x) => x.not_known)).toBe(false);
  });

  it('Q3: another optional fact answered "Not known" gives no fact and no not_known blank', () => {
    const b = briefOf(BAIL, [user('dependants', 'Not known')]);
    const item = b.items.find((i) => i.key === 'dependants');
    expect(item?.asked_empty).toBe(true);
    expect(notKnownDateKeys(b)).toEqual([]);
    const u = drafterBrief(b, null).unknown;
    expect(u.some((x) => x.not_known)).toBe(false);
    expect(JSON.stringify(u)).not.toMatch(/dependants/i);
  });

  it('AC1: formDataFromBrief holds the blank, not a guess, not "_____"', () => {
    clearConfigCache();
    const config = loadTemplateConfig(S138)!;
    const b = briefOf(S138, [user('notice_sent_date', 'Not known')]);
    const data = formDataFromBrief(b, config, 'en');
    expect(data.notice_sent_date).toBe(NOTICE_BLANK);
    expect(JSON.stringify(data)).not.toContain('_____');
  });
});

describe('ledger path', () => {
  const held = (): LedgerFact[] => regularBase();
  const run = (nk: Brief | undefined) =>
    ledgerDrafterFacts(held(), checklistOf(BAIL), null, true, [], null, nk).missing.find(
      (m) => m.key === 'arrest_date',
    );

  it('AC1: a Not known date is missing, with the lower-case blank, marked not_known', () => {
    expect(run(arrestNotKnown())).toEqual({
      key: 'arrest_date',
      label: 'Date of arrest',
      write: '{{MISSING: date of arrest}}',
      not_known: true,
    });
  });

  it('Q3/Q4: a date merely empty (optional) is not missing and has no not_known', () => {
    expect(run(arrestEmpty())).toBeUndefined();
    expect(run(undefined)).toBeUndefined();
  });

  it('AC1: the skeleton brief gives the same lower-case meaning blank', () => {
    const sk = ledgerSkeletonBrief(arrestNotKnown(), held());
    expect(sk.items.find((i) => i.key === 'arrest_date')!.placeholder).toBe(
      '{{MISSING: date of arrest}}',
    );
  });
});

describe('D1 path', () => {
  const render = (facts: LedgerFact[], nk?: Brief) => {
    const pack = loadRulePack(BAIL)!;
    const skeleton = loadFixtureSkeleton(BAIL);
    const lists = loadAvermentLists(BAIL);
    const checklist = buildChecklist(pack);
    const output = {
      paragraphs: skeleton.clauses.map((c) => ({
        clauseId: c.id,
        factRefs: [] as string[],
        text: '',
        items: [],
      })),
    };
    const r = renderDraft({
      skeleton,
      output,
      facts,
      labels: Object.fromEntries(checklist.map((i) => [i.key, i.label])),
      clauseLabels: Object.fromEntries(pack.mandatoryClauses.map((m) => [m.id, m.title])),
      checklist,
      notKnownDates: nk,
      optionIds: packOptionIds(pack.facts),
      valueLists: skeletonValueLists(skeleton, lists),
      verifier: { unresolved: [], lists, packText: packTexts(pack), skeleton: [] },
    });
    return r.paragraphs.find((p) => p.clauseId === 'arrested_on')?.text;
  };

  it('AC1: "Not known" prints the arrested_on clause with the blank', () => {
    const t = render(regularBase(), arrestNotKnown());
    // Ajay 69ac17a (b): exactly this, once the ledger token is printed as a blank.
    expect(missingAsBlanks(t!)).toBe(
      'The applicant was arrested on [To be confirmed: date of arrest].',
    );
  });

  it('merely empty leaves the clause out', () => {
    expect(render(regularBase(), arrestEmpty())).toBeUndefined();
    expect(render(regularBase())).toBeUndefined();
  });

  it('a typed date prints as typed, no blank', () => {
    const t = render([
      ...regularBase(),
      fact('arrest_date', '10 June 2026', { type: 'date', value: '2026-06-10' }),
    ]);
    expect(t).toContain('arrested on 10 June 2026');
  });
});

describe('AC4: the same blank words on every path', () => {
  it('brief, ledger and D1 name the date the same way', () => {
    const brief = drafterBrief(arrestNotKnown(), null).unknown.find((u) => u.not_known)!.blank;
    const ledger = ledgerDrafterFacts(
      regularBase(),
      checklistOf(BAIL),
      null,
      true,
      [],
      null,
      arrestNotKnown(),
    ).missing.find((m) => m.key === 'arrest_date')!.write;
    const inner = (s: string) => s.replace(/^(\[To be confirmed: |\{\{MISSING: )|(\]|\}\})$/g, '');
    expect(inner(brief)).toBe('date of arrest');
    expect(inner(ledger)).toBe(inner(brief));
  });
});

describe('template form path', () => {
  const config = () => {
    clearConfigCache();
    return loadTemplateConfig(S138)!;
  };
  const header = (form: Record<string, unknown>, extra?: { notKnownDates?: string[] }) => {
    const c = config();
    const ctx = buildPlaceholderContext(
      c,
      { applicant_name: 'A', respondent_name: 'B', ...form },
      extra,
    );
    const h = c.document_structure.sections.find((s) => s.section_id === 'header') as {
      template: string;
    };
    return { ctx, text: replacePlaceholders(h.template, ctx) };
  };
  const dateLine = (t: string) => t.split('\n').find((l) => l.startsWith('Date:'));

  it.each([
    ['empty', ''],
    ['absent', undefined],
    ['Not known', 'Not known'],
    ['blank', NOTICE_BLANK],
  ])('Q1/AC1: notice date %s prints the blank, never today', (_n, v) => {
    const { text } = header(v === undefined ? {} : { notice_sent_date: v });
    expect(dateLine(text)).toBe(`Date: ${NOTICE_BLANK}`);
    expect(text).not.toContain('_____');
  });

  it('Q1: a typed notice date prints formatted', () => {
    expect(dateLine(header({ notice_sent_date: '2026-04-03' }).text)).toBe('Date: 3 April 2026');
  });

  it('AC3: the user prompt lists a Not known date, with its blank, under the signed heading', () => {
    const c = config();
    const { ctx } = header({}, { notKnownDates: ['memo_received_date'] });
    const body = c.document_structure.sections.find((s) => s.type === 'ai_generated')!;
    const p = buildAIUserPrompt(body, ctx);
    expect(p).toContain(`DATES MARKED AS NOT KNOWN:\n- ${MEMO_BLANK}`);
  });

  it('AC3: a date typed "Not known" is listed too', () => {
    const c = config();
    const { ctx } = header({ notice_sent_date: 'Not known' });
    const body = c.document_structure.sections.find((s) => s.type === 'ai_generated')!;
    expect(buildAIUserPrompt(body, ctx)).toContain(`DATES MARKED AS NOT KNOWN:\n- ${NOTICE_BLANK}`);
  });

  it('Q4: an empty date gets no prompt note; a printed one gets the blank', () => {
    const c = config();
    const { ctx } = header({});
    const body = c.document_structure.sections.find((s) => s.type === 'ai_generated')!;
    expect(buildAIUserPrompt(body, ctx)).not.toContain('DATES MARKED AS NOT KNOWN');
    expect(ctx.dishonour_date).toBe('[To be confirmed: date of dishonour]');
    expect(ctx.cheque_validity_date ?? '').toBe('');
  });

  it('Q4: a date the template does not print stays empty (no blank asserting a fact)', () => {
    const { ctx } = header({});
    const dateIds = (config().form_schema.steps ?? [])
      .flatMap((s) => s.fields)
      .filter((f) => f.type === 'date')
      .map((f) => f.field_id);
    for (const id of dateIds) {
      expect(
        ['', undefined, NOTICE_BLANK].includes(ctx[id]) || /^\[To be confirmed: /.test(ctx[id]),
      ).toBe(true);
    }
  });
});

describe('Q2 and AC2: the s.138 checks', () => {
  it('check blanks are lower case', () => {
    const line = formatS138Line('A4', {}, ['L1', 'L3']);
    expect(line).toContain('[To be confirmed: date on the cheque]');
    expect(line).toContain('[To be confirmed: date the cheque was presented to the bank]');
    expect(line).not.toMatch(/To be confirmed: [A-Z]/);
  });

  it('AC2: with the dates unknown no period is computed (A4 and B5)', () => {
    const r = s138DateChecks([], S138);
    expect(r.a.line).toBe('A4');
    expect(r.a.end).toBeNull();
    expect(r.b.line).toBe('B5');
    expect(r.b.end).toBeNull();
    expect(r.b.text.startsWith(S138_LINE_TEXTS.B5)).toBe(true);
    expect(r.b.text).toContain('[To be confirmed: date the return memo was received]');
    expect(r.b.text).not.toMatch(/\d{4}/);
  });
});

describe('guided path (no pack)', () => {
  it('carries no not_known entry: asked_empty only comes from pack ask_when_empty facts', () => {
    const b = buildBrief({
      kind: { id: 'guided', name: 'Guided', court_document: false },
      checklist: [],
      values: [user('arrest_date', 'Not known')],
    });
    expect(notKnownDateKeys(b)).toEqual([]);
    const g = guidedDrafterBrief(b, null);
    expect(g.unknown.some((u) => u.not_known)).toBe(false);
    expect(JSON.stringify(g)).not.toContain('not_known');
  });
});
