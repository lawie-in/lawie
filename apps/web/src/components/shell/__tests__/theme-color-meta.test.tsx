// T-524: ThemeProvider keeps exactly one <meta name="theme-color"> without media, ahead of the
// layout's media-scoped ones, set to Wall for the resolved theme.
import { act } from 'react';

import { THEME_COLOR } from '../theme';
import { ThemeProvider, useTheme } from '../ThemeProvider';

import {
  cleanupMounted,
  click,
  mount,
  q,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

const DARK = '(prefers-color-scheme: dark)';
const LIGHT = '(prefers-color-scheme: light)';
const NIGHT_HEX = '#0E1A17';
const DAY_HEX = '#F3EFE4';

function Controls() {
  const t = useTheme();
  return (
    <div>
      {(['night', 'daylight', 'system'] as const).map((p) => (
        <button key={p} type="button" data-pref={p} onClick={() => t.setPreference(p)}>
          {p}
        </button>
      ))}
    </div>
  );
}
const pick = (p: string) => click(q(`[data-pref=${p}]`));
const metas = () =>
  Array.from(document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
const unscoped = () => metas().filter((m) => !m.hasAttribute('media'));
const layoutMetas = () => {
  for (const [media, color] of [
    [DARK, NIGHT_HEX],
    [LIGHT, DAY_HEX],
  ]) {
    const m = document.createElement('meta');
    m.setAttribute('name', 'theme-color');
    m.setAttribute('content', color);
    m.setAttribute('media', media);
    document.head.appendChild(m);
  }
};
const setup = () =>
  mount(
    <ThemeProvider>
      <Controls />
    </ThemeProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-theme-pref');
});
afterEach(() => {
  cleanupMounted();
  jest.restoreAllMocks();
});

describe('theme-color constants', () => {
  it('are the Wall colours: Night #0E1A17, Daylight #F3EFE4', () => {
    expect(THEME_COLOR).toEqual({ night: NIGHT_HEX, daylight: DAY_HEX });
  });
});

describe('ThemeProvider theme-color meta', () => {
  it('creates exactly one unscoped meta when there is none (system light = Daylight)', () => {
    stubMatchMedia({ [DARK]: false });
    setup();
    expect(metas()).toHaveLength(1);
    expect(unscoped()[0].getAttribute('content')).toBe(DAY_HEX);
  });

  it('system dark = Night', () => {
    stubMatchMedia({ [DARK]: true });
    setup();
    expect(unscoped()).toHaveLength(1);
    expect(unscoped()[0].getAttribute('content')).toBe(NIGHT_HEX);
  });

  it("is inserted before the layout's media-scoped metas, which are left alone", () => {
    stubMatchMedia({ [DARK]: false });
    layoutMetas();
    setup();
    const all = metas();
    expect(all).toHaveLength(3);
    expect(all[0].hasAttribute('media')).toBe(false);
    expect(all[0].getAttribute('content')).toBe(DAY_HEX);
    expect(all.slice(1).map((m) => [m.getAttribute('media'), m.getAttribute('content')])).toEqual([
      [DARK, NIGHT_HEX],
      [LIGHT, DAY_HEX],
    ]);
  });

  it('follows the toggle Night / Daylight / System, still one unscoped meta, still first', () => {
    stubMatchMedia({ [DARK]: true });
    layoutMetas();
    setup();
    const expectState = (hex: string) => {
      expect(unscoped()).toHaveLength(1);
      expect(unscoped()[0].getAttribute('content')).toBe(hex);
      expect(metas()[0]).toBe(unscoped()[0]);
      expect(metas()).toHaveLength(3);
    };
    expectState(NIGHT_HEX); // system dark
    pick('daylight');
    expectState(DAY_HEX); // pinned Daylight on a dark system
    pick('night');
    expectState(NIGHT_HEX);
    pick('system');
    expectState(NIGHT_HEX);
  });

  it('a system scheme change moves it only while the preference is System', () => {
    const mm = stubMatchMedia({ [DARK]: false });
    setup();
    expect(unscoped()[0].getAttribute('content')).toBe(DAY_HEX);
    mm.set(DARK, true);
    expect(unscoped()[0].getAttribute('content')).toBe(NIGHT_HEX);
    mm.set(DARK, false);
    expect(unscoped()[0].getAttribute('content')).toBe(DAY_HEX);
    pick('night');
    mm.set(DARK, false);
    mm.set(DARK, true);
    mm.set(DARK, false);
    expect(unscoped()[0].getAttribute('content')).toBe(NIGHT_HEX);
  });

  it('stored preference at load wins over the system', () => {
    localStorage.setItem('lawie-theme', 'night');
    stubMatchMedia({ [DARK]: false });
    setup();
    expect(unscoped()[0].getAttribute('content')).toBe(NIGHT_HEX);
  });

  it('collapses duplicate unscoped metas to one and reuses the first', () => {
    stubMatchMedia({ [DARK]: false });
    layoutMetas();
    for (const c of ['#111111', '#222222', '#333333']) {
      const m = document.createElement('meta');
      m.setAttribute('name', 'theme-color');
      m.setAttribute('content', c);
      document.head.appendChild(m);
    }
    setup();
    expect(unscoped()).toHaveLength(1);
    expect(unscoped()[0].getAttribute('content')).toBe(DAY_HEX);
    expect(metas()[0]).toBe(unscoped()[0]);
    expect(metas()).toHaveLength(3);
  });

  it('moves a trailing unscoped meta ahead of the scoped ones', () => {
    stubMatchMedia({ [DARK]: false });
    layoutMetas();
    const m = document.createElement('meta');
    m.setAttribute('name', 'theme-color');
    m.setAttribute('content', '#000000');
    document.head.appendChild(m);
    setup();
    expect(metas()[0]).toBe(m);
    expect(m.getAttribute('content')).toBe(DAY_HEX);
  });

  it('rapid toggling (30 flips) ends on the last choice with one meta', () => {
    stubMatchMedia({ [DARK]: false });
    layoutMetas();
    setup();
    const order = ['night', 'daylight', 'system'];
    for (let i = 0; i < 30; i += 1) pick(order[i % 3]);
    // last pick: i = 29 -> 'system' -> light -> Daylight
    expect(unscoped()).toHaveLength(1);
    expect(unscoped()[0].getAttribute('content')).toBe(DAY_HEX);
    pick('night');
    pick('night');
    expect(unscoped()[0].getAttribute('content')).toBe(NIGHT_HEX);
    expect(metas()).toHaveLength(3);
    expect(document.documentElement.getAttribute('data-theme')).toBe('night');
  });

  it('remounting does not duplicate the meta', () => {
    stubMatchMedia({ [DARK]: false });
    const a = setup();
    a.unmount();
    setup();
    expect(unscoped()).toHaveLength(1);
  });

  it('does not throw (and still sets data-theme) when document.head is missing', () => {
    stubMatchMedia({ [DARK]: false });
    const real = Object.getOwnPropertyDescriptor(Document.prototype, 'head')!;
    Object.defineProperty(document, 'head', { configurable: true, get: () => null });
    try {
      expect(() => setup()).not.toThrow();
      expect(document.documentElement.getAttribute('data-theme')).toBe('daylight');
    } finally {
      delete (document as unknown as Record<string, unknown>).head;
      Object.defineProperty(Document.prototype, 'head', real);
    }
  });

  it('does not throw when head.querySelectorAll throws (locked-down document)', () => {
    stubMatchMedia({ [DARK]: true });
    jest.spyOn(document.head, 'querySelectorAll').mockImplementation(() => {
      throw new Error('locked');
    });
    expect(() => setup()).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('night');
    act(() => undefined);
  });
});
