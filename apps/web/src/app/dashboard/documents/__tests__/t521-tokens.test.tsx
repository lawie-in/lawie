// T-521 (SHOULD-FIX 3): documents table cells and the templates PRO badge use Night Library
// tokens, not slate colours.
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

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (apiFetch as jest.Mock).mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it('table cells use nl text tokens and no text-slate-*', async () => {
  (apiFetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      documents: [
        {
          _id: 'a',
          title: 'Alpha',
          docType: 'bail_application',
          courtName: 'Patna High Court',
          status: 'finalised',
          createdAt: '2026-10-01T00:00:00Z',
        },
        {
          _id: 'b',
          title: 'Beta',
          docType: 'notice',
          courtName: '',
          status: 'draft',
          createdAt: '2026-10-02T00:00:00Z',
        },
      ],
    }),
  });
  await act(async () => root.render(<MyDocumentsPage />));
  await act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });
  const table = container.querySelector('table');
  expect(table).not.toBeNull();
  expect(table!.innerHTML).not.toMatch(/text-slate-/);
  const types = Array.from(table!.querySelectorAll('td span')).find((s) =>
    s.textContent?.includes('bail application'),
  )!;
  expect(types.className).toContain('text-nl-soft');
  const court = Array.from(table!.querySelectorAll('td span')).find((s) =>
    s.textContent?.includes('Patna High Court'),
  )!;
  expect(court.className).toContain('text-nl-muted');
  // an empty court is a dash, in the same token
  const dash = Array.from(table!.querySelectorAll('td span')).find((s) => s.textContent === '—')!;
  expect(dash.className).toContain('text-nl-muted');
  const date = Array.from(table!.querySelectorAll('td span')).find((s) =>
    s.textContent?.includes('2026'),
  )!;
  expect(date.className).toContain('text-nl-muted');
});
