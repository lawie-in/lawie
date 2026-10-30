/**
 * T-646 (Arjun ruling 4): the support notice for a new payment concern (`admin.paymentConcern`),
 * sent to billing's SUPPORT_NOTIFY_EMAIL (default contact@lawie.in, AJ-646-M6). Internal mail,
 * not customer copy.
 *
 * Ids only: the concern reference and id, the payment ids, the reason CODE, the customer's
 * MASKED address and support's link to the payment. Never the concern note (Arjun ruling 5),
 * never an amount, a name, a full address or a document title.
 *
 * Data shape: the worker builds this from billing's GET /internal/payment-concerns/:id/email-view
 * at send time; the job carries userId and concernId only.
 */
import { Body, Container, Head, Html, Link, Text } from '@react-email/components';

import type { TemplateDef } from '../index';

export interface PaymentConcernNoticeData {
  reference?: string;
  concernId?: string;
  paymentId?: string;
  razorpayPaymentId?: string;
  reason?: string;
  maskedEmail?: string;
  adminUrl?: string;
}

export const PAYMENT_CONCERN_NOTICE_SUBJECT = 'New payment concern {ref}';

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

interface Filled {
  subject: string;
  lines: string[];
  adminUrl: string;
}

/** Never renders with a missing id. Thrown messages name no value. */
function fill(data: PaymentConcernNoticeData): Filled {
  const { reference, concernId, paymentId, razorpayPaymentId, reason, maskedEmail, adminUrl } =
    data;
  if (
    !nonEmpty(reference) ||
    !nonEmpty(concernId) ||
    !nonEmpty(paymentId) ||
    !nonEmpty(razorpayPaymentId) ||
    !nonEmpty(reason) ||
    !nonEmpty(adminUrl)
  ) {
    throw new Error('admin.paymentConcern rendered without its ids');
  }
  return {
    subject: PAYMENT_CONCERN_NOTICE_SUBJECT.replace('{ref}', () => reference),
    lines: [
      `Concern: ${reference} (id ${concernId})`,
      `Category: ${reason}`,
      `Payment: ${razorpayPaymentId} (Lawie id ${paymentId})`,
      `Customer: ${nonEmpty(maskedEmail) ? maskedEmail : '(not available)'}`,
    ],
    adminUrl,
  };
}

const textStyle = { color: '#0D1F3C', fontSize: 14, lineHeight: '22px' } as const;

export const adminPaymentConcernTemplate: TemplateDef<PaymentConcernNoticeData> = {
  subject: (data) => fill(data).subject,
  text: (data) => {
    const f = fill(data);
    return [...f.lines, `Open in Razorpay: ${f.adminUrl}`, ''].join('\n');
  },
  Body: (data) => {
    const f = fill(data);
    return (
      <Html>
        <Head />
        <Body style={{ fontFamily: 'Helvetica, Arial, sans-serif', margin: 0, padding: 0 }}>
          <Container style={{ maxWidth: 600, margin: '0 auto', padding: '24px' }}>
            {f.lines.map((line) => (
              <Text key={line} style={{ ...textStyle, margin: '0 0 4px' }}>
                {line}
              </Text>
            ))}
            <Text style={textStyle}>
              <Link href={f.adminUrl}>Open in Razorpay</Link>
            </Text>
          </Container>
        </Body>
      </Html>
    );
  },
};
