// T-565 items 37 and 38 (Ajay, pre-Anushka legal review 22 Oct, T4 and T7): the section finder
// intro lines and the detail card's old-law label and mapping badges.
import { usePathname } from 'next/navigation';
import { act } from 'react';

import { SECTION_FINDER_OPEN_EVENT, SectionFinderPanel } from '../SectionFinderPanel';

import { cleanupMounted, mount, stubMatchMedia } from '@/components/ui/__tests__/nl-test-utils';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const MERGED = 'Merged with other sections — verify scope';
const SPLIT = 'Split across several sections — check which one applies';

const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });
const aside = () => document.querySelector('aside') as HTMLElement;

function detail(mapping_type: string | null) {
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
    mapping:
      mapping_type === null
        ? null
        : {
            old_code: 'IPC',
            old_section: '302',
            old_title: 'Punishment for murder',
            new_code: 'BNS',
            new_section: '103',
            new_title: 'Murder',
            mapping_type,
          },
  };
}

async function openCard(mappingType: string | null) {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path.startsWith('/api/sections/details')) {
      return { ok: true, status: 200, json: async () => detail(mappingType) };
    }
    return { ok: true, status: 200, json: async () => ({ bookmarks: [], recent: [] }) };
  });
  mount(<SectionFinderPanel />);
  await flush();
  act(() => {
    window.dispatchEvent(
      new CustomEvent(SECTION_FINDER_OPEN_EVENT, {
        detail: { preload: { code: 'IPC', section: '302' } },
      }),
    );
  });
  await flush();
  return aside().textContent ?? '';
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  stubMatchMedia();
  (usePathname as jest.Mock).mockReturnValue('/dashboard/documents');
  Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true });
  mockApiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ bookmarks: [], recent: [] }),
  });
});
afterEach(cleanupMounted);

describe('T-565 item 37 + T4: the Lookup intro', () => {
  it('shows the two signed lines, one per paragraph, and keeps the shortcut line', async () => {
    mount(<SectionFinderPanel />);
    await flush();
    const ps = Array.from(aside().querySelectorAll('p')).map((p) => p.textContent);
    expect(ps).toContain(
      'Look up an IPC, CrPC or IEA section and see the BNS, BNSS or BSA section that replaced it.',
    );
    expect(ps).toContain('Check the bare act before you rely on a mapping.');
    expect(ps).toContain('Press ⌘K from any drafting screen.');
    const kbd = Array.from(aside().querySelectorAll('kbd')).map((k) => k.textContent);
    expect(kbd).toContain('⌘K');
  });

  it('the shortcut line follows the platform (Ctrl+K off a Mac)', async () => {
    Object.defineProperty(window.navigator, 'platform', {
      value: 'Linux x86_64',
      configurable: true,
    });
    mount(<SectionFinderPanel />);
    await flush();
    const ps = Array.from(aside().querySelectorAll('p')).map((p) => p.textContent);
    expect(ps).toContain('Press Ctrl+K from any drafting screen.');
  });

  it('the old "Auto-detects either direction" tip is gone', async () => {
    mount(<SectionFinderPanel />);
    await flush();
    const t = aside().textContent ?? '';
    expect(t).not.toContain('Auto-detects');
    expect(t).not.toContain('either direction');
    expect(t).not.toContain('or vice versa');
  });
});

describe('T-565 item 38: the detail card label and badges', () => {
  it('the old side is labelled `Old law · before 1 July 2024`, not the old label', async () => {
    const t = await openCard('direct');
    expect(t).toContain('Old law · before 1 July 2024');
    expect(t).not.toContain('Old · pre-2024');
  });

  it('direct shows `Mapped` and nothing about "in force"', async () => {
    const t = await openCard('direct');
    expect(t).toContain('Mapped');
    expect(t).not.toContain('in force');
    expect(t).not.toContain(MERGED);
    expect(t).not.toContain(SPLIT);
  });

  it('merged shows the signed merged badge and no `Mapped` status', async () => {
    const t = await openCard('merged');
    expect(t).toContain(MERGED);
    expect(t).not.toContain(SPLIT);
    expect(t).not.toMatch(/Mapped/);
  });

  it('split shows the signed split badge and no `Mapped` status', async () => {
    const t = await openCard('split');
    expect(t).toContain(SPLIT);
    expect(t).not.toContain(MERGED);
    expect(t).not.toMatch(/Mapped/);
  });

  it.each(['partial', 'repealed', 'repealed_no_equivalent', 'unverified', 'something_new'])(
    '%s shows no status badge and the raw type is never shown',
    async (type) => {
      const t = await openCard(type);
      expect(t).toContain('Old law · before 1 July 2024'); // the card is up
      expect(t).not.toMatch(/Mapped/);
      expect(t).not.toContain(MERGED);
      expect(t).not.toContain(SPLIT);
      expect(t).not.toContain(type);
      expect(t).not.toContain('in force');
    },
  );
});
