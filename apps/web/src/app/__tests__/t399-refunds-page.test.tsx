import { readFileSync } from 'fs';
import { join, resolve } from 'path';

import { act } from 'react';
import { createRoot } from 'react-dom/client';

import RefundsPage, { metadata } from '../(marketing)/refunds/page';

// T-399 / T-564: the Refund Policy page. T-564 (Ajay, 22 Oct 2026) replaced the annual-plan
// text with four signed paragraphs; the signed strings are parsed from the review file.
// The marketing chrome is stubbed; only the page body is under test.
jest.mock('@/components/marketing/FloatCta', () => () => null);
jest.mock('@/components/marketing/SiteFooter', () => () => null);
jest.mock('@/components/marketing/SiteNav', () => () => null);

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REVIEW = readFileSync(
  join(resolve(__dirname, '../../../../..'), 'handoff/legal/pre-anushka-legal-review-22-oct.md'),
  'utf8',
);
const norm = (s: string) => s.replace(/\s+/g, ' ');

function signedParagraphs(): string[] {
  return REVIEW.split('**Refunds text (item 11), signed.**')[1]
    .split('\n')
    .filter((l) => /^\d\. `/.test(l))
    .map((l) => /`([^`]+)`/.exec(l)![1]);
}

function a2Meta(): string {
  const row = REVIEW.split('\n').find((l) => l.startsWith('| A2 |'))!;
  return /Meta description: `([^`]+)`/.exec(row)![1];
}

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<RefundsPage />));
  return {
    container,
    cleanup: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe('refund page (T-564 item 11)', () => {
  it('parses the four signed paragraphs from the review file', () => {
    expect(signedParagraphs()).toEqual([
      'Payments for plans and Ink top-up packs are non-refundable once the plan period has started or the Ink has been added to your account.',
      'If you were charged twice for the same purchase, or charged by mistake, write to contact@lawie.in within 30 days. We will check and refund the extra amount to the original payment method, and issue a GST credit note.',
      'Cancelling a plan stops future charges and takes effect at the end of the current billing period.',
      'This does not affect any right you have under law.',
    ]);
  });

  it('renders the four signed paragraphs exactly, in order, as the first four paragraphs', async () => {
    const { container, cleanup } = await render();
    const paras = Array.from(container.querySelectorAll('.refund-card p')).map((p) =>
      norm(p.textContent ?? ''),
    );
    expect(paras.slice(0, 4)).toEqual(signedParagraphs());
    await cleanup();
  });

  it('keeps the billing-contact paragraph and the governing-law sentence (A2 b, c)', async () => {
    const { container, cleanup } = await render();
    const paras = Array.from(container.querySelectorAll('.refund-card p'));
    expect(paras).toHaveLength(6);
    expect(norm(paras[4].textContent ?? '')).toBe(
      'For billing questions, contact us at contact@lawie.in.',
    );
    expect(paras[4].querySelector('a')?.getAttribute('href')).toBe('mailto:contact@lawie.in');
    expect(norm(paras[5].textContent ?? '')).toBe('This policy is governed by Indian law.');
    await cleanup();
  });

  it('is dated 22 October 2026 (A1), not 1 June', async () => {
    const { container, cleanup } = await render();
    const text = norm(container.textContent ?? '');
    expect(text).toContain('Last updated: 22 October 2026');
    expect(text).not.toContain('1 June');
    await cleanup();
  });

  it('has the signed meta description (A2 a)', () => {
    expect(a2Meta()).toBe("Lawie's refund policy for plans and Ink top-up packs.");
    expect(metadata.description).toBe(a2Meta());
  });

  it('says nothing about annual plans, in the body or the meta', async () => {
    const { container, cleanup } = await render();
    expect(container.textContent ?? '').not.toMatch(/annual|yearly|year you paid/i);
    expect(String(metadata.description)).not.toMatch(/annual|yearly/i);
    await cleanup();
  });

  it('drops the old subscription-only wording', async () => {
    const { container, cleanup } = await render();
    const text = norm(container.textContent ?? '');
    expect(text).not.toContain('Cancellation does not refund payments already made');
    expect(text).not.toContain('you keep your monthly Ink');
    await cleanup();
  });
});
