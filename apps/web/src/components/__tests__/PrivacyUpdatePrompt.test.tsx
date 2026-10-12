/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
// T-343 — privacy re-acceptance prompt. Mounted with react-dom/client (no @testing-library/dom).
// The component keeps module-level state (so privacyFetch can open it), so every test loads a
// fresh copy of React and the component with jest.resetModules().

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Ajay's signed strings, typed out independently of the source constant.
// P1-P7: handoff/legal/T-343-privacy-reaccept-signed.md; P8, P9: its Addendum 1.
const SIGNED = {
  P1: 'We have updated our Privacy Policy',
  P3: 'Please read the updated policy. You need to accept it to create new drafts or make payments.',
  P4: 'Read the Privacy Policy',
  P5: 'Accept and continue',
  P6: 'Not now',
  P7: 'Accept the updated Privacy Policy to continue.',
  P8: 'Could not save your acceptance. Please try again.',
  P9: 'Privacy Policy accepted.',
};
const SUMMARY =
  'We now explain how Google Analytics works on our public pages, and that we keep the campaign link a new account came from.';

const mockLogin = jest.fn();
let mockUser: { id: string } | null = { id: 'u1' };
let mockLoading = false;
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, login: mockLogin, logout: jest.fn(), isLoading: mockLoading }),
}));

interface Call {
  path: string;
  method: string;
}
type Reply = { status?: number; body?: unknown; throws?: boolean };
type Handler = Reply | ((n: number) => Reply);

let calls: Call[];
let handlers: Record<string, Handler>;

function fakeResponse(status: number, body: unknown) {
  const make = (): any => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => JSON.parse(JSON.stringify(body)),
    clone: () => make(),
  });
  return make();
}

function installFetch() {
  calls = [];
  const counts: Record<string, number> = {};
  (global as any).fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    calls.push({ path, method: init.method ?? 'GET' });
    counts[path] = (counts[path] ?? 0) + 1;
    const h = handlers[path];
    const reply = typeof h === 'function' ? h(counts[path]) : h;
    if (!reply) return fakeResponse(404, {});
    if (reply.throws) throw new Error('network');
    return fakeResponse(reply.status ?? 200, reply.body ?? {});
  });
}

const ME_BEHIND = {
  body: {
    status: 'success',
    data: {
      privacyVersion: '2026-10-11',
      currentPrivacyVersion: '2026-10-12b',
      needsPrivacyAcceptance: true,
      summary: SUMMARY,
    },
  },
};
const ME_OK = {
  body: {
    status: 'success',
    data: {
      privacyVersion: '2026-10-12b',
      currentPrivacyVersion: '2026-10-12b',
      needsPrivacyAcceptance: false,
    },
  },
};
const BLOCKED = { status: 403, body: { error: 'privacy_reaccept_required' } };
const GEN = '/api/documents/generate';

let h: ReturnType<typeof load>;

function load() {
  jest.resetModules();
  const React = require('react');
  const { act } = React;
  const { createRoot } = require('react-dom/client');
  const mod = require('../PrivacyUpdatePrompt');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  function Harness(): any {
    const describedBy = mod.usePrivacyDescribedBy('gen');
    return React.createElement(
      'div',
      null,
      React.createElement('main', { id: 'dashboard-main', tabIndex: -1 }),
      React.createElement(mod.default),
      React.createElement(mod.PrivacyAcceptedStatus),
      React.createElement(mod.PrivacyBlockedNotice, { actionKey: 'gen' }),
      React.createElement(
        'button',
        {
          id: 'gen',
          'aria-describedby': describedBy,
          onClick: async () => {
            const res = await mod.privacyFetch('gen', GEN, { method: 'POST' });
            (globalThis as any).__lastRes = res;
            (globalThis as any).__lastBlocked = mod.isPrivacyBlocked(res);
          },
        },
        'Generate',
      ),
    );
  }

  const flush = () =>
    act(async () => {
      for (let i = 0; i < 12; i += 1) await Promise.resolve();
      // Radix returns focus in a setTimeout(0) when a dialog closes: let it run.
      await new Promise((r) => setTimeout(r, 0));
    });
  return {
    React,
    act,
    mod,
    container,
    root,
    Harness,
    flush,
    async mount() {
      await act(async () => root.render(React.createElement(Harness)));
      await flush();
    },
    async unmount() {
      await act(async () => root.unmount());
    },
    async click(el: Element) {
      await act(async () => {
        (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flush();
    },
    async esc() {
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      await flush();
    },
  };
}

const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
const btnIn = (root: ParentNode, label: string) =>
  Array.from(root.querySelectorAll('button')).find((b) => b.textContent === label) as
    | HTMLButtonElement
    | undefined;
const liveRegion = () => document.querySelector('[role="status"].sr-only') as HTMLElement;
const genBtn = () => document.getElementById('gen') as HTMLButtonElement;
const callsTo = (p: string) => calls.filter((c) => c.path === p).length;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  mockLogin.mockReset();
  mockUser = { id: 'u1' };
  mockLoading = false;
  handlers = { '/api/auth/me': ME_BEHIND };
  delete (globalThis as any).__lastRes;
  delete (globalThis as any).__lastBlocked;
  installFetch();
  h = load();
});
afterEach(async () => {
  await h.unmount();
  document.body.innerHTML = '';
});

describe('T-343 signed strings, byte for byte', () => {
  it('PRIVACY_PROMPT_STRINGS equals Ajay P1, P3-P9 (P2 comes from the server)', () => {
    expect({ ...h.mod.PRIVACY_PROMPT_STRINGS }).toEqual(SIGNED);
  });

  it('the dialog prints P1, the server summary as P2, P3, P4 and the two buttons', async () => {
    await h.mount();
    const d = dialog() as HTMLElement;
    expect(d).not.toBeNull();
    expect(d.querySelector('h2')?.textContent).toBe(SIGNED.P1);
    const paras = Array.from(d.querySelectorAll('p')).map((p) => p.textContent);
    expect(paras).toEqual([SUMMARY, SIGNED.P3]);
    const link = d.querySelector('a') as HTMLAnchorElement;
    expect(link.textContent).toBe(SIGNED.P4);
    expect(link.getAttribute('href')).toBe('/privacy');
    expect(link.getAttribute('target')).toBeNull(); // same tab (Addendum 1)
    expect(Array.from(d.querySelectorAll('button')).map((b) => b.textContent)).toEqual([
      SIGNED.P6,
      SIGNED.P5,
    ]);
  });

  it('Not now and Accept have the same class string, in the DOM order Not now, Accept', async () => {
    await h.mount();
    const d = dialog() as HTMLElement;
    const [notNow, accept] = Array.from(d.querySelectorAll('button'));
    expect(notNow.className).toBe(accept.className);
    expect(notNow.className).not.toMatch(/bg-brand-(gold|navy)(?!\/)\b/);
    expect(notNow.compareDocumentPosition(accept) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(d.querySelectorAll('.sm\\:grid-cols-2').length).toBe(1);
  });

  it('focus starts on the title, not on a button', async () => {
    await h.mount();
    expect(document.activeElement).toBe(dialog()?.querySelector('h2'));
  });
});

describe('T-343 AC1 — when the prompt shows', () => {
  it('shows when /me says needsPrivacyAcceptance with a summary', async () => {
    await h.mount();
    expect(dialog()).not.toBeNull();
    expect(callsTo('/api/auth/me')).toBe(1);
  });

  it('shows nothing when /me says the user is current', async () => {
    handlers['/api/auth/me'] = ME_OK;
    await h.mount();
    expect(dialog()).toBeNull();
  });

  it.each([
    ['500', { status: 500, body: {} }],
    ['503', { status: 503, body: {} }],
    ['a network error', { throws: true }],
    ['a malformed body', { body: { nonsense: true } }],
  ])('shows nothing when /me fails (%s)', async (_l, reply) => {
    handlers['/api/auth/me'] = reply as Reply;
    await h.mount();
    expect(dialog()).toBeNull();
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['whitespace', '   '],
  ])(
    'shows nothing when the server says show but the summary is %s (no generic text)',
    async (_l, summary) => {
      handlers['/api/auth/me'] = {
        body: {
          data: {
            currentPrivacyVersion: '2026-10-12b',
            needsPrivacyAcceptance: true,
            ...(summary === undefined ? {} : { summary }),
          },
        },
      };
      await h.mount();
      expect(dialog()).toBeNull();
      expect(document.body.textContent).not.toContain(SIGNED.P1);
    },
  );

  it('shows nothing when signed out and does not call /me', async () => {
    mockUser = null;
    await h.mount();
    expect(dialog()).toBeNull();
    expect(callsTo('/api/auth/me')).toBe(0);
  });

  it('shows once per sign-in: a remount (page move, reload) does not show it again', async () => {
    await h.mount();
    await h.click(btnIn(dialog() as HTMLElement, SIGNED.P6) as HTMLElement);
    expect(dialog()).toBeNull();
    await h.unmount();
    h = load();
    await h.mount();
    expect(dialog()).toBeNull();
  });

  it('shows again after a sign-out and a new sign-in', async () => {
    await h.mount();
    await h.click(btnIn(dialog() as HTMLElement, SIGNED.P6) as HTMLElement);
    await h.unmount();
    h = load();
    mockUser = null; // signed out: the flag is cleared
    await h.mount();
    await h.unmount();
    h = load();
    mockUser = { id: 'u1' };
    await h.mount();
    expect(dialog()).not.toBeNull();
  });
});

describe('T-343 round 5 — focus, reload and precheck', () => {
  const SHOWN = 'lawie_privacy_prompt_shown:u1:2026-10-12b';

  it('after Not now, focus is on #dashboard-main and no element has id="main"', async () => {
    await h.mount();
    await h.click(btnIn(dialog() as HTMLElement, SIGNED.P6) as HTMLElement);
    expect(document.activeElement?.id).toBe('dashboard-main');
    expect(document.querySelectorAll('[id="main"]')).toHaveLength(0);
  });

  it('after Esc, focus is on #dashboard-main', async () => {
    await h.mount();
    await h.esc();
    expect(document.activeElement?.id).toBe('dashboard-main');
  });

  it('falls back to the page <main> when there is no #dashboard-main', async () => {
    await h.mount();
    document.getElementById('dashboard-main')?.removeAttribute('id');
    await h.esc();
    expect(document.activeElement).toBe(document.querySelector('main'));
  });

  it('a reload (user present, auth still loading) does not clear the shown flag', async () => {
    sessionStorage.setItem(SHOWN, '1');
    mockLoading = true;
    await h.mount();
    expect(sessionStorage.getItem(SHOWN)).toBe('1');
  });

  it('a reload (no user yet, auth still loading) does not clear the shown flag', async () => {
    sessionStorage.setItem(SHOWN, '1');
    mockUser = null;
    mockLoading = true;
    await h.mount();
    expect(sessionStorage.getItem(SHOWN)).toBe('1');
  });

  it('Not now then reload shows no prompt', async () => {
    await h.mount();
    await h.click(btnIn(dialog() as HTMLElement, SIGNED.P6) as HTMLElement);
    await h.unmount();
    h = load();
    mockLoading = true;
    mockUser = null; // AuthProvider is reading the token
    await h.mount();
    await h.unmount();
    h = load();
    mockLoading = false;
    mockUser = { id: 'u1' };
    await h.mount();
    expect(dialog()).toBeNull();
  });

  it('flags are cleared once loading is done and nobody is signed in', async () => {
    sessionStorage.setItem(SHOWN, '1');
    mockUser = null;
    mockLoading = false;
    await h.mount();
    expect(sessionStorage.getItem(SHOWN)).toBeNull();
  });

  it('privacyPrecheck opens the prompt and returns true when behind with a summary', async () => {
    handlers['/api/auth/me'] = ME_OK;
    await h.mount();
    expect(dialog()).toBeNull();
    handlers['/api/auth/me'] = ME_BEHIND;
    let result: boolean | undefined;
    await h.act(async () => {
      result = await h.mod.privacyPrecheck('gen');
    });
    await h.flush();
    expect(result).toBe(true);
    expect(dialog()).not.toBeNull();
    expect(dialog()?.textContent).toContain(SUMMARY);
    expect(callsTo(GEN)).toBe(0);
  });

  it('privacyPrecheck returns focus to the pressed button after Not now', async () => {
    handlers['/api/auth/me'] = ME_OK;
    await h.mount();
    handlers['/api/auth/me'] = ME_BEHIND;
    genBtn().focus();
    await h.act(async () => {
      await h.mod.privacyPrecheck('gen');
    });
    await h.flush();
    await h.click(btnIn(dialog() as HTMLElement, SIGNED.P6) as HTMLElement);
    expect(document.activeElement).toBe(genBtn());
  });

  it('privacyPrecheck returns false and opens nothing when the user is current', async () => {
    handlers['/api/auth/me'] = ME_OK;
    await h.mount();
    let result: boolean | undefined;
    await h.act(async () => {
      result = await h.mod.privacyPrecheck('gen');
    });
    expect(result).toBe(false);
    expect(dialog()).toBeNull();
  });

  it('privacyPrecheck returns false when /me errors (fail open)', async () => {
    handlers['/api/auth/me'] = ME_OK;
    await h.mount();
    for (const reply of [{ status: 500, body: {} }, { throws: true }] as Reply[]) {
      handlers['/api/auth/me'] = reply;
      let result: boolean | undefined;
      await h.act(async () => {
        result = await h.mod.privacyPrecheck('gen');
      });
      expect(result).toBe(false);
      expect(dialog()).toBeNull();
    }
  });

  it('privacyPrecheck returns false when behind but there is no usable summary', async () => {
    handlers['/api/auth/me'] = ME_OK;
    await h.mount();
    handlers['/api/auth/me'] = {
      body: {
        data: { currentPrivacyVersion: '2026-10-12b', needsPrivacyAcceptance: true, summary: ' ' },
      },
    };
    let result: boolean | undefined;
    await h.act(async () => {
      result = await h.mod.privacyPrecheck('gen');
    });
    expect(result).toBe(false);
    expect(dialog()).toBeNull();
  });
});

describe('T-343 — Not now and Esc', () => {
  it('Not now closes it, records nothing, signs nobody out and focuses #dashboard-main', async () => {
    await h.mount();
    await h.click(btnIn(dialog() as HTMLElement, SIGNED.P6) as HTMLElement);
    expect(dialog()).toBeNull();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    expect(callsTo('/api/auth/refresh')).toBe(0);
    expect(mockLogin).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.getElementById('dashboard-main'));
  });

  it('Esc closes it the same way', async () => {
    await h.mount();
    await h.esc();
    expect(dialog()).toBeNull();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('a click on the overlay does nothing', async () => {
    await h.mount();
    const overlay = document.querySelector('.fixed.inset-0') as HTMLElement;
    expect(overlay).not.toBeNull();
    await h.act(async () => {
      overlay.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(dialog()).not.toBeNull();
  });

  it('there is no close "x" and no sign-out button in the dialog', async () => {
    await h.mount();
    expect(dialog()?.querySelectorAll('button')).toHaveLength(2);
  });
});

describe('T-343 AC2 — Accept', () => {
  const ACCEPT = '/api/auth/me/privacy-acceptance';

  it('POSTs, saves the rotated tokens, closes, and announces P9 in the polite region', async () => {
    handlers[ACCEPT] = {
      body: { status: 'success', data: { accessToken: 'A2', refreshToken: 'R2' } },
    };
    await h.mount();
    expect(liveRegion().textContent).toBe('');
    expect(liveRegion().getAttribute('aria-live')).toBe('polite');
    await h.click(btnIn(dialog() as HTMLElement, SIGNED.P5) as HTMLElement);
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([ACCEPT]);
    expect(mockLogin).toHaveBeenCalledWith('A2', 'R2');
    expect(dialog()).toBeNull();
    expect(liveRegion().textContent).toBe(SIGNED.P9);
  });

  it('does not run the blocked action by itself after Accept', async () => {
    handlers[ACCEPT] = { body: { data: { accessToken: 'A2', refreshToken: 'R2' } } };
    await h.mount();
    await h.click(btnIn(dialog() as HTMLElement, SIGNED.P5) as HTMLElement);
    expect(callsTo(GEN)).toBe(0);
  });

  it.each([
    ['a 500', { status: 500, body: {} }],
    ['a network error', { throws: true }],
    ['a body with no tokens', { body: { data: {} } }],
  ])('shows P8 as an alert and stays open on %s; no tokens saved, no P9', async (_l, reply) => {
    handlers[ACCEPT] = reply as Reply;
    await h.mount();
    await h.click(btnIn(dialog() as HTMLElement, SIGNED.P5) as HTMLElement);
    expect(dialog()).not.toBeNull();
    const alert = dialog()?.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(SIGNED.P8);
    expect(mockLogin).not.toHaveBeenCalled();
    expect(liveRegion().textContent).toBe('');
    // Both buttons are usable again, and a retry that works closes it.
    expect(btnIn(dialog() as HTMLElement, SIGNED.P5)?.getAttribute('aria-disabled')).toBeNull();
    handlers[ACCEPT] = { body: { data: { accessToken: 'A3', refreshToken: 'R3' } } };
    await h.click(btnIn(dialog() as HTMLElement, SIGNED.P5) as HTMLElement);
    expect(dialog()).toBeNull();
    expect(mockLogin).toHaveBeenCalledWith('A3', 'R3');
  });

  it('while saving: both buttons are aria-disabled and a second press does not POST again', async () => {
    let release: (v: unknown) => void = () => undefined;
    (global as any).fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
      const path = String(url).replace(/^https?:\/\/[^/]+/, '');
      calls.push({ path, method: init.method ?? 'GET' });
      if (path === ACCEPT) await new Promise((r) => (release = r));
      return path === ACCEPT
        ? fakeResponse(200, { data: { accessToken: 'A', refreshToken: 'R' } })
        : fakeResponse(200, ME_BEHIND.body);
    });
    await h.mount();
    const accept = btnIn(dialog() as HTMLElement, SIGNED.P5) as HTMLButtonElement;
    await h.click(accept);
    await h.click(accept);
    expect(calls.filter((c) => c.path === ACCEPT)).toHaveLength(1);
    expect(dialog()?.getAttribute('aria-busy')).toBe('true');
    for (const b of Array.from(dialog()?.querySelectorAll('button') ?? [])) {
      expect(b.getAttribute('aria-disabled')).toBe('true');
    }
    await h.esc(); // Esc is ignored mid-request
    expect(dialog()).not.toBeNull();
    await h.act(async () => release(undefined));
    await h.flush();
    expect(dialog()).toBeNull();
  });
});

describe('T-343 — privacyFetch on a blocked action', () => {
  it('passes a normal response straight through with no /me call', async () => {
    handlers['/api/auth/me'] = ME_OK;
    handlers[GEN] = { status: 200, body: { ok: true } };
    await h.mount();
    genBtn().focus();
    await h.click(genBtn());
    expect(callsTo(GEN)).toBe(1);
    expect(callsTo('/api/auth/me')).toBe(1); // the mount-time check only
    expect((globalThis as any).__lastBlocked).toBe(false);
  });

  it('a 403 that is not a privacy block is returned untouched', async () => {
    handlers['/api/auth/me'] = ME_OK;
    handlers[GEN] = { status: 403, body: { error: 'forbidden' } };
    await h.mount();
    genBtn().focus();
    await h.click(genBtn());
    expect(callsTo('/api/auth/me')).toBe(1);
    expect((globalThis as any).__lastBlocked).toBe(false);
    expect(dialog()).toBeNull();
  });

  it('403, then /me says not behind: one refresh, one retry, no prompt, no loop', async () => {
    handlers['/api/auth/me'] = ME_OK;
    localStorage.setItem('lawie_refresh_token', 'R1');
    handlers['/api/auth/refresh'] = { body: { data: { accessToken: 'A2', refreshToken: 'R2' } } };
    handlers[GEN] = (n) => (n === 1 ? BLOCKED : { status: 200, body: { id: 'doc1' } });
    await h.mount();
    genBtn().focus();
    await h.click(genBtn());
    expect(callsTo(GEN)).toBe(2);
    expect(callsTo('/api/auth/refresh')).toBe(1);
    expect(callsTo('/api/auth/me')).toBe(2); // mount + after the 403
    expect((globalThis as any).__lastRes.status).toBe(200);
    expect((globalThis as any).__lastBlocked).toBe(false);
    expect(dialog()).toBeNull();
    expect(document.getElementById('gen')?.getAttribute('aria-describedby')).toBeNull();
  });

  it('403, retry 403 again: stops after one retry (never loops) and shows the P7 box', async () => {
    handlers['/api/auth/me'] = ME_OK;
    localStorage.setItem('lawie_refresh_token', 'R1');
    handlers['/api/auth/refresh'] = { body: { data: { accessToken: 'A2', refreshToken: 'R2' } } };
    handlers[GEN] = BLOCKED;
    await h.mount();
    genBtn().focus();
    await h.click(genBtn());
    expect(callsTo(GEN)).toBe(2);
    expect(callsTo('/api/auth/refresh')).toBe(1);
    expect((globalThis as any).__lastBlocked).toBe(true);
    expect(document.body.textContent).toContain(SIGNED.P7);
  });

  it('403, then /me says behind: opens the prompt, no refresh, no retry', async () => {
    // Mount-time check already shown and dismissed, so the second /me opens it again (Ajay §3).
    handlers[GEN] = BLOCKED;
    await h.mount();
    await h.click(btnIn(dialog() as HTMLElement, SIGNED.P6) as HTMLElement);
    expect(dialog()).toBeNull();
    genBtn().focus();
    await h.click(genBtn());
    expect(dialog()).not.toBeNull();
    expect(callsTo(GEN)).toBe(1);
    expect(callsTo('/api/auth/refresh')).toBe(0);
    expect((globalThis as any).__lastBlocked).toBe(true);
  });

  it('after Not now on that prompt: the P7 box shows with P4 and its own Accept, and the button points at it', async () => {
    handlers[GEN] = BLOCKED;
    await h.mount();
    await h.click(btnIn(dialog() as HTMLElement, SIGNED.P6) as HTMLElement);
    genBtn().focus();
    await h.click(genBtn());
    await h.click(btnIn(dialog() as HTMLElement, SIGNED.P6) as HTMLElement);
    expect(dialog()).toBeNull();
    const p7 = document.getElementById('reaccept-p7-gen') as HTMLElement;
    expect(p7.textContent).toBe(SIGNED.P7);
    const box = p7.parentElement as HTMLElement;
    expect(box.querySelector('a')?.textContent).toBe(SIGNED.P4);
    expect(box.querySelector('a')?.getAttribute('href')).toBe('/privacy');
    const boxAccept = btnIn(box, SIGNED.P5) as HTMLButtonElement;
    expect(boxAccept).toBeDefined();
    expect(btnIn(box, SIGNED.P6)).toBeUndefined(); // the box has no Not now
    expect(genBtn().getAttribute('aria-describedby')).toBe('reaccept-p7-gen');
    expect(genBtn().disabled).toBe(false); // blocked actions stay enabled
    expect(document.activeElement).toBe(genBtn());

    // Pressing the blocked action again reopens the prompt.
    await h.click(genBtn());
    expect(dialog()).not.toBeNull();
  });

  it('Accept in the P7 box: saves, removes every box, announces P9, focuses the action', async () => {
    handlers[GEN] = BLOCKED;
    handlers['/api/auth/me/privacy-acceptance'] = {
      body: { data: { accessToken: 'A2', refreshToken: 'R2' } },
    };
    await h.mount();
    await h.click(btnIn(dialog() as HTMLElement, SIGNED.P6) as HTMLElement);
    genBtn().focus();
    await h.click(genBtn());
    await h.click(btnIn(dialog() as HTMLElement, SIGNED.P6) as HTMLElement);
    const box = (document.getElementById('reaccept-p7-gen') as HTMLElement)
      .parentElement as HTMLElement;
    await h.click(btnIn(box, SIGNED.P5) as HTMLElement);
    expect(mockLogin).toHaveBeenCalledWith('A2', 'R2');
    expect(document.getElementById('reaccept-p7-gen')).toBeNull();
    expect(liveRegion().textContent).toBe(SIGNED.P9);
    expect(document.activeElement).toBe(genBtn());
  });

  it('a failed Accept in the P7 box shows P8 inside the box', async () => {
    handlers[GEN] = BLOCKED;
    handlers['/api/auth/me/privacy-acceptance'] = { status: 500, body: {} };
    await h.mount();
    await h.click(btnIn(dialog() as HTMLElement, SIGNED.P6) as HTMLElement);
    genBtn().focus();
    await h.click(genBtn());
    await h.click(btnIn(dialog() as HTMLElement, SIGNED.P6) as HTMLElement);
    const box = (document.getElementById('reaccept-p7-gen') as HTMLElement)
      .parentElement as HTMLElement;
    await h.click(btnIn(box, SIGNED.P5) as HTMLElement);
    expect(box.querySelector('[role="alert"]')?.textContent).toBe(SIGNED.P8);
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('403 when /me fails: no dialog can show, so the P7 box is the way forward (never generic text)', async () => {
    handlers['/api/auth/me'] = { status: 500, body: {} };
    handlers[GEN] = BLOCKED;
    await h.mount();
    genBtn().focus();
    await h.click(genBtn());
    expect(dialog()).toBeNull();
    expect(callsTo(GEN)).toBe(1);
    expect(document.body.textContent).toContain(SIGNED.P7);
  });

  it('403, /me not behind, but the refresh fails: no retry, P7 box', async () => {
    handlers['/api/auth/me'] = ME_OK;
    handlers['/api/auth/refresh'] = { status: 500, body: {} };
    localStorage.setItem('lawie_refresh_token', 'R1');
    handlers[GEN] = BLOCKED;
    await h.mount();
    genBtn().focus();
    await h.click(genBtn());
    expect(callsTo(GEN)).toBe(1);
    expect((globalThis as any).__lastBlocked).toBe(true);
  });
});
