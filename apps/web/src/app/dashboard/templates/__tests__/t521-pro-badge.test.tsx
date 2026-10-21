// T-521 (SHOULD-FIX 3): the templates PRO badge uses Night Library tokens.
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

describe('Templates PRO badge (T-521)', () => {
  it('uses bg-nl-brass-light and text-nl-brass-dark, not legacy colours; free templates have none', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        templates: [
          tpl,
          { ...tpl, template_id: 'pro_one', display_name: 'Pro One', plan_access: 'pro' },
        ],
      }),
    });
    await act(async () => root.render(<TemplatesPage />));
    await flush();
    const badges = Array.from(container.querySelectorAll('span')).filter(
      (s) => s.textContent === 'PRO',
    );
    expect(badges).toHaveLength(1);
    expect(badges[0].className).toContain('bg-nl-brass-light');
    expect(badges[0].className).toContain('text-nl-brass-dark');
    expect(badges[0].className).not.toMatch(/amber|yellow|slate/);
  });
});
