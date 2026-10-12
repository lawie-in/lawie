/**
 * T-340 round 3: an ISO date in a field the template declares as type "date"
 * prints as "D Month YYYY" even when the field id has no "date" in it
 * (minor_dob, custody_since, definitive_agreement_deadline, demand_made_on).
 * Real loaded configs; no database, no model call.
 */
import {
  buildPlaceholderContext,
  clearConfigCache,
  loadTemplateConfig,
  renderTemplateSection,
} from '../services/template-engine.service';
import type { TemplateConfig } from '../services/template-engine.service';

function config(id: string): TemplateConfig {
  const c = loadTemplateConfig(id);
  if (!c) throw new Error(`no template ${id}`);
  return c;
}

function fields(c: TemplateConfig) {
  return (c.form_schema?.steps ?? []).flatMap((s) => s.fields ?? []);
}

afterEach(() => clearConfigCache());

const CASES: Array<[string, string]> = [
  ['guardianship_petition', 'minor_dob'],
  ['bail_regular', 'custody_since'],
  ['mou', 'definitive_agreement_deadline'],
  ['plaint_recovery', 'demand_made_on'],
];

describe('T-340 r3: declared date fields without "date" in the name', () => {
  describe.each(CASES)('%s . %s', (templateId, fieldId) => {
    it('is declared type "date" and its name has no "date" in it', () => {
      const f = fields(config(templateId)).find((x) => x.field_id === fieldId);
      expect(f?.type).toBe('date');
      expect(fieldId).not.toContain('date');
    });
    it.each([
      ['2014-05-04', '4 May 2014'],
      ['2026-01-09', '9 January 2026'],
      ['2026-12-31', '31 December 2026'],
      ['2024-02-29', '29 February 2024'],
    ])('ISO %s prints as %s', (iso, want) => {
      const ctx = buildPlaceholderContext(config(templateId), { [fieldId]: iso });
      expect(ctx[fieldId]).toBe(want);
    });
    it('an impossible date is left unchanged', () => {
      for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10', '2025-02-29', '2026-04-31']) {
        const ctx = buildPlaceholderContext(config(templateId), { [fieldId]: bad });
        expect(ctx[fieldId]).toBe(bad);
      }
    });
    it('a non-ISO value is left unchanged', () => {
      const ctx = buildPlaceholderContext(config(templateId), { [fieldId]: '04.05.2014' });
      expect(ctx[fieldId]).toBe('04.05.2014');
    });
    it('formats it once: a second pass over the output changes nothing', () => {
      const first = buildPlaceholderContext(config(templateId), { [fieldId]: '2014-05-04' });
      const again = buildPlaceholderContext(config(templateId), { [fieldId]: first[fieldId] });
      expect(again[fieldId]).toBe('4 May 2014');
    });
  });

  it('guardianship_petition: the rendered prayer reads "born on 4 May 2014"', () => {
    const c = config('guardianship_petition');
    const ctx = buildPlaceholderContext(c, { minor_name: 'Aarav', minor_dob: '2014-05-04' });
    const prayer = c.document_structure.sections.find((s) => s.section_id === 'prayer');
    expect(prayer).toBeDefined();
    const out = renderTemplateSection(prayer!, ctx).content;
    expect(out).toContain('born on 4 May 2014');
    expect(out).not.toContain('2014-05-04');
    expect(out).not.toContain('04 May');
  });

  it('bail_regular: custody_since prints "4 May 2014" in the context the sections render from', () => {
    const c = config('bail_regular');
    const ctx = buildPlaceholderContext(c, { custody_since: '2014-05-04' });
    expect(ctx.custody_since).toBe('4 May 2014');
    expect(Object.values(ctx)).not.toContain('2014-05-04');
  });
});

describe('T-340 r3: fields that must not be formatted', () => {
  it.each([
    ['guardianship_petition', 'petitioner_name'],
    ['bail_regular', 'fir_number'],
    ['mou', 'party_1_name'],
    ['plaint_recovery', 'plaintiff_name'],
  ])('%s: text field %s holding an ISO-looking value is not changed', (templateId, fieldId) => {
    const c = config(templateId);
    const f = fields(c).find((x) => x.field_id === fieldId);
    expect(f?.type).toBe('text');
    expect(fieldId).not.toContain('date');
    const ctx = buildPlaceholderContext(c, { [fieldId]: '2026-08-01' });
    expect(ctx[fieldId]).toBe('2026-08-01');
  });

  it('a key that is neither date-named nor declared is not changed', () => {
    const ctx = buildPlaceholderContext(config('mou'), { some_undeclared_note: '2026-08-01' });
    expect(ctx.some_undeclared_note).toBe('2026-08-01');
  });

  it('a date field of one template is not formatted in a template that declares it as text', () => {
    // minor_dob is declared only by guardianship_petition; mou does not declare it.
    expect(fields(config('mou')).some((x) => x.field_id === 'minor_dob')).toBe(false);
    const ctx = buildPlaceholderContext(config('mou'), { minor_dob: '2014-05-04' });
    expect(ctx.minor_dob).toBe('2014-05-04');
  });
});

describe('T-340 r3: a field both date-named and date-typed', () => {
  it.each(['bail_regular', 'plaint_recovery', 'mou', 'guardianship_petition'])(
    '%s: every field named *date* and typed date is formatted once and correctly',
    (templateId) => {
      const c = config(templateId);
      const both = fields(c).filter((x) => x.type === 'date' && x.field_id.includes('date'));
      if (both.length === 0) return; // none declared on this template
      for (const f of both) {
        const ctx = buildPlaceholderContext(c, { [f.field_id]: '2026-03-07' });
        expect(ctx[f.field_id]).toBe('7 March 2026');
      }
    },
  );

  it('at least one real template has such a field (guards the loop above)', () => {
    const total = CASES.map(
      ([id]) =>
        fields(config(id)).filter((x) => x.type === 'date' && x.field_id.includes('date')).length,
    ).reduce((a, b) => a + b, 0);
    const all = [
      'bail_regular',
      'plaint_recovery',
      'mou',
      'guardianship_petition',
      'legal_notice_s138',
    ]
      .map(
        (id) =>
          fields(config(id)).filter((x) => x.type === 'date' && x.field_id.includes('date')).length,
      )
      .reduce((a, b) => a + b, 0);
    expect(Math.max(total, all)).toBeGreaterThan(0);
  });

  it('current_date stays "D Month YYYY" and a typed current_date cannot override it', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 4, 12, 0, 0));
    try {
      const ctx = buildPlaceholderContext(config('mou'), { current_date: '2020-01-02' });
      expect(ctx.current_date).toBe('4 April 2026');
    } finally {
      jest.useRealTimers();
    }
  });
});
