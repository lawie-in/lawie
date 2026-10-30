import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  AbDraft,
  AbMetrics,
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
  const payload = {
    version: 1 as const,
    seed: 9,
    entries: { D01: { fixtureId: 'a', model: 'm', runId: null } },
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

  it('writes D01..D08, metrics.json and KEY.sealed.json', () => {
    const r = write(eight(), 123, 'layout');
    expect(fs.readdirSync(r.scoringDir).sort()).toEqual(
      Array.from({ length: 8 }, (_, i) => `D0${i + 1}.md`),
    );
    expect(fs.existsSync(r.metricsPath)).toBe(true);
    expect(fs.existsSync(r.keyPath)).toBe(true);
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
      const src = drafts.find((d) => d.fixtureId === expected[k])!;
      expect(text).toContain(src.title);
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

  it('metrics are keyed by the same blind ids as the scoring files and the key', () => {
    const r = write(eight(), 31, 'metrics');
    const m = JSON.parse(fs.readFileSync(r.metricsPath, 'utf8'));
    const files = fs
      .readdirSync(r.scoringDir)
      .map((f) => f.replace('.md', ''))
      .sort();
    expect(Object.keys(m).sort()).toEqual(files);
    expect(Object.keys(unseal(r.keyPath, PASS).entries).sort()).toEqual(files);
    for (const id of files) expect(m[id].legalReviewer).toBe('n/a');
    // the metrics file itself carries no fixture id, model or run id
    const raw = fs.readFileSync(r.metricsPath, 'utf8');
    expect(raw).not.toMatch(/fx-\d|run-id-|claude/i);
  });

  it('withheld and failed drafts are counted, rendered, and flagged in metrics', () => {
    const drafts = [
      draft(1),
      draft(2, { outcome: { kind: 'withheld', code: 'fact_conflict' } }),
      draft(3, { outcome: { kind: 'failed', code: 'intake_http_500' } }),
    ];
    const r = write(drafts, 3, 'mixed');
    expect(r.counts).toEqual({ drafts: 3, delivered: 1, withheld: 1, failed: 1 });
    const texts = r.scoringFiles.map((f) => fs.readFileSync(f, 'utf8'));
    expect(texts.filter((t) => t.includes('WITHHELD by the gates'))).toHaveLength(1);
    expect(texts.filter((t) => t.includes('NOT PRODUCED'))).toHaveLength(1);
    const m = JSON.parse(fs.readFileSync(r.metricsPath, 'utf8'));
    expect(Object.values<{ withheld: boolean }>(m).filter((x) => x.withheld)).toHaveLength(1);
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
      const src = drafts.find((d) => d.fixtureId === e.fixtureId)!;
      expect(e.model).toBe(src.model);
      expect(e.runId).toBe(src.runId);
    }
    // the clear file text does not contain the model
    expect(fs.readFileSync(r.keyPath, 'utf8')).not.toMatch(/claude|opus|sonnet|run-id/i);
  });
});
