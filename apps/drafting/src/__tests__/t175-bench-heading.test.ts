/**
 * T-175 — A Lucknow Bench court picked from the courts list prints its own heading.
 * Puppeteer is mocked; the annexures test asserts on the HTML handed to page.setContent.
 */

import './setupEnv';
import './setupDb';

import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

// eslint-disable-next-line import/order
import { buildAnnexuresPack } from '../services/annexures.service';
import {
  chosenCourtHeading,
  loadCourtRule,
  type CourtLookupData,
} from '../services/template-engine.service';

interface CourtEntry {
  courtId: string;
  designation: string;
  city: string;
  caseNomenclature: string;
  formattingRulesRef: string;
  courtType?: string;
  state?: string;
}

const COURTS_PATH = join(__dirname, '..', 'config', 'courts', 'indian-courts.json');

function findEntries(node: unknown, out: Map<string, CourtEntry>): void {
  if (Array.isArray(node)) {
    node.forEach((n) => findEntries(n, out));
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.courtId === 'string' && typeof o.designation === 'string') {
      out.set(o.courtId, o as unknown as CourtEntry);
    }
    Object.values(o).forEach((v) => findEntries(v, out));
  }
}

const ENTRIES = new Map<string, CourtEntry>();
findEntries(JSON.parse(readFileSync(COURTS_PATH, 'utf-8')), ENTRIES);

function courtFor(courtId: string, over: Partial<CourtLookupData> = {}): CourtLookupData {
  const e = ENTRIES.get(courtId);
  if (!e) throw new Error(`court ${courtId} not in indian-courts.json`);
  return {
    designation: e.designation,
    city: e.city,
    caseNomenclature: e.caseNomenclature,
    formattingRulesRef: e.formattingRulesRef,
    courtType: e.courtType,
    state: e.state,
    courtRule: loadCourtRule(e.formattingRulesRef) ?? undefined,
    ...over,
  };
}

const ALLAHABAD = 'IN THE HIGH COURT OF JUDICATURE AT ALLAHABAD';
const ALLAHABAD_DESIGNATION = 'HIGH COURT OF JUDICATURE AT ALLAHABAD';
const LUCKNOW = 'IN THE HIGH COURT OF JUDICATURE AT ALLAHABAD, LUCKNOW BENCH';
const LUCKNOW_DESIGNATION = 'HIGH COURT OF JUDICATURE AT ALLAHABAD, LUCKNOW BENCH';

describe('T-175 bench heading from the courts list', () => {
  it('AC1: Lucknow entry prints the Lucknow Bench header and designation', () => {
    expect(ENTRIES.get('allahabad_hc_lucknow')?.formattingRulesRef).toBe('allahabad_hc');
    expect(loadCourtRule('allahabad_hc')?.designation).toBe(ALLAHABAD);
    const h = chosenCourtHeading(courtFor('allahabad_hc_lucknow'));
    expect(h).toEqual({ header: LUCKNOW, designation: LUCKNOW_DESIGNATION });
  });

  describe('AC2: other High Court headings are unchanged', () => {
    it.each([
      ['patna_hc', 'IN THE HIGH COURT OF JUDICATURE AT PATNA', 'HIGH COURT OF JUDICATURE AT PATNA'],
      ['delhi_hc', 'IN THE HIGH COURT OF DELHI AT NEW DELHI', 'HIGH COURT OF DELHI AT NEW DELHI'],
      ['jharkhand_hc', 'IN THE HIGH COURT OF JHARKHAND AT RANCHI', 'HIGH COURT OF JHARKHAND AT RANCHI'],
      ['allahabad_hc', ALLAHABAD, ALLAHABAD_DESIGNATION],
      ['allahabad_hc_prayagraj', ALLAHABAD, ALLAHABAD_DESIGNATION],
    ])('%s', (courtId, header, designation) => {
      expect(chosenCourtHeading(courtFor(courtId))).toEqual({ header, designation });
    });
  });

  it('AC3: a sessions court heading is unchanged', () => {
    expect(chosenCourtHeading(courtFor('bihar_sessions_patna'))).toEqual({
      header: 'IN THE COURT OF DISTRICT & SESSIONS JUDGE, PATNA',
      designation: 'DISTRICT & SESSIONS JUDGE, PATNA',
    });
  });

  it('AC4: rendering Lucknow does not mutate the cached allahabad_hc rule', () => {
    const rule = loadCourtRule('allahabad_hc')!;
    const before = JSON.stringify(rule);
    chosenCourtHeading(courtFor('allahabad_hc_lucknow'));
    expect(loadCourtRule('allahabad_hc')).toBe(rule);
    expect(JSON.stringify(loadCourtRule('allahabad_hc'))).toBe(before);
    expect(loadCourtRule('allahabad_hc')?.designation).toBe(ALLAHABAD);
    expect(chosenCourtHeading(courtFor('allahabad_hc'))?.header).toBe(ALLAHABAD);
    expect(chosenCourtHeading(courtFor('allahabad_hc_prayagraj'))?.header).toBe(ALLAHABAD);
  });

  describe('edge cases', () => {
    it('an empty entry designation yields no chosen heading (callers keep their fallback)', () => {
      expect(chosenCourtHeading(courtFor('allahabad_hc_lucknow', { designation: '' }))).toBeUndefined();
      expect(chosenCourtHeading(courtFor('allahabad_hc_lucknow', { designation: '   ' }))).toBeUndefined();
    });

    it('an entry designation with " / " falls back to the rule line', () => {
      const h = chosenCourtHeading(
        courtFor('allahabad_hc_lucknow', {
          designation: 'IN THE HIGH COURT OF JUDICATURE AT ALLAHABAD / LUCKNOW BENCH',
        }),
      );
      expect(h).toEqual({ header: ALLAHABAD, designation: ALLAHABAD_DESIGNATION });
    });

    it('an entry designation differing only by surrounding spaces counts as equal', () => {
      const h = chosenCourtHeading(courtFor('allahabad_hc', { designation: `  ${ALLAHABAD}  ` }));
      expect(h).toEqual({ header: ALLAHABAD, designation: ALLAHABAD_DESIGNATION });
    });

    it('an entry designation that is not a High Court does not replace the rule line', () => {
      const h = chosenCourtHeading(
        courtFor('allahabad_hc_lucknow', { designation: 'IN THE COURT OF SOMETHING ELSE' }),
      );
      expect(h?.header).toBe(ALLAHABAD);
    });
  });

  describe('AC6: annexures pack', () => {
    const FORM: Record<string, unknown> = {
      template_id: 'bail_anticipatory',
      court_id: 'allahabad_hc_lucknow',
      court_type: 'high_court',
      state: 'Uttar Pradesh',
      applicant_name: 'Ramesh Kumar',
      father_name: 'Suresh Kumar',
      applicant_age: 35,
      applicant_address: 'Village Mirza, Lucknow, Uttar Pradesh',
      respondent_name: 'State of Uttar Pradesh',
      fir_number: '091/2024',
      fir_date: '15.06.2024',
      incident_date: '10.06.2024',
      police_station: 'Hazratganj PS',
      advocate_name: 'Adv. Ravi Shankar',
      enrollment_number: 'UP/2018/1234',
      sections_charged: ['103', '109'],
    };

    async function packHtml(courtData?: CourtLookupData): Promise<string> {
      const puppeteer = jest.requireMock('puppeteer') as { launch: jest.Mock };
      const page = (await (await puppeteer.launch()).newPage()) as { setContent: jest.Mock };
      let html = '';
      page.setContent.mockImplementation((h: string) => {
        html = h;
        return Promise.resolve(undefined);
      });
      await buildAnnexuresPack({ formData: FORM, bodyParaCount: 8, courtData });
      return html;
    }

    it('Lucknow pack names the Lucknow Bench and has no bare ...AT ALLAHABAD heading', async () => {
      const html = await packHtml(courtFor('allahabad_hc_lucknow'));
      expect(html).toContain('LUCKNOW BENCH');
      expect(html).toContain(LUCKNOW);
      expect(html).not.toMatch(/AT ALLAHABAD(?!, LUCKNOW BENCH)/);
    });

    it('Allahabad pack still prints the bare ...AT ALLAHABAD heading', async () => {
      const html = await packHtml(courtFor('allahabad_hc'));
      expect(html).toContain(ALLAHABAD);
      expect(html).not.toContain('LUCKNOW BENCH');
    });
  });
});
