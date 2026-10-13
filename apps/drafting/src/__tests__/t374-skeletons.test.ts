/**
 * T-374 (ADR-025 D1, lead B): the signed clause-skeleton loader, its validation, the byte
 * identity with Ajay's signed files, and the SLOT_ALIASES lookup.
 *
 * FIELD_ALIASES / applyFieldAliases are covered by field-aliases.test.ts, not here.
 */
import { createHash } from 'crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { loadAvermentLists } from '../services/averments';
import {
  RulePackError,
  SKELETON_VALUE_LIST_KEY,
  SLOT_ALIASES,
  clearRulePackCache,
  clearSkeletonCache,
  loadRulePack,
  loadSkeleton,
  resolveSlot,
  skeletonEqualsRefs,
  validateSkeleton,
} from '../services/rule-pack.service';

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const REPO = join(__dirname, '..', '..', '..', '..');
const SKELETON_DIR = join(
  REPO,
  'apps',
  'drafting',
  'src',
  'config',
  'document-rules',
  '_skeletons',
);
const LEGAL = join(REPO, 'handoff', 'legal');

const PACKS = ['bail_regular', 'bail_anticipatory', 'bail_before_magistrate', 'default_bail'];

/** SHA-256 of each signed md FILE, pinned (computed 13 Oct 2026), and of the json block + "\n". */
const SIGNED: Record<string, { version: number; mdSha: string; blockSha: string }> = {
  bail_regular: {
    version: 3,
    mdSha: '74c0aa4dc5dc5fe5a465cbbd163316923e71bc851f15488db7b607ea4a18c6bb',
    blockSha: '4eec8dfb4ea8f7fac728675df30c032e8f8555b75cdfeaf1f59b5f7acc7c843b',
  },
  bail_anticipatory: {
    version: 4,
    mdSha: '5639ce4ad42c05e18d9a467038076f12d201a4de3e8880a7a79f1222c0d14913',
    blockSha: 'bd20c4a0cae5347b49a7999dd9bafd93cfd0baeccefd271635103bc1759bf858',
  },
  bail_before_magistrate: {
    version: 5,
    mdSha: '3ef120ed16a7fd68791d3ba964c4e69e5b74421878204968e4fddf52c87827a0',
    blockSha: 'c52210817dd3a14e6c7f663dc678944334245cc6b4359a1f0eac719bfeba81cd',
  },
  default_bail: {
    version: 1,
    mdSha: '0b69bb754066e4898a94396cede4ff02c910687618e6a1f904b1c506c584fabb',
    blockSha: '1f0384f6c8f2feffa289622b63c9bb8c1b9c698cb5744c9159fc079032349720',
  },
};

const sha = (b: string | Buffer): string => createHash('sha256').update(b).digest('hex');

function signedMd(id: string): string {
  return readFileSync(join(LEGAL, `skeleton-${id}-signed.md`), 'utf8').replace(/\r\n/g, '\n');
}
function fencedJson(id: string): string {
  const m = /```json\n([\s\S]*?)\n```/.exec(signedMd(id));
  if (!m) throw new Error(`skeleton-${id}-signed.md has no json block`);
  return m[1];
}
const fileJson = (id: string): Obj =>
  JSON.parse(readFileSync(join(SKELETON_DIR, `${id}.json`), 'utf8'));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function packFor(id: string) {
  const p = loadRulePack(id);
  if (p === null) throw new Error(`no pack ${id}`);
  return p;
}
function clauseOf(s: Obj, id: string): Obj {
  const c = s.clauses.find((x: Obj) => x.id === id);
  if (!c) throw new Error(`no clause ${id}`);
  return c;
}
/** Errors from validating a mutated copy of a real signed skeleton against its real pack. */
function errorsAfter(id: string, mutate: (s: Obj) => void): string[] {
  const s = clone(fileJson(id));
  mutate(s);
  return validateSkeleton(s, packFor(id), id);
}
function deepFrozen(v: unknown): boolean {
  if (v === null || typeof v !== 'object') return true;
  if (!Object.isFrozen(v)) return false;
  return Object.values(v as Obj).every(deepFrozen);
}

beforeEach(() => {
  clearRulePackCache();
  clearSkeletonCache();
});

// ── AC1: loadSkeleton ───────────────────────────────────────────────────────

describe('loadSkeleton (AC1)', () => {
  it.each(PACKS)('%s loads as a deep-frozen object', (id) => {
    const s = loadSkeleton(id);
    expect(s).not.toBeNull();
    expect(s!.pack).toBe(id);
    expect(s!.version).toBe(SIGNED[id].version);
    expect(deepFrozen(s)).toBe(true);
    expect(() => {
      (s as Obj).version = 99;
    }).toThrow();
    expect(() => {
      (s as Obj).clauses[0].text = 'changed';
    }).toThrow();
    expect(() => {
      (s as Obj).clauses.push({});
    }).toThrow();
  });

  it('bail_regular loads cleanly (lead A depends on it)', () => {
    expect(() => loadSkeleton('bail_regular')).not.toThrow();
    expect(loadSkeleton('bail_regular')!.clauses.length).toBeGreaterThan(0);
  });

  it('a pack with no skeleton returns null', () => {
    expect(loadSkeleton('nda')).toBeNull();
  });

  it.each(['../x', 'BAIL', '', 'a/b', '..', 'bail regular', '_skeletons/bail_regular'])(
    'a bad id %p returns null',
    (id) => {
      expect(loadSkeleton(id)).toBeNull();
    },
  );

  it('a non-string id returns null', () => {
    expect(loadSkeleton(undefined as unknown as string)).toBeNull();
    expect(loadSkeleton(42 as unknown as string)).toBeNull();
  });

  describe('files that exist but are wrong', () => {
    let tmp: string;
    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 't374-'));
    });
    afterEach(() => rmSync(tmp, { recursive: true, force: true }));

    it('invalid JSON throws RulePackError and the message holds no file text', () => {
      const secret = 'The applicant undertakes to furnish bail bonds and sureties';
      writeFileSync(
        join(tmp, 'bail_regular.json'),
        `{"pack": "bail_regular", "text": "${secret}" oops`,
      );
      let err: unknown;
      try {
        loadSkeleton('bail_regular', tmp);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(RulePackError);
      expect((err as Error).message).not.toContain(secret);
      expect((err as Error).message).not.toContain('oops');
    });

    it('an unreadable file throws RulePackError', () => {
      mkdirSync(join(tmp, 'bail_regular.json')); // reading a directory: EISDIR, not ENOENT
      expect(() => loadSkeleton('bail_regular', tmp)).toThrow(RulePackError);
    });

    it('a skeleton that fails validation throws RulePackError', () => {
      const s = fileJson('bail_regular');
      s.clauses[1].id = s.clauses[0].id;
      writeFileSync(join(tmp, 'bail_regular.json'), JSON.stringify(s));
      expect(() => loadSkeleton('bail_regular', tmp)).toThrow(RulePackError);
      expect(() => loadSkeleton('bail_regular', tmp)).toThrow(/more than once/);
    });

    it('a pack field of the wrong name in the file throws', () => {
      const s = fileJson('bail_regular');
      s.pack = 'default_bail';
      writeFileSync(join(tmp, 'bail_regular.json'), JSON.stringify(s));
      expect(() => loadSkeleton('bail_regular', tmp)).toThrow(RulePackError);
    });

    it('a file for a pack that does not exist throws (no rule pack)', () => {
      writeFileSync(join(tmp, 'zz_nopack.json'), JSON.stringify(fileJson('bail_regular')));
      expect(() => loadSkeleton('zz_nopack', tmp)).toThrow(RulePackError);
    });

    it('a failure is not cached: the next call with a good dir succeeds', () => {
      writeFileSync(join(tmp, 'bail_regular.json'), '{');
      expect(() => loadSkeleton('bail_regular', tmp)).toThrow(RulePackError);
      expect(loadSkeleton('bail_regular')).not.toBeNull();
    });
  });

  describe('cache', () => {
    it('returns the same object until clearSkeletonCache', () => {
      const a = loadSkeleton('default_bail');
      expect(loadSkeleton('default_bail')).toBe(a);
      clearSkeletonCache();
      const b = loadSkeleton('default_bail');
      expect(b).not.toBe(a);
      expect(b).toEqual(a);
    });

    it('clearRulePackCache clears the skeleton cache too', () => {
      const a = loadSkeleton('bail_anticipatory');
      expect(loadSkeleton('bail_anticipatory')).toBe(a);
      clearRulePackCache();
      expect(loadSkeleton('bail_anticipatory')).not.toBe(a);
    });
  });
});

// ── AC2: validateSkeleton, one negative per rule ────────────────────────────

describe('validateSkeleton (AC2)', () => {
  it.each(PACKS)('%s: the signed file has no errors', (id) => {
    expect(validateSkeleton(fileJson(id), packFor(id), id)).toEqual([]);
  });

  it('not an object', () => {
    expect(validateSkeleton([], null)).toEqual(['the skeleton is not a JSON object']);
    expect(validateSkeleton('x', null)).toHaveLength(1);
    expect(validateSkeleton(null, null)).toHaveLength(1);
  });

  it('duplicate clause id', () => {
    const e = errorsAfter('bail_regular', (s) => {
      s.clauses[1].id = s.clauses[0].id;
    });
    expect(e.join('\n')).toMatch(/clause 'opening': id is used more than once/);
  });

  it('duplicate order', () => {
    const e = errorsAfter('bail_regular', (s) => {
      s.clauses[1].order = s.clauses[0].order;
    });
    expect(e.join('\n')).toMatch(/order 10 is also used by clause 'opening'/);
  });

  it('bad source', () => {
    const e = errorsAfter('bail_regular', (s) => {
      s.clauses[0].source = 'model';
    });
    expect(e.join('\n')).toMatch(/clause 'opening': source is not 'fixed' or 'advocate'/);
  });

  it('a slot used in the text but not listed', () => {
    const e = errorsAfter('bail_regular', (s) => {
      s.clauses[0].text += ' {zz_unlisted}';
    });
    expect(e.join('\n')).toMatch(/placeholder 'zz_unlisted' is not listed in slots/);
  });

  it('a slot listed but not used in the text', () => {
    const e = errorsAfter('bail_regular', (s) => {
      s.clauses[0].slots.push('zz_unused');
    });
    expect(e.join('\n')).toMatch(/slot 'zz_unused' does not appear in the text/);
  });

  it('an advocate clause with text', () => {
    const e = errorsAfter('bail_regular', (s) => {
      clauseOf(s, 'facts').text = 'Signed-looking sentence about the facts.';
    });
    expect(e.join('\n')).toMatch(/clause 'facts': advocate clause has text/);
  });

  it('an advocate clause with no slot', () => {
    const e = errorsAfter('bail_regular', (s) => {
      delete clauseOf(s, 'facts').slot;
    });
    expect(e.join('\n')).toMatch(/clause 'facts': advocate clause has no slot/);
  });

  it('a dangling use_clause', () => {
    const e = errorsAfter('bail_regular', (s) => {
      const g = clauseOf(s, 'grounds');
      g.items.cooperation = { use_clause: 'no_such_clause' };
    });
    expect(e.join('\n')).toMatch(/item 'cooperation': use_clause names no clause of this skeleton/);
  });

  it('a dangling skip_if_rendered (Magistrate v2 shape)', () => {
    const e = errorsAfter('bail_before_magistrate', (s) => {
      clauseOf(s, 'medical').skip_if_rendered = 'grounds.medical_grounds';
    });
    // grounds is an advocate clause in the Magistrate pack: it has no items to name.
    expect(e.join('\n')).toMatch(
      /clause 'medical': skip_if_rendered names no item of clause 'grounds'/,
    );
    const e2 = errorsAfter('bail_before_magistrate', (s) => {
      clauseOf(s, 'medical').skip_if_rendered = 'no_such_clause';
    });
    expect(e2.join('\n')).toMatch(/skip_if_rendered names no clause of this skeleton/);
  });

  it('skip_if_rendered naming its own clause', () => {
    const e = errorsAfter('bail_regular', (s) => {
      clauseOf(s, 'medical').skip_if_rendered = 'medical';
    });
    expect(e.join('\n')).toMatch(/skip_if_rendered names its own clause/);
  });

  it('an unknown field, at the top, in a clause and in an item', () => {
    expect(errorsAfter('bail_regular', (s) => (s.extra = 1)).join('\n')).toMatch(
      /skeleton: unknown field 'extra'/,
    );
    expect(errorsAfter('bail_regular', (s) => (s.clauses[0].extra = 1)).join('\n')).toMatch(
      /clause 'opening': unknown field 'extra'/,
    );
    expect(
      errorsAfter('bail_regular', (s) => (clauseOf(s, 'grounds').items.cooperation.extra = 1)).join(
        '\n',
      ),
    ).toMatch(/item 'cooperation': unknown field 'extra'/);
  });

  it('mandatoryClauses is not a field of the signed JSON', () => {
    const msg = errorsAfter('bail_regular', (s) => (s.mandatoryClauses = ['grounds'])).join('\n');
    // The key is not a lower-case id, so the message names no raw value.
    expect(msg).toContain('skeleton: unknown field an invalid id');
    expect(msg).not.toContain('mandatoryClauses');
  });

  describe('item ids must equal the pack option ids (anticipatory v1 shape)', () => {
    it('an item that is not an option', () => {
      const e = errorsAfter('bail_anticipatory', (s) => {
        clauseOf(s, 'grounds').items.zz_parallel = { text: 'x' };
      });
      expect(e.join('\n')).toMatch(/item 'zz_parallel' is not an option id of 'grounds_for_bail'/);
    });
    it('an option with no item', () => {
      const optionIds = packFor('bail_anticipatory').facts.find(
        (f) => f.name === 'grounds_for_bail' || f.key === 'grounds_for_bail',
      )!.option_ids!;
      expect(optionIds.length).toBeGreaterThan(0);
      const gone = optionIds[0];
      const e = errorsAfter('bail_anticipatory', (s) => {
        delete clauseOf(s, 'grounds').items[gone];
      });
      expect(e.join('\n')).toContain(`option id '${gone}' of 'grounds_for_bail' has no item`);
    });
    it('the signed anticipatory items equal the pack options exactly', () => {
      const optionIds = packFor('bail_anticipatory').facts.find(
        (f) => f.name === 'grounds_for_bail' || f.key === 'grounds_for_bail',
      )!.option_ids!;
      expect(Object.keys(clauseOf(fileJson('bail_anticipatory'), 'grounds').items).sort()).toEqual(
        [...optionIds].sort(),
      );
    });
    it('from names no field of the pack', () => {
      const e = errorsAfter('bail_regular', (s) => {
        clauseOf(s, 'grounds').from = 'zz_nofield';
      });
      expect(e.join('\n')).toMatch(/from 'zz_nofield' is not a field of pack 'bail_regular'/);
    });
    it('from names a field with no options', () => {
      const e = errorsAfter('bail_regular', (s) => {
        clauseOf(s, 'grounds').from = 'father_name';
      });
      expect(e.join('\n')).toMatch(/from 'father_name' has no options/);
    });
    it('items without from', () => {
      const e = errorsAfter('bail_regular', (s) => {
        delete clauseOf(s, 'grounds').from;
      });
      expect(e.join('\n')).toMatch(/items need from/);
    });
    it('Magistrate grounds is an advocate list with no fixed options', () => {
      const g = clauseOf(fileJson('bail_before_magistrate'), 'grounds');
      expect(g.source).toBe('advocate');
      expect(g.list).toBe(true);
      expect(g.items).toBeUndefined();
      expect(g.from).toBeUndefined();
    });
  });

  describe('value lists', () => {
    it('in naming a top-level list the skeleton lacks', () => {
      const e = errorsAfter('bail_regular', (s) => {
        delete s.antecedents_none_values;
      });
      expect(e.join('\n')).toMatch(
        /a condition names 'antecedents_none_values' but the skeleton has no top-level 'antecedents_none_values'/,
      );
    });
    it('none_values missing while a condition names it', () => {
      const e = errorsAfter('default_bail', (s) => {
        delete s.none_values;
      });
      expect(e.join('\n')).toMatch(/a condition names 'none_values' but the skeleton has no/);
    });
    it('a bad value-list key name in a condition', () => {
      const e = errorsAfter('default_bail', (s) => {
        clauseOf(s, 'earlier_applications').variants[0].when.in = 'first_values';
      });
      expect(e.join('\n')).toMatch(/names neither a top-level value list nor '<entry>.equals'/);
    });
    it('a bad value-list key name at the top level is an unknown field', () => {
      // A key is quoted in the message only when it matches ^[a-z0-9_]+$.
      const cases: Array<[string, string]> = [
        ['None_values', 'unknown field an invalid id'],
        ['antecedents-none_values', 'unknown field an invalid id'],
        ['antecedents_values', "unknown field 'antecedents_values'"],
        ['none_value', "unknown field 'none_value'"],
      ];
      for (const [k, expected] of cases) {
        const e = errorsAfter('default_bail', (s) => (s[k] = ['x']));
        expect(e.join('\n')).toContain(expected);
        if (expected.endsWith('an invalid id')) expect(e.join('\n')).not.toContain(k);
      }
    });
    it('<entry>.equals is a valid reference', () => {
      const e = errorsAfter('default_bail', (s) => {
        clauseOf(s, 'earlier_applications').variants[0].when.in = 'first_bail_application.equals';
      });
      expect(e).toEqual([]);
    });
    it('an empty antecedents_none_values', () => {
      const e = errorsAfter('bail_regular', (s) => {
        s.antecedents_none_values = [];
      });
      expect(e.join('\n')).toMatch(/antecedents_none_values is not a non-empty array of strings/);
    });
    it('antecedents_none_values with a blank entry or a repeat', () => {
      expect(
        errorsAfter('bail_regular', (s) => (s.antecedents_none_values = ['a', ' '])).join('\n'),
      ).toMatch(/antecedents_none_values\[1\] is not a non-empty string/);
      expect(
        errorsAfter('bail_regular', (s) => (s.antecedents_none_values = ['a', 'a'])).join('\n'),
      ).toMatch(/antecedents_none_values\[1\] repeats an earlier entry/);
    });
    it('antecedents_none_values as a string (even a reference) is rejected', () => {
      for (const v of ['first_bail_application.equals', 'nil']) {
        const e = errorsAfter('bail_regular', (s) => (s.antecedents_none_values = v));
        expect(e.join('\n')).toMatch(/antecedents_none_values is not a non-empty array of strings/);
      }
    });
    it('another <name>_none_values key must be an array of strings, never a string or number', () => {
      expect(errorsAfter('default_bail', (s) => (s.roots_none_values = ['nil']))).toEqual([]);
      for (const v of ['x.equals', 'nil', 5, {}, null]) {
        const e = errorsAfter('default_bail', (s) => (s.roots_none_values = v));
        expect(e.join('\n')).toContain('roots_none_values is not a non-empty array of strings');
      }
    });
    it('none_values must be a reference string', () => {
      expect(errorsAfter('default_bail', (s) => (s.none_values = ['x'])).join('\n')).toMatch(
        /none_values is not a non-empty string/,
      );
    });
    it('SKELETON_VALUE_LIST_KEY accepts and rejects the right names', () => {
      for (const k of ['none_values', 'antecedents_none_values', 'a_b_none_values']) {
        expect(SKELETON_VALUE_LIST_KEY.test(k)).toBe(true);
      }
      for (const k of [
        '',
        'values',
        'x_none_value',
        'X_none_values',
        'a-none_values',
        '_none_values',
        'none_values_x',
      ]) {
        expect(SKELETON_VALUE_LIST_KEY.test(k)).toBe(false);
      }
    });
  });

  describe('other rules', () => {
    it('pack does not match the file id', () => {
      expect(errorsAfter('bail_regular', (s) => (s.pack = 'default_bail')).join('\n')).toMatch(
        /pack is 'default_bail' but the file is 'bail_regular.json'/,
      );
    });
    it('version must be a positive integer', () => {
      for (const v of [0, 1.5, '2', undefined]) {
        expect(errorsAfter('bail_regular', (s) => (s.version = v)).join('\n')).toMatch(
          /version is not a positive integer/,
        );
      }
    });
    it('empty clauses', () => {
      expect(errorsAfter('bail_regular', (s) => (s.clauses = [])).join('\n')).toMatch(
        /clauses is not a non-empty array/,
      );
    });
    it('has both text and variants', () => {
      const e = errorsAfter('default_bail', (s) => {
        clauseOf(s, 'non_filing').text = 'x';
      });
      expect(e.join('\n')).toMatch(/clause 'non_filing': has both text and variants/);
    });
    it('a condition with two tests, and an all_of with nothing', () => {
      expect(
        errorsAfter('default_bail', (s) => {
          clauseOf(s, 'non_filing').variants[0].when.present = true;
        }).join('\n'),
      ).toMatch(/needs exactly one of in, not_in, present/);
      expect(
        errorsAfter('default_bail', (s) => {
          clauseOf(s, 'indefeasible_right').when = { all_of: [] };
        }).join('\n'),
      ).toMatch(/all_of is not a non-empty array/);
    });
    it('render_if_any_slot must be one of the clause slots', () => {
      const e = errorsAfter('bail_regular', (s) => {
        s.clauses[0].render_if_any_slot = 'zz_other';
      });
      expect(e.join('\n')).toMatch(/render_if_any_slot is not one of the clause's slots/);
    });
    it('a fixed clause with a slot field', () => {
      const e = errorsAfter('bail_regular', (s) => {
        s.clauses[0].slot = 'applicant_name';
      });
      expect(e.join('\n')).toMatch(/slot is only for advocate clauses/);
    });
    it('a derived slot that no text uses', () => {
      const e = errorsAfter('bail_regular', (s) => {
        s.clauses[0].derived = { zz_d: { from: 'applicant_name', map: { a: 'b' } } };
      });
      expect(e.join('\n')).toMatch(/derived slot 'zz_d' does not appear in any text/);
    });
  });

  describe('messages hold ids only, never signed wording', () => {
    it('no signed sentence appears in any error message', () => {
      const bad = clone(fileJson('bail_regular'));
      // Break many things in clauses whose signed text would be easy to leak.
      bad.clauses[1].id = bad.clauses[0].id;
      bad.clauses[0].text += ' {zz_unlisted}';
      bad.clauses[0].slots.push('zz_unused');
      bad.clauses[0].extra = 1;
      bad.clauses[0].source = 'model';
      const signedSentences: string[] = [];
      for (const id of PACKS) {
        const walk = (v: unknown): void => {
          if (typeof v === 'string' && v.length > 40 && /\s/.test(v)) signedSentences.push(v);
          else if (v !== null && typeof v === 'object') Object.values(v).forEach(walk);
        };
        walk(fileJson(id));
      }
      expect(signedSentences.length).toBeGreaterThan(20);
      const errors = validateSkeleton(bad, packFor('bail_regular'), 'bail_regular');
      expect(errors.length).toBeGreaterThanOrEqual(5);
      const all = errors.join('\n');
      for (const s of signedSentences) expect(all).not.toContain(s);
      // The opening clause's own signed sentence in particular.
      expect(all).not.toContain(clauseOf(fileJson('bail_regular'), 'opening').text.slice(0, 30));
    });

    it('a loadSkeleton failure message also holds no signed sentence', () => {
      const tmp = mkdtempSync(join(tmpdir(), 't374-'));
      try {
        const s = fileJson('bail_regular');
        s.clauses[0].source = 'model';
        s.clauses[1].id = s.clauses[0].id;
        writeFileSync(join(tmp, 'bail_regular.json'), JSON.stringify(s));
        let msg = '';
        try {
          loadSkeleton('bail_regular', tmp);
        } catch (e) {
          msg = (e as Error).message;
        }
        expect(msg).not.toBe('');
        expect(msg).not.toContain(fileJson('bail_regular').clauses[0].text.slice(0, 30));
        expect(msg).not.toContain(fileJson('bail_regular').clauses[1].text.slice(0, 30));
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});

// ── AC3 / AC4: identity with Ajay's signed files ────────────────────────────

describe('signed identity (AC3, AC4)', () => {
  it.each(PACKS)('%s: the signed md file hash is pinned', (id) => {
    const raw = readFileSync(join(LEGAL, `skeleton-${id}-signed.md`));
    expect(sha(raw)).toBe(SIGNED[id].mdSha);
  });

  it.each(PACKS)('%s: _skeletons json is the signed fenced block, byte for byte', (id) => {
    const bytes = readFileSync(join(SKELETON_DIR, `${id}.json`));
    expect(sha(bytes)).toBe(SIGNED[id].blockSha);
    expect(bytes.toString('utf8')).toBe(`${fencedJson(id)}\n`);
  });

  it.each(PACKS)('%s: the parsed fenced block deep-equals the parsed file', (id) => {
    expect(JSON.parse(fencedJson(id))).toEqual(fileJson(id));
  });

  it.each(PACKS)('%s: what loadSkeleton returns deep-equals the signed block', (id) => {
    expect(loadSkeleton(id)).toEqual(JSON.parse(fencedJson(id)));
  });

  it.each(PACKS)('%s: the signed version is pinned', (id) => {
    expect(JSON.parse(fencedJson(id)).version).toBe(SIGNED[id].version);
    expect(JSON.parse(fencedJson(id)).pack).toBe(id);
  });

  it('exactly the four skeleton files exist', () => {
    const names = readdirSync(SKELETON_DIR).sort();
    expect(names).toEqual(PACKS.map((p) => `${p}.json`).sort());
  });
});

// ── AC5: SLOT_ALIASES / resolveSlot ─────────────────────────────────────────

describe('SLOT_ALIASES and resolveSlot (AC5)', () => {
  it('has exactly the three pairs and is frozen', () => {
    expect(SLOT_ALIASES).toEqual({
      father_name: 'applicant_parentage',
      address: 'applicant_address',
      sections_charged: 'offences_alleged',
    });
    expect(Object.isFrozen(SLOT_ALIASES)).toBe(true);
  });

  function slotsOf(id: string): string[] {
    const out = new Set<string>();
    const s = fileJson(id);
    const visit = (c: Obj): void => {
      (c.slots ?? []).forEach((x: string) => out.add(x));
      if (c.slot) out.add(c.slot);
      Object.keys(c.derived ?? {}).forEach((x) => out.add(x));
      (c.variants ?? []).forEach(visit);
      Object.values<Obj>(c.items ?? {}).forEach(visit);
    };
    s.clauses.forEach(visit);
    return [...out];
  }

  it.each(PACKS)('%s: every slot of the skeleton resolves to itself', (id) => {
    const slots = slotsOf(id);
    expect(slots.length).toBeGreaterThan(5);
    for (const slot of slots) expect(resolveSlot(id, slot)).toBe(slot);
  });

  it('resolveSlot(default_bail, address) is applicant_address', () => {
    expect(resolveSlot('default_bail', 'address')).toBe('applicant_address');
  });

  it('resolves in both directions, against the pack own keys', () => {
    expect(resolveSlot('default_bail', 'father_name')).toBe('applicant_parentage');
    expect(resolveSlot('default_bail', 'sections_charged')).toBe('offences_alleged');
    expect(resolveSlot('bail_before_magistrate', 'address')).toBe('applicant_address');
    expect(resolveSlot('bail_before_magistrate', 'father_name')).toBe('applicant_parentage');
    expect(resolveSlot('bail_before_magistrate', 'sections_charged')).toBe('offences_alleged');
    expect(resolveSlot('bail_regular', 'applicant_address')).toBe('address');
    expect(resolveSlot('bail_regular', 'applicant_parentage')).toBe('father_name');
    expect(resolveSlot('bail_regular', 'offences_alleged')).toBe('sections_charged');
    expect(resolveSlot('bail_anticipatory', 'applicant_address')).toBe('address');
  });

  it('a slot the pack does not have stays as written', () => {
    expect(resolveSlot('default_bail', 'facts_narrative')).toBe('facts_narrative');
    expect(resolveSlot('bail_regular', 'zz_nothing')).toBe('zz_nothing');
  });

  it('an unknown pack returns the slot unchanged', () => {
    expect(resolveSlot('zz_nopack', 'address')).toBe('address');
  });

  it.each(['default_bail', 'bail_before_magistrate'])(
    '%s: resolving a draft adds no father_name, address or sections_charged key',
    (id) => {
      const pack = packFor(id);
      const data: Obj = {};
      for (const f of pack.facts) data[f.key ?? f.name] = 'v';
      const before = clone(data);
      const frozen = Object.freeze(data);
      const aliasBefore = clone(SLOT_ALIASES);

      const probes = [...slotsOf(id), 'father_name', 'address', 'sections_charged'];
      for (const slot of probes) {
        const key = resolveSlot(id, slot);
        void frozen[key]; // a read
      }
      expect(frozen).toEqual(before);
      expect(Object.keys(frozen).sort()).toEqual(Object.keys(before).sort());
      for (const k of ['father_name', 'address', 'sections_charged']) {
        expect(Object.prototype.hasOwnProperty.call(frozen, k)).toBe(false);
      }
      expect(SLOT_ALIASES).toEqual(aliasBefore);
    },
  );

  it('resolving does not change the pack or the cached skeleton', () => {
    const skel = loadSkeleton('default_bail');
    const snapshot = clone(skel);
    resolveSlot('default_bail', 'address');
    resolveSlot('default_bail', 'father_name');
    expect(loadSkeleton('default_bail')).toBe(skel);
    expect(skel).toEqual(snapshot);
  });
});

// ── AC6: bail_regular for Lead A ────────────────────────────────────────────

describe('bail_regular clause ids and order match the signed file (AC6)', () => {
  const EXPECTED: Array<[string, number]> = [
    ['opening', 10],
    ['fir_details', 20],
    ['custody_status', 30],
    ['arrested_on', 31],
    ['facts', 40],
    ['chargesheet_filed', 50],
    ['antecedents', 60],
    ['earlier_applications', 65],
    ['grounds', 70],
    ['further_grounds', 75],
    ['false_implication_reason', 76],
    ['not_named_in_fir', 80],
    ['no_recovery', 81],
    ['recovery_stated', 82],
    ['cooperated', 83],
    ['s35_notice', 84],
    ['parity', 85],
    ['occupation', 86],
    ['sole_breadwinner', 87],
    ['dependants', 88],
    ['roots', 89],
    ['medical', 90],
    ['no_flight_risk', 95],
  ];

  it('the loaded clauses match the signed block, id by id and in order', () => {
    const signed = JSON.parse(fencedJson('bail_regular')).clauses as Obj[];
    const loaded = loadSkeleton('bail_regular')!.clauses;
    expect(loaded.map((c) => [c.id, c.order])).toEqual(signed.map((c) => [c.id, c.order]));
  });

  it('the signed ids and orders are pinned', () => {
    expect(loadSkeleton('bail_regular')!.clauses.map((c) => [c.id, c.order])).toEqual(EXPECTED);
  });

  it('the clauses are in ascending order', () => {
    const orders = loadSkeleton('bail_regular')!.clauses.map((c) => c.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});

// ── Round 2: <entry>.equals resolution, none_values, cache, load order ──────

const AVERMENTS_DIR_REAL = join(
  REPO,
  'apps',
  'drafting',
  'src',
  'config',
  'document-rules',
  '_averments',
);
const RULE_PACKS_DIR_REAL = join(REPO, 'apps', 'drafting', 'src', 'config', 'document-rules');

/** All the signed sentences of the four skeletons, for "no signed text in a message" checks. */
function allSignedSentences(): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string' && v.length > 40 && /\s/.test(v)) out.push(v);
    else if (v !== null && typeof v === 'object') Object.values(v).forEach(walk);
  };
  PACKS.forEach((id) => walk(fileJson(id)));
  return out;
}

function allowedEntry(id: string, requires: Obj): Obj {
  return { id, kind: 'averment', averment: 'a test averment', requires };
}
const equalsCond = (key = 'k'): Obj => ({ key, label: 'K', equals: ['none', 'nil'] });

describe('<entry>.equals resolution (round 2)', () => {
  let skelDir: string;
  let avDir: string;
  beforeEach(() => {
    skelDir = mkdtempSync(join(tmpdir(), 't374-skel-'));
    avDir = mkdtempSync(join(tmpdir(), 't374-av-'));
  });
  afterEach(() => {
    rmSync(skelDir, { recursive: true, force: true });
    rmSync(avDir, { recursive: true, force: true });
  });

  function writeAverments(allowed: Obj[], banned: Obj[] = [], file = '_default'): void {
    writeFileSync(
      join(avDir, `${file}.json`),
      JSON.stringify({ pack: file, signed_by: null, signed_on: null, banned, allowed }),
    );
  }
  function writeSkeleton(id: string, mutate: (s: Obj) => void = () => undefined): void {
    const s = clone(fileJson(id));
    mutate(s);
    writeFileSync(join(skelDir, `${id}.json`), JSON.stringify(s));
  }
  const load = (id: string): unknown => loadSkeleton(id, skelDir, RULE_PACKS_DIR_REAL, avDir);
  const thrown = (id: string): string => {
    try {
      load(id);
    } catch (e) {
      expect(e).toBeInstanceOf(RulePackError);
      return (e as Error).message;
    }
    throw new Error('expected loadSkeleton to throw');
  };

  describe('positive, against the real averment lists', () => {
    it.each(PACKS)('%s loads: every reference it makes resolves', (id) => {
      expect(() => loadSkeleton(id)).not.toThrow();
      expect(loadSkeleton(id)).not.toBeNull();
    });

    it('the real skeletons reference the entries the lists carry', () => {
      const refs = (id: string): string[] => skeletonEqualsRefs(fileJson(id)).entries.sort();
      expect(refs('bail_regular')).toEqual(['first_bail_application', 'no_recovery']);
      expect(refs('bail_before_magistrate')).toEqual(['first_bail_application', 'no_recovery']);
      expect(refs('bail_anticipatory')).toEqual(['first_bail_application']);
      expect(refs('default_bail')).toEqual(['first_bail_application']);
      for (const id of PACKS) expect(skeletonEqualsRefs(fileJson(id)).badNoneValues).toBe(false);
    });

    it("Magistrate's no_recovery.equals comes in through inherits, not its own file", () => {
      const own = JSON.parse(
        readFileSync(join(AVERMENTS_DIR_REAL, 'bail_before_magistrate.json'), 'utf8'),
      ) as Obj;
      expect(own.inherits).toBe('bail_regular');
      const ownIds = [...own.banned, ...own.allowed].map((e: Obj) => e.id);
      expect(ownIds).not.toContain('no_recovery');

      const lists = loadAvermentLists('bail_before_magistrate');
      const entry = [
        ...lists.banned.map((b) => b.unlocked_by),
        ...lists.allowed.map((a) => a.requires),
      ];
      expect(lists.allowed.some((a) => a.id === 'no_recovery')).toBe(true);
      expect(entry.length).toBeGreaterThan(0);
      expect(loadSkeleton('bail_before_magistrate')).not.toBeNull();
    });

    it('default_bail has no no_recovery entry of its own (the negative below relies on it)', () => {
      const lists = loadAvermentLists('default_bail');
      expect([...lists.banned, ...lists.allowed].some((e) => e.id === 'no_recovery')).toBe(false);
    });
  });

  describe('against a temp averments dir', () => {
    it('sanity: a valid skeleton and a list with the entry loads', () => {
      writeAverments([allowedEntry('first_bail_application', equalsCond())]);
      writeSkeleton('default_bail');
      expect(load('default_bail')).toEqual(fileJson('default_bail'));
    });

    it('an entry carried only by a banned entry (unlocked_by equals) also resolves', () => {
      const cond = equalsCond();
      writeAverments(
        [allowedEntry('first_bail_application', cond)],
        [
          {
            id: 'first_bail_application',
            kind: 'averment',
            what: 'w',
            phrases: ['p'],
            unlocked_by: cond,
          },
        ],
      );
      writeSkeleton('default_bail');
      expect(() => load('default_bail')).not.toThrow();
    });

    it('unknown entry in a condition throws, naming the id only', () => {
      writeAverments([allowedEntry('first_bail_application', equalsCond())]);
      writeSkeleton('default_bail', (s) => {
        clauseOf(s, 'earlier_applications').variants[0].when.in = 'zz_unknown.equals';
      });
      expect(thrown('default_bail')).toBe(
        "Rule pack 'default_bail': skeleton names 'zz_unknown.equals', but no averment entry 'zz_unknown' carries an equals list",
      );
    });

    it('an entry without an equals list throws', () => {
      writeAverments([
        allowedEntry('first_bail_application', equalsCond()),
        allowedEntry('has_present_only', { key: 'k', label: 'K', present: true }),
      ]);
      writeSkeleton('default_bail', (s) => {
        clauseOf(s, 'earlier_applications').variants[0].when.in = 'has_present_only.equals';
      });
      expect(thrown('default_bail')).toMatch(
        /skeleton names 'has_present_only.equals', but no averment entry 'has_present_only' carries an equals list/,
      );
    });

    it('an entry whose equals list is empty throws', () => {
      writeAverments([
        allowedEntry('first_bail_application', equalsCond()),
        allowedEntry('empty_equals', { key: 'k', label: 'K', equals: [] }),
      ]);
      writeSkeleton('default_bail', (s) => {
        clauseOf(s, 'earlier_applications').variants[0].when.in = 'empty_equals.equals';
      });
      expect(thrown('default_bail')).toMatch(
        /no averment entry 'empty_equals' carries an equals list/,
      );
    });

    it('a reference in an item requires and in a not_in is resolved too', () => {
      writeAverments([allowedEntry('first_bail_application', equalsCond())]);
      writeSkeleton('bail_regular', (s) => {
        const g = clauseOf(s, 'grounds');
        const first = Object.keys(g.items)[0];
        g.items[first].requires = { key: 'k', not_in: 'zz_item_entry.equals' };
      });
      expect(thrown('bail_regular')).toMatch(/entry 'zz_item_entry'/);
    });

    it('no_recovery.equals in default_bail throws against the real lists', () => {
      writeSkeleton('default_bail', (s) => {
        clauseOf(s, 'earlier_applications').variants[0].when.in = 'no_recovery.equals';
      });
      const msg = (() => {
        try {
          loadSkeleton('default_bail', skelDir, RULE_PACKS_DIR_REAL, AVERMENTS_DIR_REAL);
        } catch (e) {
          expect(e).toBeInstanceOf(RulePackError);
          return (e as Error).message;
        }
        throw new Error('expected throw');
      })();
      expect(msg).toMatch(
        /skeleton names 'no_recovery.equals', but no averment entry 'no_recovery' carries an equals list/,
      );
      // The same through the default averments dir (the param left out).
      expect(() => loadSkeleton('default_bail', skelDir)).toThrow(/no_recovery/);
    });

    it('none_values that is not an <entry>.equals reference throws', () => {
      writeAverments([allowedEntry('first_bail_application', equalsCond())]);
      for (const v of [
        'nil_values',
        'first_bail_application',
        'first_bail_application.equals.x',
        'T-334',
      ]) {
        writeSkeleton('default_bail', (s) => (s.none_values = v));
        expect(thrown('default_bail')).toBe(
          "Rule pack 'default_bail': skeleton none_values is not an '<entry>.equals' reference",
        );
      }
    });

    it('none_values pointing at a missing entry throws (note stripped before the lookup)', () => {
      writeAverments([allowedEntry('first_bail_application', equalsCond())]);
      writeSkeleton('default_bail', (s) => (s.none_values = 'zz_missing.equals (T-334)'));
      expect(thrown('default_bail')).toMatch(
        /skeleton names 'zz_missing.equals', but no averment entry 'zz_missing' carries an equals list/,
      );
    });

    it('averment lists that cannot be read throw their own message', () => {
      writeFileSync(join(avDir, '_default.json'), '{ not json');
      writeSkeleton('default_bail');
      const msg = thrown('default_bail');
      expect(msg).toContain('skeleton: the averment lists could not be read');
      expect(msg).not.toContain('not json');
    });
  });

  describe('none_values note stripping', () => {
    it.each([
      'first_bail_application.equals (T-334)',
      'first_bail_application.equals',
      'first_bail_application.equals   (T-334)  ',
      'first_bail_application.equals (a note)',
    ])('%p resolves to first_bail_application', (v) => {
      expect(skeletonEqualsRefs({ none_values: v, clauses: [] })).toEqual({
        entries: ['first_bail_application'],
        badNoneValues: false,
      });
      writeAverments([allowedEntry('first_bail_application', equalsCond())]);
      writeSkeleton('default_bail', (s) => (s.none_values = v));
      expect(() => load('default_bail')).not.toThrow();
    });

    it('a note alone, or a note on a non-reference, is flagged bad', () => {
      expect(skeletonEqualsRefs({ none_values: '(T-334)', clauses: [] }).badNoneValues).toBe(true);
      expect(skeletonEqualsRefs({ none_values: 'abc (T-334)', clauses: [] }).badNoneValues).toBe(
        true,
      );
    });
  });
});

describe('skeletonEqualsRefs (round 2)', () => {
  it('collects references from when, variants, item requires and all_of', () => {
    const raw = {
      none_values: 'n0.equals (T-1)',
      clauses: [
        { id: 'a', when: { key: 'k', in: 'w1.equals' } },
        {
          id: 'b',
          variants: [
            { when: { key: 'k', not_in: 'v1.equals' }, text: 't' },
            {
              when: {
                all_of: [
                  { key: 'k', in: 'v2.equals' },
                  { all_of: [{ key: 'k', in: 'v3.equals' }] },
                ],
              },
            },
          ],
        },
        {
          id: 'c',
          items: {
            x: { requires: { key: 'k', in: 'i1.equals' } },
            y: { requires: { all_of: [{ key: 'k', not_in: 'i2.equals' }] } },
            z: { text: 't' },
          },
        },
        { id: 'd', when: { all_of: [{ key: 'k', in: 'w2.equals' }] } },
      ],
    };
    const out = skeletonEqualsRefs(raw);
    expect(out.badNoneValues).toBe(false);
    expect([...out.entries].sort()).toEqual(
      ['i1', 'i2', 'n0', 'v1', 'v2', 'v3', 'w1', 'w2'].sort(),
    );
  });

  it('lists an entry once however often it is named', () => {
    const raw = {
      none_values: 'e.equals',
      clauses: [{ when: { key: 'k', in: 'e.equals' } }, { when: { key: 'k', not_in: 'e.equals' } }],
    };
    expect(skeletonEqualsRefs(raw).entries).toEqual(['e']);
  });

  it('ignores value lists, arrays and other strings', () => {
    const raw = {
      none_values: 'e.equals',
      clauses: [
        { when: { key: 'k', in: 'none_values' } },
        { when: { key: 'k', in: 'antecedents_none_values' } },
        { when: { key: 'k', in: ['a.equals'] } },
        { when: { key: 'k', present: true } },
        { when: { key: 'k', in: 'Not.equals' } },
      ],
    };
    expect(skeletonEqualsRefs(raw).entries).toEqual(['e']);
  });

  it('a non-object, or a skeleton with no clauses, yields nothing', () => {
    expect(skeletonEqualsRefs(null)).toEqual({ entries: [], badNoneValues: false });
    expect(skeletonEqualsRefs('x')).toEqual({ entries: [], badNoneValues: false });
    expect(skeletonEqualsRefs([])).toEqual({ entries: [], badNoneValues: false });
    expect(skeletonEqualsRefs({})).toEqual({ entries: [], badNoneValues: false });
  });

  it('is pure: the input is not changed', () => {
    const raw = deepFreezeCopy(fileJson('bail_regular'));
    expect(() => skeletonEqualsRefs(raw)).not.toThrow();
  });
});

function deepFreezeCopy<T>(v: T): T {
  const c = clone(v);
  const f = (o: unknown): void => {
    if (o !== null && typeof o === 'object') {
      Object.values(o).forEach(f);
      Object.freeze(o);
    }
  };
  f(c);
  return c;
}

describe('cache and an override dir (round 2)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 't374-cache-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('an override-dir load leaves the shared cache alone (cold cache)', () => {
    writeFileSync(join(tmp, 'default_bail.json'), JSON.stringify(fileJson('default_bail')));
    const copy = loadSkeleton('default_bail', tmp);
    expect(copy).not.toBeNull();
    const shared = loadSkeleton('default_bail');
    expect(shared).not.toBe(copy);
    expect(shared).toEqual(copy); // same content, a different object
    expect(shared).toEqual(JSON.parse(fencedJson('default_bail'))); // from the real file
    expect(loadSkeleton('default_bail')).toBe(shared);
  });

  it('an override-dir copy with different content does not become the shared skeleton', () => {
    const odd = clone(fileJson('default_bail'));
    odd.version = 77;
    writeFileSync(join(tmp, 'default_bail.json'), JSON.stringify(odd));
    expect(loadSkeleton('default_bail', tmp)!.version).toBe(77);
    expect(loadSkeleton('default_bail')!.version).toBe(SIGNED.default_bail.version);
  });

  it('a warm shared cache is not replaced by an override-dir load', () => {
    const shared = loadSkeleton('default_bail');
    const odd = clone(fileJson('default_bail'));
    odd.version = 78;
    writeFileSync(join(tmp, 'default_bail.json'), JSON.stringify(odd));
    expect(loadSkeleton('default_bail', tmp)!.version).toBe(78);
    expect(loadSkeleton('default_bail')).toBe(shared);
  });

  it('an override-dir load is not itself cached: the file is read again', () => {
    writeFileSync(join(tmp, 'default_bail.json'), JSON.stringify(fileJson('default_bail')));
    const a = loadSkeleton('default_bail', tmp);
    const b = loadSkeleton('default_bail', tmp);
    expect(b).not.toBe(a);
    const odd = clone(fileJson('default_bail'));
    odd.version = 79;
    writeFileSync(join(tmp, 'default_bail.json'), JSON.stringify(odd));
    expect(loadSkeleton('default_bail', tmp)!.version).toBe(79);
  });

  it('an averments-dir override alone also bypasses the shared cache', () => {
    const shared = loadSkeleton('default_bail');
    const viaAv = loadSkeleton(
      'default_bail',
      SKELETON_DIR,
      RULE_PACKS_DIR_REAL,
      AVERMENTS_DIR_REAL,
    );
    expect(viaAv).not.toBe(shared);
    expect(viaAv).toEqual(shared);
    expect(loadSkeleton('default_bail')).toBe(shared);
  });

  it('override-dir results are frozen too', () => {
    writeFileSync(join(tmp, 'default_bail.json'), JSON.stringify(fileJson('default_bail')));
    expect(deepFrozen(loadSkeleton('default_bail', tmp))).toBe(true);
  });
});

describe('optional validator fixes (round 2)', () => {
  it('a derived slot used only in an item text counts as used', () => {
    const e = errorsAfter('bail_regular', (s) => {
      const g = clauseOf(s, 'grounds');
      g.derived = { zz_d: { from: 'applicant_name', map: { a: 'b' } } };
      const id = Object.keys(g.items).find((k) => typeof g.items[k].text === 'string')!;
      g.items[id].text += ' {zz_d}';
    });
    expect(e).toEqual([]);
  });

  it('a derived slot used in an item text does not need to be listed in its slots', () => {
    const e = errorsAfter('bail_regular', (s) => {
      const g = clauseOf(s, 'grounds');
      g.derived = { zz_d: { from: 'applicant_name', map: { a: 'b' } } };
      const id = Object.keys(g.items).find((k) => typeof g.items[k].text === 'string')!;
      g.items[id].text += ' {zz_d}';
      expect(g.items[id].slots ?? []).not.toContain('zz_d');
    });
    expect(e).toEqual([]);
  });

  it('render_if_any_slot may name an advocate clause own slot', () => {
    const e = errorsAfter('bail_regular', (s) => {
      const f = clauseOf(s, 'facts');
      expect(f.source).toBe('advocate');
      f.render_if_any_slot = f.slot;
    });
    expect(e).toEqual([]);
  });

  it('render_if_any_slot on an advocate clause still rejects any other slot', () => {
    const e = errorsAfter('bail_regular', (s) => {
      clauseOf(s, 'facts').render_if_any_slot = 'zz_other';
    });
    expect(e.join('\n')).toMatch(
      /clause 'facts': render_if_any_slot is not one of the clause's slots/,
    );
  });
});

describe('no signed text in the round-2 error messages', () => {
  let skelDir: string;
  beforeEach(() => {
    skelDir = mkdtempSync(join(tmpdir(), 't374-msg-'));
  });
  afterEach(() => rmSync(skelDir, { recursive: true, force: true }));

  const SECRET = 'Signed Wording Of The Court With Spaces';

  function messageFor(id: string, mutate: (s: Obj) => void): string {
    const s = clone(fileJson(id));
    mutate(s);
    writeFileSync(join(skelDir, `${id}.json`), JSON.stringify(s));
    try {
      loadSkeleton(id, skelDir, RULE_PACKS_DIR_REAL, AVERMENTS_DIR_REAL);
    } catch (e) {
      return (e as Error).message;
    }
    throw new Error('expected loadSkeleton to throw');
  }

  it('none_values, unknown entry, and non-array value lists carry no file text', () => {
    const sentences = allSignedSentences();
    expect(sentences.length).toBeGreaterThan(20);
    const messages = [
      messageFor('default_bail', (s) => (s.none_values = SECRET)),
      messageFor('default_bail', (s) => (s.roots_none_values = SECRET)),
      messageFor('default_bail', (s) => (s[SECRET] = SECRET)),
      messageFor('default_bail', (s) => {
        clauseOf(s, 'earlier_applications').variants[0].when.in = 'no_recovery.equals';
      }),
      messageFor('bail_regular', (s) => {
        s.clauses[0].extra = SECRET;
        s.clauses[0][SECRET] = 1;
      }),
    ];
    for (const m of messages) {
      expect(m).not.toContain(SECRET);
      expect(m).not.toContain('Signed Wording');
      for (const sent of sentences) expect(m).not.toContain(sent);
    }
    expect(messages[2]).toContain('an invalid id');
  });
});

describe('module load order (round 2)', () => {
  type RP = typeof import('../services/rule-pack.service');

  it('averments first, then rule-pack.service: loadSkeleton works', () => {
    let result: unknown = 'unset';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../services/averments');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const rp = require('../services/rule-pack.service') as RP;
      result = rp.loadSkeleton('bail_before_magistrate');
    });
    expect(result).not.toBeNull();
    expect((result as Obj).pack).toBe('bail_before_magistrate');
    expect(result).toEqual(JSON.parse(fencedJson('bail_before_magistrate')));
  });

  it('rule-pack.service first, then averments: loadSkeleton works', () => {
    let result: unknown = 'unset';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const rp = require('../services/rule-pack.service') as RP;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../services/averments');
      result = rp.loadSkeleton('bail_before_magistrate');
    });
    expect((result as Obj).pack).toBe('bail_before_magistrate');
  });

  it('rule-pack.service alone (averments never imported by the caller): all four load', () => {
    const packs: unknown[] = [];
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const rp = require('../services/rule-pack.service') as RP;
      for (const id of PACKS) packs.push(rp.loadSkeleton(id));
    });
    expect(packs.every((p) => p !== null)).toBe(true);
  });
});
