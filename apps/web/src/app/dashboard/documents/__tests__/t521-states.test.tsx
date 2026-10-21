// T-521 (AC1): My documents loading, error (Retry) and empty states, with the signed strings.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import MyDocumentsPage from '@/app/dashboard/documents/page';
import { apiFetch } from '@/lib/apiFetch';

jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiFetchMock = apiFetch as jest.Mock;
let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });
const text = () => container.textContent ?? '';
const render = async () => {
  await act(async () => root.render(<MyDocumentsPage />));
  await flush();
};
const retryButton = () =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Retry');
const doc = {
  _id: 'a',
  title: 'Alpha',
  docType: 'bail_application',
  courtName: 'Patna High Court',
  status: 'finalised',
  createdAt: '2026-10-01T00:00:00Z',
};

beforeEach(() => {
  apiFetchMock.mockReset();
  window.sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('My documents states (T-521)', () => {
  it('loading: a busy skeleton, no empty state, no error', async () => {
    apiFetchMock.mockReturnValue(new Promise(() => undefined));
    await render();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(text()).not.toContain('No documents yet');
    expect(text()).not.toContain('Something did not work');
  });

  it('empty: the signed heading, line and action', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ documents: [] }),
    });
    await render();
    expect(text()).toContain('No documents yet');
    expect(text()).toContain('Your drafts will appear here.');
    const cta = Array.from(container.querySelectorAll('a')).find(
      (a) => a.textContent === 'Start a draft',
    ) as HTMLAnchorElement;
    expect(cta.getAttribute('href')).toBe('/dashboard/new');
    expect(cta.className).toMatch(/\bh-11\b/);
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('error (non-OK): the signed generic line and Retry, no empty state', async () => {
    apiFetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await render();
    expect(text()).toContain('Something did not work. Try again.');
    expect(retryButton()).toBeDefined();
    expect(text()).not.toContain('No documents yet');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('error (network throw) is the same', async () => {
    apiFetchMock.mockRejectedValue(new Error('network'));
    await render();
    expect(text()).toContain('Something did not work. Try again.');
    expect(retryButton()).toBeDefined();
  });

  it('Retry loads again, shows loading, then the list', async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await render();
    let release: (v: unknown) => void = () => undefined;
    apiFetchMock.mockReturnValueOnce(
      new Promise((r) => {
        release = r;
      }),
    );
    await act(async () => retryButton()!.click());
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(text()).not.toContain('Something did not work');
    await act(async () =>
      release({ ok: true, status: 200, json: async () => ({ documents: [doc] }) }),
    );
    await flush();
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Alpha');
    expect(retryButton()).toBeUndefined();
  });

  it('status shows as a chip with the status word', async () => {
    apiFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ documents: [doc] }),
    });
    await render();
    expect(text()).toContain('finalised');
  });
});
