/**
 * T-577 item 11 - validateSkeleton and the loader on the bodyParagraphs block (AJ-577-M5 (2)):
 * exactly { default: integer, cap: integer }, mandatory(max) <= default <= cap <= 25;
 * any other shape or extra key is rejected. Reads only the skeleton json under src/config.
 */
import './setupEnv';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  clearRulePackCache,
  clearSkeletonCache,
  loadRulePack,
  loadSkeleton,
  validateSkeleton,
} from '../services/rule-pack.service';

type Obj = Record<string, any>;
const FILE = join(__dirname, '..', 'config', 'document-rules', '_skeletons', 'bail_regular.json');
const real = (): Obj => JSON.parse(readFileSync(FILE, 'utf8'));
const errorsWith = (bp: unknown, mutate?: (s: Obj) => void): string[] => {
  const s = real();
  if (bp === undefined) delete s.bodyParagraphs;
  else s.bodyParagraphs = bp;
  mutate?.(s);
  return validateSkeleton(s, loadRulePack('bail_regular'), 'bail_regular');
};
const bpErrors = (e: string[]) => e.filter((x) => /bodyParagraphs/.test(x));

beforeEach(() => {
  clearRulePackCache();
  clearSkeletonCache();
});

describe('bodyParagraphs validation', () => {
  it('the signed v5 skeleton is valid and has exactly the signed block', () => {
    expect(errorsWith({ default: 10, cap: 25 })).toEqual([]);
    expect(real().bodyParagraphs).toEqual({ default: 10, cap: 25 });
  });

  it('no block is valid (the pack does not ask)', () => {
    expect(errorsWith(undefined)).toEqual([]);
  });

  it('accepts the bounds: default = mandatory max (8), default = cap, cap = 25', () => {
    expect(errorsWith({ default: 8, cap: 8 })).toEqual([]);
    expect(errorsWith({ default: 8, cap: 25 })).toEqual([]);
    expect(errorsWith({ default: 25, cap: 25 })).toEqual([]);
    expect(errorsWith({ default: 9, cap: 12 })).toEqual([]);
  });

  it.each([
    ['mandatory (8) > default', { default: 7, cap: 25 }],
    ['default > cap', { default: 20, cap: 15 }],
    ['cap > 25', { default: 10, cap: 26 }],
    ['cap far above 25', { default: 10, cap: 100 }],
    ['default zero', { default: 0, cap: 25 }],
    ['negative default', { default: -1, cap: 25 }],
    ['fractional default', { default: 10.5, cap: 25 }],
    ['fractional cap', { default: 10, cap: 24.5 }],
    ['string default', { default: '10', cap: 25 }],
    ['string cap', { default: 10, cap: '25' }],
    ['missing cap', { default: 10 }],
    ['missing default', { cap: 25 }],
    ['null default', { default: null, cap: 25 }],
    ['NaN-ish null cap', { default: 10, cap: null }],
    ['extra key mandatory', { mandatory: 7, default: 10, cap: 25 }],
    ['extra key other', { default: 10, cap: 25, min: 7 }],
    ['empty object', {}],
  ])('rejects %s', (_n, bp) => {
    expect(bpErrors(errorsWith(bp)).length).toBeGreaterThan(0);
  });

  it.each([
    ['null', null],
    ['an array', [10, 25]],
    ['a number', 25],
    ['a string', '10/25'],
    ['true', true],
  ])('rejects a block that is %s', (_n, bp) => {
    expect(bpErrors(errorsWith(bp)).length).toBeGreaterThan(0);
  });

  it('the mandatory count is the required clauses at their largest: marking one more clause required can break default 10', () => {
    const tight = errorsWith({ default: 10, cap: 25 }, (s) => {
      let extra = 3;
      for (const c of s.clauses) {
        if (!c.required && extra > 0) {
          c.required = true;
          extra -= 1;
        }
      }
    });
    expect(bpErrors(tight).join(' ')).toMatch(/mandatory/);
  });

  it('an unknown top-level key is still rejected (the block did not open the door)', () => {
    expect(errorsWith({ default: 10, cap: 25 }, (s) => (s.paragraphs = {})).length).toBeGreaterThan(
      0,
    );
  });
});

describe('loadSkeleton and the block', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 't577-sk-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('the loaded bail_regular carries bodyParagraphs {default 10, cap 25}; other bail packs carry none', () => {
    expect(loadSkeleton('bail_regular')!.bodyParagraphs).toEqual({ default: 10, cap: 25 });
    for (const id of ['bail_anticipatory', 'bail_before_magistrate', 'default_bail']) {
      expect(loadSkeleton(id)!.bodyParagraphs).toBeUndefined();
    }
  });

  it('a skeleton file with an invalid block does not load', () => {
    const s = real();
    s.bodyParagraphs = { default: 10, cap: 30 };
    writeFileSync(join(tmp, 'bail_regular.json'), JSON.stringify(s));
    expect(() => loadSkeleton('bail_regular', tmp)).toThrow();
  });

  it('a skeleton file with a valid block loads from an override dir', () => {
    const s = real();
    s.bodyParagraphs = { default: 12, cap: 20 };
    writeFileSync(join(tmp, 'bail_regular.json'), JSON.stringify(s));
    expect(loadSkeleton('bail_regular', tmp)!.bodyParagraphs).toEqual({ default: 12, cap: 20 });
  });
});
