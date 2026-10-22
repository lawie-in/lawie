// T-521 (AC2): the draft-ready view. Ink-used chip, Finalise (primary) -> PATCH finalised,
// Export, no Regenerate. Sentinels are plain words.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { DraftResult } from '../briefTypes';
import DraftReadyStep from '../DraftReadyStep';
import { EXPORT_HASH, finaliseDocument } from '../draftActions';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockGetToken = jest.fn();
const mockGetRefresh = jest.fn();
const mockSaveTokens = jest.fn();
const mockClearTokens = jest.fn();
jest.mock('@/lib/auth', () => ({
  getAccessToken: () => mockGetToken(),
  getRefreshToken: () => mockGetRefresh(),
  saveTokens: (...a: unknown[]) => mockSaveTokens(...a),
  clearTokens: () => mockClearTokens(),
}));

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
  it('shows no chip for a zero cost: "0 Ink used" never appears (Ajay AJ-521)', async () => {
    await mount({ inkUsed: 0 });
    expect(container.querySelector('[data-testid="ink-used-chip"]')).toBeNull();
    expect(text()).not.toContain('Ink used');
  });
  it('T-544: groups the number en-IN: 99999 -> "99,999 Ink used", 100000 -> "1,00,000"', async () => {
    await mount({ inkUsed: 99999 });
    const chip = container.querySelector('[data-testid="ink-used-chip"]')!;
    expect(chip.textContent?.replace(/\s+/g, ' ').trim()).toContain('99,999 Ink used');
    await mount({ inkUsed: 100000 });
    expect(container.querySelector('[data-testid="ink-used-chip"]')!.textContent).toContain(
      '1,00,000',
    );
    expect(
      container.querySelector('[data-testid="ink-used-chip"] .tabular-nums')!.textContent,
    ).toBe('1,00,000');
  });
  it('T-544: small numbers are unchanged (5, 32)', async () => {
    await mount({ inkUsed: 5 });
    expect(container.querySelector('[data-testid="ink-used-chip"]')!.textContent).toContain(
      '5 Ink used',
    );
    await mount({ inkUsed: 32 });
    expect(container.querySelector('[data-testid="ink-used-chip"]')!.textContent).toContain(
      '32 Ink used',
    );
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

  it('T-544: with no token Finalise still goes through apiFetch (no local guard), without a Bearer', async () => {
    mockGetToken.mockReturnValue(null);
    await mount();
    await click(btn('Finalise'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/documents\/doc42$/);
    expect(init.headers.Authorization).toBeUndefined();
    expect(container.querySelector('[data-testid="finalised-chip"]')).not.toBeNull();
  });

  it('T-544: a 401 refreshes once, retries with the new token, and Finalise succeeds', async () => {
    mockGetRefresh.mockReturnValue('refreshword');
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { accessToken: 'newword', refreshToken: 'newrefresh' } }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    await mount({ inkUsed: 2 });
    await click(btn('Finalise'));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/api\/auth\/refresh$/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ refreshToken: 'refreshword' });
    const retry = fetchMock.mock.calls[2];
    expect(retry[0]).toMatch(/\/api\/documents\/doc42$/);
    expect(retry[1].method).toBe('PATCH');
    expect(retry[1].headers.Authorization).toBe('Bearer newword');
    expect(JSON.parse(retry[1].body)).toEqual({ status: 'finalised' });
    expect(mockSaveTokens).toHaveBeenCalledWith('newword', 'newrefresh');
    expect(container.querySelector('[data-testid="finalised-chip"]')).not.toBeNull();
    expect(text()).not.toContain('Something did not work');
  });

  it('T-544: a failed refresh clears the session, goes to /login, and shows no error banner', async () => {
    const replace = jest.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, replace },
    });
    try {
      mockGetRefresh.mockReturnValue(null);
      fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
      await mount();
      await click(btn('Finalise'));
      expect(mockClearTokens).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith('/login');
      // apiFetch never resolves, so neither the chip nor the error shows
      expect(container.querySelector('[data-testid="finalised-chip"]')).toBeNull();
      expect(text()).not.toContain('Something did not work');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
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
  it('T-544: sends PATCH {status: finalised} as JSON to the documents path', async () => {
    await finaliseDocument('d9');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/documents\/d9$/);
    expect(init.method).toBe('PATCH');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ status: 'finalised' });
  });
  it('T-544: a network error rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    await expect(finaliseDocument('d1')).rejects.toThrow('network');
  });
  it('T-544: a 500 rejects', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(finaliseDocument('d1')).rejects.toThrow();
  });
});

describe('T-544 title (item 3)', () => {
  it('has exactly one h1, the document name, in the nl-h1 style, with the ready line below', async () => {
    await mount({ name: 'Bail application' });
    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe('Bail application');
    expect(h1s[0].className).toContain('nl-h1');
    expect(text()).toContain('Your draft is ready.');
    expect(text()).toContain('Read it through and edit before you use it.');
  });
  it('a long unbroken name (a real 80-char file-number style) can wrap: min-w-0 break-words', async () => {
    const name = `Criminal-Misc-Petition-No-${'1234567890'.repeat(6)}-of-2026`;
    await mount({ name });
    const h1 = container.querySelector('h1')!;
    expect(h1.textContent).toBe(name);
    expect(h1.className).toContain('break-words');
    expect(h1.className).toContain('min-w-0');
    // its parent can shrink too, or min-w-0 on the h1 would do nothing
    expect(h1.parentElement!.className).toContain('min-w-0');
  });
  it('a one-letter name and non-Latin text render as given', async () => {
    await mount({ name: 'क' });
    expect(container.querySelector('h1')!.textContent).toBe('क');
  });
});

describe('T-544 focus after Finalise (item 2)', () => {
  const deferred = () => {
    let release: (v: unknown) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    return () => act(async () => release({ ok: true, status: 200, json: async () => ({}) }));
  };
  it('focus still on Finalise: moves to the Export button on success', async () => {
    const done = deferred();
    await mount();
    await click(btn('Finalise'));
    btn('Finalise')!.focus();
    await done();
    await flush();
    expect(document.activeElement).toBe(btn('Export PDF / Word'));
  });
  it('focus fell to body: moves to the Export button on success', async () => {
    const done = deferred();
    await mount();
    await click(btn('Finalise'));
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    await done();
    await flush();
    expect(document.activeElement).toBe(btn('Export PDF / Word'));
  });
  it('focus moved to Open in editor while saving: it is NOT stolen', async () => {
    const done = deferred();
    await mount();
    await click(btn('Finalise'));
    btn('Open in editor')!.focus();
    expect(document.activeElement).toBe(btn('Open in editor'));
    await done();
    await flush();
    expect(container.querySelector('[data-testid="finalised-chip"]')).not.toBeNull();
    expect(document.activeElement).toBe(btn('Open in editor'));
    expect(document.activeElement).not.toBe(btn('Export PDF / Word'));
  });
  it('focus moved to Start another document while saving: it is NOT stolen', async () => {
    const done = deferred();
    await mount();
    await click(btn('Finalise'));
    btn('Start another document')!.focus();
    await done();
    await flush();
    expect(document.activeElement).toBe(btn('Start another document'));
  });
  it('failure path: Retry puts focus on Finalise, and a later success moves it to Export', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await mount();
    await click(btn('Finalise'));
    await click(btn('Retry'));
    expect(container.querySelector('[data-testid="finalised-chip"]')).not.toBeNull();
    expect(document.activeElement).toBe(btn('Export PDF / Word'));
  });
});
