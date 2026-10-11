/**
 * T-194 phase 1 — the export plumbing for blanks, with a FAKE finder.
 *
 * Ajay's full set (d) is phase 2's function (packages/shared/src/blanks.ts) and is
 * not tested here. This file tests what phase 1 built around the finder: wrapping
 * each blank, the .tbc CSS (Ajay (b)), the header text (Ajay (a)), the Puppeteer
 * options, and the PDF route's wiring. The fake matches `[To be confirmed: …]` only.
 *
 * AC covered: 3 (PDF blanks bold + highlighted), 5 (PDF header), 6 (no blanks: as
 * today), 7 (count includes cause title, prayer, verification), 9 (0 / 1 / several, PDF).
 */
import './setupEnv';
import './setupDb';

import request from 'supertest';

import app from '../app';
import { LawieDocument } from '../models/Document.model';
import type * as PdfService from '../services/pdf-export.service';
import { encrypt } from '../utils/encryption';

const mockLaunch = jest.fn();
const mockRenderPdf = jest.fn();
const mockRouteFinder = jest.fn();

jest.mock('puppeteer', () => ({
  launch: (...args: unknown[]) => mockLaunch(...args),
}));
// The route is driven through a spy on renderPdf and a switchable finder. The unit
// tests use the real module (`real`) for everything else.
jest.mock('../services/pdf-export.service', () => ({
  ...jest.requireActual('../services/pdf-export.service'),
  renderPdf: (...args: unknown[]) => mockRenderPdf(...args),
  findBlanks: (text: string) => mockRouteFinder(text),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const real = jest.requireActual('../services/pdf-export.service') as typeof PdfService;
const { contentToHtml, blanksInContent, draftHeaderText } = real;
type FindBlanks = PdfService.FindBlanks;

/** Test double: finds `[To be confirmed: …]` only. Not Ajay's set (d). */
const fakeFind: FindBlanks = (text) => {
  const out: ReturnType<FindBlanks> = [];
  const re = /\[To be confirmed: ([^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0], label: m[1] });
  }
  return out;
};

const TBC = (label: string) => `[To be confirmed: ${label}]`;
const CSS_RULES = [
  'font-weight: 700',
  'background: #FFFF00',
  'color: #000',
  'print-color-adjust: exact',
  '-webkit-print-color-adjust: exact',
];
const count = (s: string, sub: string) => s.split(sub).length - 1;

describe('draftHeaderText (Ajay (a), signed 11 Oct 2026)', () => {
  it('N = 1 is singular, exactly', () => {
    expect(draftHeaderText(1)).toBe('DRAFT — 1 item to be confirmed');
  });
  it('N > 1 is plural, digits, em dash, exactly', () => {
    expect(draftHeaderText(2)).toBe('DRAFT — 2 items to be confirmed');
    expect(draftHeaderText(7)).toBe('DRAFT — 7 items to be confirmed');
    expect(draftHeaderText(12)).toBe('DRAFT — 12 items to be confirmed');
    expect(draftHeaderText(3).includes('—')).toBe(true);
  });
});

describe('contentToHtml with a finder (plain text)', () => {
  const NONE = 'IN THE COURT\n\nThat the applicant is innocent.\n\nPRAYER\n\nGrant bail.';

  it('0 blanks: byte-identical to the 3-arg call, no .tbc anywhere', () => {
    const plain = contentToHtml(NONE, true, false);
    expect(contentToHtml(NONE, true, false, { findBlanks: fakeFind })).toBe(plain);
    expect(plain).not.toContain('tbc');
    expect(plain).not.toContain('#FFFF00');
  });

  it('no options object at all equals today (4th arg omitted)', () => {
    expect(contentToHtml(NONE, false, true)).toBe(contentToHtml(NONE, false, true, {}));
  });

  it('0 blanks with a startingDraft footer is still byte-identical', () => {
    expect(contentToHtml(NONE, true, true, { findBlanks: fakeFind })).toBe(
      contentToHtml(NONE, true, true),
    );
  });

  it('1 blank: wrapped in span.tbc, marker text and brackets unchanged, CSS added', () => {
    const html = contentToHtml(`FIR dated ${TBC('Date of FIR')} was lodged.`, true, false, {
      findBlanks: fakeFind,
    });
    expect(count(html, '<span class="tbc">')).toBe(1);
    expect(html).toContain(`<span class="tbc">${TBC('Date of FIR')}</span>`);
    expect(html).toContain('.tbc {');
    for (const rule of CSS_RULES) expect(html).toContain(rule);
  });

  it('several blanks: each wrapped once, in order', () => {
    const text = `A ${TBC('One')} B ${TBC('Two')}\n\nC ${TBC('Three')}`;
    const html = contentToHtml(text, true, false, { findBlanks: fakeFind });
    expect(count(html, '<span class="tbc">')).toBe(3);
    expect(count(html, '</span>')).toBe(3);
    const i1 = html.indexOf(TBC('One'));
    const i2 = html.indexOf(TBC('Two'));
    const i3 = html.indexOf(TBC('Three'));
    expect(i1).toBeGreaterThan(-1);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
    for (const l of ['One', 'Two', 'Three']) {
      expect(html).toContain(`<span class="tbc">${TBC(l)}</span>`);
    }
  });

  it('{{MISSING: x}} is converted first (T-147c) and then highlighted as the bracket form', () => {
    const html = contentToHtml('Station {{MISSING: Police station}} here', true, false, {
      findBlanks: fakeFind,
    });
    expect(html).toContain(`<span class="tbc">${TBC('Police station')}</span>`);
    expect(html).not.toContain('{{MISSING');
  });

  it('a blank in a heading line does not stop the line being a heading', () => {
    const html = contentToHtml(`PRAYER ${TBC('Court')}`, true, false, { findBlanks: fakeFind });
    expect(html).toContain('<p class="heading">PRAYER <span class="tbc">');
  });

  it('the CSS is only in the document when N > 0', () => {
    const withBlank = contentToHtml(TBC('x'), true, false, { findBlanks: fakeFind });
    const without = contentToHtml('nothing', true, false, { findBlanks: fakeFind });
    expect(withBlank).toContain('-webkit-print-color-adjust: exact');
    expect(without).not.toContain('print-color-adjust');
    expect(withBlank.indexOf('.tbc')).toBeLessThan(withBlank.indexOf('</style>'));
  });

  it('private-use sentinel characters never reach the output', () => {
    const html = contentToHtml(`a  b ${TBC('x')}  c`, true, false, { findBlanks: fakeFind });
    expect(html).not.toMatch(/[]/);
    expect(count(html, '<span class="tbc">')).toBe(1);
  });
});

describe('contentToHtml with a finder (TipTap HTML)', () => {
  it('0 blanks: byte-identical to the 3-arg call', () => {
    const c = '<p>Hello <strong>world</strong></p>';
    expect(contentToHtml(c, true, false, { findBlanks: fakeFind })).toBe(
      contentToHtml(c, true, false),
    );
  });

  it('1 blank in a paragraph', () => {
    const html = contentToHtml(`<p>FIR ${TBC('FIR number')} filed</p>`, true, false, {
      findBlanks: fakeFind,
    });
    expect(html).toContain(`<p>FIR <span class="tbc">${TBC('FIR number')}</span> filed</p>`);
    for (const rule of CSS_RULES) expect(html).toContain(rule);
  });

  it('several blanks across paragraphs, headings and list items', () => {
    const c = `<h2>VERIFICATION ${TBC('Place')}</h2><p>${TBC('A')} and ${TBC('B')}</p><ul><li>${TBC('C')}</li></ul>`;
    const html = contentToHtml(c, true, false, { findBlanks: fakeFind });
    expect(count(html, '<span class="tbc">')).toBe(4);
    expect(html).toContain(`<li><span class="tbc">${TBC('C')}</span></li>`);
  });

  it('a blank inside an existing inline tag stays inside it and nests', () => {
    const html = contentToHtml(`<p><strong>${TBC('Bold one')}</strong></p>`, true, false, {
      findBlanks: fakeFind,
    });
    expect(html).toContain(`<p><strong><span class="tbc">${TBC('Bold one')}</span></strong></p>`);
  });

  it('a blank spanning a tag boundary nests correctly: one span per text run, none crossing a tag', () => {
    const c = '<p>See [To be confirmed: <strong>Date</strong> of FIR] now</p>';
    const html = contentToHtml(c, true, false, { findBlanks: fakeFind });
    const body = html.slice(html.indexOf('<body>'), html.indexOf('</body>'));
    // every opened span closes before the next tag that is not its own
    expect(body).toContain('<span class="tbc">[To be confirmed: </span>');
    expect(body).toContain('<strong><span class="tbc">Date</span></strong>');
    expect(body).toContain('<span class="tbc"> of FIR]</span>');
    expect(count(body, '<span class="tbc">')).toBe(count(body, '</span>'));
    // stripped of markup, the marker text is unchanged
    expect(body.replace(/<[^>]+>/g, '')).toContain('See [To be confirmed: Date of FIR] now');
    // nesting is well formed: no </strong> while a span is open
    let depth = 0;
    for (const tag of body.match(/<\/?(?:span|strong)[^>]*>/g) ?? []) {
      if (tag.startsWith('<span')) depth++;
      else if (tag === '</span>') depth--;
      else expect(depth).toBe(0);
    }
    expect(depth).toBe(0);
  });

  it('a blank written with HTML entities in the label is found and wrapped once', () => {
    const html = contentToHtml('<p>[To be confirmed: Smith &amp; Sons]</p>', true, false, {
      findBlanks: fakeFind,
    });
    expect(html).toContain('<p><span class="tbc">[To be confirmed: Smith &amp; Sons]</span></p>');
  });
});

describe('blanksInContent (the count the route uses; AC7)', () => {
  it('0 blanks', () => {
    expect(blanksInContent('Nothing to fill.', fakeFind)).toEqual([]);
    expect(blanksInContent('<p>Nothing</p>', fakeFind)).toEqual([]);
  });

  it('1 blank, with its label', () => {
    const b = blanksInContent(`x ${TBC('Date of FIR')}`, fakeFind);
    expect(b).toHaveLength(1);
    expect(b[0].label).toBe('Date of FIR');
    expect(b[0].text).toBe(TBC('Date of FIR'));
  });

  it('counts the cause title, the prayer and the verification, not just the body', () => {
    const doc = [
      `IN THE COURT OF ${TBC('Court name')}`,
      `BAIL APPLICATION ${TBC('Case type')}`,
      'That the applicant is innocent.',
      `PRAYER\n\nGrant bail ${TBC('Prayer detail')}.`,
      `VERIFICATION\n\nVerified at ${TBC('Place')}.`,
    ].join('\n\n');
    expect(blanksInContent(doc, fakeFind).map((b) => b.label)).toEqual([
      'Court name',
      'Case type',
      'Prayer detail',
      'Place',
    ]);
  });

  it('counts the same blanks in the same draft saved as TipTap HTML', () => {
    const html = `<h1>IN THE COURT OF ${TBC('Court name')}</h1><p>body</p><h2>PRAYER</h2><p>${TBC('Prayer detail')}</p><h2>VERIFICATION</h2><p>${TBC('Place')}</p>`;
    expect(blanksInContent(html, fakeFind)).toHaveLength(3);
  });

  it('counts {{MISSING: x}} as the converted bracket form, once', () => {
    const b = blanksInContent('a {{MISSING: FIR number}} b', fakeFind);
    expect(b).toHaveLength(1);
    expect(b[0].text).toBe(TBC('FIR number'));
  });

  it('every counted blank is highlighted: at least N spans, and as many closes as opens', () => {
    for (const doc of [
      `a ${TBC('1')}`,
      `a ${TBC('1')} ${TBC('2')}\n\n${TBC('3')}`,
      `<p>${TBC('1')}</p><p>x ${TBC('2')}</p>`,
      '<p>[To be confirmed: <em>x</em> y] and {{MISSING: z}}</p>',
    ]) {
      const n = blanksInContent(doc, fakeFind).length;
      const html = contentToHtml(doc, true, false, { findBlanks: fakeFind });
      const body = html.slice(html.indexOf('<body>'));
      // at least one span per blank
      expect(n).toBeGreaterThan(0);
      expect(count(body, '<span class="tbc">')).toBeGreaterThanOrEqual(n);
      expect(count(body, '<span class="tbc">')).toBe(count(body, '</span>'));
    }
  });

  it('with the phase-1 stub finder nothing is found', () => {
    expect(blanksInContent(`a ${TBC('x')}`)).toEqual([]);
  });
});

describe('renderPdf options (real renderPdf, puppeteer mocked)', () => {
  const pdf = jest.fn();
  const setContent = jest.fn();
  const close = jest.fn();

  beforeEach(() => {
    pdf.mockReset().mockResolvedValue(Buffer.from('%PDF'));
    setContent.mockReset().mockResolvedValue(undefined);
    close.mockReset().mockResolvedValue(undefined);
    mockLaunch.mockReset().mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({ setContent, pdf }),
      close,
    });
  });

  it("without headerText: exactly today's options, no header or footer keys", async () => {
    await real.renderPdf('<html></html>');
    expect(pdf).toHaveBeenCalledTimes(1);
    const opts = pdf.mock.calls[0][0];
    expect(opts).not.toHaveProperty('displayHeaderFooter');
    expect(opts).not.toHaveProperty('headerTemplate');
    expect(opts).not.toHaveProperty('footerTemplate');
    expect(opts.printBackground).toBe(true);
    expect(opts.margin).toMatchObject({ right: '1in' });
    expect(Object.keys(opts).sort()).toEqual(['format', 'margin', 'printBackground'].sort());
    // empty options object and undefined headerText behave the same
    pdf.mockClear();
    await real.renderPdf('<html></html>', { headerText: undefined });
    expect(pdf.mock.calls[0][0]).toEqual(opts);
    pdf.mockClear();
    await real.renderPdf('<html></html>', { headerText: '' });
    expect(pdf.mock.calls[0][0]).toEqual(opts);
  });

  it.each([1, 4])('with headerText for N=%i: header on, exact text, empty footer', async (n) => {
    const text = draftHeaderText(n);
    await real.renderPdf('<html></html>', { headerText: text });
    const opts = pdf.mock.calls[0][0];
    expect(opts.displayHeaderFooter).toBe(true);
    expect(opts.headerTemplate).toContain(text);
    // the footer is empty: nothing visible, so Puppeteer's default date/page footer stays off
    expect(
      String(opts.footerTemplate)
        .replace(/<[^>]*>/g, '')
        .trim(),
    ).toBe('');
    expect(opts.printBackground).toBe(true);
  });

  it('with headerText the base options (page size, margins) are unchanged', async () => {
    await real.renderPdf('<html></html>');
    const base = pdf.mock.calls[0][0];
    pdf.mockClear();
    await real.renderPdf('<html></html>', { headerText: draftHeaderText(2) });
    const withHeader = pdf.mock.calls[0][0];
    expect(withHeader.format).toBe(base.format);
    expect(withHeader.margin).toEqual(base.margin);
  });

  it('the header template keeps the em dash and the digits unescaped', async () => {
    await real.renderPdf('<html></html>', { headerText: draftHeaderText(3) });
    expect(pdf.mock.calls[0][0].headerTemplate).toContain('DRAFT — 3 items to be confirmed');
  });

  it('closes the browser after rendering', async () => {
    await real.renderPdf('<html></html>', { headerText: draftHeaderText(2) });
    expect(close).toHaveBeenCalled();
  });
});

describe('POST /:id/export/pdf (route wiring)', () => {
  const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
  const USER_ID = '507f1f77bcf86cd7994390c1';
  const hdr = {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': USER_ID,
    'x-user-email': 'u@test.com',
    'x-user-name': 'Adv',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };

  async function exportOf(content: string) {
    const doc = await LawieDocument.create({
      userId: USER_ID,
      title: 'Bail Application',
      docType: 'bail_application',
      generatedContent: encrypt(content),
      courtName: 'Patna',
      sectionsCited: [],
    });
    return request(app).post(`/${doc._id}/export/pdf`).set(hdr).send({});
  }

  beforeEach(() => {
    mockRenderPdf.mockReset().mockResolvedValue(Buffer.from('%PDF-1.4 stub'));
    mockRouteFinder.mockReset().mockImplementation((t: string) => real.findBlanks(t));
  });

  const DOC = `IN THE COURT OF ${TBC('Court')}\n\nThat FIR ${TBC('FIR number')} was lodged.\n\nPRAYER\n\nGrant bail.\n\nVERIFICATION\n\nVerified at ${TBC('Place')}.`;

  it('phase-1 stub finder (N = 0): no header, no .tbc, output as before', async () => {
    const res = await exportOf(DOC);
    expect(res.status).toBe(200);
    expect(mockRenderPdf).toHaveBeenCalledTimes(1);
    const [html, opts] = mockRenderPdf.mock.calls[0];
    expect(opts?.headerText).toBeUndefined();
    expect(html).not.toContain('class="tbc"');
    expect(html).not.toContain('#FFFF00');
    expect(html).toBe(contentToHtml(DOC, true, false));
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  it('a draft with no blanks, fake finder in the route: no header, unchanged html', async () => {
    mockRouteFinder.mockImplementation(fakeFind);
    const clean = 'IN THE COURT\n\nAll facts are filled in.';
    const res = await exportOf(clean);
    expect(res.status).toBe(200);
    const [html, opts] = mockRenderPdf.mock.calls[0];
    expect(opts?.headerText).toBeUndefined();
    expect(html).toBe(contentToHtml(clean, true, false));
  });

  it('1 blank (fake finder in the route): singular header, one highlighted blank', async () => {
    mockRouteFinder.mockImplementation(fakeFind);
    const res = await exportOf(`That FIR ${TBC('FIR number')} was lodged.`);
    expect(res.status).toBe(200);
    const [html, opts] = mockRenderPdf.mock.calls[0];
    expect(opts.headerText).toBe('DRAFT — 1 item to be confirmed');
    expect(count(html, '<span class="tbc">')).toBe(1);
  });

  it('several blanks incl. cause title, prayer, verification (fake finder in the route): N in header', async () => {
    mockRouteFinder.mockImplementation(fakeFind);
    const res = await exportOf(DOC);
    expect(res.status).toBe(200);
    const [html, opts] = mockRenderPdf.mock.calls[0];
    expect(opts.headerText).toBe('DRAFT — 3 items to be confirmed');
    expect(count(html, '<span class="tbc">')).toBe(3);
  });

  it('counts from finalContent when the draft has been edited (the saved draft the file is built from)', async () => {
    mockRouteFinder.mockImplementation(fakeFind);
    const doc = await LawieDocument.create({
      userId: USER_ID,
      title: 'Edited',
      docType: 'bail_application',
      generatedContent: encrypt(`a ${TBC('1')} ${TBC('2')}`),
      finalContent: encrypt(`<p>a ${TBC('1')}</p>`),
      courtName: 'Patna',
      sectionsCited: [],
    });
    const res = await request(app).post(`/${doc._id}/export/pdf`).set(hdr).send({});
    expect(res.status).toBe(200);
    expect(mockRenderPdf.mock.calls[0][1].headerText).toBe('DRAFT — 1 item to be confirmed');
  });
});

describe('the exported stub finder (phase-1 seam)', () => {
  it('finds nothing, so no export changes before phase 2', () => {
    expect(real.findBlanks(`a ${TBC('x')} {{MISSING: y}} ____`)).toEqual([]);
  });
});
