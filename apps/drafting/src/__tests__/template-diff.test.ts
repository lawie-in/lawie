/**
 * SCRUM-81 — template-diff service unit tests.
 *
 * Covers the dimension scorers + verdict logic. The integration smoke against
 * the live 6-template set lives in the CLI script (`template-diff.ts`); it
 * runs against the filesystem and writes a Markdown report.
 */
import { diffTemplate, formatReport } from '../services/template-diff.service';

describe('template-diff.service', () => {
  describe('diffTemplate — integration against the 6 SCRUM-81 originals', () => {
    const SIX = [
      'bail_anticipatory',
      'bail_regular',
      'consumer_complaint',
      'legal_notice_s138',
      'legal_notice_s80',
      'rent_agreement',
    ];

    it('every original has both an override and a doc-rule on disk', () => {
      for (const id of SIX) {
        const diff = diffTemplate(id);
        expect(diff.hasOverride).toBe(true);
        expect(diff.hasDocRule).toBe(true);
        expect(diff.verdict).not.toBe('missing_source');
      }
    });

    it('produces a numeric maxDrift in [0, 1] for every original', () => {
      for (const id of SIX) {
        const diff = diffTemplate(id);
        expect(diff.maxDrift).toBeGreaterThanOrEqual(0);
        expect(diff.maxDrift).toBeLessThanOrEqual(1);
      }
    });

    it('records a non-empty reason on every verdict', () => {
      for (const id of SIX) {
        const diff = diffTemplate(id);
        expect(diff.reason.length).toBeGreaterThan(0);
      }
    });
  });

  describe('diffTemplate — missing-source semantics', () => {
    it('returns missing_source verdict when both override + doc-rule absent', () => {
      const diff = diffTemplate('definitely_not_a_real_template_id_xyz123');
      expect(diff.verdict).toBe('missing_source');
      expect(diff.hasOverride).toBe(false);
      expect(diff.hasDocRule).toBe(false);
      expect(diff.maxDrift).toBe(1);
    });
  });

  describe('formatReport', () => {
    it('emits a Markdown header + table + per-template detail blocks', () => {
      const diff = diffTemplate('bail_anticipatory');
      const report = formatReport([diff]);
      expect(report).toMatch(/# Template promoter diff report/);
      expect(report).toMatch(/\| Template \| Verdict \|/);
      expect(report).toMatch(/## `bail_anticipatory`/);
      expect(report).toMatch(/\*\*Summary:\*\*/);
    });
  });
});
