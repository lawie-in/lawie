import './setupEnv';

import { readFileSync } from 'fs';
import { join } from 'path';

import { resolveCourtRule, assemblePrompt } from '../services/prompt-assembler';
import { postProcess } from '../services/post-processor';
import { loadCourtRule, chosenCourtHeading } from '../services/template-engine.service';

jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
}));

const idFor = (type: string, name: string) => resolveCourtRule(type, name)?.courtId;

describe('T-174 family court routing', () => {
  describe('AC 1: family_court always gets the family_court rule', () => {
    it.each([
      ['Family Court'],
      ['Family Court, Patna'],
      ['Principal Judge, Family Court, Lucknow'],
      ['Family Court, Ranchi'],
      [''],
    ])('%j -> family_court', (name) => {
      expect(idFor('family_court', name)).toBe('family_court');
      expect(idFor('family_court', name)).not.toBe('district_court_generic');
    });
  });

  describe('AC 2: sessions / JMFC words in the name do not pull a criminal rule', () => {
    it.each([
      ['Family Court, Sessions Division Patna'],
      ['Family Court, JMFC Building, Ranchi'],
      ['Family Court (Judicial Magistrate First Class campus), Lucknow'],
    ])('%j -> family_court', (name) => {
      expect(idFor('family_court', name)).toBe('family_court');
    });
  });

  describe('AC 4: other court types unchanged', () => {
    it('district_court by type', () => {
      expect(idFor('district_court', 'District Court, Patna')).toBe('district_court_generic');
    });
    it('sessions by name', () => {
      expect(idFor('district_court', 'Sessions Court, Patna')).toBe('sessions_generic');
    });
    it('JMFC by name', () => {
      expect(idFor('district_court', 'JMFC Patna')).toBe('jmfc_generic');
    });
    it('High Court by name', () => {
      expect(idFor('high_court', 'Patna High Court')).toBe('patna_hc');
    });
    it('Supreme Court is still null', () => {
      expect(resolveCourtRule('supreme_court', 'Supreme Court of India')).toBeNull();
    });
    it('consumer forum still district_court_generic (out of scope)', () => {
      expect(idFor('consumer_forum', 'District Forum')).toBe('district_court_generic');
    });
  });

  describe('AC 5: typed path (assemblePrompt -> postProcess)', () => {
    const NOT_APPLICABLE = 'Not applicable (civil / personal law proceedings)';
    const parties = { petitioner: 'Asha Devi', respondent: 'Ravi Kumar' };
    // Stand-in for the LLM output: the LLM writes the case-number and party lines.
    const raw = (city: string) =>
      `IN THE COURT OF PRINCIPAL JUDGE, FAMILY COURT, ${city.toUpperCase()}\nM.J. No. _____ of 2026\n\nAsha Devi ... PETITIONER\n\nVERSUS\n\nRavi Kumar ... RESPONDENT\n\n1. The petitioner states.`;

    // T-176 (FU-1): the heading now names the seat. Pins updated by the lead's waiver of
    // the "unedited" rule (ticket AC 6).
    it.each([
      ['Patna', 'Family Court, Patna', 'IN THE FAMILY COURT AT PATNA'],
      ['Lucknow', 'Principal Judge, Family Court, Lucknow', 'IN THE FAMILY COURT AT LUCKNOW'],
      ['Ranchi', 'Family Court, Ranchi', 'IN THE FAMILY COURT AT RANCHI'],
      ['Delhi', 'Family Court, Tis Hazari, Delhi', 'IN THE FAMILY COURT AT TIS HAZARI, DELHI'],
    ])('%s: family heading, no civil-only or prosecutor text', async (city, name, heading) => {
      const ap = await assemblePrompt({
        docType: 'petition',
        courtType: 'family_court',
        courtName: name,
        partyDetails: parties,
        keyFacts: 'Marriage solemnised in 2019; parties living separately since 2024.',
        reliefPrayer: 'Decree of divorce.',
      });
      expect(ap.courtRule?.courtId).toBe('family_court');
      const prompt = ap.systemPrompt + '\n' + ap.userPrompt;
      expect(prompt).not.toContain(NOT_APPLICABLE);
      expect(prompt).not.toContain('Public Prosecutor');

      const out = postProcess({
        rawText: raw(city),
        docRule: ap.docRule,
        courtRule: ap.courtRule,
        partyDetails: parties,
        courtName: name,
      }).formattedText;
      const lines = out.split('\n');
      expect(lines[0]).toBe(heading);
      // Pass-through check only: line 2 is the stand-in text, and this shows postProcess
      // leaves it unchanged. It is not proof that the case number is right.
      expect(lines[1]).toBe('M.J. No. _____ of 2026');
      expect(out).toContain('... PETITIONER');
      expect(out).toContain('... RESPONDENT');
      expect(out).not.toContain(NOT_APPLICABLE);
      expect(out).not.toContain('Public Prosecutor');
    });
  });

  describe('AC 6: Tis Hazari list entry and typed name give the same rule', () => {
    type Entry = { courtId?: string; [k: string]: unknown };
    const find = (node: unknown, id: string): Entry | undefined => {
      if (Array.isArray(node)) {
        for (const n of node) {
          const r = find(n, id);
          if (r) return r;
        }
      } else if (node && typeof node === 'object') {
        const o = node as Entry;
        if (o.courtId === id) return o;
        for (const v of Object.values(o)) {
          const r = find(v, id);
          if (r) return r;
        }
      }
      return undefined;
    };

    it('same rule key from the list and from the typed name', () => {
      const courts = JSON.parse(
        readFileSync(join(__dirname, '..', 'config', 'courts', 'indian-courts.json'), 'utf-8'),
      );
      const entry = find(courts, 'family_court_delhi_tis_hazari');
      expect(entry).toBeDefined();
      const ref = entry!.formattingRulesRef as string;
      expect(ref).toBe('family_court');
      const listRule = loadCourtRule(ref);
      const typedRule = resolveCourtRule('family_court', 'Family Court, Tis Hazari, Delhi');
      expect(typedRule?.courtId).toBe(listRule?.courtId);
      expect(typedRule?.courtId).toBe('family_court');
      // Heading lines differ between the paths; reported, not reconciled (ticket AC 6).
      // T-176 (FU-1): the list-path heading now prints the entry's own designation, and the
      // typed name "Family Court, Tis Hazari, Delhi" gives the same line.
      const heading = chosenCourtHeading({
        designation: entry!.designation as string,
        city: entry!.city as string,
        caseNomenclature: entry!.caseNomenclature as string,
        formattingRulesRef: ref,
        courtType: entry!.courtType as string,
        state: entry!.state as string,
        courtRule: listRule ?? undefined,
      } as never);
      expect(heading?.header).toBe('IN THE FAMILY COURT AT TIS HAZARI, DELHI');
      expect(heading?.designation).toBe('FAMILY COURT AT TIS HAZARI, DELHI');
    });
  });
});
