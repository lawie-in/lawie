import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import AnnexuresCard, { annexuresCardVisible } from '@/components/editor/AnnexuresCard';
import { downloadBlob } from '@/components/editor/exportUtils';

// T-381 — the Annexures card. Mounted with react-dom/client: @testing-library/dom is not installed,
// so React Testing Library cannot load. Strings are Ajay's signed ones, typed out independently of
// the source constant (handoff/legal/T-381-annexures-button-signed.md, Addenda 2 and 4).
const SIGNED = {
  button: 'Create annexures',
  help: 'Prepared from the details you entered.',
  loading: 'Preparing your annexures…',
  successTitle: 'Annexures created',
  successNote: 'Check each annexure and fill in every blank line before filing.',
  download: 'Download annexures (PDF)',
  error: "We couldn't create the annexures. Please try again.",
  retry: 'Try again',
  missingTitle: 'Party details are missing',
  missingBody: 'Add the names and roles of the parties to this draft, then try again.',
};

jest.mock('@/lib/auth', () => ({ getAccessToken: jest.fn(() => 'tok') }));
jest.mock('@/components/editor/exportUtils', () => ({
  ...jest.requireActual('@/components/editor/exportUtils'),
  downloadBlob: jest.fn(),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Reply {
  status: number;
  body?: unknown;
  disposition?: string | null;
  throws?: boolean;
}

let fetchMock: jest.Mock;
let container: HTMLDivElement;
let root: Root;

function respond(r: Reply) {
  // A thenable that rejects only when awaited, so no unhandled rejection before the card awaits it.
  if (r.throws) {
    return {
      then: (_ok: unknown, fail: (e: Error) => void) => fail(new Error('network')),
    } as unknown as Promise<never>;
  }
  const blob = new Blob(['%PDF']);
  return Promise.resolve({
    status: r.status,
    ok: r.status >= 200 && r.status < 300,
    json: async () => r.body,
    blob: async () => blob,
    headers: {
      get: (k: string) =>
        k.toLowerCase() === 'content-disposition' ? (r.disposition ?? null) : null,
    },
  });
}

const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });

async function mount() {
  await act(async () => root.render(<AnnexuresCard docId="d1" title="Bail Application — Patna" />));
}

const buttons = () => Array.from(container.querySelectorAll('button'));
const btn = (label: string) => buttons().find((b) => b.textContent === label);
const click = async (el: Element | undefined) => {
  await act(async () => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
};
const text = () => container.textContent ?? '';

beforeEach(() => {
  fetchMock = jest.fn();
  (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  (downloadBlob as jest.Mock).mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('annexuresCardVisible', () => {
  it.each([
    [{ courtDocument: true, hasParty: true }, true],
    [{ courtDocument: true, hasParty: false }, false],
    [{ courtDocument: false, hasParty: true }, false],
    [{ courtDocument: true }, false],
    [{ hasParty: true }, false],
    [{}, false],
    [{ courtDocument: null, hasParty: null }, false],
  ])('%j -> %s', (doc, expected) => {
    expect(annexuresCardVisible(doc)).toBe(expected);
  });
});

describe('AnnexuresCard idle', () => {
  it('shows the signed region, help and button, and nothing else', async () => {
    await mount();
    const region = container.querySelector('[role="region"]')!;
    expect(region.getAttribute('aria-labelledby')).toBeTruthy();
    expect(container.querySelector('h2')!.textContent).toBe('Annexures');
    expect(text()).toContain(SIGNED.help);
    expect(btn(SIGNED.button)).toBeDefined();
    expect(btn(SIGNED.button)!.getAttribute('aria-busy')).toBe('false');
    expect(text()).not.toContain(SIGNED.successTitle);
    expect(text()).not.toContain(SIGNED.missingTitle);
    expect(container.querySelector('[role="alert"]')!.textContent).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never says "free"', async () => {
    await mount();
    expect(text().toLowerCase()).not.toContain('free');
  });
});

describe('AnnexuresCard create', () => {
  it('loading (aria-busy, double click ignored) then success with the download', async () => {
    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    await mount();
    await click(btn(SIGNED.button));

    const loading = btn(SIGNED.loading)!;
    expect(loading.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector('[role="status"]')!.textContent).toBe(SIGNED.loading);
    await click(loading);
    await click(loading);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/documents\/d1\/annexures-pack$/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer tok' },
    });

    await act(async () => {
      resolve(
        await respond({ status: 200, disposition: 'attachment; filename="Bail_annexures.pdf"' }),
      );
    });
    await flush();

    expect(text()).toContain(SIGNED.successTitle);
    expect(text()).toContain(SIGNED.successNote);
    expect(container.querySelector('[role="status"]')!.textContent).toBe(SIGNED.successTitle);
    expect(downloadBlob).not.toHaveBeenCalled();
    await click(btn(SIGNED.download));
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, filename] = (downloadBlob as jest.Mock).mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(filename).toBe('Bail_annexures.pdf');
  });

  it('uses a title-based file name when the server sends none', async () => {
    fetchMock.mockReturnValueOnce(respond({ status: 200 }));
    await mount();
    await click(btn(SIGNED.button));
    await click(btn(SIGNED.download));
    expect((downloadBlob as jest.Mock).mock.calls[0][1]).toBe(
      'Bail Application  Patna_annexures.pdf',
    );
  });

  it('a second press after success makes a fresh pack', async () => {
    fetchMock.mockReturnValue(respond({ status: 200 }));
    await mount();
    await click(btn(SIGNED.button));
    await click(btn(SIGNED.button));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('AnnexuresCard 422 party_details_missing', () => {
  const cases: Array<[string[], string]> = [
    [['client_role'], "Add the client's role to this draft, then try again."],
    [['client_name'], "Add the client's name to this draft, then try again."],
    [['opposite_party_name'], "Add the opposite party's name to this draft, then try again."],
    [
      ['client_name', 'opposite_party_name'],
      "Add the client's name and the opposite party's name to this draft, then try again.",
    ],
    [
      ['opposite_party_name', 'client_name'],
      "Add the client's name and the opposite party's name to this draft, then try again.",
    ],
    [
      ['client_role', 'opposite_party_name'],
      "Add the client's role and the opposite party's name to this draft, then try again.",
    ],
    [[], SIGNED.missingBody],
    [['something_else'], SIGNED.missingBody],
  ];

  it.each(cases)('missing %j -> the exact line, and no download', async (missing, line) => {
    fetchMock.mockReturnValueOnce(
      respond({ status: 422, body: { error: 'party_details_missing', missing } }),
    );
    await mount();
    await click(btn(SIGNED.button));

    expect(container.querySelector('h3')!.textContent).toBe(SIGNED.missingTitle);
    expect(text()).toContain(line);
    expect(container.querySelector('[role="status"]')!.textContent).toBe(
      `${SIGNED.missingTitle}. ${line}`,
    );
    expect(btn(SIGNED.download)).toBeUndefined();
    expect(text()).not.toContain(SIGNED.successTitle);
    expect(text()).not.toContain(SIGNED.error);
    expect(btn(SIGNED.retry)).toBeUndefined();
    expect(btn(SIGNED.button)).toBeDefined();
  });

  it('a 422 with another error is a plain error', async () => {
    fetchMock.mockReturnValueOnce(respond({ status: 422, body: { error: 'other' } }));
    await mount();
    await click(btn(SIGNED.button));
    expect(text()).toContain(SIGNED.error);
    expect(text()).not.toContain(SIGNED.missingTitle);
  });
});

describe('AnnexuresCard errors', () => {
  it.each([
    ['500', { status: 500 }],
    ['404', { status: 404 }],
    ['network failure', { status: 0, throws: true }],
  ])('%s: the signed error and "Try again", which retries', async (_n, reply) => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockReturnValueOnce(respond(reply)).mockReturnValueOnce(respond({ status: 200 }));
    await mount();
    await click(btn(SIGNED.button));

    expect(container.querySelector('[role="alert"]')!.textContent).toContain(SIGNED.error);
    expect(btn(SIGNED.download)).toBeUndefined();
    await click(btn(SIGNED.retry));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(text()).toContain(SIGNED.successTitle);
    expect(container.querySelector('[role="alert"]')!.textContent).toBe('');
    spy.mockRestore();
  });

  it('no token: the error, and no request', async () => {
    const { getAccessToken } = jest.requireMock('@/lib/auth') as { getAccessToken: jest.Mock };
    getAccessToken.mockReturnValueOnce(null);
    await mount();
    await click(btn(SIGNED.button));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(text()).toContain(SIGNED.error);
  });

  it('the network error logs its name only', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockReturnValueOnce(respond({ status: 0, throws: true }));
    await mount();
    await click(btn(SIGNED.button));
    expect(spy).toHaveBeenCalledWith('[annexures-pack] failed:', 'Error');
    spy.mockRestore();
  });
});
