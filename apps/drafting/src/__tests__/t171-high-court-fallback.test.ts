import './setupEnv';

import { readFileSync } from 'fs';
import { join } from 'path';

import { resolveCourtRule, _testing } from '../services/prompt-assembler';
import { formatCauseTitle } from '../services/post-processor';

jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
}));

const idFor = (name: string) => resolveCourtRule('high_court', name)?.courtId;

describe('T-171 High Court routing (AJ-2026-10-08-T171-A1)', () => {
  describe('AC 2 routing', () => {
    it.each([
      ['High Court of Judicature at Allahabad', 'allahabad_hc'],
      ['High Court of Judicature at Allahabad, Lucknow Bench', 'allahabad_hc'],
      ['Delhi High Court', 'delhi_hc'],
      ['Jharkhand High Court, Ranchi', 'jharkhand_hc'],
      ['High Court of Judicature at Patna', 'patna_hc'],
      ['Patna High Court', 'patna_hc'],
      ['Rajasthan High Court, Jaipur Bench', 'high_court_generic'],
    ])('%s -> %s', (name, expected) => {
      expect(idFor(name)).toBe(expected);
    });

    it.each([['High Court of Atlantis'], [''], ['   ']])(
      'unknown/empty name %j -> high_court_generic, never patna_hc',
      (name) => {
        expect(idFor(name)).toBe('high_court_generic');
        expect(idFor(name)).not.toBe('patna_hc');
      },
    );
  });

  describe('AC 3 whole-entry matching, not substrings', () => {
    it('Allahabad High Court, Lucknow (no "Bench") -> generic', () => {
      expect(idFor('Allahabad High Court, Lucknow')).toBe('high_court_generic');
    });
    it('a name merely containing Patna does not reach patna_hc', () => {
      expect(idFor('Patna Bench of Atlantis High Court')).not.toBe('patna_hc');
    });
  });

  describe("Priya's guard", () => {
    it('Orissa (entry points at district_court_generic) -> generic', () => {
      const name = 'High Court of Orissa at Cuttack';
      expect(_testing.matchHighCourtRef(name)).toBe('district_court_generic');
      expect(_testing.highCourtRuleOnly('district_court_generic')).toBeNull();
      expect(idFor(name)).toBe('high_court_generic');
    });
  });

  describe('routing order', () => {
    it('a high_court name containing "Sessions" goes to the HC path', () => {
      expect(idFor('Sessions High Court of Atlantis')).toBe('high_court_generic');
    });
  });

  describe('AC 4 headings', () => {
    const name = 'Rajasthan High Court, Jaipur Bench';

    it('prints the entered name verbatim', () => {
      expect(resolveCourtRule('high_court', name)!.designation).toBe(name);
      expect(resolveCourtRule('high_court', `  ${name}  `)!.designation).toBe(name);
    });
    it('prints the blank heading when no name is entered', () => {
      expect(resolveCourtRule('high_court', '')!.designation).toBe(
        'IN THE HIGH COURT OF __________',
      );
      expect(resolveCourtRule('high_court', '   ')!.designation).toBe(
        'IN THE HIGH COURT OF __________',
      );
    });
    it('formatCauseTitle prints both lines end to end', () => {
      const draft = 'IN THE HIGH COURT OF SOMEWHERE\n\nbody';
      expect(formatCauseTitle(draft, resolveCourtRule('high_court', name))).toBe(
        `${name}\n\nbody`,
      );
      expect(formatCauseTitle(draft, resolveCourtRule('high_court', ''))).toBe(
        'IN THE HIGH COURT OF __________\n\nbody',
      );
    });
    it('does not mutate the cached generic rule', () => {
      resolveCourtRule('high_court', name);
      resolveCourtRule('high_court', '');
      expect(_testing.loadCourtRule('high_court_generic')!.designation).toContain(
        '{courtDesignation}',
      );
    });
    it('a rule with its own court keeps its designation', () => {
      expect(resolveCourtRule('high_court', 'Delhi High Court')!.designation).toBe(
        _testing.loadCourtRule('delhi_hc')!.designation,
      );
    });
  });

  describe('AC 5 high_court_generic.json strings', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rule: any = _testing.loadCourtRule('high_court_generic');

    it('localRules[0]', () => {
      expect(rule.localRules[0]).toBe(
        'All petitions must be filed through an advocate enrolled with a State Bar Council, or by the party in person.',
      );
    });
    it("localRules[5]", () => {
      expect(rule.localRules[5]).toBe("Follow the High Court's current e-filing directions.");
    });
    it('e-filing flags are false', () => {
      expect(rule.e_filing_mandatory).toBe(false);
      expect(rule.eFilingMandatory).toBe(false);
    });
    it('every case_nomenclature value', () => {
      const values = Object.values(rule.case_nomenclature);
      expect(values).toHaveLength(10);
      for (const v of values) expect(v).toBe('_____ No. _____ of {year}');
    });
    it('party_designation.state', () => {
      expect(rule.party_designation.state).toBe('State of __________');
    });
  });

  describe('round 2: seatless names, bench headings (AJ-2026-10-08-T171-A2)', () => {
    const headingFor = (name: string) => resolveCourtRule('high_court', name)!.designation;
    const JH = 'IN THE HIGH COURT OF JHARKHAND AT RANCHI';
    const AL = 'IN THE HIGH COURT OF JUDICATURE AT ALLAHABAD';
    const PT = 'IN THE HIGH COURT OF JUDICATURE AT PATNA';

    it.each([
      ['Jharkhand High Court', 'jharkhand_hc'],
      ['High Court of Jharkhand', 'jharkhand_hc'],
      ['Delhi High Court', 'delhi_hc'],
      ['Patna High Court', 'patna_hc'],
      ['Rajasthan High Court, Jaipur Bench', 'high_court_generic'],
      ['Allahabad High Court, Lucknow', 'high_court_generic'],
      ['High Court of Judicature at Allahabad - Principal Seat', 'allahabad_hc'],
      ['High Court of Orissa', 'high_court_generic'],
    ])('rule for %s -> %s', (name, expected) => {
      expect(idFor(name)).toBe(expected);
    });

    it('pins the Lucknow Bench heading exactly (Ajay A2 blocker)', () => {
      const rule = resolveCourtRule(
        'high_court',
        'High Court of Judicature at Allahabad, Lucknow Bench',
      )!;
      expect(rule.courtId).toBe('allahabad_hc');
      expect(rule.designation).toBe(
        'IN THE HIGH COURT OF JUDICATURE AT ALLAHABAD, LUCKNOW BENCH',
      );
    });

    it('accepted risk: bare "Allahabad High Court" prints AT ALLAHABAD', () => {
      expect(idFor('Allahabad High Court')).toBe('allahabad_hc');
      expect(headingFor('Allahabad High Court')).toBe(AL);
    });

    it('accepted risk: "Jharkhand High Court" prints AT RANCHI', () => {
      expect(headingFor('Jharkhand High Court')).toBe(JH);
    });

    it('headings unchanged for courts with their own rule', () => {
      expect(headingFor('High Court of Judicature at Patna')).toBe(PT);
      expect(headingFor('Patna High Court')).toBe(PT);
      expect(headingFor('Delhi High Court')).toBe('IN THE HIGH COURT OF DELHI AT NEW DELHI');
      expect(headingFor('High Court of Jharkhand')).toBe(JH);
      expect(headingFor('Jharkhand High Court, Ranchi')).toBe(JH);
      expect(headingFor('High Court of Judicature at Allahabad')).toBe(AL);
      expect(
        headingFor('High Court of Judicature at Allahabad - Principal Seat, Prayagraj'),
      ).toBe(AL);
    });

    it('guard: Orissa never gets district_court_generic, prints the entered name', () => {
      const rule = resolveCourtRule('high_court', 'High Court of Orissa')!;
      expect(rule.courtId).toBe('high_court_generic');
      expect(rule.designation).toBe('High Court of Orissa');
    });

    it('does not mutate the cached rule: Lucknow then Allahabad', () => {
      const before = _testing.loadCourtRule('allahabad_hc')!.designation;
      expect(headingFor('High Court of Judicature at Allahabad, Lucknow Bench')).toMatch(
        /LUCKNOW BENCH$/,
      );
      expect(headingFor('High Court of Judicature at Allahabad')).toBe(AL);
      expect(_testing.loadCourtRule('allahabad_hc')!.designation).toBe(before);
      expect(before).toBe(AL);
    });

    it('a name matching entries with different rules is no match', () => {
      const file = join(__dirname, '..', 'config', 'courts', 'indian-courts.json');
      const courts = (JSON.parse(readFileSync(file, 'utf-8')).courts ?? []) as Array<{
        courtType?: string;
        name?: string;
        formattingRulesRef?: string;
      }>;
      const hcs = courts.filter(
        (c) =>
          (c.courtType === 'high_court' || c.courtType === 'high_court_bench') &&
          c.formattingRulesRef &&
          c.name,
      );
      expect(hcs.length).toBeGreaterThan(0);
      const byKey = new Map<string, Set<string>>();
      for (const c of hcs) {
        const key = _testing.courtNameKey(c.name!);
        if (!byKey.has(key)) byKey.set(key, new Set());
        byKey.get(key)!.add(c.formattingRulesRef!);
      }
      for (const c of hcs) {
        const m = _testing.matchHighCourt(c.name!);
        const refs = byKey.get(_testing.courtNameKey(c.name!))!;
        if (refs.size > 1) expect(m).toBeNull();
        else expect(m?.ref).toBe(c.formattingRulesRef);
      }
    });
  });

  describe('no regression for other court types', () => {
    it('district court by name and by type', () => {
      expect(resolveCourtRule('district_court', 'Sessions Court, Patna')!.courtId).toBe(
        'sessions_generic',
      );
      expect(resolveCourtRule('district_court', 'JMFC Patna')!.courtId).toBe('jmfc_generic');
      expect(resolveCourtRule('district_court', 'District Court, Patna')!.courtId).toBe(
        'district_court_generic',
      );
    });
    it('consumer still uses district_court_generic', () => {
      expect(resolveCourtRule('consumer_forum', 'District Forum')!.courtId).toBe(
        'district_court_generic',
      );
    });
    it('family uses family_court (T-174)', () => {
      expect(resolveCourtRule('family_court', 'Family Court')!.courtId).toBe('family_court');
    });
    it('supreme court is still null', () => {
      expect(resolveCourtRule('supreme_court', 'Supreme Court of India')).toBeNull();
    });
  });
});
