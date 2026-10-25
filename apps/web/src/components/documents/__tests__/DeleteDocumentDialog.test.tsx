import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import DeleteDocumentDialog, {
  takeDeleteOutcome,
  rememberDeleteOutcome,
} from '@/components/documents/DeleteDocumentDialog';
import { apiFetch } from '@/lib/apiFetch';

// T-115b — the delete dialog. @testing-library/dom is not installed (RTL cannot load), so this
// mounts with react-dom/client like the other web tests. Strings are Ajay's signed ones, typed
// out here independently of the source constant (handoff/legal/dpdp-v1-calls-signed.md).
const SIGNED = {
  title: 'Delete this document?',
  body: 'This deletes the document and everything in it, including its drafts and annexures. You cannot undo this. Ink used on it is not refunded.',
  backups: 'Backup copies are erased within 7 days.',
  confirm: 'Delete document',
  cancel: 'Cancel',
  working: 'Deleting...',
  workingStatus: 'Deleting the document.',
  error:
    "We couldn't finish deleting this document. Please try again. If this keeps happening, write to us at contact@lawie.in.",
};
const TITLE = 'Zorblax v. Quimby SECRET-TITLE';

jest.mock('@/lib/apiFetch', () => ({ apiFetch: jest.fn() }));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiFetchMock = apiFetch as jest.Mock;
let container: HTMLDivElement;
let root: Root;
let opener: HTMLButtonElement;
const onClose = jest.fn();
const onDeleted = jest.fn();

const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });

function deferred() {
  let resolve!: (r: { status: number }) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<{ status: number }>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function mount(extra: Partial<React.ComponentProps<typeof DeleteDocumentDialog>> = {}) {
  opener = document.createElement('button');
  opener.textContent = 'opener';
  document.body.appendChild(opener);
  opener.focus();
  await act(async () =>
    root.render(
      <DeleteDocumentDialog
        documentId="doc1"
        title={TITLE}
        onClose={onClose}
        onDeleted={onDeleted}
        {...extra}
      />,
    ),
  );
}

const dialog = () => document.body.querySelector('[role="alertdialog"]') as HTMLElement;
const btn = (label: string) =>
  Array.from(dialog().querySelectorAll('button')).find((b) => b.textContent?.trim() === label) as
    | HTMLButtonElement
    | undefined;
const click = async (el: Element | null | undefined) => {
  await act(async () => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
};
const key = async (k: string, shiftKey = false) => {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true }));
  });
};
const backdrop = () => dialog().parentElement as HTMLElement;

beforeEach(() => {
  onClose.mockReset();
  onDeleted.mockReset();
  apiFetchMock.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  opener?.remove();
});

describe('DeleteDocumentDialog (T-115b)', () => {
  it('shows the signed strings, exactly', async () => {
    await mount();
    const d = dialog();
    expect(d.querySelector('h2')!.textContent).toBe(SIGNED.title);
    const ps = Array.from(d.querySelectorAll('p')).map((p) => p.textContent);
    expect(ps).toContain(SIGNED.body);
    expect(ps).toContain(SIGNED.backups);
    // the backups line is the last line of the description
    const desc = document.getElementById(d.getAttribute('aria-describedby')!)!;
    expect(desc.lastElementChild!.textContent).toBe(SIGNED.backups);
    expect(btn(SIGNED.confirm)).toBeDefined();
    expect(btn(SIGNED.cancel)).toBeDefined();
  });

  it('uses none of the banned words', async () => {
    await mount();
    const t = dialog().textContent!;
    expect(t).not.toMatch(/Nothing was deleted/i);
    expect(t).not.toMatch(/permanently/i);
    expect(t).not.toMatch(/immediately/i);
    expect(t).not.toMatch(/\bfree\b/i);
  });

  it('is an alertdialog, modal, labelled and described', async () => {
    await mount();
    const d = dialog();
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(d.getAttribute('aria-labelledby')!)!.textContent).toBe(
      SIGNED.title,
    );
    expect(document.getElementById(d.getAttribute('aria-describedby')!)!.textContent).toContain(
      SIGNED.body,
    );
  });

  it('puts initial focus on Cancel and traps Tab both ways', async () => {
    await mount();
    expect(document.activeElement).toBe(btn(SIGNED.cancel));
    // Tab from the last control (Delete) wraps to Cancel; Shift+Tab from Cancel wraps to Delete.
    btn(SIGNED.confirm)!.focus();
    await key('Tab');
    expect(document.activeElement).toBe(btn(SIGNED.cancel));
    await key('Tab', true);
    expect(document.activeElement).toBe(btn(SIGNED.confirm));
  });

  it('hides the page behind from assistive tech while open', async () => {
    await mount();
    expect(container.getAttribute('aria-hidden')).toBe('true');
  });

  it.each([
    ['Escape', async () => key('Escape')],
    ['the backdrop', async () => click(backdrop())],
    ['Cancel', async () => click(btn(SIGNED.cancel))],
  ])('%s closes it', async (_n, act1) => {
    await mount();
    await act1();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('a click inside the dialog does not close it', async () => {
    await mount();
    await click(dialog());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('returns focus to the opener on close', async () => {
    await mount();
    await act(async () => root.unmount());
    expect(document.activeElement).toBe(opener);
    root = createRoot(container);
  });

  it('returns focus to the fallback when the opener is gone', async () => {
    const h1 = document.createElement('h1');
    h1.tabIndex = -1;
    document.body.appendChild(h1);
    await mount({ fallbackFocusRef: { current: h1 } });
    opener.remove();
    await act(async () => root.unmount());
    expect(document.activeElement).toBe(h1);
    h1.remove();
    root = createRoot(container);
  });

  it('sends DELETE /api/documents/:id, and shows the working state while it runs', async () => {
    const d = deferred();
    apiFetchMock.mockReturnValueOnce(d.promise);
    await mount();
    await click(btn(SIGNED.confirm));
    expect(apiFetchMock).toHaveBeenCalledWith('/api/documents/doc1', { method: 'DELETE' });

    const working = btn(SIGNED.working)!;
    expect(working).toBeDefined();
    expect(working.getAttribute('aria-disabled')).toBe('true');
    expect(dialog().querySelector('[role="status"]')!.textContent).toBe(SIGNED.workingStatus);

    // Escape, backdrop, Cancel are ignored; a second press does not send a second request.
    await key('Escape');
    await click(backdrop());
    await click(btn(SIGNED.cancel));
    await click(working);
    expect(onClose).not.toHaveBeenCalled();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    await act(async () => d.resolve({ status: 200 }));
    await flush();
    expect(onDeleted).toHaveBeenCalledWith('deleted');
  });

  it.each([
    [200, 'deleted'],
    [404, 'deleted'],
    [202, 'pending'],
  ])('status %i calls onDeleted(%s)', async (status, outcome) => {
    apiFetchMock.mockResolvedValueOnce({ status });
    await mount();
    await click(btn(SIGNED.confirm));
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledWith(outcome);
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([[500], [403], [400], [401]])(
    'status %i: signed error, dialog stays open, Delete enabled for retry',
    async (status) => {
      apiFetchMock.mockResolvedValueOnce({ status });
      await mount();
      await click(btn(SIGNED.confirm));
      expect(onDeleted).not.toHaveBeenCalled();
      const alert = dialog().querySelector('[role="alert"]')!;
      expect(alert.textContent).toBe(SIGNED.error);
      const del = btn(SIGNED.confirm)!;
      expect(del.getAttribute('aria-disabled')).toBeNull();
      expect(dialog().querySelector('[role="status"]')!.textContent).toBe('');
    },
  );

  it('a network failure shows the error; retry succeeds and clears it', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('network'));
    apiFetchMock.mockResolvedValueOnce({ status: 200 });
    await mount();
    await click(btn(SIGNED.confirm));
    expect(dialog().querySelector('[role="alert"]')!.textContent).toBe(SIGNED.error);

    await click(btn(SIGNED.confirm));
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(onDeleted).toHaveBeenCalledWith('deleted');
  });

  it('Cancel and Escape work again after an error', async () => {
    apiFetchMock.mockResolvedValueOnce({ status: 500 });
    await mount();
    await click(btn(SIGNED.confirm));
    await key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('never logs the title or sends it anywhere but the dialog text', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    apiFetchMock.mockRejectedValueOnce(new Error(`network ${TITLE}`));
    await mount();
    await click(btn(SIGNED.confirm));
    expect(JSON.stringify(spies.flatMap((s) => s.mock.calls))).not.toContain('SECRET-TITLE');
    // The request carries the id only.
    expect(JSON.stringify(apiFetchMock.mock.calls)).not.toContain('SECRET-TITLE');
    spies.forEach((s) => s.mockRestore());
  });

  it('remembers and takes the outcome once, and ignores junk', () => {
    expect(takeDeleteOutcome()).toBeNull();
    rememberDeleteOutcome('pending');
    expect(takeDeleteOutcome()).toBe('pending');
    expect(takeDeleteOutcome()).toBeNull();
    window.sessionStorage.setItem('lawie:document-delete-outcome', 'junk');
    expect(takeDeleteOutcome()).toBeNull();
    // Only the outcome is stored, never an id or title.
    rememberDeleteOutcome('deleted');
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain('doc1');
    takeDeleteOutcome();
  });
});
