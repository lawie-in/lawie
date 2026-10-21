/**
 * T-528: login folio is 440px; the primary buttons (submit, referral Continue) carry the shared
 * primary hover (halo + 1px lift, enabled only, fine pointer, reduced-motion reset); the Google
 * button, a non-primary, has no halo.
 */
import * as fs from 'fs';
import * as path from 'path';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useRouter, useSearchParams } from 'next/navigation';

import LoginPage from '../page';

import {
  CONTROL_LINE,
  NL_GHOST_HOVER,
  NL_PRIMARY_BUTTON_HOVER,
  nlLinkButton,
} from '@/components/marketing/nl-link';

jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ login: jest.fn() }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
const flush = () => act(async () => void (await Promise.resolve()));
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null;
const qa = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
const cls = (el: Element | null) => (el!.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
const HOVER = NL_PRIMARY_BUTTON_HOVER.split(' ');

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

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
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

describe('T-528 hover constant', () => {
  it('NL_PRIMARY_BUTTON_HOVER is gated to hover-capable fine pointers, enabled-only, with a reduced-motion reset', () => {
    expect(HOVER).toHaveLength(3);
    for (const c of HOVER) {
      expect(c).toContain('[@media(hover:hover)_and_(pointer:fine)]');
      expect(c).toContain(':enabled:hover:');
    }
    expect(HOVER.some((c) => c.endsWith('hover:shadow-nl-halo'))).toBe(true);
    expect(HOVER.some((c) => c.endsWith('hover:-translate-y-px'))).toBe(true);
    expect(
      HOVER.some((c) => c.startsWith('motion-reduce:') && c.endsWith('hover:translate-y-0')),
    ).toBe(true);
  });
});

describe('T-528 login', () => {
  it.each(['mode=signin', 'mode=signup'])(
    '%s: the folio is max-w-[440px] and no longer max-w-md',
    async (m) => {
      await mount(m);
      const folio = q('#auth-panel')!.closest('.max-w-\\[440px\\]') as HTMLElement;
      expect(folio).not.toBeNull();
      expect(cls(folio)).toEqual(expect.arrayContaining(['w-full', 'overflow-hidden']));
      expect(cls(folio)).not.toContain('max-w-md');
      expect(q('.max-w-md')).toBeNull();
    },
  );

  it.each(['mode=signin', 'mode=signup'])(
    '%s: the submit button carries every primary-hover class',
    async (m) => {
      await mount(m);
      const submit = q('button[type="submit"]')!;
      expect(cls(submit)).toEqual(expect.arrayContaining(HOVER));
      // The old unconditional halo (no `enabled:`) is gone, so a disabled button never glows.
      expect(
        cls(submit).filter((c) => c.endsWith('hover:shadow-nl-halo') && !c.includes(':enabled:')),
      ).toEqual([]);
    },
  );

  it('the Google button is not a primary: no halo, no lift', async () => {
    await mount('mode=signin');
    const google = qa('button').find((b) => /google/i.test(b.textContent ?? ''))!;
    expect(google).toBeDefined();
    expect(google.className).not.toContain('shadow-nl-halo');
    expect(google.className).not.toContain('translate-y');
  });

  it('the referral Continue button carries every primary-hover class', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        data: { accessToken: 'a', refreshToken: 'r', referralApplied: false, user: {} },
      }),
    }) as unknown as typeof fetch;
    await mount('mode=signup&ref=abc12');
    const form = q<HTMLFormElement>('form')!;
    await act(async () => {
      for (const input of Array.from(form.querySelectorAll('input'))) {
        if (input.id === 'referral-code') continue;
        if (input.type === 'email') setInput(input, 'new.person@example.com');
        else if (input.type === 'password') setInput(input, 'Passw0rdOk');
        else if (input.type === 'text') setInput(input, 'New Person');
        else if (input.type === 'checkbox' && !input.checked) input.click();
      }
    });
    await act(async () => {
      form.requestSubmit();
    });
    await flush();
    const cont = qa('button').find((b) => b.textContent === 'Continue');
    expect(cont).toBeDefined();
    expect(cls(cont!)).toEqual(expect.arrayContaining(HOVER));
    expect(cls(cont!)).toContain('touch-manipulation');
  });

  it('source: the Google button line has no shadow-nl-halo', () => {
    const src = fs.readFileSync(path.join(__dirname, '../page.tsx'), 'utf8');
    const googleBlock = src.slice(
      src.indexOf('handleGoogleLogin()}'),
      src.indexOf('<GoogleIcon />'),
    );
    expect(googleBlock).not.toContain('shadow-nl-halo');
  });
});

describe('T-528 non-primary hover: ghost and Google, no lift, no halo', () => {
  const GHOST = NL_GHOST_HOVER.split(' ').filter(Boolean);
  const gated = '[@media(hover:hover)_and_(pointer:fine)]';

  it('NL_GHOST_HOVER: border to Brass, ground to Brass Soft, gated, colour fade kept under reduced motion, no lift or halo', () => {
    expect(NL_GHOST_HOVER).toContain(`${gated}:[&:not(:disabled)]:hover:border-nl-brass`);
    expect(NL_GHOST_HOVER).toContain(`${gated}:[&:not(:disabled)]:hover:bg-nl-brass-light`);
    expect(GHOST).not.toContain('motion-reduce:transition-none');
    expect(GHOST).toContain('duration-150');
    expect(GHOST).toContain('ease-[ease]');
    expect(NL_GHOST_HOVER).toMatch(/transition-property:[^\]]*border-color[^\]]*background-color/);
    expect(NL_GHOST_HOVER).not.toMatch(/translate|shadow-nl-halo/);
  });

  it('nlLinkButton: ghost has the ghost hover and no lift or halo; primary keeps halo and lift', () => {
    const ghost = nlLinkButton('ghost');
    for (const c of GHOST) expect(ghost.split(/\s+/)).toContain(c);
    expect(ghost).not.toMatch(/translate|shadow-nl-halo/);
    expect(ghost).toContain(CONTROL_LINE);
    const primary = nlLinkButton('primary');
    expect(primary).toContain(`${gated}:hover:shadow-nl-halo`);
    expect(primary).toContain(`${gated}:hover:-translate-y-px`);
    expect(primary).toContain('motion-reduce:');
    expect(primary).not.toContain('hover:border-nl-brass');
  });

  it('the Google button carries the ghost hover and has no translate or halo', async () => {
    await mount('mode=signin');
    const google = qa('button').find((b) => /google/i.test(b.textContent ?? ''))!;
    expect(cls(google)).toEqual(expect.arrayContaining(GHOST));
    expect(cls(google)).toContain(CONTROL_LINE);
    expect(google.className).not.toMatch(/translate|shadow-nl-halo/);
  });

  it('the submit button still has the halo and lift and no ghost border hover', async () => {
    await mount('mode=signin');
    const submit = q('button[type="submit"]')!;
    expect(cls(submit)).toEqual(expect.arrayContaining(HOVER));
    expect(submit.className).not.toContain('hover:border-nl-brass');
  });
});
