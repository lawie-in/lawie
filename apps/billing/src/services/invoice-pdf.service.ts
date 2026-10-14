/**
 * T-436 (Arjun #7, Ajay §1 + Addendum 1): the invoice / credit note PDF,
 * rendered on demand from the issued row with pdfkit. Nothing is stored.
 *
 * Fonts: pdfkit's built-in Helvetica (no font file to ship). Its WinAnsi
 * encoding has no rupee glyph, so amounts print as "Rs. 1,999.00".
 *
 * The signature image is optional (GST_SIGNATURE_PATH); when unset or
 * unreadable it is left out and the rest of the block still prints.
 */
import fs from 'fs';

import PDFDocument from 'pdfkit';

import { env } from '../config/env';
import { GST_RATE_PERCENT } from '../config/gst';
import logger from '../config/logger';
import type { IInvoice } from '../models/Invoice.model';

import { formatIstDate, formatRupees } from './invoice-math';

/** Ajay 9528d82: exact document headings. */
export const PDF_HEADING = { invoice: 'Tax Invoice', credit_note: 'Credit Note' } as const;

/** Thrown when asked to render a row that is not issued. */
export class InvoiceNotIssuedError extends Error {
  constructor() {
    super('invoice is not issued');
    this.name = 'InvoiceNotIssuedError';
  }
}

function signatureImage(): Buffer | null {
  const p = env.GST_SIGNATURE_PATH.trim();
  if (!p) return null;
  try {
    return fs.readFileSync(p);
  } catch (err) {
    logger.warn(
      { errName: err instanceof Error ? err.name : 'unknown' },
      'invoice pdf: signature image unreadable; omitted',
    );
    return null;
  }
}

/** Renders the issued row as a PDF. */
export function renderInvoicePdf(inv: IInvoice): Promise<Buffer> {
  if (
    inv.state !== 'issued' ||
    !inv.number ||
    !inv.issuedAt ||
    !inv.seller ||
    !inv.customer ||
    !inv.placeOfSupply ||
    !inv.lines
  ) {
    return Promise.reject(new InvoiceNotIssuedError());
  }
  const { seller, customer, placeOfSupply } = inv;
  const { kind, number: invoiceNumber, issuedAt, lines } = inv;

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: { Title: `${PDF_HEADING[kind]} ${invoiceNumber}`, Author: seller.tradeName },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const amountX = left + width - 140;

    // Heading
    doc.font('Helvetica-Bold').fontSize(18).text(PDF_HEADING[kind], { align: 'center' });
    doc.moveDown(1);

    // Supplier
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(`${seller.legalName} trading as ${seller.tradeName}`);
    doc.font('Helvetica').fontSize(10);
    doc.text(`GSTIN: ${seller.gstin}`);
    doc.text(seller.address);
    doc.text(`State: ${seller.stateName} (${seller.stateCode})`);
    doc.moveDown(1);

    // Number and date
    const label = kind === 'credit_note' ? 'Credit note number' : 'Invoice number';
    doc.text(`${label}: ${invoiceNumber}`);
    doc.text(`Date of issue: ${formatIstDate(issuedAt)}`);
    if (kind === 'credit_note' && inv.originalInvoiceNumber && inv.originalInvoiceDate) {
      doc.text(
        `Against invoice: ${inv.originalInvoiceNumber} dated ${formatIstDate(inv.originalInvoiceDate)}`,
      );
    }
    doc.moveDown(1);

    // Recipient
    doc.font('Helvetica-Bold').text('Recipient');
    doc.font('Helvetica');
    doc.text(`Name: ${customer.name || '-'}`);
    doc.text(`State: ${customer.stateName} (${customer.stateCode})`);
    doc.text(`Place of supply: ${placeOfSupply.name} (${placeOfSupply.code})`);
    doc.moveDown(1);

    // Lines
    const tableTop = doc.y;
    doc.font('Helvetica-Bold');
    doc.text('Description', left, tableTop, { width: width - 220 });
    doc.text('SAC', left + width - 210, tableTop, { width: 60 });
    doc.text('Taxable value', amountX, tableTop, { width: 140, align: 'right' });
    doc.font('Helvetica');
    doc.moveDown(0.5);
    for (const line of lines) {
      const y = doc.y;
      doc.text(line.description, left, y, { width: width - 220 });
      const afterDesc = doc.y;
      doc.text(line.sac, left + width - 210, y, { width: 60 });
      doc.text(formatRupees(line.taxable), amountX, y, { width: 140, align: 'right' });
      doc.y = Math.max(afterDesc, doc.y);
      doc.moveDown(0.3);
    }
    doc.moveDown(0.5);

    // Totals
    const row = (name: string, paise: number, bold = false) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
      doc.text(name, left, y, { width: width - 150 });
      doc.text(formatRupees(paise), amountX, y, { width: 140, align: 'right' });
      doc.moveDown(0.3);
    };
    const half = GST_RATE_PERCENT / 2;
    row('Taxable value', inv.taxable ?? 0);
    if (placeOfSupply.code !== seller.stateCode) {
      row(`IGST @ ${GST_RATE_PERCENT}%`, inv.igst ?? 0);
    } else {
      row(`CGST @ ${half}%`, inv.cgst ?? 0);
      row(`SGST @ ${half}%`, inv.sgst ?? 0);
    }
    row('Total', inv.total ?? 0, true);
    doc.moveDown(1);

    doc.font('Helvetica').text('Tax payable on reverse charge: No', left);
    doc.text('Computer-generated invoice', left);
    doc.moveDown(2);

    // Signature block
    const sig = signatureImage();
    if (sig) {
      try {
        doc.image(sig, left, doc.y, { fit: [140, 50] });
        doc.y += 55;
      } catch (err) {
        logger.warn(
          { errName: err instanceof Error ? err.name : 'unknown' },
          'invoice pdf: signature image not usable; omitted',
        );
      }
    }
    doc.text(seller.legalName, left);
    doc.text('Authorised Signatory', left);

    doc.end();
  });
}

/** `LAW/2026-27/0001` -> `LAW-2026-27-0001.pdf`. */
export function invoicePdfFilename(number: string): string {
  return `${number.replace(/[^A-Za-z0-9-]/g, '-')}.pdf`;
}
