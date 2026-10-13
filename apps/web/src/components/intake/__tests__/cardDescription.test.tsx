import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import BrowseTypesStep from '../BrowseTypesStep';

import NewDocumentPage from '@/app/dashboard/new/page';
import TemplatesPage from '@/app/dashboard/templates/page';

// T-365 AC6: a card shows the signed card line only. A kind with description '' (a pack with no
// card_description) renders no description element, and search must not throw on '' or a missing
// description. Covered on Browse document types, the templates library and dashboard/new.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { plan: 'pro', credits: 10 }, login: jest.fn() }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

type Kind = Parameters<typeof BrowseTypesStep>[0]['kinds'][number];

const LINE = 'A signed card line for the lease.';
const base = {
  category: 'raw',
  plan_access: 'free',
  catalogueCategory: 'c1',
  catalogueCategoryName: 'Cat One',
  catalogueCategoryOrder: 1,
  icon: 'file_text',
};
const WITH: Kind = {
  ...base,
  template_id: 'with_line',
  display_name: 'With Line',
  description: LINE,
};
const EMPTY: Kind = {
  ...base,
  template_id: 'empty_line',
  display_name: 'Empty Line',
  description: '',
};
const MISSING = {
  ...base,
  template_id: 'missing_line',
  display_name: 'Missing Line',
} as unknown as Kind;
const KINDS = [WITH, EMPTY, MISSING];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  mockApiFetch.mockReset();
});

const setSearch = async (value: string) => {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

/** The card (button or list item) that holds a display name. */
const cardOf = (name: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(name))!;

/** Leaf elements in a card whose text is exactly the card line. */
const descriptionEls = (card: Element) =>
  Array.from(card.querySelectorAll('p, span')).filter(
    (el) => el.children.length === 0 && el.textContent === LINE,
  ).length;

function mockList() {
  mockApiFetch.mockImplementation(async (url: string) => {
    if (url.includes('intake/enabled')) return { ok: true, json: async () => ({ enabled: false }) };
    return { ok: true, json: async () => ({ templates: KINDS }) };
  });
}

const expectGuarded = async () => {
  expect(descriptionEls(cardOf('With Line'))).toBe(1);
  // No description element at all in the empty / missing cards: nothing but name (+ badges).
  for (const name of ['Empty Line', 'Missing Line']) {
    const card = cardOf(name);
    expect(card).toBeTruthy();
    expect(card.textContent).not.toContain(LINE);
    expect(card.textContent).not.toContain('undefined');
    const emptyText = Array.from(card.querySelectorAll('p, span')).filter(
      (el) => el.children.length === 0 && (el.textContent ?? '').trim() === '',
    );
    expect(emptyText).toHaveLength(0);
  }
  // Search does not throw on '' / missing descriptions, and matches the card line.
  await setSearch('signed card');
  expect(cardOf('With Line')).toBeTruthy();
  expect(container.textContent).not.toContain('Empty Line');
  await setSearch('missing');
  expect(cardOf('Missing Line')).toBeTruthy();
  await setSearch('');
  expect(cardOf('Empty Line')).toBeTruthy();
};

describe('card description guard (T-365 AC6)', () => {
  it('Browse document types: no empty description element, search is safe', async () => {
    await act(async () => {
      root.render(
        <BrowseTypesStep kinds={KINDS} loading={false} onPick={jest.fn()} onDescribe={jest.fn()} />,
      );
    });
    await expectGuarded();
  });

  it('templates library: no empty description element', async () => {
    mockList();
    await act(async () => {
      root.render(<TemplatesPage />);
    });
    const cards = Array.from(container.querySelectorAll('a')).filter((a) =>
      a.textContent?.includes('Line'),
    );
    expect(cards).toHaveLength(3);
    const ps = (name: string) =>
      Array.from(cards.find((c) => c.textContent?.includes(name))!.querySelectorAll('p'));
    // name only for the empty and missing kinds; name + line for the signed one
    expect(ps('With Line').map((p) => p.textContent)).toEqual(['With Line', LINE]);
    expect(ps('Empty Line').map((p) => p.textContent)).toEqual(['Empty Line']);
    expect(ps('Missing Line').map((p) => p.textContent)).toEqual(['Missing Line']);
    expect(container.textContent).not.toContain('undefined');
  });

  it('dashboard/new: no empty description element, search is safe', async () => {
    mockList();
    await act(async () => {
      root.render(<NewDocumentPage />);
    });
    await expectGuarded();
  });
});
