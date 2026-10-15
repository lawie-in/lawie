// T-436 (b) — the State picker and useGstState. Strings: Madhuri, t436-ui-strings.md section A;
// list and codes: Vikram (GST_STATES); consent order: Ajay, gst-tax-invoice-signed.md Addendum 7
// (2): the State is held in memory and saved only after the privacy version is accepted.
// Mounted with react-dom/client, like PlanUpgrade.test.tsx.
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useGstState, type GstStateController } from '@/hooks/useGstState';

import { GstStatePicker } from '../GstStatePicker';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockUserId = 'u-0';
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: mockUserId } }),
}));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const mockPrivacyFetch = jest.fn();
let blocked = new WeakSet<object>();
let acceptedListeners: Set<() => void>;
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: ({ actionKey }: { actionKey: string }) => (
    <div data-testid="p7" data-key={actionKey} />
  ),
  isPrivacyBlocked: (res: object) => blocked.has(res),
  privacyFetch: (...a: unknown[]) => mockPrivacyFetch(...a),
  usePrivacyDescribedBy: () => undefined,
  onPrivacyAccepted: (l: () => void) => {
    acceptedListeners.add(l);
    return () => acceptedListeners.delete(l);
  },
}));

const reply = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const blockedReply = () => {
  const r = reply(403, { error: 'privacy_reaccept_required' });
  blocked.add(r);
  return r;
};

let ctl: GstStateController;
function Harness() {
  const gst = useGstState('gst-state-test');
  useEffect(() => {
    ctl = gst;
  });
  return <GstStatePicker gst={gst} id="gst-select" />;
}

let container: HTMLDivElement;
let root: Root;
const select = () => container.querySelector('select') as HTMLSelectElement;
const patches = () =>
  mockPrivacyFetch.mock.calls.filter((c) => c[1] === '/api/auth/me' && c[2]?.method === 'PATCH');

async function flush() {
  await act(async () => {
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  });
}
async function mount() {
  await act(async () => {
    root.render(<Harness />);
  });
  await flush();
}
async function pick(code: string) {
  await act(async () => {
    select().value = code;
    select().dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}
function serverHas(code: string | null) {
  mockApiFetch.mockResolvedValue(reply(200, { data: { gstStateCode: code } }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUserId = `u-${Math.random()}`; // a new user each test: the saved State is a module store
  blocked = new WeakSet();
  acceptedListeners = new Set();
  localStorage.clear();
  sessionStorage.clear();
  serverHas(null);
  mockPrivacyFetch.mockResolvedValue(reply(200, { status: 'success' }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('T-436 State picker: list and traps', () => {
  it('has the placeholder (disabled, first) and the 36 States/UTs, A-Z by name', async () => {
    await mount();
    const opts = Array.from(select().options);
    expect(opts).toHaveLength(37);
    expect(opts[0].value).toBe('');
    expect(opts[0].disabled).toBe(true);
    expect(opts[0].textContent).toBe('Select your State');
    const names = opts.slice(1).map((o) => o.textContent as string);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    expect(new Set(opts.slice(1).map((o) => o.value)).size).toBe(36);
  });

  it.each([
    ['37', 'Andhra Pradesh'],
    ['26', 'Dadra and Nagar Haveli and Daman and Diu'],
    ['38', 'Ladakh'],
    ['01', 'Jammu and Kashmir'],
    ['20', 'Jharkhand'],
    ['07', 'Delhi'],
  ])('code %s is %s', async (code, name) => {
    await mount();
    const o = Array.from(select().options).find((x) => x.value === code);
    expect(o?.textContent).toBe(name);
  });

  it('has no old or special codes (28 for AP, 25 for Daman, 97, 99) and shows no code text', async () => {
    await mount();
    const values = Array.from(select().options).map((o) => o.value);
    for (const bad of ['28', '25', '97', '99', '1']) expect(values).not.toContain(bad);
    expect(Array.from(select().options).some((o) => /\d/.test(o.textContent ?? ''))).toBe(false);
  });
});

describe('T-436 State picker: exact strings and a11y', () => {
  it('label, help and live region are word for word; the select is labelled and required', async () => {
    await mount();
    const label = container.querySelector('label') as HTMLLabelElement;
    expect(label.textContent).toBe('State');
    expect(label.htmlFor).toBe('gst-select');
    expect(select().id).toBe('gst-select');
    expect(select().getAttribute('aria-required')).toBe('true');
    expect(container.querySelector('#gst-select-help')?.textContent).toBe(
      'We use this to issue GST tax invoices.',
    );
    expect(select().getAttribute('aria-describedby')).toBe('gst-select-help');
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('pre-fills the select from GET /api/auth/me and never guesses a default', async () => {
    serverHas('29');
    await mount();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/me', expect.anything());
    expect(select().value).toBe('29');
  });

  it('with no State saved the select stays on the placeholder', async () => {
    await mount();
    expect(select().value).toBe('');
  });

  it('ignores an invalid code from the server', async () => {
    serverHas('28');
    await mount();
    expect(select().value).toBe('');
  });
});

describe('T-436 State picker: save on change', () => {
  it('PATCHes /api/auth/me { gstStateCode } through privacyFetch and shows Saved', async () => {
    await mount();
    await pick('37');
    expect(patches()).toHaveLength(1);
    const [key, path, init] = patches()[0];
    expect(key).toBe('gst-state-test');
    expect(path).toBe('/api/auth/me');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ gstStateCode: '37' });
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('Saved');
    expect(select().value).toBe('37');
  });

  it('shows "Could not save. Try again." as an alert on a failed save', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(500));
    await mount();
    await pick('37');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Could not save. Try again.',
    );
    expect(select().getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the same failure on a network error', async () => {
    mockPrivacyFetch.mockRejectedValue(new Error('offline'));
    await mount();
    await pick('37');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Could not save. Try again.',
    );
  });
});

describe('T-436 State picker: privacy first (Ajay Addendum 7 (2))', () => {
  it('a blocked save shows the notice, says Saved nowhere, and is held in memory only', async () => {
    mockPrivacyFetch.mockResolvedValue(blockedReply());
    await mount();
    await pick('37');
    expect(patches()).toHaveLength(1);
    expect(container.querySelector('[data-testid="p7"]')).not.toBeNull();
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(select().value).toBe('37');
    // Nothing in browser storage (the pick lives in the component).
    expect(JSON.stringify({ ...localStorage })).not.toContain('37');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('after the user accepts, the held State is saved again, once', async () => {
    mockPrivacyFetch.mockResolvedValueOnce(blockedReply());
    await mount();
    await pick('37');
    expect(patches()).toHaveLength(1);
    expect(acceptedListeners.size).toBeGreaterThan(0);
    await act(async () => {
      acceptedListeners.forEach((l) => l());
    });
    await flush();
    expect(patches()).toHaveLength(2);
    expect(JSON.parse(patches()[1][2].body)).toEqual({ gstStateCode: '37' });
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('Saved');
    // Held pick is cleared: a second acceptance saves nothing more.
    await act(async () => {
      acceptedListeners.forEach((l) => l());
    });
    await flush();
    expect(patches()).toHaveLength(2);
  });

  it('an acceptance with nothing held saves nothing', async () => {
    await mount();
    await act(async () => {
      acceptedListeners.forEach((l) => l());
    });
    await flush();
    expect(patches()).toHaveLength(0);
  });

  it('the latest pick wins: pick A (blocked), pick B (blocked), accept -> B', async () => {
    mockPrivacyFetch.mockResolvedValue(blockedReply());
    await mount();
    await pick('37');
    await pick('29');
    mockPrivacyFetch.mockResolvedValue(reply(200));
    await act(async () => {
      acceptedListeners.forEach((l) => l());
    });
    await flush();
    expect(JSON.parse(patches()[patches().length - 1][2].body)).toEqual({ gstStateCode: '29' });
  });
});

describe('T-436 ensureReady (what Pay / Subscribe call)', () => {
  it('no State: false, the required error, focus on the select, no save call', async () => {
    await mount();
    let ok = true;
    await act(async () => {
      ok = await ctl.ensureReady();
    });
    await flush();
    expect(ok).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Select your State to continue.',
    );
    expect(select().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(select());
    expect(mockPrivacyFetch).not.toHaveBeenCalled();
  });

  it('the required error clears when a State is picked', async () => {
    await mount();
    await act(async () => {
      await ctl.ensureReady();
    });
    await pick('37');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('a State already saved on the server: true, and no PATCH', async () => {
    serverHas('29');
    await mount();
    let ok = false;
    await act(async () => {
      ok = await ctl.ensureReady();
    });
    expect(ok).toBe(true);
    expect(patches()).toHaveLength(0);
  });

  it('waits for /me when Pay is pressed before it answered', async () => {
    let release: (v: unknown) => void = () => undefined;
    mockApiFetch.mockReturnValue(new Promise((r) => (release = r)));
    await mount();
    let result: boolean | undefined;
    await act(async () => {
      void ctl.ensureReady().then((v) => (result = v));
    });
    expect(result).toBeUndefined();
    await act(async () => {
      release(reply(200, { data: { gstStateCode: '29' } }));
    });
    await flush();
    expect(result).toBe(true);
  });

  it('a pick whose save was blocked for privacy: false (Pay does not go on)', async () => {
    mockPrivacyFetch.mockResolvedValue(blockedReply());
    await mount();
    await pick('37');
    let ok = true;
    await act(async () => {
      ok = await ctl.ensureReady();
    });
    expect(ok).toBe(false);
  });

  it('a pick whose save failed: false', async () => {
    mockPrivacyFetch.mockResolvedValue(reply(500));
    await mount();
    await pick('37');
    let ok = true;
    await act(async () => {
      ok = await ctl.ensureReady();
    });
    expect(ok).toBe(false);
  });

  it('a pick that saved: true', async () => {
    await mount();
    await pick('37');
    let ok = false;
    await act(async () => {
      ok = await ctl.ensureReady();
    });
    expect(ok).toBe(true);
  });

  it("another signed-in user never sees the earlier user's State", async () => {
    serverHas('29');
    await mount();
    expect(select().value).toBe('29');
    act(() => root.unmount());
    mockUserId = 'someone-else';
    serverHas(null);
    root = createRoot(container);
    await mount();
    expect(select().value).toBe('');
  });
});
