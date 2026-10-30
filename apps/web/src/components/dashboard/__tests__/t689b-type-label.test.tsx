// T-689b: the dashboard summary's byTypeLabelled (parse) and the "Drafts by type" tile
// (prefers the labelled rows; falls back to byType + typeLabel).
import { ShelfKpis, type ShelfKpisProps } from '../ShelfKpis';
import { parseDashboardSummary, type DashboardSummary, type LoadStatus } from '../useDashboardData';

import { parsedSummary, summaryBody, tile } from './dash-test-utils';

import { cleanupMounted, mount, qa, stubMatchMedia } from '@/components/ui/__tests__/nl-test-utils';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

beforeEach(() => {
  stubMatchMedia();
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { emailVerified: true } }),
  });
});
afterEach(cleanupMounted);

describe('parseDashboardSummary: byTypeLabelled', () => {
  const good = [
    { key: 'written_statement', label: 'Written Statement', n: 2 },
    { key: 'petition', label: 'Petition', n: 1 },
  ];

  it('keeps valid rows as sent', () => {
    const p = parseDashboardSummary(summaryBody({ byTypeLabelled: good }));
    expect(p?.byTypeLabelled).toEqual(good);
    expect(p?.byType).toEqual({ bail_regular: 4, legal_notice: 2, plaint: 1 });
  });

  it('drops malformed rows and keeps the good ones', () => {
    const p = parseDashboardSummary(
      summaryBody({
        byTypeLabelled: [
          good[0],
          { key: '', label: 'No key', n: 1 },
          { key: 'k', label: '   ', n: 1 },
          { key: 'k', label: '', n: 1 },
          { key: 'k', label: 'Zero', n: 0 },
          { key: 'k', label: 'Negative', n: -2 },
          { key: 'k', label: 'NaN', n: Number.NaN },
          { key: 'k', label: 'String n', n: '3' },
          { key: 7, label: 'Number key', n: 1 },
          { label: 'Missing key', n: 1 },
          { key: 'k', n: 1 },
          { key: 'k', label: 'Missing n' },
          null,
          'x',
          42,
          [],
        ],
      }),
    );
    expect(p?.byTypeLabelled).toEqual([good[0]]);
  });

  it.each([
    ['not an array', 'nope'],
    ['an object', { key: 'a', label: 'A', n: 1 }],
    ['null', null],
    ['an empty array', []],
    ['all rows malformed', [{ key: '', label: 'x', n: 1 }, null, { key: 'a', label: ' ', n: 1 }]],
  ])('the field is absent when %s', (_n, v) => {
    const p = parseDashboardSummary(summaryBody({ byTypeLabelled: v }));
    expect(p).not.toBeNull();
    expect(p).not.toHaveProperty('byTypeLabelled');
  });

  it('an old response (no byTypeLabelled) parses exactly as before', () => {
    expect(parseDashboardSummary(summaryBody())).toEqual({
      draftsThisMonth: 7,
      byType: { bail_regular: 4, legal_notice: 2, plaint: 1 },
      statusCounts: { draft: 3, finalised: 2, exported: 2 },
      inkUsedThisMonth: 9,
    });
  });

  it('bad byTypeLabelled does not make the whole summary fail', () => {
    expect(parseDashboardSummary(summaryBody({ byTypeLabelled: 5 }))).not.toBeNull();
  });
});

function props(summary: DashboardSummary): ShelfKpisProps {
  return {
    ink: { loaded: true, loading: false, totalInk: 12, monthlyAllotment: 0 },
    summary: { data: summary, status: 'ready' as LoadStatus },
    plan: {
      data: {
        status: null,
        tier: 'free',
        renewsAt: null,
        state: 'active',
        cancelAtCycleEnd: false,
      },
      status: 'ready',
    },
    nudgeDismissed: false,
    onDismissNudge: jest.fn(),
    onTopUp: jest.fn(),
  };
}

function typeItems(summary: DashboardSummary): string[] {
  const { container } = mount(<ShelfKpis {...props(summary)} />);
  return qa('li', tile(container, 'Drafts by type')!).map((li) => li.textContent ?? '');
}

describe('ShelfKpis "Drafts by type": byTypeLabelled', () => {
  it('shows the label, "Written Statement", never "petition"', () => {
    const { container } = mount(
      <ShelfKpis
        {...props(
          parsedSummary({
            byType: { petition: 3 },
            byTypeLabelled: [
              { key: 'written_statement', label: 'Written Statement', n: 2 },
              { key: 'petition', label: 'Petition', n: 1 },
            ],
          }),
        )}
      />,
    );
    const t = tile(container, 'Drafts by type')!;
    expect(qa('li', t).map((li) => li.textContent)).toEqual(['Written Statement2', 'Petition1']);
    expect(qa('li', t)[0].textContent).not.toMatch(/petition/i);
  });

  it('shows a pack label as written (no lower-casing, brackets kept)', () => {
    expect(
      typeItems(
        parsedSummary({
          byTypeLabelled: [
            { key: 'divorce_hma', label: 'Divorce Petition (HMA, contested)', n: 2 },
          ],
        }),
      ),
    ).toEqual(['Divorce Petition (HMA, contested)2']);
  });

  it('a written statement stored as petition is not shown as "Petition" when it is the only row', () => {
    const items = typeItems(
      parsedSummary({
        byType: { petition: 2 },
        byTypeLabelled: [{ key: 'written_statement', label: 'Written Statement', n: 2 }],
      }),
    );
    expect(items).toEqual(['Written Statement2']);
    expect(items.join(' ')).not.toMatch(/petition/i);
  });

  it('sorts by n desc then label and shows the top three', () => {
    expect(
      typeItems(
        parsedSummary({
          byTypeLabelled: [
            { key: 'a', label: 'Zeta', n: 2 },
            { key: 'b', label: 'Alpha', n: 2 },
            { key: 'c', label: 'Mid', n: 5 },
            { key: 'd', label: 'Low', n: 1 },
          ],
        }),
      ),
    ).toEqual(['Mid5', 'Alpha2', 'Zeta2']);
  });

  it('bars are scaled to the largest row', () => {
    const { container } = mount(
      <ShelfKpis
        {...props(
          parsedSummary({
            byTypeLabelled: [
              { key: 'a', label: 'A', n: 4 },
              { key: 'b', label: 'B', n: 2 },
            ],
          }),
        )}
      />,
    );
    const widths = qa('li', tile(container, 'Drafts by type')!).map(
      (li) => (li.querySelector('[style*="width"]') as HTMLElement).style.width,
    );
    expect(widths).toEqual(['100%', '50%']);
  });

  it('two rows with the same label but different keys both render without a key clash', () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(
      typeItems(
        parsedSummary({
          byTypeLabelled: [
            { key: 'a', label: 'Same', n: 2 },
            { key: 'b', label: 'Same', n: 1 },
          ],
        }),
      ),
    ).toEqual(['Same2', 'Same1']);
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('falls back to byType + typeLabel when byTypeLabelled is absent', () => {
    expect(typeItems(parsedSummary({ byType: { written_statement: 2, bail_regular: 5 } }))).toEqual(
      ['Bail regular5', 'Written statement2'],
    );
  });

  it('falls back to byType + typeLabel when byTypeLabelled is empty', () => {
    expect(typeItems(parsedSummary({ byType: { bail_regular: 5 }, byTypeLabelled: [] }))).toEqual([
      'Bail regular5',
    ]);
  });

  it('shows "No drafts yet" when both are empty', () => {
    const { container } = mount(
      <ShelfKpis {...props(parsedSummary({ byType: {}, byTypeLabelled: [] }))} />,
    );
    expect(tile(container, 'Drafts by type')!.textContent).toContain('No drafts yet');
  });
});
