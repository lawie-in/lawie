// T-436 (b)/(c) — Ajay's signed GST copy, byte for byte against the legal file:
// Addendum 7 (1) privacy §1 and §2, Addendum 7 (3a) the Terms date, 5a the pricing FAQ answer.
import * as fs from 'fs';
import * as path from 'path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import PricingPage from '../pricing/page';
import PrivacyPage from '../privacy/page';
import TermsPage from '../terms/page';

jest.mock('@/components/marketing/SiteNav', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/marketing/SiteFooter', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/marketing/FloatCta', () => ({ __esModule: true, default: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPO = path.resolve(__dirname, '../../../../../..');
const legal = fs.readFileSync(path.join(REPO, 'handoff/legal/gst-tax-invoice-signed.md'), 'utf8');
const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

// The strings, typed out independently of the pages; each is also checked against the legal file.
const S1_OLD = 'Plan, Ink balance, payments and referrals.';
const S1_NEW =
  'Plan, Ink balance, payments and referrals, and the State you give us for your tax invoices.';
const S2_OLD_FRAG = 'take payments,';
const S2_NEW_FRAG = 'take payments, issue GST tax invoices,';
const S2_FULL =
  'We use it to create the drafts you ask for, keep you signed in, take payments, issue GST tax invoices, send you service emails, prevent misuse, and fix errors. We use case details only to produce and show your drafts.';
const A5A =
  'Yes. Prices shown include GST. After each payment we email you a GST tax invoice from Lawie, and you can download it from your account.';

let container: HTMLDivElement;
let root: Root;
function render(el: React.ReactElement): HTMLElement {
  act(() => root.render(el));
  return container;
}
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('T-436 the strings are the ones in the signed file (Addendum 7 (1), 5a)', () => {
  const flat = norm(legal.replace(/`/g, ''));
  it('privacy §1, §2 and pricing 5a appear in the legal file as typed here', () => {
    expect(legal).toContain(`\`${S1_NEW}\``);
    expect(legal).toContain(`\`${S1_OLD}\``);
    expect(legal).toContain(`\`${S2_NEW_FRAG}\``);
    expect(legal).toContain(`\`${S2_OLD_FRAG}\``);
    expect(legal).toContain(`\`${A5A}\``);
    expect(flat).toContain('Bump the "Last updated" date');
  });
});

describe('T-436 privacy page: §1 and §2 State lines (Ajay Addendum 7 (1))', () => {
  it('§1 payments bullet names the State, once, and the old bullet is gone', () => {
    const el = render(<PrivacyPage />);
    const items = Array.from(el.querySelectorAll('#collect li')).map((li) => norm(li.textContent));
    expect(items.filter((t) => t === S1_NEW)).toHaveLength(1);
    expect(items).not.toContain(S1_OLD);
  });

  it('§2 says "issue GST tax invoices," straight after "take payments," and the rest is unchanged', () => {
    const el = render(<PrivacyPage />);
    const p = norm(el.querySelector('#use p')?.textContent ?? '');
    expect(p).toBe(S2_FULL);
    expect(p).toContain(S2_NEW_FRAG);
  });
});

describe('T-436 terms page: Last updated (Addendum 7 (3a))', () => {
  it('is 22 October 2026 (T-541, moved on from the T-436 date 15 October), and the version file agrees', () => {
    expect(norm(render(<TermsPage />).textContent)).toContain('Last updated: 22 October 2026');
    const user = fs.readFileSync(path.join(REPO, 'apps/auth/src/models/User.model.ts'), 'utf8');
    expect(user).toContain("export const CURRENT_TERMS_VERSION = '2026-10-22';");
  });
});

describe('T-436 pricing FAQ 5a (Ajay, byte for byte)', () => {
  it('"Is GST included?" answers with the signed sentence, and the old Razorpay-receipt line is gone', () => {
    const text = norm(render(<PricingPage />).textContent);
    expect(text).toContain('Is GST included?');
    expect(text).toContain(A5A);
    expect(text).not.toContain('Your payment receipt from Razorpay will show the tax breakup');
    expect(text).not.toContain('inclusive of applicable taxes');
  });
});
