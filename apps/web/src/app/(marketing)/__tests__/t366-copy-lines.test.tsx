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

import { LandingPage } from '@/components/landing/LandingPage';
import { landingCopy, TOP_BAR_COPY } from '@/components/marketing/nl-copy';

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

  // The one widening of this rule (T-531): Ajay signed the phone top bar's short call to action
  // (AJ-531-M1, ruling 83587fe5, handoff/legal/T-511-copy-rulings-ajay.md), on three conditions,
  // all enforced by `freeViolations` below and proven against synthetic bad pages:
  //   (a) exactly one link, matching exactly "Start free" (and, where the Hindi page is rendered,
  //       exactly "मुफ़्त शुरू कीजिए");
  //   (b) every other "free" phrase is still rejected ("free forever", "free trial", "always free");
  //   (c) header only: the exception applies to the link inside <header>, nowhere else.
  // The only lower-case "free" a page may carry besides "5 free Ink" is that one header link.
  const AJ_EN = 'Start free';
  const AJ_HI = 'मुफ़्त शुरू कीजिए';
  const BANNED = [/free forever/i, /free trial/i, /always free/i];
  // The signed Hindi "5 free Ink" (landingCopy('hi').cta begins with it): the only context where
  // a Hindi "मुफ़्त" may sit besides the one header link. Both nukta forms are scanned, so the
  // look-alike "मुफ्त" cannot slip through either.
  const HI_FIVE_INK = '5 मुफ़्त Ink';
  const HI_FREE_FORMS = ['मुफ़्त', 'मुफ्त'];

  /** Reasons a rendered page breaks Ajay's "free" rules; empty when it is clean. */
  function freeViolations(root: HTMLElement, label: string): string[] {
    const out: string[] = [];
    const links = Array.from(root.querySelectorAll('a')).filter((a) => a.textContent === label);
    if (links.length !== 1) out.push(`expected exactly one "${label}" link, found ${links.length}`);
    const allowed = links.filter((a) => a.closest('header'));
    if (allowed.length !== 1) out.push(`the "${label}" link must be inside <header>`);
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('style,script').forEach((e) => e.remove());
    if (allowed.length === 1) {
      // Remove the one allowed link from the clone: find it by its position among all anchors.
      const idx = Array.from(root.querySelectorAll('a')).indexOf(allowed[0]);
      clone.querySelectorAll('a')[idx].remove();
    }
    const rest = norm(clone.textContent ?? '');
    for (const re of BANNED) {
      if (re.test(norm(root.textContent ?? ''))) out.push(`banned phrase ${re}`);
    }
    for (const m of rest.matchAll(/free/g)) {
      if (rest.slice(m.index! - 2, m.index! + 8) !== '5 free Ink') {
        out.push(`stray "free": ...${rest.slice(Math.max(0, m.index! - 12), m.index! + 12)}...`);
      }
    }
    if (label === AJ_HI) {
      // Hindi condition (b): every remaining "मुफ़्त" is inside the signed "5 मुफ़्त Ink".
      for (const form of HI_FREE_FORMS) {
        let at = rest.indexOf(form);
        while (at !== -1) {
          const start = at - 2;
          if (rest.slice(start, start + HI_FIVE_INK.length) !== HI_FIVE_INK) {
            out.push(`stray "${form}": ...${rest.slice(Math.max(0, at - 12), at + 14)}...`);
          }
          at = rest.indexOf(form, at + 1);
        }
      }
    }
    return out;
  }
  const fixture = (html: string) => {
    const el = document.createElement('div');
    el.innerHTML = html;
    return el;
  };
  const GOOD = '<header><a href="/s">Start free</a></header><main><p>5 free Ink</p></main>';

  it('the checker accepts exactly the signed shape and nothing looser (explicit bad cases)', () => {
    expect(freeViolations(fixture(GOOD), AJ_EN)).toEqual([]);
    const bad: [string, string][] = [
      // (b) every other free phrase
      ['free forever', GOOD.replace('5 free Ink', 'Free forever. 5 free Ink')],
      ['free forever lower', GOOD.replace('5 free Ink', 'it is free forever, 5 free Ink')],
      ['free trial', GOOD.replace('5 free Ink', 'Start a free trial. 5 free Ink')],
      ['always free', GOOD.replace('5 free Ink', 'Always free. 5 free Ink')],
      ['bare free', GOOD.replace('5 free Ink', '5 free Ink and free drafts')],
      ['free forever in the link', GOOD.replace('>Start free<', '>Start free forever<')],
      ['free trial in the link', GOOD.replace('>Start free<', '>Start free trial<')],
      ['always free in the link', GOOD.replace('>Start free<', '>Always free<')],
      // (a) exactly one, exactly this text
      ['two header links', GOOD.replace('</header>', '<a href="/t">Start free</a></header>')],
      ['no link', '<header></header><main><p>5 free Ink</p></main>'],
      ['trailing text', GOOD.replace('>Start free<', '>Start free now<')],
      ['padded text', GOOD.replace('>Start free<', '> Start free <')],
      ['capital F', GOOD.replace('>Start free<', '>Start Free<')],
      // (c) header only
      [
        'link in main',
        '<header></header><main><a href="/s">Start free</a><p>5 free Ink</p></main>',
      ],
      ['link in footer', GOOD + '<footer><a href="/s">Start free</a></footer>'],
      ['plain text in main', GOOD.replace('5 free Ink', 'Start free. 5 free Ink')],
      ['plain text in footer', GOOD + '<footer>Start free</footer>'],
      ['button in header, not a link', GOOD + '<header><button>Start free</button></header>'],
    ];
    for (const [name, html] of bad) {
      expect({ name, v: freeViolations(fixture(html), AJ_EN).length > 0 }).toEqual({
        name,
        v: true,
      });
    }
  });

  it('Hindi: the checker needs exactly "मुफ़्त शुरू कीजिए", in the header, once', () => {
    const good = '<header><a href="/s">मुफ़्त शुरू कीजिए</a></header><main></main>';
    expect(freeViolations(fixture(good), AJ_HI)).toEqual([]);
    // The signed "5 मुफ़्त Ink" is allowed, and only that.
    expect(
      freeViolations(fixture(good.replace('<main></main>', '<main>5 मुफ़्त Ink</main>')), AJ_HI),
    ).toEqual([]);
    for (const html of [
      good.replace('कीजिए<', 'कीजिए अभी<'),
      good.replace('मुफ़्त', 'मुफ्त'), // a different nukta form is not the signed string
      good.replace('</header>', '<a href="/t">मुफ़्त शुरू कीजिए</a></header>'),
      '<header></header><main><a href="/s">मुफ़्त शुरू कीजिए</a></main>',
      good.replace('<main>', '<main>free forever'),
      // (b) in Hindi: every other "मुफ़्त" phrase is rejected
      good.replace('<main></main>', '<main>हमेशा मुफ़्त</main>'), // always free
      good.replace('<main></main>', '<main>मुफ़्त ट्रायल</main>'), // free trial
      good.replace('<main></main>', '<main>मुफ़्त</main>'), // a loose "मुफ़्त"
      good.replace('<main></main>', '<main>हमेशा मुफ्त</main>'), // look-alike nukta form
      good.replace('</header>', '<a href="/t">मुफ़्त</a></header>'), // a second header link
      good.replace('<main></main>', '<main>5 मुफ़्त Ink, मुफ़्त</main>'), // signed phrase plus a stray
    ]) {
      expect(freeViolations(fixture(html), AJ_HI).length).toBeGreaterThan(0);
    }
  });

  it("the signed strings are exactly Ajay's (code points)", () => {
    expect(TOP_BAR_COPY.en.cta).toBe(AJ_EN);
    expect(TOP_BAR_COPY.hi.cta).toBe(AJ_HI);
    expect(Array.from(AJ_HI).map((c) => c.codePointAt(0)!.toString(16))).toContain('93c');
  });

  it('pricing: the lower-case "free" is only "5 free Ink" and the one header "Start free" link', () => {
    const text = norm(render(<PricingPage />));
    expect(freeViolations(container, AJ_EN)).toEqual([]);
    const link = Array.from(container.querySelectorAll('a')).find((a) => a.textContent === AJ_EN)!;
    expect(link.closest('header')).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/login?mode=signup');
    expect(text.split(AJ_EN).length - 1).toBe(1);
    expect(text).not.toMatch(/free forever/i);
    expect(Array.from(text.matchAll(/free/g)).length).toBeGreaterThanOrEqual(2);
  });

  it('home (English): same rule, "Start free" once in the header only', () => {
    render(<HomePage />);
    expect(freeViolations(container, AJ_EN)).toEqual([]);
  });

  it('home (Hindi): exactly one "मुफ़्त शुरू कीजिए" link, in the header, and no banned phrase', () => {
    render(<LandingPage initialLang="hi" />);
    const links = Array.from(container.querySelectorAll('a')).filter(
      (a) => a.textContent === AJ_HI,
    );
    expect(links).toHaveLength(1);
    expect(links[0].closest('header')).not.toBeNull();
    expect(norm(container.textContent ?? '').split(AJ_HI).length - 1).toBe(1);
    // The English "Start free" must not appear on the Hindi page either.
    expect(container.textContent).not.toContain(AJ_EN);
    for (const re of BANNED) expect(container.textContent).not.toMatch(re);
    // Condition (b) in Hindi: with the one header link stripped, every "मुफ़्त" is in "5 मुफ़्त Ink".
    expect(landingCopy('hi').cta.startsWith(HI_FIVE_INK)).toBe(true);
    expect(freeViolations(container, AJ_HI)).toEqual([]);
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('style,script').forEach((e) => e.remove());
    const idx = Array.from(container.querySelectorAll('a')).indexOf(links[0]);
    clone.querySelectorAll('a')[idx].remove();
    const rest = norm(clone.textContent ?? '');
    expect(rest.split(HI_FIVE_INK).length - 1).toBeGreaterThanOrEqual(1);
    expect(rest.split(HI_FIVE_INK).join('').includes('मुफ़्त')).toBe(false);
    expect(rest.split(HI_FIVE_INK).join('').includes('मुफ्त')).toBe(false);
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
