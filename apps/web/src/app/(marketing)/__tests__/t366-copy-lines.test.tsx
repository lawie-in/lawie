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

// Every sentence-ish window that mentions "5 Ink" must say "verified" (or "verify", T-517:
// "Verify your email to receive your 5 Ink.") within it, looking 60 characters back and 120 on.
function fiveInkMentions(text: string): string[] {
  const out: string[] = [];
  const re = /5 Ink/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(text.slice(Math.max(0, m.index - 60), m.index + 120));
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
    expect(homeMetadata.title).toBe('Lawie: drafting assistant for advocates in India');
    expect(rootMetadata.title).toBe('Lawie: drafting assistant for advocates in India');
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
      expect(m).toMatch(/verif(y|ied)/i);
    }
  });

  it('home plan cell, hero note and CTA wording (T-517 signed lines)', () => {
    const text = norm(render(<HomePage />));
    expect(text).toContain('5 Ink on sign-up, once your email is verified (one time)');
    expect(text).toContain('Verify your email to receive your 5 Ink.');
    expect(text).toContain('Start with 5 free Ink');
    expect(text).toContain('No card needed.');
    expect(text).not.toMatch(/lifetime/i);
  });

  it('pricing Free card and FAQ answer', () => {
    const text = norm(render(<PricingPage />));
    expect(text).not.toContain('5 Ink — forever');
    const free = container.querySelector('[data-plan="free"]') as HTMLElement;
    expect(free.textContent).toContain('5 Ink on sign-up, once your email is verified (one time)');
    expect(free.textContent).not.toMatch(/forever|lifetime/i);
    expect(text).not.toMatch(/lifetime/i);
  });
});

// Plan-name contexts for a capital "Free": the card title, "Everything in Free", "the Free plan".
const PLAN_NAME_FREE =
  /(Free₹0|Free, p|Free pl|Everything in Free|Free\s?Start|Free\s?\u20B9|The Free)/;

describe('T-398 / T-517 pricing page copy (Ajay conditions 1-4)', () => {
  const planCard = (id: string) => container.querySelector(`[data-plan="${id}"]`) as HTMLElement;

  it('Free card: ₹0 without /lifetime, Ink line, button, document-type row', () => {
    render(<PricingPage />);
    const free = planCard('free');
    expect(free.textContent).toContain('₹0');
    expect(free.textContent).not.toMatch(/\/\s*lifetime/i);
    expect(free.textContent).toContain('5 Ink on sign-up, once your email is verified (one time)');
    expect(free.querySelector('a')?.textContent?.trim()).toBe('Start with 5 free Ink');
    expect(free.textContent).toContain('Every document type on Lawie');
  });

  it('intro is the signed Ink line (no hero "Buy more" subline any more)', () => {
    const text = norm(render(<PricingPage />));
    expect(text).toContain(
      'Ink is what a draft costs. You see the Ink cost before you generate. If a draft fails to generate, no Ink is used.',
    );
  });

  it('no watermark, Priority or Early access text anywhere on the page', () => {
    const text = norm(render(<PricingPage />));
    expect(text).not.toMatch(/watermark/i);
    expect(text).not.toMatch(/priority/i);
    expect(text).not.toMatch(/early access/i);
  });

  // The one widening of this rule (T-531): Ajay signed the phone top bar's short call to action,
  // `Start free` (AJ-531-M1, ruling 83587fe5, handoff/legal/T-511-copy-rulings-ajay.md). It is
  // true because creating an account costs nothing. His conditions stay: the page it opens keeps
  // the signed Free plan terms, and `Free forever` is never allowed. So the only lower-case
  // "free" allowed besides "5 free Ink" is the link text `Start free` in the header, byte for byte.
  const AJ_531_M1_CTA = 'Start free';

  it('every lower-case "free" sits in "5 free Ink", or is the Ajay-signed "Start free" link', () => {
    const text = norm(render(<PricingPage />));
    // Exactly the signed header link (one phone call to action), nothing longer or looser.
    const signed = Array.from(container.querySelectorAll('header a')).filter(
      (a) => a.textContent === AJ_531_M1_CTA,
    );
    expect(signed).toHaveLength(1);
    expect(signed[0].getAttribute('href')).toBe('/login?mode=signup');
    // Every "Start free" in the page text is that link, and it is never extended ("Start free forever").
    expect(text.split(AJ_531_M1_CTA).length - 1).toBe(signed.length);
    expect(text).not.toMatch(/free forever/i);
    const rest = text.split(AJ_531_M1_CTA).join('\u0000');
    const lower = Array.from(rest.matchAll(/free/gi)).filter((m) => m[0] === 'free');
    expect(lower.length).toBeGreaterThanOrEqual(1);
    for (const m of lower) {
      expect(rest.slice(m.index! - 2, m.index! + 8)).toBe('5 free Ink');
    }
  });

  it('T-398: every capital "Free" on pricing is the plan name (card title, "Everything in Free", plan-name contexts)', () => {
    const text = norm(render(<PricingPage />));
    const caps = Array.from(text.matchAll(/free/gi)).filter((m) => m[0] !== 'free');
    expect(caps.length).toBeGreaterThanOrEqual(2); // the card title and "Everything in Free"
    for (const m of caps) {
      const around = text.slice(Math.max(0, m.index! - 14), m.index! + 8);
      expect(around).toMatch(PLAN_NAME_FREE);
    }
  });

  it('T-398: every capital "Free" on the home page is the plan name too', () => {
    const text = norm(render(<HomePage />));
    const caps = Array.from(text.matchAll(/free/gi)).filter((m) => m[0] !== 'free');
    for (const m of caps) {
      const around = text.slice(Math.max(0, m.index! - 14), m.index! + 8);
      expect(around).toMatch(PLAN_NAME_FREE);
    }
  });

  it('Solo shows the row "Everything in Free", not the old "…, plus" heading', () => {
    render(<PricingPage />);
    const rows = Array.from(planCard('solo').querySelectorAll('li')).map((l) =>
      l.textContent?.trim(),
    );
    expect(rows).toContain('Everything in Free');
    expect(planCard('solo').querySelector('li.head')).toBeNull();
    expect(norm(container.textContent ?? '')).not.toContain('Everything in Free, plus');
  });

  it('Pro appears only in the Pro card on the pricing page', () => {
    render(<PricingPage />);
    const pro = planCard('pro');
    expect(pro.textContent).toMatch(/\bPro\b/);
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelector('[data-plan="pro"]')?.remove();
    clone.querySelectorAll('style').forEach((e) => e.remove());
    expect(norm(clone.textContent ?? '')).not.toMatch(/\bPro\b/);
  });

  it('the old "(lifetime)" wording is gone and "(one time)" is on the Free card', () => {
    const text = norm(render(<PricingPage />));
    expect(text).not.toContain('(lifetime)');
    expect(text).toContain('(one time)');
  });
});
