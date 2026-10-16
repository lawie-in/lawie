/**
 * T-500 step A (Ajay 088fc4f7, 2e536158, AJ-500-M1): the one police-station
 * strip. Expectations are typed by hand from the signed text, not computed.
 * Callers: the D1 renderer (body, see t500-entries.test.ts), the template
 * engine (cause title, prayer) and the annexures.
 */
import './setupEnv';
import './setupDb';

import { stripPoliceStationPrefix } from '../services/draft-renderer';
import { policeStationName } from '../services/police-station';
import { buildAnnexuresPack } from '../services/annexures.service';
import {
  buildPlaceholderContext,
  loadTemplateConfig,
  renderTemplateSection,
} from '../services/template-engine.service';

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

describe('policeStationName: labels are removed, the name stays', () => {
  it.each([
    ['PS Kadamkuan Police Station', 'Kadamkuan'],
    ['Police Station Kadamkuan', 'Kadamkuan'],
    ['PS Kadamkuan', 'Kadamkuan'],
    ['P.S. Kadamkuan', 'Kadamkuan'],
    ['Kadamkuan P.S.', 'Kadamkuan'],
    ['Kadamkuan PS', 'Kadamkuan'],
    ['Kadamkuan Police Station', 'Kadamkuan'],
    ['Kadamkuan Police Station Police Station', 'Kadamkuan'],
    ['Kadamkuan', 'Kadamkuan'],
    ['  Kadamkuan  ', 'Kadamkuan'],
    ['Thana-Kotwali', 'Kotwali'],
    ['Kadamkuan Thana', 'Kadamkuan'],
    ['कदमकुआं थाना', 'कदमकुआं'],
    ['पुलिस थाना कदमकुआं', 'कदमकुआं'],
    ['पुलिस स्टेशन कदमकुआं', 'कदमकुआं'],
  ])('%j -> %j', (input, out) => {
    expect(policeStationName(input)).toBe(out);
  });

  it('a name that starts with a label word is kept (T139 C2)', () => {
    expect(policeStationName('Thana Bhawan PS')).toBe('Thana Bhawan');
    expect(policeStationName('थाना भवन')).toBe('थाना भवन');
    expect(policeStationName('थाना कदमकुआं')).toBe('थाना कदमकुआं');
  });

  it('label words inside a longer word or name are kept', () => {
    expect(policeStationName('Psalm Nagar')).toBe('Psalm Nagar');
    expect(policeStationName('Station Road')).toBe('Station Road');
    expect(policeStationName('PSKadamkuan')).toBe('PSKadamkuan');
  });

  it('a value that is only a label is left as written', () => {
    expect(policeStationName('PS')).toBe('PS');
    expect(policeStationName('Police Station')).toBe('Police Station');
  });

  it('never leaves a label to print "Police Station ... Police Station"', () => {
    for (const v of [
      'PS Kadamkuan Police Station',
      'Police Station Kadamkuan PS',
      'Kadamkuan P.S.',
    ]) {
      const printed = `Police Station ${policeStationName(v)}`;
      expect(printed).toBe('Police Station Kadamkuan');
    }
  });
});

describe('policeStationName: district only when the advocate wrote District, Distt. or Zila (AJ-500-M1)', () => {
  it.each([
    ['Kadamkuan Police Station, Distt. Patna', 'Kadamkuan, District Patna'],
    ['Kadamkuan PS, Zila Patna', 'Kadamkuan, District Patna'],
    ['Kadamkuan PS, District Patna', 'Kadamkuan, District Patna'],
    ['Kadamkuan PS, Patna District', 'Kadamkuan, District Patna'],
    ['Kadamkuan Distt. Patna', 'Kadamkuan, District Patna'],
    ['Kadamkuan, District Patna', 'Kadamkuan, District Patna'],
  ])('marker written: %j -> %j', (input, out) => {
    expect(policeStationName(input)).toBe(out);
  });

  it.each([
    ['Kadamkuan Police Station, Patna', 'Kadamkuan, Patna'],
    ['Kotwali, Patna', 'Kotwali, Patna'],
    ['Sakchi PS, Jamshedpur', 'Sakchi, Jamshedpur'],
    ['Kadamkuan Thana, Chhapra', 'Kadamkuan, Chhapra'],
    ['Kadamkuan PS, Saran at Chhapra', 'Kadamkuan, Saran at Chhapra'],
  ])('no marker, the place prints as written and is never dropped: %j -> %j', (input, out) => {
    expect(policeStationName(input)).toBe(out);
  });
});

describe('every caller uses the one strip', () => {
  it('the renderer alias is the same function', () => {
    expect(stripPoliceStationPrefix('Kadamkuan Police Station, Distt. Patna')).toBe(
      'Kadamkuan, District Patna',
    );
    expect(stripPoliceStationPrefix).toBe(policeStationName);
  });

  it('template engine: the cause-title/prayer context carries the stripped name', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const ctx = buildPlaceholderContext(
      config,
      {
        court_type: 'sessions',
        currently_in_custody: 'yes_judicial',
        applicant_name: 'Ram Kumar',
        fir_number: '124/2026',
        fir_date: '15/03/2026',
        police_station: 'PS Kadamkuan Police Station, Distt. Patna',
      },
      {},
    );
    expect(ctx.police_station).toBe('Kadamkuan, District Patna');
    const prayer = config.document_structure.sections.find((s) => s.section_id === 'prayer')!;
    const out = renderTemplateSection(prayer, ctx).content;
    // the prayer template writes its own "PS" before the name
    expect(out).toContain('dated 15/03/2026, PS Kadamkuan, District Patna, under Section');
    expect(out).not.toMatch(/PS PS|Police Station[^\n]*Police Station|P\.S\./i);
  });

  it('template engine: a Hindi suffix and a plain place', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const ctx = buildPlaceholderContext(
      config,
      { police_station: 'Kadamkuan Police Station, Patna' },
      {},
    );
    expect(ctx.police_station).toBe('Kadamkuan, Patna');
  });

  describe('annexures', () => {
    let html = '';
    beforeAll(async () => {
      const puppeteer = jest.requireMock('puppeteer') as { launch: jest.Mock };
      const page = (await (await puppeteer.launch()).newPage()) as { setContent: jest.Mock };
      page.setContent.mockImplementation((h: string) => {
        html = h;
        return Promise.resolve(undefined);
      });
      await buildAnnexuresPack({
        formData: {
          template_id: 'bail_anticipatory',
          court_id: 'bihar_district',
          court_type: 'district_court',
          state: 'Bihar',
          applicant_name: 'Ramesh Kumar',
          respondent_name: 'State of Bihar',
          fir_number: '091/2024',
          fir_date: '15.06.2024',
          police_station: 'PS Kadamkuan Police Station, Distt. Patna',
          sections_charged: ['103'],
        },
        bodyParaCount: 8,
        advocateName: 'Adv. Ravi Shankar',
        enrollmentNumber: 'BAR/2018/1234',
      });
    });

    it('prints the stripped name in the synopsis and in the list of dates', () => {
      expect(html).toContain('PS: Kadamkuan, District Patna');
      expect(html).toContain('registered at PS Kadamkuan, District Patna');
      expect(html).not.toMatch(/PS:? PS /);
      expect(html).not.toContain('Police Station, Distt.');
    });
  });
});
