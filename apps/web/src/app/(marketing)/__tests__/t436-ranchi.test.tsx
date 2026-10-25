// T-436 AC10 (Ajay, handoff/legal/gst-tax-invoice-signed.md, Addendum 4 point 3): "Patna, Bihar" is
// wrong everywhere it names us. The registered place of business is Ranchi, Jharkhand. No public
// page may carry "Patna, Bihar" or a bracketed placeholder. Not covered here, by design: sample
// drafts, and the "Patna bar review" input hint on admin/referral-codes (not a public page, not us).
import * as fs from 'fs';
import * as path from 'path';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import AboutPage from '../about/page';
import ContactPage from '../contact/page';
import FaqPage from '../faq/page';
import HomePage from '../page';
import PricingPage from '../pricing/page';
import PrivacyPage from '../privacy/page';
import RefundsPage from '../refunds/page';
import TermsPage from '../terms/page';
import ToolsPage from '../tools/page';

jest.mock('@/components/marketing/SiteNav', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/marketing/FloatCta', () => ({ __esModule: true, default: () => null }));
// SiteFooter is NOT stubbed: it is on every public page, so the sweep covers its text too.

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
  return (container.textContent ?? '').replace(/\s+/g, ' ');
}

describe('T-436 AC1: Terms section 12', () => {
  const SENTENCE =
    'These Terms are governed by the laws of India. Any dispute is subject to the exclusive jurisdiction of the courts at Ranchi, Jharkhand. Nothing in this section limits any right you have to approach a Consumer Commission where you live or work.';

  it('reads exclusive jurisdiction of the courts at Ranchi, Jharkhand; Consumer Commission sentence stays', () => {
    const text = render(<TermsPage />);
    expect(text).toContain('12. Governing Law');
    expect(text).toContain(SENTENCE);
    expect(text).toContain('exclusive jurisdiction of the courts at Ranchi, Jharkhand');
  });

  it('section 12 is exactly the heading plus that one paragraph', () => {
    render(<TermsPage />);
    const h = Array.from(container.querySelectorAll('h3')).find((e) =>
      (e.textContent ?? '').includes('12. Governing Law'),
    )!;
    expect(h).toBeDefined();
    const p = h.nextElementSibling!;
    expect(p.tagName).toBe('P');
    expect((p.textContent ?? '').replace(/\s+/g, ' ')).toBe(SENTENCE);
  });

  it('the page has no Patna anywhere', () => {
    const text = render(<TermsPage />);
    expect(text).not.toContain('Patna');
    expect(text).not.toContain('Patna, Bihar');
  });
});

describe('T-436 AC2: contact page address block', () => {
  function addressLines(): string[] {
    const block = container.querySelector('.address')!;
    expect(block).not.toBeNull();
    return block.innerHTML
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<\/span>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }

  it('is the label "Based in", then Lawie (Sole Proprietorship), then Ranchi, Jharkhand', () => {
    render(<ContactPage />);
    expect(container.querySelector('.address .lbl')?.textContent).toBe('Based in');
    expect(addressLines()).toEqual([
      'Based in',
      'Lawie (Sole Proprietorship)',
      'Ranchi, Jharkhand',
    ]);
  });

  it('has no street line, no brackets, no Patna, no PIN, no "Registered Address" label', () => {
    const text = render(<ContactPage />);
    const block = container.querySelector('.address')!.textContent ?? '';
    for (const t of [text, block]) {
      expect(t).not.toContain('[');
      expect(t).not.toContain(']');
      expect(t).not.toContain('Patna');
      expect(t).not.toContain('Bihar —');
      expect(t).not.toMatch(/PIN/);
      expect(t).not.toMatch(/placeholder/i);
      expect(t).not.toContain('Registered Address');
    }
  });
});

describe('T-436 AC4: sweep over the public marketing pages', () => {
  const PAGES: Array<[string, () => ReactElement]> = [
    ['home', () => <HomePage />],
    ['terms', () => <TermsPage />],
    ['contact', () => <ContactPage />],
    ['privacy', () => <PrivacyPage />],
    ['pricing', () => <PricingPage />],
    ['faq', () => <FaqPage />],
    ['refunds', () => <RefundsPage />],
    ['about', () => <AboutPage />],
  ];

  it.each(PAGES)('%s: no "Patna, Bihar" and no bracketed placeholder', (_name, page) => {
    const text = render(page());
    expect(text.length).toBeGreaterThan(200);
    expect(text).not.toContain('Patna, Bihar');
    expect(text).not.toContain('Patna');
    expect(text).not.toContain('[PIN]');
    expect(text).not.toContain('[Street address placeholder]');
    expect(text).not.toContain('[registered address]');
    expect(text).not.toMatch(/\[[^\]]*(PIN|placeholder|registered address)[^\]]*\]/i);
  });
});

describe('T-436 AC4: tools page (async, flags fetched; fetch mocked, no network)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('tools: no "Patna, Bihar" and no bracketed placeholder', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ tool_timeline: true, tool_bail_checker: true }),
    });
    const el = await ToolsPage();
    const text = render(el);
    expect(text.length).toBeGreaterThan(200);
    expect(text).not.toContain('Patna');
    expect(text).not.toMatch(/\[[^\]]*(PIN|placeholder|registered address)[^\]]*\]/i);
  });
});

describe('T-436 AC4: source sweep over everything under (marketing)', () => {
  const ROOT = path.resolve(__dirname, '..');
  function files(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.name === '__tests__' || e.name === 'node_modules') return [];
      const full = path.join(dir, e.name);
      return e.isDirectory() ? files(full) : [full];
    });
  }
  const all = files(ROOT).filter((f) => /\.(tsx?|css|md|json|html)$/.test(f));

  it('finds the marketing pages and the layout (so the sweep is not vacuous)', () => {
    const rel = all.map((f) => path.relative(ROOT, f));
    expect(rel).toEqual(
      expect.arrayContaining(['layout.tsx', 'page.tsx', 'terms/page.tsx', 'contact/page.tsx']),
    );
  });

  // layout.tsx is covered here rather than rendered: it needs next/font/google, which Jest cannot load.
  it.each(all.map((f) => [path.relative(ROOT, f), f]))(
    '%s has no Patna, Bihar or placeholder text',
    (_rel, f) => {
      const src = fs.readFileSync(f, 'utf8');
      for (const bad of [
        'Patna, Bihar',
        '[PIN]',
        '[Street address placeholder]',
        '[registered address]',
      ]) {
        expect(src).not.toContain(bad);
      }
    },
  );
});
