// T-365 AC5: each template card on the library opens the one flow with that document chosen.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import TemplatesPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { plan: 'pro', credits: 10 }, login: jest.fn() }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mk = (id: string, name: string) => ({
  template_id: id,
  display_name: name,
  description: `Line for ${name}`,
  category: 'raw',
  plan_access: 'free',
  catalogueCategory: 'c1',
  catalogueCategoryName: 'Cat One',
  catalogueCategoryOrder: 1,
  icon: 'file_text',
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  mockApiFetch.mockReset();
});

describe('templates library links (T-365 AC5)', () => {
  it('every card links to /dashboard/new?kind=<url-encoded id>', async () => {
    const kinds = [mk('bail_regular', 'Regular Bail'), mk('odd id/x&y', 'Odd One')];
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.includes('intake/enabled'))
        return { ok: true, json: async () => ({ enabled: false }) };
      return { ok: true, json: async () => ({ templates: kinds }) };
    });
    await act(async () => {
      root.render(<TemplatesPage />);
    });
    await act(async () => {
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    });
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/dashboard/new?kind=bail_regular');
    expect(hrefs).toContain(`/dashboard/new?kind=${encodeURIComponent('odd id/x&y')}`);
    expect(hrefs).toContain('/dashboard/new?kind=odd%20id%2Fx%26y');
    // every card (an anchor holding a card line) carries a kind link
    const cards = Array.from(container.querySelectorAll('a')).filter((a) =>
      (a.textContent ?? '').includes('Line for'),
    );
    expect(cards).toHaveLength(2);
    for (const a of cards) expect(a.getAttribute('href')).toMatch(/^\/dashboard\/new\?kind=/);
  });
});
