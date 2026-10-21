// T-524 visual-contract tests (class-level: jsdom has no layout, so the real-browser pass checks
// the computed sizes). break-ui: very long / RTL / Devanagari / emoji titles, 0 / NaN / negative /
// huge numbers, 1 vs 8 spines, double click on Top up and on the empty-state Draft.
import { useRouter } from 'next/navigation';
import type { SubscriptionStatus } from '@/components/billing/subscriptionStatus';

import { DASHBOARD_COPY } from '../dashboardCopy';
import { LowInkNudge, lowInkMessage } from '../LowInkNudge';
import { Shelf } from '../Shelf';
import { formatKpi, ShelfKpis, type ShelfKpisProps } from '../ShelfKpis';
import { Spine, spineName } from '../Spine';
import type { ShelfDocument } from '../useDashboardData';

import { parsedSummary, statusBody, tile, tileText } from './dash-test-utils';

import {
  cleanupMounted,
  click,
  mount,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const push = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  stubMatchMedia();
  (useRouter as jest.Mock).mockReturnValue({ push });
});
afterEach(cleanupMounted);

const doc = (over: Partial<ShelfDocument> = {}): ShelfDocument => ({
  _id: 'abc',
  title: 'State v. Rao',
  status: 'draft',
  ...over,
});
const spineHtml = (d: ShelfDocument, i = 0) =>
  mount(
    <ul>
      <Spine doc={d} index={i} />
    </ul>,
  );
const link = (c: ParentNode) => q('a', c) as HTMLAnchorElement;
const cls = (e: Element | null) => (e?.getAttribute('class') ?? '').split(/\s+/);

describe('Spine (T-524)', () => {
  it('spineName: title and status, or just the status', () => {
    expect(spineName('State v. Rao', 'draft')).toBe('State v. Rao (draft)');
    expect(spineName('', 'finalised')).toBe('finalised');
  });

  it('title is trimmed into the accessible name', () => {
    const { container } = spineHtml(doc({ title: '   State v. Rao \n' }));
    expect(link(container).getAttribute('aria-label')).toBe('State v. Rao (draft)');
  });

  it('the title span is dir=auto, one vertical line, ellipsis, can shrink', () => {
    const { container } = spineHtml(doc());
    const t = qa('a > span', container).find((s) => s.textContent === 'State v. Rao')!;
    expect(t.getAttribute('dir')).toBe('auto');
    const c = cls(t);
    expect(c).toEqual(
      expect.arrayContaining([
        'overflow-hidden',
        'text-ellipsis',
        'whitespace-nowrap',
        'min-h-0',
        'flex-1',
      ]),
    );
    expect(c).toContain('[writing-mode:vertical-rl]');
    expect(c).toContain('font-nl-display');
    expect(c).toContain('text-[0.9375rem]');
    expect(c.some((x) => /wrap|break/.test(x) && x !== 'whitespace-nowrap')).toBe(false);
  });

  it('never has a title attribute, anywhere inside', () => {
    const { container } = spineHtml(doc({ title: 'x'.repeat(200) }));
    expect(container.querySelector('[title]')).toBeNull();
  });

  it('is 3.25rem wide and its height is in rem (11.5 to 13.125)', () => {
    const widths = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const { container } = spineHtml(doc(), i);
      const c = cls(link(container));
      cleanupMounted();
      stubMatchMedia();
      return { w: c.filter((x) => /^w-\[/.test(x)), h: c.filter((x) => /^h-\[/.test(x)) };
    });
    for (const x of widths) expect(x.w).toEqual(['w-[3.25rem]']);
    const hs = widths.map((x) => x.h[0]);
    expect(new Set(hs.slice(0, 5)).size).toBe(5);
    expect(hs[5]).toBe(hs[0]);
    for (const h of hs) expect(h).toMatch(/^h-\[(11\.5|11\.875|12\.25|12\.75|13\.125)rem\]$/);
  });

  it('draft: two bands in the new brass-mark colour, no svg', () => {
    const { container } = spineHtml(doc());
    const bands = qa('span.h-1', container);
    expect(bands).toHaveLength(2);
    for (const b of bands) {
      expect(cls(b)).toContain('bg-[var(--brass-mark)]');
      expect(cls(b)).toContain('forced-colors:[background-color:CanvasText]');
      expect(cls(b)).toContain('forced-colors:[forced-color-adjust:none]');
    }
    expect(bands[0].parentElement!.getAttribute('aria-hidden')).toBe('true');
    expect(q('svg', container)).toBeNull();
  });

  it.each(['finalised', 'exported'] as const)(
    '%s: the seal mark in brass-mark, a forced-colors fallback, no bands',
    (status) => {
      const { container } = spineHtml(doc({ status }));
      expect(qa('span.h-1', container)).toHaveLength(0);
      const svg = q('svg', container)!;
      expect(svg.getAttribute('focusable')).toBe('false');
      const [disc, ring] = qa('circle', svg);
      expect(disc.getAttribute('fill')).toBe('var(--brass-mark)');
      // Rajesh's ruling: the ring is --ox at full opacity, the same token as the spine fill.
      expect(ring.getAttribute('stroke')).toBe('var(--ox)');
      expect(ring.hasAttribute('stroke-opacity')).toBe(false);
      expect(ring.hasAttribute('strokeOpacity')).toBe(false);
      expect(cls(link(container))).toContain('bg-nl-ox');
      expect(cls(svg)).toContain('forced-colors:[forced-color-adjust:none]');
      expect(cls(disc)).toContain('forced-colors:[fill:CanvasText]');
      expect(cls(ring)).toContain('forced-colors:[stroke:Canvas]');
      expect(link(container).dataset.status).toBe('finalised');
    },
  );

  it('forced-colors: the link has a 2px solid border', () => {
    const { container } = spineHtml(doc());
    expect(cls(link(container))).toEqual(
      expect.arrayContaining(['forced-colors:border-2', 'forced-colors:border-solid']),
    );
  });

  it('hover: group on the li, the pull on the link, an ::after strip that fills the gap; focus-visible pulls too', () => {
    const { container } = spineHtml(doc());
    const li = q('li', container)!;
    const c = cls(link(container));
    expect(cls(li)).toContain('group');
    expect(cls(li)).not.toContain('hover:-translate-y-[14px]');
    expect(c).toEqual(
      expect.arrayContaining([
        'group-hover:-translate-y-[14px]',
        'focus-visible:-translate-y-[14px]',
        'after:absolute',
        'after:top-full',
        'after:h-[14px]',
        'group-hover:after:block',
        'after:hidden',
        'relative',
      ]),
    );
    // the li never moves
    expect(cls(li).some((x) => x.includes('translate'))).toBe(false);
  });

  it('reduced motion or the mobile cap: no group, no pull, no strip', () => {
    stubMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    const { container } = spineHtml(doc());
    expect(cls(q('li', container))).not.toContain('group');
    expect(cls(link(container)).join(' ')).not.toMatch(/translate|after:/);
  });

  it.each([
    [
      'a very long case title',
      'Smt. Aleksandra Wiśniewska-Kowalczyk versus The State of Maharashtra through the Principal Secretary, Home Department, and Others',
    ],
    ['Devanagari', 'श्रीमती आशा राव बनाम राज्य सरकार'],
    ['RTL', 'عائشة ضد الدولة'],
    ['emoji', '⚖️ State v. Rao 👩‍⚖️'],
    ['a single unbroken token', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.repeat(4)],
    ['markup-looking text', '<b>State</b> &amp; **Rao**'],
  ])(
    '%s: full title in the accessible name and as text (escaped), the span still truncates',
    (_l, title) => {
      const { container } = spineHtml(doc({ title }));
      expect(link(container).getAttribute('aria-label')).toBe(`${title} (draft)`);
      const t = qa('a > span', container).find((s) => s.getAttribute('dir') === 'auto')!;
      expect(t.textContent).toBe(title);
      expect(t.querySelector('b')).toBeNull();
      expect(cls(t)).toContain('text-ellipsis');
    },
  );

  it('an empty and a whitespace title leave an empty dir=auto span and a status-only name', () => {
    for (const title of ['', '   ']) {
      const { container } = spineHtml(doc({ title }));
      expect(link(container).getAttribute('aria-label')).toBe('draft');
      cleanupMounted();
      stubMatchMedia();
    }
  });
});

describe('Shelf (T-524)', () => {
  it('"Recent documents" is an h2 Title (nl-h2) and names the section', () => {
    const { container } = mount(<Shelf docs={[doc()]} status="ready" />);
    const h = q('h2', container)!;
    expect(h.textContent).toBe('Recent documents');
    expect(cls(h)).toContain('nl-h2');
    expect(cls(h)).toContain('text-nl-text');
    expect(cls(h)).not.toContain('nl-label');
    expect(q('section', container)!.getAttribute('aria-labelledby')).toBe(h.id);
  });

  it('the edge is 10px wood (not 6) and the row reserves room for the tallest spine', () => {
    const { container } = mount(<Shelf docs={[doc()]} status="ready" />);
    const ul = q('ul', container)!;
    expect(cls(ul)).toContain('border-b-[10px]');
    expect(cls(ul)).not.toContain('border-b-[6px]');
    expect(cls(ul)).toContain('border-nl-wood');
    expect(cls(ul)).toContain('min-h-[calc(13.125rem+16px)]');
  });

  it('the loading shelf has the same edge and row height', () => {
    const { container } = mount(<Shelf docs={null} status="loading" />);
    const ul = q('ul', container)!;
    expect(cls(ul)).toContain('border-b-[10px]');
    expect(cls(ul)).toContain('min-h-[calc(13.125rem+16px)]');
  });

  it('the empty state renders without its own action; "Start your first draft" is one ghost button', () => {
    const { container } = mount(<Shelf docs={[]} status="ready" />);
    const starts = qa('button', container).filter(
      (b) => b.textContent === 'Start your first draft',
    );
    expect(starts).toHaveLength(1);
    expect(qa('button', container)).toHaveLength(1);
    expect(starts[0].getAttribute('data-variant')).toBe('ghost');
  });

  it('a double click on "Start your first draft" pushes /dashboard/new each time and nothing else', () => {
    const { container } = mount(<Shelf docs={[]} status="ready" />);
    const b = qa('button', container).find((x) => x.textContent === 'Start your first draft')!;
    click(b);
    click(b);
    expect(push.mock.calls).toEqual([['/dashboard/new'], ['/dashboard/new']]);
  });

  it('one spine and eight spines both render in one list', () => {
    const one = mount(<Shelf docs={[doc()]} status="ready" />);
    expect(qa('li', one.container)).toHaveLength(1);
    cleanupMounted();
    stubMatchMedia();
    const eight = mount(
      <Shelf docs={Array.from({ length: 8 }, (_, i) => doc({ _id: `d${i}` }))} status="ready" />,
    );
    expect(qa('li', eight.container)).toHaveLength(8);
    expect(qa('ul', eight.container)).toHaveLength(1);
  });
});

describe('LowInkNudge (T-524)', () => {
  const nudge = (over: Partial<React.ComponentProps<typeof LowInkNudge>> = {}) =>
    mount(
      <LowInkNudge
        balance={2}
        tier="free"
        renewsOn=""
        onTopUp={jest.fn()}
        onDismiss={jest.fn()}
        {...over}
      />,
    );

  it('is a role=status that is not announced (aria-live=off)', () => {
    const { container } = nudge();
    const s = q('[role=status]', container)!;
    expect(s.getAttribute('aria-live')).toBe('off');
    expect(s.hasAttribute('aria-atomic')).toBe(false);
  });

  it('Top up is ghost (not the primary variant) and calls onTopUp; a double click calls it twice', () => {
    const onTopUp = jest.fn();
    const { container } = nudge({ onTopUp });
    const b = qa('button', container).find((x) => x.textContent === DASHBOARD_COPY.topUp)!;
    expect(b.getAttribute('data-variant')).toBe('ghost');
    click(b);
    click(b);
    expect(onTopUp).toHaveBeenCalledTimes(2);
  });

  it.each([0, 1, 2, -3, 2.5])('lowInkMessage(%p) never prints NaN or undefined', (n) => {
    const m = lowInkMessage(n, 'free', '');
    expect(m).not.toMatch(/NaN|undefined|null/);
  });
});

describe('formatKpi (T-524 round 2)', () => {
  it.each([
    [0, '0'],
    [1, '1'],
    [12.5, '12.5'],
    [12345, '12,345'],
    [99999, '99,999'],
    [100000, '1,00,000'],
    [1234567, '12,34,567'],
    [1e9, '1,00,00,00,000'],
    [2.25, '2.3'],
    [0.5, '0.5'],
    [1234.56, '1,234.6'],
    [-1234, '-1,234'],
    [-12.5, '-12.5'],
    [5.0, '5'],
  ])('formats %p as %p', (n, text) => {
    expect(formatKpi(n)).toBe(text);
  });

  it('never prints more than one decimal', () => {
    for (const n of [0.123456, 7.999, 1 / 3, 1e6 + 0.04]) {
      expect(formatKpi(n)).toMatch(/^-?[\d,]+(\.\d)?$/);
    }
  });

  it.each([
    [Number.NaN, 'NaN'],
    [Number.POSITIVE_INFINITY, 'Infinity'],
    [Number.NEGATIVE_INFINITY, '-Infinity'],
  ])('prints the non-finite %p as it is', (n, text) => {
    expect(formatKpi(n)).toBe(text);
  });

  it('the KPI value classes carry no whitespace-nowrap (a long number wraps in its tile)', () => {
    const { container } = mount(
      <ShelfKpis
        ink={{ loaded: true, loading: false, totalInk: 1e9, monthlyAllotment: 0 }}
        summary={{ data: parsedSummary(), status: 'ready' }}
        plan={{ data: statusBody().data as SubscriptionStatus, status: 'ready' }}
        nudgeDismissed={false}
        onDismissNudge={jest.fn()}
        onTopUp={jest.fn()}
      />,
    );
    const v = tile(container, 'Ink balance')!.querySelector('p')!;
    expect(v.textContent).toBe('1,00,00,00,000 Ink');
    expect(cls(v)).not.toContain('whitespace-nowrap');
  });
});

describe('ShelfKpis (T-524)', () => {
  const props = (over: Partial<ShelfKpisProps> = {}): ShelfKpisProps => ({
    ink: { loaded: true, loading: false, totalInk: 120, monthlyAllotment: 0 },
    summary: { data: parsedSummary(), status: 'ready' },
    plan: { data: statusBody().data as SubscriptionStatus, status: 'ready' },
    nudgeDismissed: false,
    onDismissNudge: jest.fn(),
    onTopUp: jest.fn(),
    ...over,
  });
  const value = (c: ParentNode, label: string) => tile(c, label)!.querySelector('p')!;

  it('the three number tiles are Tiro 40px/44px, tabular, and can wrap', () => {
    const { container } = mount(<ShelfKpis {...props()} />);
    for (const label of ['Ink balance', 'Drafts this month', 'Ink used this month']) {
      const v = value(container, label);
      const c = cls(v);
      expect(c).toEqual(
        expect.arrayContaining([
          'font-nl-display',
          'text-[2.5rem]',
          'leading-[2.75rem]',
          'tabular-nums',
          'min-w-0',
          'break-words',
        ]),
      );
      expect(c).not.toContain('nl-h3');
    }
  });

  it('the two sentence tiles stay Subtitle (nl-h3), not Tiro 40', () => {
    const { container } = mount(<ShelfKpis {...props()} />);
    for (const label of ['Draft and finalised', 'Plan and renewal']) {
      const c = cls(value(container, label));
      expect(c).toContain('nl-h3');
      expect(c).not.toContain('text-[2.5rem]');
      expect(c).not.toContain('text-[40px]');
      expect(c).not.toContain('font-nl-display');
    }
  });

  it('tiles are labelled groups: role=group, aria-labelledby resolves to the h2, no section tiles', () => {
    const { container } = mount(<ShelfKpis {...props()} />);
    const groups = qa('[role=group]', container);
    expect(groups).toHaveLength(6);
    for (const g of groups) {
      const h = document.getElementById(g.getAttribute('aria-labelledby')!)!;
      expect(h.tagName).toBe('H2');
      expect(g.firstElementChild).toBe(h);
    }
    expect(qa('section', container)).toHaveLength(0);
    expect(new Set(groups.map((g) => g.getAttribute('aria-labelledby'))).size).toBe(6);
  });

  it('two instances on a page keep unique ids', () => {
    const a = mount(<ShelfKpis {...props()} />);
    const b = mount(<ShelfKpis {...props()} />);
    const ids = [...qa('[role=group]', a.container), ...qa('[role=group]', b.container)].map((g) =>
      g.getAttribute('aria-labelledby'),
    );
    expect(new Set(ids).size).toBe(12);
  });

  it('the Ink bar and the by-type bars get forced-colors rules', () => {
    const { container } = mount(
      <ShelfKpis
        {...props({ ink: { loaded: true, loading: false, totalInk: 20, monthlyAllotment: 100 } })}
      />,
    );
    const bars = qa('span[aria-hidden=true].block.h-2', container);
    expect(bars.length).toBeGreaterThan(0);
    for (const b of bars) {
      expect(cls(b)).toContain('forced-colors:border');
      expect(cls(b.firstElementChild)).toContain('forced-colors:[forced-color-adjust:none]');
    }
  });

  it.each([
    ['zero', 0, '0 Ink'],
    ['one', 1, '1 Ink'],
    ['five digits', 12345, '12,345 Ink'],
    ['seven digits', 1234567, '12,34,567 Ink'],
    ['a half', 12.5, '12.5 Ink'],
    ['one decimal rounding', 2.25, '2.3 Ink'],
  ])('Ink balance %s renders and stays in the tile (%s)', (_l, n, text) => {
    const { container } = mount(
      <ShelfKpis
        {...props({ ink: { loaded: true, loading: false, totalInk: n, monthlyAllotment: 0 } })}
      />,
    );
    expect(value(container, 'Ink balance').textContent).toBe(text);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('a %p balance is not shown as a number', (n) => {
    const { container } = mount(
      <ShelfKpis
        {...props({ ink: { loaded: true, loading: false, totalInk: n, monthlyAllotment: 0 } })}
      />,
    );
    expect(tileText(container, 'Ink balance')).toBe('Ink balance');
  });

  it('a negative or huge Ink used, and drafts, render without NaN and the meter clamps 0..100', () => {
    const big = parsedSummary({ inkUsedThisMonth: 999999, draftsThisMonth: 100000 });
    const { container } = mount(
      <ShelfKpis
        {...props({
          summary: { data: big, status: 'ready' },
          ink: { loaded: true, loading: false, totalInk: 50, monthlyAllotment: 100 },
        })}
      />,
    );
    expect(value(container, 'Ink used this month').textContent).toBe('9,99,999 Ink');
    expect(value(container, 'Drafts this month').textContent).toBe('1,00,000');
    const fill = tile(container, 'Ink used this month')!.querySelector(
      'span[aria-hidden=true] > span',
    ) as HTMLElement;
    expect(fill.style.width).toBe('100%');
    cleanupMounted();
    const neg = mount(
      <ShelfKpis
        {...props({
          summary: { data: parsedSummary({ inkUsedThisMonth: -5 }), status: 'ready' },
          ink: { loaded: true, loading: false, totalInk: 50, monthlyAllotment: 100 },
        })}
      />,
    );
    const f2 = tile(neg.container, 'Ink used this month')!.querySelector(
      'span[aria-hidden=true] > span',
    ) as HTMLElement;
    expect(f2.style.width).toBe('0%');
    expect(neg.container.textContent).not.toMatch(/NaN|undefined/);
  });

  it('a long document type name truncates inside its row; 1 type and 40 types (3 shown)', () => {
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`type_${i}`, i + 1]));
    const { container } = mount(
      <ShelfKpis
        {...props({
          summary: { data: parsedSummary({ byType: many }), status: 'ready' },
          plan: { data: null, status: 'error' },
        })}
      />,
    );
    expect(qa('ul li', tile(container, 'Drafts by type')!)).toHaveLength(3);
    cleanupMounted();
    const long = mount(
      <ShelfKpis
        {...props({
          summary: {
            data: parsedSummary({
              byType: { a_very_long_document_type_name_that_keeps_going_and_going: 1 },
            }),
            status: 'ready',
          },
        })}
      />,
    );
    const label = tile(long.container, 'Drafts by type')!.querySelector(
      'li span span',
    ) as HTMLElement;
    expect(cls(label)).toEqual(expect.arrayContaining(['min-w-0', 'truncate']));
  });

  it('the low-Ink nudge appears under the Ink value with a ghost Top up and aria-live off', () => {
    const { container } = mount(
      <ShelfKpis
        {...props({ ink: { loaded: true, loading: false, totalInk: 1, monthlyAllotment: 0 } })}
      />,
    );
    const n = q('[data-low-ink]', tile(container, 'Ink balance')!)!;
    expect(n.getAttribute('aria-live')).toBe('off');
    expect(n.getAttribute('role')).toBe('status');
    expect(
      qa('button', n)
        .find((b) => b.textContent === 'Top up')!
        .getAttribute('data-variant'),
    ).toBe('ghost');
  });
});
