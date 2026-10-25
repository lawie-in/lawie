import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import ConfirmCloseAccountDialog, {
  CLOSE_DIALOG_TEXT,
} from '@/components/account/ConfirmCloseAccountDialog';
import { apiFetch } from '@/lib/apiFetch';
import { clearAllLocalState } from '@/lib/auth';

// T-115c — the close-account dialog. Strings are Ajay's / Madhuri's, byte-exact below (not read
// back from the component's own constant, so a reworded constant fails here).
jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('@/lib/auth', () => ({ clearAllLocalState: jest.fn() }));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMock = apiFetch as jest.Mock;
const clearMock = clearAllLocalState as jest.Mock;

const T = {
  title: 'Close your account and erase your data?',
  body: 'This erases your account, your profile and every document you have created on Lawie. Any unused Ink and any active plan end now and are not refunded. We keep payment and invoice records for as long as tax law requires. You cannot undo this.',
  backups: 'Backup copies are erased within 7 days.',
  confirm: 'Close account and erase',
  cancel: 'Cancel',
  working: 'Closing...',
  workingStatus: 'Closing your account. Please wait.',
  wrongPassword: 'That password is not right. Nothing was changed.',
  wrongEmail: 'That email address does not match. Nothing was changed.',
  planActive: 'Cancel your plan first.',
  planActiveHow: 'Write to contact@lawie.in to cancel.',
  generic: 'We could not close your account. Try again.',
  signInAgain: 'Sign in again, then try once more.',
  partial:
    "We couldn't finish erasing your data. Your account is closed and you have been signed out. We will finish erasing it; if you have any questions, write to us at contact@lawie.in.",
};

let container: HTMLDivElement;
let root: Root;
let onClose: jest.Mock;
let replace: jest.Mock;
const realLocation = window.location;

const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });

interface Handlers {
  me?: { ok: boolean; hasPassword?: unknown } | 'throw';
  del?: { status: number; body?: unknown } | 'throw' | 'pending';
}
let resolveDelete: ((v: unknown) => void) | null;

function wire({ me = { ok: true, hasPassword: true }, del = { status: 200 } }: Handlers = {}) {
  resolveDelete = null;
  apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      if (del === 'throw') throw new Error('network');
      if (del === 'pending') return new Promise((r) => (resolveDelete = r));
      return {
        status: del.status,
        ok: del.status === 200,
        json: async () => {
          if (del.body === undefined) throw new Error('no body');
          return del.body;
        },
      };
    }
    if (me === 'throw') throw new Error('network');
    return {
      ok: me.ok,
      status: me.ok ? 200 : 500,
      json: async () => ({ data: { hasPassword: me.hasPassword } }),
    };
  });
}

async function mount() {
  await act(async () => root.render(<ConfirmCloseAccountDialog onClose={onClose} />));
  await flush();
}

const dialog = () => document.body.querySelector('[role="alertdialog"]') as HTMLElement;
const btn = (text: string) =>
  Array.from(dialog().querySelectorAll('button')).find((b) => b.textContent === text) as
    | HTMLButtonElement
    | undefined;
const field = () => dialog().querySelector('input') as HTMLInputElement | null;
const alertText = () =>
  Array.from(dialog().querySelectorAll('[role="alert"] p')).map((p) => p.textContent);
const statusText = () => dialog().querySelector('p[role="status"]')!.textContent;
const click = async (el: Element | null | undefined) => {
  await act(async () => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
};
async function type(value: string) {
  const el = field()!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const deleteCalls = () => apiMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');

beforeEach(() => {
  apiMock.mockReset();
  clearMock.mockReset();
  onClose = jest.fn();
  replace = jest.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, replace },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

describe('structure and focus', () => {
  it('is an alertdialog with the signed title, body and backup line', async () => {
    wire();
    await mount();
    const d = dialog();
    expect(d.getAttribute('role')).toBe('alertdialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(d.getAttribute('aria-labelledby')!)!.textContent).toBe(T.title);
    expect(d.querySelector('h2')!.textContent).toBe(T.title);
    const desc = document.getElementById(d.getAttribute('aria-describedby')!)!;
    expect(Array.from(desc.querySelectorAll('p')).map((p) => p.textContent)).toEqual([
      T.body,
      T.backups,
    ]);
  });

  it('component constants equal the signed strings', () => {
    for (const k of Object.keys(T) as Array<keyof typeof T>) {
      expect(CLOSE_DIALOG_TEXT[k]).toBe(T[k]);
    }
  });

  it('puts focus on Cancel (first button), not on the destructive action', async () => {
    wire();
    await mount();
    const buttons = Array.from(dialog().querySelectorAll('button'));
    expect(buttons[0].textContent).toBe(T.cancel);
    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons[1].textContent).toBe(T.confirm);
  });

  it('traps Tab inside the dialog and hides the rest of the page', async () => {
    wire();
    await mount();
    expect(container.getAttribute('aria-hidden')).toBe('true');
    const last = btn(T.confirm)!;
    last.focus();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(dialog().contains(document.activeElement)).toBe(true);
  });

  it('Escape and Cancel and the backdrop call onClose; a click inside does not', async () => {
    wire();
    await mount();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    await click(btn(T.cancel));
    expect(onClose).toHaveBeenCalledTimes(2);
    await click(dialog());
    expect(onClose).toHaveBeenCalledTimes(2);
    await click(dialog().parentElement);
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(deleteCalls()).toHaveLength(0);
  });
});

describe('the field follows hasPassword', () => {
  it('password account: password field, label and help', async () => {
    wire({ me: { ok: true, hasPassword: true } });
    await mount();
    expect(field()!.type).toBe('password');
    expect(field()!.autocomplete).toBe('current-password');
    expect(dialog().querySelector('label')!.textContent).toBe('Your password');
    expect(dialog().textContent).toContain('Enter your password to confirm it is you.');
  });

  it('Google-only account: email field, label and help', async () => {
    wire({ me: { ok: true, hasPassword: false } });
    await mount();
    expect(field()!.type).toBe('email');
    expect(dialog().querySelector('label')!.textContent).toBe('Type your email address');
    expect(dialog().textContent).toContain(
      'Type the email address you sign in with, to confirm it is you.',
    );
  });

  it('GET /api/auth/me is read once, uncached', async () => {
    wire();
    await mount();
    const gets = apiMock.mock.calls.filter(([, init]) => !init?.method || init.method === 'GET');
    expect(gets).toHaveLength(1);
    expect(gets[0][0]).toBe('/api/auth/me');
    expect(gets[0][1]).toMatchObject({ cache: 'no-store' });
  });

  it.each([
    ['me throws', 'throw' as const],
    ['me not ok', { ok: false } as const],
    ['hasPassword missing', { ok: true } as const],
    ['hasPassword not a boolean', { ok: true, hasPassword: 'yes' } as const],
  ])('%s: no field, the generic line, and the button stays off', async (_n, me) => {
    wire({ me });
    await mount();
    expect(field()).toBeNull();
    expect(alertText()).toEqual([T.generic]);
    expect(btn(T.confirm)!.getAttribute('aria-disabled')).toBe('true');
    await click(btn(T.confirm));
    expect(deleteCalls()).toHaveLength(0);
  });
});

describe('the confirm button', () => {
  it('uses aria-disabled (still focusable) and does nothing while the field is empty or blank', async () => {
    wire();
    await mount();
    const b = btn(T.confirm)!;
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.disabled).toBe(false);
    await click(b);
    expect(deleteCalls()).toHaveLength(0);
    await type('   ');
    expect(btn(T.confirm)!.getAttribute('aria-disabled')).toBe('true');
    await click(btn(T.confirm));
    expect(deleteCalls()).toHaveLength(0);
    await type('hunter22');
    expect(btn(T.confirm)!.getAttribute('aria-disabled')).toBeNull();
  });

  it('Enter in the field confirms; Enter in an empty field does not', async () => {
    wire();
    await mount();
    const press = () =>
      act(async () => {
        field()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
    await press();
    expect(deleteCalls()).toHaveLength(0);
    await type('pw12345678');
    await press();
    await flush();
    expect(deleteCalls()).toHaveLength(1);
  });

  it('sends DELETE /api/auth/me with { password } for a password account', async () => {
    wire();
    await mount();
    await type('my-password');
    await click(btn(T.confirm));
    const [path, init] = deleteCalls()[0];
    expect(path).toBe('/api/auth/me');
    expect(init.method).toBe('DELETE');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ password: 'my-password' });
  });

  it('sends { email } (trimmed) for a Google-only account', async () => {
    wire({ me: { ok: true, hasPassword: false } });
    await mount();
    await type('  me@example.com ');
    await click(btn(T.confirm));
    expect(JSON.parse(deleteCalls()[0][1].body)).toEqual({ email: 'me@example.com' });
  });
});

describe('while closing', () => {
  it('shows Closing..., the status text, disables Cancel and the field, ignores Escape and a second click', async () => {
    wire({ del: 'pending' });
    await mount();
    await type('pw12345678');
    expect(statusText()).toBe('');
    await click(btn(T.confirm));
    expect(btn(T.working)).toBeDefined();
    expect(btn(T.confirm)).toBeUndefined();
    expect(statusText()).toBe(T.workingStatus);
    expect(btn(T.cancel)!.disabled).toBe(true);
    expect(field()!.disabled).toBe(true);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await click(dialog().parentElement);
    await click(btn(T.working));
    expect(onClose).not.toHaveBeenCalled();
    expect(deleteCalls()).toHaveLength(1);
    await act(async () => resolveDelete!({ status: 403, ok: false, json: async () => ({}) }));
    await flush();
    expect(statusText()).toBe('');
  });
});

describe('responses', () => {
  it('200: clears local state first, then goes to /account-closed (replace, not push)', async () => {
    wire({ del: { status: 200, body: { status: 'done' } } });
    await mount();
    await type('pw12345678');
    const order: string[] = [];
    clearMock.mockImplementation(() => order.push('clear'));
    replace.mockImplementation(() => order.push('replace'));
    await click(btn(T.confirm));
    expect(order).toEqual(['clear', 'replace']);
    expect(replace).toHaveBeenCalledWith('/account-closed');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('202: shows the partial line only, no confirm button, nothing cleared yet; dismiss clears and goes to / (never /account-closed)', async () => {
    wire({ del: { status: 202, body: { status: 'pending' } } });
    await mount();
    await type('pw12345678');
    await click(btn(T.confirm));
    expect(alertText()).toEqual([T.partial]);
    expect(btn(T.confirm)).toBeUndefined();
    expect(field()).toBeNull();
    expect(clearMock).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    await click(btn(T.cancel));
    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/');
    expect(replace).not.toHaveBeenCalledWith('/account-closed');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('202 + Escape also clears and goes to /', async () => {
    wire({ del: { status: 202 } });
    await mount();
    await type('pw12345678');
    await click(btn(T.confirm));
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('403 wrong_password (password account): the signed line, field invalid, button works again', async () => {
    wire({ del: { status: 403, body: { error: 'wrong_password' } } });
    await mount();
    await type('bad-password');
    await click(btn(T.confirm));
    expect(alertText()).toEqual([T.wrongPassword]);
    expect(field()!.getAttribute('aria-invalid')).toBe('true');
    expect(field()!.getAttribute('aria-describedby')).toContain(
      dialog().querySelector('[role="alert"]')!.id,
    );
    expect(field()!.value).toBe('bad-password');
    expect(btn(T.confirm)!.getAttribute('aria-disabled')).toBeNull();
    expect(clearMock).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    // Typing clears the error.
    await type('bad-password2');
    expect(alertText()).toEqual([]);
  });

  it('403 wrong_password (Google-only): the email line', async () => {
    wire({
      me: { ok: true, hasPassword: false },
      del: { status: 403, body: { error: 'wrong_password' } },
    });
    await mount();
    await type('x@example.com');
    await click(btn(T.confirm));
    expect(alertText()).toEqual([T.wrongEmail]);
  });

  it('403 reauth_required: generic line plus "Sign in again, then try once more."', async () => {
    wire({
      me: { ok: true, hasPassword: false },
      del: { status: 403, body: { error: 'reauth_required' } },
    });
    await mount();
    await type('x@example.com');
    await click(btn(T.confirm));
    expect(alertText()).toEqual([T.generic, T.signInAgain]);
  });

  it.each([
    ['403 not_closable', { status: 403, body: { error: 'not_closable' } }],
    ['403 unreadable body', { status: 403 }],
    ['500', { status: 500, body: {} }],
    ['503 billing_unavailable', { status: 503, body: { error: 'billing_unavailable' } }],
    ['401', { status: 401, body: {} }],
    ['a network error', 'throw' as const],
  ])('%s: the generic line and the button works again', async (_n, del) => {
    wire({ del });
    await mount();
    await type('pw12345678');
    await click(btn(T.confirm));
    expect(alertText()).toEqual([T.generic]);
    expect(btn(T.confirm)!.getAttribute('aria-disabled')).toBeNull();
    expect(clearMock).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('409 subscription_active: the two plan lines, no link, and the button stays off', async () => {
    wire({ del: { status: 409, body: { error: 'subscription_active' } } });
    await mount();
    await type('pw12345678');
    await click(btn(T.confirm));
    expect(alertText()).toEqual([T.planActive, T.planActiveHow]);
    expect(dialog().querySelector('[role="alert"] a')).toBeNull();
    expect(btn(T.confirm)!.getAttribute('aria-disabled')).toBe('true');
    await click(btn(T.confirm));
    expect(deleteCalls()).toHaveLength(1);
    expect(clearMock).not.toHaveBeenCalled();
  });

  it('Cancel after a refusal calls onClose and does not clear local state', async () => {
    wire({ del: { status: 403, body: { error: 'wrong_password' } } });
    await mount();
    await type('pw12345678');
    await click(btn(T.confirm));
    await click(btn(T.cancel));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(clearMock).not.toHaveBeenCalled();
  });

  it('never writes the password to storage or the console', async () => {
    const spies = (['log', 'warn', 'error', 'info'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    wire({ del: { status: 403, body: { error: 'wrong_password' } } });
    await mount();
    await type('SECRET-PW-123');
    await click(btn(T.confirm));
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain('SECRET-PW-123');
    expect(JSON.stringify({ ...window.localStorage, ...window.sessionStorage })).not.toContain(
      'SECRET-PW-123',
    );
    spies.forEach((s) => s.mockRestore());
  });
});
