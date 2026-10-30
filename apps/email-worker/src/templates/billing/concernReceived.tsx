/**
 * T-646: the payment-concern acknowledgement (`billing.concernReceived`).
 *
 * Subject and body are Ajay's signed strings, byte for byte (AJ-646-M2,
 * handoff/legal/T-511-copy-rulings-ajay.md). Do not edit them without a new sign-off.
 * AJ-646-M7 (c5c2b222): the standard greeting, sign-off and footer lines 1, 3 and 4, reused from
 * the tax-invoice email (TAX_INVOICE_STRINGS). AJ-646-M7a: footer line 2 is signed for this email.
 * No help line. The one other element is the deep link
 * to the payment row (AJ-646-M2 / design §5: /dashboard/settings?tab=billing#payment-<paymentId>),
 * shown as the bare URL.
 * No refund promise, no amounts, no card data, no document titles, and never the concern note.
 *
 * Data shape: the worker builds this from billing's GET /internal/payment-concerns/:id/email-view
 * at send time. It is NEVER taken from job data (the job carries userId and concernId only):
 *   { name?: string; reference: string; paymentUrl: string }   // name: greeting only
 */
import { Body, Container, Head, Hr, Html, Link, Text } from '@react-email/components';

import type { TemplateDef } from '../index';

import { TAX_INVOICE_STRINGS } from './taxInvoice';

export interface ConcernReceivedEmailData {
  name?: string;
  reference?: string;
  paymentUrl?: string;
}

/** AJ-646-M2, signed. `{ref}` is the concern reference. */
export const CONCERN_RECEIVED_SUBJECT = 'We have received your payment concern ({ref})';
/** AJ-646-M2, signed. `{ref}` is the concern reference. */
export const CONCERN_RECEIVED_BODY =
  'We have received your payment concern (reference {ref}). We acknowledge every concern within 24 hours and resolve it within 15 days. You can reply to this email to add details.';

/** AJ-646-M7: reused verbatim from the tax-invoice email (signed there). */
export const CONCERN_RECEIVED_STRINGS = {
  greeting: TAX_INVOICE_STRINGS.greeting,
  greetingNoName: TAX_INVOICE_STRINGS.greetingNoName,
  /** AJ-646-M7a: the signed sign-off, reused from the tax-invoice email. */
  signOff: TAX_INVOICE_STRINGS.signOff,
  footer1: TAX_INVOICE_STRINGS.footer1,
  /** AJ-646-M7a: signed for this email. */
  footer2: 'You are receiving this because you raised a payment concern on your Lawie account.',
  footer3: TAX_INVOICE_STRINGS.footer3,
  footer4: TAX_INVOICE_STRINGS.footer4,
} as const;

const S = CONCERN_RECEIVED_STRINGS;

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

interface Filled {
  subject: string;
  greeting: string;
  body: string;
  paymentUrl: string;
}

/** Never renders without a reference or link. Thrown messages name no value. */
function fill(data: ConcernReceivedEmailData): Filled {
  if (!nonEmpty(data.reference) || !nonEmpty(data.paymentUrl)) {
    throw new Error('billing.concernReceived rendered without reference or paymentUrl');
  }
  const { reference, paymentUrl } = data;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  return {
    subject: CONCERN_RECEIVED_SUBJECT.replace('{ref}', () => reference),
    greeting: name.length > 0 ? S.greeting.replace('{name}', () => name) : S.greetingNoName,
    body: CONCERN_RECEIVED_BODY.replace('{ref}', () => reference),
    paymentUrl,
  };
}

const textStyle = { color: '#0D1F3C', fontSize: 14, lineHeight: '22px' } as const;
const smallStyle = { color: '#0D1F3C99', fontSize: 11, lineHeight: '18px', margin: 0 } as const;

export const billingConcernReceivedTemplate: TemplateDef<ConcernReceivedEmailData> = {
  subject: (data) => fill(data).subject,
  text: (data) => {
    const f = fill(data);
    return [
      f.greeting,
      '',
      f.body,
      '',
      f.paymentUrl,
      '',
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
            <Text style={textStyle}>{f.body}</Text>
            <Text style={textStyle}>
              <Link href={f.paymentUrl} style={{ color: '#0D1F3C' }}>
                {f.paymentUrl}
              </Link>
            </Text>
            <Text style={textStyle}>{S.signOff}</Text>
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
