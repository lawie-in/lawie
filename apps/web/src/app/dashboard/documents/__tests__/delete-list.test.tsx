import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import MyDocumentsPage from '@/app/dashboard/documents/page';
import { apiFetch } from '@/lib/apiFetch';

// T-115b — Delete from the My documents list. react-dom/client, as in the other web tests
// (@testing-library/dom is not installed). Strings are Ajay's signed ones.
jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiFetchMock = apiFetch as jest.Mock;
const DELETED = 'Document deleted.';
const DELETING = 'Deleting the document.';

const mk = (id: string, title: string) => ({
  _id: id,
  title,
  docType: 'bail_application',
  courtName: 'Patna High Court',
  status: 'draft',
  createdAt: '2026-10-01T00:00:00Z',
});
const DOCS = [mk('a', 'Alpha SECRET-A'), mk('b', 'Bravo SECRET-B'), mk('c', 'Charlie SECRET-C')];

let server: ReturnType<typeof mk>[];
let deleteStatus: number | 'throw';
let container: HTMLDivElement;
let root: Root;

const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });

async function mount(docs = DOCS) {
  server = [...docs];
  apiFetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      if (deleteStatus === 'throw') throw new Error('network');
      if (deleteStatus === 200 || deleteStatus === 404 || deleteStatus === 202) {
        const id = path.split('/').pop();
        server = server.filter((d) => d._id !== id);
      }
      return { status: deleteStatus, ok: deleteStatus === 200 };
    }
    return { ok: true, status: 200, json: async () => ({ documents: server }) };
  });
  await act(async () => root.render(<MyDocumentsPage />));
  await flush();
}

const dialog = () => document.body.querySelector('[role="alertdialog"]') as HTMLElement | null;
const rowBtn = (title: string) =>
  container.querySelector(`button[aria-label="Delete ${title}"]`) as HTMLButtonElement;
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
const statusText = () => container.querySelector('p[role="status"]')!.textContent;
const titleLink = (t: string) =>
  Array.from(container.querySelectorAll('a')).find((a) => a.textContent === t) as HTMLAnchorElement;
const h1 = () => container.querySelector('h1') as HTMLElement;

beforeEach(() => {
  deleteStatus = 200;
  window.sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  jest.useRealTimers();
  await act(async () => root.unmount());
  container.remove();
  apiFetchMock.mockReset();
});

describe('My documents list: delete (T-115b)', () => {
  it('has a last column with an sr-only "Actions" header and a labelled row button', async () => {
    await mount();
    const ths = Array.from(container.querySelectorAll('thead th'));
    const last = ths[ths.length - 1];
    expect(last.textContent).toBe('Actions');
    expect(last.querySelector('.sr-only')!.textContent).toBe('Actions');
    for (const d of DOCS) {
      const b = rowBtn(d.title);
      expect(b).not.toBeNull();
      // the button sits in the last cell of its row
      const cells = b.closest('tr')!.querySelectorAll('td');
      expect(cells[cells.length - 1].contains(b)).toBe(true);
    }
  });

  it('the row button opens the dialog and nothing is deleted until confirmed', async () => {
    await mount();
    await click(rowBtn('Bravo SECRET-B'));
    expect(dialog()).not.toBeNull();
    expect(apiFetchMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false);
  });

  it('Cancel closes the dialog and returns focus to the row button', async () => {
    await mount();
    const b = rowBtn('Bravo SECRET-B');
    b.focus();
    await click(b);
    const cancel = Array.from(dialog()!.querySelectorAll('button')).find(
      (x) => x.textContent === 'Cancel',
    );
    await click(cancel);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(b);
    expect(titleLink('Bravo SECRET-B')).toBeDefined();
  });

  it('200: row removed, "Document deleted.", focus on the next row title link', async () => {
    await mount();
    await click(rowBtn('Bravo SECRET-B'));
    await confirm();
    expect(dialog()).toBeNull();
    expect(titleLink('Bravo SECRET-B')).toBeUndefined();
    expect(statusText()).toBe(DELETED);
    expect(document.activeElement).toBe(titleLink('Charlie SECRET-C'));
  });

  it('deleting the last row moves focus to the previous row title link', async () => {
    await mount();
    await click(rowBtn('Charlie SECRET-C'));
    await confirm();
    expect(titleLink('Charlie SECRET-C')).toBeUndefined();
    expect(document.activeElement).toBe(titleLink('Bravo SECRET-B'));
  });

  it('deleting the only row moves focus to the h1', async () => {
    await mount([DOCS[0]]);
    await click(rowBtn('Alpha SECRET-A'));
    await confirm();
    expect(document.activeElement).toBe(h1());
    expect(statusText()).toBe(DELETED);
  });

  it('404 (already gone): row removed, "Document deleted."', async () => {
    deleteStatus = 404;
    await mount();
    await click(rowBtn('Alpha SECRET-A'));
    await confirm();
    expect(titleLink('Alpha SECRET-A')).toBeUndefined();
    expect(statusText()).toBe(DELETED);
  });

  it('202: row removed, "Deleting the document.", never "Document deleted."', async () => {
    deleteStatus = 202;
    await mount();
    await click(rowBtn('Alpha SECRET-A'));
    await confirm();
    expect(dialog()).toBeNull();
    expect(titleLink('Alpha SECRET-A')).toBeUndefined();
    expect(statusText()).toBe(DELETING);
    expect(container.textContent).not.toContain(DELETED);
    expect(document.activeElement).toBe(titleLink('Bravo SECRET-B'));
  });

  it('error: dialog stays open, row stays, no status line; retry then succeeds', async () => {
    deleteStatus = 500;
    await mount();
    await click(rowBtn('Alpha SECRET-A'));
    await confirm();
    expect(dialog()).not.toBeNull();
    expect(dialog()!.querySelector('[role="alert"]')).not.toBeNull();
    expect(titleLink('Alpha SECRET-A')).toBeDefined();
    expect(statusText()).toBe('');
    deleteStatus = 200;
    await confirm();
    expect(dialog()).toBeNull();
    expect(titleLink('Alpha SECRET-A')).toBeUndefined();
    expect(statusText()).toBe(DELETED);
  });

  it('a network failure leaves the row and shows the error', async () => {
    deleteStatus = 'throw';
    await mount();
    await click(rowBtn('Alpha SECRET-A'));
    await confirm();
    expect(dialog()!.querySelector('[role="alert"]')).not.toBeNull();
    expect(titleLink('Alpha SECRET-A')).toBeDefined();
  });

  it('the status line clears after 6 s, not before', async () => {
    jest.useFakeTimers();
    await mount();
    await click(rowBtn('Alpha SECRET-A'));
    await confirm();
    expect(statusText()).toBe(DELETED);
    await act(async () => {
      jest.advanceTimersByTime(5900);
    });
    expect(statusText()).toBe(DELETED);
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(statusText()).toBe('');
  });

  it('the 202 line clears after 6 s too', async () => {
    jest.useFakeTimers();
    deleteStatus = 202;
    await mount();
    await click(rowBtn('Alpha SECRET-A'));
    await confirm();
    expect(statusText()).toBe(DELETING);
    await act(async () => {
      jest.advanceTimersByTime(6100);
    });
    expect(statusText()).toBe('');
  });

  it('the list reloads after a delete (a 202 row that the server still hides stays out)', async () => {
    deleteStatus = 202;
    await mount();
    await click(rowBtn('Alpha SECRET-A'));
    server = server.filter((d) => d._id !== 'a'); // the server hides it while pending
    await confirm();
    const listCalls = apiFetchMock.mock.calls.filter((c) => !c[1]?.method);
    expect(listCalls.length).toBeGreaterThanOrEqual(2);
    expect(titleLink('Alpha SECRET-A')).toBeUndefined();
  });

  it('arriving after a delete on the document page: status line and focus on the h1', async () => {
    window.sessionStorage.setItem('lawie:document-delete-outcome', 'deleted');
    await mount();
    expect(statusText()).toBe(DELETED);
    expect(document.activeElement).toBe(h1());
  });

  it('arriving after a 202 on the document page shows "Deleting the document."', async () => {
    window.sessionStorage.setItem('lawie:document-delete-outcome', 'pending');
    await mount();
    expect(statusText()).toBe(DELETING);
    expect(container.textContent).not.toContain(DELETED);
  });

  it('no status line when arriving normally', async () => {
    await mount();
    expect(statusText()).toBe('');
  });

  it('never logs a title', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    deleteStatus = 'throw';
    await mount();
    await click(rowBtn('Alpha SECRET-A'));
    await confirm();
    deleteStatus = 200;
    await confirm();
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain('SECRET');
    spies.forEach((s) => s.mockRestore());
  });
});
