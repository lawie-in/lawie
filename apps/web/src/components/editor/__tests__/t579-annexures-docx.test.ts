/**
 * T-579 — annexures as an editable Word file (web side).
 *
 * A. Pin: the draft's Word export (exportDocx) is unchanged by the annexures code.
 *    Expected XML is in fixtures/t579-draft-pin-expected.json, captured from the
 *    code on develop_staging 867c80ea (before this ticket) and checked in unchanged.
 * B. exportAnnexuresDocx on a realistic annexures pack (fixtures/t579-annexures-*.html
 *    are real buildAnnexuresHtml output, bail_anticipatory, Bihar district court; the
 *    "full" one has an address and FIR details, the "sparse" one has neither and a
 *    Hindi applicant name). The file is unzipped and checked against expectations
 *    typed here by hand from the ticket and the signed rulings AJ-579-M1/M2.
 *
 * file-saver is mocked; jsdom has no TextEncoder, so it is polyfilled.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { TextDecoder, TextEncoder } from 'util';

import JSZip from 'jszip';

import { PIN_CASES } from './fixtures/t579-draft-pin-cases';

Object.assign(globalThis, { TextEncoder, TextDecoder });

const mockSaveAs = jest.fn();
jest.mock('file-saver', () => ({ saveAs: (...a: unknown[]) => mockSaveAs(...a) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const utils = require('../exportUtils') as typeof import('../exportUtils');
const { exportDocx, exportAnnexuresDocx, annexuresDocxFilename } = utils;

const FIXTURES = join(__dirname, 'fixtures');
const read = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');

async function unzip(blob: Blob): Promise<JSZip> {
  const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
  return JSZip.loadAsync(buf);
}

beforeEach(() => mockSaveAs.mockClear());

// ── A. the draft export is byte-identical to before ──────────────────────────

describe('T-579 A: exportDocx output is unchanged', () => {
  const expected = JSON.parse(read('t579-draft-pin-expected.json')) as Record<
    string,
    { filename: string; parts: Record<string, string> }
  >;

  it('covers every pinned case', () => {
    expect(Object.keys(expected).sort()).toEqual(PIN_CASES.map((c) => c.name).sort());
  });

  it.each(PIN_CASES.map((c) => [c.name, c] as const))('%s', async (name, c) => {
    await exportDocx(c.html, 'T', c.isFree, c.footer);
    const [blob, filename] = mockSaveAs.mock.calls[0] as [Blob, string];
    const zip = await unzip(blob);
    const want = expected[name];
    expect(filename).toBe(want.filename);
    const wantNames = Object.keys(want.parts).filter((n) => !n.includes('#'));
    const gotNames = Object.keys(zip.files).filter((n) =>
      /^word\/(document|header\d*|footer\d*|numbering|styles)\.xml$/.test(n),
    );
    expect(gotNames.filter((n) => n !== 'word/styles.xml').sort()).toEqual(
      wantNames.filter((n) => n !== 'word/styles.xml').sort(),
    );
    for (const n of wantNames) {
      expect(await zip.files[n].async('string')).toBe(want.parts[n]);
    }
    const { createHash } = await import('crypto');
    const styles = await zip.files['word/styles.xml'].async('string');
    expect(createHash('sha256').update(styles).digest('hex')).toBe(
      want.parts['word/styles.xml#sha256'],
    );
  });
});

// ── B. the annexures Word file ───────────────────────────────────────────────

const DISCLAIMER =
  'Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.';
const HEADINGS = [
  ['ANNEXURE A', 'Memo of Parties'],
  ['ANNEXURE B', 'Synopsis'],
  ['ANNEXURE C', 'List of Dates and Chronology of Events'],
  ['ANNEXURE D', 'Index of Documents Annexed'],
  ['ANNEXURE E', 'Vakalatnama'],
  ['ANNEXURE F', 'Court Fee Paid Statement'],
  ['ANNEXURE G', 'Affidavit'],
] as const;

interface Para {
  el: Element;
  text: string;
  highlighted: string[];
  unhighlighted: string[];
}

interface Parsed {
  xml: Document;
  body: Element;
  paras: Para[]; // every paragraph in document order, table cells included
  zip: JSZip;
}

async function build(fixture: string): Promise<Parsed> {
  await exportAnnexuresDocx(read(fixture), 'Bail Application — Patna HC');
  expect(mockSaveAs).toHaveBeenCalledTimes(1);
  const zip = await unzip(mockSaveAs.mock.calls[0][0] as Blob);
  const xml = new DOMParser().parseFromString(
    await zip.files['word/document.xml'].async('string'),
    'application/xml',
  );
  expect(xml.getElementsByTagName('parsererror')).toHaveLength(0);
  const paras = Array.from(xml.getElementsByTagName('w:p')).map((el) => {
    const highlighted: string[] = [];
    const unhighlighted: string[] = [];
    let text = '';
    for (const r of Array.from(el.children).filter((c) => c.tagName === 'w:r')) {
      let t = '';
      for (const c of Array.from(r.children)) {
        if (c.tagName === 'w:t') t += c.textContent ?? '';
        if (c.tagName === 'w:br') t += '\n';
      }
      text += t;
      const hl = r.getElementsByTagName('w:highlight')[0];
      if (hl?.getAttribute('w:val') === 'yellow') highlighted.push(t);
      else if (t.trim()) unhighlighted.push(t);
    }
    return { el, text, highlighted, unhighlighted };
  });
  return { xml, body: xml.getElementsByTagName('w:body')[0], paras, zip };
}

/** The words of the source HTML body, as a browser would read them. */
function htmlWords(html: string): string[] {
  return htmlText(html).split(/\s+/).filter(Boolean);
}

/** Text of an HTML string, with a space at each line/block/cell boundary. */
function htmlText(html: string): string {
  const spaced = html
    .replace(/<style>[\s\S]*?<\/style>/, '')
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<\/(p|div|li|td|th|h\d|tr)>/g, '$& ');
  return new DOMParser().parseFromString(spaced, 'text/html').body.textContent ?? '';
}

const labelIndexes = (p: Parsed) =>
  HEADINGS.map(([label]) => p.paras.findIndex((x) => x.text === label));

describe.each([
  ['t579-annexures-full.html', 'Affidavit of Ramesh Kumar', 'Copy of FIR No. 091/2024'],
  [
    't579-annexures-sparse.html',
    'Affidavit of राम कुमार',
    'Copy of FIR / Complaint (if available)',
  ],
])('T-579 B: exportAnnexuresDocx(%s)', (fixture, affidavitRow, firRow) => {
  let p: Parsed;
  let saved: [Blob, string];
  beforeAll(async () => {
    mockSaveAs.mockClear();
    p = await build(fixture);
    saved = mockSaveAs.mock.calls[0] as [Blob, string];
  });

  it('saves a .docx blob under the given file name', () => {
    const [blob, name] = saved;
    expect(blob.size).toBeGreaterThan(1000);
    expect(name).toBe('Bail Application  Patna HC_annexures.docx');
  });

  it('is editable text: no images or drawings, no page header or footer (the PDF has none)', () => {
    const names = Object.keys(p.zip.files);
    expect(names.filter((n) => n.startsWith('word/media'))).toEqual([]);
    expect(names.filter((n) => /^word\/(header|footer)/.test(n))).toEqual([]);
    expect(p.xml.getElementsByTagName('w:drawing')).toHaveLength(0);
    expect(p.xml.getElementsByTagName('w:pict')).toHaveLength(0);
  });

  it('has all 7 annexures A to G, in order, each label followed by its signed heading', () => {
    const idx = labelIndexes(p);
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    HEADINGS.forEach(([, heading], n) => {
      expect(p.paras[idx[n] + 1].text).toBe(heading);
    });
  });

  it('headings keep their text; capitals come from formatting only', () => {
    for (const [, heading] of HEADINGS) {
      const para = p.paras.find(
        (x) => x.text === heading && x.el.getElementsByTagName('w:caps').length > 0,
      );
      expect(para).toBeDefined();
      expect(heading).not.toBe(heading.toUpperCase());
    }
    // and no heading was upper-cased in the characters
    expect(p.paras.some((x) => x.text === 'MEMO OF PARTIES')).toBe(false);
    expect(p.paras.some((x) => x.text === 'AFFIDAVIT')).toBe(false);
  });

  it('has exactly 7 disclaimer lines with the signed T-317 text, one at the end of each annexure', () => {
    const lines = p.paras.filter((x) => x.text === DISCLAIMER);
    expect(lines).toHaveLength(7);
    const all = p.paras.map((x) => x.text).join('\n');
    expect(all.split(DISCLAIMER)).toHaveLength(8);
    const idx = labelIndexes(p);
    const ends = [...idx.slice(1), p.paras.length];
    ends.forEach((end, n) => {
      // the last non-empty paragraph of the annexure is its disclaimer
      let j = end - 1;
      while (j > idx[n] && p.paras[j].text.trim() === '') j--;
      expect(p.paras[j].text).toBe(DISCLAIMER);
    });
  });

  it('has exactly 6 page breaks, before annexures B to G and not before A', () => {
    const breaks = p.paras.filter((x) => x.el.getElementsByTagName('w:pageBreakBefore').length > 0);
    expect(breaks).toHaveLength(6);
    const idx = labelIndexes(p);
    idx.forEach((i, n) => {
      const has = p.paras[i].el.getElementsByTagName('w:pageBreakBefore').length > 0;
      expect(has).toBe(n > 0);
    });
    // no other kind of page break either
    expect(
      Array.from(p.xml.getElementsByTagName('w:br')).filter(
        (b) => b.getAttribute('w:type') === 'page',
      ),
    ).toHaveLength(0);
  });

  it('carries the same words in the same order as the HTML source', () => {
    const docWords = p.paras
      .map((x) => x.text)
      .join(' ')
      .split(/\s+/)
      .filter(Boolean);
    expect(docWords).toEqual(htmlWords(read(fixture)));
  });

  it('the Index of Documents is a real Word table with the right rows and cells', () => {
    const idx = labelIndexes(p)[3];
    // the first body-level table after the Annexure D label
    const kids = Array.from(p.body.children);
    const at = kids.indexOf(p.paras[idx].el);
    const tbl = kids.slice(at).find((k) => k.tagName === 'w:tbl')!;
    expect(tbl).toBeDefined();
    const rows = Array.from(tbl.getElementsByTagName('w:tr')).map((tr) =>
      Array.from(tr.children)
        .filter((c) => c.tagName === 'w:tc')
        .map((tc) =>
          Array.from(tc.getElementsByTagName('w:t'))
            .map((t) => t.textContent)
            .join(''),
        ),
    );
    expect(rows).toHaveLength(11);
    expect(rows[0]).toEqual(['Sr.', 'Document', 'Reference / Page No.']);
    expect(rows[1]).toEqual(['1.', 'Memo of Parties', 'Annexure A']);
    expect(rows[2]).toEqual(['2.', 'Synopsis', 'Annexure B']);
    expect(rows[3]).toEqual(['3.', 'List of Dates and Chronology', 'Annexure C']);
    expect(rows[4]).toEqual(['4.', 'Index of Documents Annexed', 'Annexure D (this document)']);
    expect(rows[5]).toEqual(['5.', 'Vakalatnama', 'Annexure E']);
    expect(rows[6]).toEqual(['6.', 'Court Fee Paid Statement', 'Annexure F']);
    expect(rows[7][0]).toBe('7.');
    expect(rows[7][1]).toBe(affidavitRow);
    expect(rows[7][2]).toBe('Annexure G');
    expect(rows[8][0]).toBe('8.');
    expect(rows[8][1]).toBe(firRow);
    expect(rows[8][2]).toBe('Annexure H (to be annexed by advocate)');
    expect(rows[9]).toEqual([
      '9.',
      'Identity and Address Proof of Applicant/Petitioner',
      'Annexure I (to be annexed by advocate)',
    ]);
    expect(rows[10]).toEqual([
      '10.',
      'Any other document relied upon',
      'Annexure J onwards (as applicable)',
    ]);
    // header row cells are bold
    const head = tbl.getElementsByTagName('w:tr')[0];
    expect(head.getElementsByTagName('w:b').length).toBeGreaterThanOrEqual(3);
  });

  it('Court Fee statement is a table of 4 rows; the Total row spans (2 + 2 columns)', () => {
    const idx = labelIndexes(p)[5];
    const kids = Array.from(p.body.children);
    const tbl = kids.slice(kids.indexOf(p.paras[idx].el)).find((k) => k.tagName === 'w:tbl')!;
    const rows = Array.from(tbl.getElementsByTagName('w:tr'));
    expect(rows).toHaveLength(4);
    const cellsOf = (r: Element) => Array.from(r.children).filter((c) => c.tagName === 'w:tc');
    expect(cellsOf(rows[0])).toHaveLength(4);
    expect(cellsOf(rows[3])).toHaveLength(2);
    const header = cellsOf(rows[0]).map((c) => c.textContent);
    expect(header).toEqual(['Sr.', 'Description', 'Amount (₹)', 'Mode of Payment']);
    expect(cellsOf(rows[3])[0].textContent).toBe('Total');
    for (const c of cellsOf(rows[3])) {
      expect(c.getElementsByTagName('w:gridSpan')[0]?.getAttribute('w:val')).toBe('2');
    }
  });

  it('every blank (a run of 3+ underscores, or a [To be confirmed: …] marker) is highlighted yellow, with its characters unchanged', () => {
    const sourceText = htmlText(read(fixture));
    const underscoreRuns = sourceText.match(/_{3,}/g)!;
    const markers = sourceText.match(/\[To be confirmed: [^\]]*\]/g) ?? [];
    expect(underscoreRuns.length).toBeGreaterThan(10);

    const highlighted = p.paras.flatMap((x) => x.highlighted);
    expect(highlighted.filter((t) => /^_{3,}$/.test(t))).toEqual(underscoreRuns);
    expect(highlighted.filter((t) => t.startsWith('[To be confirmed'))).toEqual(markers);
    // nothing else is highlighted
    expect(
      highlighted.filter((t) => !/^_{3,}$/.test(t) && !t.startsWith('[To be confirmed')),
    ).toEqual([]);
    // and no blank is left unhighlighted
    for (const x of p.paras) {
      for (const t of x.unhighlighted) expect(t).not.toMatch(/_{3,}/);
      for (const t of x.unhighlighted) expect(t).not.toMatch(/\[To be confirmed/);
    }
    // highlighted blanks are bold with black text, as the draft's
    const run = p.paras.find((x) => x.highlighted.length > 0)!;
    expect(run.el.getElementsByTagName('w:highlight')[0].getAttribute('w:val')).toBe('yellow');
  });

  it('the footer-line is plain text, not highlighted', () => {
    for (const x of p.paras.filter((q) => q.text === DISCLAIMER)) {
      expect(x.highlighted).toEqual([]);
    }
  });
});

describe('T-579 B: content specifics', () => {
  it('amount cells and the missing address are highlighted blanks (sparse pack)', async () => {
    const p = await build('t579-annexures-sparse.html');
    const cellTexts = (cell: Element) =>
      Array.from(cell.getElementsByTagName('w:p')).map((q) => p.paras.find((x) => x.el === q)!);
    const cells = Array.from(p.xml.getElementsByTagName('w:tc'));
    // Annexure F, row 1: "1." | Court fee... | amount | mode
    const row1 = cells.find(
      (c) =>
        c.textContent === '1.' &&
        c.nextElementSibling?.textContent === 'Court fee on application/petition',
    )!;
    const amount = row1.nextElementSibling!.nextElementSibling!;
    expect(cellTexts(amount).map((x) => x.highlighted)).toEqual([['___________']]);
    const mode = amount.nextElementSibling!;
    expect(mode.textContent).toBe('Court Fee Stamp / DD / Online');
    // Total row
    const total = cells.find((c) => c.textContent === 'Total')!;
    expect(cellTexts(total.nextElementSibling!).map((x) => x.highlighted)).toEqual([
      ['___________'],
    ]);
    // Affidavit: "resident of ___________"
    const aff = p.paras.find((x) =>
      x.text.includes('resident of ___________, do hereby solemnly affirm'),
    )!;
    expect(aff.highlighted).toContain('___________');
    expect(aff.highlighted).toContain('[To be confirmed: relation and name of parent or spouse]');
    // Date/Place lines of fifteen underscores
    expect(
      p.paras.some(
        (x) => x.text === 'Date: _______________' && x.highlighted[0] === '_______________',
      ),
    ).toBe(true);
  });

  it('Hindi text is kept as text', async () => {
    const p = await build('t579-annexures-sparse.html');
    expect(p.paras.some((x) => x.text === 'AFFIDAVIT OF राम कुमार')).toBe(true);
    expect(p.paras.filter((x) => x.text.includes('राम कुमार')).length).toBeGreaterThanOrEqual(3);
  });

  it('numbered lists are real Word numbering (Vakalatnama powers, 5 items)', async () => {
    const p = await build('t579-annexures-full.html');
    const items = p.paras.filter((x) => x.el.getElementsByTagName('w:numPr').length > 0);
    const vak = items.filter(
      (x) =>
        x.text.startsWith('File pleadings') ||
        x.text.startsWith('Appear before this') ||
        x.text.startsWith('Accept notices') ||
        x.text.startsWith('Take all necessary') ||
        x.text.startsWith('Engage other advocates'),
    );
    expect(vak.map((x) => x.text)).toEqual([
      'File pleadings, applications, affidavits, and other documents on my/our behalf;',
      "Appear before this Hon'ble Court and all subordinate/connected courts and authorities;",
      'Accept notices and orders on my/our behalf;',
      'Take all necessary steps to prosecute/defend the said matter;',
      'Engage other advocates as junior counsel or co-counsel as may be required.',
    ]);
    const numbering = await p.zip.files['word/numbering.xml'].async('string');
    expect(numbering).toContain('w:numFmt w:val="decimal"');
  });

  it('full pack carries the typed names and details as text', async () => {
    const p = await build('t579-annexures-full.html');
    const all = p.paras.map((x) => x.text).join('\n');
    expect(all).toContain('Ramesh Kumar');
    expect(all).toContain('Village Mirza, Patna, Bihar');
    expect(all).toContain('091/2024');
  });

  it('is a valid zip with the Word parts', async () => {
    const p = await build('t579-annexures-full.html');
    for (const n of [
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
      'word/styles.xml',
    ]) {
      expect(p.zip.files[n]).toBeDefined();
    }
  });
});

describe('T-579 B: file name helper and options', () => {
  it('annexuresDocxFilename cleans the title as the PDF does and cuts at 60', () => {
    expect(annexuresDocxFilename('Bail Application — Patna HC')).toBe(
      'Bail Application  Patna HC_annexures.docx',
    );
    expect(annexuresDocxFilename('a/b:c*d')).toBe('abcd_annexures.docx');
    expect(annexuresDocxFilename('z'.repeat(90))).toBe(`${'z'.repeat(60)}_annexures.docx`);
    expect(annexuresDocxFilename('')).toBe('_annexures.docx');
  });

  it('uses the server-sent filename when given, else the one from the title', async () => {
    await exportAnnexuresDocx(
      '<div class="page-break"><p>x</p></div>',
      'My Title',
      'from server.docx',
    );
    expect(mockSaveAs.mock.calls[0][1]).toBe('from server.docx');
    await exportAnnexuresDocx('<p>x</p>', 'My: Title');
    expect(mockSaveAs.mock.calls[1][1]).toBe('My Title_annexures.docx');
    await exportAnnexuresDocx('<p>x</p>', 'My Title', '');
    expect(mockSaveAs.mock.calls[2][1]).toBe('My Title_annexures.docx');
  });

  it('does not touch the network', async () => {
    const f = jest.fn();
    const prev = globalThis.fetch;
    globalThis.fetch = f as unknown as typeof fetch;
    try {
      await exportAnnexuresDocx('<p>x</p>', 'T');
      expect(f).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = prev;
    }
  });
});
