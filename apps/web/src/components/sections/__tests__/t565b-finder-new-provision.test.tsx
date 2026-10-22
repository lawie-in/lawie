// T-565 wave 2a, W5a (Ajay, pre-Anushka legal review 22 Oct; section-converter Addendum 2): a new
// provision with no old equivalent is seeded with a placeholder old-side id `NEW-<n>`. The entry
// is SHOWN: old box `No equivalent in the {OldCode}`, the new section and title as for any row,
// Copy gives `{NewCode} {n}` only, Insert stays the normal citation. The NEW id never appears in
// a row, loading line, request, Recent/Bookmark entry, tab key, insert or citation pill.
import { usePathname } from 'next/navigation';
import { act } from 'react';

import { SECTION_FINDER_OPEN_EVENT, SectionFinderPanel } from '../SectionFinderPanel';

import { cleanupMounted, mount, stubMatchMedia } from '@/components/ui/__tests__/nl-test-utils';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });
const aside = () => document.querySelector('aside') as HTMLElement;
const text = () => aside().textContent ?? '';
const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

const REAL = {
  code: 'BNS',
  section: '103',
  title: 'Real murder title',
  mapped_to: { code: 'IPC', section: '302', title: 'Punishment for murder' },
  is_new_provision: false,
};
// A BNS match whose counterpart is a placeholder.
const NEW_BY_ID = {
  code: 'BNS',
  section: '111',
  title: 'Organised crime title',
  mapped_to: { code: 'IPC', section: 'NEW-111', title: 'No equivalent in old code' },
  is_new_provision: false,
};
const NEW_BY_FLAG = {
  code: 'BNS',
  section: '113',
  title: 'Terrorist act title',
  mapped_to: null,
  is_new_provision: true,
};
// An old-code match whose own section is the placeholder.
const NEW_OWN_SECTION = {
  code: 'IPC',
  section: 'NEW-111',
  title: 'No equivalent in old code',
  mapped_to: { code: 'BNS', section: '111', title: 'Organised crime title' },
  is_new_provision: false,
};

function detail(over: Record<string, unknown> = {}) {
  return {
    code: 'BNS',
    section: '103',
    title: 'Murder',
    statute: 'Bharatiya Nyaya Sanhita',
    chapter: null,
    bailable: null,
    cognizable: null,
    compoundable: null,
    triable_by: null,
    punishment: null,
    max_years: null,
    ingredients: [],
    bare_section_text: null,
    related: [],
    mapping: null,
    ...over,
  };
}
function newDetail(over: Record<string, unknown> = {}) {
  return detail({
    section: '111',
    title: 'Organised crime',
    mapping: {
      old_code: 'IPC',
      old_section: 'NEW-111',
      old_title: 'No equivalent in old code',
      new_code: 'BNS',
      new_section: '111',
      new_title: 'Organised crime',
      mapping_type: 'direct',
    },
    ...over,
  });
}

let bookmarksBody: unknown[] = [];
let recentBody: unknown[] = [];
let searchResults: unknown[] = [];
let detailBody: unknown = detail();
const detailCalls: string[] = [];
const fetchMock = jest.fn();
const writeText = jest.fn();
const otherCalls: { path: string; body?: string }[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  detailCalls.length = 0;
  otherCalls.length = 0;
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  bookmarksBody = [];
  recentBody = [];
  searchResults = [];
  detailBody = detail();
  window.localStorage.clear();
  stubMatchMedia();
  (usePathname as jest.Mock).mockReturnValue('/dashboard/documents');
  mockApiFetch.mockImplementation(async (path: string, init?: { body?: string }) => {
    otherCalls.push({ path, body: init?.body });
    if (path.startsWith('/api/users/me/bookmarks/sections'))
      return { ok: true, status: 200, json: async () => ({ bookmarks: bookmarksBody }) };
    if (path.startsWith('/api/users/me/recent/sections'))
      return { ok: true, status: 200, json: async () => ({ recent: recentBody }) };
    if (path.startsWith('/api/sections/details')) {
      detailCalls.push(path);
      return { ok: true, status: 200, json: async () => detailBody };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
  fetchMock.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ results: searchResults }),
  }));
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
});
afterEach(cleanupMounted);

async function openPanel() {
  mount(<SectionFinderPanel />);
  await flush();
  act(() => {
    window.dispatchEvent(new CustomEvent(SECTION_FINDER_OPEN_EVENT));
  });
  await flush();
}
async function search(q: string) {
  const input = aside().querySelector('input[type="search"]') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, q);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await wait(250);
  await flush();
}
const tab = (label: string) =>
  Array.from(aside().querySelectorAll('[role="tab"]')).find((t) =>
    (t.textContent ?? '').startsWith(label),
  ) as HTMLButtonElement;
const clickTab = async (label: string) => {
  await act(async () => tab(label).click());
  await flush();
};

const NEW_ID = /NEW-\d+/i;
const allRequests = () => [
  ...otherCalls.map((c) => `${c.path} ${c.body ?? ''}`),
  ...fetchMock.mock.calls.map((c) => String(c[0])),
];

describe('T-565 W5a: search results', () => {
  it('shows a new provision as `111 BNS · title` with nothing on the counterpart side', async () => {
    searchResults = [NEW_BY_ID, NEW_BY_FLAG];
    await openPanel();
    await search('w5a-new');
    const t = text();
    expect(t).toContain('111 BNS');
    expect(t).toContain('Organised crime title');
    expect(t).toContain('113 BNS');
    expect(t).toContain('Terrorist act title');
    expect(t).toContain('2 matches');
    // The header names IPC; the rows after the count must not.
    expect(t.split('2 matches')[1]).not.toContain('IPC');
    expect(t).not.toMatch(NEW_ID);
    expect(t).not.toContain('No equivalent in old code');
  });

  it('a normal entry is unchanged and still shows its counterpart', async () => {
    searchResults = [REAL, NEW_BY_ID];
    await openPanel();
    await search('w5a-mixed');
    const t = text();
    expect(t).toContain('103 BNS');
    expect(t).toContain('Real murder title');
    expect(t).toContain('302 IPC');
    expect(t).toContain('2 matches');
  });

  it('an old-code match with a placeholder section shows the new provision, never the id', async () => {
    searchResults = [NEW_OWN_SECTION];
    await openPanel();
    await search('w5a-own');
    const t = text();
    expect(t).toContain('111 BNS');
    expect(t).toContain('Organised crime title');
    expect(t).not.toMatch(NEW_ID);
    expect(t).not.toContain('No equivalent in old code');
  });

  it('a lower-case `new-3` id is never shown', async () => {
    searchResults = [
      {
        ...NEW_OWN_SECTION,
        section: 'new-3',
        mapped_to: { code: 'BNS', section: '3', title: 'Three title' },
      },
    ];
    await openPanel();
    await search('w5a-lower');
    expect(text()).not.toMatch(NEW_ID);
    expect(text()).toContain('3 BNS');
  });

  it('search params are only what the user typed', async () => {
    searchResults = [NEW_BY_ID];
    await openPanel();
    await search('w5a-params');
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(u).toContain('w5a-params');
      expect(u).not.toMatch(NEW_ID);
    }
  });
});

describe('T-565 W5a: detail', () => {
  const preload = async (section: string, code = 'IPC') => {
    mount(<SectionFinderPanel />);
    await flush();
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SECTION_FINDER_OPEN_EVENT, { detail: { preload: { code, section } } }),
      );
    });
    await flush();
  };
  const button = (label: string) =>
    Array.from(aside().querySelectorAll('button')).find((b) =>
      (b.getAttribute('aria-label') ?? b.textContent ?? '').includes(label),
    ) as HTMLButtonElement;

  it('a NEW id is looked up as the new provision, never as the id', async () => {
    detailBody = newDetail();
    await preload('NEW-111');
    expect(detailCalls).toHaveLength(1);
    expect(detailCalls[0]).toContain('section=111');
    expect(detailCalls[0]).toContain('code=BNS');
    expect(detailCalls[0]).not.toMatch(NEW_ID);
  });

  it('shows the old box `No equivalent in the IPC` and the new section and title', async () => {
    detailBody = newDetail();
    await preload('NEW-111');
    const t = text();
    expect(t).toContain('No equivalent in the IPC');
    expect(t).toContain('Organised crime');
    expect(t).toContain('§111 BNS');
    expect(t).not.toMatch(NEW_ID);
    expect(t).not.toContain('§NEW');
    expect(t).not.toContain('No equivalent in old code');
  });

  it('uses CrPC casing for a BNSS provision', async () => {
    detailBody = newDetail({
      code: 'BNSS',
      mapping: {
        old_code: 'CRPC',
        old_section: 'NEW-35',
        old_title: null,
        new_code: 'BNSS',
        new_section: '35',
        new_title: 'T',
        mapping_type: 'direct',
      },
    });
    await preload('NEW-35', 'CRPC');
    expect(text()).toContain('No equivalent in the CrPC');
  });

  it('no `Mapped` badge on a new provision, but a normal direct mapping keeps it', async () => {
    detailBody = newDetail();
    await preload('NEW-111');
    expect(text()).not.toContain('Mapped');
    cleanupMounted();
    detailBody = detail({
      mapping: {
        old_code: 'IPC',
        old_section: '302',
        old_title: 'Murder',
        new_code: 'BNS',
        new_section: '103',
        new_title: 'Murder',
        mapping_type: 'direct',
      },
    });
    await preload('302');
    expect(text()).toContain('Mapped');
    expect(text()).toContain('§302 IPC');
    expect(text()).not.toContain('No equivalent');
  });

  it('the loading line names the new provision, not the id', async () => {
    let release: (v: unknown) => void = () => {};
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/sections/details')) {
        await new Promise((r) => {
          release = r;
        });
        return { ok: true, status: 200, json: async () => newDetail() };
      }
      return { ok: true, status: 200, json: async () => ({ bookmarks: [], recent: [] }) };
    });
    await preload('NEW-111');
    expect(text()).toContain('Loading 111 BNS');
    expect(text()).not.toMatch(NEW_ID);
    await act(async () => release(undefined));
    await flush();
  });

  it('Copy gives `BNS 111`, not the normal citation and never the id', async () => {
    detailBody = newDetail();
    await preload('NEW-111');
    act(() => button('Copy citation').click());
    expect(writeText).toHaveBeenCalledWith('BNS 111');
  });

  it('Copy on a normal entry is still the normal citation', async () => {
    await preload('103', 'BNS');
    act(() => button('Copy citation').click());
    expect(writeText).toHaveBeenCalledWith('§103 BNS');
  });

  it('Insert dispatches the normal `§111 BNS` citation with no NEW id', async () => {
    (usePathname as jest.Mock).mockReturnValue('/dashboard/documents/abc');
    detailBody = newDetail();
    const onInsert = jest.fn();
    window.addEventListener('lawie:insertCitation', onInsert);
    await preload('NEW-111');
    act(() => button('Insert citation').click());
    window.removeEventListener('lawie:insertCitation', onInsert);
    expect(onInsert).toHaveBeenCalledTimes(1);
    const d = (onInsert.mock.calls[0][0] as CustomEvent).detail;
    expect(d).toEqual({ citation: '§111 BNS', section: '111', code: 'BNS' });
  });

  it('no request carries the NEW id (details, Recent, Bookmarks)', async () => {
    detailBody = newDetail();
    await preload('NEW-111');
    act(() => button('Bookmark this section').click());
    await flush();
    const reqs = allRequests();
    expect(reqs.some((r) => r.includes('/recent/sections'))).toBe(true);
    expect(reqs.some((r) => r.includes('/bookmarks/sections'))).toBe(true);
    for (const r of reqs) expect(r).not.toMatch(NEW_ID);
    expect(text()).not.toMatch(NEW_ID);
  });

  it('Related shows a placeholder-id entry as the new provision, never the id', async () => {
    detailBody = detail({
      related: [
        { code: 'BNS', section: '104', title: 'Real related title' },
        { code: 'IPC', section: 'NEW-9', title: 'No equivalent in old code' },
      ],
    });
    await preload('302');
    const t = text();
    expect(t).toContain('Related sections');
    expect(t).toContain('Real related title');
    expect(t).toContain('9 BNS');
    expect(t).not.toMatch(NEW_ID);
    expect(t).not.toContain('No equivalent in old code');
  });

  it('a normal detail renders with its Related entries and no NEW treatment', async () => {
    detailBody = detail({
      related: [{ code: 'BNS', section: '104', title: 'Real related title' }],
    });
    await preload('302');
    const t = text();
    expect(t).toContain('Murder');
    expect(t).toContain('Real related title');
    expect(t).not.toContain('No equivalent');
  });
});

describe('T-565 W5a: Recent and Bookmarks', () => {
  const at = '2026-10-20T10:00:00.000Z';
  it('Recent shows a saved NEW id as the new provision and the count includes it', async () => {
    recentBody = [
      { code: 'BNS', section: '103', title: 'Real recent title', searchedAt: at },
      { code: 'IPC', section: 'NEW-111', title: 'No equivalent in old code', searchedAt: at },
    ];
    await openPanel();
    expect(tab('Recent').textContent).toBe('Recent2');
    await clickTab('Recent');
    const t = text();
    expect(t).toContain('Real recent title');
    expect(t).toContain('111 BNS');
    expect(t).not.toMatch(NEW_ID);
    expect(t).not.toContain('No equivalent in old code');
  });

  it('opening a saved NEW entry sends the real section', async () => {
    recentBody = [
      { code: 'IPC', section: 'NEW-111', title: 'No equivalent in old code', searchedAt: at },
    ];
    detailBody = newDetail();
    await openPanel();
    await clickTab('Recent');
    const row = Array.from(aside().querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('111 BNS'),
    ) as HTMLButtonElement;
    await act(async () => row.click());
    await flush();
    expect(detailCalls).toHaveLength(1);
    expect(detailCalls[0]).toContain('section=111');
    expect(detailCalls[0]).toContain('code=BNS');
    expect(text()).not.toMatch(NEW_ID);
  });

  it('Recent does not list the same provision twice when saved under both ids', async () => {
    recentBody = [
      { code: 'BNS', section: '111', title: 'Organised crime', searchedAt: at },
      { code: 'IPC', section: 'NEW-111', title: 'No equivalent in old code', searchedAt: at },
    ];
    await openPanel();
    await clickTab('Recent');
    expect((text().match(/111 BNS/g) ?? []).length).toBe(1);
  });

  it('Bookmarks show a saved NEW id as the new provision and count it', async () => {
    bookmarksBody = [
      { id: 'b1', code: 'BNS', section: '103', title: 'Real bookmark title', createdAt: at },
      {
        id: 'b2',
        code: 'IPC',
        section: 'NEW-3',
        title: 'No equivalent in old code',
        createdAt: at,
      },
    ];
    await openPanel();
    expect(tab('Bookmarks').textContent).toBe('Bookmarks2');
    await clickTab('Bookmarks');
    const t = text();
    expect(t).toContain('Real bookmark title');
    expect(t).toContain('3 BNS');
    expect(t).not.toMatch(NEW_ID);
    expect(t).not.toContain('No equivalent in old code');
  });

  it('the Lookup tab Recent list never shows the id', async () => {
    recentBody = [
      { code: 'BNS', section: '103', title: 'Real recent title', searchedAt: at },
      { code: 'IPC', section: 'NEW-1', title: 'No equivalent in old code', searchedAt: at },
    ];
    await openPanel();
    expect(text()).toContain('1 BNS');
    expect(text()).not.toMatch(NEW_ID);
  });

  it('tab counts for normal entries are unchanged', async () => {
    recentBody = [{ code: 'BNS', section: '103', title: 'Real recent title', searchedAt: at }];
    await openPanel();
    expect(tab('Recent').textContent).toBe('Recent1');
    expect(tab('Bookmarks').textContent).toBe('Bookmarks');
  });
});
