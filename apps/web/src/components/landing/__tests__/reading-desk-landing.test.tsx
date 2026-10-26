// T-601: the old LandingPage / DemoFolio tests, re-pointed at the Reading Desk landing. Salvaged:
// section ids and order, one h1, one primary call to action, Free and Solo from PLANS, no
// "unlimited", the M12 lines, the grievance line, the Hindi toggle and Hindi sizes, the FAQ
// accordion, the theme toggle, the sticky bar, break-ui worst cases, plan card and link classes.
// (isSlowConnection, splitGraphemes, the flash guard and the reduced-motion finished state moved to
// components/marketing/landing/__tests__/HeroFolio*.test.tsx.)
import { PLANS } from '@lawie/shared';

import { ReadingDeskLanding } from '@/components/marketing/landing/ReadingDeskLanding';
import { NightPlanCard } from '@/components/marketing/NightPlanCard';
import {
  NightTopBar,
  NL_STICKY_BAR_CSS,
  NL_STICKY_BAR_HEIGHT,
} from '@/components/marketing/NightTopBar';
import {
  FAQ_EN,
  SECTION_IDS,
  SIGNUP_HREF,
  landingCopy,
  monthlyInk,
  monthlyPrice,
  planCards,
} from '@/components/marketing/nl-copy';
import { CONTROL_LINE, nlLinkButton } from '@/components/marketing/nl-link';
import { cleanupMounted, click, mount, q, qa } from '@/components/ui/__tests__/nl-test-utils';

const EN = landingCopy('en');
const HI = landingCopy('hi');
const ENV_KEY = 'NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME';
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const cls = (el: Element | null) => (el!.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
const NEVER = /undefined|NaN|\[object|\bnull\b/;
const hiButton = () => qa('button').find((b) => b.getAttribute('lang') === 'hi')!;
const enButton = () => qa('button').find((b) => b.getAttribute('lang') === 'en')!;
const section = (id: string) => q(`section[aria-labelledby="${id}"]`) as HTMLElement;
const pageText = () => norm(document.body.textContent);
const SAMPLES = ['legal_notice_breach_of_contract', 'maintenance_bnss_144'];

type Mutable = { priceInr: number; inkPerCycle: number };
const solo = PLANS.solo_monthly as unknown as Mutable;
let savedSolo: Mutable;
let savedEnv: string | undefined;

beforeEach(() => {
  savedEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
  savedSolo = { priceInr: solo.priceInr, inkPerCycle: solo.inkPerCycle };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
});
afterEach(() => {
  cleanupMounted();
  if (savedEnv === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = savedEnv;
  solo.priceInr = savedSolo.priceInr;
  solo.inkPerCycle = savedSolo.inkPerCycle;
});

describe('structure and anchors', () => {
  it('exactly one h1, the signed headline; sections in spec order', () => {
    mount(<ReadingDeskLanding />);
    expect(qa('h1').map((h) => norm(h.textContent))).toEqual([
      'Describe the matter. Read the draft.',
    ]);
    const order = qa('header, main > section, footer').map(
      (e) => e.tagName + (e.getAttribute('aria-labelledby') ?? ''),
    );
    expect(order[0]).toBe('HEADER');
    expect(order[1]).toBe('SECTIONhero-heading');
    expect(order[2]).toBe('SECTIONsteps-heading');
    // [3] is the coverage section (its heading id is generated); no samples or video by default.
    expect(order.slice(4)).toEqual([
      'SECTIONprices-heading',
      'SECTIONtrust-heading',
      'SECTIONfaq-heading',
      'SECTIONfinal-heading',
      'FOOTER',
    ]);
  });

  it('the page has exactly one <header> (the folio heading is a div)', () => {
    mount(<ReadingDeskLanding />);
    expect(qa('header')).toHaveLength(1);
  });

  it('the anchor ids the top bar links to exist once: how-it-works, documents, prices, faq', () => {
    mount(<ReadingDeskLanding />);
    expect(SECTION_IDS).toMatchObject({
      how: 'how-it-works',
      documents: 'documents',
      prices: 'prices',
      faq: 'faq',
    });
    for (const id of ['how-it-works', 'documents', 'prices', 'faq']) {
      expect({ id, n: document.querySelectorAll(`#${id}`).length }).toEqual({ id, n: 1 });
    }
    const hrefs = qa('header nav a').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['#how-it-works', '#prices', '#faq']));
  });

  it('heading levels never skip downwards (the hidden trust h2 is followed by h3 columns)', () => {
    mount(<ReadingDeskLanding />);
    const levels = qa('h1,h2,h3,h4').map((h) => Number(h.tagName[1]));
    expect(levels[0]).toBe(1);
    levels.slice(1).forEach((l, i) => expect(l - levels[i]).toBeLessThanOrEqual(1));
    const trust = section('trust-heading');
    expect(qa('h2', trust)[0].className).toContain('sr-only');
    expect(qa('h3', trust)).toHaveLength(3);
  });

  it('no section carries a scroll-mt class; the bar supplies scroll-padding-top', () => {
    mount(<ReadingDeskLanding />);
    for (const s of qa('main > section')) expect(s.className).not.toMatch(/scroll-mt/);
    expect(q('[data-nl-sticky-bar] style')!.textContent).toBe(NL_STICKY_BAR_CSS);
    expect(NL_STICKY_BAR_HEIGHT).toEqual({ fallback: 65 });
  });

  it('the footer keeps the Cookie settings button and the disclaimer', () => {
    mount(<ReadingDeskLanding />);
    expect(norm(q('footer button')!.textContent)).toBe('Cookie settings');
    expect(norm(q('footer')!.textContent)).toContain(
      'Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.',
    );
  });

  it('the steps are plain columns with aria-hidden roman numerals i, ii, iii', () => {
    mount(<ReadingDeskLanding />);
    expect(qa('#how-it-works ol > li h3').map((h) => h.textContent)).toEqual([
      'Describe',
      'Draft',
      'Review',
    ]);
    qa('#how-it-works ol > li').forEach((li, i) => {
      expect(cls(li)).toContain('min-w-0');
      expect(li.querySelector('span[aria-hidden="true"]')!.textContent).toBe(['i', 'ii', 'iii'][i]);
    });
    expect(cls(q('#how-it-works ol'))).toEqual(
      expect.arrayContaining(['grid-cols-1', 'min-[720px]:grid-cols-3']),
    );
  });
});

describe('claims', () => {
  it('the top bar CTA is ghost; every brass-filled link is the signed Start with 5 free Ink', () => {
    mount(<ReadingDeskLanding />);
    const isPrimary = (a: Element) => a.classList.contains('bg-nl-brass');
    const primaries = qa('a').filter(isPrimary);
    expect(primaries.length).toBeGreaterThanOrEqual(1);
    for (const a of primaries) {
      expect(a.getAttribute('href')).toBe(SIGNUP_HREF);
      expect(a.textContent).toBe('Start with 5 free Ink');
    }
    expect(qa('a', q('header')!).filter(isPrimary)).toHaveLength(0);
    expect(qa('a', section('hero-heading')).filter(isPrimary)).toHaveLength(1);
    expect(qa('header a').find((a) => a.textContent === 'Start free')).toBeDefined();
  });

  it('Free and Solo only; no Pro; See all plans goes to /pricing', () => {
    mount(<ReadingDeskLanding />);
    expect(qa('[data-plan]').map((e) => e.getAttribute('data-plan'))).toEqual(['free', 'solo']);
    expect(pageText()).not.toMatch(/\bPro\b/);
    expect(pageText()).not.toContain('₹1,999');
    expect(
      qa('a')
        .find((a) => a.textContent === 'See all plans')
        ?.getAttribute('href'),
    ).toBe('/pricing');
  });

  it('prices come from PLANS and read "a month"; the Free card has the signed line', () => {
    mount(<ReadingDeskLanding />);
    const s = norm(q('[data-plan="solo"]')!.textContent);
    expect(s).toContain(`₹${PLANS.solo_monthly.priceInr} a month`);
    expect(s).toContain(`${PLANS.solo_monthly.inkPerCycle} Ink a month`);
    const free = norm(q('[data-plan="free"]')!.textContent);
    expect(free).toContain('5 Ink on sign-up, once your email is verified (one time)');
    expect(free).toContain('Every document type on Lawie');
  });

  it('never "unlimited", "2 Ink", yearly or lifetime', () => {
    mount(<ReadingDeskLanding />);
    expect(pageText()).not.toMatch(/unlimited|yearly|annual|lifetime/i);
    expect(pageText()).not.toContain('2 Ink');
  });

  it('the M12 plan-Ink lines are shown and nothing else about rollover', () => {
    mount(<ReadingDeskLanding />);
    const t = pageText();
    expect(t).toContain('Prices include GST. Plan Ink does not carry over to the next month.');
    expect(t).toContain('Plan Ink left unused at the end of the month does not carry over.');
    expect(t).toContain('Top-up Ink does not expire while your account is open.');
    expect(t).not.toMatch(/rolls?[\s-]?over|carry-forward/i);
  });

  it('PLANS at zero and at lakh scale render as one text run with no NaN', () => {
    solo.priceInr = 0;
    solo.inkPerCycle = 0;
    mount(<ReadingDeskLanding />);
    expect(pageText()).toContain('₹0 a month');
    expect(pageText()).toContain('0 Ink a month');
    expect(pageText()).not.toMatch(NEVER);
    cleanupMounted();
    solo.priceInr = 123456789;
    solo.inkPerCycle = 99999999;
    mount(<ReadingDeskLanding />);
    const card = q('[data-plan="solo"]')!;
    const price = q('[data-plan-price]', card)!;
    expect(price.textContent).toContain('₹12,34,56,789');
    expect(price.className).not.toMatch(/whitespace-nowrap|truncate|overflow-|\bw-\[|line-clamp/);
    expect(cls(card)).toContain('min-w-0');
    expect(cls(price)).toEqual(
      expect.arrayContaining(['font-nl-display', 'text-[34px]', 'leading-[40px]', 'tabular-nums']),
    );
  });

  it('price formatting helpers', () => {
    expect(monthlyPrice(0)).toBe('₹0 a month');
    expect(monthlyPrice(100000)).toBe('₹1,00,000 a month');
    expect(monthlyInk(1)).toBe('1 Ink a month');
    expect(planCards('en').solo.price).toBe(
      `₹${PLANS.solo_monthly.priceInr.toLocaleString('en-IN')} a month`,
    );
  });
});

describe('grievance line (AJ-517-M11, M13)', () => {
  it('without a name: the fallback in trust and footer, no officer text', () => {
    mount(<ReadingDeskLanding />);
    const fallback = 'For complaints, write to contact@lawie.in.';
    expect(norm(section('trust-heading').textContent)).toContain(fallback);
    expect(norm(q('footer')!.textContent)).toContain(fallback);
    expect(pageText()).not.toContain('Grievance Officer');
  });

  it('with a (long) name: the M11 line in trust and footer', () => {
    process.env[ENV_KEY] = 'Subramaniam Venkataraghavan Krishnamurthy-Ramachandran Iyer';
    mount(<ReadingDeskLanding />);
    expect(norm(section('trust-heading').textContent)).toContain('Krishnamurthy-Ramachandran');
    expect(norm(q('footer')!.textContent)).toContain('Grievance Officer: Subramaniam');
    expect(qa('a[href="mailto:contact@lawie.in"]', section('trust-heading'))).toHaveLength(1);
    expect(q('[data-grievance-line]')!.className).not.toContain('whitespace-nowrap');
  });

  it('the trust section links the Privacy Policy', () => {
    mount(<ReadingDeskLanding />);
    const a = qa('a', section('trust-heading')).find((x) => x.textContent === 'Privacy Policy');
    expect(a?.getAttribute('href')).toBe('/privacy');
  });
});

describe('Hindi toggle', () => {
  it('starts English, pressed state follows', () => {
    mount(<ReadingDeskLanding />);
    expect(q('.nl-root')!.getAttribute('lang')).toBe('en');
    expect(hiButton().getAttribute('aria-pressed')).toBe('false');
  });

  it('swaps the h1, steps and prices to the signed Hindi and sets lang="hi"; no Pro', () => {
    mount(<ReadingDeskLanding />);
    click(hiButton());
    expect(q('.nl-root')!.getAttribute('lang')).toBe('hi');
    expect(norm(q('h1')!.textContent)).toBe('मामला बताइए। ड्राफ़्ट पढ़िए।');
    expect(pageText()).toContain(HI.cta);
    expect(pageText()).not.toContain('Describe the matter.');
    expect(qa('#how-it-works ol > li h3').map((h) => h.textContent)).toEqual(
      HI.steps.items.map((s) => s.title),
    );
    expect(norm(section('prices-heading').textContent)).toContain(HI.prices.cards.solo.ink);
    expect(HI.prices.cards.solo.ink).toBe(`${PLANS.solo_monthly.inkPerCycle} Ink प्रति माह`);
    expect(qa('[data-plan]')).toHaveLength(2);
    expect(pageText()).not.toMatch(/\bPro\b/);
  });

  it('the FAQ stays English with lang="en" until a Hindi FAQ is signed', () => {
    mount(<ReadingDeskLanding />);
    click(hiButton());
    const faq = section('faq-heading');
    expect(norm(faq.textContent)).toContain(FAQ_EN[0].q);
    expect(faq.querySelector('h2')!.getAttribute('lang')).toBe('en');
  });

  it('Hindi headings are 20px or more (nl-h2 and up); the English FAQ is exempt', () => {
    mount(<ReadingDeskLanding />);
    click(hiButton());
    for (const h of qa('h1, h2').filter((x) => !x.classList.contains('sr-only')))
      expect(h.className).toMatch(/nl-(display|h1|h2)\b/);
    const small = qa('h3').filter((h) => !h.closest('#faq'));
    expect(small.length).toBeGreaterThan(4);
    for (const h of small) expect(h.className).toMatch(/nl-h2\b/);
  });

  it('with samples and video present: no undefined / NaN, no empty heading, link or button', () => {
    mount(
      <ReadingDeskLanding
        initialLang="hi"
        videoAvailable
        hindiCaptionsAvailable
        availableSampleIds={SAMPLES}
      />,
    );
    expect(pageText()).not.toMatch(NEVER);
    for (const h of qa('h1, h2, h3')) {
      expect(norm(h.textContent)).not.toBe('');
      expect(h.className).not.toMatch(/\bh-\d|line-clamp|overflow-hidden/);
    }
    for (const el of qa('a, button')) {
      expect(norm(el.textContent) || el.getAttribute('aria-label') || '').not.toBe('');
    }
  });

  it('rapid EN/HI toggling 20 times ends consistent', () => {
    mount(<ReadingDeskLanding />);
    for (let i = 0; i < 20; i++) click(i % 2 === 0 ? hiButton() : enButton());
    expect(qa('h1')).toHaveLength(1);
    expect(q('.nl-root')!.getAttribute('lang')).toBe('en');
    expect(enButton().getAttribute('aria-pressed')).toBe('true');
    click(hiButton());
    expect(q('.nl-root')!.getAttribute('lang')).toBe('hi');
  });

  it('theme toggle labels follow the language', () => {
    mount(<ReadingDeskLanding />);
    click(hiButton());
    expect(qa('legend').map((l) => l.textContent)).toContain('थीम');
  });

  it('every landing string is defined and non-empty in both languages', () => {
    const walk = (v: unknown, path: string): void => {
      if (typeof v === 'string') expect({ path, v: v.trim() }).not.toEqual({ path, v: '' });
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === 'object')
        Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`));
      else expect({ path, v }).toBeNull();
    };
    walk(HI, 'hi');
    walk(EN, 'en');
  });
});

describe('FAQ accordion', () => {
  const buttons = () => qa('button[aria-expanded]', section('faq-heading'));

  it('has the questions with the first open; opening another closes it', () => {
    mount(<ReadingDeskLanding />);
    expect(buttons().map((b) => norm(b.textContent).replace(/\+$/, ''))).toEqual(
      FAQ_EN.map((f) => f.q),
    );
    expect(buttons()[0].getAttribute('aria-expanded')).toBe('true');
    click(buttons()[2]);
    expect(
      buttons()
        .map((b) => b.getAttribute('aria-expanded'))
        .filter((e) => e === 'true'),
    ).toHaveLength(1);
    expect(buttons()[2].getAttribute('aria-expanded')).toBe('true');
  });

  it('each button controls its panel; rapid clicks keep them in step; the marker is an svg', () => {
    mount(<ReadingDeskLanding />);
    for (let i = 0; i < 9; i++) click(buttons()[0]);
    for (const b of buttons()) {
      const panel = document.getElementById(b.getAttribute('aria-controls') ?? '');
      expect(panel).not.toBeNull();
      expect(panel!.hasAttribute('hidden')).toBe(b.getAttribute('aria-expanded') === 'false');
      expect(b.querySelector('svg')).not.toBeNull();
    }
  });
});

describe('theme toggle, top bar and narrow screens', () => {
  it('Night / Daylight / System in the bar and, once opened, in the phone menu', () => {
    mount(<ReadingDeskLanding />);
    expect(qa('header fieldset')).toHaveLength(1);
    click(q('[data-topbar-menu-trigger]'));
    const groups = [...qa('header fieldset'), ...qa('[data-topbar-menu] fieldset')];
    expect(groups).toHaveLength(2);
    for (const g of groups) {
      expect(qa('input[type="radio"]', g).map((r) => (r as HTMLInputElement).value)).toEqual([
        'night',
        'daylight',
        'system',
      ]);
    }
  });

  it('the bar is sticky at every width, clear of the safe-area inset', () => {
    mount(<NightTopBar lang="en" onLangChange={() => undefined} />);
    expect(cls(q('header'))).toEqual(
      expect.arrayContaining(['sticky', 'top-0', 'z-30', 'pt-[env(safe-area-inset-top,0px)]']),
    );
  });

  it('320px: the page clips overflow, the plan grid is one column, links grow instead of a fixed h-11', () => {
    mount(<ReadingDeskLanding />);
    expect(q('.nl-root')!.className).toContain('overflow-x-clip');
    expect(q('.nl-root')!.className).toContain('min-h-[100svh]');
    expect(q('[data-plan="free"]')!.parentElement!.className).toContain('grid-cols-1');
    for (const s of qa('main > section')) expect(s.className).toContain('px-nl-4');
    const cta = qa('a').find((a) => a.getAttribute('href')?.startsWith('/login?mode=signup'))!;
    expect(cta.className).toContain('min-h-');
    expect(cta.className).not.toMatch(/(^|\s)h-11(\s|$)/);
  });

  it('repeated clicks on the sign-up CTA do not change the page', () => {
    mount(<ReadingDeskLanding />);
    const before = document.body.innerHTML;
    const cta = qa('a').find((a) => a.getAttribute('href')?.startsWith('/login?mode=signup'))!;
    cta.addEventListener('click', (e) => e.preventDefault());
    for (let i = 0; i < 10; i++) click(cta);
    expect(document.body.innerHTML).toBe(before);
  });
});

describe('One Shadow: only the hero folio', () => {
  it('shadow-nl-card appears on no element except the hero figure (at >= 900px)', () => {
    mount(<ReadingDeskLanding availableSampleIds={SAMPLES} />);
    const hits = qa('[class*="shadow-nl-card"]');
    expect(hits).toHaveLength(1);
    expect(hits[0].tagName).toBe('FIGURE');
    for (const a of qa('article')) expect(cls(a).some((x) => x.startsWith('shadow-'))).toBe(false);
  });
});

describe('NightPlanCard and link classes (kept from round 3)', () => {
  const props = {
    name: 'Solo',
    price: '₹499 a month',
    ink: '20 Ink a month',
    includes: ['One'],
    button: 'Go',
    href: '/login?mode=signup',
  };

  it('no shadow; h3 by default; h2 on request; largeHeading applies', () => {
    mount(<NightPlanCard {...props} />);
    expect(cls(q('article')).some((x) => x.startsWith('shadow-'))).toBe(false);
    expect(qa('h3')).toHaveLength(1);
    cleanupMounted();
    mount(<NightPlanCard {...props} headingLevel="h2" largeHeading />);
    expect(cls(q('h2'))).toContain('nl-h2');
  });

  it('primary has the halo; ghost has no halo or lift and keeps the control line', () => {
    const HALO = '[@media(hover:hover)_and_(pointer:fine)]:hover:shadow-nl-halo';
    expect(nlLinkButton('primary').split(/\s+/)).toContain(HALO);
    const g = nlLinkButton('ghost', 'mt-nl-6 w-full');
    expect(g).not.toContain('shadow-nl-halo');
    expect(g).not.toContain('translate');
    expect(g).toContain(CONTROL_LINE);
  });
});
