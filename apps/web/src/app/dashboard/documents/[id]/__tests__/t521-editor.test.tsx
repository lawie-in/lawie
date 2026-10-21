// T-521: the editor page's load states (skeleton, Retry on a failed load, none on 404), the
// #export focus, and the export-failure banner (signed "Could not export. Try again." + Retry).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import DocumentEditorPage from '@/app/dashboard/documents/[id]/page';
import { exportDocx } from '@/components/editor/exportUtils';

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
jest.mock('@/components/editor/exportUtils', () => ({
  ...jest.requireActual('@/components/editor/exportUtils'),
  exportDocx: jest.fn(),
}));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOC = {
  _id: 'doc1',
  title: 'Alpha petition',
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
};
const reply = (status: number, body: unknown = DOC) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

let container: HTMLDivElement;
let root: Root;
let fetchMock: jest.Mock;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });
const text = () => container.textContent ?? '';
const btn = (label: string) =>
  Array.from(container.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === label,
  );
const render = async () => {
  await act(async () => root.render(<DocumentEditorPage />));
  await flush();
};
const click = async (el: Element | undefined) => {
  await act(async () => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
};

beforeEach(() => {
  push.mockReset();
  (exportDocx as jest.Mock).mockReset();
  window.history.replaceState(null, '', '/dashboard/documents/doc1');
  fetchMock = jest.fn();
  (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

describe('Editor page load states (T-521)', () => {
  it('loading: a busy skeleton, not the editor', async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    await render();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="editor"]')).toBeNull();
  });

  it('a failed load (500) shows the signed line and Retry, which loads again', async () => {
    fetchMock.mockResolvedValueOnce(reply(500, {}));
    await render();
    expect(text()).toContain('Something did not work. Try again.');
    expect(btn('Retry')).toBeDefined();
    expect(btn('Back to dashboard')).toBeDefined();
    fetchMock.mockResolvedValueOnce(reply(200));
    await click(btn('Retry'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="editor"]')).not.toBeNull();
    expect(text()).not.toContain('Something did not work');
  });

  it('a network failure on load is the same: signed line and Retry', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    await render();
    expect(text()).toContain('Something did not work. Try again.');
    expect(btn('Retry')).toBeDefined();
  });

  it('Retry shows the skeleton again while loading', async () => {
    fetchMock.mockResolvedValueOnce(reply(500, {}));
    await render();
    fetchMock.mockReturnValueOnce(new Promise(() => undefined));
    await click(btn('Retry'));
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(btn('Retry')).toBeUndefined();
  });

  it('404: "Document not found", no Retry, a way back', async () => {
    fetchMock.mockResolvedValueOnce(reply(404, {}));
    await render();
    expect(text()).toContain('Document not found');
    expect(btn('Retry')).toBeUndefined();
    await click(btn('Back to dashboard'));
    expect(push).toHaveBeenCalledWith('/dashboard');
  });
});

describe('Editor #export focus (T-521)', () => {
  it('with #export on load, the PDF export button is focused', async () => {
    window.history.replaceState(null, '', '/dashboard/documents/doc1#export');
    fetchMock.mockResolvedValue(reply(200));
    await render();
    expect(btn('PDF')).toBeDefined();
    expect(document.activeElement).toBe(btn('PDF'));
  });

  it('without the hash, nothing is focused on load', async () => {
    fetchMock.mockResolvedValue(reply(200));
    await render();
    expect(document.activeElement).not.toBe(btn('PDF'));
  });

  it('a different hash does not focus the export button', async () => {
    window.history.replaceState(null, '', '/dashboard/documents/doc1#other');
    fetchMock.mockResolvedValue(reply(200));
    await render();
    expect(document.activeElement).not.toBe(btn('PDF'));
  });

  it('focus waits for the document: not focused while it is still loading', async () => {
    window.history.replaceState(null, '', '/dashboard/documents/doc1#export');
    fetchMock.mockReturnValue(new Promise(() => undefined));
    await render();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('Editor export failure banner (T-521)', () => {
  it('shows the signed line with Retry; Retry exports again in the same format', async () => {
    fetchMock.mockResolvedValue(reply(200));
    (exportDocx as jest.Mock).mockRejectedValue(new Error('boom'));
    await render();
    await click(btn('DOCX'));
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain('Could not export. Try again.');
    expect(alert.textContent).not.toContain('Export failed');
    const retry = Array.from(alert.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Retry',
    );
    expect(retry).toBeDefined();
    expect(retry!.className).toContain('min-h-[44px]');
    await click(retry);
    expect(exportDocx).toHaveBeenCalledTimes(2);
  });

  it('dismiss closes the banner and returns focus to the export button', async () => {
    fetchMock.mockResolvedValue(reply(200));
    (exportDocx as jest.Mock).mockRejectedValue(new Error('boom'));
    await render();
    await click(btn('DOCX'));
    await click(container.querySelector('button[aria-label="Dismiss export error"]')!);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(document.activeElement).toBe(btn('DOCX'));
  });
});

describe('Editor worst-case load (break-ui)', () => {
  it('a 255-char unbroken guided title and a 40-page body load; the title block can shrink and break', async () => {
    const title = 'श्रीमती'.repeat(10) + 'Bartholomew'.repeat(15);
    fetchMock.mockResolvedValue(
      reply(200, {
        ...DOC,
        docType: 'guided',
        title: title.slice(0, 255),
        content: `<p>${'Paragraph text. '.repeat(15000)}</p>`,
      }),
    );
    await render();
    expect(container.querySelector('[data-testid="editor"]')).not.toBeNull();
    const h1 = container.querySelector('h1')!;
    expect(h1.textContent).toBe(title.slice(0, 255));
    expect(h1.parentElement!.className).toContain('min-w-0');
    expect(h1.parentElement!.className).toContain('break-words');
    expect(btn('PDF')).toBeDefined();
    expect(btn('DOCX')).toBeDefined();
  });
});
