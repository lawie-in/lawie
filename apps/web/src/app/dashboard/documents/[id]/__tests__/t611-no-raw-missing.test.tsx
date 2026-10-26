// T-611 Phase A (AC1, AC5, P7): a raw {{MISSING: label}} token never reaches the editor. The page
// converts content at load; the editor converts what it is given (plain text and HTML alike); the
// blank count reads both forms alike, so it does not change.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import DocumentEditorPage from '@/app/dashboard/documents/[id]/page';
import DocumentEditor from '@/components/editor/DocumentEditor';
import { findBlanks } from '@/components/editor/exportUtils';

jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ id: 'doc1' })),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  usePathname: jest.fn(() => '/dashboard/documents/doc1'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));
jest.mock('@/lib/auth', () => ({ getAccessToken: jest.fn(() => 'tok') }));
jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { plan: 'pro' } }) }));
const mockEditorProps: Array<{ initialContent: string }> = [];
jest.mock('@/components/editor/DocumentEditor', () => {
  const actual = jest.requireActual('@/components/editor/DocumentEditor');
  return {
    __esModule: true,
    default: (p: { initialContent: string }) => {
      mockEditorProps.push({ initialContent: p.initialContent });
      return <div data-testid="editor" />;
    },
    __actual: actual,
  };
});
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RAW =
  '<p>1. That the cheque is for {{MISSING: Amount in Words}}.</p><p>2. Dated {{missing: Cheque Date}}, sale deed {{MISSING: Sale deed date}}.</p>';

let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });

beforeEach(() => {
  mockEditorProps.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('page load', () => {
  it('converts a raw token served by an older response before it reaches the editor', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        _id: 'doc1',
        title: 'Legal notice',
        docType: 'petition',
        courtType: 'high_court',
        courtName: 'Patna High Court',
        content: RAW,
        status: 'draft',
        sectionsCited: [],
        filingChecklist: [],
        checklistState: [],
        exportedAs: [],
        version: 1,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      }),
    }));
    await act(async () => root.render(<DocumentEditorPage />));
    await flush();
    expect(mockEditorProps.length).toBeGreaterThan(0);
    for (const p of mockEditorProps) {
      expect(p.initialContent).not.toMatch(/\{\{\s*MISSING/i);
      expect(p.initialContent).toContain('[To be confirmed: Amount in Words]');
      expect(p.initialContent).toContain('[To be confirmed: Cheque Date]');
    }
    // the blank count is the same read of either form
    const converted = mockEditorProps[mockEditorProps.length - 1].initialContent;
    expect(findBlanks(converted)).toHaveLength(findBlanks(RAW).length);
    expect(findBlanks(RAW)).toHaveLength(3);
  });
});

describe('editor initial HTML', () => {
  const Real = (
    jest.requireMock('@/components/editor/DocumentEditor') as {
      __actual: { default: typeof DocumentEditor };
    }
  ).__actual.default;

  it.each([
    ['HTML', RAW],
    ['plain text', '1. For {{MISSING: Amount in Words}}.\n\n2. On {{MISSING: Cheque Date}}.'],
  ])('%s content shows [To be confirmed: x] and no {{MISSING', async (_n, content) => {
    await act(async () =>
      root.render(<Real initialContent={content} onUpdate={() => undefined} />),
    );
    await flush();
    const shown = container.querySelector('.ProseMirror')?.innerHTML ?? '';
    expect(shown).toContain('[To be confirmed: Amount in Words]');
    expect(shown).not.toMatch(/\{\{\s*MISSING/i);
    expect(container.textContent).not.toMatch(/\{\{\s*MISSING/i);
  });
});
