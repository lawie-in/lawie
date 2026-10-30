/**
 * T-638 Part A: the police-station name in prose. Ajay, T-612 (6), (6a), (6b) and the T-638 rulings A2 and A3
 * (handoff/legal/T-612-bail-grounds-wording-signed.md): the template and the annexures write their own
 * "Police Station", so the typed name loses its station markers by one table, applied twice
 * (once per stage), on every path.
 */
import './setupEnv';

import {
  policeStationName,
  stripStationMarkerOnce,
  stripTrailingStationMarker,
} from '../services/police-station-name';

const mockRenderPdf = jest.fn();
jest.mock('../services/pdf-export.service', () => ({
  renderPdf: (...args: unknown[]) => mockRenderPdf(...args),
}));

// eslint-disable-next-line import/order
import { buildAnnexuresHtml } from '../services/annexures.service';
// eslint-disable-next-line import/order
import { buildPlaceholderContext, loadTemplateConfig } from '../services/template-engine.service';

// ── The leaf: the table applied twice ───────────────────────────────────────

const TABLE: Array<[string, string]> = [
  // PS, P.S., P S, Police Station: leading or trailing, any case
  ['PS Kotwali', 'Kotwali'],
  ['P.S. Kotwali', 'Kotwali'],
  ['P S Kotwali', 'Kotwali'],
  ['Police Station Kotwali', 'Kotwali'],
  ['POLICE STATION KOTWALI', 'KOTWALI'],
  ['Kotwali PS', 'Kotwali'],
  ['Kotwali P.S.', 'Kotwali'],
  ['Kotwali Police Station', 'Kotwali'],
  // Thana: a leading one only with a separator; a bare leading one is part of the name
  ['Thana: Kotwali', 'Kotwali'],
  ['Thana-Kotwali', 'Kotwali'],
  ['Thana – Kotwali', 'Kotwali'],
  ['थाना - कोतवाली', 'कोतवाली'],
  ['Thana Bhawan', 'Thana Bhawan'],
  ['थाना भवन', 'थाना भवन'],
  ['थाना सिविल लाइन्स', 'थाना सिविल लाइन्स'],
  ['थाना Kotwali', 'थाना Kotwali'],
  // a trailing Thana, the last word with a name before it
  ['Kotwali Thana', 'Kotwali'],
  ['Kotwali थाना', 'Kotwali'],
  ['Bhawan thana', 'Bhawan'],
  ['थाना भवन थाना', 'थाना भवन'],
  // पुलिस स्टेशन and पुलिस थाना are never part of a name: stripped in both positions
  ['पुलिस स्टेशन कोतवाली', 'कोतवाली'],
  ['पुलिस थाना कोतवाली', 'कोतवाली'],
  ['कोतवाली पुलिस थाना', 'कोतवाली'],
  ['कोतवाली पुलिस स्टेशन', 'कोतवाली'],
  // two markers: once per stage (6b-3)
  ['PS Thana Bhawan', 'Thana Bhawan'],
  ['Thana Bhawan PS', 'Thana Bhawan'],
  ['PS PS Kadamkuan', 'Kadamkuan'],
  ['P.S. Kotwali Thana', 'Kotwali'],
  ['Thana: Kotwali PS', 'Kotwali'],
  // unchanged: a marker alone, or glued to the name
  ['Psalm Nagar', 'Psalm Nagar'],
  ['KotwaliPS', 'KotwaliPS'],
  ['Chaps', 'Chaps'],
  ['PS', 'PS'],
  ['Police Station', 'Police Station'],
  ['Thana', 'Thana'],
  ['थाना', 'थाना'],
  ['Kotwali', 'Kotwali'],
];

describe('T-638 the leaf: policeStationName', () => {
  it.each(TABLE)('%s -> %s', (input, want) => {
    expect(policeStationName(input)).toBe(want);
  });

  it('is the table applied twice: one stage removes one marker', () => {
    expect(stripStationMarkerOnce('PS PS Kadamkuan')).toBe('PS Kadamkuan');
    expect(policeStationName('PS PS Kadamkuan')).toBe('Kadamkuan');
    expect(stripStationMarkerOnce('PS Thana Bhawan')).toBe('Thana Bhawan');
  });

  it('stripTrailingStationMarker removes one trailing marker only', () => {
    expect(stripTrailingStationMarker('Saraidhela PS')).toBe('Saraidhela');
    expect(stripTrailingStationMarker('कोतवाली पुलिस थाना')).toBe('कोतवाली');
    expect(stripTrailingStationMarker('PS Kotwali')).toBe('PS Kotwali');
    expect(stripTrailingStationMarker('PS')).toBe('PS');
  });
});

// ── The template path agrees with the leaf ──────────────────────────────────

describe('T-638 template path: buildPlaceholderContext agrees with the leaf', () => {
  const DATA = {
    currently_in_custody: 'yes_judicial',
    fir_number: '124/2026',
    fir_date: '15/03/2026',
    sections_charged: 'BNS 103',
    facts_narrative: 'Facts.',
    grounds_for_bail: ['false_implication'],
    applicant_name: 'Ram Kumar',
    father_name: 'Shyam Kumar',
  };
  it.each(TABLE)('bail_regular: %s -> %s', (input, want) => {
    const config = loadTemplateConfig('bail_regular')!;
    const ctx = buildPlaceholderContext(config, { ...DATA, police_station: input });
    expect(ctx.police_station).toBe(want);
    expect(ctx.police_station).toBe(policeStationName(input));
  });
});

// ── The annexures ───────────────────────────────────────────────────────────

describe('T-638 annexures: "registered at Police Station {ps}"', () => {
  const FORM: Record<string, unknown> = {
    template_id: 'bail_anticipatory',
    court_id: 'bihar_district',
    court_type: 'district_court',
    state: 'Bihar',
    applicant_name: 'Ramesh Kumar',
    respondent_name: 'State of Bihar',
    fir_number: '091/2024',
    fir_date: '15.06.2024',
  };
  const part = (form: Record<string, unknown>, heading: string): string =>
    buildAnnexuresHtml({ formData: form }).parts.find((p) => p.heading === heading)!.html;
  const dates = (ps?: string) =>
    part(
      ps === undefined ? FORM : { ...FORM, police_station: ps },
      'List of Dates and Chronology of Events',
    );
  const count = (h: string, n: string) => h.split(n).length - 1;

  it.each(['PS Kotwali', 'Kotwali P.S.', 'Kotwali'])(
    '%s prints the line once, with one prefix',
    (ps) => {
      const html = dates(ps);
      expect(count(html, 'FIR No. 091/2024 registered at Police Station Kotwali')).toBe(1);
      expect(html).not.toContain('registered at PS');
      expect(html).not.toMatch(/Police Station\s+(?:PS|P\.S\.|Police Station)/);
      expect(html).not.toContain('Kotwali P.S.');
    },
  );

  it('"PS Thana Bhawan" keeps Thana, which is part of the name', () => {
    const html = dates('PS Thana Bhawan');
    expect(count(html, 'registered at Police Station Thana Bhawan')).toBe(1);
    expect(html).not.toContain('Police Station Bhawan');
  });

  it('a blank station keeps the blank', () => {
    expect(dates()).toContain('registered at Police Station ___________');
  });

  it('the Synopsis label "PS: {ps}" is unchanged: a label, not prose', () => {
    // T-689c: the Synopsis is attached only for a High Court and a non-denied pack
    const html = buildAnnexuresHtml({
      formData: { ...FORM, police_station: 'Kotwali' },
      rulePackId: 'bail_anticipatory',
      courtType: 'high_court',
    }).parts.find((p) => p.heading === 'Synopsis')!.html;
    expect(html).toContain('PS: Kotwali');
    expect(html).not.toContain('registered at');
  });
});
