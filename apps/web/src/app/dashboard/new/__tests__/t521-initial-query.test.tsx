// T-521 round 3 (Priya): matter text never goes in a URL. The new-document page ignores ?q=:
// it passes no prefill to OneFlow, and starts no request for it.
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
let mockSearch = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearch),
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
let container: HTMLDivElement;
let root: Root;
async function mount(search: string) {
  mockSearch = search;
  mockApiFetch.mockImplementation((path: string) => {
    if (path === '/api/documents/intake/enabled') return Promise.resolve(ok({ enabled: true }));
    if (path === '/api/documents/template-configs')
      return Promise.resolve(ok({ templates: [{ template_id: 'bail_regular' }] }));
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

describe('new document page ignores ?q= (T-521 round 3)', () => {
  it('passes no prefill prop to OneFlow, even with ?q=', async () => {
    await mount(`q=${encodeURIComponent('Sentinel url words')}`);
    const props = lastProps();
    expect(props).not.toHaveProperty('initialDescription');
    expect(JSON.stringify(props)).not.toContain('Sentinel url words');
  });
  it('?kind= still reaches OneFlow when ?q= is also present', async () => {
    await mount('kind=bail_regular&q=hello%20there');
    expect(lastProps().initialKind).toBe('bail_regular');
    expect(lastProps()).not.toHaveProperty('initialDescription');
  });
  it('makes no brief or generate request for ?q=', async () => {
    await mount('q=hello%20there%20bail');
    const paths = mockApiFetch.mock.calls.map((c) => c[0] as string);
    expect(paths.some((p) => p.includes('/intake/brief'))).toBe(false);
    expect(paths.some((p) => p.includes('generate'))).toBe(false);
  });
});
