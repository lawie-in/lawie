/**
 * T-436 AC10 (Ajay, handoff/legal/gst-tax-invoice-signed.md, Addendum 4 point 3 and Addendum 5
 * point 1): the auth.verifyEmail footer names Lawie as `Lawie (Sole Proprietorship), Ranchi,
 * Jharkhand`. No email carries "Patna" or a bracketed placeholder. Uses the REAL renderer (child
 * process, see helpers/t223-real-render.ts). The guard itself is covered in t223/t379 tests with an
 * injected unfilled footer.
 */
import { listTemplates } from '../templates';
import { VERIFY_EMAIL_STRINGS } from '../templates/auth/verifyEmail';
import { templateHasUnfilledFooter, anyTemplateUnfilled } from '../placeholders';

import { INVOICE_SENTINEL_FIELDS, renderReal } from './helpers/t223-real-render';

const SIGNED_FOOTER = 'Lawie (Sole Proprietorship), Ranchi, Jharkhand';
const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const SENTINEL = {
  name: 'Sentinel Name',
  userId: USER_ID,
  verifyUrl: 'https://app.lawie.in/verify-email?token=sentinel',
  loginUrl: 'https://app.lawie.in/login',
  link: 'https://app.lawie.in/x',
  url: 'https://app.lawie.in/x',
  // auth.unverifiedDeletionNotice (T-358) refuses to render without these.
  variant: 'A',
  deletionDate: '21 October 2026',
  // billing.taxInvoice / billing.creditNote (T-436 b/c) refuse to render without these.
  ...INVOICE_SENTINEL_FIELDS,
};

describe('auth.verifyEmail footer (Ajay, byte-exact)', () => {
  const rendered = renderReal('auth.verifyEmail', SENTINEL);

  it('the signed footer string is exactly Lawie (Sole Proprietorship), Ranchi, Jharkhand', () => {
    expect(VERIFY_EMAIL_STRINGS.footer1).toBe(SIGNED_FOOTER);
  });

  it('html carries the signed footer line, text carries it as its own line', () => {
    expect(rendered.html).toContain(SIGNED_FOOTER);
    expect(rendered.text.split('\n').map((l) => l.trim())).toContain(SIGNED_FOOTER);
  });

  it('html and text have no "[" placeholder token and no Patna / Bihar / PIN', () => {
    for (const part of [rendered.html, rendered.text]) {
      expect(part).not.toContain('[registered address]');
      expect(part).not.toContain('[PIN]');
      expect(part).not.toMatch(/\[[^\]]*(placeholder|PIN|address)[^\]]*\]/i);
      expect(part).not.toContain('Patna');
      expect(part).not.toContain('Bihar');
    }
    // The footer area has no brackets at all (the verify link is the only other URL text).
    expect(VERIFY_EMAIL_STRINGS.footer1).not.toContain('[');
  });

  it('footer lines 2-4 are unchanged by T-436', () => {
    expect(VERIFY_EMAIL_STRINGS.footer2).toBe(
      'You are receiving this because this address was used to create a Lawie account.',
    );
    expect(VERIFY_EMAIL_STRINGS.footer3).toBe(
      'Help: contact@lawie.in · Data and privacy requests: privacy@lawie.in',
    );
    expect(VERIFY_EMAIL_STRINGS.footer4).toBe(
      'Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms',
    );
  });

  it('the shipped footer passes the guard (nothing unfilled), so live sends are allowed', () => {
    expect(templateHasUnfilledFooter('auth.verifyEmail')).toBe(false);
    expect(anyTemplateUnfilled()).toBe(false);
  });
});

describe('sweep: every registered template (T-436 AC10 test line)', () => {
  const ids: string[] = listTemplates();

  it('registers at least the two known templates', () => {
    expect(ids).toEqual(expect.arrayContaining(['auth.verifyEmail', 'auth.welcome']));
  });

  it.each(ids)('%s renders with no placeholder token and no Patna', (id) => {
    const r = renderReal(id, SENTINEL);
    for (const part of [r.subject, r.html, r.text]) {
      expect(part).not.toMatch(/\[[^\]]*(PIN|registered address|placeholder)[^\]]*\]/i);
      expect(part).not.toContain('Patna');
      expect(part).not.toContain('Patna, Bihar');
    }
  });
});
