import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import SettingsPage from '@/app/dashboard/settings/page';
import { apiFetch } from '@/lib/apiFetch';

// T-115c — the Close account section on Settings (Rajesh spec §1, Madhuri strings B).
jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Test User', email: 'test@example.com', plan: 'free', role: 'Lawyer' },
    logout: jest.fn(),
  }),
}));
jest.mock('@/hooks/useCredits', () => ({
  useCredits: () => ({ balance: { totalInk: 3 }, loaded: true }),
}));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });

beforeEach(async () => {
  (apiFetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { hasPassword: true } }),
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<SettingsPage />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const section = () => container.querySelector('section[aria-labelledby="close-account-heading"]')!;
const openBtn = () => section().querySelector('button') as HTMLButtonElement;
const dialog = () => document.body.querySelector('[role="alertdialog"]');
const click = async (el: Element) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
};

describe('Settings: Close account', () => {
  it('has the section with the signed heading, line and button, and no dialog yet', () => {
    expect(section().querySelector('h2')!.textContent).toBe('Close account');
    expect(section().querySelector('p')!.textContent).toBe(
      'Close your Lawie account. You will be asked to confirm first.',
    );
    expect(openBtn().textContent).toBe('Close account');
    expect(dialog()).toBeNull();
  });

  it('sits below Plan and above Sign out', () => {
    const html = container.innerHTML;
    expect(html.indexOf('close-account-heading')).toBeGreaterThan(html.indexOf('Plan'));
    expect(html.indexOf('close-account-heading')).toBeLessThan(html.indexOf('Sign out'));
  });

  it('the button opens the dialog; Cancel closes it and focus returns to the button', async () => {
    openBtn().focus();
    await click(openBtn());
    expect(dialog()).not.toBeNull();
    const cancel = Array.from(dialog()!.querySelectorAll('button')).find(
      (b) => b.textContent === 'Cancel',
    )!;
    await click(cancel);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(openBtn());
  });

  it('opening the dialog sends nothing destructive', async () => {
    await click(openBtn());
    const del = (apiFetch as jest.Mock).mock.calls.filter(([, i]) => i?.method === 'DELETE');
    expect(del).toHaveLength(0);
  });
});
