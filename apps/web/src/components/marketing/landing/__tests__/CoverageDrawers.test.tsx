// T-601 (b): the coverage drawers, with a fixture of our own (0, 1 and many templates per category,
// an empty category, a category the signed Hindi map does not know). Spec 3 and 9.3.
import { act } from 'react';

import { CoverageDrawers } from '../CoverageDrawers';
import { headlineCount } from '../catalogue-source';
import { ReadingDeskLanding } from '../ReadingDeskLanding';
import { FIXTURE, bigCatalogue, clearMatchMedia, norm } from './_helpers';

import {
  cleanupMounted as cleanup,
  click,
  mount,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

// @testing-library/dom is not installed in this repo, so the shared nl-test-utils drive the DOM.
const render = (el: React.ReactElement) => mount(el);
const fireEvent = { click };
const key = (el: Element, k: string, type: 'keydown' | 'keyup' = 'keydown') =>
  act(
    () =>
      void el.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true })),
  );
import { REDUCED_MOTION_QUERY } from '@/components/ui/motion';

beforeEach(() => clearMatchMedia());
afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

const HEADLINE = 'THE-HEADLINE-PROP-123';
const drawers = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLButtonElement>('button[data-drawer]'));
const panel = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-drawer-panel]')!;
const expanded = (c: HTMLElement) => drawers(c).map((b) => b.getAttribute('aria-expanded'));

function mountDrawers(lang: 'en' | 'hi' = 'en', catalogue = FIXTURE) {
  const r = render(
    <CoverageDrawers catalogue={catalogue} headline={HEADLINE} lang={lang} id="documents" />,
  );
  return r.container;
}

describe('which drawers render', () => {
  it('one drawer per category that has templates, in catalogue order; the empty one is left out', () => {
    const c = mountDrawers();
    expect(drawers(c).map((b) => b.dataset.drawer)).toEqual([
      'criminal_bail_custody',
      'tax',
      'family_matrimonial',
      'brand_new_shelf',
    ]);
    expect(c.querySelector('[data-drawer="civil_plaints_suits"]')).toBeNull();
    expect(norm(c.textContent)).not.toContain('Civil: plaints and suits');
  });

  it('19 categories give 19 drawers', () => {
    const big = bigCatalogue();
    const c = mountDrawers('en', big);
    expect(drawers(c)).toHaveLength(19);
    expect(c.querySelector('ul[aria-label="Template drawers"]')!.children).toHaveLength(19);
  });

  it('no category with zero templates is rendered even when it is the first or the only one', () => {
    const first = {
      ...FIXTURE,
      categories: [{ ...FIXTURE.categories[1] }, ...FIXTURE.categories.slice(2)],
    };
    const c = mountDrawers('en', first);
    expect(c.querySelector('[data-drawer="civil_plaints_suits"]')).toBeNull();
    // The first drawer that exists is the open one.
    expect(drawers(c)[0].dataset.drawer).toBe('tax');
    expect(expanded(c)[0]).toBe('true');
  });

  it('an empty catalogue renders no section at all', () => {
    const c = mountDrawers('en', { ...FIXTURE, categories: [], total: 0 });
    expect(c.querySelector('section')).toBeNull();
    const only = mountDrawers('en', { ...FIXTURE, categories: [FIXTURE.categories[1]], total: 0 });
    expect(only.querySelector('section')).toBeNull();
  });
});

describe('aria-expanded, aria-controls, one open at a time', () => {
  it('the first drawer is open on load, the others closed', () => {
    const c = mountDrawers();
    expect(expanded(c)).toEqual(['true', 'false', 'false', 'false']);
    expect(panel(c).dataset.drawerPanel).toBe('criminal_bail_custody');
  });

  it('every drawer controls the one panel', () => {
    const c = mountDrawers();
    const id = panel(c).id;
    expect(id).not.toBe('');
    for (const b of drawers(c)) expect(b.getAttribute('aria-controls')).toBe(id);
    expect(c.querySelectorAll('[role="region"]')).toHaveLength(1);
    expect(c.querySelectorAll('[data-drawer-panel]')).toHaveLength(1);
  });

  it('opening another closes the first; only one is ever open', () => {
    const c = mountDrawers();
    fireEvent.click(drawers(c)[2]);
    expect(expanded(c)).toEqual(['false', 'false', 'true', 'false']);
    expect(panel(c).dataset.drawerPanel).toBe('family_matrimonial');
    fireEvent.click(drawers(c)[3]);
    expect(expanded(c).filter((e) => e === 'true')).toHaveLength(1);
    expect(panel(c).dataset.drawerPanel).toBe('brand_new_shelf');
  });

  it('pressing the open drawer keeps it open (there is always a list to read)', () => {
    const c = mountDrawers();
    fireEvent.click(drawers(c)[0]);
    expect(expanded(c)[0]).toBe('true');
    expect(panel(c)).not.toBeNull();
  });

  it('the panel lists exactly the open category templates', () => {
    const c = mountDrawers();
    expect(Array.from(panel(c).querySelectorAll('li')).map((l) => l.textContent)).toEqual(
      FIXTURE.categories[0].templates.map((t) => t.name),
    );
    fireEvent.click(drawers(c)[1]);
    expect(Array.from(panel(c).querySelectorAll('li')).map((l) => l.textContent)).toEqual([
      'Only Tax Template',
    ]);
  });

  it('rapid clicks over every drawer end with exactly one open: the last pressed', () => {
    const c = mountDrawers('en', bigCatalogue());
    for (let k = 0; k < 3; k += 1) for (const b of drawers(c)) fireEvent.click(b);
    const e = expanded(c);
    expect(e.filter((x) => x === 'true')).toHaveLength(1);
    expect(e[e.length - 1]).toBe('true');
  });
});

describe('DOM order and keyboard', () => {
  it('the panel comes after every drawer button in DOM order, outside the grid', () => {
    const c = mountDrawers();
    const grid = c.querySelector('ul[aria-label="Template drawers"]')!;
    const p = panel(c);
    expect(grid.contains(p)).toBe(false);
    for (const b of drawers(c)) {
      expect(b.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // The footer line follows the panel.
    const footer = c.querySelector('[data-coverage-total]')!;
    expect(p.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('drawers are native buttons in one tab sequence (no roving tabindex)', () => {
    const c = mountDrawers();
    for (const b of drawers(c)) {
      expect(b.tagName).toBe('BUTTON');
      expect(b.getAttribute('type')).toBe('button');
      expect(b.hasAttribute('disabled')).toBe(false);
      expect(b.tabIndex).toBe(0);
      expect(b.hasAttribute('tabindex')).toBe(false);
    }
    // The panel is not a tab stop of its own, and nothing between the buttons and it is focusable.
    expect(panel(c).hasAttribute('tabindex')).toBe(false);
  });

  it('Enter and Space keydown add no handler of their own (the native button click opens it once)', () => {
    const c = mountDrawers();
    const b = drawers(c)[1];
    b.focus();
    expect(document.activeElement).toBe(b);
    key(b, 'Enter');
    key(b, ' ');
    key(b, ' ', 'keyup');
    // A custom keydown handler that toggled would have opened it without a click.
    expect(expanded(c)).toEqual(['true', 'false', 'false', 'false']);
    // The click the browser fires for Enter / Space opens it, exactly once.
    click(b);
    expect(expanded(c)).toEqual(['false', 'true', 'false', 'false']);
  });

  it('arrow keys, Home and End do nothing (the spec has Tab, Enter and Space only)', () => {
    const c = mountDrawers();
    const b = drawers(c)[0];
    b.focus();
    const before = expanded(c);
    for (const k of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']) key(b, k);
    expect(expanded(c)).toEqual(before);
    expect(document.activeElement).toBe(b);
  });

  it('focus stays on the pressed drawer after it opens (the panel follows in DOM order)', () => {
    const c = mountDrawers();
    const b = drawers(c)[1];
    b.focus();
    click(b);
    expect(document.activeElement).toBe(b);
  });
});

describe('counts and labels (M-LP-15-07, 07b, 12, 13, 14)', () => {
  it('n === 1 gives "1 document type", else "{n} document types"; not "1 document types"', () => {
    const c = mountDrawers();
    const counts = drawers(c).map((b) =>
      norm(b.textContent).replace(b.getAttribute('aria-label')!, ''),
    );
    void counts;
    const text = (name: string) => norm(c.querySelector(`[data-drawer="${name}"]`)!.textContent);
    expect(text('criminal_bail_custody')).toContain('3 document types');
    expect(text('tax')).toContain('1 document type');
    expect(text('tax')).not.toContain('1 document types');
    expect(text('family_matrimonial')).toContain('2 document types');
  });

  it('the aria-label starts with the visible name and carries the same count form', () => {
    const c = mountDrawers();
    const by = (id: string) => c.querySelector(`[data-drawer="${id}"]`)!;
    expect(by('criminal_bail_custody').getAttribute('aria-label')).toBe(
      'Criminal: bail and custody, 3 document types',
    );
    expect(by('tax').getAttribute('aria-label')).toBe('Tax, 1 document type');
    for (const b of drawers(c)) {
      const visibleName = (b.querySelector('span') as HTMLElement).textContent!;
      expect(b.getAttribute('aria-label')!.startsWith(visibleName)).toBe(true);
    }
  });

  it('the panel is a labelled region and the grid is a labelled list', () => {
    const c = mountDrawers();
    expect(panel(c).getAttribute('role')).toBe('region');
    expect(panel(c).getAttribute('aria-label')).toBe('Templates in Criminal: bail and custody');
    expect(c.querySelector('ul[aria-label="Template drawers"]')).not.toBeNull();
  });

  it('the panel header uses the same count string as the drawer', () => {
    const c = mountDrawers();
    expect(norm(panel(c).querySelector('p')!.textContent)).toBe(
      'Criminal: bail and custody · 3 document types',
    );
    fireEvent.click(drawers(c)[1]);
    expect(norm(panel(c).querySelector('p')!.textContent)).toBe('Tax · 1 document type');
  });

  it('Hindi: the singular form changes (प्रकार का) and the aria-label follows', () => {
    const c = mountDrawers('hi');
    const tax = c.querySelector('[data-drawer="tax"]')!;
    expect(norm(tax.textContent)).toContain('1 प्रकार का दस्तावेज़');
    expect(tax.getAttribute('aria-label')).toBe('कर, 1 प्रकार का दस्तावेज़');
    const bail = c.querySelector('[data-drawer="criminal_bail_custody"]')!;
    expect(norm(bail.textContent)).toContain('3 प्रकार के दस्तावेज़');
    expect(bail.getAttribute('aria-label')).toBe('आपराधिक: जमानत और हिरासत, 3 प्रकार के दस्तावेज़');
  });
});

describe('headline and footer', () => {
  it('the headline is the prop, verbatim, and is never computed inside the component', () => {
    const c = mountDrawers();
    expect(c.querySelector('[data-coverage-headline]')!.textContent).toBe(HEADLINE);
    expect(norm(c.textContent)).not.toContain('80+');
    const other = mountDrawers('en', { ...FIXTURE, total: 1234 });
    void other;
    expect(norm(document.body.textContent)).not.toContain('1230+');
  });

  it('the footer line carries the exact total and the shelf count of the shelves shown', () => {
    const c = mountDrawers();
    expect(norm(c.querySelector('[data-coverage-total]')!.textContent)).toBe(
      '86 document types on 4 shelves today.',
    );
    const hi = mountDrawers('hi');
    expect(norm(hi.querySelector('[data-coverage-total]')!.textContent)).toBe(
      'आज 4 दराज़ों में 86 प्रकार के दस्तावेज़।',
    );
  });

  it('the footer shelf count is the rendered drawers (19), not the raw category count', () => {
    const big = bigCatalogue();
    const c = mountDrawers('en', {
      ...big,
      categories: [...big.categories, { id: 'zero', name: 'Zero', order: 99, templates: [] }],
    });
    expect(norm(c.querySelector('[data-coverage-total]')!.textContent)).toBe(
      `${big.total} document types on 19 shelves today.`,
    );
  });

  it('the page passes headlineCount(total) into the component: 86 gives 80+, the footer keeps 86', () => {
    expect(headlineCount(86)).toBe('80+');
    expect(headlineCount(9)).toBe('0+');
    expect(headlineCount(100)).toBe('100+');
    const r = render(<ReadingDeskLanding catalogue={FIXTURE} />);
    expect(r.container.querySelector('[data-coverage-headline]')!.textContent).toBe(
      '80+ document types in the library, shelved by subject.',
    );
    expect(norm(r.container.querySelector('[data-coverage-total]')!.textContent)).toBe(
      '86 document types on 4 shelves today.',
    );
    r.unmount();
    const big = { ...FIXTURE, total: 130 };
    const r2 = render(<ReadingDeskLanding catalogue={big} />);
    expect(r2.container.querySelector('[data-coverage-headline]')!.textContent).toContain('130+');
  });

  it('the section is the "documents" anchor and the h2 is the signed M-LP-05', () => {
    const c = mountDrawers();
    expect(c.querySelector('section#documents')).not.toBeNull();
    expect(c.querySelector('h2')!.textContent).toBe('Open a drawer. See the templates.');
    expect(norm(c.textContent)).toContain('What we draft');
  });
});

describe('Hindi', () => {
  it('uses the signed names and falls back to the JSON name for a category with no signed Hindi', () => {
    const c = mountDrawers('hi');
    const name = (id: string) => c.querySelector(`[data-drawer="${id}"] span`)!.textContent;
    expect(name('criminal_bail_custody')).toBe('आपराधिक: जमानत और हिरासत');
    expect(name('tax')).toBe('कर');
    expect(name('family_matrimonial')).toBe('परिवार और वैवाहिक');
    expect(name('brand_new_shelf')).toBe('Brand New Shelf');
    // The fallback is marked as English for assistive tech; the Hindi names are not.
    expect(c.querySelector('[data-drawer="brand_new_shelf"] span')!.getAttribute('lang')).toBe(
      'en',
    );
    expect(c.querySelector('[data-drawer="tax"] span')!.hasAttribute('lang')).toBe(false);
  });

  it('English mode ignores the Hindi map and prints the JSON name (a rename follows the JSON)', () => {
    const renamed = {
      ...FIXTURE,
      categories: FIXTURE.categories.map((x) => (x.id === 'tax' ? { ...x, name: 'Taxation' } : x)),
    };
    const c = mountDrawers('en', renamed);
    expect(c.querySelector('[data-drawer="tax"] span')!.textContent).toBe('Taxation');
  });

  it('template titles stay English (lang="en") under the Hindi toggle', () => {
    const c = mountDrawers('hi');
    const list = panel(c).querySelector('ul')!;
    expect(list.getAttribute('lang')).toBe('en');
    expect(Array.from(list.querySelectorAll('li')).map((l) => l.textContent)).toEqual(
      FIXTURE.categories[0].templates.map((t) => t.name),
    );
    expect(panel(c).getAttribute('aria-label')).toBe('आपराधिक: जमानत और हिरासत के टेम्पलेट');
  });

  it('the headline prop and M-LP-06 are not touched by the language of the component', () => {
    const c = mountDrawers('hi');
    expect(c.querySelector('h2')!.textContent).toBe('दराज़ खोलिए, टेम्पलेट देखिए।');
    expect(norm(c.textContent)).toContain('यह सूची हमारी टेम्पलेट लाइब्रेरी से बनती है');
  });
});

describe('motion', () => {
  it('motion allowed: a switch sets a 200ms ease-out height/opacity transition, then clears it', () => {
    jest.useFakeTimers();
    const c = mountDrawers();
    const outer = panel(c).parentElement!;
    fireEvent.click(drawers(c)[1]);
    expect(outer.style.transition).toBe('height 200ms ease-out');
    expect(panel(c).style.transition).toBe('opacity 200ms ease-out');
    act(() => void jest.advanceTimersByTime(400));
    expect(outer.style.transition).toBe('');
    expect(outer.style.height).toBe('');
    expect(panel(c).style.transition).toBe('');
  });

  it('reduced motion: switching is instant and no transition style is ever set', () => {
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    const c = mountDrawers();
    const outer = panel(c).parentElement!;
    fireEvent.click(drawers(c)[1]);
    expect(expanded(c)).toEqual(['false', 'true', 'false', 'false']);
    expect(outer.getAttribute('style') ?? '').toBe('');
    expect(panel(c).getAttribute('style') ?? '').toBe('');
    expect(outer.style.transition).toBe('');
    expect(panel(c).style.transition).toBe('');
    expect(outer.style.height).toBe('');
  });

  it('a switch never touches the grid (the buttons do not move into the panel)', () => {
    const c = mountDrawers();
    const grid = c.querySelector('ul[aria-label="Template drawers"]')!;
    const before = grid.children.length;
    fireEvent.click(drawers(c)[2]);
    expect(grid.children).toHaveLength(before);
    expect(grid.querySelectorAll('[role="region"]')).toHaveLength(0);
  });
});
