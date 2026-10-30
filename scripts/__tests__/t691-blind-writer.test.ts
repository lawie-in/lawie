import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  AbDraft,
  AbMetrics,
  KeyPayload,
  MIN_PASSPHRASE,
  countPlaceholders,
  renderScoringFile,
  safeCode,
  scrubMetadata,
  seal,
  seededShuffle,
  unseal,
  writeBlind,
} from '../ab/blind-writer';

/**
 * T-691: the blind writer of the drafter A/B. Pure apart from files written under a temp dir.
 * Does not read handoff/. The passphrase is built at runtime (no secret-looking literal; gitleaks).
 */

const PASS = ['unit', 'test', 'phrase', String(12345)].join('-');
const WRONG = ['another', 'phrase', 'entirely', String(999)].join('-');

const MODEL_RE = /claude|opus|sonnet|haiku/i;

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't691-bw-'));
});
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function metrics(over: Partial<AbMetrics> = {}): AbMetrics {
  return {
    tokens: { input: 11111, output: 22222, cacheRead: 3333, cacheCreation: 4444 },
    intakeTokens: { input: 555, output: 666, cacheRead: 0, cacheCreation: 0 },
    costUsd: { raw: 1.2345, uncachedEquivalent: 2.3456 },
    factDiffs: 2,
    placeholders: { missingMarkers: 1, toBeConfirmed: 0, renderedMissing: 0 },
    withheld: false,
    legalReviewer: 'n/a',
    ...over,
  };
}

function draft(i: number, over: Partial<AbDraft> = {}): AbDraft {
  return {
    fixtureId: `fx-${i}`,
    model: i % 2 === 0 ? 'claude-opus-5-5' : 'claude-sonnet-5-5',
    runId: `run-id-${i}-zz`,
    title: `Matter title number ${i}`,
    facts: `Facts given for matter ${i}.`,
    outcome: { kind: 'delivered', text: `Draft body text ${i}. The plaintiff prays for relief.` },
    metrics: metrics(),
    ...over,
  };
}

const eight = (): AbDraft[] => Array.from({ length: 8 }, (_, i) => draft(i + 1));

function write(drafts: AbDraft[], seed: number, stamp: string) {
  return writeBlind(drafts, { outRoot: tmp, passphrase: PASS, seed, stamp });
}

describe('seededShuffle', () => {
  const items = Array.from({ length: 20 }, (_, i) => i);

  it('is deterministic for a seed', () => {
    expect(seededShuffle(items, 42)).toEqual(seededShuffle(items, 42));
  });

  it('is a permutation (same members, none lost or doubled) and does not mutate the input', () => {
    const copy = [...items];
    const out = seededShuffle(items, 7);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
    expect(items).toEqual(copy);
  });

  it('differs between seeds and differs from the input order', () => {
    expect(seededShuffle(items, 1)).not.toEqual(seededShuffle(items, 2));
    expect(seededShuffle(items, 1)).not.toEqual(items);
  });
});

describe('scrubMetadata / safeCode', () => {
  it('replaces model words case-insensitively and reports it', () => {
    const r = scrubMetadata('Written by CLAUDE with Opus and sonnet, not Haiku');
    expect(r.replaced).toBe(true);
    expect(r.text).toBe('Written by [model] with [model] and [model], not [model]');
  });

  it('leaves clean text alone', () => {
    expect(scrubMetadata('plain text')).toEqual({ text: 'plain text', replaced: false });
  });

  it('safeCode: lower-case letters, digits and underscores only', () => {
    expect(safeCode('Fact_Needed')).toBe('fact_needed');
    expect(safeCode('generate http/500 !!')).toBe('generate_http_500');
    expect(safeCode('--weird--')).toBe('weird');
  });

  it('safeCode: scrubs model words, caps at 40, and never returns empty', () => {
    expect(MODEL_RE.test(safeCode('error_from_claude_opus'))).toBe(false);
    expect(safeCode('a'.repeat(100))).toHaveLength(40);
    expect(safeCode('!!!')).toBe('unknown');
    expect(safeCode('')).toBe('unknown');
  });
});

describe('countPlaceholders', () => {
  it('null and empty give zero', () => {
    expect(countPlaceholders(null)).toEqual({ missingMarkers: 0, toBeConfirmed: 0 });
    expect(countPlaceholders('')).toEqual({ missingMarkers: 0, toBeConfirmed: 0 });
  });

  it('counts both markers separately', () => {
    const t = 'a {{MISSING: name}} b {{MISSING: date}} c [To be confirmed: amount] d';
    expect(countPlaceholders(t)).toEqual({ missingMarkers: 2, toBeConfirmed: 1 });
  });

  it('does not count look-alikes', () => {
    expect(countPlaceholders('{{MISSING name}} [to be confirmed: x] {MISSING: x}')).toEqual({
      missingMarkers: 0,
      toBeConfirmed: 0,
    });
  });
});

describe('renderScoringFile', () => {
  it('renders a delivered draft with title, facts and body', () => {
    const r = renderScoringFile('D03', {
      title: 'T',
      facts: 'F',
      outcome: { kind: 'delivered', text: 'BODY' },
    });
    expect(r.text).toContain('# D03');
    expect(r.text).toContain('## Matter\n\nT');
    expect(r.text).toContain('## Facts given\n\nF');
    expect(r.text).toContain('## Draft\n\nBODY');
    expect(r.bodyNamesModel).toBe(false);
  });

  it('renders WITHHELD by the gates with a sanitised code', () => {
    const r = renderScoringFile('D01', {
      title: 'T',
      facts: 'F',
      outcome: { kind: 'withheld', code: 'Fact_Needed' },
    });
    expect(r.text).toContain('**WITHHELD by the gates**');
    expect(r.text).toContain('Reason code: fact_needed');
    expect(r.text).not.toContain('NOT PRODUCED');
  });

  it('renders NOT PRODUCED for a failed run, distinct from withheld', () => {
    const r = renderScoringFile('D02', {
      title: 'T',
      facts: 'F',
      outcome: { kind: 'failed', code: 'intake_http_500' },
    });
    expect(r.text).toContain('**NOT PRODUCED**');
    expect(r.text).toContain('Reason code: intake_http_500');
    expect(r.text).not.toContain('WITHHELD');
  });

  it('a model word in the body is counted, not altered; in metadata it is replaced', () => {
    const body = 'The draft says Claude and OPUS wrote this.';
    const r = renderScoringFile('D01', {
      title: 'Sonnet matter',
      facts: 'facts with haiku',
      outcome: { kind: 'delivered', text: body },
    });
    expect(r.bodyNamesModel).toBe(true);
    expect(r.metadataScrubbed).toBe(true);
    expect(r.text).toContain(body);
    expect(r.text).toContain('[model] matter');
    expect(r.text).toContain('facts with [model]');
  });
});

describe('seal / unseal', () => {
  const payload: KeyPayload = {
    version: 2,
    seed: 9,
    metricsSeed: 10,
    entries: {
      D01: {
        fixtureId: 'a',
        model: 'm',
        runId: null,
        metricsId: 'M01',
        placeholders: { missingMarkers: 0, toBeConfirmed: 0, renderedMissing: 0 },
        withheld: false,
      },
    },
    intake: {
      a: { tokens: { input: 1, output: 2, cacheRead: 0, cacheCreation: 0 }, spend: null },
    },
  };

  function sealedFile(name: string): string {
    const p = path.join(tmp, name);
    fs.writeFileSync(p, JSON.stringify(seal(payload, PASS)));
    return p;
  }

  it('round-trips', () => {
    expect(unseal(sealedFile('rt.json'), PASS)).toEqual(payload);
  });

  it('shape: aes-256-gcm, scrypt N=2^15, 16-byte salt, 12-byte iv; no clear payload', () => {
    const s = seal(payload, PASS);
    expect(s.alg).toBe('aes-256-gcm');
    expect(s.kdf).toBe('scrypt');
    expect(s.N).toBe(1 << 15);
    expect(Buffer.from(s.salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(s.iv, 'base64')).toHaveLength(12);
    expect(JSON.stringify(s)).not.toContain('fixtureId');
  });

  it('a wrong passphrase throws', () => {
    expect(() => unseal(sealedFile('wp.json'), WRONG)).toThrow();
  });

  it('a tampered ciphertext byte throws', () => {
    const p = sealedFile('tc.json');
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    const ct = Buffer.from(s.ct, 'base64');
    ct[0] ^= 0x01;
    s.ct = ct.toString('base64');
    fs.writeFileSync(p, JSON.stringify(s));
    expect(() => unseal(p, PASS)).toThrow();
  });

  it('a tampered tag throws', () => {
    const p = sealedFile('tt.json');
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    const tag = Buffer.from(s.tag, 'base64');
    tag[0] ^= 0x01;
    s.tag = tag.toString('base64');
    fs.writeFileSync(p, JSON.stringify(s));
    expect(() => unseal(p, PASS)).toThrow();
  });

  it('seal produces a full 16-byte GCM tag', () => {
    expect(Buffer.from(seal(payload, PASS).tag, 'base64')).toHaveLength(16);
  });

  it('a truncated (12-byte) tag is refused by length, even though its bytes are a true prefix', () => {
    const p = sealedFile('tag12.json');
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    const tag = Buffer.from(s.tag, 'base64');
    s.tag = tag.subarray(0, 12).toString('base64');
    fs.writeFileSync(p, JSON.stringify(s));
    expect(() => unseal(p, PASS)).toThrow(/bad tag length/);
  });

  it('a 4-byte and a 17-byte tag are refused by length too', () => {
    for (const n of [4, 17]) {
      const p = sealedFile(`tag${n}.json`);
      const s = JSON.parse(fs.readFileSync(p, 'utf8'));
      s.tag = Buffer.concat([Buffer.from(s.tag, 'base64'), Buffer.alloc(n)])
        .subarray(0, n)
        .toString('base64');
      fs.writeFileSync(p, JSON.stringify(s));
      expect(() => unseal(p, PASS)).toThrow(/bad tag length/);
    }
  });

  it('a 16-byte tag with one byte changed fails the GCM check (not the length check)', () => {
    const p = sealedFile('tag16.json');
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    const tag = Buffer.from(s.tag, 'base64');
    tag[15] ^= 0xff;
    s.tag = tag.toString('base64');
    expect(tag).toHaveLength(16);
    fs.writeFileSync(p, JSON.stringify(s));
    let err: Error | null = null;
    try {
      unseal(p, PASS);
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err?.message).not.toMatch(/bad tag length/);
  });

  it('a sealed version-1 payload is refused, though it decrypts under the right passphrase', () => {
    const v1 = {
      version: 1,
      seed: 9,
      entries: { D01: { fixtureId: 'a', model: 'm', runId: null } },
    };
    const p = path.join(tmp, 'v1.json');
    // seal() takes a KeyPayload (version 2), so the old shape is passed through a cast
    fs.writeFileSync(p, JSON.stringify(seal(v1 as unknown as KeyPayload, PASS)));
    expect(() => unseal(p, PASS)).toThrow(/unsupported T-691 key payload version 1/);
    // a payload with no version at all is refused the same way
    const p2 = path.join(tmp, 'nov.json');
    fs.writeFileSync(p2, JSON.stringify(seal({ seed: 1 } as unknown as KeyPayload, PASS)));
    expect(() => unseal(p2, PASS)).toThrow(/unsupported T-691 key payload version undefined/);
    // version 2 still opens
    expect(unseal(sealedFile('v2ok.json'), PASS).version).toBe(2);
  });

  it('a changed header (alg) is refused', () => {
    const p = sealedFile('alg.json');
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    s.alg = 'aes-128-gcm';
    fs.writeFileSync(p, JSON.stringify(s));
    expect(() => unseal(p, PASS)).toThrow(/not a T-691 sealed key/);
  });

  it('a short passphrase is refused', () => {
    const short = 'x'.repeat(MIN_PASSPHRASE - 1);
    expect(MIN_PASSPHRASE).toBeGreaterThanOrEqual(12);
    expect(() => seal(payload, short)).toThrow(/at least/);
  });

  it('two seals of the same payload differ (fresh salt and iv)', () => {
    expect(seal(payload, PASS).ct).not.toBe(seal(payload, PASS).ct);
  });
});

describe('writeBlind', () => {
  it('refuses an empty list and a short passphrase, writing nothing', () => {
    expect(() => writeBlind([], { outRoot: tmp, passphrase: PASS, stamp: 'empty' })).toThrow();
    expect(() =>
      writeBlind(eight(), { outRoot: tmp, passphrase: 'short', stamp: 'shortpass' }),
    ).toThrow(/at least/);
    expect(fs.existsSync(path.join(tmp, 'shortpass'))).toBe(false);
  });

  it('writes D01..D08 under scoring/, metrics and intake spend under vikram/, the key at the top', () => {
    const r = write(eight(), 123, 'layout');
    expect(fs.readdirSync(r.dir).sort()).toEqual(['KEY.sealed.json', 'scoring', 'vikram']);
    expect(fs.readdirSync(r.scoringDir).sort()).toEqual(
      Array.from({ length: 8 }, (_, i) => `D0${i + 1}.md`),
    );
    expect(fs.readdirSync(path.join(r.dir, 'vikram')).sort()).toEqual([
      'intake-spend.json',
      'metrics.json',
    ]);
    expect(r.metricsPath).toBe(path.join(r.dir, 'vikram', 'metrics.json'));
    expect(r.intakePath).toBe(path.join(r.dir, 'vikram', 'intake-spend.json'));
    expect(r.keyPath).toBe(path.join(r.dir, 'KEY.sealed.json'));
    expect(r.counts).toEqual({ drafts: 8, delivered: 8, withheld: 0, failed: 0 });
  });

  it('scoring order equals the seeded shuffle, not the input order', () => {
    const drafts = eight();
    const seed = 2026;
    const expected = seededShuffle(drafts, seed).map((d) => d.fixtureId);
    // the chosen seed must actually move things, or this test proves nothing
    expect(expected).not.toEqual(drafts.map((d) => d.fixtureId));
    const r = write(drafts, seed, 'order');
    const key = unseal(r.keyPath, PASS);
    expect(key.seed).toBe(seed);
    const ids = Object.keys(key.entries).sort();
    expect(ids.map((id) => key.entries[id].fixtureId)).toEqual(expected);
    // and the file D0k holds the title of the k-th shuffled draft
    ids.forEach((id, k) => {
      const text = fs.readFileSync(path.join(r.scoringDir, `${id}.md`), 'utf8');
      const src = drafts.find((d) => d.fixtureId === expected[k]);
      expect(text).toContain(src?.title ?? 'MISSING');
    });
  });

  it('the same seed gives the same order; another seed gives another', () => {
    const a = unseal(write(eight(), 5, 'same-a').keyPath, PASS);
    const b = unseal(write(eight(), 5, 'same-b').keyPath, PASS);
    const c = unseal(write(eight(), 6, 'same-c').keyPath, PASS);
    const order = (k: typeof a) =>
      Object.keys(k.entries)
        .sort()
        .map((i) => k.entries[i].fixtureId);
    expect(order(a)).toEqual(order(b));
    expect(order(a)).not.toEqual(order(c));
  });

  it('no model, vendor, token, cost, runId or timestamp appears in any scoring file', () => {
    const drafts = eight().map((d, i) =>
      i === 0
        ? draft(1, {
            title: 'Opus title for matter one',
            facts: 'Facts mentioning sonnet and Claude.',
            outcome: { kind: 'withheld', code: 'claude_fact_needed' },
          })
        : d,
    );
    const r = write(drafts, 77, 'leak');
    const forbidden = [
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      ...drafts.map((d) => d.runId as string),
      '11111',
      '22222',
      '3333',
      '4444',
      '1.2345',
      '2.3456',
      'tokens',
      'costUsd',
      'runId',
    ];
    const isoStamp = /\d{4}-\d{2}-\d{2}[T ]\d{2}[:-]\d{2}/;
    for (const f of r.scoringFiles) {
      const text = fs.readFileSync(f, 'utf8');
      expect(MODEL_RE.test(text)).toBe(false);
      for (const bad of forbidden) expect(text).not.toContain(bad);
      expect(isoStamp.test(text)).toBe(false);
    }
    expect(r.warnings.modelWordInBody).toBe(0);
    expect(r.warnings.modelWordInMetadata).toBe(1);
  });

  describe('the metrics are blind to the scoring ids (review round 1, MUST 1)', () => {
    /** Every draft carries numbers no other draft shares, so a row can be traced to its draft. */
    function uniq(i: number, over: Partial<AbDraft> = {}): AbDraft {
      return draft(i, {
        metrics: metrics({
          tokens: { input: 10_000 + i, output: 20_000 + i * 7, cacheRead: 0, cacheCreation: 0 },
          intakeTokens: { input: 500 + i, output: 600 + i, cacheRead: 0, cacheCreation: 0 },
          costUsd: { raw: i / 100, uncachedEquivalent: i / 50 },
          factDiffs: i,
          spend: { usd: i / 10, inr: (i / 10) * 88 },
          intakeSpend: { usd: i / 1000, inr: (i / 1000) * 88 },
        }),
        ...over,
      });
    }
    const uniqEight = () => Array.from({ length: 8 }, (_, i) => uniq(i + 1));
    const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

    it('M-ids are a permutation of M01..M08 and the rows come out in M-id order', () => {
      const r = write(uniqEight(), 31, 'm-perm');
      const m = readJson(r.metricsPath);
      const ids = Object.keys(m);
      expect(ids).toEqual(Array.from({ length: 8 }, (_, i) => `M0${i + 1}`));
      const key = unseal(r.keyPath, PASS);
      expect(
        Object.values(key.entries)
          .map((e) => e.metricsId)
          .sort(),
      ).toEqual(ids);
    });

    it('over 30 seeds the D-to-M map is never the identity and agrees with the identity only by chance', () => {
      let fixedPoints = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const r = write(uniqEight(), seed, `m-indep-${seed}`);
        const key = unseal(r.keyPath, PASS);
        const same = Object.entries(key.entries).filter(
          ([d, e]) => d.slice(1) === e.metricsId.slice(1),
        ).length;
        expect(same).toBeLessThan(8); // never the identity
        fixedPoints += same;
        // the two shuffles use their own seeds
        expect(key.metricsSeed).not.toBe(key.seed);
      }
      // a random permutation of 8 has 1 fixed point on average: 30 seeds give about 30
      expect(fixedPoints).toBeLessThan(75);
    });

    it('different seeds give different D-to-M maps (the M-order is not a function of the D-order alone)', () => {
      const maps = new Set<string>();
      for (let seed = 1; seed <= 20; seed++) {
        const key = unseal(write(uniqEight(), seed, `m-var-${seed}`).keyPath, PASS);
        maps.add(
          Object.keys(key.entries)
            .sort()
            .map((d) => key.entries[d].metricsId)
            .join(','),
        );
      }
      expect(maps.size).toBe(20);
    });

    it('a seed gives one fixed D-to-M map; without a seed both seeds come from crypto', () => {
      const a = unseal(write(uniqEight(), 77, 'm-det-a').keyPath, PASS);
      const b = unseal(write(uniqEight(), 77, 'm-det-b').keyPath, PASS);
      expect(a.metricsSeed).toBe(b.metricsSeed);
      expect(a.entries).toEqual(b.entries);
      const c = unseal(
        writeBlind(uniqEight(), { outRoot: tmp, passphrase: PASS, stamp: 'm-rnd-a' }).keyPath,
        PASS,
      );
      const d = unseal(
        writeBlind(uniqEight(), { outRoot: tmp, passphrase: PASS, stamp: 'm-rnd-b' }).keyPath,
        PASS,
      );
      expect(c.metricsSeed).not.toBe(d.metricsSeed);
      expect(c.seed).not.toBe(d.seed);
    });

    it("through the key, each D-entry's M-row holds that draft's own tokens, cost and spend", () => {
      const drafts = uniqEight();
      const r = write(drafts, 9, 'm-trace');
      const key = unseal(r.keyPath, PASS);
      const m = readJson(r.metricsPath);
      for (const e of Object.values(key.entries)) {
        const src = drafts.find((d) => d.fixtureId === e.fixtureId) as AbDraft;
        const row = m[e.metricsId];
        expect(row.tokens).toEqual(src.metrics.tokens);
        expect(row.costUsd).toEqual(src.metrics.costUsd);
        expect(row.spend).toEqual(src.metrics.spend);
        expect(row.factDiffs).toBe(src.metrics.factDiffs);
      }
    });

    it('a row holds exactly tokens, costUsd, spend, factDiffs, legalReviewer', () => {
      const r = write(uniqEight(), 4, 'm-fields');
      for (const row of Object.values<Record<string, unknown>>(readJson(r.metricsPath)))
        expect(Object.keys(row).sort()).toEqual(
          ['costUsd', 'factDiffs', 'legalReviewer', 'spend', 'tokens'].sort(),
        );
    });

    it('metrics.json holds no placeholders, withheld, intake, model, run id, fixture id or D-id', () => {
      const drafts = uniqEight();
      drafts[2] = uniq(3, { outcome: { kind: 'withheld', code: 'fact_needed' } });
      drafts[3] = uniq(4, { outcome: { kind: 'failed', code: 'intake_http_500' } });
      const r = write(drafts, 12, 'm-clean');
      const raw = fs.readFileSync(r.metricsPath, 'utf8');
      expect(raw).not.toMatch(
        /placeholder|missingMarkers|toBeConfirmed|renderedMissing|withheld|intake|model|runId|fixtureId|fx-\d|run-id-|claude|opus|sonnet/i,
      );
      expect(raw).not.toMatch(/\bD\d{2}\b/);
      expect(raw).not.toMatch(/title|facts|Matter/);
    });

    it('the placeholders and withheld flag are only in the sealed key', () => {
      const drafts = uniqEight();
      drafts[0] = uniq(1, {
        outcome: { kind: 'withheld', code: 'fact_conflict' },
        metrics: metrics({
          placeholders: { missingMarkers: 5, toBeConfirmed: 3, renderedMissing: 2 },
          withheld: true,
        }),
      });
      const r = write(drafts, 21, 'm-keyonly');
      const key = unseal(r.keyPath, PASS);
      const e = Object.values(key.entries).find(
        (x) => x.fixtureId === 'fx-1',
      ) as KeyPayload['entries'][string];
      expect(e.placeholders).toEqual({ missingMarkers: 5, toBeConfirmed: 3, renderedMissing: 2 });
      expect(e.withheld).toBe(true);
      expect(Object.values(key.entries).filter((x) => x.withheld)).toHaveLength(1);
    });

    it('the D-M link exists nowhere outside KEY.sealed.json', () => {
      const r = write(uniqEight(), 15, 'm-linkless');
      // the clear key file shows none of its payload
      // The clear header is pinned; with the base64 fields (random bytes) removed, nothing else may name an id or a model.
      const sealedJson = JSON.parse(fs.readFileSync(r.keyPath, 'utf8'));
      expect(Object.keys(sealedJson).sort()).toEqual(
        ['N', 'alg', 'ct', 'iv', 'kdf', 'p', 'r', 'salt', 'tag', 'v'].sort(),
      );
      for (const k of ['salt', 'iv', 'tag', 'ct']) delete sealedJson[k];
      expect(JSON.stringify(sealedJson)).not.toMatch(
        /\b[DM]\d{2}\b|fixtureId|metricsId|claude|opus|sonnet|haiku/i,
      );
      // no scoring file names an M-id; metrics and intake-spend name no D-id
      for (const f of r.scoringFiles)
        expect(fs.readFileSync(f, 'utf8')).not.toMatch(/\bM\d{2}\b|metricsId/);
      expect(fs.readFileSync(r.metricsPath, 'utf8')).not.toMatch(/\bD\d{2}\b|metricsId/);
      expect(fs.readFileSync(r.intakePath, 'utf8')).not.toMatch(/\bD\d{2}\b|\bM\d{2}\b|metricsId/);
      // and the write result hands the caller no map either
      expect(JSON.stringify(r)).not.toMatch(/metricsId/);
      // the sealed key does hold it, for every draft
      const key = unseal(r.keyPath, PASS);
      for (const e of Object.values(key.entries)) expect(e.metricsId).toMatch(/^M\d{2}$/);
    });

    it('scoring/ holds only D*.md: no metrics, no intake spend, no key', () => {
      const r = write(uniqEight(), 15, 'm-scoring-only');
      for (const f of fs.readdirSync(r.scoringDir)) expect(f).toMatch(/^D\d{2}\.md$/);
      expect(fs.readdirSync(r.scoringDir)).toHaveLength(8);
      for (const f of r.scoringFiles) expect(path.dirname(f)).toBe(r.scoringDir);
      expect(path.dirname(r.metricsPath)).not.toBe(r.scoringDir);
      expect(path.dirname(r.intakePath)).not.toBe(r.scoringDir);
      expect(path.dirname(r.keyPath)).not.toBe(r.scoringDir);
    });

    it('metrics row count equals the scoring file count (withheld and failed drafts included)', () => {
      const drafts = [
        uniq(1),
        uniq(2, { outcome: { kind: 'withheld', code: 'fact_conflict' } }),
        uniq(3, { outcome: { kind: 'failed', code: 'intake_http_500' } }),
      ];
      const r = write(drafts, 3, 'm-count');
      expect(r.counts).toEqual({ drafts: 3, delivered: 1, withheld: 1, failed: 1 });
      expect(Object.keys(readJson(r.metricsPath))).toHaveLength(
        fs.readdirSync(r.scoringDir).length,
      );
      const texts = r.scoringFiles.map((f) => fs.readFileSync(f, 'utf8'));
      expect(texts.filter((t) => t.includes('WITHHELD by the gates'))).toHaveLength(1);
      expect(texts.filter((t) => t.includes('NOT PRODUCED'))).toHaveLength(1);
    });

    it('a draft without spend gets spend null; nothing is invented', () => {
      const r = write([draft(1)], 2, 'm-nospend');
      expect(readJson(r.metricsPath).M01.spend).toBeNull();
      expect(readJson(r.intakePath)).toEqual([
        { tokens: { input: 555, output: 666, cacheRead: 0, cacheCreation: 0 }, spend: null },
      ]);
    });

    describe('vikram/intake-spend.json', () => {
      /** Four matters, two arms each: the intake is shared, so the file has four entries. */
      function pairs(): AbDraft[] {
        return [1, 2, 3, 4, 5, 6, 7, 8].flatMap((i) =>
          [0, 1].map((arm) =>
            uniq(i, {
              fixtureId: `fx-${i}`,
              model: arm === 0 ? 'claude-sonnet-5-5' : 'claude-opus-5-5',
              runId: `run-${i}-${arm}`,
              metrics: metrics({
                tokens: {
                  input: 10_000 + i * 10 + arm,
                  output: 20_000 + i * 10 + arm,
                  cacheRead: 0,
                  cacheCreation: 0,
                },
                intakeTokens: { input: 500 + i, output: 600 + i, cacheRead: 0, cacheCreation: 0 },
                spend: { usd: i / 10 + arm, inr: (i / 10 + arm) * 88 },
                intakeSpend: { usd: i / 1000, inr: (i / 1000) * 88 },
              }),
            }),
          ),
        );
      }

      it('has one {tokens, spend} per matter and no id of any kind', () => {
        const r = write(pairs(), 5, 'ia-shape');
        const raw = fs.readFileSync(r.intakePath, 'utf8');
        const arr = JSON.parse(raw);
        expect(Array.isArray(arr)).toBe(true);
        expect(arr).toHaveLength(8); // 16 drafts, 8 matters
        for (const x of arr) expect(Object.keys(x).sort()).toEqual(['spend', 'tokens']);
        expect(raw).not.toMatch(/fx-|run-|\bD\d{2}\b|\bM\d{2}\b|fixtureId|model|claude/i);
      });

      it("its order is not the matters' order, nor the D-order, for any of 20 seeds", () => {
        for (let seed = 1; seed <= 20; seed++) {
          const r = write(pairs(), seed, `ia-order-${seed}`);
          const arr = JSON.parse(fs.readFileSync(r.intakePath, 'utf8')) as {
            spend: { usd: number };
          }[];
          const usds = arr.map((x) => x.spend.usd);
          const matterOrder = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => i / 1000);
          expect(usds).not.toEqual(matterOrder);
          const key = unseal(r.keyPath, PASS);
          const dOrder: number[] = [];
          for (const d of Object.keys(key.entries).sort()) {
            const u = key.intake[key.entries[d].fixtureId].spend?.usd as number;
            if (!dOrder.includes(u)) dOrder.push(u);
          }
          expect(usds).not.toEqual(dOrder);
          expect([...usds].sort((a, b) => a - b)).toEqual(matterOrder);
        }
      });

      it('agrees in total with the intake held in the sealed key', () => {
        const r = write(pairs(), 8, 'ia-total');
        const arr = JSON.parse(fs.readFileSync(r.intakePath, 'utf8')) as {
          tokens: { input: number; output: number };
          spend: { usd: number; inr: number };
        }[];
        const key = unseal(r.keyPath, PASS);
        const fromKey = Object.values(key.intake);
        expect(Object.keys(key.intake).sort()).toEqual(
          [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `fx-${i}`),
        );
        const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
        expect(sum(arr.map((x) => x.spend.usd))).toBeCloseTo(
          sum(fromKey.map((x) => x.spend?.usd ?? 0)),
          12,
        );
        expect(sum(arr.map((x) => x.tokens.input))).toBe(sum(fromKey.map((x) => x.tokens.input)));
      });

      it('the metrics rows of a matter carry nothing both share (no intake): pairs do not join', () => {
        const r = write(pairs(), 8, 'ia-nojoin');
        const m = readJson(r.metricsPath) as Record<string, Record<string, unknown>>;
        expect(Object.keys(m)).toHaveLength(16);
        for (const row of Object.values(m)) {
          expect(row).not.toHaveProperty('intakeSpend');
          expect(row).not.toHaveProperty('intakeTokens');
        }
        // no value is shared between two rows (every draft's tokens and spend are its own)
        const spends = Object.values(m).map((x) => JSON.stringify(x.spend));
        expect(new Set(spends).size).toBe(16);
      });
    });
  });

  it('a model word in a draft body is counted as a warning and left as delivered', () => {
    const body = 'This body mentions Claude by name.';
    const r = write([draft(1, { outcome: { kind: 'delivered', text: body } })], 1, 'bodyword');
    expect(r.warnings.modelWordInBody).toBe(1);
    expect(fs.readFileSync(r.scoringFiles[0], 'utf8')).toContain(body);
  });

  it('KEY.sealed.json is mode 0600, also when it already existed with a wider mode', () => {
    const r = write(eight(), 1, 'mode');
    expect(fs.statSync(r.keyPath).mode & 0o777).toBe(0o600);
    fs.chmodSync(r.keyPath, 0o644);
    const r2 = write(eight(), 1, 'mode'); // same folder, key file overwritten
    expect(r2.keyPath).toBe(r.keyPath);
    expect(fs.statSync(r2.keyPath).mode & 0o777).toBe(0o600);
  });

  it('the sealed key opens only with the passphrase and holds the arm mapping', () => {
    const drafts = eight();
    const r = write(drafts, 11, 'key');
    expect(() => unseal(r.keyPath, WRONG)).toThrow();
    const key = unseal(r.keyPath, PASS);
    for (const e of Object.values(key.entries)) {
      const src = drafts.find((d) => d.fixtureId === e.fixtureId);
      expect(e.model).toBe(src?.model);
      expect(e.runId).toBe(src?.runId);
    }
    // the clear file text does not contain the model
    expect(fs.readFileSync(r.keyPath, 'utf8')).not.toMatch(/claude|opus|sonnet|run-id/i);
  });
});
