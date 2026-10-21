// T-521 round 2: the editor page with no access token shows the signed generic error and Retry,
// not a skeleton that never ends. First load, and after Retry.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import DocumentEditorPage from '@/app/dashboard/documents/[id]/page';
import { getAccessToken } from '@/lib/auth';

jest.mock('next/navigation', () => ({
  useParams: jest.fn(() => ({ id: 'doc1' })),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  usePathname: jest.fn(() => '/dashboard/documents/doc1'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));
jest.mock('@/lib/auth', () => ({ getAccessToken: jest.fn() }));
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
const retry = () =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Retry');

beforeEach(() => {
  (getAccessToken as jest.Mock).mockReturnValue(null);
  fetchMock = jest.fn();
  (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('Editor page with no access token (T-521 round 2)', () => {
  it('first load: the signed error and Retry, no skeleton, no request', async () => {
    await act(async () => root.render(<DocumentEditorPage />));
    await flush();
    expect(container.textContent).toContain('Something did not work. Try again.');
    expect(retry()).toBeDefined();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Retry with still no token returns to the error, not an endless skeleton', async () => {
    await act(async () => root.render(<DocumentEditorPage />));
    await flush();
    await act(async () => retry()!.click());
    await flush();
    expect(container.textContent).toContain('Something did not work. Try again.');
    expect(retry()).toBeDefined();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Retry once a token exists loads the document', async () => {
    await act(async () => root.render(<DocumentEditorPage />));
    await flush();
    (getAccessToken as jest.Mock).mockReturnValue('tokenword');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        _id: 'doc1',
        title: 'T',
        docType: 'x',
        courtType: 'y',
        courtName: 'z',
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
    });
    await act(async () => retry()!.click());
    await flush();
    expect(container.querySelector('[data-testid="editor"]')).not.toBeNull();
  });
});
