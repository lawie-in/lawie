// T-689b: the documents list "Type" column shows the pack's label as written, else the
// humanised docType (capitalised).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import MyDocumentsPage from '@/app/dashboard/documents/page';
import { apiFetch } from '@/lib/apiFetch';

jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('@/lib/auth', () => ({ getAccessToken: jest.fn(() => 'tok') }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { plan: 'pro' } }) }));
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  usePathname: jest.fn(() => '/dashboard/documents'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));
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
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });

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

async function renderList(documents: Array<Record<string, unknown>>) {
  (apiFetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ documents }),
  });
  await act(async () => root.render(<MyDocumentsPage />));
  await flush();
}

const base = {
  title: 'Alpha',
  courtName: 'Patna High Court',
  status: 'draft',
  createdAt: '2026-10-01T00:00:00Z',
};

/** The Type cell's span for the row at `i`: the second cell of the row. */
function typeSpan(i = 0): HTMLElement {
  const row = container.querySelectorAll('tbody tr')[i] as HTMLElement;
  return row.querySelectorAll('td')[1].querySelector('span') as HTMLElement;
}

describe('T-689b: documents list Type column', () => {
  it('shows "Written Statement" for a written statement stored as petition, never "petition"', async () => {
    await renderList([
      { ...base, _id: 'a', docType: 'petition', docTypeLabel: 'Written Statement' },
    ]);
    expect(typeSpan().textContent).toBe('Written Statement');
    expect(typeSpan().textContent).not.toMatch(/petition/i);
    expect(typeSpan().classList.contains('capitalize')).toBe(false);
  });

  it('shows a pack label as written, brackets and case kept', async () => {
    await renderList([
      { ...base, _id: 'a', docType: 'petition', docTypeLabel: 'Divorce Petition (HMA, contested)' },
    ]);
    expect(typeSpan().textContent).toBe('Divorce Petition (HMA, contested)');
  });

  it.each([
    ['null', { docTypeLabel: null }],
    ['absent', {}],
    ['an empty string', { docTypeLabel: '' }],
  ])('falls back to the humanised docType, capitalised, when the label is %s', async (_n, over) => {
    await renderList([{ ...base, _id: 'a', docType: 'bail_application', ...over }]);
    expect(typeSpan().textContent).toBe('bail application');
    expect(typeSpan().classList.contains('capitalize')).toBe(true);
  });

  it('each row uses its own label', async () => {
    await renderList([
      { ...base, _id: 'a', docType: 'petition', docTypeLabel: 'Written Statement' },
      { ...base, _id: 'b', docType: 'petition', docTypeLabel: null },
    ]);
    expect(typeSpan(0).textContent).toBe('Written Statement');
    expect(typeSpan(1).textContent).toBe('petition');
  });
});
