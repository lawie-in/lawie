/**
 * T-683 phase 1: the signed pieces. (1) the v3 Extractor prompt is pinned by
 * SHA-256, so any edit forces Ajay's re-sign; (2) the O.39 restraint_sought
 * extract_hint equals the text Ajay signed in T-613 (j)7(b), read from the
 * signed file, never retyped here; (3) no other pack carries an extract_hint.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import { buildChecklist } from '../../services/intake-brief';
import { listRulePackIds, loadRulePack } from '../../services/rule-pack.service';

const PROMPT_FILE = join(__dirname, '../../config/prompts/v3-extractor.ts');
const O39_JSON = join(__dirname, '../../config/document-rules/temporary_injunction_o39.json');
const SIGNED = join(__dirname, '../../../../../handoff/legal/T-613-o39-injunction-signed.md');

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

describe('v3-extractor.ts prompt pin (Ajay signs the file by SHA-256)', () => {
  it('the file is byte for byte the one Ajay signs: sha256 54b0f004...b8bd', () => {
    // If this fails, the prompt changed: it needs Ajay's re-sign before merge.
    expect(sha(readFileSync(PROMPT_FILE))).toBe(
      '54b0f0041513225e28e5b37c472b3d8e52ab8aaa8b1ee62e46b83b61f870b8bd',
    );
  });

  it('the prompt string itself is pinned too', async () => {
    const { V3_EXTRACTOR_SYSTEM_PROMPT } = await import('../../config/prompts/v3-extractor');
    expect(sha(V3_EXTRACTOR_SYSTEM_PROMPT)).toBe(
      '9275c9aeec47fbe97e9114a47f4ec550a3ea26581b70969193feb457a78df2da',
    );
  });
});

describe('extract_hint (T-613 (j)7(b))', () => {
  const signedText = (): string => {
    const md = readFileSync(SIGNED, 'utf8');
    const m = /\(b\) `restraint_sought` reading hint \*\*signed as written\*\*: `([^`]+)`/.exec(md);
    if (!m) throw new Error('signed 7(b) text not found in T-613 file');
    return m[1];
  };

  it('the signed text is found in the signed file and is the 225-character hint', () => {
    expect(signedText()).toHaveLength(225);
    expect(sha(signedText())).toBe(
      'e83171133e73b96d535ef7c86de7c23cd764bb137dd0d85d33b38bf69203022f',
    );
  });

  it('restraint_sought.extract_hint loads through loadRulePack and equals the signed text', () => {
    const pack = loadRulePack('temporary_injunction_o39');
    const fact = pack?.facts.find((f) => f.key === 'restraint_sought');
    expect(fact?.extract_hint).toBe(signedText());
  });

  it('the JSON file holds the same text', () => {
    const raw = readFileSync(O39_JSON, 'utf8');
    expect(raw).toContain(JSON.stringify(signedText()).slice(1, -1));
  });

  it('is on restraint_sought only; every other fact in every pack has none', () => {
    const withHint: string[] = [];
    for (const id of listRulePackIds()) {
      const pack = loadRulePack(id);
      for (const f of pack?.facts ?? []) {
        if (f.extract_hint !== undefined) withHint.push(`${id}.${f.key}`);
      }
    }
    expect(withHint).toEqual(['temporary_injunction_o39.restraint_sought']);
  });

  it('adding the hint changed no checklist item: the pack still builds the same keys', () => {
    const pack = loadRulePack('temporary_injunction_o39')!;
    const keys = buildChecklist(pack).map((i) => i.key);
    expect(keys).toContain('restraint_sought');
    // The checklist (what the user is asked) never carries the hint.
    expect(JSON.stringify(buildChecklist(pack))).not.toContain('Fill only from words');
  });
});
