// T-565 wave 2a, W5 (Ajay, pre-Anushka legal review 22 Oct; T-326): a new provision with no old
// equivalent carries a synthetic `NEW-n` old-side id. Until signed text exists such entries are
// hidden from the finder: search results, detail, Recent, Bookmarks (and their counts), Related.
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
const NEW_BY_ID = {
  code: 'BNS',
  section: '111',
  title: 'Organised crime synthetic-id title',
  mapped_to: { code: 'IPC', section: 'NEW-4', title: null },
  is_new_provision: false,
};
const NEW_BY_FLAG = {
  code: 'BNS',
  section: '113',
  title: 'Terrorist act flagged title',
  mapped_to: null,
  is_new_provision: true,
};
const NEW_OWN_SECTION = {
  code: 'IPC',
  section: 'NEW-2',
  title: 'Own synthetic section title',
  mapped_to: null,
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

let bookmarksBody: unknown[] = [];
let recentBody: unknown[] = [];
let searchResults: unknown[] = [];
let detailBody: unknown = detail();
const detailCalls: string[] = [];
const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  detailCalls.length = 0;
  bookmarksBody = [];
  recentBody = [];
  searchResults = [];
  detailBody = detail();
  window.localStorage.clear();
  stubMatchMedia();
  (usePathname as jest.Mock).mockReturnValue('/dashboard/documents');
  mockApiFetch.mockImplementation(async (path: string) => {
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

describe('T-565 W5: search results', () => {
  it('hides results with a NEW id or is_new_provision, keeps the real one', async () => {
    searchResults = [REAL, NEW_BY_ID, NEW_BY_FLAG, NEW_OWN_SECTION];
    await openPanel();
    await search('w5-mixed');
    const t = text();
    expect(t).toContain('Real murder title');
    expect(t).toContain('1 match');
    expect(t).not.toContain('1 matches');
    for (const hidden of [
      'Organised crime synthetic-id title',
      'Terrorist act flagged title',
      'Own synthetic section title',
      'NEW-4',
      'NEW-2',
    ])
      expect(t).not.toContain(hidden);
  });

  it('when every result is a new provision the finder shows the no-matches line', async () => {
    searchResults = [NEW_BY_ID, NEW_BY_FLAG];
    await openPanel();
    await search('w5-allnew');
    expect(text()).toContain('No matches for');
    expect(text()).not.toContain('Terrorist act flagged title');
  });

  it('a lower-case `new-3` id is hidden too', async () => {
    searchResults = [{ ...NEW_OWN_SECTION, section: 'new-3', title: 'Lower case id title' }, REAL];
    await openPanel();
    await search('w5-lower');
    expect(text()).not.toContain('Lower case id title');
    expect(text()).toContain('Real murder title');
  });
});

describe('T-565 W5: detail', () => {
  const preload = async (section: string) => {
    mount(<SectionFinderPanel />);
    await flush();
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SECTION_FINDER_OPEN_EVENT, {
          detail: { preload: { code: 'IPC', section } },
        }),
      );
    });
    await flush();
  };

  it('a NEW id is never fetched', async () => {
    await preload('NEW-1');
    expect(detailCalls).toHaveLength(0);
  });

  it('a fetched detail whose old or new side is a NEW id is not rendered', async () => {
    detailBody = detail({
      title: 'Hidden detail title',
      mapping: {
        old_code: 'IPC',
        old_section: 'NEW-7',
        old_title: 'Hidden old title',
        new_code: 'BNS',
        new_section: '113',
        new_title: 'Hidden new title',
        mapping_type: 'direct',
      },
    });
    await preload('302');
    expect(detailCalls).toHaveLength(1);
    const t = text();
    expect(t).not.toContain('Hidden detail title');
    expect(t).not.toContain('Hidden old title');
    expect(t).not.toContain('NEW-7');
  });

  it('a normal detail still renders, with real Related entries and without NEW ones', async () => {
    detailBody = detail({
      related: [
        { code: 'BNS', section: '104', title: 'Real related title' },
        { code: 'IPC', section: 'NEW-9', title: 'Synthetic related title' },
      ],
    });
    await preload('302');
    const t = text();
    expect(t).toContain('Murder');
    expect(t).toContain('Related sections');
    expect(t).toContain('Real related title');
    expect(t).not.toContain('Synthetic related title');
    expect(t).not.toContain('NEW-9');
  });

  it('Related is omitted entirely when every related entry is a NEW id', async () => {
    detailBody = detail({
      related: [{ code: 'IPC', section: 'NEW-9', title: 'Synthetic related title' }],
    });
    await preload('302');
    expect(text()).not.toContain('Related sections');
  });
});

describe('T-565 W5: Recent and Bookmarks', () => {
  const at = '2026-10-20T10:00:00.000Z';
  it('Recent omits NEW ids and its count excludes them', async () => {
    recentBody = [
      { code: 'BNS', section: '103', title: 'Real recent title', searchedAt: at },
      { code: 'IPC', section: 'NEW-1', title: 'Synthetic recent title', searchedAt: at },
      { code: 'IPC', section: 'new-2', title: 'Lower synthetic recent', searchedAt: at },
    ];
    await openPanel();
    expect(tab('Recent').textContent).toBe('Recent1');
    await clickTab('Recent');
    const t = text();
    expect(t).toContain('Real recent title');
    expect(t).not.toContain('Synthetic recent title');
    expect(t).not.toContain('Lower synthetic recent');
  });

  it('Bookmarks omit NEW ids and their count excludes them', async () => {
    bookmarksBody = [
      { id: 'b1', code: 'BNS', section: '103', title: 'Real bookmark title', createdAt: at },
      { id: 'b2', code: 'IPC', section: 'NEW-3', title: 'Synthetic bookmark title', createdAt: at },
    ];
    await openPanel();
    expect(tab('Bookmarks').textContent).toBe('Bookmarks1');
    await clickTab('Bookmarks');
    const t = text();
    expect(t).toContain('Real bookmark title');
    expect(t).not.toContain('Synthetic bookmark title');
  });

  it('with only NEW entries the tab shows no count', async () => {
    recentBody = [
      { code: 'IPC', section: 'NEW-1', title: 'Synthetic recent title', searchedAt: at },
    ];
    bookmarksBody = [
      { id: 'b2', code: 'IPC', section: 'NEW-3', title: 'Synthetic bookmark title', createdAt: at },
    ];
    await openPanel();
    expect(tab('Recent').textContent).toBe('Recent');
    expect(tab('Bookmarks').textContent).toBe('Bookmarks');
  });

  it('the Lookup tab Recent list also omits NEW ids', async () => {
    recentBody = [
      { code: 'BNS', section: '103', title: 'Real recent title', searchedAt: at },
      { code: 'IPC', section: 'NEW-1', title: 'Synthetic recent title', searchedAt: at },
    ];
    await openPanel();
    expect(text()).not.toContain('Synthetic recent title');
  });
});
