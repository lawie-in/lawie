import { buildReport, buildWindow } from '../lib/aggregate';
import { aux, gen, RATES, U1, U2, WIN } from './fixtures';

const win = (generations = [] as ReturnType<typeof gen>[], a = [] as ReturnType<typeof aux>[]) =>
  buildWindow({ window: WIN, generations, aux: a }, RATES, 85);

describe('aggregate: linking', () => {
  it('joins revisions of one document and its intake into one draft', () => {
    const w = win(
      [
        gen({ documentId: 'd1', runId: 'r1', intakeId: 'i1' }),
        gen({ documentId: 'd1', runId: 'r2', intakeId: 'i1', runType: 'revision' }),
      ],
      [aux({ intakeId: 'i1' }), aux({ intakeId: 'i1', purpose: 'intake_question' })],
    );
    expect(w.drafts).toHaveLength(1);
    const d = w.drafts[0];
    expect(d.linkage).toBe('exact');
    expect(d.revisions).toBe(1);
    expect(d.stages.body.calls).toBe(2);
    expect(d.stages.intake.calls).toBe(2);
    expect(d.documentIds).toEqual(['d1']);
    expect(d.runIds).toEqual(['r1', 'r2']);
    expect(d.docTypes).toEqual(['bail']);
    expect(d.totalUsd).toBeCloseTo(0.1 + 0.1 + 0.01 + 0.01, 10);
    expect(d.totalInr).toBeCloseTo(d.totalUsd * 85, 10);
  });

  it('joins by runId alone, and keeps unrelated drafts apart', () => {
    const w = win([gen({ runId: 'r1' }), gen({ runId: 'r1' }), gen({ documentId: 'other' })]);
    expect(w.drafts).toHaveLength(2);
    expect(w.drafts.map((d) => d.linkage)).toEqual(['body-only', 'body-only']);
  });

  it('a Generation with no ids is its own draft', () => {
    expect(win([gen(), gen()]).drafts).toHaveLength(2);
  });

  it('intake rows fetched from before the window still join their draft (intake via intakeId)', () => {
    const early = aux({ intakeId: 'i9', createdAt: new Date('2026-10-14T01:00:00Z') });
    const w = win([gen({ documentId: 'd9', intakeId: 'i9' })], [early]);
    expect(w.drafts).toHaveLength(1);
    expect(w.drafts[0].stages.intake.calls).toBe(1);
    expect(w.drafts[0].firstAt).toBe('2026-10-14T01:00:00.000Z');
  });

  it('intake with no generation is intake-only', () => {
    const w = win([], [aux({ intakeId: 'i2' })]);
    expect(w.drafts).toHaveLength(1);
    expect(w.drafts[0].linkage).toBe('intake-only');
  });
});

describe('aggregate: preflight', () => {
  const pre = (userId: string | null, costUsd = 0.02) =>
    aux({ purpose: 'preflight', userId, intakeId: null, costUsd });

  it('attaches to the draft when the user has exactly one draft', () => {
    const w = win([gen({ documentId: 'd1' })], [pre(U1)]);
    expect(w.drafts[0].preflight).toBe('user+window');
    expect(w.drafts[0].stages.preflight.calls).toBe(1);
    expect(w.unattributedPreflight).toHaveLength(0);
    expect(w.totalUsd).toBeCloseTo(0.12, 10);
  });

  it('stays unattributed (but counted in totals) when the user has 2 drafts', () => {
    const w = win([gen({ documentId: 'd1' }), gen({ documentId: 'd2' })], [pre(U1, 0.05)]);
    expect(w.drafts.every((d) => d.stages.preflight.calls === 0 && d.preflight === 'none')).toBe(
      true,
    );
    expect(w.unattributedPreflight).toHaveLength(1);
    expect(w.unattributedPreflight[0]).toMatchObject({ userId: U1, candidateDrafts: 2 });
    expect(w.totals.preflight.calls).toBe(1);
    expect(w.totalUsd).toBeCloseTo(0.25, 10);
  });

  it('stays unattributed when the user has no draft, and keeps users apart', () => {
    const w = win([gen({ documentId: 'd1', userId: U1 })], [pre(U2), pre(null)]);
    expect(w.unattributedPreflight).toHaveLength(2);
    const byUser = Object.fromEntries(
      w.unattributedPreflight.map((u) => [String(u.userId), u.candidateDrafts]),
    );
    expect(byUser).toEqual({ [U2]: 0, null: 0 });
    expect(w.drafts[0].stages.preflight.calls).toBe(0);
    expect(w.totals.preflight.calls).toBe(2);
  });

  it("an intake-only draft counts as the user's draft for preflight attachment", () => {
    const w = win([], [aux({ intakeId: 'i1' }), pre(U1)]);
    expect(w.drafts[0].stages.preflight.calls).toBe(1);
  });
});

describe('aggregate: totals', () => {
  it('per-window and grand totals agree, in USD and INR', () => {
    const w1 = {
      window: WIN,
      generations: [gen({ documentId: 'a', costUsd: 1 })],
      aux: [aux({ intakeId: 'x', costUsd: 0.5 })],
    };
    const w2 = {
      window: {
        ...WIN,
        label: 'w2',
        start: new Date('2026-10-17T00:00:00Z'),
        end: new Date('2026-10-18T00:00:00Z'),
      },
      generations: [gen({ documentId: 'b', costUsd: 2 })],
      aux: [aux({ purpose: 'preflight', userId: U2, costUsd: 0.25 })],
    };
    const r = buildReport({
      windows: [w1, w2],
      rates: RATES,
      usdInr: 80,
      usdInrFallback: false,
      includeFixtures: false,
      userFilter: null,
    });
    expect(r.windows[0].totalUsd).toBeCloseTo(1.5, 10);
    expect(r.windows[1].totalUsd).toBeCloseTo(2.25, 10);
    expect(r.grandTotalUsd).toBeCloseTo(3.75, 10);
    expect(r.grandTotalInr).toBeCloseTo(300, 8);
    expect(r.grandTotals.body.costUsd).toBeCloseTo(3, 10);
    expect(r.grandTotals.body.inputTokens).toBe(2000);
    expect(r.grandTotals.preflight.calls).toBe(1);
    expect(r.overlappingWindows).toEqual([]);
    expect(r.notes.join(' ')).not.toMatch(/double-counts/);
  });

  it('notes overlapping windows, missing rates and the 85 fallback', () => {
    const r = buildReport({
      windows: [
        {
          window: WIN,
          generations: [
            gen({ documentId: 'a', aiModel: 'mystery', costUsd: null, costStatus: 'rate_missing' }),
          ],
          aux: [],
        },
        { window: { ...WIN, label: 'w2' }, generations: [], aux: [] },
      ],
      rates: RATES,
      usdInr: 85,
      usdInrFallback: true,
      includeFixtures: false,
      userFilter: null,
    });
    expect(r.overlappingWindows).toEqual([['w1', 'w2']]);
    expect(r.missingRates).toEqual(['mystery']);
    expect(r.windows[0].drafts[0].stages.body.costSource).toBe('unpriced');
    const notes = r.notes.join('\n');
    expect(notes).toMatch(/double-counts/);
    expect(notes).toMatch(/mystery/);
    expect(notes).toMatch(/85 used/);
  });

  it('cost source: recorded, computed, mixed', () => {
    const rec = gen({ documentId: 'r' });
    const comp = gen({ documentId: 'c', costUsd: null, costStatus: 'rate_missing' });
    const w = win([rec, comp, gen({ documentId: 'r', runId: 'z' })]);
    const byDoc = Object.fromEntries(
      w.drafts.map((d) => [d.documentIds[0], d.stages.body.costSource]),
    );
    expect(byDoc).toEqual({ r: 'recorded', c: 'computed' });
    const mixed = win([
      gen({ documentId: 'm' }),
      gen({ documentId: 'm', costUsd: null, costStatus: 'rate_missing' }),
    ]);
    expect(mixed.drafts[0].stages.body.costSource).toBe('mixed');
    expect(w.totals.body.costSource).toBe('mixed');
  });

  it('reports tokens, models and failed calls', () => {
    const w = win([
      gen({ documentId: 'd', cacheCreationInputTokens: 10, cacheReadInputTokens: 20 }),
      gen({ documentId: 'd', status: 'failed', aiModel: 'claude-y' }),
    ]);
    const s = w.drafts[0].stages.body;
    expect(s).toMatchObject({
      calls: 2,
      failedCalls: 1,
      inputTokens: 2000,
      outputTokens: 1000,
      cacheWriteTokens: 10,
      cacheReadTokens: 20,
    });
    expect(s.models).toEqual(['claude-x', 'claude-y']);
  });

  it('ink class is always empty (not stored)', () => {
    expect(win([gen({ documentId: 'd' })]).drafts[0].inkClasses).toEqual([]);
  });
});
