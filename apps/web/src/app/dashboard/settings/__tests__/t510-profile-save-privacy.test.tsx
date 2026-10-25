// T-510 round 2 — profile Save with the REAL PrivacyUpdatePrompt module (only the network is
// faked): a privacy block with no dialog to open shows the real P7 box for actionKey
// 'profile-save', and the Save button's aria-describedby points at that box.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import SettingsPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-priv', name: 'Session Name', email: 'a@example.com', plan: 'free' },
    login: jest.fn(),
    logout: jest.fn(),
  }),
}));
jest.mock('@/hooks/useUsage', () => ({ useUsage: () => ({ data: null }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({
  apiFetch: (...a: unknown[]) => mockApiFetch(...a),
  refreshAccessToken: async () => null,
}));

const P7 = 'Accept the updated Privacy Policy to continue.';
const BOX_ID = 'reaccept-p7-profile-save';

const reply = (status: number, body: unknown = {}) => {
  const make = (): unknown => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    clone: () => make(),
  });
  return make();
};

let patchReply: () => unknown;
let container: HTMLDivElement;
let root: Root;
const saveBtn = () =>
  Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent === 'Save changes',
  ) as HTMLButtonElement;

async function flush() {
  await act(async () => {
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  patchReply = () => reply(200, {});
  mockApiFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path === '/api/auth/me' && init?.method === 'PATCH') return patchReply();
    if (path === '/api/auth/me') {
      // Behind on the privacy version, but no signed summary: no dialog can open.
      return reply(200, {
        data: {
          name: 'Saved Name',
          barCouncil: 'Delhi',
          enrollmentNumber: '',
          currentPrivacyVersion: '2026-10-12b',
          needsPrivacyAcceptance: true,
          summary: null,
        },
      });
    }
    if (path === '/api/billing/invoices') return reply(200, { data: [] });
    if (path === '/api/billing/plans') return reply(200, { subscriptions: [], topups: [] });
    return reply(200, {});
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mountAndEdit() {
  await act(async () => {
    root.render(<SettingsPage />);
  });
  await flush();
  await act(async () => {
    const el = container.querySelector('#profile-enrollment-number') as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, 'D/1/2020');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('T-510 profile Save with the real privacy notice', () => {
  it('shows no privacy box and describes Save by the status line alone before any block', async () => {
    await mountAndEdit();
    expect(container.querySelector(`#${BOX_ID}`)).toBeNull();
    expect(saveBtn().getAttribute('aria-describedby')).toBe('profile-save-status');
  });

  it('a privacy block with no dialog renders the real P7 box above Save and joins its id into aria-describedby', async () => {
    patchReply = () => reply(403, { error: 'privacy_reaccept_required' });
    await mountAndEdit();
    await act(async () => {
      saveBtn().click();
    });
    await flush();

    const box = container.querySelector(`#${BOX_ID}`);
    expect(box).not.toBeNull();
    expect(box!.textContent).toBe(P7);
    // The box sits above the Save button in document order.
    expect(box!.compareDocumentPosition(saveBtn()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    const ids = (saveBtn().getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toEqual(['profile-save-status', BOX_ID]);
    // Every id it points at exists.
    ids.forEach((id) => expect(container.querySelector(`#${id}`)).not.toBeNull());
    // Not a save and not a generic error.
    expect(container.querySelector('#profile-save-status')!.textContent).toBe('');
    expect(container.textContent).not.toContain('Could not save your profile');
  });
});
