/**
 * T-689c: the Word export of the annexures highlights the Synopsis' placeholder
 * `[To be confirmed: Nature of matter]` (AJ-689c-a, rule 1) through the shared blank marker,
 * with its characters unchanged, as its own run; the text around it is not highlighted; the
 * notary stamp caption stays plain. findAnnexureBlanks finds it exactly once.
 *
 * file-saver is mocked; jsdom has no TextEncoder, so it is polyfilled (as t579-annexures-docx).
 */
import { TextDecoder, TextEncoder } from 'util';

import JSZip from 'jszip';

Object.assign(globalThis, { TextEncoder, TextDecoder });

const mockSaveAs = jest.fn();
jest.mock('file-saver', () => ({ saveAs: (...a: unknown[]) => mockSaveAs(...a) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const utils = require('../exportUtils') as typeof import('../exportUtils');
const { exportAnnexuresDocx, findAnnexureBlanks } = utils;

const PLACEHOLDER = '[To be confirmed: Nature of matter]';
const STAMP = '[Notary / Oath Commissioner Stamp & Seal]';

const synopsis = (nature: string) => `
<div class="page-break">
  <div class="annexure-label">ANNEXURE B</div>
  <h2>Synopsis</h2>
  <p style="text-align:center">(As required by High Court Practice)</p>
  <br>
  <p><strong>Nature of matter:</strong> ${nature}</p>
  <p><strong>Brief synopsis of the case:</strong></p>
  <ul>
    <li>Applicant/Petitioner: Priya Devi</li>
  </ul>
</div>`;

const notary = `
<div class="page-break">
  <div class="annexure-label">ANNEXURE G</div>
  <h2>Affidavit</h2>
  <div class="notary-box">
    <div class="notary-title">BEFORE ME</div>
    <div class="stamp-placeholder">[Notary / Oath Commissioner Stamp &amp; Seal]</div>
  </div>
</div>`;

beforeEach(() => mockSaveAs.mockClear());

async function runs(html: string) {
  await exportAnnexuresDocx(html, 'T');
  const blob = mockSaveAs.mock.calls[0][0] as Blob;
  const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
  const zip = await JSZip.loadAsync(buf);
  const xml = new DOMParser().parseFromString(
    await zip.files['word/document.xml'].async('string'),
    'application/xml',
  );
  expect(xml.getElementsByTagName('parsererror')).toHaveLength(0);
  return Array.from(xml.getElementsByTagName('w:p')).map((p) => {
    const rs = Array.from(p.children)
      .filter((c) => c.tagName === 'w:r')
      .map((r) => ({
        text: Array.from(r.getElementsByTagName('w:t'))
          .map((t) => t.textContent ?? '')
          .join(''),
        yellow: r.getElementsByTagName('w:highlight')[0]?.getAttribute('w:val') === 'yellow',
      }));
    return { text: rs.map((r) => r.text).join(''), runs: rs };
  });
}

describe('T-689c: the Word export of the Nature of matter placeholder', () => {
  it('the placeholder is its own yellow run with its characters unchanged; the rest of the line is not highlighted', async () => {
    const paras = await runs(synopsis(PLACEHOLDER));
    const line = paras.find((p) => p.text.includes('Nature of matter:'))!;
    expect(line.text).toBe(`Nature of matter: ${PLACEHOLDER}`);
    const yellow = line.runs.filter((r) => r.yellow);
    expect(yellow.map((r) => r.text)).toEqual([PLACEHOLDER]);
    const plain = line.runs.filter((r) => !r.yellow && r.text.trim() !== '');
    expect(plain.map((r) => r.text.trim())).toEqual(['Nature of matter:']);
    // exactly one highlighted run in the whole file for this marker
    const all = paras
      .flatMap((p) => p.runs)
      .filter((r) => r.yellow && r.text.includes('Nature of matter'));
    expect(all).toHaveLength(1);
  });

  it('a real catalogue name is not highlighted', async () => {
    const paras = await runs(synopsis('Quashing Petition (S.528 BNSS)'));
    const line = paras.find((p) => p.text.includes('Nature of matter:'))!;
    expect(line.text).toBe('Nature of matter: Quashing Petition (S.528 BNSS)');
    expect(line.runs.filter((r) => r.yellow)).toEqual([]);
  });

  it('the notary stamp caption stays unhighlighted, with the placeholder highlighted beside it', async () => {
    const paras = await runs(synopsis(PLACEHOLDER) + notary);
    const stamp = paras.find((p) => p.text.includes('Notary / Oath Commissioner'))!;
    expect(stamp.text).toBe(STAMP);
    expect(stamp.runs.filter((r) => r.yellow)).toEqual([]);
    const nature = paras.find((p) => p.text.includes('Nature of matter:'))!;
    expect(nature.runs.some((r) => r.yellow && r.text === PLACEHOLDER)).toBe(true);
  });
});

describe('T-689c: findAnnexureBlanks on the placeholder', () => {
  const text = `Nature of matter: ${PLACEHOLDER}\nBrief synopsis`;

  it('finds exactly one blank, with the label, start and end', () => {
    const blanks = findAnnexureBlanks(text);
    expect(blanks).toHaveLength(1);
    const start = text.indexOf('[');
    expect(blanks[0].text).toBe(PLACEHOLDER);
    expect(blanks[0].label).toBe('Nature of matter');
    expect(blanks[0].start).toBe(start);
    expect(blanks[0].end).toBe(start + PLACEHOLDER.length);
    expect(text.slice(blanks[0].start, blanks[0].end)).toBe(PLACEHOLDER);
  });

  it('the notary stamp caption is not a blank', () => {
    expect(findAnnexureBlanks(STAMP)).toEqual([]);
    expect(findAnnexureBlanks(`${text}\n${STAMP}`)).toHaveLength(1);
  });

  it('no duplicate when the Advocate placeholders sit on the same text', () => {
    const both = `${text}\n[Advocate to insert 3–5 sentence summary before filing.]`;
    const blanks = findAnnexureBlanks(both);
    expect(blanks.map((b) => b.text)).toEqual([
      PLACEHOLDER,
      '[Advocate to insert 3–5 sentence summary before filing.]',
    ]);
  });
});
