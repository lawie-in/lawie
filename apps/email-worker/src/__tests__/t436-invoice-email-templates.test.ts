/**
 * T-436 (b/c) slice 4: billing.taxInvoice and billing.creditNote, every visible string byte-exact
 * against what Ajay signed (handoff/legal/gst-tax-invoice-signed.md, Addenda 5, 7 (4a), 9) and
 * Madhuri's copy file (handoff/marketing/copy/invoice-email-t436.md, the lines Ajay left alone).
 *
 * Addendum 9 is not in every checkout of the legal file yet, so its strings are literals here,
 * copied from origin/develop_staging f4c7fbe0. Lines the signed file changes from the copy file
 * (amount line, footer line 1 and 2) are asserted against the signed form, and the stale copy-file
 * form is asserted ABSENT.
 *
 * @react-email/render cannot run in Jest, so HTML comes from the real renderer in one child
 * process (helpers/t223-real-render.ts). Subject and text are pure and run in-process.
 */
import fs from 'fs';
import path from 'path';

import {
  CREDIT_NOTE_STRINGS,
  CREDIT_NOTE_SUBJECT,
  billingCreditNoteTemplate,
} from '../templates/billing/creditNote';
import {
  TAX_INVOICE_STRINGS,
  TAX_INVOICE_SUBJECT,
  billingTaxInvoiceTemplate,
} from '../templates/billing/taxInvoice';

import { renderRealBatch, type RealOutcome } from './helpers/t223-real-render';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const COPY = fs.readFileSync(
  path.join(REPO, 'handoff', 'marketing', 'copy', 'invoice-email-t436.md'),
  'utf8',
);
const LEGAL = fs.readFileSync(
  path.join(REPO, 'handoff', 'legal', 'gst-tax-invoice-signed.md'),
  'utf8',
);

const INV = {
  name: 'Asha Verma',
  invoiceNumber: 'LAW/2026-27/0001',
  amount: '₹1,999',
  date: '14 Oct 2026',
  downloadUrl: 'https://app.lawie.in/invoices',
};
const CN = {
  name: 'Asha Verma',
  creditNoteNumber: 'LCN/2026-27/0001',
  invoiceNumber: 'LAW/2026-27/0001',
  amount: '₹799.50',
  date: '15 Oct 2026',
  downloadUrl: 'https://app.lawie.in/invoices',
};

/** What React's renderer does to text: & < > " ' */
const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

const FOOTER = [
  'Lawie (Sole Proprietorship), Ranchi, Jharkhand',
  'You are receiving this because a payment was made on your Lawie account.',
  'Help, data and privacy requests: contact@lawie.in',
  'Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms',
];
const CN_FOOTER = [
  FOOTER[0],
  'You are receiving this because a credit note was issued on your Lawie account.',
  FOOTER[2],
  FOOTER[3],
];

const expectedInvoiceText = (d: typeof INV, greeting = `Hello ${d.name},`) =>
  [
    greeting,
    '',
    `Thank you for your payment of ${d.amount} (including GST) on ${d.date}.`,
    `Your invoice number is ${d.invoiceNumber}.`,
    '',
    `Download invoice (PDF): ${d.downloadUrl}`,
    '',
    'Need help? Write to contact@lawie.in.',
    'Team Lawie',
    '',
    '--',
    ...FOOTER,
    '',
  ].join('\n');

const expectedCreditText = (d: typeof CN, greeting = `Hello ${d.name},`) =>
  [
    greeting,
    '',
    `We have issued a credit note of ${d.amount} (including GST) against invoice ${d.invoiceNumber}.`,
    `Your credit note number is ${d.creditNoteNumber}.`,
    '',
    `Download credit note (PDF): ${d.downloadUrl}`,
    '',
    'Need help? Write to contact@lawie.in.',
    'Team Lawie',
    '',
    '--',
    ...CN_FOOTER,
    '',
  ].join('\n');

// $& $' $` $$ are special in String.replace replacement strings.
const DOLLARS = "A$&B$'C$`D$$E";
const HOSTILE = `<script>alert(1)</script> & "Q" O'Neil`;
const SECRET = 'SECRETVALUE-9f3a';

type Case = { id: string; data: Record<string, unknown> };
const cases: Record<string, Case> = {
  inv: { id: 'billing.taxInvoice', data: INV },
  invNoName: { id: 'billing.taxInvoice', data: { ...INV, name: '' } },
  invHostile: {
    id: 'billing.taxInvoice',
    data: {
      name: HOSTILE,
      invoiceNumber: 'LAW/<b>&1',
      amount: '₹1 & "2"',
      date: "1 Oct <i>'26",
      downloadUrl: 'https://x.example/?a=1&b="><img src=x onerror=1>',
    },
  },
  invDollars: {
    id: 'billing.taxInvoice',
    data: {
      name: DOLLARS,
      invoiceNumber: DOLLARS,
      amount: DOLLARS,
      date: DOLLARS,
      downloadUrl: DOLLARS,
    },
  },
  cn: { id: 'billing.creditNote', data: CN },
  cnNoName: { id: 'billing.creditNote', data: { ...CN, name: '   ' } },
  cnNoDate: { id: 'billing.creditNote', data: { ...CN, date: undefined } },
  cnHostile: {
    id: 'billing.creditNote',
    data: {
      name: HOSTILE,
      creditNoteNumber: 'LCN/<b>&1',
      invoiceNumber: 'LAW/<u>&2',
      amount: '₹1 & "2"',
      downloadUrl: 'https://x.example/?a=1&b="><img src=x onerror=1>',
    },
  },
  cnDollars: {
    id: 'billing.creditNote',
    data: {
      name: DOLLARS,
      creditNoteNumber: DOLLARS,
      invoiceNumber: DOLLARS,
      amount: DOLLARS,
      downloadUrl: DOLLARS,
    },
  },
};
// Missing-field matrix: every required field absent, empty, blank, or the wrong type.
const REQUIRED: Record<string, string[]> = {
  'billing.taxInvoice': ['invoiceNumber', 'amount', 'date', 'downloadUrl'],
  'billing.creditNote': ['creditNoteNumber', 'invoiceNumber', 'amount', 'downloadUrl'],
};
const BAD_VALUES: Array<[string, unknown]> = [
  ['absent', undefined],
  ['empty', ''],
  ['blank', '   '],
  ['number', 42],
];
const missingKeys: string[] = [];
for (const [id, fields] of Object.entries(REQUIRED)) {
  for (const f of fields) {
    for (const [label] of BAD_VALUES) missingKeys.push(`${id}|${f}|${label}`);
  }
}
for (const k of missingKeys) {
  const [id, f, label] = k.split('|');
  const base = id === 'billing.taxInvoice' ? INV : CN;
  const bad = BAD_VALUES.find(([l]) => l === label)![1];
  // Every OTHER field carries SECRET so a leaked value in the message would be caught.
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(base)) data[key] = `${SECRET}-${key}`;
  data[f] = bad;
  cases[`missing:${k}`] = { id, data };
}

const keys = Object.keys(cases);
let out: Record<string, RealOutcome>;
beforeAll(() => {
  const res = renderRealBatch(keys.map((k) => cases[k]));
  out = Object.fromEntries(keys.map((k, i) => [k, res[i]]));
});
const ok = (k: string) => {
  const r = out[k];
  if (!r.ok) throw new Error(`case ${k} did not render`);
  return r;
};

describe('strings vs the signed sources', () => {
  it('invoice strings are byte-exact', () => {
    expect(TAX_INVOICE_SUBJECT).toBe('Your Lawie invoice {invoiceNumber}');
    expect(TAX_INVOICE_STRINGS).toEqual({
      preheader: 'Payment received on {date}. Your invoice is ready to download.',
      greeting: 'Hello {name},',
      greetingNoName: 'Hello,',
      amountLine: 'Thank you for your payment of {amount} (including GST) on {date}.',
      numberLine: 'Your invoice number is {invoiceNumber}.',
      button: 'Download invoice (PDF)',
      linkLine: 'Download invoice (PDF): {downloadUrl}',
      help: 'Need help? Write to contact@lawie.in.',
      signOff: 'Team Lawie',
      footer1: FOOTER[0],
      footer2: FOOTER[1],
      footer3: FOOTER[2],
      footer4: FOOTER[3],
    });
  });

  it('credit-note strings are byte-exact', () => {
    expect(CREDIT_NOTE_SUBJECT).toBe('Your Lawie credit note {creditNoteNumber}');
    expect(CREDIT_NOTE_STRINGS).toEqual({
      preheader: 'Your credit note is ready to download.',
      greeting: 'Hello {name},',
      greetingNoName: 'Hello,',
      amountLine:
        'We have issued a credit note of {amount} (including GST) against invoice {invoiceNumber}.',
      numberLine: 'Your credit note number is {creditNoteNumber}.',
      button: 'Download credit note (PDF)',
      linkLine: 'Download credit note (PDF): {downloadUrl}',
      help: 'Need help? Write to contact@lawie.in.',
      signOff: 'Team Lawie',
      footer1: CN_FOOTER[0],
      footer2: CN_FOOTER[1],
      footer3: CN_FOOTER[2],
      footer4: CN_FOOTER[3],
    });
  });

  it('the lines Ajay left as drafted appear verbatim in Madhuri copy file', () => {
    for (const s of [
      'Your Lawie invoice {invoiceNumber}',
      'Payment received on {date}. Your invoice is ready to download.',
      'Download invoice (PDF)',
      'Hello {name},',
      'Your invoice number is {invoiceNumber}.',
      'Download invoice (PDF): {downloadUrl}',
      'Need help? Write to contact@lawie.in.',
      'Team Lawie',
      // FOOTER[2] is left out: AJ-559-M1 replaced it, and the Madhuri copy file predates that.
      FOOTER[3],
    ]) {
      expect(COPY).toContain(s);
    }
  });

  it('the lines Ajay changed: signed form in the legal file, stale draft form not shipped', () => {
    // Addendum 5 #4 / #2 / #1 (and Addendum 4 point 3 for Ranchi).
    expect(LEGAL).toContain('Thank you for your payment of {amount} (including GST) on {date}.');
    expect(LEGAL).toContain(FOOTER[1]);
    expect(LEGAL).toContain(FOOTER[0]);
    expect(LEGAL).toContain('If `{name}` is empty: `Hello,`');
    // Addendum 7 (4a)
    expect(LEGAL).toContain('Your Lawie credit note {creditNoteNumber}');
    expect(LEGAL).toContain(
      'We have issued a credit note of {amount} (including GST) against invoice {invoiceNumber}.',
    );
    expect(LEGAL).toContain('Download credit note (PDF)');
    // The draft wording must be gone from every output.
    for (const k of ['inv', 'cn']) {
      const r = ok(k);
      for (const part of [r.html, r.text]) {
        expect(part).not.toContain('a payment was made on a Lawie account');
        expect(part).not.toContain('[Ajay to confirm footer address]');
        expect(part).not.toContain('Patna');
        expect(part).not.toMatch(/\[[^\]]*\]/);
      }
    }
    expect(ok('inv').text).not.toContain('payment of ₹1,999 on');
  });
});

describe('billing.taxInvoice rendering', () => {
  it('subject is exactly "Your Lawie invoice {number}"', () => {
    expect(ok('inv').subject).toBe('Your Lawie invoice LAW/2026-27/0001');
    expect(billingTaxInvoiceTemplate.subject(INV)).toBe('Your Lawie invoice LAW/2026-27/0001');
  });

  it('plain text is the exact signed body, link line included', () => {
    expect(ok('inv').text).toBe(expectedInvoiceText(INV));
    expect(billingTaxInvoiceTemplate.text!(INV)).toBe(expectedInvoiceText(INV));
  });

  it('HTML carries every signed string, the button, and the href', () => {
    const { html } = ok('inv');
    for (const s of [
      'Payment received on 14 Oct 2026. Your invoice is ready to download.',
      'Hello Asha Verma,',
      'Thank you for your payment of ₹1,999 (including GST) on 14 Oct 2026.',
      'Your invoice number is LAW/2026-27/0001.',
      'Download invoice (PDF)',
      'Need help? Write to contact@lawie.in.',
      'Team Lawie',
      ...FOOTER,
    ]) {
      expect(html).toContain(esc(s));
    }
    expect(html).toContain('href="https://app.lawie.in/invoices"');
    // The button text is the label; the plain-text "label: url" line is not in the HTML.
    expect(html).not.toContain('Download invoice (PDF): ');
  });

  it('no name gives "Hello," in subject-free text and HTML; blank name too', () => {
    expect(ok('invNoName').text).toBe(expectedInvoiceText({ ...INV, name: '' }, 'Hello,'));
    expect(ok('invNoName').html).toContain('Hello,');
    expect(ok('invNoName').html).not.toMatch(/Hello\s+,/);
    expect(billingTaxInvoiceTemplate.text!({ ...INV, name: undefined })).toBe(
      expectedInvoiceText(INV, 'Hello,'),
    );
    expect(billingTaxInvoiceTemplate.text!({ ...INV, name: 7 as unknown as string })).toBe(
      expectedInvoiceText(INV, 'Hello,'),
    );
  });

  it('a name is trimmed', () => {
    expect(billingTaxInvoiceTemplate.text!({ ...INV, name: '  Asha  ' }).split('\n')[0]).toBe(
      'Hello Asha,',
    );
  });

  it('HTML escapes the name and every value; text keeps them raw', () => {
    const { html, text } = ok('invHostile');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<i>');
    expect(html).not.toContain('<img');
    expect(html).toContain(esc(`Hello ${HOSTILE},`));
    expect(html).toContain(esc('Your invoice number is LAW/<b>&1.'));
    expect(html).toContain(
      esc('Thank you for your payment of ₹1 & "2" (including GST) on 1 Oct <i>\'26.'),
    );
    expect(html).toContain('&lt;script&gt;');
    expect(text).toContain(`Hello ${HOSTILE},`);
    expect(text).toContain('LAW/<b>&1');
  });

  it("$&, $', $` and $$ in a value are inserted literally (subject, text, HTML)", () => {
    const { subject, text, html } = ok('invDollars');
    expect(subject).toBe(`Your Lawie invoice ${DOLLARS}`);
    expect(text).toBe(
      expectedInvoiceText({
        name: DOLLARS,
        invoiceNumber: DOLLARS,
        amount: DOLLARS,
        date: DOLLARS,
        downloadUrl: DOLLARS,
      }),
    );
    expect(html).toContain(esc(`Hello ${DOLLARS},`));
    expect(html).toContain(esc(`Your invoice number is ${DOLLARS}.`));
    expect(html).toContain(
      esc(`Thank you for your payment of ${DOLLARS} (including GST) on ${DOLLARS}.`),
    );
  });

  it.each(missingKeys.filter((k) => k.startsWith('billing.taxInvoice')))(
    'refuses to render when %s, and the error names no value',
    (k) => {
      const r = out[`missing:${k}`];
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.message).not.toContain(SECRET);
      expect(r.message).toMatch(/billing\.taxInvoice/);
      // subject() and text() refuse too, not just Body.
      const data = cases[`missing:${k}`].data;
      expect(() => billingTaxInvoiceTemplate.subject(data)).toThrow();
      expect(() => billingTaxInvoiceTemplate.text!(data)).toThrow();
    },
  );
});

describe('billing.creditNote rendering', () => {
  it('subject is exactly "Your Lawie credit note {number}"', () => {
    expect(ok('cn').subject).toBe('Your Lawie credit note LCN/2026-27/0001');
    expect(billingCreditNoteTemplate.subject(CN)).toBe('Your Lawie credit note LCN/2026-27/0001');
  });

  it('plain text is the exact signed body, link line included', () => {
    expect(ok('cn').text).toBe(expectedCreditText(CN));
    expect(billingCreditNoteTemplate.text!(CN)).toBe(expectedCreditText(CN));
  });

  it('HTML carries every signed string, the button, and the href', () => {
    const { html } = ok('cn');
    for (const s of [
      'Your credit note is ready to download.',
      'Hello Asha Verma,',
      'We have issued a credit note of ₹799.50 (including GST) against invoice LAW/2026-27/0001.',
      'Your credit note number is LCN/2026-27/0001.',
      'Download credit note (PDF)',
      'Need help? Write to contact@lawie.in.',
      'Team Lawie',
      ...CN_FOOTER,
    ]) {
      expect(html).toContain(esc(s));
    }
    expect(html).toContain('href="https://app.lawie.in/invoices"');
    expect(html).not.toContain('Download credit note (PDF): ');
    // Invoice-only wording must not leak into the credit note.
    expect(html).not.toContain('Your invoice is ready');
    expect(html).not.toContain('Thank you for your payment');
    expect(html).not.toContain('a payment was made');
    expect(ok('cn').text).not.toContain('Your invoice number is');
  });

  it('the original invoice number and the credit-note number each appear in their own line', () => {
    const lines = ok('cn').text.split('\n');
    expect(lines[2]).toContain('against invoice LAW/2026-27/0001.');
    expect(lines[2]).not.toContain('LCN/');
    expect(lines[3]).toBe('Your credit note number is LCN/2026-27/0001.');
  });

  it('no name (or blank) gives "Hello,"', () => {
    expect(ok('cnNoName').text).toBe(expectedCreditText({ ...CN, name: '' }, 'Hello,'));
    expect(ok('cnNoName').html).not.toMatch(/Hello\s+,/);
    expect(billingCreditNoteTemplate.text!({ ...CN, name: undefined })).toBe(
      expectedCreditText(CN, 'Hello,'),
    );
  });

  it('renders without a date (no signed credit-note string uses {date})', () => {
    expect(ok('cnNoDate').text).toBe(expectedCreditText({ ...CN, date: '' }));
  });

  it('HTML escapes the name and every value; text keeps them raw', () => {
    const { html, text } = ok('cnHostile');
    for (const bad of ['<script>', '<b>', '<u>', '<img']) expect(html).not.toContain(bad);
    expect(html).toContain(esc(`Hello ${HOSTILE},`));
    expect(html).toContain(esc('Your credit note number is LCN/<b>&1.'));
    expect(html).toContain(
      esc('We have issued a credit note of ₹1 & "2" (including GST) against invoice LAW/<u>&2.'),
    );
    expect(text).toContain(`Hello ${HOSTILE},`);
  });

  it("$&, $', $` and $$ in a value are inserted literally (subject, text, HTML)", () => {
    const { subject, text, html } = ok('cnDollars');
    expect(subject).toBe(`Your Lawie credit note ${DOLLARS}`);
    expect(text).toBe(
      expectedCreditText({
        name: DOLLARS,
        creditNoteNumber: DOLLARS,
        invoiceNumber: DOLLARS,
        amount: DOLLARS,
        date: '',
        downloadUrl: DOLLARS,
      }),
    );
    expect(html).toContain(esc(`Your credit note number is ${DOLLARS}.`));
    expect(html).toContain(
      esc(`We have issued a credit note of ${DOLLARS} (including GST) against invoice ${DOLLARS}.`),
    );
  });

  it.each(missingKeys.filter((k) => k.startsWith('billing.creditNote')))(
    'refuses to render when %s, and the error names no value',
    (k) => {
      const r = out[`missing:${k}`];
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.message).not.toContain(SECRET);
      expect(r.message).toMatch(/billing\.creditNote/);
      const data = cases[`missing:${k}`].data;
      expect(() => billingCreditNoteTemplate.subject(data)).toThrow();
      expect(() => billingCreditNoteTemplate.text!(data)).toThrow();
    },
  );
});
