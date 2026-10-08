/**
 * T-172 — Affidavit placeholders are filled literally (no $-pattern expansion).
 * Puppeteer is mocked; we assert on the HTML handed to page.setContent.
 */

import './setupEnv';
import './setupDb';

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

const BASE_BIHAR: Record<string, unknown> = {
  template_id: 'bail_anticipatory',
  court_id: 'bihar_district',
  court_type: 'district_court',
  state: 'Bihar',
  applicant_name: 'Ramesh Kumar',
  father_name: 'Suresh Kumar',
  applicant_age: 35,
  applicant_address: 'Village Mirza, Patna, Bihar',
  respondent_name: 'State of Bihar',
  fir_number: '091/2024',
  fir_date: '15.06.2024',
  incident_date: '10.06.2024',
  police_station: 'Kotwali PS',
  advocate_name: 'Adv. Ravi Shankar',
  enrollment_number: 'BAR/2018/1234',
  sections_charged: ['103', '109'],
};


async function render(formData: Record<string, unknown>): Promise<string> {
  const puppeteer = jest.requireMock('puppeteer') as { launch: jest.Mock };
  const page = (await (await puppeteer.launch()).newPage()) as { setContent: jest.Mock };
  let html = '';
  page.setContent.mockImplementation((h: string) => {
    html = h;
    return Promise.resolve(undefined);
  });
  await buildAnnexuresPack({ formData, bodyParaCount: 8 });
  return html;
}


const bihar = (extra: Record<string, unknown>) => render({ ...BASE_BIHAR, ...extra });

const PLACEHOLDERS = ['{deponent_name}', '{designation}', '{body_para_count}', '{place}', '{date}'];

describe('T-172 affidavit literal replacement', () => {
  it('AC2: name with $& prints literally and keeps no placeholder', async () => {
    const html = await bihar({ applicant_name: 'Ram $& Sons' });
    expect(html).toContain('Ram $&amp; Sons');
    expect(html).not.toContain('{deponent_name}');
  });

  it("AC2: place with $' prints literally and template tail is not duplicated", async () => {
    const baseline = await bihar({ place: 'Delhi' });
    const html = await bihar({ place: "Delhi $' X" });
    expect(html).toContain("Delhi $' X");
    const count = (s: string) => s.split('DEPONENT').length - 1;
    expect(count(html)).toBe(count(baseline));
    const occurrences = html.split("Delhi $' X").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(1);
    expect(html.length - baseline.length).toBe(occurrences * ("Delhi $' X".length - 'Delhi'.length));
  });

  it.each(['$$', '$`', '$1', "$'", '$&'])('designation %s prints literally', async (tok) => {
    const designation = `Director ${tok} Ltd`;
    const baseline = await bihar({ deponent_designation: 'Director Ltd' });
    const html = await bihar({ deponent_designation: designation });
    expect(html).toContain(`Director ${tok.replace(/&/g, '&amp;')} Ltd`);
    for (const p of PLACEHOLDERS) expect(html).not.toContain(p);
    // designation prints twice (verification + paragraph 1); '&' escapes to '&amp;' (+4)
    const per = tok.length + 1 + (tok === '$&' ? 4 : 0);
    expect(html.length - baseline.length).toBe(per * 2);
  });

  it('regression: input without $ fills all five placeholders', async () => {
    const html = await bihar({
      applicant_name: 'Ramesh Kumar',
      deponent_designation: 'the Petitioner',
      place: 'Patna',
    });
    for (const p of PLACEHOLDERS) expect(html).not.toContain(p);
    expect(html).toContain('Ramesh Kumar');
    expect(html).toContain('Patna');
  });
});
