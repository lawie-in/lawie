// T-565 items 31, 32 and 44 (Ajay, pre-Anushka legal review 22 Oct), PaywallModal.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { PaywallModal } from '../PaywallModal';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-565' } }) }));
jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('@/components/credits/TopUpModal', () => ({ TopUpModal: () => null }));

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

function render(cost = 5, balance = 1) {
  act(() =>
    root.render(
      <PaywallModal
        documentLabel="Bail application"
        cost={cost}
        balance={balance}
        onClose={jest.fn()}
      />,
    ),
  );
  return document.body.textContent ?? '';
}
const paragraphs = () => Array.from(document.body.querySelectorAll('p')).map((p) => p.textContent);

describe('T-565 PaywallModal', () => {
  it('item 31: the "log in tomorrow" strip is gone, with no daily-bonus wording', () => {
    const text = render();
    expect(text).not.toContain('log in tomorrow');
    expect(text).not.toContain('Or wait');
    expect(text).not.toMatch(/daily login bonus|midnight|free Ink/i);
  });

  it('item 32: `Prices include GST.` is its own line, right after the Solo price line', () => {
    render();
    const ps = paragraphs();
    const i = ps.indexOf('50 Ink / mo · ₹799');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(ps[i + 1]).toBe('Prices include GST.');
  });

  it('item 44: the title is `Insufficient Ink` and the sentence gives the cost and the balance', () => {
    const text = render(5, 1);
    expect(paragraphs()).toContain('Insufficient Ink');
    expect(document.body.querySelector('h2')?.textContent).toBe(
      'This draft costs 5 Ink — you have 1.',
    );
    expect(text).not.toContain('Ink insufficient');
    expect(text).not.toContain('You need');
  });

  it('item 44: the sentence follows the props (a zero balance reads `you have 0.`)', () => {
    render(12, 0);
    expect(document.body.querySelector('h2')?.textContent).toBe(
      'This draft costs 12 Ink — you have 0.',
    );
  });
});
