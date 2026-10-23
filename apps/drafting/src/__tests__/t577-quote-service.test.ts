/**
 * T-577 - the paragraph quote (credits.service): config, mandatory minimum, bands, quoteDraft,
 * settleInkForDelivered, and the config source plumbing.
 *
 * Covers (ticket handoff items 2, 3, 12):
 *  - bail_regular minimum 7, or 8 in custody (ids and labels; ledger and brief values; the ledger
 *    wins over the brief for the same key); a pack without a block does not ask (class price).
 *  - bands: per-pack key preferred over base_<classPrice>; strict shape; a bad/missing/uncovering
 *    value makes the pack not ask, with one warn per key naming the key and never the value;
 *    bands clipped to [min, max]; base_2 = 2 / 3 / 4 Ink.
 *  - skeletonParagraphSource caches; _setParagraphConfigSourceForTests(null) restores the installed source.
 * In-memory Mongo for AppSettings; no model call.
 */
import './setupDb';

import type { LedgerFact } from '@lawie/shared';

import '../routes/documents.routes'; // installs the skeleton-backed paragraph config source
import { AppSetting } from '../models/AppSetting.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import * as appSettings from '../services/app-settings.service';
import {
  _resetParagraphBandWarnings,
  _setParagraphConfigSourceForTests,
  costForTemplate,
  getParagraphBands,
  getParagraphBandsWithKey,
  getParagraphConfig,
  ledgerFactsFromValues,
  mandatoryCount,
  paragraphConfigFromSkeleton,
  paragraphFactsFor,
  ParagraphConfig,
  ParagraphQuote,
  parseParagraphBands,
  quoteDraft,
  quoteInRange,
  settleInkForDelivered,
  skeletonParagraphSource,
} from '../services/credits.service';
import { loadSkeleton } from '../services/rule-pack.service';
import type { Skeleton } from '../types/skeleton';
import { choice, regularBase } from './fixtures/t373';

const BANDS_BASE_2 = JSON.stringify([
  { upTo: 10, add: 0 },
  { upTo: 18, add: 1 },
  { upTo: 25, add: 2 },
]);
const PREFIX = 'pricing.paragraph_bands';

async function seed(key: string, value: string): Promise<void> {
  await AppSetting.create({ key, value });
  _clearAppSettingsCache();
}
const seedBase2 = (): Promise<void> => seed(`${PREFIX}.base_2`, BANDS_BASE_2);

const IN_JUDICIAL = [{ key: 'currently_in_custody', value: 'Yes — Judicial custody' }];
const NOT_IN_CUSTODY = [{ key: 'currently_in_custody', value: 'No — anticipating arrest' }];

let warn: jest.SpyInstance;
beforeEach(() => {
  _clearAppSettingsCache();
  _resetParagraphBandWarnings();
  _setParagraphConfigSourceForTests(null);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  _setParagraphConfigSourceForTests(null);
});

const bandWarns = (): string[] =>
  warn.mock.calls.map((c) => c.map(String).join(' ')).filter((l) => l.includes('paragraph bands'));

// ── bail_regular's minimum ───────────────────────────────────────────────────

describe('bail_regular config and minimum (AJ-577-M2, M3, M5)', () => {
  it('declares default 10 and cap 25; the pack asks', () => {
    const c = getParagraphConfig('bail_regular');
    expect(c).not.toBeNull();
    expect(c!.default).toBe(10);
    expect(c!.cap).toBe(25);
  });

  it('no custody fact at all: 7', () => {
    expect(mandatoryCount('bail_regular', [])).toBe(7);
    expect(mandatoryCount('bail_regular')).toBe(7);
    expect(mandatoryCount('bail_regular', paragraphFactsFor([]))).toBe(7);
    expect(mandatoryCount('bail_regular', paragraphFactsFor(undefined))).toBe(7);
  });

  it.each([
    ['label Judicial', 'Yes — Judicial custody', 8],
    ['label Police', 'Yes — Police custody', 8],
    ['id yes_judicial', 'yes_judicial', 8],
    ['id yes_police', 'yes_police', 8],
    ['label anticipating arrest', 'No — anticipating arrest', 7],
    ['id no', 'no', 7],
    ['unrecognised text', 'somewhere', 7],
  ])('brief value %s -> %i', (_n, value, expected) => {
    const facts = paragraphFactsFor([{ key: 'currently_in_custody', value }]);
    expect(mandatoryCount('bail_regular', facts)).toBe(expected);
  });

  it('a blank or malformed value does not count as custody', () => {
    for (const v of [
      [{ key: 'currently_in_custody', value: '   ' }],
      [{ key: 'currently_in_custody' }],
      [{ value: 'yes_judicial' }],
      [null, 5, 'x'],
      'not an array',
    ]) {
      expect(mandatoryCount('bail_regular', paragraphFactsFor(v))).toBe(7);
    }
  });

  it('ledger entries (choice facts with ids) give the minimum', () => {
    expect(mandatoryCount('bail_regular', regularBase())).toBe(8); // yes_judicial
    const noCustody = [
      ...regularBase().filter((f) => f.key !== 'currently_in_custody'),
      choice('currently_in_custody', 'No — anticipating arrest', 'no'),
    ];
    expect(mandatoryCount('bail_regular', noCustody)).toBe(7);
  });

  it('the ledger wins over the brief for the same key', () => {
    const ledgerNo = [choice('currently_in_custody', 'No — anticipating arrest', 'no')];
    expect(mandatoryCount('bail_regular', paragraphFactsFor(IN_JUDICIAL, ledgerNo))).toBe(7);
    const ledgerYes = [choice('currently_in_custody', 'Yes — Police custody', 'yes_police')];
    expect(mandatoryCount('bail_regular', paragraphFactsFor(NOT_IN_CUSTODY, ledgerYes))).toBe(8);
  });

  it('the brief fills a key the ledger lacks', () => {
    const ledgerOther = regularBase().filter((f) => f.key !== 'currently_in_custody');
    expect(mandatoryCount('bail_regular', paragraphFactsFor(IN_JUDICIAL, ledgerOther))).toBe(8);
    expect(mandatoryCount('bail_regular', paragraphFactsFor(NOT_IN_CUSTODY, ledgerOther))).toBe(7);
  });

  it('ledgerFactsFromValues: one entry per value or list item, source user, blanks skipped', () => {
    const facts = ledgerFactsFromValues([
      { key: 'a', value: ' x ' },
      { key: 'b', value: ['p', '', 'q', 5] },
      { key: '', value: 'z' },
    ]);
    expect(facts.map((f) => [f.key, f.display])).toEqual([
      ['a', 'x'],
      ['b', 'p'],
      ['b', 'q'],
    ]);
    expect(facts.every((f) => f.source === 'user')).toBe(true);
  });

  it('a pack without a bodyParagraphs block has no config and no minimum', () => {
    for (const id of [
      'bail_anticipatory',
      'bail_before_magistrate',
      'default_bail',
      'affidavit_identity',
    ]) {
      expect(getParagraphConfig(id)).toBeNull();
      expect(mandatoryCount(id, [])).toBeNull();
    }
  });
});

describe('paragraphConfigFromSkeleton', () => {
  const sk = (over: Partial<Skeleton>): Skeleton =>
    ({ pack: 'p', version: 1, clauses: [], ...over }) as Skeleton;

  it('null without a block (or no skeleton)', () => {
    expect(paragraphConfigFromSkeleton(null, () => true)).toBeNull();
    expect(paragraphConfigFromSkeleton(sk({}), () => true)).toBeNull();
  });

  it('mandatory counts required clauses whose when holds (no when = always); optional never', () => {
    const skeleton = sk({
      bodyParagraphs: { default: 5, cap: 9 },
      clauses: [
        { id: 'a', order: 1, required: true, source: 'fixed' },
        { id: 'b', order: 2, required: true, source: 'fixed', when: { key: 'k', present: true } },
        { id: 'c', order: 3, required: false, source: 'fixed' },
        { id: 'd', order: 4, required: false, source: 'fixed', when: { key: 'k', present: true } },
      ],
    });
    const c = paragraphConfigFromSkeleton(skeleton, () => true)!;
    expect(c.mandatory([])).toBe(2);
    expect(paragraphConfigFromSkeleton(skeleton, () => false)!.mandatory([])).toBe(1);
    expect([c.default, c.cap]).toEqual([5, 9]);
  });

  it('the evaluator receives the facts and the clause condition', () => {
    const skeleton = sk({
      bodyParagraphs: { default: 5, cap: 9 },
      clauses: [
        { id: 'b', order: 2, required: true, source: 'fixed', when: { key: 'k', present: true } },
      ],
    });
    const seen: unknown[] = [];
    const facts: LedgerFact[] = [];
    paragraphConfigFromSkeleton(skeleton, (when, f) => {
      seen.push([when, f]);
      return true;
    })!.mandatory(facts);
    expect(seen).toEqual([[{ key: 'k', present: true }, facts]]);
  });

  it('mandatory over bail_regular derives 7 / 8 from the clauses, not from a stored number', () => {
    const real = loadSkeleton('bail_regular')!;
    expect(real.bodyParagraphs).toEqual({ default: 10, cap: 25 });
    expect(Object.keys(real.bodyParagraphs!)).toEqual(['default', 'cap']);
    const required = real.clauses.filter((c) => c.required);
    expect(required.filter((c) => !c.when).length).toBe(7);
    expect(required.filter((c) => c.when).map((c) => c.id)).toEqual(['custody_status']);
  });
});

// ── bands ────────────────────────────────────────────────────────────────────

describe('parseParagraphBands (strict)', () => {
  it('base_2 -> absolute bands 2 / 3 / 4 Ink over 1-10, 11-18, 19-25', () => {
    expect(parseParagraphBands(BANDS_BASE_2, 2)).toEqual([
      { from: 1, to: 10, ink: 2 },
      { from: 11, to: 18, ink: 3 },
      { from: 19, to: 25, ink: 4 },
    ]);
  });

  it('the add is over the class price of the pack', () => {
    expect(parseParagraphBands(BANDS_BASE_2, 1)!.map((b) => b.ink)).toEqual([1, 2, 3]);
  });

  it('a single band to 25, and bands that stop short of 25, are well-formed', () => {
    expect(parseParagraphBands('[{"upTo":25,"add":0}]', 2)).toEqual([{ from: 1, to: 25, ink: 2 }]);
    expect(parseParagraphBands('[{"upTo":10,"add":0}]', 2)).toEqual([{ from: 1, to: 10, ink: 2 }]);
  });

  it.each([
    ['not JSON', 'nope'],
    ['empty string', ''],
    ['an object', '{"upTo":10,"add":0}'],
    ['an object keyed by M', '{"M":[{"upTo":10,"add":0}]}'],
    ['empty array', '[]'],
    ['null', 'null'],
    ['a number', '5'],
    ['an array of numbers', '[1,2]'],
    ['an array of arrays', '[[10,0]]'],
    ['an array holding null', '[null]'],
    ['extra key', '[{"upTo":10,"add":0,"label":"x"}]'],
    ['missing add', '[{"upTo":10}]'],
    ['missing upTo', '[{"add":0}]'],
    ['other key names', '[{"to":10,"ink":2}]'],
    ['string numbers', '[{"upTo":"10","add":"0"}]'],
    ['fractional upTo', '[{"upTo":10.5,"add":0}]'],
    ['fractional add', '[{"upTo":10,"add":0.5}]'],
    ['upTo zero', '[{"upTo":0,"add":0}]'],
    ['negative upTo', '[{"upTo":-1,"add":0}]'],
    ['negative add', '[{"upTo":10,"add":-1}]'],
    ['last above 25', '[{"upTo":26,"add":0}]'],
    ['equal upTo', '[{"upTo":10,"add":0},{"upTo":10,"add":1}]'],
    ['descending upTo', '[{"upTo":18,"add":0},{"upTo":10,"add":1}]'],
    ['an upTo above 25 in the middle', '[{"upTo":30,"add":0},{"upTo":40,"add":1}]'],
    ['one bad item among good', '[{"upTo":10,"add":0},{"upTo":18},{"upTo":25,"add":2}]'],
    ['boolean add', '[{"upTo":10,"add":true}]'],
    ['NaN-like null add', '[{"upTo":10,"add":null}]'],
  ])('rejects %s', (_name, raw) => {
    expect(parseParagraphBands(raw, 2)).toBeNull();
  });
});

describe('getParagraphBands and quoteDraft: the setting key', () => {
  it('reads pricing.paragraph_bands.base_<classPrice> when the pack has no key of its own', async () => {
    await seedBase2();
    const b = await getParagraphBands('bail_regular', 2);
    expect(b!.map((x) => x.ink)).toEqual([2, 3, 4]);
  });

  it('the per-pack key is preferred over base_', async () => {
    await seedBase2();
    await seed(`${PREFIX}.bail_regular`, '[{"upTo":12,"add":0},{"upTo":25,"add":3}]');
    const b = await getParagraphBands('bail_regular', 2);
    expect(b).toEqual([
      { from: 1, to: 12, ink: 2 },
      { from: 13, to: 25, ink: 5 },
    ]);
    const q = await quoteDraft('bail_regular', { paragraphs: 13 });
    expect(q).toMatchObject({ asks: true, ink: 5 });
  });

  it('an invalid per-pack key falls back to base_ (with a warn naming the per-pack key)', async () => {
    await seedBase2();
    await seed(`${PREFIX}.bail_regular`, '{"bad":true}');
    const q = await quoteDraft('bail_regular', { paragraphs: 19 });
    expect(q).toMatchObject({ asks: true, ink: 4 });
    expect(bandWarns().join('\n')).toContain(`${PREFIX}.bail_regular`);
  });

  it('a per-pack key for another pack is not read', async () => {
    await seed(`${PREFIX}.bail_anticipatory`, BANDS_BASE_2);
    expect(await quoteDraft('bail_regular')).toEqual({ asks: false, ink: 2 });
  });
});

describe('quoteDraft: bands -> Ink, range, clipping (AJ-577-M2, M3; Vikram)', () => {
  beforeEach(seedBase2);

  it.each([
    [7, 2],
    [10, 2],
    [11, 3],
    [18, 3],
    [19, 4],
    [25, 4],
  ])('%i paragraphs -> %i Ink', async (n, ink) => {
    const q = (await quoteDraft('bail_regular', { paragraphs: n }))!;
    expect(q.asks).toBe(true);
    expect(q.ink).toBe(ink);
    expect(quoteInRange(q)).toBe(true);
  });

  it('every count in [7, 25] is priced 2 / 3 / 4 and the price never falls as the count rises', async () => {
    let last = 0;
    for (let n = 7; n <= 25; n += 1) {
      const q = (await quoteDraft('bail_regular', { paragraphs: n }))!;
      expect(q.ink).toBe(n <= 10 ? 2 : n <= 18 ? 3 : 4);
      expect(q.ink).toBeGreaterThanOrEqual(last);
      last = q.ink;
    }
  });

  it('absent count: the default (10) at the class price, same as today (golden unchanged)', async () => {
    const q = (await quoteDraft('bail_regular'))! as ParagraphQuote;
    expect(q).toMatchObject({ asks: true, ink: 2, paragraphs: 10, default: 10, min: 7, max: 25 });
    expect(q.ink).toBe(costForTemplate('bail_regular'));
  });

  it('the default is clamped up to the minimum', async () => {
    _setParagraphConfigSourceForTests(() => ({ mandatory: () => 12, default: 9, cap: 25 }));
    const q = (await quoteDraft('bail_regular'))! as ParagraphQuote;
    expect(q.min).toBe(12);
    expect(q.default).toBe(12);
    expect(q.paragraphs).toBe(12);
  });

  it('out of range: below the minimum, above the cap -> not in range, quoted at the highest band', async () => {
    for (const n of [0, 1, 6, 26, 100]) {
      const q = (await quoteDraft('bail_regular', { paragraphs: n }))! as ParagraphQuote;
      expect(q.asks).toBe(true);
      expect(quoteInRange(q)).toBe(false);
      expect(q.ink).toBe(4);
      expect(q.maxInk).toBe(4);
      expect(q.paragraphs).toBe(n);
    }
  });

  it('custody raises the minimum to 8, so 7 is out of range', async () => {
    const facts = paragraphFactsFor(IN_JUDICIAL);
    const ok = (await quoteDraft('bail_regular', { paragraphs: 8, facts }))! as ParagraphQuote;
    expect(ok.min).toBe(8);
    expect(quoteInRange(ok)).toBe(true);
    const low = (await quoteDraft('bail_regular', { paragraphs: 7, facts }))!;
    expect(quoteInRange(low)).toBe(false);
  });

  it('bands are clipped to [min, max]', async () => {
    const q7 = (await quoteDraft('bail_regular', { paragraphs: 10 }))! as ParagraphQuote;
    expect(q7.bands).toEqual([
      { from: 7, to: 10, ink: 2 },
      { from: 11, to: 18, ink: 3 },
      { from: 19, to: 25, ink: 4 },
    ]);
    const q8 = (await quoteDraft('bail_regular', {
      paragraphs: 10,
      facts: paragraphFactsFor(IN_JUDICIAL),
    }))! as ParagraphQuote;
    expect(q8.bands[0]).toEqual({ from: 8, to: 10, ink: 2 });
  });

  it('clipping drops bands wholly outside the range and trims to the cap', async () => {
    await AppSetting.deleteMany({});
    _clearAppSettingsCache();
    await seed(`${PREFIX}.base_2`, '[{"upTo":3,"add":0},{"upTo":10,"add":1},{"upTo":25,"add":2}]');
    const q = (await quoteDraft('bail_regular', { paragraphs: 7 }))! as ParagraphQuote;
    expect(q.bands).toEqual([
      { from: 7, to: 10, ink: 3 },
      { from: 11, to: 25, ink: 4 },
    ]);
    // the cap of a config below 25 trims the last band
    _setParagraphConfigSourceForTests(() => ({ mandatory: () => 7, default: 10, cap: 20 }));
    const q20 = (await quoteDraft('bail_regular', { paragraphs: 7 }))! as ParagraphQuote;
    expect(q20.max).toBe(20);
    expect(q20.bands[q20.bands.length - 1]).toEqual({ from: 11, to: 20, ink: 4 });
    expect(q20.maxInk).toBe(4);
  });

  it('ceiling is echoed only as the caller says (default false)', async () => {
    expect(((await quoteDraft('bail_regular'))! as ParagraphQuote).ceiling).toBe(false);
    expect(((await quoteDraft('bail_regular', { ceiling: true }))! as ParagraphQuote).ceiling).toBe(
      true,
    );
    expect(
      ((await quoteDraft('bail_regular', { ceiling: false }))! as ParagraphQuote).ceiling,
    ).toBe(false);
  });

  it('an unpriced id has no quote', async () => {
    expect(await quoteDraft('not_a_template')).toBeUndefined();
  });

  it('guided and a pack without a block are flat at their class price, with no settings read', async () => {
    const spy = jest.spyOn(appSettings, 'getAppSetting');
    expect(await quoteDraft('guided')).toEqual({ asks: false, ink: costForTemplate('guided') });
    expect(await quoteDraft('bail_anticipatory', { paragraphs: 20 })).toEqual({
      asks: false,
      ink: costForTemplate('bail_anticipatory'),
    });
    expect(await quoteDraft('affidavit_identity')).toEqual({
      asks: false,
      ink: costForTemplate('affidavit_identity'),
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('quoteDraft: missing or invalid bands -> the pack does not ask (class price), one warn per key', () => {
  it('both keys missing: flat at the class price; one warn per key, names the keys; no throw', async () => {
    const q = await quoteDraft('bail_regular', { paragraphs: 15 });
    expect(q).toEqual({ asks: false, ink: 2 });
    await quoteDraft('bail_regular');
    await quoteDraft('bail_regular', { paragraphs: 30 });
    const lines = bandWarns();
    expect(lines).toHaveLength(2);
    expect(lines.join('\n')).toContain(`${PREFIX}.bail_regular`);
    expect(lines.join('\n')).toContain(`${PREFIX}.base_2`);
  });

  it('a missing key warns again after the test reset', async () => {
    await quoteDraft('bail_regular');
    expect(bandWarns()).toHaveLength(2);
    _resetParagraphBandWarnings();
    await quoteDraft('bail_regular');
    expect(bandWarns()).toHaveLength(4);
  });

  const SECRET = 'SENTINEL_VALUE_12345';
  it.each([
    ['not JSON', `${SECRET}`],
    ['object', `{"upTo":10,"add":0,"x":"${SECRET}"}`],
    ['extra key', `[{"upTo":10,"add":0,"x":"${SECRET}"}]`],
    ['upTo above 25', `[{"upTo":99,"add":0,"x":"${SECRET}"}]`],
    ['fractional', `[{"upTo":10.5,"add":0,"x":"${SECRET}"}]`],
    ['descending', `[{"upTo":18,"add":0},{"upTo":10,"add":1},"${SECRET}"]`],
  ])(
    'invalid base_2 (%s): asks:false at class price, exactly one warn naming the key and not the value',
    async (_n, raw) => {
      await seed(`${PREFIX}.base_2`, raw);
      for (let i = 0; i < 3; i += 1) {
        expect(await quoteDraft('bail_regular', { paragraphs: 12 })).toEqual({
          asks: false,
          ink: 2,
        });
      }
      const lines = bandWarns().filter((l) => l.includes(`${PREFIX}.base_2`));
      expect(lines).toHaveLength(1);
      const all = warn.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
      expect(all).not.toContain(SECRET);
      expect(all).not.toContain('upTo');
    },
  );

  it('bands that do not cover [min, cap] (stop at 18), parsed from base_2 -> asks:false, one warn naming base_2 (not the pack key)', async () => {
    await seed(`${PREFIX}.base_2`, '[{"upTo":10,"add":0},{"upTo":18,"add":1}]');
    expect(await quoteDraft('bail_regular', { paragraphs: 12 })).toEqual({ asks: false, ink: 2 });
    await quoteDraft('bail_regular');
    expect(bandWarns().filter((l) => l.includes(`${PREFIX}.base_2`))).toHaveLength(1);
    expect(bandWarns().filter((l) => l.includes(`${PREFIX}.bail_regular`))).toHaveLength(0);
  });

  it('a pack key that parses but is short of the cap -> one warn naming the pack key', async () => {
    await seedBase2();
    await seed(`${PREFIX}.bail_regular`, '[{"upTo":10,"add":0},{"upTo":18,"add":1}]');
    expect(await quoteDraft('bail_regular')).toEqual({ asks: false, ink: 2 });
    await quoteDraft('bail_regular');
    expect(bandWarns().filter((l) => l.includes(`${PREFIX}.bail_regular`))).toHaveLength(1);
    expect(bandWarns().filter((l) => l.includes(`${PREFIX}.base_2`))).toHaveLength(0);
  });

  it('getParagraphBandsWithKey returns the key actually read, per path', async () => {
    expect(await getParagraphBandsWithKey('bail_regular', 2)).toBeNull();
    await seedBase2();
    const viaBase = await getParagraphBandsWithKey('bail_regular', 2);
    expect(viaBase!.key).toBe(`${PREFIX}.base_2`);
    expect(viaBase!.bands.map((b) => b.ink)).toEqual([2, 3, 4]);
    await seed(`${PREFIX}.bail_regular`, '[{"upTo":25,"add":1}]');
    const viaPack = await getParagraphBandsWithKey('bail_regular', 2);
    expect(viaPack).toEqual({
      key: `${PREFIX}.bail_regular`,
      bands: [{ from: 1, to: 25, ink: 3 }],
    });
    // getParagraphBands is still the plain array
    expect(await getParagraphBands('bail_regular', 2)).toEqual(viaPack!.bands);
  });

  it('an invalid pack key falls back to base_ and the key returned is base_', async () => {
    await seedBase2();
    await seed(`${PREFIX}.bail_regular`, 'garbage');
    expect((await getParagraphBandsWithKey('bail_regular', 2))!.key).toBe(`${PREFIX}.base_2`);
  });

  it('a per-pack key that is valid wins even when base_ is invalid (no ask:false)', async () => {
    await seed(`${PREFIX}.base_2`, 'garbage');
    await seed(`${PREFIX}.bail_regular`, BANDS_BASE_2);
    expect(await quoteDraft('bail_regular', { paragraphs: 19 })).toMatchObject({
      asks: true,
      ink: 4,
    });
    expect(bandWarns()).toHaveLength(0);
  });

  it('an unreadable setting (store error) is also asks:false with one warn naming the key', async () => {
    const spy = jest
      .spyOn(appSettings, 'getAppSetting')
      .mockRejectedValue(new Error('db down: SECRETBODY'));
    expect(await quoteDraft('bail_regular')).toEqual({ asks: false, ink: 2 });
    expect(await quoteDraft('bail_regular')).toEqual({ asks: false, ink: 2 });
    spy.mockRestore();
    const all = warn.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(all).toContain(`${PREFIX}.bail_regular`);
    expect(all).not.toContain('SECRETBODY');
    expect(bandWarns().filter((l) => l.includes('.bail_regular'))).toHaveLength(1);
  });

  it('with bands valid again after being invalid, the pack asks (nothing is cached as "never")', async () => {
    expect(await quoteDraft('bail_regular')).toMatchObject({ asks: false });
    await seedBase2();
    expect(await quoteDraft('bail_regular')).toMatchObject({ asks: true, ink: 2 });
  });
});

// ── settle at the delivered band ─────────────────────────────────────────────

describe('settleInkForDelivered: min(quote, band of the delivered count)', () => {
  const quoteAt = async (n: number, facts?: ReturnType<typeof paragraphFactsFor>) => {
    const q = (await quoteDraft('bail_regular', { paragraphs: n, facts }))! as ParagraphQuote;
    expect(q.asks).toBe(true);
    return q;
  };
  beforeEach(seedBase2);

  it('quote 4 (25 asked), 12 delivered -> 3', async () => {
    expect(settleInkForDelivered(await quoteAt(25), 12)).toBe(3);
  });

  it('never above the quote: quote 2 (10 asked), 20 delivered -> 2', async () => {
    expect(settleInkForDelivered(await quoteAt(10), 20)).toBe(2);
  });

  it('below the first band settles at the first band (class price), not at 0', async () => {
    const q = await quoteAt(25);
    expect(settleInkForDelivered(q, 0)).toBe(4); // unknown count: the quote
    expect(settleInkForDelivered(q, 3)).toBe(2);
    expect(settleInkForDelivered(q, 1)).toBe(2);
  });

  it('a count no band covers (above the bands) or an unusable count settles at the quote', async () => {
    const q = await quoteAt(25);
    for (const d of [26, 40, 1000]) expect(settleInkForDelivered(q, d)).toBe(4);
    for (const d of [Number.NaN, -1, 2.5, Number.POSITIVE_INFINITY]) {
      expect(settleInkForDelivered(q, d)).toBe(4);
    }
  });

  it('for every delivered count 0..60 and every quoted count, the settle is <= the quote and >= the class price', async () => {
    for (let asked = 7; asked <= 25; asked += 1) {
      const q = await quoteAt(asked);
      for (let d = 0; d <= 60; d += 1) {
        const s = settleInkForDelivered(q, d);
        expect(s).toBeLessThanOrEqual(q.ink);
        expect(s).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('with per-pack bands that do not start at the class price the first band is the floor', async () => {
    await seed(`${PREFIX}.bail_regular`, '[{"upTo":12,"add":1},{"upTo":25,"add":3}]');
    const q = await quoteAt(25);
    expect(q.ink).toBe(5);
    expect(settleInkForDelivered(q, 2)).toBe(3);
    expect(settleInkForDelivered(q, 13)).toBe(5);
  });
});

// ── the config source ────────────────────────────────────────────────────────

describe('skeletonParagraphSource and the test hook', () => {
  const askingSkeleton = {
    pack: 'x',
    version: 1,
    bodyParagraphs: { default: 6, cap: 12 },
    clauses: [{ id: 'a', order: 1, required: true, source: 'fixed' }],
  } as unknown as Skeleton;

  it('loads each pack once and keeps the result (config and null alike)', () => {
    const load = jest.fn((id: string) => (id === 'asks' ? askingSkeleton : null));
    const evaluatorFor = jest.fn(() => () => true);
    const src = skeletonParagraphSource(load, evaluatorFor);
    const a1 = src('asks') as ParagraphConfig;
    const a2 = src('asks');
    expect(a1).toBe(a2);
    expect(a1).toMatchObject({ default: 6, cap: 12 });
    expect(a1.mandatory([])).toBe(1);
    expect(src('none')).toBeNull();
    expect(src('none')).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls.map((c) => c[0])).toEqual(['asks', 'none']);
    expect(evaluatorFor).toHaveBeenCalledTimes(1);
    expect(evaluatorFor).toHaveBeenCalledWith('asks', askingSkeleton);
  });

  it('a skeleton without the block does not build an evaluator', () => {
    const evaluatorFor = jest.fn(() => () => true);
    const src = skeletonParagraphSource(
      () => ({ pack: 'y', version: 1, clauses: [] }) as unknown as Skeleton,
      evaluatorFor,
    );
    expect(src('y')).toBeNull();
    expect(evaluatorFor).not.toHaveBeenCalled();
  });

  it('a loader or evaluator that throws counts as "does not ask" and is cached', () => {
    const load = jest.fn(() => {
      throw new Error('bad skeleton');
    });
    const src = skeletonParagraphSource(load, () => () => true);
    expect(src('z')).toBeNull();
    expect(src('z')).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
    const src2 = skeletonParagraphSource(
      () => askingSkeleton,
      () => {
        throw new Error('no evaluator');
      },
    );
    expect(src2('q')).toBeNull();
  });

  it('_setParagraphConfigSourceForTests replaces the source; null restores the installed one', () => {
    const installed = getParagraphConfig('bail_regular');
    expect(installed).not.toBeNull();
    _setParagraphConfigSourceForTests(() => null);
    expect(getParagraphConfig('bail_regular')).toBeNull();
    _setParagraphConfigSourceForTests(() => ({ mandatory: () => 3, default: 4, cap: 5 }));
    expect(getParagraphConfig('anything')).toMatchObject({ default: 4, cap: 5 });
    expect(mandatoryCount('anything', [])).toBe(3);
    _setParagraphConfigSourceForTests(null);
    expect(getParagraphConfig('bail_regular')).toBe(installed); // the very same cached config
    expect(getParagraphConfig('anything')).toBeNull();
  });

  it('mandatoryCount never returns below 1 or a non-integer', () => {
    _setParagraphConfigSourceForTests(() => ({ mandatory: () => 0, default: 4, cap: 5 }));
    expect(mandatoryCount('t', [])).toBe(1);
    _setParagraphConfigSourceForTests(() => ({ mandatory: () => 2.5, default: 4, cap: 5 }));
    expect(mandatoryCount('t', [])).toBe(1);
  });
});
