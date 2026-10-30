import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import DocumentEditorPage from '@/app/dashboard/documents/[id]/page';

// T-705 — the Revise button on the document page: shown only when the server says `revisable`;
// it opens the dialog with the free line (count 0) or the costs line; closing stale reloads.
jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ id: 'doc1' })),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  usePathname: jest.fn(() => '/dashboard/documents/doc1'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));
jest.mock('@/lib/auth', () => ({ getAccessToken: jest.fn(() => 'tok') }));
jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { plan: 'pro' } }) }));
jest.mock('@/components/editor/DocumentEditor', () => ({
  __esModule: true,
  default: () => <div data-testid="editor" />,
}));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let fetchMock: jest.Mock;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });

async function mount(extra: Record<string, unknown>) {
  fetchMock = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      _id: 'doc1',
      title: 'T',
      docType: 'bail_application',
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
      ...extra,
    }),
  }));
  (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  await act(async () => root.render(<DocumentEditorPage />));
  await flush();
}
const reviseBtn = () =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Revise');
const dialog = () =>
  document.body.querySelector('[role="alertdialog"], [role="dialog"]') as HTMLElement | null;
const click = async (el: Element | null | undefined) => {
  await act(async () => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('Document page: Revise (T-705)', () => {
  it('no Revise button when the document is not revisable (false or absent)', async () => {
    await mount({ revisable: false });
    expect(reviseBtn()).toBeUndefined();
    await act(async () => root.unmount());
    root = createRoot(container);
    await mount({});
    expect(reviseBtn()).toBeUndefined();
  });

  it('a revisable document with no revisions: Revise opens the dialog with the free line', async () => {
    await mount({
      revisable: true,
      revisions: { count: 0, freeUsed: false },
      revisionLimit: 10,
      originalInk: 2,
    });
    expect(dialog()).toBeNull();
    await click(reviseBtn());
    expect(dialog()!.querySelector('h2')!.textContent).toBe('Revise this draft');
    expect(dialog()!.textContent).toContain('Your first revision of this draft is free.');
  });

  it('after a revision the dialog shows the cost; Cancel closes it', async () => {
    await mount({
      revisable: true,
      revisions: { count: 1, freeUsed: true },
      revisionLimit: 10,
      originalInk: 2,
    });
    await click(reviseBtn());
    expect(dialog()!.textContent).toContain('This revision costs 2 Ink.');
    await click(
      Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent === 'Cancel'),
    );
    expect(dialog()).toBeNull();
  });

  it('at the limit the dialog shows the signed limit line', async () => {
    await mount({
      revisable: true,
      revisions: { count: 10, freeUsed: true },
      revisionLimit: 10,
      originalInk: 2,
    });
    await click(reviseBtn());
    expect(dialog()!.textContent).toContain('Revision limit reached for this draft (10).');
  });
});
