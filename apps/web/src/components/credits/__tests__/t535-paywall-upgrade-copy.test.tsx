// T-535 round 2: Ajay-signed top-up expiry wording on the paywall card (the upgrade-success modal was deleted in T-565).
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { PaywallModal } from '../PaywallModal';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-535' } }) }));
jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: jest.fn(),
  usePrivacyDescribedBy: () => undefined,
  onPrivacyAccepted: () => () => {},
}));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  VerifyEmailCard: () => null,
  isEmailVerificationRequired: async () => false,
  useNeedsEmailVerification: () => false,
}));

const PAYWALL_LINE = 'Top-up Ink does not expire while your account is open.';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(el: ReactElement) {
  act(() => root.render(el));
  return document.body.textContent ?? '';
}

describe('T-535 PaywallModal top-up card line', () => {
  it('renders exactly the signed line as its own paragraph, with no pack names or "never expires"', () => {
    const text = render(
      <PaywallModal documentLabel="Bail application" cost={5} balance={1} onClose={jest.fn()} />,
    );
    const paragraphs = Array.from(document.body.querySelectorAll('p')).map((p) => p.textContent);
    expect(paragraphs).toContain(PAYWALL_LINE);
    expect(text).not.toMatch(/Mini|Mid|Max/);
    expect(text).not.toContain('never expires');
  });
});
