// T-521 (AC2, AC4, WCAG 2.4.3 / 4.1.3): Finalise keeps focus while it saves, moves it to Export
// on success, keeps it on failure; the Ink chip shows only a real debit above zero.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { DraftResult } from '../briefTypes';
import DraftReadyStep from '../DraftReadyStep';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@/lib/auth', () => ({ getAccessToken: () => 'tokenword' }));

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

let fetchMock: jest.Mock;
let container: HTMLDivElement;
let root: Root;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const view = async (over: Partial<DraftResult> = {}) => {
  await act(async () => {
    root.render(
      <DraftReadyStep
        result={{ ...base, ...over }}
        onOpenEditor={jest.fn()}
        onStartAnother={jest.fn()}
        onExport={jest.fn()}
      />,
    );
  });
};
const btn = (name: string) =>
  Array.from(container.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === name,
  ) as HTMLButtonElement | undefined;
const finaliseBtn = () => btn('Finalise')!;
/** What a user does: focus lands on the button, then the click. */
const press = async (b: HTMLButtonElement) => {
  b.focus();
  await act(async () => b.click());
  await flush();
};
const okReply = { ok: true, status: 200, json: async () => ({}) };
const statusSpan = () => container.querySelector('span[role="status"]')!;

beforeEach(() => {
  fetchMock = jest.fn();
  (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Finalise focus and status', () => {
  it('stays focused, aria-disabled and aria-busy while saving, and ignores a second click', async () => {
    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValue(new Promise((r) => (resolve = r)));
    await view({ inkUsed: 2 });
    const b = finaliseBtn();
    await press(b);
    expect(document.activeElement).toBe(b);
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.getAttribute('aria-busy')).toBe('true');
    expect(b.disabled).toBe(false);
    await press(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: 'finalised' });
    await act(async () => resolve(okReply));
    await flush();
    expect(btn('Finalise')).toBeUndefined();
  });

  it('success: focus moves to the primary Export PDF / Word; the always-mounted status says finalised', async () => {
    fetchMock.mockResolvedValue(okReply);
    await view({ inkUsed: 2 });
    const region = statusSpan();
    expect(region.textContent).toBe('');
    await press(finaliseBtn());
    const exp = btn('Export PDF / Word')!;
    expect(exp).toBeDefined();
    expect(document.activeElement).toBe(exp);
    expect(exp.className).toContain('bg-nl-brass');
    expect(statusSpan()).toBe(region);
    expect(region.textContent).toBe('finalised');
    expect(container.textContent?.toLowerCase()).not.toMatch(/verified|approved/);
  });

  it('failure: alert, focus stays on Finalise; Retry puts focus on Finalise and sends the PATCH again', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await view({ inkUsed: 2 });
    await press(finaliseBtn());
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('Something did not work. Try again.');
    expect(document.activeElement).toBe(finaliseBtn());
    expect(finaliseBtn().getAttribute('aria-disabled')).toBeNull();
    expect(statusSpan().textContent).toBe('');

    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const retry = btn('Retry')!;
    retry.focus();
    await act(async () => retry.click());
    expect(document.activeElement).toBe(finaliseBtn());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH');
    await act(async () => resolve(okReply));
    await flush();
    expect(btn('Export PDF / Word')).toBeDefined();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('a thrown network error behaves like a failed save (break-ui)', async () => {
    fetchMock.mockRejectedValue(new TypeError('network'));
    await view();
    await press(finaliseBtn());
    expect(container.querySelector('[role="alert"]')!.textContent).toContain(
      'Something did not work',
    );
    expect(document.activeElement).toBe(finaliseBtn());
  });

  it('no docId: no Finalise, Export or Open in editor (the draft was not saved)', async () => {
    await view({ docId: null });
    expect(btn('Finalise')).toBeUndefined();
    expect(btn('Export')).toBeUndefined();
    expect(btn('Open in editor')).toBeUndefined();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('could not be saved');
  });
});

describe('Ink chip rules', () => {
  const chip = () => container.querySelector('[data-testid="ink-used-chip"]');
  it('3 shows "3 Ink used"', async () => {
    await view({ inkUsed: 3 });
    expect(chip()!.textContent?.replace(/\s+/g, ' ').trim()).toContain('3 Ink used');
  });
  it.each([
    ['zero', 0],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['negative', -2],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a string from a bad payload', '3' as unknown as number],
  ])('%s: no chip', async (_n, v) => {
    await view({ inkUsed: v });
    expect(chip()).toBeNull();
    expect(container.textContent).not.toContain('Ink used');
  });
  it('a fractional debit is shown as it is (0.5)', async () => {
    await view({ inkUsed: 0.5 });
    expect(chip()!.textContent).toContain('0.5');
  });
  it('a draft with no saved document and no Ink shows no chip', async () => {
    await view({ docId: null, inkUsed: undefined });
    expect(chip()).toBeNull();
  });
});
