// T-366: legal copy lines on the marketing site (Ajay's sign-off, addenda 1 and 2).
// Pins the run-3 repro cases: FAQ answers, About export line, Tools bail card section,
// home title, and the email-verified qualifier on every 5-Ink sign-up promise.
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { metadata as rootMetadata } from '../../layout';
import AboutPage from '../about/page';
import FaqPage from '../faq/page';
import { metadata as marketingMetadata } from '../layout';
import HomePage, { metadata as homeMetadata } from '../page';
import { metadata as pricingMetadata } from '../pricing/layout';
import PricingPage from '../pricing/page';
import ToolsPage from '../tools/page';

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

const FAQ_FREE =
  '5 Ink on sign-up, once your email is verified (lifetime). Every document type on Lawie, PDF and DOCX export. Criminal drafts use BNS, BNSS and BSA section numbers.';
const FAQ_COST =
  'Lawie has a free tier that includes 5 Ink (lifetime), once your email is verified. Paid plans add more Ink; see the pricing page for current plans.';

// Every sentence-ish window that mentions "5 Ink" must say "verified" within it.
function fiveInkMentions(text: string): string[] {
  const out: string[] = [];
  const re = /5 Ink/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(text.slice(m.index, m.index + 120));
  }
  return out;
}

describe('T-366 FAQ (AC1)', () => {
  it('has the exact free-tier and cost answers', () => {
    const text = norm(render(<FaqPage />));
    expect(text).toContain(FAQ_FREE);
    expect(text).toContain(FAQ_COST);
    expect(FAQ_COST).not.toContain('every month');
    expect(text).not.toContain('Paid plans add Ink every month');
  });

  it('no longer claims court formatting, BNS validation or plan prices', () => {
    const text = norm(render(<FaqPage />));
    expect(text).not.toMatch(/court formatting/i);
    expect(text).not.toMatch(/BNS validation/i);
    expect(text).not.toMatch(/Five Ink/);
    expect(text).not.toContain('Pro is ₹');
    expect(text).not.toContain('Solo is ₹');
  });
});

describe('T-366 About (AC1, AC5)', () => {
  it('says the export line exactly, without finished document or filing checklist', () => {
    const text = norm(render(<AboutPage />));
    expect(text).toContain('Exports the draft as PDF or DOCX.');
    expect(text).not.toMatch(/finished document/i);
    expect(text).not.toMatch(/filing checklist/i);
  });

  it('qualifies the 5 Ink CTA with email verification', () => {
    const text = norm(render(<AboutPage />));
    expect(text).toContain('Free for your first 5 Ink, once your email is verified.');
  });
});

describe('T-366 Tools card (AC2)', () => {
  it('shows S.478 BNSS and not S.480 on the bail card', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ tool_timeline: true, tool_bail_checker: true }),
    });
    const page = await ToolsPage();
    const text = norm(render(page));
    expect(text).toContain('Bailable · S.478 BNSS');
    expect(text).not.toContain('S.480');
  });
});

describe('T-366 metadata (AC4, AC5)', () => {
  it('home title equals the root layout title', () => {
    expect(homeMetadata.title).toBe('Lawie — Drafting Assistant for Indian Advocates');
    expect(homeMetadata.title).toBe(rootMetadata.title);
  });

  it('marketing layout description is exact', () => {
    expect(marketingMetadata.description).toBe(
      'Legal drafting for Indian advocates. Criminal drafts use BNS, BNSS and BSA section numbers.',
    );
  });

  it('pricing meta description carries the verified qualifier', () => {
    const d = String(pricingMetadata.description);
    expect(d).toContain('5 Ink');
    expect(d).toContain('once your email is verified');
  });
});

describe('T-366 every 5-Ink sign-up promise says verified (AC5)', () => {
  it.each([
    ['home', () => <HomePage />],
    ['about', () => <AboutPage />],
    ['pricing', () => <PricingPage />],
    ['faq', () => <FaqPage />],
  ])('%s page', (_name, make) => {
    const text = norm(render(make()));
    const mentions = fiveInkMentions(text);
    expect(mentions.length).toBeGreaterThan(0);
    for (const m of mentions) {
      expect(m).toMatch(/verified/);
    }
  });

  it('home plan cell, hero note and CTA wording', () => {
    const text = norm(render(<HomePage />));
    expect(text).toContain('5 Ink, lifetime, once email verified');
    expect(text).toContain('Free tier: 5 Ink (lifetime), once your email is verified');
    expect(text).toContain(
      'Free for your first 5 Ink, once your email is verified. No card required.',
    );
  });

  it('pricing Free card and FAQ answer', () => {
    const text = norm(render(<PricingPage />));
    expect(text).not.toContain('5 Ink — forever');
    const cells = Array.from(container.querySelectorAll('.plan-alt')).map((e) => e.textContent);
    expect(cells).toContain('5 Ink, lifetime, once email verified');
    const freeCell = cells.find((c) => c?.startsWith('5 Ink'));
    expect(freeCell).toBe('5 Ink, lifetime, once email verified');
    expect(freeCell).not.toMatch(/forever/i);
    expect(text).toContain(
      'The Free plan gives you 5 Ink on sign-up, once your email is verified (lifetime).',
    );
  });
});
