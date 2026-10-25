// T-565 item 40: the old form flow has no describe step, so when the one flow is off the page
// takes the command bar's matter text once and discards it (it must not sit in sessionStorage
// to resurface later). When the one flow is on, the page leaves it for OneFlow to read.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import NewDocumentPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/components/intake/OneFlow', () => ({
  __esModule: true,
  default: () => <div data-testid="one-flow" />,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'A', email: 'a@example.com', plan: 'free' } }),
}));
jest.mock('@/components/credits/PaywallModal', () => ({ PaywallModal: () => null }));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  openVerifyIfDraftRefused: async () => false,
  openVerifyInsteadOfPaywall: async () => false,
}));
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: jest.fn(),
  privacyPrecheck: async () => false,
  usePrivacyDescribedBy: () => undefined,
}));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const KEY = 'lawie:draft-prefill';
let container: HTMLDivElement;
let root: Root;

async function mount(intake: 'on' | 'off' | 'error' | 'string_true') {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === '/api/documents/intake/enabled') {
      if (intake === 'error') return Promise.reject(new Error('offline'));
      if (intake === 'string_true') return Promise.resolve(ok({ enabled: 'true' }));
      return Promise.resolve(ok({ enabled: intake === 'on' }));
    }
    if (path === '/api/documents/template-configs') return Promise.resolve(ok({ templates: [] }));
    return Promise.resolve(ok({}));
  });
  await act(async () => {
    root.render(<NewDocumentPage />);
  });
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('old form flow takes and discards the matter text (item 40)', () => {
  it.each([
    ['intake disabled', 'off'],
    ['the enabled check fails', 'error'],
    ['enabled is not exactly true', 'string_true'],
  ] as const)('%s: the key is removed', async (_n, mode) => {
    sessionStorage.setItem(KEY, 'bail for Asha Rao');
    await mount(mode);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(container.querySelector('[data-testid="one-flow"]')).toBeNull();
  });

  it('the discarded text is not rendered anywhere on the form flow', async () => {
    sessionStorage.setItem(KEY, 'Sentinel matter words');
    await mount('off');
    expect(container.textContent).not.toContain('Sentinel matter words');
  });

  it('intake enabled: the page does not consume the key (OneFlow does)', async () => {
    sessionStorage.setItem(KEY, 'bail for Asha Rao');
    await mount('on');
    expect(container.querySelector('[data-testid="one-flow"]')).not.toBeNull();
    expect(sessionStorage.getItem(KEY)).toBe('bail for Asha Rao');
  });

  it('no key stored: nothing breaks', async () => {
    await mount('off');
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});
