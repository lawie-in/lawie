// T-517 AC1-AC3, AC5: the Night Library landing. Section order, one call to action, the signed
// copy only (nl-copy.ts), no Pro / "unlimited" / draft counts, the Hindi toggle, the FAQ
// accordion, the document spines, the theme toggle and the grievance line (AJ-517-M11, M13).
import { PLANS } from '@lawie/shared';

import { LandingPage } from '../LandingPage';

import { FAQ_EN, landingCopy, SIGNUP_HREF } from '@/components/marketing/nl-copy';
import { cleanupMounted, click, mount, q, qa } from '@/components/ui/__tests__/nl-test-utils';

const EN = landingCopy('en');
const HI = landingCopy('hi');
const ENV_KEY = 'NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME';
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

const OFFICER_LINE =
  'Grievance Officer: Asha Rao. Email: contact@lawie.in. We acknowledge every complaint within 24 hours and resolve it within 15 days.';
const FALLBACK_LINE = 'For complaints, write to contact@lawie.in.';

let savedEnv: string | undefined;
beforeEach(() => {
  savedEnv = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
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
});

const section = (id: string) => q(`section[aria-labelledby="${id}"]`) as HTMLElement;
const pageText = () => norm(document.body.textContent);

describe('landing: footer cookie settings', () => {
  it('the landing footer keeps the Cookie settings button (analytics loads here)', () => {
    mount(<LandingPage />);
    expect(norm(q('footer button')!.textContent)).toBe('Cookie settings');
  });
});

describe('landing: structure (AC1)', () => {
  it('has the sections in spec order, each with its signed heading', () => {
    mount(<LandingPage />);
    expect(qa('h1').map((h) => norm(h.textContent))).toEqual([EN.hero.headline]);
    expect(qa('h2').map((h) => norm(h.textContent))).toEqual([
      EN.steps.title,
      EN.documents.title,
      EN.prices.title,
      EN.trust.title,
      EN.faq.title,
      EN.final.heading,
    ]);
    const order = qa('header, main section, footer').map(
      (e) => e.tagName + (e.getAttribute('aria-labelledby') ?? ''),
    );
    expect(order).toEqual([
      'HEADER',
      'SECTIONhero-heading',
      'SECTIONsteps-heading',
      'SECTIONdocs-heading',
      'SECTIONprices-heading',
      'SECTIONtrust-heading',
      'SECTIONfaq-heading',
      'SECTIONfinal-heading',
      'FOOTER',
    ]);
  });

  it('hero, steps and the 5 free Ink lines are the signed text', () => {
    mount(<LandingPage />);
    const hero = norm(section('hero-heading').textContent);
    expect(hero).toContain('Describe the matter. Lawie writes the first draft.');
    expect(hero).toContain(EN.hero.sub);
    expect(hero).toContain('Start with 5 free Ink');
    expect(hero).toContain('No card needed.');
    expect(hero).toContain('Verify your email to receive your 5 Ink.');
    expect(qa('ol > li h3', section('steps-heading')).map((h) => h.textContent)).toEqual([
      'Describe',
      'Draft',
      'Review',
    ]);
  });

  it('every visible text node comes from nl-copy (no stray strings)', () => {
    mount(<LandingPage />);
    const pool = new Set<string>();
    const walk = (v: unknown) => {
      if (typeof v === 'string') pool.add(norm(v));
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(EN);
    walk(FAQ_EN);
    const joined = Array.from(pool).join('\n');
    const strays: string[] = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const text = norm(n.textContent);
      if (!text) continue;
      const el = n.parentElement!;
      if (el.closest('[aria-hidden="true"], script, style')) continue;
      // Footer: Privacy / Terms / Refunds / Cookie settings are in footerCopy and AnalyticsConsent.
      if (el.closest('footer') && /^(Cookie settings|Lawie)$/.test(text)) continue;
      if (!joined.includes(text)) strays.push(text);
    }
    expect(strays).toEqual([]);
  });
});

describe('landing: claims (AC2)', () => {
  it('one call to action: every primary button goes to /login?mode=signup; the top bar one is ghost', () => {
    mount(<LandingPage />);
    const primaries = qa('a').filter((a) => a.className.includes('bg-nl-brass'));
    expect(primaries.length).toBeGreaterThanOrEqual(1);
    for (const a of primaries) {
      expect(a.getAttribute('href')).toBe(SIGNUP_HREF);
      expect(a.textContent).toBe('Start with 5 free Ink');
    }
    // Never two primaries in the hero view.
    expect(qa('a', q('header')!).filter((a) => a.className.includes('bg-nl-brass'))).toHaveLength(
      0,
    );
    expect(SIGNUP_HREF).toBe('/login?mode=signup');
    const signIn = qa('header a').find((a) => a.textContent === 'Sign in');
    expect(signIn?.getAttribute('href')).toBe('/login?mode=signin');
  });

  it('shows Free and Solo only; no Pro anywhere', () => {
    mount(<LandingPage />);
    expect(qa('[data-plan]').map((e) => e.getAttribute('data-plan'))).toEqual(['free', 'solo']);
    expect(pageText()).not.toMatch(/\bPro\b/);
    expect(pageText()).not.toContain('₹1,999');
    expect(pageText()).not.toContain(`${PLANS.pro_monthly.inkPerCycle} Ink`);
    const seeAll = qa('a').find((a) => a.textContent === 'See all plans');
    expect(seeAll?.getAttribute('href')).toBe('/pricing');
  });

  it('prices come from PLANS and read "a month"', () => {
    mount(<LandingPage />);
    const solo = norm(q('[data-plan="solo"]')!.textContent);
    expect(solo).toContain(`₹${PLANS.solo_monthly.priceInr} a month`);
    expect(solo).toContain(`${PLANS.solo_monthly.inkPerCycle} Ink a month`);
    expect(norm(q('[data-plan="free"]')!.textContent)).toContain(
      '5 Ink on sign-up, once your email is verified (one time)',
    );
  });

  it('never says "unlimited", a draft count, "2 Ink" or yearly', () => {
    mount(<LandingPage />);
    const t = pageText();
    expect(t).not.toMatch(/unlimited/i);
    expect(t).not.toMatch(/\d+\s+(drafts?|documents?|petitions?|notices?)/i);
    expect(t).not.toContain('2 Ink');
    expect(t).not.toMatch(/yearly|annual|lifetime/i);
  });

  it('the M12 plan-Ink lines are shown (AJ-517-M12) and nothing about rollover beyond them', () => {
    mount(<LandingPage />);
    const t = pageText();
    expect(t).toContain('Prices include GST. Plan Ink does not carry over to the next month.');
    expect(t).toContain('Plan Ink left unused at the end of the month does not carry over.');
    expect(t).toContain('Top-up Ink does not expire while your account is open.');
    expect(t).not.toMatch(/rolls?[\s-]?over|carry-forward/i);
  });

  it('keeps "Every document type on Lawie" and "PDF / DOCX export" on the Free card', () => {
    mount(<LandingPage />);
    const free = norm(q('[data-plan="free"]')!.textContent);
    expect(free).toContain('Every document type on Lawie');
    expect(free).toContain('PDF / DOCX export');
  });
});

describe('landing: grievance line (AJ-517-M11, M13)', () => {
  it('without a configured name: the fallback in the trust section and the footer; no officer text', () => {
    mount(<LandingPage />);
    expect(norm(section('trust-heading').textContent)).toContain(FALLBACK_LINE);
    expect(norm(q('footer')!.textContent)).toContain(FALLBACK_LINE);
    expect(pageText()).not.toContain('Grievance Officer');
    expect(pageText()).not.toContain('privacy@lawie.in');
  });

  it('with NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME: the M11 line in the trust section and the footer', () => {
    process.env[ENV_KEY] = 'Asha Rao';
    mount(<LandingPage />);
    expect(norm(section('trust-heading').textContent)).toContain(OFFICER_LINE);
    expect(norm(q('footer')!.textContent)).toContain(OFFICER_LINE);
    expect(norm(section('trust-heading').textContent)).not.toContain(FALLBACK_LINE);
    const mail = qa('a[href="mailto:contact@lawie.in"]', section('trust-heading'));
    expect(mail).toHaveLength(1);
  });

  it('the trust section links the Privacy Policy', () => {
    mount(<LandingPage />);
    const a = qa('a', section('trust-heading')).find((x) => x.textContent === 'Privacy Policy');
    expect(a?.getAttribute('href')).toBe('/privacy');
  });
});

describe('landing: Hindi toggle (AC5, AJ-517-M10)', () => {
  const hiButton = () => qa('button').find((b) => b.getAttribute('lang') === 'hi')!;

  it('starts English with the toggle pressed on English', () => {
    mount(<LandingPage />);
    expect(q('.nl-root')!.getAttribute('lang')).toBe('en');
    expect(hiButton().getAttribute('aria-pressed')).toBe('false');
  });

  it('swaps the hero, steps and prices strings to the signed Hindi and sets lang="hi"', () => {
    mount(<LandingPage />);
    click(hiButton());
    expect(q('.nl-root')!.getAttribute('lang')).toBe('hi');
    expect(hiButton().getAttribute('aria-pressed')).toBe('true');
    expect(norm(q('h1')!.textContent)).toBe(HI.hero.headline);
    expect(pageText()).toContain(HI.hero.sub);
    expect(pageText()).toContain(HI.cta);
    expect(pageText()).not.toContain('Describe the matter.');
    expect(qa('ol > li h3', section('steps-heading')).map((h) => h.textContent)).toEqual(
      HI.steps.items.map((s) => s.title),
    );
    expect(norm(section('prices-heading').textContent)).toContain(HI.prices.cards.solo.ink);
    expect(norm(section('prices-heading').textContent)).toContain(HI.prices.cards.solo.price);
    expect(HI.prices.cards.solo.ink).toBe(`${PLANS.solo_monthly.inkPerCycle} Ink प्रति माह`);
    expect(norm(section('prices-heading').textContent)).toContain(HI.prices.note);
    expect(qa('[data-plan]')).toHaveLength(2);
    expect(pageText()).not.toMatch(/\bPro\b/);
  });

  it('keeps the FAQ in English (lang="en") until a Hindi FAQ is signed', () => {
    mount(<LandingPage />);
    click(hiButton());
    const faq = section('faq-heading');
    expect(norm(faq.textContent)).toContain(FAQ_EN[0].q);
    expect(faq.querySelector('[lang="en"]')).not.toBeNull();
    expect(faq.querySelector('h2')!.getAttribute('lang')).toBe('en');
  });

  it('Hindi headings use nl-h2 or larger (20px and up); English FAQ is exempt', () => {
    mount(<LandingPage />);
    click(hiButton());
    for (const h of qa('h1, h2')) {
      expect(h.className).toMatch(/nl-(display|h1|h2)\b/);
    }
    const small = qa('h3').filter((h) => !h.closest('#faq'));
    expect(small.length).toBeGreaterThan(4);
    for (const h of small) expect(h.className).toMatch(/nl-h2\b/);
    expect(qa('h3', section('prices-heading'))[0].className).toMatch(/nl-h2\b/);
  });

  it('switches back to English', () => {
    mount(<LandingPage />);
    click(hiButton());
    click(qa('button').find((b) => b.getAttribute('lang') === 'en')!);
    expect(norm(q('h1')!.textContent)).toBe(EN.hero.headline);
    expect(q('.nl-root')!.getAttribute('lang')).toBe('en');
  });

  it('theme toggle labels follow the language', () => {
    mount(<LandingPage />);
    click(hiButton());
    expect(qa('legend').map((l) => l.textContent)).toContain('थीम');
    expect(pageText()).toContain('रात');
  });
});

describe('landing: FAQ accordion', () => {
  const faqButtons = () => qa('button[aria-expanded]', section('faq-heading'));
  const panels = () => qa('[role="region"]', section('faq-heading')) as HTMLElement[];

  it('has the six questions with the first open', () => {
    mount(<LandingPage />);
    expect(faqButtons().map((b) => norm(b.textContent).replace(/\+$/, ''))).toEqual(
      FAQ_EN.map((f) => f.q),
    );
    expect(faqButtons().map((b) => b.getAttribute('aria-expanded'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
      'false',
    ]);
    expect(panels().map((p) => p.hidden)).toEqual([false, true, true, true, true, true]);
    expect(norm(panels()[0].textContent)).toBe(norm(FAQ_EN[0].a));
  });

  it('opening one closes the other; clicking the open one closes it', () => {
    mount(<LandingPage />);
    click(faqButtons()[2]);
    expect(faqButtons().map((b) => b.getAttribute('aria-expanded'))).toEqual([
      'false',
      'false',
      'true',
      'false',
      'false',
      'false',
    ]);
    expect(panels()[2].hidden).toBe(false);
    expect(panels()[0].hidden).toBe(true);
    click(faqButtons()[2]);
    expect(faqButtons().every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
  });

  it('each button controls its panel, which is labelled by it', () => {
    mount(<LandingPage />);
    faqButtons().forEach((b, i) => {
      expect(b.getAttribute('aria-controls')).toBe(panels()[i].id);
      expect(panels()[i].getAttribute('aria-labelledby')).toBe(b.id);
    });
  });
});

describe('landing: document spines', () => {
  it('renders five spines with the signed labels', () => {
    mount(<LandingPage />);
    const items = qa('li', q(`ul[aria-label="${EN.documents.title}"]`)!);
    expect(items).toHaveLength(5);
    expect(items.map((l) => norm(l.textContent))).toEqual(EN.documents.spines);
  });
});

describe('landing: theme toggle (AC3)', () => {
  it('has the Night / Daylight / System toggle in the top bar and the mobile row', () => {
    mount(<LandingPage />);
    const groups = qa('header fieldset');
    expect(groups.length).toBeGreaterThanOrEqual(2);
    for (const g of groups) {
      expect(qa('input[type="radio"]', g).map((r) => (r as HTMLInputElement).value)).toEqual([
        'night',
        'daylight',
        'system',
      ]);
      expect(norm(g.textContent)).toContain('Night');
      expect(norm(g.textContent)).toContain('Daylight');
      expect(norm(g.textContent)).toContain('System');
    }
    expect(q('[data-topbar-mobile-menu] fieldset')).not.toBeNull();
  });
});

describe('landing: footer', () => {
  it('has the disclaimer and the Privacy, Terms and Refunds links', () => {
    mount(<LandingPage />);
    const f = q('footer')!;
    expect(norm(f.textContent)).toContain(
      'Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.',
    );
    expect(qa('a', f).map((a) => a.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/privacy', '/terms', '/refunds']),
    );
  });
});
