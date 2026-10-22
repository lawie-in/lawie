/**
 * T-528 round 2, login: no Wood in the referral group, the drawn consent checkbox (Control Line at
 * rest, Brass when checked, native under forced colours), the tablist rest rule on the Control
 * Line. break-ui: keyboard and label toggling, Google gate, aria kept, disabled while submitting.
 * jsdom has no layout and no native Space-to-click, so the Space and forced-colours behaviour is
 * asserted through the markup that delivers it (a plain native checkbox, the fallback class).
 */
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useRouter, useSearchParams } from 'next/navigation';

import LoginPage from '../page';

import { CONTROL_LINE } from '@/components/marketing/nl-link';

jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ login: jest.fn() }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
const flush = () => act(async () => void (await Promise.resolve()));
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const qa = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
const cls = (el: Element | null) => (el!.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

async function mount(query: string) {
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(query));
  (useRouter as jest.Mock).mockReturnValue({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<LoginPage />));
  await flush();
}
const google = () => qa('button').find((b) => /google/i.test(b.textContent ?? ''))!;

beforeEach(() => {
  window.sessionStorage.clear();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  jest.restoreAllMocks();
});

describe('T-528 round 2: referral group has no Wood', () => {
  it('the referral group is ruled by border-y on the folio ground, with no bg-nl-wood or full box', async () => {
    await mount('mode=signup');
    const box = q('#referral-code')!.closest('.border-y') as HTMLElement;
    expect(box).not.toBeNull();
    const c = cls(box);
    expect(c).toEqual(expect.arrayContaining(['border-y', 'border-nl-line', 'py-nl-4']));
    expect(c).not.toContain('bg-nl-wood');
    expect(c).not.toContain('border');
    expect(c).not.toContain('p-nl-4');
  });

  it.each(['mode=signup', 'mode=signin', 'mode=signup&ref=ABCD1234'])(
    '%s: no bg-nl-wood anywhere on the login page',
    async (m) => {
      await mount(m);
      expect(qa('.bg-nl-wood')).toHaveLength(0);
    },
  );

  it('the referral Apply button rests on the Control Line', async () => {
    await mount('mode=signup');
    const apply = qa('button').find((b) => b.textContent === 'Apply')!;
    expect(cls(apply)).toContain(CONTROL_LINE);
    expect(cls(apply)).not.toContain('border-nl-line');
  });
});

describe('T-528 round 2: tablist rest rule', () => {
  it.each(['mode=signup', 'mode=signin'])(
    '%s: the tablist underline uses CONTROL_LINE',
    async (m) => {
      await mount(m);
      const c = cls(q('[role="tablist"]'));
      expect(c).toEqual(expect.arrayContaining([CONTROL_LINE, 'border-b']));
      expect(c).not.toContain('border-nl-line');
    },
  );
});

describe('T-528 round 2: drawn consent checkbox', () => {
  const box = () => q<HTMLInputElement>('#consent')!;

  it('is still a real checkbox input, labelled, unticked, with the drawn classes', async () => {
    await mount('mode=signup');
    expect(box().tagName).toBe('INPUT');
    expect(box().type).toBe('checkbox');
    expect(box().checked).toBe(false);
    expect(q('label[for="consent"]')).not.toBeNull();
    const c = cls(box());
    expect(c).toEqual(
      expect.arrayContaining([
        'appearance-none',
        'forced-colors:appearance-auto',
        'checked:bg-nl-brass',
        'checked:border-nl-brass',
        'bg-nl-card',
        'rounded-nl-sm',
        'border',
        'peer',
        'nl-focus',
        CONTROL_LINE,
      ]),
    );
    expect(c).not.toContain('accent-nl-brass');
    expect(c).not.toContain('border-nl-line');
  });

  it('draws a decorative tick that shows only when checked, and is hidden under forced colours', async () => {
    await mount('mode=signup');
    const tick = box().nextElementSibling as SVGElement;
    expect(tick.tagName.toLowerCase()).toBe('svg');
    expect(tick.getAttribute('aria-hidden')).toBe('true');
    expect(tick.getAttribute('focusable')).toBe('false');
    const c = cls(tick);
    expect(c).toEqual(
      expect.arrayContaining([
        'hidden',
        'peer-checked:block',
        'forced-colors:hidden',
        'pointer-events-none',
        'text-nl-on-brass',
      ]),
    );
    expect(tick.querySelector('path')).not.toBeNull();
  });

  it('clicking the box and the label both toggle it', async () => {
    await mount('mode=signup');
    await act(async () => void box().click());
    expect(box().checked).toBe(true);
    await act(async () => void q<HTMLLabelElement>('label[for="consent"]')!.click());
    expect(box().checked).toBe(false);
  });

  it('keyboard: focusable by Tab order (no tabindex, not hidden), takes focus, native checkbox so Space toggles', async () => {
    await mount('mode=signup');
    expect(box().hasAttribute('tabindex')).toBe(false);
    expect(box().hasAttribute('hidden')).toBe(false);
    expect(box().getAttribute('role')).toBeNull();
    expect(box().disabled).toBe(false);
    expect(cls(box())).not.toContain('sr-only');
    expect(cls(box())).not.toContain('hidden');
    act(() => box().focus());
    expect(document.activeElement).toBe(box());
    // jsdom does not turn Space into a click; the browser does for a native checkbox. Emulate that
    // activation (what Space does) and confirm the React state follows.
    await act(async () => void box().click());
    expect(box().checked).toBe(true);
  });

  it('unticked: Google is blocked, the signed error shows, focus goes to the box, aria is set', async () => {
    await mount('mode=signup');
    await act(async () => void google().click());
    await flush();
    expect(q('#consent-error')).not.toBeNull();
    expect(document.activeElement).toBe(box());
    expect(box().getAttribute('aria-invalid')).toBe('true');
    expect(box().getAttribute('aria-describedby')).toBe('consent-error');
  });

  it('unticked: Create account is blocked with aria-invalid; ticking clears the error and the aria', async () => {
    const f = jest.fn();
    global.fetch = f as unknown as typeof fetch;
    await mount('mode=signup');
    await act(async () => void q<HTMLButtonElement>('button[type="submit"]')!.click());
    await flush();
    expect(f).not.toHaveBeenCalled();
    expect(box().getAttribute('aria-invalid')).toBe('true');
    expect(box().getAttribute('aria-describedby')).toBe('consent-error');
    await act(async () => void box().click());
    expect(q('#consent-error')).toBeNull();
    expect(box().hasAttribute('aria-invalid')).toBe(false);
    expect(box().hasAttribute('aria-describedby')).toBe(false);
  });

  it('Sign in has no consent box and no tick', async () => {
    await mount('mode=signin');
    expect(q('#consent')).toBeNull();
    expect(qa('svg.peer-checked\\:block')).toHaveLength(0);
  });
});
