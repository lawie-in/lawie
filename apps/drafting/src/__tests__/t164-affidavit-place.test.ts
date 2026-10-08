/**
 * T-164 — Affidavit (Annexure G) place of verification is never "Ranchi" by default.
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

const BASE_JHARKHAND: Record<string, unknown> = {
  template_id: 'bail_anticipatory',
  court_id: 'jharkhand_hc',
  court_type: 'high_court',
  state: 'Jharkhand',
  applicant_name: 'Priya Devi',
  father_name: 'Mohan Lal',
  applicant_age: 28,
  applicant_address: 'HB-47 Harmu Housing Colony, Ranchi, Jharkhand',
  respondent_name: 'State of Jharkhand',
  fir_number: '045/2025',
  fir_date: '20.01.2025',
  incident_date: '18.01.2025',
  police_station: 'Sadar PS',
  advocate_name: 'Adv. Sunita Kumari',
  enrollment_number: 'JHA/2020/567',
  sections_charged: ['103'],
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

describe('T-164 affidavit place of verification', () => {
  it('AC2: place Patna prints "Verified at Patna"', async () => {
    const html = await bihar({ place: 'Patna' });
    expect(html).toContain('ANNEXURE G');
    expect(html).toContain('Verified at Patna');
  });

  it('AC3: only city prints the city', async () => {
    expect(await bihar({ city: 'Lucknow' })).toContain('Verified at Lucknow');
  });

  it('AC3: only district prints the district', async () => {
    expect(await bihar({ district: 'Gaya' })).toContain('Verified at Gaya');
  });

  it('AC3: place wins over city and district', async () => {
    const html = await bihar({ place: 'Patna', city: 'Lucknow', district: 'Gaya' });
    expect(html).toContain('Verified at Patna');
    expect(html).not.toContain('Verified at Lucknow');
    expect(html).not.toContain('Verified at Gaya');
  });

  it('AC3: city wins over district', async () => {
    const html = await bihar({ city: 'Lucknow', district: 'Gaya' });
    expect(html).toContain('Verified at Lucknow');
    expect(html).not.toContain('Verified at Gaya');
  });

  it.each(['', '   '])('AC3: blank place %j falls through to city', async (place) => {
    expect(await bihar({ place, city: 'Lucknow' })).toContain('Verified at Lucknow');
  });

  it('AC3: blank place and city fall through to district', async () => {
    const html = await bihar({ place: ' ', city: '', district: 'Gaya' });
    expect(html).toContain('Verified at Gaya');
  });

  it('trims surrounding whitespace in place', async () => {
    const html = await bihar({ place: '  Patna  ' });
    expect(html).toContain('Verified at Patna');
    expect(html).not.toContain('Verified at   Patna');
  });

  it('AC4: none of the three prints the blank and no Ranchi anywhere', async () => {
    const html = await bihar({});
    expect(html).toContain('Verified at ___________');
    expect(html).not.toContain('Ranchi');
  });

  it('AC4: all-whitespace values print the blank and no Ranchi anywhere', async () => {
    const html = await bihar({ place: ' ', city: '  ', district: '\t' });
    expect(html).toContain('Verified at ___________');
    expect(html).not.toContain('Ranchi');
  });

  it('AC5: Jharkhand form with place Ranchi still prints Ranchi', async () => {
    const html = await render({ ...BASE_JHARKHAND, place: 'Ranchi' });
    expect(html).toContain('Verified at Ranchi');
  });

  it('AC4: Jharkhand form without place/city/district prints the blank', async () => {
    const html = await render(BASE_JHARKHAND);
    expect(html).toContain('Verified at ___________');
    expect(html).not.toContain('Verified at Ranchi');
  });
});
