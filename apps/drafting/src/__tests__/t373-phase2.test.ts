/**
 * T-373 phase 2: the advocate-name rule (T-365 AC1), the label and the missing
 * clauses read from rendered[]. Pure functions, no model, no database.
 */
import './setupEnv';

import type { LedgerFact } from '@lawie/shared';

import {
  drafterBrief,
  guidedDrafterBrief,
  knownAdvocateName,
  labelReason,
  ledgerDrafterFacts,
  missingFromRendered,
  needsStartingDraftLabel,
  type MissingClause,
} from '../services/brief-drafter';
import type { RenderedClause } from '../services/draft-renderer';
import { Brief, BriefItem, buildBrief, buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { fact, regularBase } from './fixtures/t373';

const pack = loadRulePack('bail_regular')!;
const BLANK = '{{MISSING: Advocate name}}';

/** A real brief for the pack, with the advocate-name blank listed as unknown and as an unconfirmed item. */
function briefWithAdvocateBlank(): Brief {
  const base = buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: true },
    checklist: buildChecklist(pack),
    values: [],
  });
  const item = {
    ...base.items[0],
    key: 'advocate_name',
    label: 'Advocate name',
    placeholder: BLANK,
    value: 'typed',
    unconfirmed: true,
  } as BriefItem;
  return {
    ...base,
    items: [...base.items, item],
    still_unknown: [
      ...base.still_unknown,
      { key: 'advocate_name', label: 'Advocate name', placeholder: BLANK },
    ],
  };
}

const unknownWhats = (b: { unknown: Array<{ what: string }> }): string[] =>
  b.unknown.map((u) => u.what);

describe('advocate_name is not unknown when the profile has a name (T-365 AC1)', () => {
  it('knownAdvocateName: a non-blank profile name and the key advocate_name (last segment)', () => {
    expect(knownAdvocateName('advocate_name', 'Anita Sharma')).toBe(true);
    expect(knownAdvocateName('block.advocate_name', 'Anita Sharma')).toBe(true);
    expect(knownAdvocateName('advocate_name', '')).toBe(false);
    expect(knownAdvocateName('advocate_name', '   ')).toBe(false);
    expect(knownAdvocateName('advocate_name', null)).toBe(false);
    expect(knownAdvocateName('advocate_name', undefined)).toBe(false);
    expect(knownAdvocateName('applicant_name', 'Anita Sharma')).toBe(false);
    expect(knownAdvocateName('advocate_name_extra', 'Anita Sharma')).toBe(false);
  });

  describe('drafterBrief (5th parameter)', () => {
    it('drops advocate_name from unknown (still_unknown and the unconfirmed item) with a profile name', () => {
      const b = drafterBrief(briefWithAdvocateBlank(), null, undefined, null, 'Anita Sharma');
      expect(unknownWhats(b)).not.toContain('Advocate name');
    });
    it('keeps it with no profile name, a blank one, or null', () => {
      for (const name of [undefined, null, '', '  ']) {
        const b = drafterBrief(briefWithAdvocateBlank(), null, undefined, null, name);
        expect(unknownWhats(b).filter((w) => w === 'Advocate name')).toHaveLength(2);
      }
    });
    it('only advocate_name is dropped: the other unknowns stay', () => {
      const withName = drafterBrief(briefWithAdvocateBlank(), null, undefined, null, 'Anita');
      const without = drafterBrief(briefWithAdvocateBlank(), null, undefined, null);
      expect(unknownWhats(withName)).toEqual(
        unknownWhats(without).filter((w) => w !== 'Advocate name'),
      );
      expect(unknownWhats(withName).length).toBeGreaterThan(0);
    });
  });

  describe('guidedDrafterBrief (3rd parameter)', () => {
    it('drops it with a profile name', () => {
      const b = guidedDrafterBrief(briefWithAdvocateBlank(), null, 'Anita Sharma');
      expect(unknownWhats(b)).not.toContain('Advocate name');
    });
    it('keeps it without', () => {
      expect(unknownWhats(guidedDrafterBrief(briefWithAdvocateBlank(), null))).toContain(
        'Advocate name',
      );
      expect(unknownWhats(guidedDrafterBrief(briefWithAdvocateBlank(), null, ' '))).toContain(
        'Advocate name',
      );
    });
  });

  describe('ledgerDrafterFacts (6th parameter)', () => {
    const checklist = [
      { key: 'advocate_name', label: 'Advocate name', required: true },
      { key: 'applicant_name', label: 'Applicant name', required: true },
    ];
    const facts = (): LedgerFact[] => [];
    it('drops advocate_name from missing with a profile name; others stay', () => {
      const r = ledgerDrafterFacts(facts(), checklist, null, false, [], 'Anita Sharma');
      expect(r.missing.map((m) => m.key)).toEqual(['applicant_name']);
    });
    it('keeps it without a profile name', () => {
      for (const name of [undefined, null, '', '  ']) {
        const r = ledgerDrafterFacts(facts(), checklist, null, false, [], name);
        expect(r.missing.map((m) => m.key)).toEqual(['advocate_name', 'applicant_name']);
        expect(r.missing[0].write).toBe(BLANK);
      }
    });
    it('an unresolved optional advocate_name is dropped too, with a name', () => {
      const optional = [{ key: 'advocate_name', label: 'Advocate name', required: false }];
      expect(
        ledgerDrafterFacts(facts(), optional, null, false, ['advocate_name'], 'Anita').missing,
      ).toEqual([]);
      expect(
        ledgerDrafterFacts(facts(), optional, null, false, ['advocate_name']).missing,
      ).toHaveLength(1);
    });
    it('a held advocate_name fact still appears in facts', () => {
      const held = [fact('advocate_name', 'Anita Sharma')];
      const r = ledgerDrafterFacts(held, checklist, null, false, [], 'Anita Sharma');
      expect(r.facts.map((f) => f.key)).toEqual(['advocate_name']);
    });
  });
});

describe('the label and the missing clauses from rendered[] (D1)', () => {
  const rendered: RenderedClause[] = [
    { clauseId: 'opening', status: 'ok' },
    { clauseId: 'facts', status: 'fallback', reason: 'unverified' },
    { clauseId: 'antecedents', status: 'missing', missing: ['Criminal antecedents'] },
    { clauseId: 'custody', status: 'missing', missing: ['Custody since', 'Custody place'] },
    { clauseId: 'no_labels', status: 'missing' },
  ];
  const none: MissingClause[] = [];

  it('missingFromRendered: only status missing, titled by the blank labels', () => {
    expect(missingFromRendered(rendered)).toEqual([
      { id: 'antecedents', title: 'Criminal antecedents', reason: 'reported_missing' },
      { id: 'custody', title: 'Custody since; Custody place', reason: 'reported_missing' },
      { id: 'no_labels', title: 'no_labels', reason: 'reported_missing' },
    ]);
    expect(missingFromRendered([])).toEqual([]);
    expect(missingFromRendered(rendered.slice(0, 2))).toEqual([]);
  });

  it("a fallback alone does not need the label (the advocate's own words are printed)", () => {
    expect(needsStartingDraftLabel(none, [], rendered.slice(0, 2))).toBe(false);
    expect(labelReason(none, [], rendered.slice(0, 2))).toBeNull();
  });

  it('a missing clause in rendered[] needs the label and is named in the reason', () => {
    expect(needsStartingDraftLabel(none, [], rendered)).toBe(true);
    expect(labelReason(none, [], rendered)).toBe(
      'This draft does not cover: Criminal antecedents; Custody since; Custody place; no_labels. Add them before use.',
    );
  });

  it('a clause already in missing is not named twice', () => {
    const given: MissingClause[] = [
      { id: 'antecedents', title: 'Criminal antecedents', reason: 'reported_missing' },
    ];
    expect(labelReason(given, [], rendered)).toBe(
      'This draft does not cover: Criminal antecedents; Custody since; Custody place; no_labels. Add them before use.',
    );
  });

  it('warnings still label when rendered[] has nothing missing', () => {
    const w = [{ code: 'x' }] as never;
    expect(needsStartingDraftLabel(none, w, rendered.slice(0, 2))).toBe(true);
    expect(labelReason(none, w, rendered.slice(0, 2))).toBe(
      '1 check did not pass. See the findings.',
    );
  });

  describe('without rendered[] (non-D1 paths) the result is as before', () => {
    const missing: MissingClause[] = [
      { id: 'prayer', title: 'The prayer', reason: 'paragraph_not_found' },
    ];
    it('missing alone', () => {
      expect(needsStartingDraftLabel(missing, [])).toBe(true);
      expect(needsStartingDraftLabel(none, [])).toBe(false);
      expect(labelReason(missing, [])).toBe(
        'This draft does not cover: The prayer. Add them before use.',
      );
      expect(labelReason(none, [])).toBeNull();
    });
    it('an undefined rendered is the same as none given; an empty array adds nothing', () => {
      expect(needsStartingDraftLabel(missing, [], undefined)).toBe(
        needsStartingDraftLabel(missing, []),
      );
      expect(labelReason(missing, [], undefined)).toBe(labelReason(missing, []));
      expect(labelReason(missing, [], [])).toBe(labelReason(missing, []));
      expect(needsStartingDraftLabel(none, [], [])).toBe(false);
    });
    it('warnings', () => {
      const w = [{ code: 'x' }, { code: 'y' }] as never;
      expect(labelReason(none, w)).toBe('2 checks did not pass. See the findings.');
    });
  });

  it('regularBase is untouched by these helpers (guards the import)', () => {
    expect(regularBase().length).toBeGreaterThan(0);
  });
});
