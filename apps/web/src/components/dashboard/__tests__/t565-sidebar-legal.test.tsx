// T-565 items 34, 35 and 47 (Ajay, pre-Anushka legal review 22 Oct), the signed-in Sidebar.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import Sidebar from '../Sidebar';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Meera Rao', email: 'meera@example.com', plan: 'pro' },
    logout: jest.fn(),
  }),
}));
let credits: { balance: { planTier: 'free' | 'solo' | 'pro' }; loaded: boolean };
jest.mock('@/hooks/useCredits', () => ({ useCredits: () => credits }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  credits = { balance: { planTier: 'free' }, loaded: true };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const mount = () => act(() => root.render(<Sidebar />));
const text = () => container.textContent ?? '';
const userRow = () =>
  Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Meera Rao'),
  )!;

describe('T-565 item 34: plan line from the credits tier', () => {
  it.each([
    ['free', 'Free plan'],
    ['solo', 'Solo plan'],
    ['pro', 'Pro plan'],
  ] as const)('planTier %s shows `%s`', (tier, line) => {
    credits = { balance: { planTier: tier }, loaded: true };
    mount();
    const lines = Array.from(userRow().querySelectorAll('p')).map((p) => p.textContent);
    expect(lines).toContain(line);
    for (const other of ['Free plan', 'Solo plan', 'Pro plan'].filter((l) => l !== line)) {
      expect(text()).not.toContain(other);
    }
  });

  it('a Solo user whose auth plan says `pro` is shown Solo, not Pro', () => {
    credits = { balance: { planTier: 'solo' }, loaded: true };
    mount();
    expect(text()).toContain('Solo plan');
    expect(text()).not.toContain('Pro plan');
  });

  it('before the balance loads (or if it never does) no plan line is shown, so no `Free plan` flash', () => {
    credits = { balance: { planTier: 'free' }, loaded: false };
    mount();
    expect(text()).not.toMatch(/(Free|Solo|Pro) plan/);
    expect(text()).toContain('Meera Rao'); // the name still shows
  });

  it('the avatar ring follows the paid tier', () => {
    const ring = () => userRow().querySelector('div')!.className;
    credits = { balance: { planTier: 'free' }, loaded: true };
    mount();
    expect(ring()).toContain('ring-amber-500');
    credits = { balance: { planTier: 'solo' }, loaded: true };
    mount();
    expect(ring()).toContain('ring-green-500');
    credits = { balance: { planTier: 'free' }, loaded: false };
    mount();
    expect(ring()).toContain('ring-amber-500');
  });
});

describe('T-565 item 47: no `Adv.` before the name', () => {
  it('shows the name only', () => {
    mount();
    expect(text()).toContain('Meera Rao');
    expect(text()).not.toContain('Adv.');
    const name = Array.from(userRow().querySelectorAll('p'))[0];
    expect(name.textContent).toBe('Meera Rao');
  });
});

describe('T-565 item 35: help goes to contact@lawie.in', () => {
  it('Get help is mailto:contact@lawie.in and support@lawie.in is nowhere', () => {
    mount();
    act(() => userRow().click());
    const help = Array.from(container.querySelectorAll('a')).find(
      (a) => a.textContent === 'Get help',
    )!;
    expect(help.getAttribute('href')).toBe('mailto:contact@lawie.in');
    expect(container.innerHTML).not.toContain('support@lawie.in');
  });
});
