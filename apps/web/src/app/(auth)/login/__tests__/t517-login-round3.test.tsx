/**
 * T-517 round 3 (AC1, AC4, AC5): the sign-up / login folio uses underline fields (DESIGN.md
 * Inputs), a 1px brass top hairline, Label-style Brass Text labels; the referral box stays boxed.
 * break-ui on the underline fields: limits, error state, narrow container.
 */
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useRouter, useSearchParams } from 'next/navigation';

import LoginPage from '../page';

jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ login: jest.fn() }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
const flush = () => act(async () => void (await Promise.resolve()));
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const qa = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
const cls = (sel: string) => (q(sel)!.className as string).split(/\s+/);

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
function setInput(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const submit = async () => {
  await act(async () => void q<HTMLButtonElement>('button[type="submit"]')!.click());
  await flush();
};

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

describe('folio: top hairline (round 3, MUST b)', () => {
  it.each(['mode=signup', 'mode=signin'])('%s: the folio has a 1px brass top border', async (m) => {
    await mount(m);
    const folio = q('#auth-panel')!.closest('.max-w-md') as HTMLElement;
    const c = folio.className.split(/\s+/);
    expect(c).toContain('border-t-nl-brass');
    expect(c).toContain('border'); // 1px on all sides
    expect(c).toContain('border-t');
    expect(c).not.toContain('border-t-2');
    expect(c).toContain('shadow-nl-card'); // the folio keeps the shadow
  });
});

describe('folio: underline inputs (round 3, MUST a)', () => {
  it.each(['#name', '#email', '#password'])('signup %s is underline style', async (id) => {
    await mount('mode=signup');
    const c = cls(id);
    expect(c).toEqual(expect.arrayContaining(['border-0', 'border-b', 'rounded-none', 'px-0']));
    expect(c).toContain('bg-transparent');
    expect(c).toContain('border-nl-line');
    expect(c).toContain('focus:border-nl-brass');
    expect(c).toContain('focus:border-b-2');
    expect(c).toContain('focus:pb-[7px]'); // the extra pixel comes out of the padding
    expect(c).not.toContain('rounded-nl-md');
    expect(c).not.toContain('bg-nl-card');
    expect(c).not.toContain('px-nl-3');
  });

  it.each(['#email', '#password'])('signin %s is underline style', async (id) => {
    await mount('mode=signin');
    const c = cls(id);
    expect(c).toEqual(expect.arrayContaining(['border-0', 'border-b', 'rounded-none']));
    expect(c).not.toContain('rounded-nl-md');
  });

  it('the referral input stays boxed', async () => {
    await mount('mode=signup&ref=ABCD1234');
    const c = cls('#referral-code');
    expect(c).toEqual(expect.arrayContaining(['rounded-nl-md', 'border', 'border-nl-line']));
    expect(c).toContain('bg-nl-card');
    expect(c).not.toContain('border-b');
    expect(c).not.toContain('rounded-none');
  });

  it('error state: empty submit gives the err bottom border, not the line one', async () => {
    await mount('mode=signup');
    await submit();
    for (const id of ['#name', '#email', '#password']) {
      const c = cls(id);
      expect(c).toContain('border-nl-err');
      expect(c).not.toContain('border-nl-line');
      expect(c).not.toContain('focus:border-nl-brass');
      expect(c).toContain('border-b');
      expect(q(id)!.getAttribute('aria-invalid')).toBe('true');
    }
  });

  it('error clears back to the line colour once the value is fixed', async () => {
    await mount('mode=signin');
    await submit();
    expect(cls('#email')).toContain('border-nl-err');
    await act(async () => setInput(q<HTMLInputElement>('#email')!, 'a@example.com'));
    await submit();
    expect(cls('#email')).toContain('border-nl-line');
    expect(cls('#email')).not.toContain('border-nl-err');
  });
});

describe('folio: labels in Label style, Brass Text (round 3)', () => {
  it.each([
    ['mode=signup', ['name', 'email', 'password']],
    ['mode=signin', ['email', 'password']],
  ])('%s: field labels use nl-label and text-nl-brass-dark', async (m, ids) => {
    await mount(m);
    for (const id of ids) {
      const label = q(`label[for="${id}"]`)!;
      const c = label.className.split(/\s+/);
      expect(c).toContain('nl-label');
      expect(c).toContain('text-nl-brass-dark');
      expect(c).not.toContain('text-nl-soft');
      expect(c).not.toContain('nl-body-sm');
    }
  });
});

describe('break-ui on the underline fields', () => {
  it('120-character name is blocked by maxLength 100; the 254 email limit holds', async () => {
    await mount('mode=signup');
    expect(q<HTMLInputElement>('#name')!.maxLength).toBe(100);
    expect(q<HTMLInputElement>('#email')!.maxLength).toBe(254);
    // The field is full width with no side padding: a long value scrolls inside, never widens it.
    for (const id of ['#name', '#email', '#password']) {
      expect(cls(id)).toContain('w-full');
      expect(cls(id)).toContain('block');
    }
  });

  it('the long-value fields keep a 48px minimum height and no fixed width', async () => {
    await mount('mode=signup');
    for (const id of ['#name', '#email', '#password']) {
      expect(cls(id)).toContain('min-h-[48px]');
      expect(cls(id).some((c) => /^w-\[\d+px\]$/.test(c))).toBe(false);
    }
  });

  it('narrow container: folio is w-full max-w-md and clips; the page clips horizontal overflow', async () => {
    await mount('mode=signup');
    const folio = q('#auth-panel')!.closest('.max-w-md') as HTMLElement;
    expect(folio.className).toContain('w-full');
    expect(folio.className).toContain('overflow-hidden');
    expect(q('.nl-root')!.className).toContain('overflow-x-clip');
    expect(qa('input').every((i) => !i.className.includes('min-w-[3'))).toBe(true);
  });

  it('Hindi is not applicable: auth has no language switch', async () => {
    await mount('mode=signup');
    expect(qa('[lang="hi"]')).toHaveLength(0);
  });
});
