/**
 * T-646 (AJ-646-M2, M7, M7a; Arjun 4-5): billing.concernReceived and admin.paymentConcern.
 * Every signed string byte-for-byte as literals (no reading handoff/). Subject and text are pure
 * and run in-process; HTML comes from the real renderer in one child process.
 */
import {
  CONCERN_RECEIVED_BODY,
  CONCERN_RECEIVED_SUBJECT,
  billingConcernReceivedTemplate,
} from '../templates/billing/concernReceived';
import { adminPaymentConcernTemplate } from '../templates/admin/paymentConcern';

import { renderRealBatch, type RealOutcome } from './helpers/t223-real-render';

const REF = 'PC-7K3M9QX2';
const URL = 'https://app.lawie.in/dashboard/settings?tab=billing#payment-507f1f77bcf86cd799439011';
const ACK = { name: 'Asha Verma', reference: REF, paymentUrl: URL };

const SIGNED_SUBJECT = `We have received your payment concern (${REF})`;
const SIGNED_BODY = `We have received your payment concern (reference ${REF}). We acknowledge every concern within 24 hours and resolve it within 15 days. You can reply to this email to add details.`;
const FOOTER = [
  'Lawie (Sole Proprietorship), Ranchi, Jharkhand',
  'You are receiving this because you raised a payment concern on your Lawie account.',
  'Help, data and privacy requests: contact@lawie.in',
  'Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms',
];

const NOTICE = {
  reference: REF,
  concernId: '507f1f77bcf86cd799439012',
  paymentId: '507f1f77bcf86cd799439011',
  razorpayPaymentId: 'pay_SentinelAbc123',
  reason: 'charged_no_ink',
  maskedEmail: 'a***@example.com',
  adminUrl: 'https://dashboard.razorpay.com/app/payments/pay_SentinelAbc123',
};

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

const CASES = [
  { id: 'billing.concernReceived', data: ACK },
  { id: 'billing.concernReceived', data: { reference: REF, paymentUrl: URL } },
  { id: 'billing.concernReceived', data: { ...ACK, name: '   ' } },
  { id: 'admin.paymentConcern', data: NOTICE },
];
let rendered: RealOutcome[];
beforeAll(() => {
  rendered = renderRealBatch(CASES);
});

describe('billing.concernReceived - AJ-646-M2 (signed strings)', () => {
  it('subject is exactly the signed string', async () => {
    expect(CONCERN_RECEIVED_SUBJECT).toBe('We have received your payment concern ({ref})');
    expect(billingConcernReceivedTemplate.subject(ACK)).toBe(SIGNED_SUBJECT);
  });

  it('body is exactly the signed string', () => {
    expect(CONCERN_RECEIVED_BODY).toBe(
      'We have received your payment concern (reference {ref}). We acknowledge every concern within 24 hours and resolve it within 15 days. You can reply to this email to add details.',
    );
    const text = billingConcernReceivedTemplate.text!(ACK);
    expect(text).toContain(SIGNED_BODY);
  });

  it('plain text: greeting with a name, body, link, sign-off, then the four footer lines', () => {
    const text = billingConcernReceivedTemplate.text!(ACK);
    expect(text).toBe(
      [
        'Hello Asha Verma,',
        '',
        SIGNED_BODY,
        '',
        URL,
        '',
        'Team Lawie',
        '',
        '--',
        ...FOOTER,
        '',
      ].join('\n'),
    );
  });

  it('greeting without a name (absent or blank) is "Hello,"', () => {
    for (const data of [
      { reference: REF, paymentUrl: URL },
      { ...ACK, name: '   ' },
    ]) {
      const text = billingConcernReceivedTemplate.text!(data);
      expect(text.split('\n')[0]).toBe('Hello,');
      expect(text).not.toMatch(/Hello [^,\n]/);
      expect(text).not.toContain('{name}');
    }
  });

  it('footer line 2 is the signed concern line; the tax-invoice payment line is absent (M7a)', () => {
    const text = billingConcernReceivedTemplate.text!(ACK);
    expect(text).toContain(FOOTER[1]);
    expect(text).not.toContain('because a payment was made');
  });

  it('has no help line, and nothing about refunds, amounts, cards or the note', () => {
    const text = billingConcernReceivedTemplate.text!(ACK);
    expect(text).not.toContain('Need help?');
    expect(text).not.toMatch(/refund(ed)? (you|will)|₹|Rs\.?\s?\d|card|invoice|title/i);
  });

  it('refuses to render without a reference or link, naming no value', () => {
    expect(() => billingConcernReceivedTemplate.subject({ paymentUrl: URL })).toThrow();
    expect(() => billingConcernReceivedTemplate.text!({ reference: REF })).toThrow();
    try {
      billingConcernReceivedTemplate.text!({ name: 'Asha Verma', reference: REF });
    } catch (e) {
      expect((e as Error).message).not.toContain('Asha');
      expect((e as Error).message).not.toContain(REF);
    }
  });

  it('replacement is literal: "$&" in a name or reference does not expand', () => {
    const text = billingConcernReceivedTemplate.text!({
      ...ACK,
      name: 'A$&B',
      reference: 'PC-$&$&',
    });
    expect(text).toContain('Hello A$&B,');
    expect(billingConcernReceivedTemplate.subject({ ...ACK, reference: 'PC-$&' })).toBe(
      'We have received your payment concern (PC-$&)',
    );
  });

  describe('rendered HTML (real renderer)', () => {
    it('renders ok; carries subject-matching body, greeting, link, sign-off and all footer lines', () => {
      const r = rendered[0];
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.subject).toBe(SIGNED_SUBJECT);
      expect(r.html).toContain(esc(SIGNED_BODY));
      expect(r.html).toContain('Hello Asha Verma,');
      expect(r.html).toContain('Team Lawie');
      expect(r.html).toContain(esc(URL));
      for (const line of FOOTER) expect(r.html).toContain(esc(line));
      expect(r.html).not.toContain('because a payment was made');
      expect(r.html).not.toContain('Need help?');
      expect(r.text).toBe(billingConcernReceivedTemplate.text!(ACK));
    });

    it('no name -> "Hello,"; blank name too', () => {
      for (const i of [1, 2]) {
        const r = rendered[i];
        expect(r.ok).toBe(true);
        if (!r.ok) continue;
        expect(r.html).toContain('Hello,');
        expect(r.html).not.toContain('Hello undefined');
        expect(r.text.startsWith('Hello,\n')).toBe(true);
      }
    });

    it('contains no unfilled footer placeholder', () => {
      const r = rendered[0];
      if (!r.ok) throw new Error('did not render');
      for (const part of [r.subject, r.html, r.text]) {
        expect(part).not.toMatch(/\[[^\]]*(PIN|registered address|placeholder)[^\]]*\]/i);
      }
    });
  });
});

describe('admin.paymentConcern - support notice (Arjun 4-5)', () => {
  it('subject carries the reference', () => {
    expect(adminPaymentConcernTemplate.subject(NOTICE)).toBe(`New payment concern ${REF}`);
  });

  it('text lists ids, the reason code, the masked address and the Razorpay link - nothing else', () => {
    expect(adminPaymentConcernTemplate.text!(NOTICE)).toBe(
      [
        `Concern: ${REF} (id 507f1f77bcf86cd799439012)`,
        'Category: charged_no_ink',
        'Payment: pay_SentinelAbc123 (Lawie id 507f1f77bcf86cd799439011)',
        'Customer: a***@example.com',
        'Open in Razorpay: https://dashboard.razorpay.com/app/payments/pay_SentinelAbc123',
        '',
      ].join('\n'),
    );
  });

  it('never shows the full address, a name, the note, an amount or a title - even if given', () => {
    const noisy = {
      ...NOTICE,
      note: 'MY-PRIVATE-NOTE',
      email: 'asha.verma@example.com',
      name: 'Asha Verma',
      amount: '₹1,999',
      title: 'Draft of bail application',
    };
    const text = adminPaymentConcernTemplate.text!(noisy);
    for (const s of ['MY-PRIVATE-NOTE', 'asha.verma', 'Asha Verma', '₹', 'bail']) {
      expect(text).not.toContain(s);
    }
    const r = rendered[3];
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.html).toContain('a***@example.com');
    expect(r.html).not.toContain('asha.verma');
    expect(r.html).toContain('https://dashboard.razorpay.com/app/payments/pay_SentinelAbc123');
  });

  it('a missing masked address reads "(not available)"; a missing id refuses to render', () => {
    expect(adminPaymentConcernTemplate.text!({ ...NOTICE, maskedEmail: '' })).toContain(
      'Customer: (not available)',
    );
    for (const k of [
      'reference',
      'concernId',
      'paymentId',
      'razorpayPaymentId',
      'reason',
      'adminUrl',
    ]) {
      expect(() => adminPaymentConcernTemplate.text!({ ...NOTICE, [k]: undefined })).toThrow();
    }
  });
});
