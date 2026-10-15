/**
 * T-436 (b/c): the GST tax invoice email (`billing.taxInvoice`). Every visible string is
 * Madhuri's draft (handoff/marketing/copy/invoice-email-t436.md) as Ajay signed it
 * (handoff/legal/gst-tax-invoice-signed.md, Addendum 5): subject (A), button (A), the amount line
 * with "(including GST)", "Hello," with no name, footer line 1 from Addendum 4 point 3 and line 2
 * as changed in Addendum 5 #2. Do not edit a string here without a new sign-off.
 *
 * Data shape: the worker builds this from billing's GET /internal/invoices/:id/email-view at send
 * time. It is NEVER taken from job data (the job carries userId and invoiceId only, Arjun #1):
 *   {
 *     name: string;           // greeting only; empty gives "Hello,"
 *     invoiceNumber: string;  // e.g. LAW/2026-27/0001
 *     amount: string;         // already formatted, e.g. ₹799 (templates/billing/format.ts)
 *     date: string;           // already formatted, e.g. 14 Oct 2026 (IST)
 *     downloadUrl: string;    // billing's link to the invoices page
 *   }
 *
 * Link only, no attachment, no case content, no tax breakdown (Ajay, Addendum 4 point 2).
 *
 * Plain text: the signed body with `Download invoice (PDF): {downloadUrl}` as the link line; the
 * HTML has the button in its place (copy file, "Body" heading). Built by `text()` below.
 */
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

import type { TemplateDef } from '../index';

export interface TaxInvoiceEmailData {
  name?: string;
  invoiceNumber?: string;
  amount?: string;
  date?: string;
  downloadUrl?: string;
}

/** `{invoiceNumber}` is replaced at render time. */
export const TAX_INVOICE_SUBJECT = 'Your Lawie invoice {invoiceNumber}';
export const TAX_INVOICE_STRINGS = {
  preheader: 'Payment received on {date}. Your invoice is ready to download.',
  /** `{name}` is replaced with the name; an empty name uses greetingNoName. */
  greeting: 'Hello {name},',
  greetingNoName: 'Hello,',
  amountLine: 'Thank you for your payment of {amount} (including GST) on {date}.',
  numberLine: 'Your invoice number is {invoiceNumber}.',
  button: 'Download invoice (PDF)',
  linkLine: 'Download invoice (PDF): {downloadUrl}',
  help: 'Need help? Write to contact@lawie.in.',
  signOff: 'Team Lawie',
  footer1: 'Lawie (Sole Proprietorship), Ranchi, Jharkhand',
  footer2: 'You are receiving this because a payment was made on your Lawie account.',
  footer3: 'Help: contact@lawie.in · Data and privacy requests: privacy@lawie.in',
  footer4: 'Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms',
} as const;

const S = TAX_INVOICE_STRINGS;

interface Filled {
  subject: string;
  preheader: string;
  greeting: string;
  amountLine: string;
  numberLine: string;
  linkLine: string;
  downloadUrl: string;
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * Validates the data and fills the merge fields. Never renders an invoice email with a missing
 * number, amount, date or link. Thrown messages name no value. Replacement callbacks, not
 * strings, so a name holding $&, $', $` or $$ is inserted literally.
 */
function fill(data: TaxInvoiceEmailData): Filled {
  if (
    !nonEmpty(data.invoiceNumber) ||
    !nonEmpty(data.amount) ||
    !nonEmpty(data.date) ||
    !nonEmpty(data.downloadUrl)
  ) {
    throw new Error(
      'billing.taxInvoice rendered without invoiceNumber, amount, date or downloadUrl',
    );
  }
  const { invoiceNumber, amount, date, downloadUrl } = data;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  return {
    subject: TAX_INVOICE_SUBJECT.replace('{invoiceNumber}', () => invoiceNumber),
    preheader: S.preheader.replace('{date}', () => date),
    greeting: name.length > 0 ? S.greeting.replace('{name}', () => name) : S.greetingNoName,
    amountLine: S.amountLine.replace('{amount}', () => amount).replace('{date}', () => date),
    numberLine: S.numberLine.replace('{invoiceNumber}', () => invoiceNumber),
    linkLine: S.linkLine.replace('{downloadUrl}', () => downloadUrl),
    downloadUrl,
  };
}

const textStyle = { color: '#0D1F3C', fontSize: 14, lineHeight: '22px' } as const;
const smallStyle = { color: '#0D1F3C99', fontSize: 11, lineHeight: '18px', margin: 0 } as const;

export const billingTaxInvoiceTemplate: TemplateDef<TaxInvoiceEmailData> = {
  subject: (data) => fill(data).subject,
  text: (data) => {
    const f = fill(data);
    return [
      f.greeting,
      '',
      f.amountLine,
      f.numberLine,
      '',
      f.linkLine,
      '',
      S.help,
      S.signOff,
      '',
      '--',
      S.footer1,
      S.footer2,
      S.footer3,
      S.footer4,
      '',
    ].join('\n');
  },
  Body: (data) => {
    const f = fill(data);
    return (
      <Html>
        <Head />
        <Preview>{f.preheader}</Preview>
        <Body
          style={{
            backgroundColor: '#EFE9DF',
            fontFamily: 'Helvetica, Arial, sans-serif',
            margin: 0,
            padding: 0,
          }}
        >
          <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px' }}>
            <Text style={textStyle}>{f.greeting}</Text>
            <Text style={textStyle}>
              {f.amountLine}
              <br />
              {f.numberLine}
            </Text>
            <Section style={{ marginTop: 24, marginBottom: 24 }}>
              <Link
                href={f.downloadUrl}
                style={{
                  backgroundColor: '#E63E2C',
                  color: '#FFFFFF',
                  borderRadius: 6,
                  padding: '12px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                {S.button}
              </Link>
            </Section>
            <Text style={textStyle}>
              {S.help}
              <br />
              {S.signOff}
            </Text>
            <Hr style={{ borderColor: '#0D1F3C20', margin: '32px 0 16px' }} />
            <Text style={smallStyle}>{S.footer1}</Text>
            <Text style={smallStyle}>{S.footer2}</Text>
            <Text style={smallStyle}>{S.footer3}</Text>
            <Text style={smallStyle}>{S.footer4}</Text>
          </Container>
        </Body>
      </Html>
    );
  },
};
