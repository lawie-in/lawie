import { assignAuxRows, buildReport, buildWindow } from '../lib/aggregate';
import { aux, gen, RATES, WIN } from './fixtures';

const A = {
  ...WIN,
  label: 'A',
  start: new Date('2026-10-10T00:00:00Z'),
  end: new Date('2026-10-11T00:00:00Z'),
};
const B = {
  ...WIN,
  label: 'B',
  start: new Date('2026-10-12T00:00:00Z'),
  end: new Date('2026-10-13T00:00:00Z'),
};
const rep = (windows: Parameters<typeof buildReport>[0]['windows']) =>
  buildReport({
    windows,
    rates: RATES,
    usdInr: 85,
    usdInrFallback: false,
    includeFixtures: false,
    userFilter: null,
  });

describe('aux rows get exactly one window', () => {
  it('(a) intake in A, Generation in B: counted once, in B, no phantom intake-only draft in A', () => {
    const intake = aux({ id: 'aux-shared', intakeId: 'i1', costUsd: 0.5 });
    const r = rep([
      { window: A, generations: [], aux: [intake] },
      {
        window: B,
        generations: [gen({ documentId: 'd1', intakeId: 'i1', costUsd: 1 })],
        aux: [intake],
      },
    ]);
    expect(r.windows[0].drafts).toHaveLength(0);
    expect(r.windows[0].totalUsd).toBe(0);
    expect(r.windows[1].drafts).toHaveLength(1);
    expect(r.windows[1].drafts[0].linkage).toBe('exact');
    expect(r.windows[1].drafts[0].stages.intake.calls).toBe(1);
    expect(r.grandTotals.intake.calls).toBe(1);
    expect(r.grandTotalUsd).toBeCloseTo(1.5, 10);
    expect(r.grandTotalUsd).toBeCloseTo(r.windows[0].totalUsd + r.windows[1].totalUsd, 10);
    expect(r.sharedAuxRows).toEqual([{ id: 'aux-shared', windows: ['A', 'B'], countedIn: 'B' }]);
    expect(r.notes.join('\n')).toMatch(/aux-shared/);
  });

  it('ownership does not depend on window order', () => {
    const intake = aux({ id: 'x', intakeId: 'i1' });
    const out = assignAuxRows([
      { window: B, generations: [gen({ documentId: 'd', intakeId: 'i1' })], aux: [intake] },
      { window: A, generations: [], aux: [intake] },
    ]);
    expect(out.windows[0].aux).toHaveLength(1);
    expect(out.windows[1].aux).toHaveLength(0);
  });

  it('(b) intake and Generation both in A: unchanged, nothing shared', () => {
    const intake = aux({ intakeId: 'i1', costUsd: 0.5 });
    const r = rep([
      {
        window: A,
        generations: [gen({ documentId: 'd1', intakeId: 'i1', costUsd: 1 })],
        aux: [intake],
      },
      { window: B, generations: [], aux: [] },
    ]);
    expect(r.windows[0].drafts).toHaveLength(1);
    expect(r.windows[0].drafts[0].linkage).toBe('exact');
    expect(r.windows[0].drafts[0].stages.intake.calls).toBe(1);
    expect(r.grandTotalUsd).toBeCloseTo(1.5, 10);
    expect(r.sharedAuxRows).toEqual([]);
    expect(r.notes.join('\n')).not.toMatch(/fetched for more than one window/);
  });

  it('an aux row seen in two windows with no Generation anywhere is counted once, in the first', () => {
    const intake = aux({ id: 'orphan', intakeId: 'iz' });
    const r = rep([
      { window: A, generations: [], aux: [intake] },
      { window: B, generations: [], aux: [intake] },
    ]);
    expect(r.grandTotals.intake.calls).toBe(1);
    expect(r.sharedAuxRows[0]).toMatchObject({ id: 'orphan', countedIn: 'A' });
  });
});

describe('(c) intake-missing vs exact', () => {
  const w = (generations: ReturnType<typeof gen>[], a: ReturnType<typeof aux>[]) =>
    buildWindow({ window: A, generations, aux: a }, RATES, 85);

  it('Generation names an intakeId but no intake rows: intake-missing', () => {
    expect(w([gen({ documentId: 'd', intakeId: 'i1' })], []).drafts[0].linkage).toBe(
      'intake-missing',
    );
  });
  it('same with intake rows found: exact', () => {
    expect(
      w([gen({ documentId: 'd', intakeId: 'i1' })], [aux({ intakeId: 'i1' })]).drafts[0].linkage,
    ).toBe('exact');
  });
  it('no intakeId on the Generation: body-only (not intake-missing)', () => {
    expect(w([gen({ documentId: 'd' })], []).drafts[0].linkage).toBe('body-only');
  });
});
