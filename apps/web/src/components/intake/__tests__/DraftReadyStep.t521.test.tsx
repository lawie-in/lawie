// T-521 (AC2): the draft-ready view. Ink-used chip, Finalise (primary) -> PATCH finalised,
// Export, no Regenerate. Sentinels are plain words.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { DraftResult } from '../briefTypes';
import DraftReadyStep from '../DraftReadyStep';
import { EXPORT_HASH, finaliseDocument } from '../draftActions';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockGetToken = jest.fn();
jest.mock('@/lib/auth', () => ({ getAccessToken: () => mockGetToken() }));

const base: DraftResult = {
  docId: 'doc42',
  name: 'Bail application',
  rulePack: true,
  startingDraft: false,
  startingDraftLabel: null,
  labelReason: null,
  missingClauses: [],
  findings: [],
  blanks: 0,
  factCheck: null,
  disclaimer: null,
};

let container: HTMLDivElement;
let root: Root;
let fetchMock: jest.Mock;
const onOpenEditor = jest.fn();
const onStartAnother = jest.fn();
const onExport = jest.fn();
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const btn = (t: string) =>
  Array.from(container.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === t,
  ) as HTMLButtonElement | undefined;
const text = () => container.textContent ?? '';
const mount = (result: Partial<DraftResult> = {}, withExport = true) =>
  act(async () => {
    root.render(
      <DraftReadyStep
        result={{ ...base, ...result }}
        onOpenEditor={onOpenEditor}
        onStartAnother={onStartAnother}
        onExport={withExport ? onExport : undefined}
      />,
    );
  });
const click = async (b: HTMLButtonElement | undefined) => {
  await act(async () => b!.click());
  await flush();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetToken.mockReturnValue('tokenword');
  fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('DraftReadyStep Ink chip', () => {
  it('shows "{n} Ink used" when inkUsed is set', async () => {
    await mount({ inkUsed: 3 });
    const chip = container.querySelector('[data-testid="ink-used-chip"]')!;
    expect(chip).not.toBeNull();
    expect(chip.textContent?.replace(/\s+/g, ' ').trim()).toContain('3 Ink used');
  });
  it('shows "0 Ink used" for a zero cost (a number, not unknown)', async () => {
    await mount({ inkUsed: 0 });
    expect(text()).toContain('0 Ink used');
  });
  it('is hidden when inkUsed is unknown', async () => {
    await mount({});
    expect(container.querySelector('[data-testid="ink-used-chip"]')).toBeNull();
    expect(text()).not.toContain('Ink used');
  });
});

describe('DraftReadyStep actions', () => {
  it('has Finalise, Export and Open in editor; no Regenerate anywhere', async () => {
    await mount({ inkUsed: 2 });
    expect(btn('Finalise')).toBeDefined();
    expect(btn('Export')).toBeDefined();
    expect(btn('Open in editor')).toBeDefined();
    expect(container.innerHTML.toLowerCase()).not.toContain('regenerate');
  });

  it('no "Checks: N items" chip (no signed wording)', async () => {
    await mount({ inkUsed: 2, findings: [{ type: 'a', message: 'm' }] });
    expect(text()).not.toMatch(/Checks:\s*\d/);
  });

  it('Finalise is the primary button, Export and Open in editor are not', async () => {
    await mount({ inkUsed: 2 });
    const cls = (b?: HTMLButtonElement) => b!.className;
    expect(cls(btn('Finalise'))).not.toBe(cls(btn('Export')));
    expect(cls(btn('Finalise'))).toBe(
      cls(
        Array.from(container.querySelectorAll('button')).find(
          (b) => b.className === cls(btn('Finalise')),
        ),
      ),
    );
    expect(cls(btn('Finalise'))).toContain('bg-nl-brass');
    expect(cls(btn('Export'))).not.toContain('bg-nl-brass ');
  });

  it('Finalise sends PATCH {status: finalised} with the bearer token, loading then finalised chip', async () => {
    let release: (v: unknown) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await mount({ inkUsed: 2 });
    await click(btn('Finalise'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/documents\/doc42$/);
    expect(init.method).toBe('PATCH');
    expect(init.headers.Authorization).toBe('Bearer tokenword');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ status: 'finalised' });
    // loading: the button is busy/disabled, no chip yet, a second click does nothing
    const busy = btn('Finalise')!;
    expect(
      busy.disabled ||
        busy.getAttribute('aria-busy') === 'true' ||
        busy.getAttribute('aria-disabled') === 'true',
    ).toBe(true);
    expect(container.querySelector('[data-testid="finalised-chip"]')).toBeNull();
    await click(busy);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => release({ ok: true, status: 200, json: async () => ({}) }));
    await flush();
    expect(container.querySelector('[data-testid="finalised-chip"]')!.textContent).toBe(
      'finalised',
    );
    expect(btn('Finalise')).toBeUndefined();
  });

  it('after Finalise the Export button is the primary "Export PDF / Word"', async () => {
    await mount({ inkUsed: 2 });
    const beforeCls = btn('Export')!.className;
    await click(btn('Finalise'));
    expect(btn('Export')).toBeUndefined();
    const exp = btn('Export PDF / Word')!;
    expect(exp).toBeDefined();
    expect(exp.className).not.toBe(beforeCls);
    expect(exp.className).toContain('bg-nl-brass');
    await click(exp);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('Finalise failure (non-OK) shows the generic error with Retry, which retries', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await mount({ inkUsed: 2 });
    await click(btn('Finalise'));
    expect(text()).toContain('Something did not work. Try again.');
    expect(container.querySelector('[data-testid="finalised-chip"]')).toBeNull();
    const retry = btn('Retry');
    expect(retry).toBeDefined();
    await click(retry);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="finalised-chip"]')).not.toBeNull();
    expect(text()).not.toContain('Something did not work');
  });

  it('Finalise failure (fetch throws) is the same', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    await mount();
    await click(btn('Finalise'));
    expect(text()).toContain('Something did not work. Try again.');
    expect(btn('Retry')).toBeDefined();
  });

  it('Finalise with no token fails without sending a request', async () => {
    mockGetToken.mockReturnValue(null);
    await mount();
    await click(btn('Finalise'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(text()).toContain('Something did not work. Try again.');
  });

  it('Export calls onExport; without it, it opens the editor', async () => {
    await mount();
    await click(btn('Export'));
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onOpenEditor).not.toHaveBeenCalled();
    await mount({}, false);
    await click(btn('Export'));
    expect(onOpenEditor).toHaveBeenCalledTimes(1);
  });

  it('no document id: no Finalise, Export or Open in editor, and the saved-failure alert shows', async () => {
    await mount({ docId: null });
    expect(btn('Finalise')).toBeUndefined();
    expect(btn('Export')).toBeUndefined();
    expect(btn('Open in editor')).toBeUndefined();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('action buttons are at least 44px tall (h-11 class)', async () => {
    await mount({ inkUsed: 2 });
    for (const t of ['Finalise', 'Export', 'Open in editor']) {
      expect(btn(t)!.className).toMatch(/\bh-11\b|min-h-\[44px\]/);
    }
  });
});

describe('finaliseDocument and EXPORT_HASH', () => {
  it('EXPORT_HASH is #export', () => {
    expect(EXPORT_HASH).toBe('#export');
  });
  it('throws when the response is not OK', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(finaliseDocument('d1')).rejects.toThrow();
  });
});
