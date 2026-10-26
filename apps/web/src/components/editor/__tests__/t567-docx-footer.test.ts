/**
 * T-567 item 30 (Ajay, signed 22 Oct): every Word export carries exactly one footer. The
 * generic one is the PDF's; a starting draft carries its own signed footer instead (T-321).
 * Never both, never none.
 */
import { TextDecoder, TextEncoder } from 'util';

import JSZip from 'jszip';

// jsdom has no TextEncoder; docx needs it to pack the file.
Object.assign(globalThis, { TextEncoder, TextDecoder });

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { exportDocx } = require('../exportUtils') as typeof import('../exportUtils');

const mockSaveAs = jest.fn();
jest.mock('file-saver', () => ({ saveAs: (...a: unknown[]) => mockSaveAs(...a) }));

const GENERIC =
  'First draft generated with AI. Check it against the applicable law before filing. Lawie does not provide legal advice.';
const OWN = 'Starting draft only. Fill every blank and check it before you file.';

async function footerXmls(): Promise<string[]> {
  const blob = mockSaveAs.mock.calls[0][0] as Blob;
  const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => /^word\/footer\d*\.xml$/.test(n));
  return Promise.all(names.map((n) => zip.files[n].async('string')));
}

const text = (xml: string) =>
  [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');

beforeEach(() => mockSaveAs.mockClear());

describe('T-567 exportDocx footer', () => {
  it('no starting draft: exactly one footer, with the signed generic text', async () => {
    await exportDocx('<p>Body of the application.</p>', 'Bail', false);
    const footers = await footerXmls();
    expect(footers).toHaveLength(1);
    expect(text(footers[0])).toBe(GENERIC);
  });

  it.each([[undefined], [null], ['']])(
    'startingDraftFooter %p is treated as none: generic footer',
    async (value) => {
      await exportDocx('<p>Body.</p>', 'Bail', true, value);
      const footers = await footerXmls();
      expect(footers).toHaveLength(1);
      expect(text(footers[0])).toBe(GENERIC);
    },
  );

  it("starting draft: exactly one footer, the draft's own text, not the generic one", async () => {
    await exportDocx('<p>Body.</p>', 'Bail', false, OWN);
    const footers = await footerXmls();
    expect(footers).toHaveLength(1);
    expect(text(footers[0])).toBe(OWN);
    expect(text(footers[0])).not.toContain('First draft generated with AI');
  });

  it('a draft with blanks still carries one footer (the header does not displace it)', async () => {
    await exportDocx('<p>Name {{MISSING: father name}}.</p>', 'Bail', false);
    const footers = await footerXmls();
    expect(footers).toHaveLength(1);
    expect(text(footers[0])).toBe(GENERIC);
  });
});
