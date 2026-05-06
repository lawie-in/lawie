import './setupEnv';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const COURTS_JSON_PATH = join(__dirname, '../config/courts/indian-courts.json');
const COURT_RULES_DIR = join(__dirname, '../config/court-rules');

interface CourtEntry {
  courtId: string;
  name: string;
  formattingRulesRef: string;
  courtType: string;
  stateId: string;
  city: string;
  supportedLanguages?: string[];
}

interface CourtsFile {
  states: { id: string; name: string }[];
  court_types: { id: string; label: string }[];
  courts: CourtEntry[];
}

interface CourtRuleFile {
  courtId: string;
  courtType: string;
  designation: string;
  cause_title_format: string;
  party_designation: Record<string, string>;
  case_nomenclature: Record<string, string>;
  para_numbering: { style: string; startAt: number; format: string; indentLevel: number };
  prayer_language: { opening: string; closing: string; tone: string };
  verification_format: string;
  supported_languages: string[];
  [key: string]: unknown;
}

const REQUIRED_RULE_FIELDS = [
  'cause_title_format',
  'party_designation',
  'case_nomenclature',
  'para_numbering',
  'prayer_language',
  'verification_format',
  'supported_languages',
];

// Load data
const courtsData: CourtsFile = JSON.parse(readFileSync(COURTS_JSON_PATH, 'utf-8'));
const ruleFiles = readdirSync(COURT_RULES_DIR).filter((f) => f.endsWith('.json'));

describe('Court Rules — Data Integrity (SCRUM-50 CLO review)', () => {
  // ── Test 1: Every court's formattingRulesRef resolves to existing rule file ──
  describe('formattingRulesRef resolution', () => {
    it.each(courtsData.courts)(
      '$courtId → $formattingRulesRef resolves to a rule file',
      (court) => {
        const rulePath = join(COURT_RULES_DIR, `${court.formattingRulesRef}.json`);
        expect(existsSync(rulePath)).toBe(true);
      },
    );
  });

  // ── Test 2: Every rule file has all 7 required fields ──────────────────────
  describe('required fields present in every rule file', () => {
    it.each(ruleFiles)('%s has all 7 required fields', (filename) => {
      const filePath = join(COURT_RULES_DIR, filename);
      const rule: CourtRuleFile = JSON.parse(readFileSync(filePath, 'utf-8'));

      for (const field of REQUIRED_RULE_FIELDS) {
        expect(rule).toHaveProperty(field);
        const val = rule[field];
        // Non-empty check
        if (typeof val === 'string') {
          expect(val.length).toBeGreaterThan(0);
        } else if (Array.isArray(val)) {
          expect(val.length).toBeGreaterThan(0);
        } else if (typeof val === 'object' && val !== null) {
          expect(Object.keys(val).length).toBeGreaterThan(0);
        }
      }
    });

    it.each(ruleFiles)('%s party_designation has state field', (filename) => {
      const rule: CourtRuleFile = JSON.parse(
        readFileSync(join(COURT_RULES_DIR, filename), 'utf-8'),
      );
      expect(rule.party_designation).toHaveProperty('state');
      expect(rule.party_designation.state.length).toBeGreaterThan(0);
    });

    it.each(ruleFiles)('%s para_numbering has valid structure', (filename) => {
      const rule: CourtRuleFile = JSON.parse(
        readFileSync(join(COURT_RULES_DIR, filename), 'utf-8'),
      );
      expect(rule.para_numbering.style).toMatch(/^(numeric|roman|alpha)$/);
      expect(rule.para_numbering.startAt).toBeGreaterThanOrEqual(1);
      expect(rule.para_numbering.format).toBeDefined();
    });

    it.each(ruleFiles)('%s prayer_language has valid tone', (filename) => {
      const rule: CourtRuleFile = JSON.parse(
        readFileSync(join(COURT_RULES_DIR, filename), 'utf-8'),
      );
      expect(rule.prayer_language.tone).toMatch(/^(humble|assertive|neutral)$/);
      expect(rule.prayer_language.opening.length).toBeGreaterThan(10);
      expect(rule.prayer_language.closing.length).toBeGreaterThan(10);
    });
  });

  // ── Test 3: case_nomenclature lookup by document type returns non-empty ────
  describe('case_nomenclature lookup', () => {
    const DOC_TYPES = ['regular_bail', 'anticipatory_bail'];

    it.each(ruleFiles)('%s has bail nomenclature (regular or anticipatory)', (filename) => {
      const rule: CourtRuleFile = JSON.parse(
        readFileSync(join(COURT_RULES_DIR, filename), 'utf-8'),
      );
      // Civil-only courts don't need bail nomenclature
      const civilOnlyTypes = ['district_court', 'consumer_commission'];
      if (rule.courtId === 'district_court_generic') {
        expect(rule.case_nomenclature.civil_suit).toBeDefined();
      } else if (rule.courtType === 'consumer_commission') {
        expect(rule.case_nomenclature.consumer_complaint).toBeDefined();
      } else if (!civilOnlyTypes.includes(rule.courtType)) {
        const hasBail = DOC_TYPES.some((dt) => rule.case_nomenclature[dt]);
        expect(hasBail).toBe(true);
      }
    });

    it('case_nomenclature entries contain {year} placeholder', () => {
      for (const filename of ruleFiles) {
        const rule: CourtRuleFile = JSON.parse(
          readFileSync(join(COURT_RULES_DIR, filename), 'utf-8'),
        );
        for (const [docType, format] of Object.entries(rule.case_nomenclature)) {
          expect(format).toContain('{year}');
          // Should not be empty
          expect(format.replace('{year}', '').trim().length).toBeGreaterThan(5);
          // Prevent test from being useless
          expect(docType.length).toBeGreaterThan(0);
        }
      }
    });
  });

  // ── Test 4: Prompt merge — cause_title_format placeholders resolve ─────────
  describe('cause_title_format placeholder merge', () => {
    const MOCK_DATA: Record<string, string> = {
      caseNomenclature: 'Cr. Misc. No. 123 of 2026',
      petitioner: 'Ram Kumar',
      respondent: 'State of Bihar',
      courtDesignation: 'IN THE COURT OF SESSIONS JUDGE, PATNA',
      benchDesignation: 'SINGLE BENCH (HON. MR. JUSTICE XYZ)',
      city: 'Patna',
      complainant: 'Ravi Kumar',
      opposite_party: 'XYZ Pvt. Ltd.',
    };

    it.each(ruleFiles)('%s cause_title_format merges without unfilled placeholders', (filename) => {
      const rule: CourtRuleFile = JSON.parse(
        readFileSync(join(COURT_RULES_DIR, filename), 'utf-8'),
      );
      let merged = rule.cause_title_format;
      for (const [key, val] of Object.entries(MOCK_DATA)) {
        merged = merged.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
      }
      // After merge, no {placeholder} tokens should remain
      const remaining = merged.match(/\{(\w+)\}/g);
      expect(remaining).toBeNull();
    });

    it.each(ruleFiles)(
      '%s verification_format merges without unfilled placeholders',
      (filename) => {
        const rule: CourtRuleFile = JSON.parse(
          readFileSync(join(COURT_RULES_DIR, filename), 'utf-8'),
        );
        const verificationData: Record<string, string> = {
          deponent_name: 'Ram Kumar',
          designation: 'Petitioner',
          body_para_count: '8',
          place: 'Patna',
          date: '03.05.2026',
        };
        let merged = rule.verification_format;
        for (const [key, val] of Object.entries(verificationData)) {
          merged = merged.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
        }
        const remaining = merged.match(/\{(\w+)\}/g);
        expect(remaining).toBeNull();
      },
    );
  });

  // ── Test 5: Consistency checks ─────────────────────────────────────────────
  describe('consistency', () => {
    it('all court entries have supported_languages as non-empty array', () => {
      for (const court of courtsData.courts) {
        expect(Array.isArray(court.supportedLanguages)).toBe(true);
        expect(court.supportedLanguages!.length).toBeGreaterThan(0);
      }
    });

    it('no rule file uses {district} in causeListFormat (standardised to {city})', () => {
      for (const filename of ruleFiles) {
        const rule = JSON.parse(readFileSync(join(COURT_RULES_DIR, filename), 'utf-8'));
        if (rule.formattingPreferences?.causeListFormat) {
          expect(rule.formattingPreferences.causeListFormat).not.toContain('{district}');
        }
      }
    });

    it('HC rule files have eFilingMandatory: true', () => {
      const hcFiles = ['patna_hc.json', 'delhi_hc.json', 'jharkhand_hc.json', 'allahabad_hc.json'];
      for (const filename of hcFiles) {
        const rule = JSON.parse(readFileSync(join(COURT_RULES_DIR, filename), 'utf-8'));
        expect(rule.eFilingMandatory).toBe(true);
      }
    });

    it('no rule file has displayName field (single source of truth in indian-courts.json)', () => {
      for (const filename of ruleFiles) {
        const rule = JSON.parse(readFileSync(join(COURT_RULES_DIR, filename), 'utf-8'));
        expect(rule).not.toHaveProperty('displayName');
      }
    });

    it('CJM courts reference cjm_generic, not *_district', () => {
      const cjmCourts = courtsData.courts.filter((c) => c.courtType === 'cjm');
      for (const court of cjmCourts) {
        expect(court.formattingRulesRef).toBe('cjm_generic');
      }
    });

    it('bihar_civil_patna references district_court_generic', () => {
      const court = courtsData.courts.find((c) => c.courtId === 'bihar_civil_patna');
      expect(court?.formattingRulesRef).toBe('district_court_generic');
    });
  });
});
