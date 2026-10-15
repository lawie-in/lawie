import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import DocumentEditorPage from '@/app/dashboard/documents/[id]/page';
import { takeDeleteOutcome } from '@/components/documents/DeleteDocumentDialog';
import { apiFetch } from '@/lib/apiFetch';

// T-115b — Delete document on the document page: the bottom button opens the dialog; on 200, 404
// or 202 it goes to /dashboard/documents (the list shows the line); on error it stays.
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ id: 'doc1' })),
  useRouter: jest.fn(() => ({ push })),
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

const apiFetchMock = apiFetch as jest.Mock;
const TITLE = 'Zorblax v. Quimby SECRET-TITLE';
let container: HTMLDivElement;
let root: Root;
let deleteStatus: number;

const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });

async function mount() {
  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      _id: 'doc1',
      title: TITLE,
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
    }),
  }));
  await act(async () => root.render(<DocumentEditorPage />));
  await flush();
}

const dialog = () => document.body.querySelector('[role="alertdialog"]') as HTMLElement | null;
const pageButton = () =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Delete document');
const click = async (el: Element | null | undefined) => {
  await act(async () => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
};
const confirm = async () =>
  click(
    Array.from(dialog()!.querySelectorAll('button')).find(
      (b) => b.textContent === 'Delete document',
    ),
  );

beforeEach(() => {
  push.mockReset();
  deleteStatus = 200;
  window.sessionStorage.clear();
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async () => ({ status: deleteStatus }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('Document page: Delete document (T-115b)', () => {
  it('has a "Delete document" button at the bottom of the page content, no dialog yet', async () => {
    await mount();
    const b = pageButton()!;
    expect(b).toBeDefined();
    expect(dialog()).toBeNull();
    // after the editor in document order
    const editor = container.querySelector('[data-testid="editor"]')!;
    expect(editor.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the button opens the dialog; Cancel closes it and navigates nowhere', async () => {
    await mount();
    const b = pageButton()!;
    b.focus();
    await click(b);
    expect(dialog()).not.toBeNull();
    expect(dialog()!.querySelector('h2')!.textContent).toBe('Delete this document?');
    await click(
      Array.from(dialog()!.querySelectorAll('button')).find((x) => x.textContent === 'Cancel'),
    );
    expect(dialog()).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(b);
  });

  it.each([
    [200, 'deleted'],
    [404, 'deleted'],
    [202, 'pending'],
  ])(
    'status %i goes to /dashboard/documents and leaves the outcome %s for the list',
    async (status, outcome) => {
      deleteStatus = status;
      await mount();
      await click(pageButton());
      await confirm();
      expect(apiFetchMock).toHaveBeenCalledWith('/api/documents/doc1', { method: 'DELETE' });
      expect(push).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith('/dashboard/documents');
      // sessionStorage holds the outcome only, never the id or title
      expect(JSON.stringify({ ...window.sessionStorage })).not.toContain('SECRET-TITLE');
      expect(takeDeleteOutcome()).toBe(outcome);
    },
  );

  it('an error keeps the dialog open with the signed line and does not navigate', async () => {
    deleteStatus = 500;
    await mount();
    await click(pageButton());
    await confirm();
    expect(push).not.toHaveBeenCalled();
    expect(dialog()!.querySelector('[role="alert"]')!.textContent).toBe(
      "We couldn't finish deleting this document. Please try again. If this keeps happening, write to us at privacy@lawie.in.",
    );
    expect(takeDeleteOutcome()).toBeNull();
    // retry
    deleteStatus = 200;
    await confirm();
    expect(push).toHaveBeenCalledWith('/dashboard/documents');
  });

  it('never logs the title', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    deleteStatus = 500;
    await mount();
    await click(pageButton());
    await confirm();
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain('SECRET-TITLE');
    spies.forEach((s) => s.mockRestore());
  });
});
