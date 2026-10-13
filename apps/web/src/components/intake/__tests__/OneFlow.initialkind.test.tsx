// T-365 AC5: OneFlow's optional initialKind (from ?kind= on the templates library link) presets a
// listed kind once the list has loaded, exactly as a pick in "Browse document types"; an unknown
// id gives a plain describe; it applies once; and `kind` is dropped from the URL either way.
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'util';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import OneFlow from '../OneFlow';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(globalThis, { TextDecoder: NodeTextDecoder, TextEncoder: NodeTextEncoder });

jest.mock('@/hooks/useCredits', () => ({ notifyCreditsChanged: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/components/credits/PaywallModal', () => ({ PaywallModal: () => null }));
jest.mock('@/components/VerifyEmailPrompt', () => ({
  openVerifyInsteadOfPaywall: async () => false,
}));
const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock('@/components/PrivacyUpdatePrompt', () => ({
  PrivacyBlockedNotice: () => null,
  isPrivacyBlocked: () => false,
  privacyFetch: jest.fn(),
  privacyPrecheck: async () => false,
  usePrivacyDescribedBy: () => undefined,
}));

type Kinds = Parameters<typeof OneFlow>[0]['kinds'];
const mk = (id: string, name: string) => ({
  template_id: id,
  display_name: name,
  description: `Line for ${name}`,
  category: 'raw',
  plan_access: 'free',
  catalogueCategory: 'c1',
  catalogueCategoryName: 'Cat One',
  catalogueCategoryOrder: 1,
  icon: 'file_text',
});
const KINDS = [
  mk('bail_regular', 'Regular Bail'),
  mk('affidavit_identity', 'Identity Affidavit'),
] as unknown as Kinds;

const PLAIN = 'What do you need to draft?';
let container: HTMLDivElement;
let root: Root;
let replaceSpy: jest.SpyInstance;
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
// React useId values differ per mount; the rest of the markup must match.
const stripIds = (html: string) => html.replace(/_r_\w+_/g, '_id_');
const h1 = () => container.querySelector('h1')?.textContent;
const buttonWith = (t: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(t));
const render = (props: Partial<Parameters<typeof OneFlow>[0]>) =>
  act(async () => {
    root.render(<OneFlow kinds={KINDS} loadingKinds={false} {...props} />);
  });
const briefCalls = () =>
  mockApiFetch.mock.calls.filter((c) => c[0] === '/api/documents/intake/brief');

async function submitDescription() {
  const ta = container.querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set as (
      v: string,
    ) => void;
    set.call(ta, 'My client was arrested under a FIR and needs regular bail please.');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => (buttonWith('Continue') as HTMLButtonElement).click());
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState(null, '', '/dashboard/new?kind=bail_regular&x=1');
  replaceSpy = jest.spyOn(window.history, 'replaceState');
  mockApiFetch.mockImplementation(() =>
    Promise.resolve({ ok: true, status: 200, json: async () => ({}) }),
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  replaceSpy.mockRestore();
});

describe('OneFlow initialKind (T-365 AC5)', () => {
  it('a known id lands in describe with that preset', async () => {
    await render({ initialKind: 'bail_regular' });
    await flush();
    expect(h1()).toBe('Regular Bail');
    expect(buttonWith('Browse document types')).toBeDefined();
    expect(container.textContent).toContain('Not this document?');
  });

  it('is the same screen as picking that kind in Browse document types', async () => {
    await render({});
    await act(async () => (buttonWith('Browse document types') as HTMLButtonElement).click());
    await act(async () => (buttonWith('Regular Bail') as HTMLButtonElement).click());
    const viaBrowse = stripIds(container.innerHTML);
    expect(h1()).toBe('Regular Bail');

    act(() => root.unmount());
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await render({ initialKind: 'bail_regular' });
    await flush();
    expect(stripIds(container.innerHTML)).toBe(viaBrowse);
  });

  it('sends the preset kind with the first read', async () => {
    await render({ initialKind: 'bail_regular' });
    await flush();
    await submitDescription();
    expect(briefCalls()).toHaveLength(1);
    expect(JSON.parse(briefCalls()[0][1].body).kind).toBe('bail_regular');
  });

  it('an unknown id gives a plain describe with no preset', async () => {
    await render({ initialKind: 'no_such_pack' });
    await flush();
    expect(h1()).toBe(PLAIN);
    await submitDescription();
    expect(JSON.parse(briefCalls()[0][1].body)).not.toHaveProperty('kind');
  });

  it('no initialKind: plain describe and the URL is left alone', async () => {
    await render({});
    await flush();
    expect(h1()).toBe(PLAIN);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.search).toContain('kind=bail_regular');
  });

  it('waits for the list: nothing happens while loading, then it presets', async () => {
    await render({ initialKind: 'bail_regular', kinds: [], loadingKinds: true });
    expect(h1()).toBe(PLAIN);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.location.search).toContain('kind=bail_regular');
    await render({ initialKind: 'bail_regular', kinds: KINDS, loadingKinds: false });
    await flush();
    expect(h1()).toBe('Regular Bail');
    expect(window.location.search).not.toContain('kind=');
  });

  it('removes kind from the URL and keeps the other params (known id)', async () => {
    await render({ initialKind: 'bail_regular' });
    await flush();
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/dashboard/new');
    expect(window.location.search).toBe('?x=1');
  });

  it('removes kind from the URL for an unknown id too', async () => {
    window.history.replaceState(null, '', '/dashboard/new?kind=no_such_pack');
    replaceSpy.mockClear();
    await render({ initialKind: 'no_such_pack' });
    await flush();
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
  });

  it('applies once: after "Not this document?" a re-render with the same id does not preset again', async () => {
    await render({ initialKind: 'bail_regular' });
    await flush();
    expect(h1()).toBe('Regular Bail');
    await act(async () => (buttonWith('Browse document types') as HTMLButtonElement).click());
    await act(async () => (buttonWith('I do not see my document') as HTMLButtonElement).click());
    expect(h1()).toBe(PLAIN);
    // the list reloads (new array) and the prop is unchanged
    await render({ initialKind: 'bail_regular', kinds: [...KINDS] });
    await flush();
    expect(h1()).toBe(PLAIN);
    expect(replaceSpy).toHaveBeenCalledTimes(1);
  });
});
