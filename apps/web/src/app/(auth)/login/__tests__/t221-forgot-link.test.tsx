/** T-221 AC1: /login links "Forgot password?" to /forgot-password, in Sign in mode only. */
import { useSearchParams } from 'next/navigation';

import { mountEl, unmountEl } from '@/components/auth/__tests__/t221-helpers';

import LoginPage from '../page';

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: jest.fn() }),
}));

const forgot = () =>
  Array.from(document.querySelectorAll('a')).find((a) =>
    (a.textContent ?? '').includes('Forgot password?'),
  );

afterEach(unmountEl);

it('Sign in mode shows the link to /forgot-password with a 44 px hit area', async () => {
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  await mountEl(<LoginPage />);
  const a = forgot();
  expect(a).toBeDefined();
  expect(a!.getAttribute('href')).toBe('/forgot-password');
  expect(a!.className).toContain('min-h-11');
});

it('Create account mode does not show it', async () => {
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('mode=signup'));
  await mountEl(<LoginPage />);
  expect(forgot()).toBeUndefined();
});
