// T-365 AC5: the new-document page reads ?kind= and hands it to OneFlow as initialKind.
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

describe('new document page reads ?kind= (T-365 AC5)', () => {
  it('passes the decoded kind to OneFlow as initialKind', async () => {
    await mount('kind=bail_regular');
    expect(lastProps().initialKind).toBe('bail_regular');
  });
  it('decodes an encoded id', async () => {
    await mount(`kind=${encodeURIComponent('a b/c')}`);
    expect(lastProps().initialKind).toBe('a b/c');
  });
  it('is undefined without ?kind=', async () => {
    await mount('');
    expect(lastProps().initialKind).toBeUndefined();
  });
});
