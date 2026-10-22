// T-564: Ajay's pre-Anushka legal review (22 Oct 2026), section A items 1-11, 15-20, 22 and the
// T-564 answers A1-A9. Every signed string is parsed from the review file, so the tests compare
// the rendered pages with Ajay's text itself and not with a second copy typed into this file.
// Held and NOT tested here: item 21 (nl-copy, T-522) and the FAQ document list of item 16.
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import AboutPage from '../about/page';
import ContactPage, { metadata as contactMetadata } from '../contact/page';
import FaqPage, { metadata as faqMetadata } from '../faq/page';
import { metadata as pricingMetadata } from '../pricing/layout';
import TermsPage from '../terms/page';
import ToolsPage, { metadata as toolsMetadata } from '../tools/page';

import FloatCta from '@/components/marketing/FloatCta';
import { TERMS_VERSION } from '@/components/marketing/nl-copy';
import SiteNav from '@/components/marketing/SiteNav';
import { resetSupplierCache } from '@/components/marketing/SupplierDetails';

jest.mock('@/components/marketing/SiteFooter', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
// The pages import SiteNav and FloatCta; the page tests stub them, and the real ones are
// rendered in their own tests through jest.requireActual.
jest.mock('@/components/marketing/SiteNav', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/marketing/FloatCta', () => ({
  __esModule: true,
  default: () => null,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WEB_SRC = resolve(__dirname, '../../..');
const REPO_ROOT = resolve(__dirname, '../../../../../..');
const REVIEW = readFileSync(
  join(REPO_ROOT, 'handoff/legal/pre-anushka-legal-review-22-oct.md'),
  'utf8',
);

/** Backtick segments of the last cell of the table row that starts with `| <id> |`. */
function signedSegments(id: string): string[] {
  const row = REVIEW.split('\n').find((l) => l.startsWith(`| ${id} |`));
  if (!row) throw new Error(`Row ${id} not found in the review file`);
  const cells = row.replace(/\|\s*$/, '').split(' | ');
  const last = cells[cells.length - 1];
  return Array.from(last.matchAll(/`([^`]+)`/g), (m) => m[1]);
}

/** The four numbered Refunds paragraphs (item 11). */
function refundParagraphs(): string[] {
  const after = REVIEW.split('**Refunds text (item 11), signed.**')[1];
  return after
    .split('\n')
    .filter((l) => /^\d\. `/.test(l))
    .map((l) => /`([^`]+)`/.exec(l)![1]);
}

const norm = (s: string) => s.replace(/\s+/g, ' ');

let container: HTMLDivElement;
let root: Root;
const realFetch = global.fetch;

beforeEach(() => {
  resetSupplierCache();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ tool_timeline: true, tool_bail_checker: true }),
  }) as unknown as typeof fetch;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  global.fetch = realFetch;
});

async function renderEl(el: React.ReactElement): Promise<string> {
  await act(async () => {
    root.render(el);
  });
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
  return norm(container.textContent ?? '');
}
const renderAbout = () => renderEl(<AboutPage />);
const renderFaq = () => renderEl(<FaqPage />);
const renderTerms = () => renderEl(<TermsPage />);
const renderContact = () => renderEl(<ContactPage />);
async function renderTools() {
  const page = await ToolsPage();
  return renderEl(page);
}

describe('review file parses to the strings the tests rely on', () => {
  it('finds every signed row', () => {
    expect(signedSegments('1')).toHaveLength(1);
    expect(signedSegments('4')).toHaveLength(2);
    expect(signedSegments('7')).toHaveLength(2);
    expect(refundParagraphs()).toHaveLength(4);
  });
});

describe('item 1: tools meta', () => {
  it('is the signed description, with no old text', () => {
    expect(toolsMetadata.description).toBe(signedSegments('1')[0]);
    expect(toolsMetadata.description).toBe('Free legal tools for Indian advocates.');
    expect(String(toolsMetadata.description)).not.toContain('Built around the new');
  });
});

describe('item 22 (and A8): tools page', () => {
  it('has the signed CTA line and the custody-limits date', async () => {
    const text = await renderTools();
    expect(text).toContain(signedSegments('22')[0]);
    expect(text).toContain(`default bail eligibility dates under BNSS ${signedSegments('22')[1]}.`);
  });

  it('drops the old "full drafts" line', async () => {
    const text = await renderTools();
    expect(text).not.toContain('Generate full drafts');
    expect(text).not.toContain('not just section lookups');
  });
});

describe('items 2, 3, 4, 5, 6, 15, 16 (about), A9: about page', () => {
  it('item 2: bullet', async () => {
    const text = await renderAbout();
    expect(text).toContain(signedSegments('2')[0]);
    expect(text).not.toContain('Maps IPC');
  });

  it('item 3: bullet', async () => {
    const text = await renderAbout();
    expect(text).toContain(signedSegments('3')[0]);
    expect(text).not.toContain('Formats the cause title');
    expect(text).not.toContain('for your selected court');
  });

  it('item 4: heading "Section numbers" and paragraph; court-formatting paragraph gone', async () => {
    const text = await renderAbout();
    const [heading, para] = signedSegments('4');
    expect(heading).toBe('Section numbers');
    const h2s = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent);
    expect(h2s).toContain(heading);
    expect(text).toContain(para);
    expect(text).not.toContain('Built on the current law');
    expect(text).not.toMatch(/court rules/i);
  });

  it('item 4: the h1 and the other headings are unchanged', async () => {
    await renderAbout();
    expect(container.querySelector('h1')?.textContent).toBe('Why we built Lawie.');
    expect(Array.from(container.querySelectorAll('h2')).map((h) => h.textContent)).toEqual([
      'The problem we saw',
      'What Lawie does today',
      'Section numbers',
      "Where we're headed",
      'Start drafting.',
    ]);
  });

  it('item 5: where we are headed', async () => {
    const text = await renderAbout();
    expect(text).toContain(signedSegments('5')[0]);
    expect(text).not.toContain('in minutes');
    expect(text).not.toContain('for the specific court');
  });

  it('item 6: problem paragraph one, the overnight and registry claims deleted', async () => {
    const text = await renderAbout();
    const signed = signedSegments('6')[0];
    expect(signed).toContain("India's new criminal codes");
    expect(text).toContain(signed);
    expect(text).not.toContain('overnight');
    expect(text).not.toContain('wrong sections');
    expect(text).not.toContain('Section 437');
    expect(text).not.toContain('registry');
  });

  it('A9: problem paragraph three is kept as it is', async () => {
    const text = await renderAbout();
    expect(text).toContain(
      'We kept seeing the same pattern: capable advocates losing hours to formatting and section-mapping, on documents that follow a predictable structure. That is the gap Lawie was built to close.',
    );
  });

  it('item 16 (about): bullet', async () => {
    const text = await renderAbout();
    expect(signedSegments('16')[0]).toBe('Writes a first draft from what you describe.');
    expect(text).toContain(signedSegments('16')[0]);
    expect(text).toContain('Writes a first draft from what you describe.');
    expect(text).not.toContain('structured form');
  });

  it('item 15: the CTA says "Start free" and nothing says the old labels', async () => {
    await renderAbout();
    const cta = container.querySelector('a.btn-primary');
    expect(cta?.textContent?.trim()).toBe(signedSegments('15')[0]);
    expect(container.textContent).not.toContain('Start Drafting Free');
    expect(container.textContent).not.toContain('Try Lawie free');
  });
});

describe('items 7, 8, 12, 17, 18, A4 (FAQ refunds): FAQ page', () => {
  it('item 7: question and answer', async () => {
    const text = await renderFaq();
    const [q, a] = signedSegments('7');
    expect(text).toContain(q);
    expect(text).toContain(a);
    expect(text).not.toContain('mappings reliable');
    expect(text).not.toContain('correspondence tables');
  });

  it('item 8: Hindi answer', async () => {
    const text = await renderFaq();
    expect(text).toContain(signedSegments('8')[0]);
    expect(text).not.toContain('roadmap');
    expect(text).not.toContain('template by template');
  });

  it('item 17: courts question and answer', async () => {
    const text = await renderFaq();
    const [q, a] = signedSegments('17');
    expect(text).toContain(q);
    expect(text).toContain(a);
    expect(text).not.toContain('Which courts does Lawie format for');
  });

  it('item 18: meta description', () => {
    expect(faqMetadata.description).toBe(signedSegments('18')[0]);
    expect(String(faqMetadata.description)).not.toContain('mappings');
  });

  it('A4: refunds answer', async () => {
    const text = await renderFaq();
    const a = signedSegments('A4')[2];
    expect(a).toContain('Payments are non-refundable once the plan period has started');
    expect(text).toContain(a);
    expect(text).not.toContain('Cancellation does not refund');
  });

  it('item 12: the backups sentence is unchanged', async () => {
    const text = await renderFaq();
    expect(text).toContain(
      'We do not currently keep backups, so download and keep your own copy of every document you need.',
    );
  });
});

describe('items 9, 10, A4 (Terms payments), A3: Terms page', () => {
  it('item 9: signed Ink sentences; the old ones are gone', async () => {
    const text = await renderTerms();
    expect(text).toContain(signedSegments('9')[0]);
    expect(text).not.toContain('Most documents use 2 Ink');
    expect(text).not.toContain('a failed generation is not charged');
    expect(text).not.toContain('charged only after a draft is generated');
  });

  it('item 9: version and date do not change', async () => {
    const text = await renderTerms();
    expect(signedSegments('9')[1]).toBe('2026-10-22');
    expect(text).toContain('Last updated: 22 October 2026');
    expect(TERMS_VERSION).toBe('2026-10-22');
  });

  it('item 10: contact@ in section 14 with a mailto link; no legal@', async () => {
    const text = await renderTerms();
    expect(signedSegments('10')[0]).toBe('contact@lawie.in');
    const link = container.querySelector('#contact a');
    expect(link?.getAttribute('href')).toBe('mailto:contact@lawie.in');
    expect(link?.textContent).toBe('contact@lawie.in');
    expect(text).not.toContain('legal@lawie.in');
  });

  it('A4: payments sentence, with the Refund Policy link kept', async () => {
    const text = await renderTerms();
    expect(text).toContain(signedSegments('A4')[0]);
    const link = Array.from(container.querySelectorAll('#billing a')).find(
      (a) => a.textContent === 'Refund Policy',
    );
    expect(link?.getAttribute('href')).toBe('/refunds');
    expect(text).not.toContain('All payments are non-refundable. ');
  });

  it('A3: the T-433 annual sentence and "monthly or annual basis" stay', async () => {
    const text = await renderTerms();
    expect(text).toContain('including on annual plans.');
    expect(text).toContain('on a monthly or annual basis');
  });
});

describe('items 10, 19: contact page', () => {
  it('item 19 / A6: meta, hero, and no reply-time or "no queues" claims', async () => {
    const text = await renderContact();
    expect(contactMetadata.description).toBe(signedSegments('A6')[0]);
    expect(contactMetadata.description).toBe('Email contact@lawie.in.');
    expect(text).toContain(signedSegments('A6')[1]);
    expect(text).not.toContain('We typically reply');
    expect(text).not.toMatch(/within 24 hours/i);
    expect(text).not.toMatch(/no forms|no queues/i);
    expect(String(contactMetadata.description)).not.toMatch(/reply|24 hours|queues/i);
  });

  it('keeps the contact card with the email link', async () => {
    await renderContact();
    const card = container.querySelector('.contact-card');
    expect(card?.querySelector('h3')?.textContent).toBe('Email us');
    expect(card?.querySelector('a.email')?.getAttribute('href')).toBe('mailto:contact@lawie.in');
    expect(card?.querySelector('p')).toBeNull();
  });

  it('item 10: no legal@ anywhere; the Legal questions card uses contact@', async () => {
    const text = await renderContact();
    expect(text).not.toContain('legal@lawie.in');
    const hrefs = Array.from(container.querySelectorAll('a[href^="mailto:"]')).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs.length).toBeGreaterThanOrEqual(3);
    expect(new Set(hrefs)).toEqual(new Set(['mailto:contact@lawie.in']));
  });
});

describe('item 20: pricing meta', () => {
  it('keeps the rest and drops the first sentence', () => {
    const d = String(pricingMetadata.description);
    expect(d).not.toContain('Simple, transparent pricing');
    expect(d).not.toMatch(/^\s/);
    expect(d.startsWith('Free tier with 5 Ink (one time), once your email is verified')).toBe(true);
  });
});

describe('item 15: SiteNav and FloatCta say "Start free"', () => {
  const signed = () => signedSegments('15')[0];

  it('SiteNav desktop and mobile', async () => {
    const Real = jest.requireActual('@/components/marketing/SiteNav').default as typeof SiteNav;
    await renderEl(<Real />);
    const labels = Array.from(container.querySelectorAll('a[href="/login"]'))
      .map((a) => (a.textContent ?? '').trim())
      .filter((t) => /start|try/i.test(t));
    expect(labels.length).toBeGreaterThanOrEqual(2);
    expect(new Set(labels)).toEqual(new Set([signed()]));
    expect(container.textContent).not.toContain('Start Drafting Free');
    expect(container.textContent).not.toContain('Try Lawie free');
  });

  it('FloatCta text and aria-label', async () => {
    const Real = jest.requireActual('@/components/marketing/FloatCta').default as typeof FloatCta;
    await renderEl(<Real />);
    const a = container.querySelector('a.float-cta');
    expect(a?.getAttribute('aria-label')).toBe(signed());
    expect((a?.textContent ?? '').trim()).toBe(signed());
  });
});

describe('item 14: unused landing files are deleted', () => {
  const DELETED = [
    'components/landing/FinalCTA.tsx',
    'components/landing/TrustBar.tsx',
    'components/landing/WaitlistForm.tsx',
    'components/landing/Footer.tsx',
    'components/landing/Navbar.tsx',
    'components/marketing/PriceToggle.tsx',
  ];

  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.next') continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
      else if (/\.(ts|tsx)$/.test(name)) out.push(p);
    }
    return out;
  }

  it('the six files do not exist', () => {
    for (const f of DELETED) expect(existsSync(join(WEB_SRC, f))).toBe(false);
  });

  it('nothing under apps/web/src imports them', () => {
    // Built by concatenation so this file does not match itself.
    const needles = [
      'landing/' + 'FinalCTA',
      'landing/' + 'TrustBar',
      'landing/' + 'WaitlistForm',
      'landing/' + 'Footer',
      'landing/' + 'Navbar',
      'marketing/' + 'PriceToggle',
      './' + 'FinalCTA',
      './' + 'TrustBar',
      './' + 'WaitlistForm',
      './' + 'PriceToggle',
    ];
    const files = sourceFiles(WEB_SRC);
    expect(files.length).toBeGreaterThan(50);
    const hits = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return needles.some((n) => src.includes(`${n}'`) || src.includes(`${n}"`));
    });
    expect(hits).toEqual([]);
  });

  it('the false claims they carried are gone from every source file', () => {
    const phrases = [
      'Join thousands of young advocates',
      'Every template reviewed by a practising lawyer',
      'Save 2 months',
    ];
    const hits = sourceFiles(WEB_SRC).filter((f) => {
      const src = readFileSync(f, 'utf8');
      return phrases.some((p) => src.includes(p)) && !f.includes('__tests__');
    });
    expect(hits).toEqual([]);
  });
});

describe('old phrases are gone from user-facing source', () => {
  function nonTestSources(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.next' || name === '__tests__') continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...nonTestSources(p));
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
    }
    return out;
  }

  it.each([
    'legal@lawie.in',
    'Start Drafting Free',
    'Try Lawie free',
    'We typically reply within 24 hours',
    'Most documents use 2 Ink',
    'a failed generation is not charged',
    'Maps IPC',
    'Built on the current law',
  ])('no source file contains "%s"', (phrase) => {
    const hits = nonTestSources(WEB_SRC).filter((f) =>
      readFileSync(f, 'utf8').replace(/\s+/g, ' ').includes(phrase),
    );
    expect(hits).toEqual([]);
  });
});
