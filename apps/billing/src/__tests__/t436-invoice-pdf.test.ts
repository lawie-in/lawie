import './setupEnv';
import fs from 'fs';
import os from 'os';
import path from 'path';

import PDFDocument from 'pdfkit';

import { env } from '../config/env';
import logger from '../config/logger';
import type { IInvoice } from '../models/Invoice.model';
import {
  InvoiceNotIssuedError,
  PDF_HEADING,
  invoicePdfFilename,
  renderInvoicePdf,
} from '../services/invoice-pdf.service';

// T-436 AC9: heading exactly "Tax Invoice" / "Credit Note"; Ajay §1 fields incl. "Tax payable on
// reverse charge: No" and "Computer-generated invoice"; amounts as "Rs."; address printed.
// No PDF text parser is installed (and none is added), so the real render runs with a spy on
// pdfkit's text(); every string the document draws is captured.

const seller = {
  legalName: 'Test Proprietor',
  tradeName: 'Lawie',
  gstin: '20AAAAA0000A1Z5',
  address: '1 Test Road, Test Town 000000',
  stateCode: '20',
  stateName: 'Jharkhand',
};

function row(over: Record<string, unknown> = {}): IInvoice {
  return {
    kind: 'invoice',
    state: 'issued',
    number: 'LAW/2026-27/0001',
    issuedAt: new Date('2026-10-05T06:00:00Z'),
    seller,
    customer: {
      name: 'Asha Verma',
      email: 'asha@example.com',
      stateCode: '27',
      stateName: 'Maharashtra',
    },
    placeOfSupply: { code: '27', name: 'Maharashtra', source: 'user' },
    lines: [
      {
        description: 'Lawie subscription — Solo Monthly, 1 Oct 2026 to 31 Oct 2026',
        sac: '998319',
        ratePercent: 18,
        quantity: 1,
        taxable: 67712,
        amount: 79900,
      },
    ],
    price: 79900,
    taxable: 67712,
    cgst: 0,
    sgst: 0,
    igst: 12188,
    total: 79900,
    ...over,
  } as unknown as IInvoice;
}

async function render(inv: IInvoice) {
  const spy = jest.spyOn(PDFDocument.prototype, 'text');
  const pdf = await renderInvoicePdf(inv);
  const texts = spy.mock.calls.map((c) => String(c[0]));
  spy.mockRestore();
  return { pdf, texts };
}

afterEach(() => {
  jest.restoreAllMocks();
  env.GST_SIGNATURE_PATH = '';
});

describe('renderInvoicePdf (AC9)', () => {
  it('produces a real PDF buffer', async () => {
    const { pdf } = await render(row());
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-6).toString()).toContain('%%EOF');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('the heading is exactly "Tax Invoice" and is drawn first', async () => {
    expect(PDF_HEADING).toEqual({ invoice: 'Tax Invoice', credit_note: 'Credit Note' });
    const { texts } = await render(row());
    expect(texts[0]).toBe('Tax Invoice');
    expect(texts).not.toContain('Credit Note');
  });

  it('carries the Ajay §1 fields (inter-state): seller, GSTIN, address, number, date, recipient, place of supply, SAC, line, IGST, total', async () => {
    const { texts } = await render(row());
    expect(texts).toEqual(
      expect.arrayContaining([
        'Test Proprietor trading as Lawie',
        'GSTIN: 20AAAAA0000A1Z5',
        '1 Test Road, Test Town 000000', // address printed on the PDF
        'State: Jharkhand (20)',
        'Invoice number: LAW/2026-27/0001',
        'Date of issue: 5 Oct 2026',
        'Name: Asha Verma',
        'State: Maharashtra (27)',
        'Place of supply: Maharashtra (27)',
        'Lawie subscription — Solo Monthly, 1 Oct 2026 to 31 Oct 2026',
        '998319',
        'Taxable value',
        'Rs. 677.12',
        'IGST @ 18%',
        'Rs. 121.88',
        'Total',
        'Rs. 799.00',
        'Tax payable on reverse charge: No',
        'Computer-generated invoice',
        'Authorised Signatory',
      ]),
    );
    expect(texts.some((t) => t.startsWith('CGST'))).toBe(false);
    expect(texts.some((t) => t.startsWith('SGST'))).toBe(false);
  });

  it('intra-state: CGST @ 9% and SGST @ 9%, no IGST', async () => {
    const { texts } = await render(
      row({
        customer: { name: 'Ravi', email: '', stateCode: '20', stateName: 'Jharkhand' },
        placeOfSupply: { code: '20', name: 'Jharkhand', source: 'user' },
        cgst: 6094,
        sgst: 6094,
        igst: 0,
      }),
    );
    expect(texts).toEqual(expect.arrayContaining(['CGST @ 9%', 'SGST @ 9%', 'Rs. 60.94']));
    expect(texts.some((t) => t.startsWith('IGST'))).toBe(false);
  });

  it('a fallback place of supply (our State) prints CGST and SGST too', async () => {
    const { texts } = await render(
      row({
        placeOfSupply: { code: '20', name: 'Jharkhand', source: 'fallback' },
        customer: { name: 'Ravi', email: '', stateCode: '20', stateName: 'Jharkhand' },
        cgst: 6094,
        sgst: 6094,
        igst: 0,
      }),
    );
    expect(texts).toContain('CGST @ 9%');
  });

  it('amounts are printed as "Rs." with Indian grouping and never with the rupee glyph', async () => {
    const { texts } = await render(
      row({
        taxable: 1_694_915,
        igst: 305_085,
        total: 2_000_000,
        price: 2_000_000,
        lines: [
          {
            description: 'x',
            sac: '998319',
            ratePercent: 18,
            quantity: 1,
            taxable: 1_694_915,
            amount: 2_000_000,
          },
        ],
      }),
    );
    const money = texts.filter((t) => /\d+\.\d{2}$/.test(t) && !/Date|number/.test(t));
    expect(money.length).toBeGreaterThanOrEqual(4);
    for (const m of money) expect(m).toMatch(/^Rs\. [\d,]+\.\d{2}$/);
    expect(texts).toContain('Rs. 20,000.00');
    expect(texts.join('')).not.toContain('₹');
  });

  it('a credit note: heading "Credit Note", its own number label, and the original number and date', async () => {
    const { texts } = await render(
      row({
        kind: 'credit_note',
        number: 'LCN/2026-27/0001',
        originalInvoiceNumber: 'LAW/2026-27/0001',
        originalInvoiceDate: new Date('2026-10-05T06:00:00Z'),
      }),
    );
    expect(texts[0]).toBe('Credit Note');
    expect(texts).not.toContain('Tax Invoice');
    expect(texts).toContain('Credit note number: LCN/2026-27/0001');
    expect(texts).toContain('Against invoice: LAW/2026-27/0001 dated 5 Oct 2026');
    expect(texts).toContain('Tax payable on reverse charge: No');
  });

  it('a recipient with no name prints a dash, not "undefined"', async () => {
    const { texts } = await render(
      row({ customer: { name: '', email: '', stateCode: '27', stateName: 'Maharashtra' } }),
    );
    expect(texts).toContain('Name: -');
    expect(texts.join('|')).not.toContain('undefined');
  });

  it("the recipient's email is not printed", async () => {
    const { texts } = await render(row());
    expect(texts.join('|')).not.toContain('asha@example.com');
  });

  it('refuses a row that is not issued', async () => {
    await expect(renderInvoicePdf(row({ state: 'issuing' }))).rejects.toBeInstanceOf(
      InvoiceNotIssuedError,
    );
    await expect(renderInvoicePdf(row({ number: undefined }))).rejects.toThrow('not issued');
    await expect(renderInvoicePdf(row({ seller: undefined }))).rejects.toBeInstanceOf(
      InvoiceNotIssuedError,
    );
    await expect(renderInvoicePdf(row({ lines: undefined }))).rejects.toBeInstanceOf(
      InvoiceNotIssuedError,
    );
  });
});

describe('signature image (optional)', () => {
  // 1x1 PNG
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 't436-sig-'));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('embeds a readable image', async () => {
    const p = path.join(dir, 'sig.png');
    fs.writeFileSync(p, PNG);
    env.GST_SIGNATURE_PATH = p;
    const image = jest.spyOn(PDFDocument.prototype, 'image');
    const { pdf } = await render(row());
    expect(image).toHaveBeenCalledTimes(1);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('an unreadable path is left out with a warning (error name only), the PDF still renders', async () => {
    env.GST_SIGNATURE_PATH = path.join(dir, 'missing.png');
    const warn = jest.spyOn(logger, 'warn');
    const image = jest.spyOn(PDFDocument.prototype, 'image');
    const { pdf, texts } = await render(row());
    expect(image).not.toHaveBeenCalled();
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(texts).toContain('Authorised Signatory');
    expect(JSON.stringify(warn.mock.calls)).toContain('errName');
    expect(JSON.stringify(warn.mock.calls)).not.toContain(dir);
  });

  it('a file that is not an image is left out with a warning, the PDF still renders', async () => {
    const p = path.join(dir, 'junk.png');
    fs.writeFileSync(p, 'not an image');
    env.GST_SIGNATURE_PATH = p;
    const warn = jest.spyOn(logger, 'warn');
    const { pdf, texts } = await render(row());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(texts).toContain('Authorised Signatory');
    expect(warn).toHaveBeenCalled();
  });
});

describe('invoicePdfFilename', () => {
  it('turns slashes into dashes', () => {
    expect(invoicePdfFilename('LAW/2026-27/0001')).toBe('LAW-2026-27-0001.pdf');
    expect(invoicePdfFilename('LCN/2026-27/0001')).toBe('LCN-2026-27-0001.pdf');
    expect(invoicePdfFilename('a/b"c\r\nd')).toBe('a-b-c--d.pdf');
  });
});
