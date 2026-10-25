// T-521 (Rajesh): the generating inkwell level, from the advocate's real balance.
import { FREE_INK, inkLevelFrom } from '../inkLevel';

describe('inkLevelFrom', () => {
  it('not loaded: null, whatever the numbers', () => {
    expect(inkLevelFrom({ loaded: false, totalInk: 3, monthlyAllotment: 10 })).toBeNull();
    expect(inkLevelFrom({ loaded: false, totalInk: 0, monthlyAllotment: 0 })).toBeNull();
  });
  it('3 of a monthly 10 is 30', () => {
    expect(inkLevelFrom({ loaded: true, totalInk: 3, monthlyAllotment: 10 })).toBeCloseTo(30);
  });
  it('no monthly allotment (Free): over 5', () => {
    expect(FREE_INK).toBe(5);
    expect(inkLevelFrom({ loaded: true, totalInk: 2, monthlyAllotment: 0 })).toBeCloseTo(40);
    expect(inkLevelFrom({ loaded: true, totalInk: 0, monthlyAllotment: 0 })).toBe(0);
  });
  it('clamps to 0..100', () => {
    expect(inkLevelFrom({ loaded: true, totalInk: 50, monthlyAllotment: 10 })).toBe(100);
    expect(inkLevelFrom({ loaded: true, totalInk: 12, monthlyAllotment: 0 })).toBe(100);
    expect(inkLevelFrom({ loaded: true, totalInk: -4, monthlyAllotment: 10 })).toBe(0);
  });
  it('non-number balance: null', () => {
    expect(inkLevelFrom({ loaded: true, totalInk: Number.NaN, monthlyAllotment: 10 })).toBeNull();
    expect(
      inkLevelFrom({ loaded: true, totalInk: Number.POSITIVE_INFINITY, monthlyAllotment: 10 }),
    ).toBeNull();
    expect(
      inkLevelFrom({
        loaded: true,
        totalInk: undefined as unknown as number,
        monthlyAllotment: 10,
      }),
    ).toBeNull();
  });
  it('a non-number or negative allotment falls back to 5 (no divide by NaN)', () => {
    expect(inkLevelFrom({ loaded: true, totalInk: 1, monthlyAllotment: Number.NaN })).toBeCloseTo(
      20,
    );
    expect(inkLevelFrom({ loaded: true, totalInk: 1, monthlyAllotment: -3 })).toBeCloseTo(20);
  });
});
