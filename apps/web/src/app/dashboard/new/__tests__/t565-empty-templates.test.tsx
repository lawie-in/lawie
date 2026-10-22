// T-565 item 36 (Ajay, pre-Anushka legal review 22 Oct): the empty template list says
// `No templates available yet.` and nothing about legal review.
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

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mockApiFetch.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/api/documents/template-configs' ? ok({ templates: [] }) : ok({ enabled: false }),
    ),
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('an empty template list shows the signed line, and only that sentence', async () => {
  await act(async () => {
    root.render(<NewDocumentPage />);
  });
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
  const p = Array.from(container.querySelectorAll('p')).find((x) =>
    x.textContent?.startsWith('No templates'),
  );
  expect(p?.textContent).toBe('No templates available yet.');
  expect(container.textContent).not.toContain('legal team');
  expect(container.textContent).not.toContain('reviewed');
});
