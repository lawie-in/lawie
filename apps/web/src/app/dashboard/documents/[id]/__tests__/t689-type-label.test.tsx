// T-689: the Document info panel's Type row shows the pack's label (as written, no capitalize)
// and falls back to the humanised docType (capitalised) when the label is null, absent or empty.
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

/** The value cell of the "Type" row in the Document info panel. */
function typeDd(): HTMLElement {
  const dt = Array.from(container.querySelectorAll('dt')).find((d) => d.textContent === 'Type');
  if (!dt) throw new Error('no Type row');
  return dt.nextElementSibling as HTMLElement;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('T-689: Document info Type row', () => {
  it('shows the pack label, not the stored enum, and does not capitalise it', async () => {
    await mount({ docType: 'petition', docTypeLabel: 'Written Statement' });
    const dd = typeDd();
    expect(dd.tagName).toBe('DD');
    expect(dd.textContent).toBe('Written Statement');
    expect(dd.textContent).not.toMatch(/petition/i);
    expect(dd.classList.contains('capitalize')).toBe(false);
  });

  it('keeps a bracketed label as written', async () => {
    await mount({ docTypeLabel: 'Divorce Petition (HMA, contested)' });
    expect(typeDd().textContent).toBe('Divorce Petition (HMA, contested)');
  });

  it.each([
    ['null', { docTypeLabel: null }],
    ['absent', {}],
    ['an empty string', { docTypeLabel: '' }],
  ])('falls back to the humanised docType, capitalised, when the label is %s', async (_n, over) => {
    await mount({ docType: 'bail_application', ...over });
    const dd = typeDd();
    expect(dd.textContent).toBe('bail application');
    expect(dd.classList.contains('capitalize')).toBe(true);
  });
});
