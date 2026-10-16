/**
 * T-478 - certiorari must offer Art. 227 (Ajay's rulings, 16 Oct 2026, T-245 file 7d42b105):
 * the new article_invoked option, the mandatory clause renamed to `jurisdiction_clause` /
 * "Jurisdiction" with Ajay's description, and the old clause id kept as an alias.
 * Out of scope here: fact-verifier.ts and fixture 26 (later rounds).
 */
import './setupEnv';

import { readFileSync } from 'fs';
import { join } from 'path';

import { assemblePrompt, PromptInput } from '../services/prompt-assembler';
import {
  CLAUSE_ID_ALIASES,
  clearRulePackCache,
  loadRulePack,
  readMandatoryClauses,
  resolveClauseId,
} from '../services/rule-pack.service';

// No Redis/Mongo: old-law lookups are stubbed out
jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
  lookupOldToNew: jest.fn(async () => null),
}));

const PACK = 'certiorari';
const OLD_ID = 'jurisdiction_clause_article_226_hc_or_article_32_sc';
const NEW_ID = 'jurisdiction_clause';
const NEW_OPTION = 'Article 227 (judicial order of a civil court)';
const ORIGINAL_OPTIONS = ['226', '32', '226 and 227'];
const DESCRIPTION =
  'State the Article selected in article_invoked. For a judicial order of a civil court, invoke Article 227, not Article 226.';

const SERVICE = join(__dirname, '..', 'services', 'rule-pack.service.ts');
const RULE_FILE = join(__dirname, '..', 'config', 'document-rules', `${PACK}.json`);
const ALIAS_COMMENT = '// T-478 alias, remove in the post-v1 cleanup';

describe('T-478 certiorari article_invoked options', () => {
  const raw = JSON.parse(readFileSync(RULE_FILE, 'utf8'));
  const field = raw.form_schema.article_invoked;

  it('offers the new option with the exact string, exactly once', () => {
    const options: string[] = field.options;
    expect(options.filter((o) => o === NEW_OPTION)).toHaveLength(1);
  });
  it('keeps the original three options unchanged and in order', () => {
    expect(field.options.slice(0, 3)).toEqual(ORIGINAL_OPTIONS);
    expect(field.options).toEqual([...ORIGINAL_OPTIONS, NEW_OPTION]);
  });
  it('the field is still a required select', () => {
    expect(field.type).toBe('select');
    expect(field.required).toBe(true);
  });
});

describe('T-478 certiorari jurisdiction clause through the real loader', () => {
  beforeAll(() => clearRulePackCache());

  it('loadRulePack exposes id, title, byte-exact description, and required', () => {
    const pack = loadRulePack(PACK)!;
    expect(pack).not.toBeNull();
    const c = pack.mandatoryClauses.find((x) => x.id === NEW_ID)!;
    expect(c).toBeDefined();
    expect(c.title).toBe('Jurisdiction');
    expect(c.detail).toBe(DESCRIPTION);
    expect(c.required).toBe(true);
    expect(pack.mandatoryClauses.filter((x) => x.id === NEW_ID)).toHaveLength(1);
  });
  it('readMandatoryClauses on the raw pack agrees', () => {
    const raw = JSON.parse(readFileSync(RULE_FILE, 'utf8'));
    const c = readMandatoryClauses(raw).find((x) => x.id === NEW_ID)!;
    expect(c.title).toBe('Jurisdiction');
    expect(c.detail).toBe(DESCRIPTION);
    expect(c.required).toBe(true);
  });
  it('the clause keeps its position (after the cause title clause)', () => {
    const ids = loadRulePack(PACK)!.mandatoryClauses.map((c) => c.id);
    const i = ids.indexOf(NEW_ID);
    expect(i).toBe(1);
  });
  it('no clause with the old slug remains, in the loaded pack or the file', () => {
    const ids = loadRulePack(PACK)!.mandatoryClauses.map((c) => c.id);
    expect(ids).not.toContain(OLD_ID);
    expect(ids.some((i) => i.includes('article_226_hc'))).toBe(false);
    expect(readFileSync(RULE_FILE, 'utf8')).not.toContain('Jurisdiction clause — Article 226');
  });
});

describe('T-478 resolveClauseId', () => {
  it('maps the old certiorari id to the new one', () => {
    expect(resolveClauseId(PACK, OLD_ID)).toBe(NEW_ID);
  });
  it('the new id and unknown ids are returned unchanged', () => {
    expect(resolveClauseId(PACK, NEW_ID)).toBe(NEW_ID);
    expect(resolveClauseId(PACK, 'facts_narrating_original_proceedings')).toBe(
      'facts_narrating_original_proceedings',
    );
  });
  it('other packs are left alone, including quo_warranto', () => {
    expect(resolveClauseId('quo_warranto', OLD_ID)).toBe(OLD_ID);
    expect(resolveClauseId('mandamus', OLD_ID)).toBe(OLD_ID);
    expect(resolveClauseId('', OLD_ID)).toBe(OLD_ID);
  });
  it.each(['__proto__', 'toString', 'constructor', 'hasOwnProperty'])(
    'does not resolve %s as a pack or as a clause id',
    (k) => {
      expect(resolveClauseId(k, OLD_ID)).toBe(OLD_ID);
      expect(resolveClauseId(PACK, k)).toBe(k);
      expect(resolveClauseId(k, k)).toBe(k);
    },
  );
  it('the alias map holds exactly the one rename and is frozen', () => {
    expect(Object.keys(CLAUSE_ID_ALIASES)).toEqual([PACK]);
    expect(Object.entries(CLAUSE_ID_ALIASES[PACK])).toEqual([[OLD_ID, NEW_ID]]);
    expect(Object.isFrozen(CLAUSE_ID_ALIASES)).toBe(true);
    expect(Object.isFrozen(CLAUSE_ID_ALIASES[PACK])).toBe(true);
  });
});

describe('T-478 the assembled prompt for certiorari', () => {
  it('lists the Jurisdiction clause with the Article 227 guidance', async () => {
    const p = await assemblePrompt({
      docType: PACK,
      courtName: 'High Court of Delhi',
      courtType: 'high_court',
      partyDetails: { petitioner: 'A Kumar', respondent: 'B Kumar' },
      keyFacts: 'The civil court passed an order.',
      reliefPrayer: 'Quash the order.',
      advocateName: 'X',
    } as unknown as PromptInput);
    expect(p.docRule).not.toBeNull();
    expect(p.systemPrompt).toContain(`  - Jurisdiction: ${DESCRIPTION}`);
    expect(p.systemPrompt).toContain('Article 227');
    expect(p.systemPrompt).not.toContain('Jurisdiction clause — Article 226');
  });
});

describe('T-478 static pins', () => {
  const lines = readFileSync(SERVICE, 'utf8').split('\n');
  it('the alias map and resolver carry the removal comment on the line above', () => {
    for (const needle of ['export const CLAUSE_ID_ALIASES', 'export function resolveClauseId']) {
      const i = lines.findIndex((l) => l.includes(needle));
      expect(i).toBeGreaterThan(0);
      expect(lines[i - 1].trim()).toBe(ALIAS_COMMENT);
    }
    lines.forEach((l, i) => {
      if (l.trim() === ALIAS_COMMENT) expect(lines[i + 1].trim()).not.toBe('');
    });
    expect(lines.filter((l) => l.trim() === ALIAS_COMMENT).length).toBeGreaterThanOrEqual(2);
  });
});
