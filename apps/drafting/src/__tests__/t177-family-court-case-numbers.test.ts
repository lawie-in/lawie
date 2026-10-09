/**
 * T-177 — Family court case numbers are a placeholder, never a guessed matter type.
 * Rule file, DB seed, the 7 family templates, and the list-path rendered cause title.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  buildPlaceholderContext,
  familyCaseNomenclature,
  loadTemplateConfig,
  renderTemplateSection,
} from '../services/template-engine.service';

const SRC = join(__dirname, '..');
const PLACEHOLDER_YEAR = '[To be confirmed: case type] No. _____ of {year}';
const PLACEHOLDER_CURRENT = '[To be confirmed: case type] No. _____ of {current_year}';
const FAMILY_TEMPLATES = [
  'divorce_hma',
  'divorce_mutual_consent',
  'divorce_sma',
  'judicial_separation',
  'rcr_petition',
  'guardianship_petition',
  'maintenance_bnss_144',
];

const familyRulePath = join(SRC, 'config/court-rules/family_court.json');
const familyRuleRaw = readFileSync(familyRulePath, 'utf-8');
const familyRule = JSON.parse(familyRuleRaw);
const courts: Array<Record<string, any>> = JSON.parse(
  readFileSync(join(SRC, 'config/courts/indian-courts.json'), 'utf-8'),
).courts;
const familyCourts = courts.filter((c) => c.formattingRulesRef === 'family_court');
const templateRaw = (id: string) =>
  readFileSync(join(SRC, 'config/document-rules', `${id}.json`), 'utf-8');

function leaves(node: unknown, path = ''): Array<[string, unknown]> {
  if (node !== null && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
      leaves(v, path ? `${path}.${k}` : k),
    );
  }
  return [[path, node]];
}

describe('T-177 family court case numbers', () => {
  describe('family_court.json case_nomenclature', () => {
    it('has leaves, and every leaf is exactly the placeholder', () => {
      const all = leaves(familyRule.case_nomenclature);
      expect(all.length).toBeGreaterThan(0);
      for (const [path, value] of all) {
        expect([path, value]).toEqual([path, PLACEHOLDER_YEAR]);
      }
    });
  });

  describe('no M.J. / H.M.O.P. guesses', () => {
    it('family_court.json has none', () => {
      expect(familyRuleRaw).not.toMatch(/M\.J\.|H\.M\.O\.P\./);
    });

    it('no family entry in indian-courts.json has any', () => {
      for (const c of familyCourts) {
        expect(`${c.courtId}: ${c.caseNomenclature}`).not.toMatch(/M\.J\.|H\.M\.O\.P\./);
      }
    });

    it.each(FAMILY_TEMPLATES)('template %s has none', (id) => {
      expect(templateRaw(id)).not.toMatch(/M\.J\.|H\.M\.O\.P\./);
    });
  });

  describe('indian-courts.json family entries', () => {
    it('are exactly 22, all with the {current_year} placeholder', () => {
      expect(familyCourts).toHaveLength(22);
      for (const c of familyCourts) {
        expect([c.courtId, c.caseNomenclature]).toEqual([c.courtId, PLACEHOLDER_CURRENT]);
      }
    });
  });

  describe('family templates', () => {
    it.each(FAMILY_TEMPLATES)('%s causeTitle.caseNomenclature is the placeholder', (id) => {
      const t = JSON.parse(templateRaw(id));
      expect(t.causeTitle.caseNomenclature).toBe(PLACEHOLDER_CURRENT);
    });
  });

  describe('list path rendered cause title', () => {
    const year = String(new Date().getFullYear());
    const patna = courts.find((c) => c.courtId === 'family_court_patna')!;

    function renderCauseTitle(
      templateId: string,
      court: Record<string, any>,
      rule: unknown,
      extra: { formData?: Record<string, any>; profile?: Record<string, any>; state?: string } = {},
    ) {
      const cfg = loadTemplateConfig(templateId);
      expect(cfg).not.toBeNull();
      const courtData = {
        designation: court.designation,
        city: court.city,
        caseNomenclature: court.caseNomenclature,
        formattingRulesRef: court.formattingRulesRef,
        courtType: court.courtType,
        state: extra.state ?? court.state,
        courtRule: rule,
      };
      const ctx = buildPlaceholderContext(
        cfg!,
        { court_name: court.courtId, ...(extra.formData ?? {}) },
        extra.profile ?? {},
        courtData as any,
      );
      const section = (cfg!.document_structure?.sections ?? []).find(
        (s: any) => s.section_id === 'cause_title',
      );
      expect(section).toBeDefined();
      const r: any = renderTemplateSection(section as any, ctx);
      return String(r.content ?? r.text ?? JSON.stringify(r));
    }

    it('Patna family court entry exists', () => {
      expect(patna).toBeDefined();
    });

    it.each(FAMILY_TEMPLATES)('%s prints the placeholder with the year', (id) => {
      const txt = renderCauseTitle(id, patna, familyRule);
      expect(txt).toContain(`[To be confirmed: case type] No. _____ of ${year}`);
      expect(txt).not.toMatch(/\{year\}|\{current_year\}|\[YEAR\]/);
      expect(txt).not.toMatch(/M\.J\.|H\.M\.O\.P\./);
    });

    it.each(FAMILY_TEMPLATES)(
      '%s ignores a list-entry "M.J." string and prints the placeholder',
      (id) => {
        const court = { ...patna, caseNomenclature: 'M.J. No. _____ of {current_year}' };
        const txt = renderCauseTitle(id, court, familyRule);
        expect(txt).toContain(`[To be confirmed: case type] No. _____ of ${year}`);
        expect(txt).not.toContain('M.J.');
      },
    );

    it.each(FAMILY_TEMPLATES)('%s line is unchanged when the user is in Tamil Nadu (AC 6)', (id) => {
      const base = renderCauseTitle(id, patna, familyRule);
      const tn = renderCauseTitle(id, patna, familyRule, {
        formData: { state: 'Tamil Nadu' },
        profile: { state: 'Tamil Nadu' },
      });
      const line = (t: string) => t.split('\n').find((l) => /No\. _____/.test(l));
      expect(line(tn)).toBeDefined();
      expect(line(tn)).toBe(line(base));
      expect(line(tn)).toContain(`[To be confirmed: case type] No. _____ of ${year}`);
    });

    it('a non-family court (sessions, bail_regular) still renders its old case number', () => {
      const sessions = courts.find((c) => c.courtId === 'bihar_sessions_patna')!;
      const rule = JSON.parse(
        readFileSync(join(SRC, 'config/court-rules', `${sessions.formattingRulesRef}.json`), 'utf-8'),
      );
      const txt = renderCauseTitle('bail_regular', sessions, rule);
      expect(txt).toContain(`Criminal Miscellaneous Case No. _____ of ${year}`);
      expect(txt).not.toContain('[To be confirmed');
    });
  });

  describe('rule shape', () => {
    it.each(['default', 'bihar', 'jharkhand', 'uttar_pradesh', 'delhi'])(
      'block %s has default plus the 7 matter keys',
      (state) => {
        const block = familyRule.case_nomenclature[state];
        expect(block).toBeDefined();
        expect(Object.keys(block).sort()).toEqual(
          [
            'default',
            'divorce',
            'divorce_mutual_consent',
            'divorce_sma',
            'guardianship',
            'judicial_separation',
            'maintenance',
            'restitution',
          ].sort(),
        );
      },
    );
  });

  describe('familyCaseNomenclature', () => {
    const rule = (block: Record<string, string> | undefined) =>
      ({
        courtId: 'family_court',
        case_nomenclature: block ? { default: block } : {},
      }) as unknown as Parameters<typeof familyCaseNomenclature>[0];

    it('returns the rule file value for the matter key', () => {
      const r = rule({ default: 'D No. _____ of {year}', divorce: 'X No. _____ of {year}' });
      expect(familyCaseNomenclature(r, 'divorce_hma')).toBe('X No. _____ of {year}');
    });

    it('falls back to the block default when the matter key is missing', () => {
      const r = rule({ default: 'D No. _____ of {year}' });
      expect(familyCaseNomenclature(r, 'divorce_hma')).toBe('D No. _____ of {year}');
    });

    it('falls back to the placeholder when the default block is removed too', () => {
      expect(familyCaseNomenclature(rule(undefined), 'divorce_hma')).toBe(PLACEHOLDER_YEAR);
      expect(familyCaseNomenclature(rule({}), 'rcr_petition')).toBe(PLACEHOLDER_YEAR);
    });

    it('maps rcr_petition to restitution', () => {
      const r = rule({ default: 'D', restitution: 'R No. _____ of {year}' });
      expect(familyCaseNomenclature(r, 'rcr_petition')).toBe('R No. _____ of {year}');
    });

    it('returns null for a rule that is not family_court', () => {
      expect(
        familyCaseNomenclature(
          {
            courtId: 'bihar_district',
            case_nomenclature: { default: { divorce: 'X' } },
          } as unknown as Parameters<typeof familyCaseNomenclature>[0],
          'divorce_hma',
        ),
      ).toBeNull();
    });

    it('returns null for bail_regular with the real family rule', () => {
      expect(familyCaseNomenclature(familyRule, 'bail_regular')).toBeNull();
    });
  });
});
