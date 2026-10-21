// T-521 (Rajesh): the new-document page passes the advocate's real Ink level to OneFlow
// (and so to the generating inkwell). Unknown balance: null, never a made-up level.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import NewDocumentPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const oneFlowProps = jest.fn();
jest.mock('@/components/intake/OneFlow', () => ({
  __esModule: true,
  default: (props: unknown) => {
    oneFlowProps(props);
    return <div data-testid="one-flow" />;
  },
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
  openVerifyInsteadOfPaywall: async () => false,
}));
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: jest.fn(),
  privacyPrecheck: async () => false,
  usePrivacyDescribedBy: () => undefined,
}));
const mockUseCredits = jest.fn();
jest.mock('@/hooks/useCredits', () => ({ useCredits: () => mockUseCredits() }));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
let container: HTMLDivElement;
let root: Root;
const credits = (over: { loaded: boolean; totalInk: number; allot: number }) =>
  mockUseCredits.mockReturnValue({
    balance: { totalInk: over.totalInk, inkSubMonthlyAllotment: over.allot },
    loaded: over.loaded,
    loading: false,
    refresh: jest.fn(),
  });
async function mountPage() {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === '/api/documents/intake/enabled') return Promise.resolve(ok({ enabled: true }));
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
const lastProps = () => oneFlowProps.mock.calls[oneFlowProps.mock.calls.length - 1][0];

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('new page inkLevel', () => {
  it('3 Ink of a monthly 10 is passed as 30', async () => {
    credits({ loaded: true, totalInk: 3, allot: 10 });
    await mountPage();
    expect(lastProps().inkLevel).toBeCloseTo(30);
  });
  it('Free (no allotment): 2 Ink is 40', async () => {
    credits({ loaded: true, totalInk: 2, allot: 0 });
    await mountPage();
    expect(lastProps().inkLevel).toBeCloseTo(40);
  });
  it('balance not loaded: null, not 0 and not 100', async () => {
    credits({ loaded: false, totalInk: 0, allot: 0 });
    await mountPage();
    expect(lastProps().inkLevel).toBeNull();
  });
});
