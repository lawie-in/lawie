// T-433: plan Ink expires monthly (yearly included, no carry); top-up Ink never expires.
// Pins Ajay's signed strings (handoff/legal/T-433-ink-expiry-wording-signed.md, 925bc30, and
// Addendum 2 of T-238-pricing-page-lines-signed.md, 74fe979) word for word, and his rule:
// no web string contains "rolls over", "roll over" or "carry over" except the signed negative lines.
import fs from 'fs';
import path from 'path';

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import PricingPage from '../../../app/(marketing)/pricing/page';
import TermsPage from '../../../app/(marketing)/terms/page';
import { UpgradeSuccessModal } from '../UpgradeSuccessModal';

jest.mock('@/components/marketing/SiteNav', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/marketing/SiteFooter', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/marketing/FloatCta', () => ({ __esModule: true, default: () => null }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(el: ReactElement) {
  act(() => root.render(el));
  return container.textContent ?? '';
}

const norm = (s: string) => s.replace(/\s+/g, ' ');

// Signed strings, byte-exact.
const MODAL_PLAN_LINE = 'Plan Ink resets each month; top-up Ink never expires';
const TERMS_SENTENCES =
  'Plan Ink is given for each month of your plan, including on annual plans. Plan Ink left unused at the end of that month expires and does not carry over. Top-up Ink you buy separately never expires.';
const TERMS_ANCHOR = 'a failed generation is not charged. ';
const FAQ_COST_LINE = 'You see the Ink cost before you generate a draft.';
const FAQ_EXPIRY =
  'Solo and Pro plans give you fresh Ink every month; plan Ink left unused at the end of the month does not carry over. You can also buy top-up packs anytime, and top-up Ink never expires.';

// The only text allowed to contain "carry over" (both are signed negative lines).
const SIGNED_NEGATIVE_LINES = [
  'plan Ink left unused at the end of the month does not carry over',
  'Plan Ink left unused at the end of that month expires and does not carry over.',
];

const FORBIDDEN = /rolls?[\s-]?over|carr(?:y|ies)[\s-]?over|carry-forward/gi;

function withoutSignedLines(text: string): string {
  return SIGNED_NEGATIVE_LINES.reduce((acc, line) => acc.split(line).join(''), text);
}

function modal(planLabel: string, ink: number) {
  return (
    <UpgradeSuccessModal
      planLabel={planLabel}
      inkPerCycle={ink}
      renewsOn="14 Nov 2026"
      onClose={() => undefined}
    />
  );
}

describe('T-433 UpgradeSuccessModal', () => {
  it('Solo shows the signed lines and no rollover promise', () => {
    const text = norm(render(modal('Solo', 50)));
    expect(text).toContain('50 Ink a month');
    expect(text).toContain(MODAL_PLAN_LINE);
    expect(text).not.toContain('reset each billing cycle');
    expect(text).not.toMatch(FORBIDDEN);
  });

  it('Pro shows the signed lines and no rollover promise', () => {
    const text = norm(render(modal('Pro', 150)));
    expect(text).toContain('150 Ink a month');
    expect(text).toContain(MODAL_PLAN_LINE);
    expect(text).not.toContain('reset each billing cycle');
    expect(text).not.toMatch(FORBIDDEN);
  });

  it('the modal says nothing about 2x cap on yearly', () => {
    expect(norm(render(modal('Solo', 50)))).not.toMatch(/2×|2x cap|up to 2/i);
  });
});

describe('T-433 Terms §6', () => {
  it('has the signed expiry sentences, straight after the failed-generation line', () => {
    const text = norm(render(<TermsPage />));
    expect(text).toContain(TERMS_ANCHOR + TERMS_SENTENCES);
  });

  it('bumps Last updated to 14 October 2026', () => {
    expect(norm(render(<TermsPage />))).toContain('Last updated: 14 October 2026');
  });

  it('has no unsigned rollover / carry wording', () => {
    const text = norm(render(<TermsPage />));
    expect(withoutSignedLines(text)).not.toMatch(FORBIDDEN);
    expect(text).toContain('does not carry over'); // the signed negative is present
  });
});

describe('T-433 Pricing FAQ "What is Ink?"', () => {
  it('has the cost line straight after "a failed generation is not charged."', () => {
    const text = norm(render(<PricingPage />));
    expect(text).toContain(`a failed generation is not charged. ${FAQ_COST_LINE}`);
  });

  it('has the signed expiry sentence and drops the old refill line', () => {
    const text = norm(render(<PricingPage />));
    expect(text).toContain(FAQ_EXPIRY);
    expect(text).not.toContain('Solo and Pro plans refill Ink every month');
  });

  it('has no unsigned rollover / carry wording', () => {
    const text = norm(render(<PricingPage />));
    expect(withoutSignedLines(text)).not.toMatch(FORBIDDEN);
  });
});

describe('T-433 whole-web rule (apps/web/src, non-test sources)', () => {
  const SRC = path.resolve(__dirname, '../../..'); // apps/web/src

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(full);
      return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
    });
  }

  it('scans a plausible number of files', () => {
    expect(sourceFiles(SRC).length).toBeGreaterThan(50);
  });

  it('no source file contains "rolls over", "roll over" or "carry over" outside the signed negative lines', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = norm(fs.readFileSync(file, 'utf8'));
      const rest = withoutSignedLines(text);
      const hits = rest.match(FORBIDDEN);
      if (hits) offenders.push(`${path.relative(SRC, file)}: ${hits.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('the signed negative lines appear only in terms and pricing pages', () => {
    const where: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = norm(fs.readFileSync(file, 'utf8'));
      if (/carry\s+over/i.test(text)) where.push(path.relative(SRC, file));
    }
    expect(where.sort()).toEqual([
      path.join('app', '(marketing)', 'pricing', 'page.tsx'),
      path.join('app', '(marketing)', 'terms', 'page.tsx'),
    ]);
  });
});
