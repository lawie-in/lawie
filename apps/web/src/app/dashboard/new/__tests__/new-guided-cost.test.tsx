// T-372: the new-document page hands the template list's guided_credits_cost to OneFlow.
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
  useSearchParams: () => new URLSearchParams(),
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
function route(list: unknown) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === '/api/documents/intake/enabled') return Promise.resolve(ok({ enabled: true }));
    if (path === '/api/documents/template-configs') return Promise.resolve(ok(list));
    return Promise.resolve(ok({}));
  });
}

let container: HTMLDivElement;
let root: Root;
async function mount() {
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

describe('new document page passes the guided cost to OneFlow', () => {
  it('guided_credits_cost reaches OneFlow as guidedInkCost, with the templates', async () => {
    route({ templates: [{ template_id: 'bail_regular' }], guided_credits_cost: 2 });
    await mount();
    expect(lastProps().guidedInkCost).toBe(2);
    expect(lastProps().kinds).toEqual([{ template_id: 'bail_regular' }]);
  });

  it('is undefined when the list carries none', async () => {
    route({ templates: [] });
    await mount();
    expect(lastProps().guidedInkCost).toBeUndefined();
  });
});
