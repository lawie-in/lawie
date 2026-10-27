// T-616: a late `expired` result from the mount refresh must not undo a sign-in that landed
// meanwhile (login() in this tab, or another tab's tokens).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { AuthProvider, useAuth } from '../AuthContext';

import { ACCESS, fakeJwt, REFRESH } from '@/lib/__tests__/helpers/fakeJwt';

type Outcome = { kind: 'ok'; accessToken: string } | { kind: 'expired' } | { kind: 'transient' };
let release: (o: Outcome) => void = () => undefined;
jest.mock('@/lib/sessionRefresh', () => ({
  refreshSession: jest.fn(() => new Promise<Outcome>((res) => (release = res))),
  refreshInFlight: jest.fn(() => null),
  subscribeRefreshState: jest.fn(() => () => undefined),
  isReconnecting: jest.fn(() => false),
  refreshCooldownMs: jest.fn(() => 0),
  resetRefreshState: jest.fn(),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let activeRoot: Root | null = null;
let activeContainer: HTMLElement | null = null;
function renderTree(el: React.ReactElement) {
  activeContainer = document.createElement('div');
  document.body.appendChild(activeContainer);
  const root = createRoot(activeContainer);
  activeRoot = root;
  act(() => root.render(el));
  return {
    unmount: () => {
      if (activeRoot === root) activeRoot = null;
      act(() => root.unmount());
    },
  };
}
function cleanupTree() {
  if (activeRoot) act(() => activeRoot!.unmount());
  activeRoot = null;
  activeContainer?.remove();
  activeContainer = null;
}

type Auth = ReturnType<typeof useAuth>;
let latest: Auth;
function Probe() {
  latest = useAuth();
  return null;
}

afterEach(cleanupTree);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

it('a login landing while the mount refresh runs: a late "expired" is ignored, tokens and user stay', async () => {
  localStorage.setItem(ACCESS, fakeJwt({ expiresInSec: -100, sub: 'u1' }));
  localStorage.setItem(REFRESH, 'R1');
  sessionStorage.setItem('lawie:draft-prefill', 'text');
  renderTree(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  expect(latest.isLoading).toBe(true);

  const fresh = fakeJwt({ expiresInSec: 900, sub: 'u1', email: 'logged-in@b.example' });
  act(() => latest.login(fresh, 'R2'));
  expect(latest.user?.email).toBe('logged-in@b.example');

  await act(async () => {
    release({ kind: 'expired' }); // the old refresh token was refused, after the login
    await Promise.resolve();
  });
  expect(latest.user?.email).toBe('logged-in@b.example');
  expect(latest.isLoading).toBe(false);
  expect(localStorage.getItem(ACCESS)).toBe(fresh);
  expect(localStorage.getItem(REFRESH)).toBe('R2');
  expect(sessionStorage.getItem('lawie:draft-prefill')).toBe('text');
});

it('without a login meanwhile, the same "expired" signs out', async () => {
  localStorage.setItem(ACCESS, fakeJwt({ expiresInSec: -100, sub: 'u1' }));
  localStorage.setItem(REFRESH, 'R1');
  renderTree(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {
    release({ kind: 'expired' });
    await Promise.resolve();
  });
  expect(latest.user).toBeNull();
  expect(localStorage.getItem(ACCESS)).toBeNull();
});
