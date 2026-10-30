// T-689b: the document page header (h1) shows the pack's label (as written), the title for a
// guided document, and the humanised docType when there is no label.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import DocumentEditorPage from '@/app/dashboard/documents/[id]/page';

jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ id: 'doc1' })),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  usePathname: jest.fn(() => '/dashboard/documents/doc1'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));
jest.mock('@/lib/auth', () => ({ getAccessToken: jest.fn(() => 'tok') }));
jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { plan: 'free' } }) }));
jest.mock('@/components/ui/motion', () => ({
  ...jest.requireActual('@/components/ui/motion'),
  useMediaQuery: jest.fn(() => false),
}));
jest.mock('@/components/editor/DocumentEditor', () => ({
  __esModule: true,
  default: () => <div data-testid="editor" />,
}));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });

async function mount(over: Record<string, unknown> = {}) {
  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      _id: 'doc1',
      title: 'Reply to the suit',
      docType: 'petition',
      courtType: 'high_court',
      courtName: 'Patna High Court',
      content: '<p>x</p>',
      status: 'draft',
      sectionsCited: [],
      filingChecklist: [],
      checklistState: [],
      exportedAs: [],
      version: 1,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      ...over,
    }),
  }));
  await act(async () => root.render(<DocumentEditorPage />));
  await flush();
}

const h1 = (): HTMLElement => container.querySelector('h1') as HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('T-689b: document page header', () => {
  it('a written statement stored as petition shows "Written Statement", never "petition"', async () => {
    await mount({ docType: 'petition', docTypeLabel: 'Written Statement' });
    expect(h1().textContent).toBe('Written Statement');
    expect(h1().textContent).not.toMatch(/petition/i);
    expect(h1().classList.contains('capitalize')).toBe(false);
  });

  it('header and Document info Type row show the same label', async () => {
    await mount({ docType: 'petition', docTypeLabel: 'Written Statement' });
    const dt = Array.from(container.querySelectorAll('dt')).find((d) => d.textContent === 'Type')!;
    expect(dt.nextElementSibling!.textContent).toBe(h1().textContent);
  });

  it('a pack label is not lower-cased or mangled', async () => {
    await mount({ docTypeLabel: 'Divorce Petition (HMA, contested)' });
    expect(h1().textContent).toBe('Divorce Petition (HMA, contested)');
    expect(h1().classList.contains('capitalize')).toBe(false);
  });

  it('a guided document shows its title, even if a label is sent', async () => {
    await mount({ docType: 'guided', title: 'My own typed name', docTypeLabel: 'Something' });
    expect(h1().textContent).toBe('My own typed name');
    expect(h1().classList.contains('capitalize')).toBe(true);
  });

  it.each([
    ['null', { docTypeLabel: null }],
    ['absent', {}],
    ['an empty string', { docTypeLabel: '' }],
  ])(
    'falls back to the humanised docType (capitalised by CSS) when the label is %s',
    async (_n, over) => {
      await mount({ docType: 'bail_application', ...over });
      expect(h1().textContent).toBe('bail application');
      expect(h1().classList.contains('capitalize')).toBe(true);
    },
  );
});
