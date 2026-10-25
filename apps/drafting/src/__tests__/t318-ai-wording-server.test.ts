/**
 * T-318: the server PDF footer and the annexure footers carry Ajay's signed
 * wording (T-317 file, Addendum 4). The strings are read from the signed file
 * at test time; no legal wording is retyped here.
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
// eslint-disable-next-line import/order
import { contentToHtml } from '../services/pdf-export.service';

const SIGNED_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'handoff',
  'legal',
  'T-317-home-faq-footer-signed.md',
);

/** The backticked text in the last cell of the Addendum 4 row whose first cell contains `where`. */
function signedFor(where: string): string {
  const file = readFileSync(SIGNED_PATH, 'utf8').replace(/\r\n/g, '\n');
  const start = file.indexOf('## Addendum 4');
  if (start < 0) throw new Error('no Addendum 4');
  const rows = file
    .slice(start)
    .split('\n')
    .filter((l) => l.startsWith('|') && l.includes(where));
  if (rows.length !== 1) throw new Error(`expected one row for ${where}, got ${rows.length}`);
  const cell = rows[0].split('|')[2];
  const m = cell.match(/^\s*`([^`]+)`/);
  if (!m) throw new Error(`no backticked text for ${where}`);
  return m[1];
}

const PDF_LINE = signedFor('pdf-export.service.ts');
const ANNEXURE_LINE = signedFor('annexures.service.ts');

const countOf = (hay: string, needle: string) => hay.split(needle).length - 1;

describe('T-318 signed text is read correctly', () => {
  it('reads the two drafting lines', () => {
    expect(PDF_LINE.startsWith('First draft generated with AI.')).toBe(true);
    expect(ANNEXURE_LINE.startsWith('Draft prepared by Lawie')).toBe(true);
  });
});

describe('T-318 server PDF footer', () => {
  it('is exactly the signed line, once, and never says AI-assisted', () => {
    const html = contentToHtml('PRAYER\n\nIt is prayed.', false);
    expect(html).toContain(`<div class="disclaimer">${PDF_LINE}</div>`);
    expect(countOf(html, 'class="disclaimer"')).toBe(1);
    expect(html).not.toMatch(/AI-assisted/i);
  });
});

describe('T-318 annexure footers', () => {
  it('all 7 footers are exactly the signed annexure line, with no AI wording', async () => {
    const puppeteer = jest.requireMock('puppeteer') as { launch: jest.Mock };
    const page = (await (await puppeteer.launch()).newPage()) as { setContent: jest.Mock };
    let html = '';
    page.setContent.mockImplementation((h: string) => {
      html = h;
      return Promise.resolve(undefined);
    });
    await buildAnnexuresPack({
      formData: {
        template_id: 'bail_regular',
        applicant_name: 'Ramesh Kumar',
        respondent_name: 'State of Bihar',
        advocate_name: 'Adv. Ravi Shankar',
        court_id: 'sessions_generic',
      },
      bodyParaCount: 8,
    });
    expect(html).not.toBe('');
    expect(countOf(html, 'class="disclaimer"')).toBe(7);
    expect(countOf(html, `<div class="disclaimer">${ANNEXURE_LINE}</div>`)).toBe(7);
    expect(html).not.toMatch(/AI-assisted/i);
    expect(html).not.toContain('generated with AI');
  });
});
