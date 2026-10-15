import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BrowseTypesStep from '../BrowseTypesStep';

import TemplatesPage from '@/app/dashboard/templates/page';

// T-365 AC4 (Anushka's run 3, T-240 entry): "Browse document types" showed one flat list while
// the templates library was grouped. These tests open the screen as she did: every document under
// "All", then a search, then a chip. Mounted with react-dom/client, as the other suites here.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

type Kind = Parameters<typeof BrowseTypesStep>[0]['kinds'][number];

const kind = (
  id: string,
  cat: string,
  catName: string,
  order: number,
  extra: Partial<Kind> = {},
): Kind => ({
  template_id: id,
  display_name: `Doc ${id}`,
  category: 'raw',
  description: `About ${id}`,
  plan_access: 'free',
  catalogueCategory: cat,
  catalogueCategoryName: catName,
  catalogueCategoryOrder: order,
  ...extra,
});

// Deliberately not in catalogue order, and interleaved, so grouping and sorting are both needed.
const KINDS: Kind[] = [
  kind('notice', 'notices', 'Notices', 3),
  kind('bail_a', 'bail', 'Bail', 1),
  kind('lease', 'contracts', 'Contracts', 2),
  kind('bail_b', 'bail', 'Bail', 1),
  kind('zebra_notice', 'notices', 'Notices', 3),
];
const EXPECTED_ORDER = ['Bail', 'Contracts', 'Notices'];

let container: HTMLDivElement;
let root: Root;
let onPick: jest.Mock;

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  onPick = jest.fn();
  await act(async () => {
    root.render(
      <BrowseTypesStep kinds={KINDS} loading={false} onPick={onPick} onDescribe={jest.fn()} />,
    );
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  mockApiFetch.mockReset();
});

const headings = () => Array.from(container.querySelectorAll('h2')).map((h) => h.textContent ?? '');
const sections = () => Array.from(container.querySelectorAll('section'));
const cardNames = (el: ParentNode) =>
  Array.from(el.querySelectorAll('li button')).map(
    (b) => b.querySelector('span')?.textContent ?? '',
  );
const chip = (name: string) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('[role="group"] button')).find(
    (b) => b.textContent === name,
  )!;
const type = async (value: string) => {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('BrowseTypesStep grouping (T-365 AC4)', () => {
  it('under All with no search, shows one heading per category in catalogue order', () => {
    expect(headings()).toEqual(EXPECTED_ORDER);
    expect(sections()).toHaveLength(3);
  });

  it('puts each document under its own category heading and shows each exactly once', () => {
    const byHeading = Object.fromEntries(
      sections().map((s) => [s.querySelector('h2')!.textContent, cardNames(s)]),
    );
    expect(byHeading).toEqual({
      Bail: ['Doc bail_a', 'Doc bail_b'],
      Contracts: ['Doc lease'],
      Notices: ['Doc notice', 'Doc zebra_notice'],
    });
    const all = cardNames(container);
    expect(all).toHaveLength(KINDS.length);
    expect(new Set(all).size).toBe(KINDS.length);
  });

  it('is not one flat list: no list holds cards from more than one category', () => {
    expect(container.querySelectorAll('ul')).toHaveLength(3);
  });

  it('keeps the filter chips in catalogue order after All', () => {
    const chips = Array.from(container.querySelectorAll('[role="group"] button')).map(
      (b) => b.textContent,
    );
    expect(chips).toEqual(['All', ...EXPECTED_ORDER]);
  });

  it('a search for a term in one category shows only that group, with its heading', async () => {
    await type('lease');
    expect(headings()).toEqual(['Contracts']);
    expect(cardNames(container)).toEqual(['Doc lease']);
  });

  it('a search matching several categories keeps them grouped, in order', async () => {
    await type('notice');
    expect(headings()).toEqual(['Notices']);
    await type('doc');
    expect(headings()).toEqual(EXPECTED_ORDER);
  });

  it('a search with no match shows no headings and the empty message', async () => {
    await type('nothing-matches-this');
    expect(headings()).toEqual([]);
    expect(container.textContent).toContain('No document has that name.');
  });

  it('a chip shows only that group, with its heading', async () => {
    await act(async () => chip('Notices').click());
    expect(headings()).toEqual(['Notices']);
    expect(cardNames(container)).toEqual(['Doc notice', 'Doc zebra_notice']);
    await act(async () => chip('All').click());
    expect(headings()).toEqual(EXPECTED_ORDER);
  });

  it('labels each section by its heading, and the heading is an h2', () => {
    for (const s of sections()) {
      const labelId = s.getAttribute('aria-labelledby');
      expect(labelId).toBeTruthy();
      const h = container.querySelector(`#${labelId}`)!;
      expect(h.tagName).toBe('H2');
      expect(s.contains(h)).toBe(true);
    }
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('clicking a card still calls onPick with that document', async () => {
    const card = Array.from(container.querySelectorAll('li button')).find((b) =>
      b.textContent?.includes('Doc lease'),
    )!;
    await act(async () => (card as HTMLButtonElement).click());
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toMatchObject({ template_id: 'lease' });
  });

  it('puts documents with no catalogue order last, grouped by their category', async () => {
    const mixed: Kind[] = [
      {
        ...kind('loose', 'x', 'x', 0),
        catalogueCategory: undefined,
        catalogueCategoryName: undefined,
        catalogueCategoryOrder: undefined,
        category: 'some_value',
      },
      kind('b', 'bail', 'Bail', 1),
    ];
    await act(async () => {
      root.render(
        <BrowseTypesStep kinds={mixed} loading={false} onPick={jest.fn()} onDescribe={jest.fn()} />,
      );
    });
    expect(headings()).toEqual(['Bail', 'Some value']);
  });
});

describe('library page parity (T-365 AC4)', () => {
  it('the templates library shows the same groups in the same order as Browse document types', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ templates: KINDS.map((k) => ({ ...k, icon: 'file_text' })) }),
    });
    const libContainer = document.createElement('div');
    document.body.appendChild(libContainer);
    const libRoot = createRoot(libContainer);
    await act(async () => {
      libRoot.render(<TemplatesPage />);
    });
    const libHeadings = Array.from(libContainer.querySelectorAll('h2')).map((h) => h.textContent);
    expect(libHeadings).toEqual(headings());
    expect(libHeadings).toEqual(EXPECTED_ORDER);
    await act(async () => libRoot.unmount());
    libContainer.remove();
  });
});
