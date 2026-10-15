/**
 * T-447: judgment names removed from the model-visible text of seven criminal packs:
 * criminal_appeal, fir_quashing, quashing_528_bnss, suspension_of_sentence,
 * surrender_application, curative_petition, review_petition.
 *
 * Signed: handoff/legal/T-245-old-new-law-switch-signed.md, Addendum 8 (Ajay, 15 Oct 2026):
 * rules R1-R7 and the sentence S. Pattern: t441-no-judgment-names.test.ts.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { readDraftingInstructionList } from '../services/rule-pack.service';

// S, byte-exact (U+2014 dash), Addendum 8.
const S =
  'Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].';
const R6 =
  'All edits require CLO sign-off. Do not name judgments in model-visible text (Ajay, T-441).';

const RULES_DIR = join(__dirname, '..', 'config', 'document-rules');
const rule = (id: string): Record<string, any> =>
  JSON.parse(readFileSync(join(RULES_DIR, `${id}.json`), 'utf8'));

const instructionsOf = (id: string): string[] => {
  const p = rule(id);
  return p.promptInstructions ?? p.prompt_context.promptInstructions;
};

// Left on purpose (developer report): form labels and prose that still carry a name.
// They are removed from the model-visible text before scanning, and nothing else is.
const EXEMPT_STRINGS: Record<string, string[]> = {
  fir_quashing: ['Bhajan Lal categories invoked (one or more)'],
  curative_petition: ['Curative Ground (Rupa Ashok Hurra)'],
};
const EXEMPT_FIELDS: Record<string, string[]> = {
  curative_petition: ['description', 'validation_rules'],
};

/** Everything the model can see: the pack minus key_citations, key_precedents and _meta, minus exemptions. */
const modelVisible = (id: string): string => {
  const copy: Record<string, any> = { ...rule(id) };
  for (const k of ['key_citations', 'key_precedents', '_meta']) delete copy[k];
  for (const k of EXEMPT_FIELDS[id] ?? []) delete copy[k];
  let text = JSON.stringify(copy);
  for (const s of EXEMPT_STRINGS[id] ?? []) {
    expect(text).toContain(JSON.stringify(s).slice(1, -1)); // the exemption must still exist and be exact
    text = text.split(JSON.stringify(s).slice(1, -1)).join('');
  }
  return text;
};

const count = (hay: string, needle: string) => hay.split(needle).length - 1;

const IDS = [
  'criminal_appeal',
  'fir_quashing',
  'quashing_528_bnss',
  'suspension_of_sentence',
  'surrender_application',
  'curative_petition',
  'review_petition',
];

// Names that were in model-visible text before T-447 (git show HEAD~1) or in key_citations.
const REMOVED_NAMES = [
  'Ponnuswamy',
  'Sharad Birdhichand Sarda',
  'Sujit Biswas',
  'Hari Charan Kurmi',
  'Manoj v.',
  'Chandrappa',
  'Rajesh Singh',
  'Mallappa',
  'Bachan Singh',
  'Machhi Singh',
  'Soman',
  'Bhagwan Rama Shinde',
  'Rupa Ashok Hurra',
  'Bhajan Lal',
  'Indian Oil Corp',
  'Sagar Suri',
  'Inder Mohan Goswami',
  'Preeti Gupta',
  'Geeta Mehrotra',
  'Kahkashan Kausar',
  'Gian Singh',
  'Parbatbhai',
  'Laxmi Narayan',
  'Neeharika',
  'T.T. Antony',
  'Madhu Limaye',
  'Hari Vishnu Kamath',
  'Narinder Singh',
  'R.P. Kapur',
  'P.P. Sharma',
  'Devendrappa',
  'Northern Railway',
  'Kamlesh Verma',
  'Parsion Devi',
  'Ozair Husain',
  'Chajju Ram',
  'Moran Mar',
  'Lily Thomas',
  'Aribam',
  'Meera Bhanja',
  'Kunhayammed',
  'Mohd Arif',
  'Niranjan Singh',
  'Kashmira Singh',
  'Atul Tripathi',
  'Sumer v.',
  'Yakub Abdul Razak Memon',
  'National Commission for Women v.',
];

describe('T-447: the no-judgment sentence S (Addendum 8, R3)', () => {
  it('S in this file is the signed text, with the U+2014 dash', () => {
    expect(S).toContain('—');
    expect(S).not.toMatch(/–|Authority - add/);
  });

  it.each(IDS)(
    '%s: S is the last promptInstructions entry and appears exactly once in the pack',
    (id) => {
      const ins = instructionsOf(id);
      expect(ins[ins.length - 1]).toBe(S);
      expect(ins.filter((e) => e === S)).toHaveLength(1);
      expect(count(JSON.stringify(rule(id)), S)).toBe(1);
    },
  );

  it.each(IDS)(
    '%s: as read by readDraftingInstructionList, S is the last entry and appears once',
    (id) => {
      const list = readDraftingInstructionList(rule(id));
      expect(list[list.length - 1]).toBe(S);
      expect(list.filter((e) => e === S)).toHaveLength(1);
    },
  );

  it('curative_petition: promptInstructions is exactly [S] under prompt_context', () => {
    expect(rule('curative_petition').prompt_context.promptInstructions).toEqual([S]);
  });
});

describe('T-447: no judgment name or citation in model-visible text (R1, R2)', () => {
  it.each(IDS)('%s: none of the removed names appears', (id) => {
    const text = modelVisible(id);
    for (const name of REMOVED_NAMES) expect(text).not.toContain(name);
  });

  it.each(IDS)('%s: no " v. ", SCC, SCR, AIR or Supp citation pattern', (id) => {
    const text = modelVisible(id);
    expect(text).not.toMatch(/\sv\.?\s+[A-Z]/);
    expect(text).not.toMatch(/\bSCC\b|\bSCR\b|\bAIR\s+(\d{4}|SC|PC)\b|\bSupp\s*\(\d\)/);
    expect(text).not.toMatch(/\(\d{4}\)\s+\d+\s+(SCC|SCR)\b/);
  });

  it.each(IDS)('%s: no promptInstructions entry is a bare "Cite ..." line', (id) => {
    for (const e of instructionsOf(id)) expect(e).not.toMatch(/^Cite\b.*(\sv\.?\s|SCC|AIR\s)/);
  });
});

describe('T-447: _meta.change_protocol (R6)', () => {
  it.each(['fir_quashing', 'quashing_528_bnss', 'review_petition'])(
    '%s: change_protocol is the signed sentence',
    (id) => {
      expect(rule(id)._meta.change_protocol).toBe(R6);
    },
  );

  it.each(IDS)('%s: change_protocol does not make a citation mandatory', (id) => {
    const cp: string = rule(id)._meta?.change_protocol ?? '';
    expect(cp).not.toMatch(/cites? mandatory|verbatim|must be cited/i);
  });
});

describe('T-447: R4 labels approved by Ajay (7d77a4e)', () => {
  const names = (id: string): string[] =>
    (rule(id).mandatory_clauses as Array<{ name?: string }>).map((c) => c.name ?? '');

  it('fir_quashing clause is named "Recognised Quashing Categories Verbatim"', () => {
    expect(names('fir_quashing')).toContain('Recognised Quashing Categories Verbatim');
  });
  it('quashing_528_bnss clause is named "Recognised Quashing Categories Invoked"', () => {
    expect(names('quashing_528_bnss')).toContain('Recognised Quashing Categories Invoked');
  });
  it('curative_petition says "the recognised curative grounds" in model-visible text', () => {
    expect(modelVisible('curative_petition')).toContain('the recognised curative grounds');
  });
  it('quashing_528_bnss drops the two principle-only entries (Ajay must-fix)', () => {
    const text = modelVisible('quashing_528_bnss');
    expect(text).not.toContain('Comprehensive principles on quashing on settlement.');
    expect(text).not.toContain('Three categories of cases for quashing.');
  });
});

describe('T-447: key_citations / key_precedents are left alone (R6)', () => {
  it.each(['criminal_appeal', 'fir_quashing', 'quashing_528_bnss', 'review_petition'])(
    '%s: key_citations is a non-empty array and is not model-visible',
    (id) => {
      const p = rule(id);
      expect(Array.isArray(p.key_citations)).toBe(true);
      expect(p.key_citations.length).toBeGreaterThan(0);
      expect(modelVisible(id)).not.toContain('"key_citations"');
    },
  );

  it('curative_petition: key_precedents still has its four cases', () => {
    const p = rule('curative_petition');
    expect(p.key_precedents).toHaveLength(4);
    expect(p.key_precedents[0].case).toContain('Rupa Ashok Hurra');
  });

  it('criminal_appeal key_citations keeps the removed names', () => {
    const text = JSON.stringify(rule('criminal_appeal').key_citations);
    for (const n of ['Chandrappa', 'Bachan Singh', 'Sujit Biswas']) expect(text).toContain(n);
  });
});
