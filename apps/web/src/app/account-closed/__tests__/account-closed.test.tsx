import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import AccountClosedPage from '@/app/account-closed/page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// T-115c — /account-closed (Madhuri, dpdp-ui-strings-t115.md C; Rajesh spec §4).
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

describe('/account-closed', () => {
  it('shows the signed text, byte for byte, and nothing about what was erased', async () => {
    await act(async () => root.render(<AccountClosedPage />));
    expect(container.querySelector('h1')!.textContent).toBe('Your account is closed');
    const paras = Array.from(container.querySelectorAll('p')).map((p) => p.textContent);
    expect(paras).toEqual(['You have been signed out.', 'Thank you for using Lawie.']);
    const link = container.querySelector('a')!;
    expect(link.textContent).toBe('Go to the home page');
    expect(link.getAttribute('href')).toBe('/');
    expect(container.textContent).not.toMatch(/erase/i);
  });

  it('moves focus to the h1 (tabIndex -1) on load', async () => {
    await act(async () => root.render(<AccountClosedPage />));
    const h1 = container.querySelector('h1')!;
    expect(h1.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(h1);
  });

  it('has no sidebar or navigation: one main, one heading', async () => {
    await act(async () => root.render(<AccountClosedPage />));
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('nav')).toBeNull();
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });
});
