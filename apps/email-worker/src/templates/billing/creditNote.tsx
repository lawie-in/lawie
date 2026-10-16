/**
 * T-436 (b/c): the credit-note email (`billing.creditNote`). Every visible string is signed by
 * Ajay (handoff/legal/gst-tax-invoice-signed.md): subject, amount line and button from
 * Addendum 7 (4a); preheader, number line, plain-text link line and footer line 2 from
 * Addendum 9; greeting, help line, sign-off and footer lines 1, 3 and 4 as in the invoice email
 * (templates/billing/taxInvoice.tsx). Do not edit a string here without a new sign-off.
 *
 * Data shape: the worker builds this from billing's GET /internal/invoices/:id/email-view at send
 * time. It is NEVER taken from job data (the job carries userId and invoiceId only, Arjun #1):
 *   {
 *     name: string;              // greeting only; empty gives "Hello,"
 *     creditNoteNumber: string;  // the credit note's own number, e.g. LCN/2026-27/0001
 *     invoiceNumber: string;     // the ORIGINAL invoice it is against
 *     amount: string;            // already formatted, e.g. ₹799 (templates/billing/format.ts)
 *     downloadUrl: string;       // billing's link to the invoices page
 *   }
 * The worker also passes `date` (the credit note's issue date, Addendum 9 #4); no signed
 * credit-note string uses it, so it is not required here.
 *
 * Plain text: the signed body with `Download credit note (PDF): {downloadUrl}` as the link line;
 * the HTML has the button in its place. Built by `text()` below.
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

import { TAX_INVOICE_STRINGS } from './taxInvoice';

export interface CreditNoteEmailData {
  name?: string;
  creditNoteNumber?: string;
  invoiceNumber?: string;
  amount?: string;
  date?: string;
  downloadUrl?: string;
}

/** `{creditNoteNumber}` is replaced at render time. Addendum 7 (4a). */
export const CREDIT_NOTE_SUBJECT = 'Your Lawie credit note {creditNoteNumber}';
export const CREDIT_NOTE_STRINGS = {
  /** Addendum 9 #1. */
  preheader: 'Your credit note is ready to download.',
  /** `{name}` is replaced with the name; an empty name uses greetingNoName. */
  greeting: TAX_INVOICE_STRINGS.greeting,
  greetingNoName: TAX_INVOICE_STRINGS.greetingNoName,
  /** Addendum 7 (4a). */
  amountLine:
    'We have issued a credit note of {amount} (including GST) against invoice {invoiceNumber}.',
  /** Addendum 9 #2. */
  numberLine: 'Your credit note number is {creditNoteNumber}.',
  /** Addendum 7 (4a). */
  button: 'Download credit note (PDF)',
  /** Addendum 9 #3 (plain text only). */
  linkLine: 'Download credit note (PDF): {downloadUrl}',
  help: TAX_INVOICE_STRINGS.help,
  signOff: TAX_INVOICE_STRINGS.signOff,
  footer1: TAX_INVOICE_STRINGS.footer1,
  /** Addendum 9 #5. */
  footer2: 'You are receiving this because a credit note was issued on your Lawie account.',
  footer3: TAX_INVOICE_STRINGS.footer3,
  footer4: TAX_INVOICE_STRINGS.footer4,
} as const;

const S = CREDIT_NOTE_STRINGS;

interface Filled {
  subject: string;
  greeting: string;
  amountLine: string;
  numberLine: string;
  linkLine: string;
  downloadUrl: string;
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * Validates the data and fills the merge fields. Never renders a credit-note email with a
 * missing number, original invoice number, amount or link. Thrown messages name no value.
 * Replacement callbacks, so a name holding $&, $', $` or $$ is inserted literally.
 */
function fill(data: CreditNoteEmailData): Filled {
  if (
    !nonEmpty(data.creditNoteNumber) ||
    !nonEmpty(data.invoiceNumber) ||
    !nonEmpty(data.amount) ||
    !nonEmpty(data.downloadUrl)
  ) {
    throw new Error(
      'billing.creditNote rendered without creditNoteNumber, invoiceNumber, amount or downloadUrl',
    );
  }
  const { creditNoteNumber, invoiceNumber, amount, downloadUrl } = data;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  return {
    subject: CREDIT_NOTE_SUBJECT.replace('{creditNoteNumber}', () => creditNoteNumber),
    greeting: name.length > 0 ? S.greeting.replace('{name}', () => name) : S.greetingNoName,
    amountLine: S.amountLine
      .replace('{amount}', () => amount)
      .replace('{invoiceNumber}', () => invoiceNumber),
    numberLine: S.numberLine.replace('{creditNoteNumber}', () => creditNoteNumber),
    linkLine: S.linkLine.replace('{downloadUrl}', () => downloadUrl),
    downloadUrl,
  };
}

const textStyle = { color: '#0D1F3C', fontSize: 14, lineHeight: '22px' } as const;
const smallStyle = { color: '#0D1F3C99', fontSize: 11, lineHeight: '18px', margin: 0 } as const;

export const billingCreditNoteTemplate: TemplateDef<CreditNoteEmailData> = {
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
        <Preview>{S.preheader}</Preview>
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
