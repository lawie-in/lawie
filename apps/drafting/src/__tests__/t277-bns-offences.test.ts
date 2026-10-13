/**
 * T-277 - corrected BNS offences table and every reader of it (legal content, Ajay CLO,
 * 12 Oct 2026; Arjun CTO required tests).
 *
 * Pins:
 *  - the signed table byte for byte (SHA-256) and its 317 rows;
 *  - R2 resolution order (exact key -> nearest ancestor / variant -> parent -> not an offence);
 *  - R1 default bail (only an exact-key max_years drives the 60/90-day period);
 *  - R3 null / non-"yes"/"no" is "Depends", never false;
 *  - R4 bns-bailability.json deleted, classification generated from the table;
 *  - R5 one shared whitelist resolver for preflight (hard block) and validator (soft flag);
 *  - Q3 / Q4 prompt line and parent-row court level;
 *  - the pack and fixture lines Ajay signed.
 *
 * Expected values are read from the signed JSON itself, never from the resolver, so a wrong
 * resolver cannot make its own test pass. Ajay's exact texts are written out as literals.
 */
import './setupEnv';
import './setupDb';

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

import { checkBailEligibility } from '../services/bail-check.service';
import {
  ATTRIBUTE_DEPENDS,
  BNS_CLASSIFICATION,
  BNS_OFFENCE_KEYS,
  citationResolves,
  resolveBnsKey,
  resolveOffence,
  WITH_COURT_PERMISSION,
} from '../services/bns-offence-resolver';
import { preflightCheck } from '../services/preflight.service';
import { getSectionDetail } from '../services/sections.service';
import {
  buildAISystemPrompt,
  buildAIUserPrompt,
  buildPlaceholderContext,
  classifySectionsBailability,
  loadTemplateConfig,
} from '../services/template-engine.service';
import { calculateTimeline } from '../services/timeline.service';
import { validateBNSWhitelist } from '../services/validator';

// ── Paths and Ajay's exact texts ─────────────────────────────────────────────

const ROOT = path.join(__dirname, '..', '..'); // apps/drafting
const REPO = path.join(ROOT, '..', '..');
const CONFIG = path.join(ROOT, 'src', 'config');
const TABLE_PATH = path.join(CONFIG, 'bns-offences.json');
const SIGNED_MD = path.join(REPO, 'handoff', 'legal', 'T-277-bns-offences-corrected-signed.md');

const SIGNED_SHA = '5f0ac29ad09aaed919826275cf22c425766c8dc7196dd089bfd5c8dacecb07de';

const DEPENDS_187 = 'Depends on the offence. Check BNSS section 187.';
const R1_NOTE = (n: string): string => `Section ${n}: ${DEPENDS_187}`;
const DEPENDS_SCHEDULE = 'Depends. Check the First Schedule.';
const NOT_AN_OFFENCE = 'This section does not create an offence. Check the Gazette.';
/** Ajay Q6: note for a not-an-offence section in the timeline. */
const LEFT_OUT = (n: string): string =>
  `Section ${n} does not create an offence, so it was left out of this period.`;
/** Ajay T-278 (f4244ec + Addendum 1): a number with no BNS row or parent row. */
const NOT_IN_TABLE = (n: string): string =>
  `Section ${n} was not found in the BNS offences table, so it was left out of this period. Check the Gazette.`;
const R4_PROMPT_LINE =
  'A section in neither list: do not say whether it is bailable or cognizable.';
const Q3_PROMPT_LINE =
  'A sub-section of a listed section may be cited, for example 103(1) or 316(2).';

interface Variant {
  offence: string;
  punishment: string;
  cognizable: string;
  bailable: string;
  compoundable: string;
}
interface Row {
  title: string;
  max_years: number | null;
  bailable: boolean | null;
  cognizable: boolean | null;
  compoundable: boolean | null;
  variants?: Record<string, Variant>;
}

const tableRaw = fs.readFileSync(TABLE_PATH);
const OFFENCES = (JSON.parse(tableRaw.toString('utf-8')) as { offences: Record<string, Row> })
  .offences;
const KEYS = Object.keys(OFFENCES);

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function yesNo(v: string): boolean | null {
  return v === 'yes' ? true : v === 'no' ? false : null;
}

// ── The signed table ─────────────────────────────────────────────────────────

describe('T-277 signed table', () => {
  it('has the signed SHA-256', () => {
    expect(createHash('sha256').update(tableRaw).digest('hex')).toBe(SIGNED_SHA);
  });

  it('is identical to the json block in the signed markdown', () => {
    const md = fs.readFileSync(SIGNED_MD, 'utf-8');
    const open = md.indexOf('```json\n');
    const close = md.indexOf('\n```', open + 8);
    expect(open).toBeGreaterThan(-1);
    const block = md.slice(open + 8, close) + '\n';
    expect(createHash('sha256').update(block).digest('hex')).toBe(SIGNED_SHA);
    expect(block).toBe(tableRaw.toString('utf-8'));
  });

  it('has 317 rows, and the resolver sees every one', () => {
    expect(KEYS).toHaveLength(317);
    expect([...BNS_OFFENCE_KEYS]).toEqual(KEYS);
  });
});

// ── R2: resolution order ─────────────────────────────────────────────────────

describe('R2 resolveOffence', () => {
  it('103 is an exact key with the row values', () => {
    const r = resolveOffence('103');
    expect(r.kind).toBe('exact');
    expect(r.key).toBe('103');
    expect(r.bailable).toBe(false);
    expect(r.cognizable).toBe(true);
    expect(r.maxYears).toBe(99);
    expect(r.courtMaxYears).toBe(99);
  });

  it('103(1) has no row, so it resolves to the parent row 103 (no variants)', () => {
    const r = resolveOffence('103(1)');
    expect(r.kind).toBe('parent');
    expect(r.key).toBe('103');
    expect(r.bailable).toBe(false);
    // Q4 / R1: the parent term sets the court level only, never a period.
    expect(r.maxYears).toBeNull();
    expect(r.courtMaxYears).toBe(99);
  });

  it('316(2) resolves through the variant of row 316: non-bailable, no period', () => {
    const r = resolveOffence('316(2)');
    expect(r.kind).toBe('variant');
    expect(r.key).toBe('316(2)');
    expect(r.bailable).toBe(false);
    expect(r.cognizable).toBe(true);
    expect(r.maxYears).toBeNull();
    expect(r.courtMaxYears).toBeNull();
  });

  it('316(2)(b) strips to the variant 316(2)', () => {
    const r = resolveOffence('316(2)(b)');
    expect(r.kind).toBe('variant');
    expect(r.key).toBe('316(2)');
  });

  it('308(2)(a) strips to the variant 308(2)', () => {
    const r = resolveOffence('308(2)(a)');
    expect(r.kind).toBe('variant');
    expect(r.key).toBe('308(2)');
    expect(r.maxYears).toBeNull();
  });

  it.each(['316(1)', '308(1)'])(
    '%s: the parent has variants but none match, so it creates no offence',
    (target) => {
      const r = resolveOffence(target);
      expect(r.kind).toBe('not_an_offence');
      expect(r.key).toBeNull();
      expect(r.note).toBe(NOT_AN_OFFENCE);
      expect(r.maxYears).toBeNull();
      expect(r.courtMaxYears).toBeNull();
    },
  );

  it('61(2)(a) is itself a variant key of row 61', () => {
    const r = resolveOffence('61(2)(a)');
    expect(r.kind).toBe('variant');
    expect(r.key).toBe('61(2)(a)');
    // Every attribute of the 61(2)(a) variant is "depends on the offence ...": never false.
    expect(r.bailable).toBeNull();
    expect(r.cognizable).toBeNull();
    expect(r.bailableNote).toBe(DEPENDS_SCHEDULE);
  });

  it('238(b) is an exact key; letters inside parentheses are lowercased (238(B))', () => {
    const lower = resolveOffence('238(b)');
    const upper = resolveOffence('238(B)');
    expect(lower.kind).toBe('exact');
    expect(lower.key).toBe('238(b)');
    expect(upper.kind).toBe('exact');
    expect(upper.key).toBe('238(b)');
    expect(upper.title).toBe(lower.title);
    expect(resolveBnsKey('238(B)')).toEqual({ key: '238(b)', exact: true });
    expect(resolveOffence('238 (B)').key).toBe('238(b)');
  });

  it('125(a) resolves through the variant 125(a) of row 125', () => {
    const r = resolveOffence('125(a)');
    expect(r.kind).toBe('variant');
    expect(r.key).toBe('125(a)');
    expect(r.bailable).toBe(true);
    expect(r.maxYears).toBeNull();
  });

  it('70(2) resolves to the parent row 70 (no variants)', () => {
    const r = resolveOffence('70(2)');
    expect(r.kind).toBe('parent');
    expect(r.key).toBe('70');
    expect(r.maxYears).toBeNull();
    expect(r.courtMaxYears).toBe(OFFENCES['70'].max_years);
  });

  it.each(['114', '330(1)', '999(1)', '999', '358'])(
    '%s has no row and no parent row: not an offence',
    (target) => {
      const r = resolveOffence(target);
      expect(r.kind).toBe('not_an_offence');
      expect(r.note).toBe(NOT_AN_OFFENCE);
      expect(r.bailable).toBeNull();
      // Not an offence is its own answer, not a "Depends" one.
      expect(r.bailableNote).toBeNull();
    },
  );

  it('every table key resolves to itself, exactly, with the row values', () => {
    for (const key of KEYS) {
      const r = resolveOffence(key);
      expect(r.kind).toBe('exact');
      expect(r.key).toBe(key);
      expect(r.title).toBe(OFFENCES[key].title);
      expect(r.bailable).toBe(OFFENCES[key].bailable);
      expect(r.cognizable).toBe(OFFENCES[key].cognizable);
      expect(r.maxYears).toBe(OFFENCES[key].max_years);
    }
  });
});

// ── R3: null is "Depends", never false ───────────────────────────────────────

describe('R3 null and non-"yes"/"no" are Depends, never false', () => {
  it('every variant-only target maps yes -> true, no -> false, anything else -> null', () => {
    let checked = 0;
    for (const [rowKey, row] of Object.entries(OFFENCES)) {
      for (const [vKey, v] of Object.entries(row.variants ?? {})) {
        if (OFFENCES[vKey]) continue; // an exact row wins over a variant of the same key
        const r = resolveOffence(vKey);
        expect(r.kind).toBe('variant');
        expect(r.key).toBe(vKey);
        expect(r.title).toBe(OFFENCES[rowKey].title);
        expect(r.bailable).toBe(yesNo(v.bailable));
        expect(r.cognizable).toBe(yesNo(v.cognizable));
        if (r.bailable === null) expect(r.bailableNote).toBe(DEPENDS_SCHEDULE);
        else expect(r.bailableNote).toBeNull();
        if (r.cognizable === null) expect(r.cognizableNote).toBe(DEPENDS_SCHEDULE);
        else expect(r.cognizableNote).toBeNull();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('"yes; yes", "no; no", "depends ..." and "conditional ..." strings are not true or false', () => {
    // 78(2): bailable "yes; no", cognizable "yes; yes" in the signed table.
    const a = resolveOffence('78(2)');
    expect(a.kind).toBe('variant');
    expect(OFFENCES['78'].variants?.['78(2)'].bailable).toBe('yes; no');
    expect(OFFENCES['78'].variants?.['78(2)'].cognizable).toBe('yes; yes');
    expect(a.bailable).toBeNull();
    expect(a.cognizable).toBeNull();
    // 332(c): bailable "yes; no", cognizable "yes; yes".
    const b = resolveOffence('332(c)');
    expect(b.bailable).toBeNull();
    expect(b.cognizable).toBeNull();
    // 61(2)(a): "depends on the offence abetted/attempted/in question".
    expect(resolveOffence('61(2)(a)').bailable).toBeNull();
  });

  it('bail-check of 303 gives bailable null and cognizable null with the exact text', async () => {
    const { sections, summary } = await checkBailEligibility(['303']);
    const o = sections[0].offence;
    expect(o?.bailable).toBeNull();
    expect(o?.cognizable).toBeNull();
    // T-371 (Ajay, T-361 Addendum 1): ATTRIBUTE_DEPENDS replaces the R3 line on a
    // null attribute. The summary line (overallBailableNote) keeps the R3 text.
    expect(o?.bailableNote).toBe(ATTRIBUTE_DEPENDS);
    expect(o?.cognizableNote).toBe(ATTRIBUTE_DEPENDS);
    expect(summary.overallBailable).toBeNull();
    expect(summary.overallBailableNote).toBe(DEPENDS_SCHEDULE);
    expect(summary.bnssBailSection).toBeNull();
    expect(summary.courtLevel).not.toMatch(/undefined/);
  });

  it('bail-check of 81 (Schedule prints non-cognizable + non-bailable) is null, not false', async () => {
    const { sections, summary } = await checkBailEligibility(['81']);
    expect(sections[0].offence?.bailable).toBeNull();
    expect(sections[0].offence?.cognizable).toBeNull();
    expect(sections[0].offence?.bailableNote).toBe(ATTRIBUTE_DEPENDS);
    expect(summary.overallBailable).toBeNull();
  });

  it('a null section never turns the answer false; false needs a real non-bailable row', async () => {
    expect((await checkBailEligibility(['81', '115'])).summary.overallBailable).toBeNull();
    expect((await checkBailEligibility(['81', '103'])).summary.overallBailable).toBe(false);
  });

  it('bail-check agrees with the table for every key (bailable, cognizable, max_years)', async () => {
    for (const key of KEYS) {
      // "-BNS" forces the BNS reading (keys such as 302 would otherwise be taken as IPC).
      const { sections } = await checkBailEligibility([`${key}-BNS`]);
      const o = sections[0].offence;
      expect(sections[0].found).toBe(true);
      expect(o?.resolution).toBe('exact');
      expect(o?.bailable).toBe(OFFENCES[key].bailable);
      expect(o?.cognizable).toBe(OFFENCES[key].cognizable);
      expect(o?.maxYears).toBe(OFFENCES[key].max_years);
      if (OFFENCES[key].bailable === null) expect(o?.bailableNote).toBe(ATTRIBUTE_DEPENDS);
      if (OFFENCES[key].cognizable === null) expect(o?.cognizableNote).toBe(ATTRIBUTE_DEPENDS);
    }
  });

  it('bail-check says a no-row section does not create an offence', async () => {
    const { sections } = await checkBailEligibility(['114-BNS']);
    expect(sections[0].found).toBe(false);
    expect(sections[0].note).toBe(NOT_AN_OFFENCE);
  });
});

// ── R1: default-bail period ──────────────────────────────────────────────────

describe('R1 default-bail period (timeline)', () => {
  const ARREST = '2026-03-01';

  function expectNoPeriod(sections: string[]): ReturnType<typeof calculateTimeline> {
    const r = calculateTimeline({ arrestDate: ARREST, sections });
    expect(r.judicialCustodyDays).toBeNull();
    expect(r.judicialCustodyEndDate).toBeNull();
    expect(r.chargesheetDeadline).toBeNull();
    expect(r.defaultBailDate).toBeNull();
    expect(r.maxYears).toBeNull();
    expect(r.periodNote).toBe(DEPENDS_187);
    expect(r).not.toHaveProperty('remandBreakdown');
    return r;
  }

  it('316(2) (a variant) gives no period, with the exact R1 text', () => {
    const r = expectNoPeriod(['316(2)']);
    expect(r.sectionsWithoutPeriod).toEqual(['316(2)']);
    expect(r.sectionNotes['316(2)']).toBe(R1_NOTE('316(2)'));
  });

  it('103 (exact key, 99) gives 90 days', () => {
    const r = calculateTimeline({ arrestDate: ARREST, sections: ['103'] });
    expect(r.judicialCustodyDays).toBe(90);
    expect(r.periodNote).toBeNull();
  });

  it('303 (exact key, 5 years) gives 60 days', () => {
    const r = calculateTimeline({ arrestDate: ARREST, sections: ['303'] });
    expect(r.judicialCustodyDays).toBe(60);
    expect(r.maxYears).toBe(5);
    expect(r.periodNote).toBeNull();
  });

  it('231 (exact key, max_years null) gives no period, never the 60-day default', () => {
    expect(OFFENCES['231'].max_years).toBeNull();
    const r = expectNoPeriod(['231']);
    expect(r.sectionsWithoutPeriod).toEqual(['231']);
  });

  it('a parent-resolved section (103(1)) gives no period', () => {
    const r = expectNoPeriod(['103(1)']);
    expect(r.sectionNotes['103(1)']).toBe(R1_NOTE('103(1)'));
  });

  it('Q10: 103 + 316(2) gives 90 days, and 316(2) carries the R1 note', () => {
    const r = calculateTimeline({ arrestDate: ARREST, sections: ['103', '316(2)'] });
    expect(r.judicialCustodyDays).toBe(90);
    expect(r.periodNote).toBeNull();
    expect(r.sectionNotes['316(2)']).toBe(R1_NOTE('316(2)'));
  });

  it('Q10: 109 (a 10-year row) + 231 gives 90 days', () => {
    expect(OFFENCES['109'].max_years).toBeGreaterThanOrEqual(10);
    const r = calculateTimeline({ arrestDate: ARREST, sections: ['109', '231'] });
    expect(r.judicialCustodyDays).toBe(90);
    expect(r.periodNote).toBeNull();
    expect(r.sectionNotes['231']).toBe(R1_NOTE('231'));
  });

  it('a mix of 303 and 316(2) gives no period for the whole case', () => {
    const r = expectNoPeriod(['303', '316(2)']);
    expect(r.sectionsWithoutPeriod).toEqual(['316(2)']);
    expect(r.sectionsUsed).toEqual(['303']);
  });

  it('Q10: 103 with a null max_years row (231) gives 90 days, with the R1 note for 231', () => {
    expect(OFFENCES['231'].max_years).toBeNull();
    const r = calculateTimeline({ arrestDate: ARREST, sections: ['103', '231'] });
    expect(r.judicialCustodyDays).toBe(90);
    expect(r.periodNote).toBeNull();
    expect(r.sectionNotes['231']).toBe(R1_NOTE('231'));
    expect(r.sectionNotes['103']).toBeUndefined();
  });

  it('empty input gives no period', () => {
    expectNoPeriod([]);
  });

  it('a no-row section on its own (114) gives no period and its own note', () => {
    const r = expectNoPeriod(['114']);
    expect(r.sectionsNotFound).toEqual(['114']);
    expect(r.sectionNotes['114']).toBe(NOT_IN_TABLE('114'));
  });

  it("303 + 999: 999 is left out with Ajay's line, the period stays 60 days", () => {
    const r = calculateTimeline({ arrestDate: ARREST, sections: ['303', '999'] });
    expect(r.judicialCustodyDays).toBe(60);
    expect(r.periodNote).toBeNull();
    expect(r.sectionsNotFound).toEqual(['999']);
    expect(r.sectionNotes['999']).toBe(NOT_IN_TABLE('999'));
  });

  it("316(1) (parent has variants, none match): no period, with Ajay's line", () => {
    const r = expectNoPeriod(['316(1)']);
    expect(r.sectionsNotFound).toEqual(['316(1)']);
    expect(r.sectionNotes['316(1)']).toBe(LEFT_OUT('316(1)'));
  });

  it('police custody (15 days) still applies, but with no period there is no window date (T-367)', () => {
    const r = expectNoPeriod(['316(2)']);
    expect(r.policeCustodyDays).toBe(15);
    expect(r.policeCustodyEndDate).toBeNull();
    expect(r.policeCustodyNote).toBe(DEPENDS_187);
  });

  it('every exact key: max_years >= 10 -> 90, otherwise 60, null -> no period', () => {
    for (const key of KEYS) {
      const r = calculateTimeline({ arrestDate: ARREST, sections: [key] });
      const my = OFFENCES[key].max_years;
      if (my === null) {
        expect(r.judicialCustodyDays).toBeNull();
        expect(r.periodNote).toBe(DEPENDS_187);
      } else {
        expect(r.judicialCustodyDays).toBe(my >= 10 ? 90 : 60);
        expect(r.maxYears).toBe(my);
      }
    }
  });
});

// ── R4: classification generated from the table ─────────────────────────────

describe('R4 classification lists', () => {
  it('bns-bailability.json does not exist and no source file reads it', () => {
    expect(fs.existsSync(path.join(CONFIG, 'bns-bailability.json'))).toBe(false);

    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__') continue;
          walk(full);
        } else if (/\.(ts|tsx|js)$/.test(entry.name)) {
          // Comments may still name the retired file; an import or require may not.
          const reader = /(?:from|require\(|import\()\s*['"][^'"]*bns-bailability/;
          if (reader.test(fs.readFileSync(full, 'utf-8'))) offenders.push(full);
        }
      }
    };
    walk(path.join(ROOT, 'src'));
    expect(offenders).toEqual([]);
  });

  it('lists equal the table: bailable, non_bailable, cognizable, non_cognizable', () => {
    const pick = (field: 'bailable' | 'cognizable', value: boolean): string[] =>
      KEYS.filter((k) => OFFENCES[k][field] === value).sort();
    expect([...BNS_CLASSIFICATION.bailable].sort()).toEqual(pick('bailable', true));
    expect([...BNS_CLASSIFICATION.non_bailable].sort()).toEqual(pick('bailable', false));
    expect([...BNS_CLASSIFICATION.cognizable].sort()).toEqual(pick('cognizable', true));
    expect([...BNS_CLASSIFICATION.non_cognizable].sort()).toEqual(pick('cognizable', false));
  });

  it('every key is in at most one bailability list and one cognizability list', () => {
    const b = new Set(BNS_CLASSIFICATION.bailable);
    const nb = new Set(BNS_CLASSIFICATION.non_bailable);
    const c = new Set(BNS_CLASSIFICATION.cognizable);
    const nc = new Set(BNS_CLASSIFICATION.non_cognizable);
    expect(b.size).toBe(BNS_CLASSIFICATION.bailable.length);
    expect(nb.size).toBe(BNS_CLASSIFICATION.non_bailable.length);
    for (const k of KEYS) {
      expect(Number(b.has(k)) + Number(nb.has(k))).toBe(OFFENCES[k].bailable === null ? 0 : 1);
      expect(Number(c.has(k)) + Number(nc.has(k))).toBe(OFFENCES[k].cognizable === null ? 0 : 1);
    }
  });

  it('null rows (303, 81, 231 for bailable) are in neither list', () => {
    for (const k of ['303', '81', '231', '63']) {
      expect(OFFENCES[k].bailable).toBeNull();
      expect(BNS_CLASSIFICATION.bailable).not.toContain(k);
      expect(BNS_CLASSIFICATION.non_bailable).not.toContain(k);
    }
  });

  it('the prompt classification agrees with the table for every key', () => {
    for (const k of KEYS) {
      const out = classifySectionsBailability(`BNS ${k}`);
      const b = OFFENCES[k].bailable;
      if (b === true) expect(out).toBe(`BNS ${k} (BAILABLE)`);
      else if (b === false) expect(out).toBe(`BNS ${k} (NON-BAILABLE)`);
      else expect(out).toBe(`BNS ${k} (classification: verify from First Schedule)`);
    }
  });

  it('103(1) classifies the same as 103 (Arjun)', () => {
    const strip = (s: string): string => s.replace(/^BNS \S+ /, '');
    expect(strip(classifySectionsBailability('BNS 103(1)'))).toBe(
      strip(classifySectionsBailability('BNS 103')),
    );
    expect(classifySectionsBailability('BNS 103(1)')).toBe('BNS 103(1) (NON-BAILABLE)');
  });

  it('a null section (303) is classified neither bailable nor non-bailable', () => {
    const out = classifySectionsBailability('BNS 303');
    expect(out).toContain('classification: verify from First Schedule');
    expect(out).not.toMatch(/BAILABLE\)/);
  });

  describe('the prompts carry Ajay lines exactly once', () => {
    const config = loadTemplateConfig('bail_regular');

    it('system prompt (criminal): Q3 line once', () => {
      expect(config).not.toBeNull();
      const prompt = buildAISystemPrompt(config!);
      expect(count(prompt, Q3_PROMPT_LINE)).toBe(1);
      expect(count(prompt, R4_PROMPT_LINE)).toBe(0);
    });

    it('system prompt whitelist lists exactly the 317 table keys', () => {
      const prompt = buildAISystemPrompt(config!);
      const start = prompt.indexOf('verified First Schedule list: ') + 30;
      const end = prompt.indexOf('. Any BNS section number NOT in this list');
      const listed = prompt.slice(start, end).split(', ');
      expect(listed).toHaveLength(317);
      expect(new Set(listed)).toEqual(new Set(KEYS));
    });

    it('user prompt with sections charged: R4 line once, after the classification', () => {
      const body = config!.document_structure.sections.find((s) => s.section_id === 'body')!;
      const ctx = buildPlaceholderContext(
        config!,
        {
          currently_in_custody: 'yes_judicial',
          fir_number: '124/2026',
          fir_date: '15/03/2026',
          police_station: 'Kotwali, Patna',
          sections_charged: 'BNS 303, BNS 103(1)',
          facts_narrative: 'The accused was falsely implicated.',
          grounds_for_bail: ['false_implication'],
        },
        {},
      );
      const prompt = buildAIUserPrompt(body, ctx);
      expect(count(prompt, R4_PROMPT_LINE)).toBe(1);
      expect(count(prompt, Q3_PROMPT_LINE)).toBe(0);
      const at = prompt.indexOf(R4_PROMPT_LINE);
      expect(prompt.indexOf('BNS 103(1) (NON-BAILABLE)')).toBeGreaterThan(-1);
      expect(prompt.indexOf('BNS 103(1) (NON-BAILABLE)')).toBeLessThan(at);
      expect(prompt.indexOf('BNS 303 (classification: verify from First Schedule)')).toBeLessThan(
        at,
      );
    });
  });
});

// ── R5 / Arjun: one whitelist resolver ───────────────────────────────────────

describe('R5 citation whitelists', () => {
  it('resolveBnsKey: exact key, else parent, else null', () => {
    expect(resolveBnsKey('103')).toEqual({ key: '103', exact: true });
    expect(resolveBnsKey('103(1)')).toEqual({ key: '103', exact: false });
    expect(resolveBnsKey('316(2)')).toEqual({ key: '316', exact: false });
    expect(resolveBnsKey('999(1)')).toBeNull();
    expect(resolveBnsKey('114')).toBeNull();
    expect(citationResolves('103(1)')).toBe(true);
    expect(citationResolves('999(1)')).toBe(false);
  });

  const BASE = {
    court_name: 'patna_hc',
    applicant_name: 'Ramesh Kumar',
    father_name: 'Suresh Kumar',
    respondent_name: 'State of Bihar',
    applicant_age: 35,
    fir_number: '091/2024',
    fir_date: '15.06.2024',
    incident_date: '10.06.2024',
    facts_narrative:
      'The petitioner was falsely implicated in the FIR. At the time of the alleged incident, the petitioner was at his residence in Patna. The victim was injured but received timely medical treatment and is now recovering.',
  };

  async function hitsFor(sections: string[]): Promise<{ verdict: string; hits: string[] }> {
    const r = await preflightCheck('bail_anticipatory', { ...BASE, sections_charged: sections });
    return { verdict: r.verdict, hits: r._meta?.rule_hits ?? [] };
  }

  it('preflight passes 103(1) and 316(2)', async () => {
    for (const s of ['103(1)', '316(2)']) {
      const { hits } = await hitsFor(['103', s]);
      expect(hits).not.toContain('section_whitelist');
    }
  });

  it('preflight hard-blocks 999(1) and 114', async () => {
    for (const s of ['999(1)', '114']) {
      const { verdict, hits } = await hitsFor(['103', s]);
      expect(verdict).toBe('hard');
      expect(hits).toContain('section_whitelist');
    }
  });

  it('the validator does not flag 103(1), 316(2) or 114, and flags 999(1) (T-270 Q7: range 1-358)', () => {
    expect(validateBNSWhitelist(['103', '103(1)', '316(2)'])).toEqual([]);
    expect(validateBNSWhitelist(['999(1)']).map((w) => w.details?.section)).toEqual(['999(1)']);
    // T-270 Q7: 114 is in the BNS range, so the validator no longer flags it (preflight still does).
    expect(validateBNSWhitelist(['114'])).toEqual([]);
  });

  it('T-270 Q7: preflight keeps the offence table (R5), the validator uses the BNS range 1-358', async () => {
    const probes = [
      '103',
      '103(1)',
      '316(2)',
      '316(1)',
      '238(B)',
      '61(2)(a)',
      '999(1)',
      '114',
      '330(1)',
    ];
    for (const s of probes) {
      const validatorFlags = validateBNSWhitelist([s]).length > 0;
      const { hits } = await hitsFor([s]);
      // Preflight: unchanged, the offence table via the resolver.
      expect(hits.includes('section_whitelist')).toBe(!citationResolves(s));
      // Validator: the range, parent number only.
      expect(validatorFlags).toBe(s === '999(1)');
    }
    // Where they now differ (Q7): non-offence BNS numbers that are in range.
    for (const s of ['114', '330(1)']) {
      expect(citationResolves(s)).toBe(false);
      expect((await hitsFor([s])).hits).toContain('section_whitelist');
      expect(validateBNSWhitelist([s])).toEqual([]);
    }
    // Where they still agree: an out-of-range number is flagged by both.
    expect((await hitsFor(['999(1)'])).hits).toContain('section_whitelist');
    expect(validateBNSWhitelist(['999(1)']).length).toBe(1);
    // R5 is "exact key, else parent": 316(1) has a parent row so it is cited-valid here,
    // although the resolver (R2) says it creates no offence.
    expect(citationResolves('316(1)')).toBe(true);
  });

  describe('E1 (anticipatory bail for bailable offence) goes through the resolver', () => {
    it('a definite bailable section (115) triggers E1', async () => {
      expect((await hitsFor(['115'])).hits).toContain('E1');
    });

    it('a null-bailable section (303, 81, 63) is not treated as bailable', async () => {
      for (const s of ['303', '81', '63']) {
        expect(OFFENCES[s].bailable).toBeNull();
        expect((await hitsFor([s])).hits).not.toContain('E1');
      }
    });

    it('bailable + null together is not "all bailable"', async () => {
      expect((await hitsFor(['115', '303'])).hits).not.toContain('E1');
    });

    it('a non-bailable variant (316(2)) and a parent-resolved non-bailable (103(1)) do not trigger E1', async () => {
      expect((await hitsFor(['316(2)'])).hits).not.toContain('E1');
      expect((await hitsFor(['103(1)'])).hits).not.toContain('E1');
    });

    it('a bailable variant (125(a)) triggers E1 because the resolver says bailable', async () => {
      expect(resolveOffence('125(a)').bailable).toBe(true);
      expect((await hitsFor(['125(a)'])).hits).toContain('E1');
    });

    it('a section that is not an offence (330(1)) is not bailable', async () => {
      expect((await hitsFor(['330(1)'])).hits).not.toContain('E1');
    });
  });
});

// ── Q4: parent row sets the court level only ─────────────────────────────────

describe('Q4 parent row sets the court level only', () => {
  // T-371: IPC 302 -> BNS 103(1) now comes from the signed ipc-to-bns.json; no seeding.

  it('302-IPC -> 103(1): court is Court of Session (signed value), maxYears is null (no period)', async () => {
    const { sections, summary } = await checkBailEligibility(['302-IPC']);
    expect(sections[0].bnsSection).toBe('103(1)');
    expect(sections[0].found).toBe(true);
    expect(sections[0].offence?.resolution).toBe('parent');
    expect(sections[0].offence?.maxYears).toBeNull();
    expect(sections[0].offence?.courtMaxYears).toBe(99);
    expect(summary.courtLevel).toBe('Court of Session');
    expect(summary.maxYears).toBeNull();
    expect(summary.courtMaxYears).toBe(99);
  });

  it('/details 103(1): triable_by Court of Session (parent row), max_years null', async () => {
    const d = await getSectionDetail('103(1)', 'BNS');
    expect(d).not.toBeNull();
    expect(d?.resolution).toBe('parent');
    expect(d?.resolved_key).toBe('103');
    expect(d?.triable_by).toBe('Court of Session');
    expect(d?.max_years).toBeNull();
  });

  it('/details 103: exact key keeps max_years 99', async () => {
    const d = await getSectionDetail('103', 'BNS');
    expect(d?.resolution).toBe('exact');
    expect(d?.triable_by).toBe('Court of Session');
    expect(d?.max_years).toBe(99);
  });
});

// ── sections.service: null is not 'no' / 'Magistrate' ───────────────────────

describe('sections.service null handling', () => {
  it('a null compoundable is null with the Depends note, not "no"', async () => {
    expect(OFFENCES['351'].compoundable).toBeNull();
    const d = await getSectionDetail('351', 'BNS');
    expect(d?.compoundable).toBeNull();
    expect(d?.compoundable_note).toBe(ATTRIBUTE_DEPENDS);
  });

  it('null bailable and cognizable are null with the Depends note (63)', async () => {
    const d = await getSectionDetail('63', 'BNS');
    expect(d?.bailable).toBeNull();
    expect(d?.cognizable).toBeNull();
    expect(d?.bailable_note).toBe(ATTRIBUTE_DEPENDS);
    expect(d?.cognizable_note).toBe(ATTRIBUTE_DEPENDS);
  });

  it('a null max_years gives max_years null and triable_by null, not "Magistrate"', async () => {
    expect(OFFENCES['63'].max_years).toBeNull();
    const d = await getSectionDetail('63', 'BNS');
    expect(d?.max_years).toBeNull();
    expect(d?.triable_by).toBeNull();
    expect(d?.triable_by).not.toBe('Magistrate');
  });

  it('a variant (316(2)) has no max_years; triable_by is the parent 316 value from the First Schedule', async () => {
    const d = await getSectionDetail('316(2)', 'BNS');
    expect(d?.resolution).toBe('variant');
    expect(d?.resolved_key).toBe('316(2)');
    expect(d?.max_years).toBeNull();
    expect(d?.triable_by).toBe('Magistrate of the first class');
    expect(d?.bailable).toBe(false);
  });

  it('triable_by is the signed First Schedule value, not a guess from max_years', async () => {
    expect(OFFENCES['81'].max_years).toBe(10);
    expect((await getSectionDetail('81', 'BNS'))?.triable_by).toBe('Magistrate of the first class');
    expect(OFFENCES['115'].max_years).toBe(1);
    expect((await getSectionDetail('115', 'BNS'))?.triable_by).toBe('Any Magistrate');
  });

  it('a section that creates no offence carries the Gazette note and no offence data', async () => {
    const d = await getSectionDetail('330(1)', 'BNS');
    expect(d?.offence_note).toBe(NOT_AN_OFFENCE);
    expect(d?.bailable).toBeNull();
    expect(d?.triable_by).toBeNull();
    expect(d?.max_years).toBeNull();
  });
});

// ── Q7: compoundable with the Court's permission ─────────────────────────────

describe('Q7 compoundable with the Court permission', () => {
  const PERMISSION = "Compoundable with the Court's permission";
  const TARGETS = ['82(1)', '117(2)', '125(a)', '125(b)', '316(2)', '316(4)'];

  it('the table has exactly these six permission variants and no permission row', () => {
    const found: string[] = [];
    for (const row of Object.values(OFFENCES)) {
      expect(row.compoundable).not.toBe('yes (with Court permission)');
      for (const [k, v] of Object.entries(row.variants ?? {})) {
        if (v.compoundable === 'yes (with Court permission)') found.push(k);
      }
    }
    expect(found.sort()).toEqual([...TARGETS].sort());
  });

  it('the resolver exports the exact text', () => {
    expect(WITH_COURT_PERMISSION).toBe(PERMISSION);
  });

  it.each(TARGETS)('%s: resolver gives with_permission and the exact note', (t) => {
    const r = resolveOffence(t);
    expect(r.kind).toBe('variant');
    expect(r.compoundable).toBe('with_permission');
    expect(r.compoundableNote).toBe(PERMISSION);
    expect(r.compoundableNote).not.toMatch(/Depends/);
  });

  it.each(TARGETS)('%s: bail-check gives with_permission and the exact note', async (t) => {
    const { sections } = await checkBailEligibility([`${t}-BNS`]);
    const o = sections[0].offence;
    expect(o?.compoundable).toBe('with_permission');
    expect(o?.compoundableNote).toBe(PERMISSION);
    expect(o?.compoundableNote).not.toMatch(/Depends/);
  });

  it.each(TARGETS)('%s: section details give with_permission and the exact note', async (t) => {
    const d = await getSectionDetail(t, 'BNS');
    expect(d?.compoundable).toBe('with_permission');
    expect(d?.compoundable_note).toBe(PERMISSION);
    expect(d?.compoundable_note).not.toMatch(/Depends/);
  });

  it('316(2) in bail-check (no -BNS suffix) and in details agree', async () => {
    const { sections } = await checkBailEligibility(['316(2)']);
    const d = await getSectionDetail('316(2)', 'BNS');
    expect(sections[0].offence?.compoundable).toBe(d?.compoundable);
    expect(sections[0].offence?.compoundableNote).toBe(d?.compoundable_note);
  });
});

// ── Q8: IPC and CrPC parts in sections_charged ───────────────────────────────

describe('Q8 classification of IPC and CrPC parts', () => {
  const IPC_302 =
    'IPC 302 is an old-law section and is not classified here. Use the section converter to find the BNS section.';

  it('"IPC 302, BNS 103(1)": BNS part classified, IPC part gets the exact line, no "BNS 302"', () => {
    const out = classifySectionsBailability('IPC 302, BNS 103(1)');
    expect(out).toContain('BNS 103(1) (NON-BAILABLE)');
    expect(out).toContain(IPC_302);
    expect(out).not.toContain('BNS 302');
    expect(out).not.toMatch(/302 \((?:NON-)?BAILABLE\)/);
    expect(out).not.toContain('classification: verify');
    expect(count(out, IPC_302)).toBe(1);
  });

  it('a lone IPC part gives only the exact line', () => {
    expect(classifySectionsBailability('IPC 302')).toBe(IPC_302);
  });

  it('"Indian Penal Code 420" is treated as IPC', () => {
    const out = classifySectionsBailability('Indian Penal Code 420');
    expect(out).toContain('IPC 420 is an old-law section');
    expect(out).not.toContain('BNS 420');
  });

  it('"BNS 103, 41 CrPC, 65B IEA": CrPC and IEA parts get Ajay\'s exact lines, no label', () => {
    const CRPC_41 =
      'CrPC 41 is an old-law section and is not classified here. Use the section converter to find the BNSS section.';
    const IEA_65B =
      'IEA 65B is an old-law section and is not classified here. Use the section converter to find the BSA section.';
    const out = classifySectionsBailability('BNS 103, 41 CrPC, 65B IEA');
    expect(out).toContain('BNS 103 (NON-BAILABLE)');
    expect(out).toContain(CRPC_41);
    expect(out).toContain(IEA_65B);
    expect(out).not.toContain('BNS 41');
    expect(out).not.toContain('BNS 65B');
    expect(out).not.toMatch(/\b(?:41|65B) \((?:NON-)?BAILABLE\)/);
    expect(out).not.toContain('classification: verify');
    expect(count(out, CRPC_41)).toBe(1);
    expect(count(out, IEA_65B)).toBe(1);
  });
});

// ── Q9: bail-check leaves a not-an-offence section out ───────────────────────

describe('Q9 bail-check leaves a non-offence out of "all bailable"', () => {
  const LEFT_OUT_BC = (n: string): string =>
    `Section ${n} does not create an offence, so it was left out.`;

  it('["330(1)","115"]: overallBailable true, recommendation carries the exact line', async () => {
    expect(OFFENCES['115'].bailable).toBe(true);
    const { summary } = await checkBailEligibility(['330(1)-BNS', '115-BNS']);
    expect(summary.overallBailable).toBe(true);
    expect(summary.recommendation).toContain(LEFT_OUT_BC('330(1)'));
  });

  it('["330(1)","115"] without a code suffix gives the same', async () => {
    const { summary } = await checkBailEligibility(['330(1)', '115']);
    expect(summary.overallBailable).toBe(true);
    expect(summary.recommendation).toContain(
      'Section 330(1) does not create an offence, so it was left out.',
    );
  });

  it('["330(1)"] alone is not "all bailable"', async () => {
    const { summary } = await checkBailEligibility(['330(1)']);
    expect(summary.overallBailable).not.toBe(true);
    expect(summary.recommendation).not.toMatch(/All charged sections are bailable/);
    expect(summary.recommendation).not.toMatch(/matter of right/);
    expect(summary.recommendation).toContain(LEFT_OUT_BC('330(1)'));
  });

  it('a non-offence does not hide a non-bailable section', async () => {
    const { summary } = await checkBailEligibility(['330(1)-BNS', '103-BNS']);
    expect(summary.overallBailable).toBe(false);
    expect(summary.recommendation).toContain(LEFT_OUT_BC('330(1)'));
  });

  it('with no non-offence the line is absent', async () => {
    const { summary } = await checkBailEligibility(['115-BNS']);
    expect(summary.recommendation).not.toContain('left out');
  });
});

// ── Round 3: adjacent-code classification, court level, wording ──────────────

describe('Round 3 must-fix 1: each number takes the code adjacent to it', () => {
  const OLD = (code: string, n: string, target: string): string =>
    `${code} ${n} is an old-law section and is not classified here. Use the section converter to find the ${target} section.`;

  it('"BNS 318(4) (IPC 420)": BNS classified, IPC 420 gets the old-law line', () => {
    const out = classifySectionsBailability('BNS 318(4) (IPC 420)');
    expect(out).toContain('BNS 318(4) (NON-BAILABLE)');
    expect(out).toContain(OLD('IPC', '420', 'BNS'));
    expect(out).not.toContain('BNS 420');
    expect(out).not.toContain('IPC 318(4)');
    expect(count(out, OLD('IPC', '420', 'BNS'))).toBe(1);
  });

  it('"Section 420 of the Indian Penal Code": only the IPC 420 line', () => {
    const out = classifySectionsBailability('Section 420 of the Indian Penal Code');
    expect(out).toBe(OLD('IPC', '420', 'BNS'));
    expect(out).not.toContain('BNS 420');
  });

  it('"BNSS 173" gives nothing and never "BNS 173"', () => {
    const out = classifySectionsBailability('BNSS 173');
    expect(out).toBe('');
    expect(out).not.toContain('BNS 173');
  });

  it('"BSA 63" gives nothing', () => {
    expect(classifySectionsBailability('BSA 63')).toBe('');
  });

  it('"BNS 103, 41 CrPC, 65B IEA": BNS 103 plus the CrPC and IEA lines', () => {
    const out = classifySectionsBailability('BNS 103, 41 CrPC, 65B IEA');
    expect(out).toContain('BNS 103 (NON-BAILABLE)');
    expect(out).toContain(OLD('CrPC', '41', 'BNSS'));
    expect(out).toContain(OLD('IEA', '65B', 'BSA'));
    expect(out).not.toContain('BNS 173');
  });

  it('"420 IPC" (code after the number) gives the IPC line only', () => {
    const out = classifySectionsBailability('420 IPC');
    expect(out).toBe(OLD('IPC', '420', 'BNS'));
    expect(out).not.toContain('BNS 420');
  });
});

describe('Round 3 must-fix 2 and 6b: court level with an unknown term', () => {
  const OLD_SENTENCE =
    'The maximum punishment of one or more charged sections is not a single term in the table.';

  it('["316(2)"]: court is the parent 316 value, empty explanation, no bail section', async () => {
    const { summary } = await checkBailEligibility(['316(2)']);
    expect(summary.courtLevel).toBe('Magistrate of the first class');
    expect(summary.courtLevelExplanation).toBe('');
    expect(summary.bnssBailSection).toBeNull();
  });

  it('the old "maximum punishment ... not a single term" sentence is absent from the output', async () => {
    for (const input of [['316(2)'], ['103', '316(2)'], ['231'], ['303', '316(2)']]) {
      const result = await checkBailEligibility(input);
      expect(JSON.stringify(result)).not.toContain(OLD_SENTENCE);
      expect(JSON.stringify(result)).not.toContain('not a single term');
    }
  });

  it('6b: ["103","316(2)"] is Court of Session, courtMaxYears 99, BNSS 483 (Ajay round 7; was 480)', async () => {
    const { summary } = await checkBailEligibility(['103', '316(2)']);
    expect(summary.courtLevel).toBe('Court of Session');
    expect(summary.courtMaxYears).toBe(99);
    expect(summary.bnssBailSection).toBe('483');
  });
});

describe('Round 3 (a): one "Depends" sentence per unknown section', () => {
  it('["303"] recommendation is exactly one sentence', async () => {
    const { summary } = await checkBailEligibility(['303']);
    expect(summary.recommendation).toBe('Section 303: Depends. Check the First Schedule.');
    expect(summary.recommendation).not.toContain('Bailability of');
  });

  it('["303","81"] gives two lines, one per unknown section', async () => {
    const { summary } = await checkBailEligibility(['303', '81']);
    expect(summary.undeterminedSections).toEqual(['303', '81']);
    expect(summary.recommendation).toContain('Section 303: Depends. Check the First Schedule.');
    expect(summary.recommendation).toContain('Section 81: Depends. Check the First Schedule.');
    expect(count(summary.recommendation, 'Depends. Check the First Schedule.')).toBe(2);
    expect(summary.recommendation).not.toContain('Bailability of');
  });
});

describe('Round 3 (b): timeline sectionNotes carry the section prefix', () => {
  it('["103","316(2)"]: 316(2) note has the "Section 316(2): " prefix', () => {
    const r = calculateTimeline({ arrestDate: '2026-03-01', sections: ['103', '316(2)'] });
    expect(r.sectionNotes['316(2)']).toBe(
      'Section 316(2): Depends on the offence. Check BNSS section 187.',
    );
  });

  it('periodNote stays bare', () => {
    const r = calculateTimeline({ arrestDate: '2026-03-01', sections: ['316(2)'] });
    expect(r.periodNote).toBe('Depends on the offence. Check BNSS section 187.');
  });
});

describe('Round 3 (e): non-bailable with an unknown term names no provision', () => {
  const NO_PROVISION =
    'Which bail provision applies depends on the offence. Check BNSS sections 480 and 483.';

  it('["316(2)"]: bnssBailSection null, title and recommendation carry the exact text', async () => {
    const { summary } = await checkBailEligibility(['316(2)']);
    expect(summary.overallBailable).toBe(false);
    expect(summary.bnssBailSection).toBeNull();
    expect(summary.bnssBailSectionTitle).toBe(NO_PROVISION);
    expect(summary.recommendation).toContain(NO_PROVISION);
  });

  it('["103","316(2)"] names BNSS 483 (Ajay round 7; was 480)', async () => {
    const { summary } = await checkBailEligibility(['103', '316(2)']);
    expect(summary.bnssBailSection).toBe('483');
    expect(summary.bnssBailSectionTitle).not.toBe(NO_PROVISION);
    expect(summary.recommendation).toContain('filed under BNSS Section 483');
    expect(summary.recommendation).not.toContain('BNSS Section 480');
    expect(summary.recommendation).not.toContain(NO_PROVISION);
  });
});

// ── Packs and fixtures Ajay signed ───────────────────────────────────────────

describe('pack and fixture lines', () => {
  const readJson = (...p: string[]): unknown =>
    JSON.parse(fs.readFileSync(path.join(...p), 'utf-8'));

  function findArrays(node: unknown, out: unknown[][] = []): unknown[][] {
    if (Array.isArray(node)) {
      out.push(node);
      node.forEach((n) => findArrays(n, out));
    } else if (node && typeof node === 'object') {
      Object.values(node).forEach((n) => findArrays(n, out));
    }
    return out;
  }

  it('posh_complaint.json: S.63 kept, S.64 added right after it', () => {
    const posh = readJson(CONFIG, 'document-rules', 'posh_complaint.json');
    const lists = findArrays(posh).filter((a) =>
      a.some((e) => (e as { number?: string })?.number === 'S.63'),
    );
    expect(lists).toHaveLength(1);
    const list = lists[0] as Array<{ number: string; description: string }>;
    const i = list.findIndex((e) => e.number === 'S.63');
    expect(list[i]).toEqual({ number: 'S.63', description: 'Rape (was IPC 375)' });
    expect(list[i + 1]).toEqual({
      number: 'S.64',
      description: 'Punishment for rape (was IPC 376)',
    });
    expect(list.filter((e) => e.number === 'S.64')).toHaveLength(1);
  });

  const FIXTURES = path.join(REPO, 'scripts', 'golden-set', 'fixtures');

  it('fixture 15: description says "saza 5 saal tak" (303(2) is 5 years)', () => {
    const f = readJson(FIXTURES, '15-default-bail-no-arithmetic.json') as { description: string };
    expect(f.description).toContain('section 303(2) BNS, saza 5 saal tak.');
    expect(f.description).not.toContain('saza 3 saal tak');
  });

  it('fixture 18: risk, description and absent.why carry the signed lines', () => {
    const f = readJson(FIXTURES, '18-default-bail-period-not-given.json') as {
      risk: string;
      description: string;
    };
    expect(f.risk).toContain('(the old table gave a 10-year maximum, which forced 90 days)');
    expect(f.risk).toContain('a 7-year-maximum offence');
    expect(f.description).toContain('section 318(4) BNS, saza 7 saal tak.');
    // The "absent" list sits under the fixture's checks; find it by key, not by path.
    const absent = findArrays(f).filter((a) =>
      a.some((e) => (e as { any_of?: string[] })?.any_of?.includes('90 days')),
    );
    expect(absent).toHaveLength(1);
    const whys = (absent[0] as Array<{ why: string }>).map((a) => a.why);
    expect(whys).toContain(
      'a 7-year-maximum offence with no period given is never drafted as 90 days (the period is 60); the blank stands',
    );
    expect(whys.some((w) => w.includes('10-year'))).toBe(false);
  });

  it('fixtures 15 and 18 agree with the table: 303(2) = 5 years, 318(4) = 7 years', () => {
    expect(OFFENCES['303(2)'].max_years).toBe(5);
    expect(OFFENCES['318(4)'].max_years).toBe(7);
  });

  it('bns-mapping.json bns_offences: 141 and 318', () => {
    const m = readJson(CONFIG, 'bns-mapping.json') as {
      bail_application: { bns_offences: Record<string, string> };
    };
    expect(m.bail_application.bns_offences['141']).toBe(
      'Importation of girl or boy from foreign country',
    );
    expect(m.bail_application.bns_offences['318']).toBe('Cheating');
    // And they are the Gazette headings in the signed table.
    expect(OFFENCES['141'].title).toBe('Importation of girl or boy from foreign country');
    expect(OFFENCES['318'].title).toBe('Cheating');
  });
});
