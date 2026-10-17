// T-510 — Profile card: Save changes -> PATCH /api/auth/me (name, barCouncil, enrollmentNumber),
// "Profile saved." or the one plain error line; server text is never shown; email never sent.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import SettingsPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockUserId: string | undefined = 'u';
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: mockUserId, name: 'Session Name', email: 'a@example.com', plan: 'free' },
    logout: jest.fn(),
  }),
}));
jest.mock('@/hooks/useUsage', () => ({ useUsage: () => ({ data: null }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
// T-509: the plan block has its own tests; here it is out of the way (its error state is a
// role=alert and its /status fetch would be caught by this file's no-store filter).
jest.mock('@/components/billing/PlanPanel', () => ({ PlanPanel: () => null }));
const mockPrivacyFetch = jest.fn();
let blocked = new WeakSet<object>();
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null, // the real notice is covered in t510-profile-save-privacy.test.tsx
  isPrivacyBlocked: (res: object) => blocked.has(res),
  privacyFetch: (...a: unknown[]) => mockPrivacyFetch(...a),
  usePrivacyDescribedBy: () => undefined,
  onPrivacyAccepted: () => () => {},
}));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const reply = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const SERVER_TEXT = 'Only gstStateCode can be changed';

let meReply: () => Promise<unknown>;
let container: HTMLDivElement;
let root: Root;
const text = () => container.textContent ?? '';
const input = (id: string) => container.querySelector(`#${id}`) as HTMLInputElement;
const saveBtn = () =>
  Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent === 'Save changes',
  ) as HTMLButtonElement;
const profileCalls = () => mockPrivacyFetch.mock.calls.filter((c) => c[0] === 'profile-save');
const sentBody = (i = 0) => JSON.parse((profileCalls()[i][2] as { body: string }).body);

async function flush() {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}
async function mount() {
  await act(async () => {
    root.render(<SettingsPage />);
  });
  await flush();
}
async function type(id: string, value: string) {
  await act(async () => {
    const el = input(id);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function save() {
  await act(async () => {
    saveBtn().click();
  });
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUserId = `u-${Math.random()}`;
  blocked = new WeakSet();
  meReply = async () =>
    reply(200, {
      data: { name: 'Saved Name', barCouncil: 'Delhi', enrollmentNumber: '', gstStateCode: null },
    });
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path === '/api/auth/me') return meReply();
    if (path === '/api/billing/invoices') return reply(200, { data: [] });
    if (path === '/api/billing/plans') return reply(200, { subscriptions: [], topups: [] });
    return reply(200, {});
  });
  mockPrivacyFetch.mockResolvedValue(reply(200, {}));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('T-510 profile card: fields and prefill', () => {
  it('has the Enrollment number field with its help line, and a Save changes button', async () => {
    await mount();
    const f = input('profile-enrollment-number');
    expect(f).not.toBeNull();
    expect(f.getAttribute('aria-describedby')).toBe('profile-enrollment-number-help');
    expect(container.querySelector('#profile-enrollment-number-help')!.textContent).toBe(
      'As on your Bar Council enrollment certificate',
    );
    expect(saveBtn().disabled).toBe(false);
  });

  it('prefills from GET /api/auth/me (no-store); Email is disabled', async () => {
    await mount();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/me', { cache: 'no-store' });
    expect(input('profile-name').value).toBe('Saved Name');
    expect(input('profile-bar-council').value).toBe('Delhi');
    expect(input('profile-email').disabled).toBe(true);
  });

  it.each([
    ['non-OK', async () => reply(500, { data: { name: 'X' } })],
    ['array data', async () => reply(200, { data: ['x'] })],
    ['null body', async () => reply(200, null)],
    [
      'non-string values',
      async () => reply(200, { data: { name: 5, barCouncil: {}, enrollmentNumber: null } }),
    ],
    [
      'rejected',
      async () => {
        throw new Error('net');
      },
    ],
  ])(
    'tolerates a junk /me (%s): falls back to the session name, blanks elsewhere',
    async (_n, fn) => {
      meReply = fn;
      await mount();
      expect(input('profile-name').value).toBe('Session Name');
      expect(input('profile-bar-council').value).toBe('');
      expect(input('profile-enrollment-number').value).toBe('');
    },
  );

  it('does not overwrite a field the user already edited when /me answers late', async () => {
    let release!: () => void;
    meReply = () =>
      new Promise((resolve) => {
        release = () => resolve(reply(200, { data: { name: 'Late Name', barCouncil: 'Delhi' } }));
      });
    await mount();
    await type('profile-name', 'Typed');
    await act(async () => release());
    await flush();
    expect(input('profile-name').value).toBe('Typed');
    expect(input('profile-bar-council').value).toBe('Delhi');
  });

  it('does not ask /me for the profile when the user has no id', async () => {
    mockUserId = undefined;
    await mount();
    expect(mockApiFetch.mock.calls.filter((c) => c[1]?.cache === 'no-store')).toHaveLength(0);
    expect(input('profile-name').value).toBe('Session Name');
  });
});

describe('T-510 profile card: save', () => {
  it('sends a PATCH with only the changed, trimmed fields and never the email', async () => {
    await mount();
    await type('profile-enrollment-number', '  D/123/2018  ');
    await save();
    expect(profileCalls()).toHaveLength(1);
    const [, path, init] = profileCalls()[0];
    expect(path).toBe('/api/auth/me');
    expect((init as { method: string }).method).toBe('PATCH');
    expect(sentBody()).toEqual({ enrollmentNumber: 'D/123/2018' });
    expect(JSON.stringify(sentBody())).not.toMatch(/email|a@example/);
  });

  it('sends several changed fields together and nothing else', async () => {
    await mount();
    await type('profile-name', 'New Name');
    await type('profile-bar-council', 'Mumbai');
    await save();
    expect(sentBody()).toEqual({ name: 'New Name', barCouncil: 'Mumbai' });
  });

  it('does not send an emptied field', async () => {
    await mount();
    await type('profile-bar-council', '   ');
    await save();
    expect(profileCalls()).toHaveLength(0);
  });

  it('an emptied saved field blocks the whole save: no PATCH, the check-field alert, never "Profile saved."', async () => {
    await mount();
    await type('profile-name', 'Changed Name');
    await type('profile-bar-council', '');
    await save();
    expect(profileCalls()).toHaveLength(0);
    expect(container.querySelector('[role="alert"]')!.textContent).toBe(
      'Check this field and try again.',
    );
    expect(container.querySelector('#profile-save-status')!.textContent).toBe('');
    expect(text()).not.toContain('Profile saved.');
    expect(saveBtn().getAttribute('aria-describedby')).toBe('profile-save-error');
    expect(input('profile-name').value).toBe('Changed Name');
  });

  it('after refilling the emptied field the save goes through and the alert clears', async () => {
    await mount();
    await type('profile-bar-council', '');
    await save();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await type('profile-bar-council', 'Mumbai');
    await save();
    expect(sentBody()).toEqual({ barCouncil: 'Mumbai' });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(text()).toContain('Profile saved.');
  });

  it('emptying a field that was never saved is not an error', async () => {
    await mount();
    await type('profile-enrollment-number', '');
    await save();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(text()).toContain('Profile saved.');
  });

  it('success shows "Profile saved." in the status region and no alert', async () => {
    await mount();
    await type('profile-enrollment-number', 'D/1/2020');
    await save();
    expect(container.querySelector('[role="status"]#profile-save-status')!.textContent).toBe(
      'Profile saved.',
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('after a successful save, saving again with no new edits sends no second request', async () => {
    await mount();
    await type('profile-enrollment-number', 'D/1/2020');
    await save();
    await save();
    expect(profileCalls()).toHaveLength(1);
  });

  it('nothing changed -> "Profile saved." with no request', async () => {
    await mount();
    await save();
    expect(profileCalls()).toHaveLength(0);
    expect(text()).toContain('Profile saved.');
  });

  it('editing after saved clears the saved line', async () => {
    await mount();
    await save();
    await type('profile-name', 'Another');
    expect(text()).not.toContain('Profile saved.');
  });

  it.each([
    ['422', async () => reply(422, { error: SERVER_TEXT, message: SERVER_TEXT })],
    ['400', async () => reply(400, { error: SERVER_TEXT })],
    ['500', async () => reply(500, { error: SERVER_TEXT })],
    [
      'network throw',
      async () => {
        throw new Error(SERVER_TEXT);
      },
    ],
  ])('%s -> only the generic error, never the server text; edits stay', async (_n, fn) => {
    mockPrivacyFetch.mockImplementation(fn);
    await mount();
    await type('profile-enrollment-number', 'D/9/2019');
    await save();
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toBe('Could not save your profile. Try again.');
    expect(text()).not.toContain(SERVER_TEXT);
    expect(text()).not.toContain('Profile saved.');
    expect(input('profile-enrollment-number').value).toBe('D/9/2019');
    expect(saveBtn().disabled).toBe(false);
  });

  it('a failed save can be retried and then succeeds, clearing the error', async () => {
    mockPrivacyFetch.mockResolvedValueOnce(reply(500, {}));
    await mount();
    await type('profile-enrollment-number', 'D/9/2019');
    await save();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await save();
    expect(profileCalls()).toHaveLength(2);
    expect(sentBody(1)).toEqual({ enrollmentNumber: 'D/9/2019' });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(text()).toContain('Profile saved.');
  });

  it('the button is disabled while the request is in flight, then enabled', async () => {
    let finish!: () => void;
    mockPrivacyFetch.mockImplementation(
      () => new Promise((resolve) => (finish = () => resolve(reply(200, {})))),
    );
    await mount();
    await type('profile-enrollment-number', 'D/9/2019');
    await act(async () => {
      saveBtn().click();
    });
    expect(saveBtn().disabled).toBe(true);
    await act(async () => saveBtn().click());
    expect(profileCalls()).toHaveLength(1);
    await act(async () => finish());
    await flush();
    expect(saveBtn().disabled).toBe(false);
    expect(text()).toContain('Profile saved.');
  });

  it('privacy-blocked -> no saved line, no error, edits stay, button usable', async () => {
    const res = reply(403, { error: 'privacy_reaccept_required' });
    blocked.add(res);
    mockPrivacyFetch.mockResolvedValue(res);
    await mount();
    await type('profile-enrollment-number', 'D/9/2019');
    await save();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(text()).not.toContain('Profile saved.');
    expect(input('profile-enrollment-number').value).toBe('D/9/2019');
    expect(saveBtn().disabled).toBe(false);
  });
});

describe('T-510 follow-up: text typed during an in-flight save survives the success', () => {
  function holdSave() {
    let release!: (r: unknown) => void;
    mockPrivacyFetch.mockImplementation(
      (key: string) =>
        new Promise((resolve) => {
          if (key === 'profile-save') release = resolve;
          else resolve(reply(200, {}));
        }),
    );
    return () => release(reply(200, {}));
  }

  it('a field edited after Save was pressed keeps the newer text; the saved line still shows', async () => {
    await mount();
    await type('profile-name', 'Sent Name');
    const succeed = holdSave();
    await act(async () => {
      saveBtn().click();
    });
    await type('profile-name', 'Sent Name plus more');
    await act(async () => succeed());
    await flush();
    expect(sentBody()).toEqual({ name: 'Sent Name' });
    expect(input('profile-name').value).toBe('Sent Name plus more');
    expect(text()).toContain('Profile saved.');
  });

  it('a field that was not touched during the save is settled to the sent, trimmed value', async () => {
    await mount();
    await type('profile-enrollment-number', '  D/123/2018  ');
    const succeed = holdSave();
    await act(async () => {
      saveBtn().click();
    });
    await act(async () => succeed());
    await flush();
    expect(sentBody()).toEqual({ enrollmentNumber: 'D/123/2018' });
    expect(input('profile-enrollment-number').value).toBe('D/123/2018');
  });

  it('only the edited field is kept: another sent field is still settled to its trimmed value', async () => {
    await mount();
    await type('profile-name', ' New Name ');
    await type('profile-bar-council', ' Mumbai ');
    const succeed = holdSave();
    await act(async () => {
      saveBtn().click();
    });
    await type('profile-bar-council', 'Mumbai High Court');
    await act(async () => succeed());
    await flush();
    expect(input('profile-name').value).toBe('New Name');
    expect(input('profile-bar-council').value).toBe('Mumbai High Court');
  });

  it('text typed during the save is sent by the next Save, not lost', async () => {
    await mount();
    await type('profile-name', 'First');
    const succeed = holdSave();
    await act(async () => {
      saveBtn().click();
    });
    await type('profile-name', 'Second');
    await act(async () => succeed());
    await flush();
    mockPrivacyFetch.mockResolvedValue(reply(200, {}));
    await save();
    expect(profileCalls()).toHaveLength(2);
    expect(sentBody(1)).toEqual({ name: 'Second' });
  });
});
