// T-549 item 1 (Rajesh T-531 F1): the consent card on Night tokens with two equal ghost buttons.
// Ajay's neutrality rules (T-310 D1-D6) are pinned here: one class string, Decline first, neither
// button filled, strings byte-exact against the signed file. jsdom has no layout or stylesheet, so
// the 320px worst case is asserted through the classes that bound it (see the break-ui block).
import { readFileSync } from 'fs';
import { join } from 'path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePathname } from 'next/navigation';

import AnalyticsConsent, { CONSENT_STRINGS } from '../AnalyticsConsent';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SIGNED = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    'handoff',
    'legal',
    'T-310-consent-notice-signed.md',
  ),
  'utf8',
);

/** The signed table: id -> the backtick-quoted strings in its row. */
function signedStrings(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const line of SIGNED.split('\n')) {
    const m = /^\| (S\d+) \| (.+) \|$/.exec(line);
    if (m) out[m[1]] = Array.from(m[2].matchAll(/`([^`]+)`/g), (x) => x[1]);
  }
  return out;
}

let container: HTMLDivElement;
let root: Root;

async function mountCard() {
  (usePathname as jest.Mock).mockReturnValue('/pricing');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<AnalyticsConsent />));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn(() =>
    Promise.resolve({ ok: true, status: 204 }),
  );
  await mountCard();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.removeAttribute('data-consent-open');
});

const section = () => container.querySelector('section') as HTMLElement;
const sectionCls = () => section().className.split(/\s+/);
const buttons = () => Array.from(container.querySelectorAll('button'));

describe('T-549 consent card: Night tokens', () => {
  it('the section carries the Night token scope `nl` but not `nl-root` (no Wall paint)', () => {
    const c = sectionCls();
    expect(c).toContain('nl');
    expect(c).not.toContain('nl-root');
  });

  it('uses Card fill, Line border, Text colour, Card shadow and the body font', () => {
    expect(sectionCls()).toEqual(
      expect.arrayContaining([
        'font-nl-body',
        'bg-nl-card',
        'border-nl-line',
        'text-nl-text',
        'shadow-nl-card',
      ]),
    );
  });

  it('keeps no legacy brand colours or the old navy shadow on the card or its text', () => {
    const html = section().outerHTML;
    expect(html).not.toMatch(/brand-|bg-white|rgba\(13,31,60/);
  });

  it('title is the Night h2 and the body is Body Soft', () => {
    const h2 = container.querySelector('#consent-title')!;
    expect(h2.className).toContain('nl-h2');
    expect(h2.className).toContain('text-nl-text');
    const desc = container.querySelector('#consent-desc')!;
    expect(desc.className).toContain('text-nl-soft');
    expect(desc.className).toContain('nl-body-sm');
  });

  it('the Privacy Policy link is inline Brass Text, not NL_TEXT_LINK (no 44px min-height)', () => {
    const link = container.querySelector('#consent-desc a')!;
    const c = link.className.split(/\s+/);
    expect(c).toEqual(expect.arrayContaining(['nl-focus', 'text-nl-brass-dark', 'underline']));
    expect(c).not.toContain('inline-flex');
    expect(c.some((x) => x.startsWith('min-h-'))).toBe(false);
    expect(link.getAttribute('href')).toBe('/privacy#browser-storage');
    // it sits in the sentence: the paragraph's own text ends with the link text
    expect(container.querySelector('#consent-desc')!.lastElementChild).toBe(link);
  });

  it('phone sheet and desktop card keep their position, safe-area and layer classes', () => {
    expect(sectionCls()).toEqual(
      expect.arrayContaining([
        'z-[55]',
        'rounded-t-[12px]',
        'border-t',
        'sm:rounded-nl-md',
        'sm:border',
      ]),
    );
  });
});

describe('T-549 consent card: equal buttons (Ajay, T-310 D1-D6)', () => {
  it('there are exactly two buttons, Decline first, then Accept, with the signed words', () => {
    const bs = buttons();
    expect(bs).toHaveLength(2);
    expect(bs.map((b) => b.textContent)).toEqual([CONSENT_STRINGS.S5, CONSENT_STRINGS.S6]);
    expect(bs.map((b) => b.textContent)).toEqual(['Decline', 'Accept']);
  });

  it('both render the identical className', () => {
    const [a, b] = buttons();
    expect(a.className).not.toBe('');
    expect(a.className).toBe(b.className);
  });

  it('both have identical attributes (apart from none) and identical computed style', () => {
    const [a, b] = buttons();
    const attrs = (el: Element) =>
      Array.from(el.attributes)
        .map((x) => `${x.name}=${x.value}`)
        .sort();
    expect(attrs(a)).toEqual(attrs(b));
    const sa = window.getComputedStyle(a);
    const sb = window.getComputedStyle(b);
    const props = Array.from(sa);
    for (const p of props) expect(sb.getPropertyValue(p)).toBe(sa.getPropertyValue(p));
    expect(a.disabled).toBe(b.disabled);
    expect(a.getAttribute('aria-pressed')).toBeNull();
    expect(b.getAttribute('aria-pressed')).toBeNull();
  });

  it('neither button is filled: ghost, no brass fill, no primary or destructive fill', () => {
    for (const b of buttons()) {
      const c = b.className.split(/\s+/);
      expect(c).toContain('bg-transparent');
      expect(c).not.toContain('bg-nl-brass');
      expect(c.some((x) => /^bg-nl-brass$|^bg-nl-ox|^bg-nl-card$|^bg-white$/.test(x))).toBe(false);
      expect(c).not.toContain('font-semibold');
      expect(c).not.toContain('font-bold');
    }
    expect(section().innerHTML).not.toContain('bg-nl-brass ');
  });

  it('is the same size at every width: 44px, no sm: height override', () => {
    for (const b of buttons()) {
      const c = b.className.split(/\s+/);
      expect(c).toContain('h-11');
      expect(c.some((x) => /^sm:h-/.test(x))).toBe(false);
    }
  });

  it('nothing is pre-selected: no checked, pressed or autofocus on either button', () => {
    for (const b of buttons()) {
      expect(b.hasAttribute('autofocus')).toBe(false);
      expect(b.getAttribute('aria-checked')).toBeNull();
      expect(b.getAttribute('aria-pressed')).toBeNull();
      expect(document.activeElement).not.toBe(b);
    }
  });
});

describe('T-549 consent card: strings are byte-exact against the signed file', () => {
  it('the signed file parsed (guards the parser against a silent empty table)', () => {
    const s = signedStrings();
    expect(Object.keys(s)).toEqual(
      expect.arrayContaining(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10']),
    );
    expect(s.S4).toHaveLength(2);
  });

  it('CONSENT_STRINGS equals S1-S10 in handoff/legal/T-310-consent-notice-signed.md', () => {
    const s = signedStrings();
    expect(CONSENT_STRINGS.S1).toBe(s.S1[0]);
    expect(CONSENT_STRINGS.S2).toBe(s.S2[0]);
    expect(CONSENT_STRINGS.S3).toBe(s.S3[0]);
    expect(CONSENT_STRINGS.S4_GRANTED).toBe(s.S4[0]);
    expect(CONSENT_STRINGS.S4_DENIED).toBe(s.S4[1]);
    expect(CONSENT_STRINGS.S5).toBe(s.S5[0]);
    expect(CONSENT_STRINGS.S6).toBe(s.S6[0]);
    expect(CONSENT_STRINGS.S7).toBe(s.S7[0]);
    expect(CONSENT_STRINGS.S8).toBe(s.S8[0]);
    expect(CONSENT_STRINGS.S9).toBe(s.S9[0]);
    expect(CONSENT_STRINGS.S10).toBe(s.S10[0]);
  });

  it('the rendered card shows only S1, S2, S3, S5 and S6 and no other words on the first ask', () => {
    const s = signedStrings();
    const text = Array.from(section().querySelectorAll('h2, p, a, button'))
      .filter((el) => !el.querySelector('h2, p, a, button'))
      .map((el) => el.textContent);
    // h2, then the p's own text node, the link, then the buttons
    expect(section().querySelector('h2')!.textContent).toBe(s.S1[0]);
    expect(section().querySelector('#consent-desc')!.textContent).toBe(`${s.S2[0]} ${s.S3[0]}`);
    expect(text).toContain(s.S5[0]);
    expect(text).toContain(s.S6[0]);
    expect(section().textContent).toBe(`${s.S1[0]}${s.S2[0]} ${s.S3[0]}${s.S5[0]}${s.S6[0]}`);
  });
});

describe('T-549 consent card: 320px worst case (break-ui, class level in jsdom)', () => {
  it('the card is capped, the text region scrolls and the button row stays outside it', () => {
    expect(sectionCls()).toEqual(
      expect.arrayContaining(['max-h-[max(40vh,8rem)]', 'flex', 'flex-col']),
    );
    expect(sectionCls()).not.toContain('max-h-none');
    const scroller = section().querySelector('.overflow-y-auto') as HTMLElement;
    expect(scroller.className).toEqual(expect.stringContaining('min-h-0'));
    expect(scroller.className).toEqual(expect.stringContaining('flex-1'));
    const row = buttons()[0].parentElement as HTMLElement;
    expect(row.className).toContain('shrink-0');
    expect(scroller.contains(row)).toBe(false);
    expect(scroller.contains(container.querySelector('#consent-desc a'))).toBe(true);
  });

  it('the scroller has 6px of room, so the link focus ring (3px offset + 2px) is not clipped', () => {
    const scroller = section().querySelector('.overflow-y-auto') as HTMLElement;
    const c = scroller.className.split(/\s+/);
    expect(c).toEqual(expect.arrayContaining(['-m-1.5', 'p-1.5']));
    expect(c).not.toContain('p-1');
  });

  it('the two buttons share a two-column row, so a long word cannot make one wider', () => {
    const row = buttons()[0].parentElement as HTMLElement;
    expect(row.className).toContain('grid-cols-2');
    for (const b of buttons()) expect(b.className.split(/\s+/)).toContain('w-full');
  });
});

describe('T-549 consent card: hook for the Daylight pin', () => {
  it('the section carries data-consent-card (the globals.css pin keys off it)', () => {
    expect(section().hasAttribute('data-consent-card')).toBe(true);
  });
});

// Ajay's three conditions (relayed by Priya), each enforced here.
describe('T-549 consent card: Ajay condition (a), one constant for both buttons', () => {
  const src = readFileSync(join(__dirname, '..', 'AnalyticsConsent.tsx'), 'utf8');
  const tags = [...src.matchAll(/<Button\b([\s\S]*?)>\s*\{CONSENT_STRINGS/g)].map((m) => m[1]);

  it('source has exactly two <Button elements', () => {
    expect(tags).toHaveLength(2);
  });

  it('both use the same variant={identifier}, not a string literal', () => {
    const variants = tags.map((t) => /variant=\{([A-Za-z_]\w*)\}/.exec(t)?.[1]);
    expect(variants[0]).toBeDefined();
    expect(variants[1]).toBe(variants[0]);
    expect(src).toMatch(new RegExp(`const ${variants[0]}\\b[^=]*=\\s*'ghost'`));
    expect(src.match(new RegExp(`\\b${variants[0]}\\b`, 'g'))!.length).toBeGreaterThanOrEqual(3);
  });

  it('both use the same className={identifier}, defined once as a string constant', () => {
    const names = tags.map((t) => /className=\{([A-Za-z_]\w*)\}/.exec(t)?.[1]);
    expect(names[0]).toBeDefined();
    expect(names[1]).toBe(names[0]);
    expect(src.match(new RegExp(`const ${names[0]}\\s*=`, 'g'))).toHaveLength(1);
  });

  it('no per-button variant, className or style literal in either tag', () => {
    for (const t of tags) {
      expect(t).not.toMatch(/variant="/);
      expect(t).not.toMatch(/className="/);
      expect(t).not.toMatch(/className=\{[`'"]/);
      expect(t).not.toMatch(/style=/);
    }
  });

  it('rendered classes and computed styles are identical', () => {
    const [a, b] = buttons();
    expect(a.className).toBe(b.className);
    const sa = window.getComputedStyle(a);
    const sb = window.getComputedStyle(b);
    for (const p of Array.from(sa)) expect(sb.getPropertyValue(p)).toBe(sa.getPropertyValue(p));
    expect(a.getAttribute('style')).toBe(b.getAttribute('style'));
  });
});

describe('T-549 consent card: Ajay condition (b), nothing pre-selected or focused', () => {
  const src = readFileSync(join(__dirname, '..', 'AnalyticsConsent.tsx'), 'utf8');

  it('after mount, document.activeElement is neither button', () => {
    const [a, b] = buttons();
    expect(document.activeElement).not.toBe(a);
    expect(document.activeElement).not.toBe(b);
    expect(container.contains(document.activeElement) && document.activeElement?.tagName).not.toBe(
      'BUTTON',
    );
  });

  it('neither button has autofocus, aria-pressed, aria-checked or data-state', () => {
    for (const bt of buttons()) {
      expect(bt.hasAttribute('autofocus')).toBe(false);
      for (const attr of ['aria-pressed', 'aria-checked', 'data-state', 'aria-selected']) {
        expect(bt.hasAttribute(attr)).toBe(false);
      }
      expect(bt.querySelector('[data-state],[aria-pressed],[aria-checked]')).toBeNull();
    }
  });

  it('source never autofocuses and never sets a pressed, checked or state attribute', () => {
    expect(src).not.toMatch(/autoFocus/i);
    expect(src).not.toMatch(/aria-pressed|aria-checked|aria-selected|data-state/);
  });
});

describe('T-549 consent card: Ajay condition (c), same order and size in every theme', () => {
  const signature = () =>
    buttons().map((b) => ({ text: b.textContent, cls: b.className, parent: b.parentElement }));

  /** Move the mounted card into a wrapper (e.g. `.mk`) without remounting React. */
  function wrapIn(wrapperClass: string) {
    const wrap = document.createElement('div');
    wrap.className = wrapperClass;
    container.parentElement!.insertBefore(wrap, container);
    wrap.appendChild(container);
    return wrap;
  }

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  const sizeClasses = (cls: string) =>
    cls
      .split(/\s+/)
      .filter((c) => /(^|:)(h|w|min-w|min-h|px|py|p|text)-/.test(c) && !/^text-nl-/.test(c))
      .sort();

  let baseline: Array<{ text: string | null; size: string[] }>;
  beforeEach(() => {
    baseline = signature().map((s) => ({ text: s.text, size: sizeClasses(s.cls) }));
  });

  const cases: Array<[string, () => void]> = [
    ['html[data-theme=night]', () => document.documentElement.setAttribute('data-theme', 'night')],
    [
      'html[data-theme=daylight]',
      () => document.documentElement.setAttribute('data-theme', 'daylight'),
    ],
    ['inside a .mk wrapper (Daylight on cream)', () => wrapIn('mk')],
    [
      'inside .mk under Night',
      () => {
        document.documentElement.setAttribute('data-theme', 'night');
        wrapIn('mk');
      },
    ],
  ];

  it('baseline: Decline first, h-11, w-full, same min width on both', () => {
    expect(baseline.map((b) => b.text)).toEqual(['Decline', 'Accept']);
    expect(baseline[0].size).toEqual(baseline[1].size);
    expect(baseline[0].size).toEqual(
      expect.arrayContaining(['h-11', 'w-full', 'sm:min-w-[120px]']),
    );
  });

  it.each(cases)('%s: Decline first, identical classes, identical size classes', (_n, apply) => {
    apply();
    const now = signature();
    expect(now.map((s) => s.text)).toEqual(['Decline', 'Accept']);
    expect(now[0].cls).toBe(now[1].cls);
    expect(now.map((s) => sizeClasses(s.cls))).toEqual(baseline.map((b) => b.size));
    for (const s of now) expect(s.cls.split(/\s+/).some((c) => /^sm:h-/.test(c))).toBe(false);
    // the card still carries its own token scope, whatever wraps it
    expect(section().className.split(/\s+/)).toContain('nl');
    expect(section().hasAttribute('data-consent-card')).toBe(true);
    // computed styles stay identical
    const [a, b] = buttons();
    const sa = window.getComputedStyle(a);
    const sb = window.getComputedStyle(b);
    for (const p of Array.from(sa)) expect(sb.getPropertyValue(p)).toBe(sa.getPropertyValue(p));
    expect(document.activeElement).not.toBe(a);
    expect(document.activeElement).not.toBe(b);
  });

  it('no theme-conditional variant (dark:, night:, [data-theme]) is on either button or the row', () => {
    for (const b of buttons()) {
      expect(b.className).not.toMatch(/dark:|night:|daylight:|data-\[theme|\.mk/);
      expect(b.parentElement!.className).not.toMatch(/dark:|night:|daylight:|data-\[theme|\.mk/);
    }
  });
});
