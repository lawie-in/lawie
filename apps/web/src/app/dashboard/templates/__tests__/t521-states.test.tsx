// T-521 (AC1): the templates library loading and error (Retry) states.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import TemplatesPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const tpl = {
  template_id: 'bail_regular',
  display_name: 'Regular Bail',
  description: 'Line for Regular Bail',
  category: 'raw',
  plan_access: 'free',
  catalogueCategory: 'c1',
  catalogueCategoryName: 'Cat One',
  catalogueCategoryOrder: 1,
  icon: 'file_text',
};

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });
const text = () => container.textContent ?? '';
const retry = () =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Retry');
const render = async () => {
  await act(async () => root.render(<TemplatesPage />));
  await flush();
};

beforeEach(() => {
  mockApiFetch.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('Templates library states (T-521)', () => {
  it('loading: a busy skeleton, no error', async () => {
    mockApiFetch.mockReturnValue(new Promise(() => undefined));
    await render();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(text()).not.toContain('Something did not work');
  });

  it.each([
    ['non-OK', () => Promise.resolve({ ok: false, status: 500, json: async () => ({}) })],
    ['network throw', () => Promise.reject(new Error('network'))],
  ])('error (%s): the signed line and Retry; the old "refresh" line is gone', async (_n, reply) => {
    mockApiFetch.mockImplementation(reply);
    await render();
    expect(text()).toContain('Something did not work. Try again.');
    expect(text()).not.toContain('Please refresh');
    expect(retry()).toBeDefined();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('Retry fetches again and then shows the templates with the ?kind= link', async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await render();
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ templates: [tpl] }),
    });
    await act(async () => retry()!.click());
    await flush();
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Regular Bail');
    expect(text()).not.toContain('Something did not work');
    const a = Array.from(container.querySelectorAll('a')).find((x) =>
      x.textContent?.includes('Regular Bail'),
    )!;
    expect(a.getAttribute('href')).toBe('/dashboard/new?kind=bail_regular');
  });
});
