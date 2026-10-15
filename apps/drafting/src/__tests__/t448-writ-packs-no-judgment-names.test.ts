/**
 * T-448: judgment names removed from the model-visible text of the seven writ packs
 * (writ_petition_civil, writ_petition_criminal, pil, certiorari, mandamus, quo_warranto,
 * cat_oa). Rules R1-R7 and the sentence S: handoff/legal/T-245-old-new-law-switch-signed.md,
 * Addendum 8 (Ajay, 15 Oct 2026). Sweep list: handoff/tickets/T-441-judgment-sweep.md.
 *
 * Model-visible = prompt_context (any level, incl. promptInstructions), the mandatory clauses,
 * relevantActs, prayerTemplate, verificationTemplate. NOT scanned (R6, R7): key_citations,
 * key_precedents, _meta, _averments. filing_checklist is shown to the user, and
 * validation_rules is not sent to the model, so neither is scanned either.
 */
import './setupEnv';

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import { _testing, assemblePrompt, PromptInput } from '../services/prompt-assembler';

jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
  lookupOldToNew: jest.fn(async () => null),
}));

// S, byte-exact (U+2014 dash), Addendum 8. Typed here, not imported from any pack.
const S =
  'Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].';
const CHANGE_PROTOCOL = 'Do not name judgments in model-visible text (Ajay, T-441).';

const RULES_DIR = join(__dirname, '..', 'config', 'document-rules');
const PACKS = [
  'writ_petition_civil',
  'writ_petition_criminal',
  'pil',
  'certiorari',
  'mandamus',
  'quo_warranto',
  'cat_oa',
] as const;
const HAD_MANDATORY_PROTOCOL = ['writ_petition_civil', 'writ_petition_criminal', 'pil', 'cat_oa'];
const HAD_NO_PROTOCOL = ['certiorari', 'mandamus', 'quo_warranto'];

type Pack = Record<string, any>;
const load = (id: string): Pack => JSON.parse(readFileSync(join(RULES_DIR, `${id}.json`), 'utf8'));
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

// ── The scan ────────────────────────────────────────────────────────────────

/** Case names removed by T-448 (and the ones the old change_protocols called "mandatory"). */
const DENYLIST = [
  /Maneka/i,
  /Whirlpool/i,
  /Wednesbury/i,
  /D\.\s?K\.\s?Basu/i,
  /Nilabati/i,
  /Arnesh/i,
  /Balwant Singh/i,
  /Chaufal/i,
  /Mansukhlal/i,
  /Bandhua/i,
  /Hussainara/i,
  /BALCO/,
  /S\.\s?P\.\s?Gupta/,
  /Lalita Kumari/i,
  /Chandra Kumar/i,
  /Sampath Kumar/i,
  /Kesavananda/i,
  /Vishaka/i,
  /M\.\s?C\.\s?Mehta/i,
  /MC Mehta/i,
  /Democratic Rights/i,
  /Joginder Kumar/i,
  /Olga Tellis/i,
  /Sunil Batra/i,
  // Removed by this diff, in neither key list (word boundaries so "Promila"/"Khatri" match whole words only).
  /\bMohd\.? Nooh\b/i,
  /\bNavjyoti\b/i,
  /\bReliance Energy\b/i,
  /\bAjay Hasia\b/i,
  /\bSukhdev Singh\b/i,
  /\bRani Devi\b/i,
  /\bPromila\b/i,
  /\bJ\.\s?K\.\s?Bansal\b/i,
  /\bSomesh Tiwari\b/i,
  /\bBachan Singh\b/i,
  /\bRohit Pulp\b/i,
  /\bMohini Jain\b/i,
  /\bPaschim Banga\b/i,
  /\bEnviro-Legal\b/i,
  /\bKhatri\b/i,
];
/** Shapes of a judgment citation. */
const GENERIC: Array<[string, RegExp]> = [
  ['"X v. Y"', / v\. /],
  ['"X vs Y"', / vs\.? [A-Z]/],
  ['AIR/SCC/SCR reporter', /\b(AIR|SCC|SCR)\b/],
  ['(19xx)/(20xx) reporter year', /\((19|20)\d{2}\)/],
  [
    '"per <Name>"',
    /\b[Pp]er [A-Z][a-z]+(?! (?:[A-Z]))(?<!\b[Pp]er (?:Rule|Form|Section|Article|Order|Para|State|Schedule|Part|Chapter|Court))\b/,
  ],
  ['"as held in <Name>"', /as held in [A-Z]/],
  ['"following <Name>"', /\bfollowing [A-Z][a-z]+ [A-Z]/],
];

// ── Denylist derived from each pack's own key_citations / key_precedents ────
// These two fields are not model-visible (R6) and still carry the full names of the judgments
// removed from the prompt, so they are the authoritative list of what must not leak.

/**
 * Party names skipped because they are generic governmental / office names that legitimately
 * appear in ordinary legal text (not a judgment name by themselves): "Union of India", "State of
 * <X>" / "State", "Commissioner of Police", "Supt of Police", "Registrar of Trade Marks",
 * "Chief District Medical Officer", and anything under 4 characters ("BMC", "PNB").
 */
const GENERIC_PARTY = [
  /^Union of India$/i,
  /^State(\s+of\s+.+)?$/i,
  /^Commissioner\b/i,
  /^Supt\.?\s+of\s+Police$/i,
  /^Registrar\b/i,
  /^Chief District Medical Officer$/i,
];
const isGenericParty = (n: string) => n.length < 4 || GENERIC_PARTY.some((g) => g.test(n));

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Strip reporter / parenthetical tails: "X v. Y (1978) 1 SCC 248", "X v. Y AIR 1964 SC 1006", "(CVC case)". */
function caseCaption(raw: string): string {
  return raw
    .split(' — ')[0]
    .replace(/\s*\((?:19|20)\d{2}\).*$/, '')
    .replace(/\s+AIR\s.*$/, '')
    .replace(/\s+(?:19|20)\d{2}\s+Supp.*$/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
}

/** Distinctive party names (before/after " v. ") of every key_citations / key_precedents entry. */
function derivedPartyNames(pack: Pack): string[] {
  const captions: string[] = [];
  for (const e of [...(pack.key_citations ?? []), ...(pack.key_precedents ?? [])]) {
    if (typeof e === 'string') captions.push(caseCaption(e));
    else if (e && typeof e === 'object' && typeof e.case === 'string')
      captions.push(caseCaption(e.case));
  }
  const names = new Set<string>();
  for (const c of captions) {
    for (const party of c.split(/\s+v\.?\s+/)) {
      const n = party.trim();
      if (!n || isGenericParty(n)) continue;
      names.add(n);
      // Also the name without leading initials ("S.P. Gupta" -> "Gupta" is too short; keep >= 2 words).
      const bare = n.replace(/^(?:[A-Z]\.\s?)+/, '').trim();
      if (bare !== n && bare.split(/\s+/).length >= 2 && !isGenericParty(bare)) names.add(bare);
    }
  }
  return [...names];
}

const derivedRegexes = (pack: Pack): RegExp[] =>
  derivedPartyNames(pack).map((n) => new RegExp(escapeRe(n).replace(/\s+/g, '\\s+'), 'i'));

/** Exact strings that are not citations: cause-title formats use "v." between parties. */
const ALLOWED = [/^Cause title with petitioner v\. /];

function leaves(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => leaves(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (k === '_averments') continue; // R7
      leaves(x, out);
    }
  }
  return out;
}

/** Every string the model is given by a pack (see file header). */
function modelVisibleStrings(pack: Pack): string[] {
  return [
    ...leaves(pack.prompt_context),
    ...leaves(pack.mandatory_clauses),
    ...leaves(pack.mandatoryClauses),
    ...leaves(pack.relevantActs),
    ...leaves(pack.prayerTemplate),
    ...leaves(pack.verificationTemplate),
    ...leaves(pack.promptInstructions),
  ];
}

/** Returns one line per judgment-name hit, empty when the pack is clean. */
function findJudgmentNames(pack: Pack): string[] {
  const hits: string[] = [];
  const derived = derivedRegexes(pack);
  for (const s of modelVisibleStrings(pack)) {
    for (const d of [...DENYLIST, ...derived]) if (d.test(s)) hits.push(`${d}: ${s.slice(0, 120)}`);
    if (ALLOWED.some((a) => a.test(s))) continue;
    for (const [label, re] of GENERIC) if (re.test(s)) hits.push(`${label}: ${s.slice(0, 120)}`);
  }
  return hits;
}

// ── S: once per pack, last promptInstructions entry (AC1, R3) ───────────────

describe('T-448: S is in the pack once, as the last promptInstructions entry', () => {
  it('S in this file carries the U+2014 dash', () => {
    expect(S).toContain('—');
    expect(S).not.toContain('Authority - add');
  });

  it.each(PACKS)(
    '%s: exactly once in the file, last entry of prompt_context.promptInstructions',
    (id) => {
      const p = load(id);
      expect(count(JSON.stringify(p), S)).toBe(1);
      const ins: string[] = p.prompt_context.promptInstructions;
      expect(Array.isArray(ins)).toBe(true);
      expect(ins[ins.length - 1]).toBe(S);
      expect(ins.filter((e) => e === S)).toHaveLength(1);
    },
  );

  it('prompt_context.promptInstructions is the last key of prompt_context for the three packs that had no list', () => {
    for (const id of HAD_NO_PROTOCOL) {
      const keys = Object.keys(load(id).prompt_context);
      expect(keys[keys.length - 1]).toBe('promptInstructions');
      expect(load(id).prompt_context.promptInstructions).toEqual([S]);
    }
  });

  it.each(PACKS)(
    '%s: no top-level promptInstructions (it would replace the other prompt parts)',
    (id) => {
      expect(load(id).promptInstructions).toBeUndefined();
    },
  );
});

// ── S reaches the model through the real assembler ──────────────────────────

describe('T-448: S reaches the model through prompt-assembler, last in "Specific instructions"', () => {
  it.each(PACKS)('%s: buildDocTypeSection ends its instruction list with S, once', (id) => {
    const rule = _testing.loadDocRule(id)!;
    expect(rule).not.toBeNull();
    const section = _testing.buildDocTypeSection(rule);
    expect(section).toContain('Specific instructions:');
    const lines = section.split('\n').filter((l) => l.length > 0);
    expect(lines[lines.length - 1]).toMatch(/^\d+\. /);
    expect(lines[lines.length - 1].replace(/^\d+\. /, '')).toBe(S);
    expect(count(section, S)).toBe(1);
  });

  it.each(PACKS)(
    '%s: assemblePrompt systemPrompt contains S exactly once and no denylisted name',
    async (id) => {
      const input = {
        docType: id,
        courtName: 'High Court of Delhi',
        courtType: 'high_court',
        partyDetails: { petitioner: 'A Kumar', respondent: 'B Kumar' },
        keyFacts: 'The petitioner challenges an order.',
        reliefPrayer: 'Quash the order.',
        advocateName: 'X',
      } as unknown as PromptInput;
      const { systemPrompt, docRule } = await assemblePrompt(input);
      expect(docRule).not.toBeNull();
      expect(count(systemPrompt, S)).toBe(1);
      for (const d of [...DENYLIST, ...derivedRegexes(load(id))])
        expect(systemPrompt).not.toMatch(d);
    },
  );

  it.each(PACKS)('%s: the instruction text the assembler builds has no judgment name', (id) => {
    const rule = _testing.loadDocRule(id)!;
    const text = _testing.buildDocTypeSection(rule) + _testing.buildStatutoryContext(rule);
    for (const d of [...DENYLIST, ...derivedRegexes(load(id))]) expect(text).not.toMatch(d);
    for (const [label, re] of GENERIC) {
      const offending = text
        .split('\n')
        .filter((l) => re.test(l) && !ALLOWED.some((a) => a.test(l.replace(/^\s*-\s*/, ''))));
      expect({ label, offending }).toEqual({ label, offending: [] });
    }
  });
});

// ── No judgment name in model-visible text (AC2, AC4) ───────────────────────

describe('T-448: no judgment name in any model-visible field (R1, R2, R4)', () => {
  it.each(PACKS)('%s: denylist and citation patterns find nothing', (id) => {
    expect(findJudgmentNames(load(id))).toEqual([]);
  });

  it('the scan sees text in each field family (guards against scanning nothing)', () => {
    const civil = modelVisibleStrings(load('writ_petition_civil'));
    expect(civil.length).toBeGreaterThan(40);
    expect(civil.some((s) => /Article 21/.test(s))).toBe(true); // relevantActs / instructions
    for (const id of PACKS) {
      const p = load(id);
      expect(modelVisibleStrings(p)).toEqual(expect.arrayContaining([S]));
      expect(leaves(p.mandatory_clauses).length).toBeGreaterThan(0);
      expect(leaves(p.relevantActs).length).toBeGreaterThan(0);
    }
  });

  it('R4 labels: the plain descriptions replaced the case-name labels, and Bhure Lal Committee stays', () => {
    const pil = JSON.stringify(load('pil').prompt_context);
    // A committee is not a judgment; only the line "(Bhure Lal Committee for vehicular pollution)" stays.
    expect(pil).toContain('Bhure Lal Committee for vehicular pollution');
    expect(JSON.stringify(load('pil').mandatory_clauses)).toContain(
      'Per the mandatory PIL disclosure guidelines',
    );
    const civil = JSON.stringify(load('writ_petition_civil').mandatory_clauses);
    expect(civil).toContain('Exceptions to the alternative-remedy bar');
  });
});

// ── Derived denylist (key_citations / key_precedents) ───────────────────────

describe('T-448: names derived from key_citations / key_precedents are absent from model-visible text', () => {
  const HAS_SOURCE = PACKS.filter((id) => id !== 'mandamus'); // mandamus has neither field

  it.each(HAS_SOURCE)('%s: the derived list is non-empty', (id) => {
    expect(derivedPartyNames(load(id)).length).toBeGreaterThan(4);
  });

  it('mandamus has no key_citations / key_precedents, so nothing is derived (hand denylist covers it)', () => {
    const p = load('mandamus');
    expect(p.key_citations).toBeUndefined();
    expect(p.key_precedents).toBeUndefined();
    expect(derivedPartyNames(p)).toEqual([]);
  });

  it('derivation picks up the names the hand list missed, and skips generic party names', () => {
    const all = PACKS.flatMap((id) => derivedPartyNames(load(id)));
    for (const n of [
      'Hari Vishnu Kamath',
      'Surya Dev Rai',
      'Govinda Rao',
      'Tulsiram Patel',
      'Royappa',
      'Nakara',
      'Vineet Narain',
      'Kamdhenu Cattle Feed',
      'Tilokchand Motichand',
      'Food Corp of India',
      'Om Kumar',
      'Olga Tellis',
      'Bandhua Mukti Morcha',
    ]) {
      expect(all.some((x) => x.includes(n))).toBe(true);
    }
    for (const g of [
      'Union of India',
      'State of WB',
      'State of MP',
      'State of Bihar',
      'BMC',
      'PNB',
      'Commissioner of Police',
      'Supt of Police',
      'Registrar of Trade Marks',
      'Chief District Medical Officer',
    ]) {
      expect(all).not.toContain(g);
    }
    expect(all.some((x) => /\b(v\.|SCC|AIR)\b|\(\d{4}\)/.test(x))).toBe(false); // reporter tails stripped
  });

  it.each(HAS_SOURCE)('%s: no derived party name appears in any model-visible field', (id) => {
    const p = load(id);
    const found: string[] = [];
    for (const s of modelVisibleStrings(p)) {
      for (const re of derivedRegexes(p)) if (re.test(s)) found.push(`${re}: ${s.slice(0, 100)}`);
    }
    expect(found).toEqual([]);
  });
});

// ── Preserved propositions (round 1 deleted two; R1 keeps the proposition) ──

describe('T-448: propositions kept word for word after the name was removed (R1, R5)', () => {
  const instr = (id: string): string[] => load(id).prompt_context.promptInstructions;
  const visible = (id: string) => modelVisibleStrings(load(id)).join('\n');

  it('civil keeps the legitimate expectation and proportionality lines, in place', () => {
    const ins = instr('writ_petition_civil');
    const a = ins.indexOf('Doctrine of legitimate expectation.');
    const b = ins.indexOf('Doctrine of proportionality.');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBe(a + 1);
    expect(ins[a - 1]).toMatch(/^Para 10:/);
    expect(ins[b + 1]).toMatch(/^Where service matter/);
  });

  it('civil Para 10 says irrationality (no reasonable authority could have so decided)', () => {
    const para10 = instr('writ_petition_civil').find((e) => e.startsWith('Para 10:'))!;
    expect(para10).toContain('irrationality (no reasonable authority could have so decided)');
  });

  it('civil: the livelihood / human dignity cite-only line stays deleted (R2)', () => {
    const v = visible('writ_petition_civil');
    expect(v).not.toMatch(/livelihood/i);
    expect(v).not.toMatch(/human dignity/i);
  });

  it('cat_oa Para 15 says proportionality (irrationality standard)', () => {
    expect(visible('cat_oa')).toContain('proportionality (irrationality standard)');
  });

  it('certiorari system_role keeps "These are the classical grounds."', () => {
    const sr: string = load('certiorari').prompt_context.system_role;
    expect(sr).toContain('(4) fraud on the court. These are the classical grounds.');
  });

  it('quo_warranto system_role keeps "(1) is the test for public office."', () => {
    const sr: string = load('quo_warranto').prompt_context.system_role;
    expect(sr).toContain(
      '(3) the office is permanent in nature. (1) is the test for public office.',
    );
  });

  it.each(PACKS)('%s: "Wednesbury" is in no model-visible field', (id) => {
    expect(visible(id)).not.toMatch(/Wednesbury/i);
    expect(JSON.stringify(load(id).prompt_context)).not.toMatch(/Wednesbury/i);
    expect(JSON.stringify(load(id).mandatory_clauses ?? [])).not.toMatch(/Wednesbury/i);
  });
});

// ── Mutation check: the scan must fail when a name is put back ──────────────

describe('T-448: mutation check (in-memory clones; the pack JSON is never written)', () => {
  const clone = (id: string): Pack => JSON.parse(JSON.stringify(load(id)));

  it('the unmutated packs are clean (baseline)', () => {
    for (const id of PACKS) expect(findJudgmentNames(clone(id))).toEqual([]);
  });

  const MUTATIONS: Array<[string, string, (p: Pack) => void]> = [
    [
      'civil: promptInstructions gets Maneka Gandhi back',
      'writ_petition_civil',
      (p) => p.prompt_context.promptInstructions.unshift('Para 9: Article 21 per Maneka Gandhi.'),
    ],
    [
      'civil: clause description gets Whirlpool back',
      'writ_petition_civil',
      (p) => {
        p.mandatory_clauses[0].description = 'Whirlpool exceptions';
      },
    ],
    [
      'criminal: relevantActs description gets D.K. Basu back',
      'writ_petition_criminal',
      (p) => {
        p.relevantActs[0].sections = [
          { number: '21', description: 'basis for D.K. Basu doctrines' },
        ];
      },
    ],
    [
      'pil: instruction gets Balwant Singh Chaufal back',
      'pil',
      (p) => p.prompt_context.promptInstructions.push('Per Balwant Singh Chaufal guidelines'),
    ],
    [
      'certiorari: system_role gets a reporter citation back',
      'certiorari',
      (p) => {
        p.prompt_context.system_role += ' Cite Foo v. Bar (1997) 7 SCC 622.';
      },
    ],
    [
      'mandamus: must_cite gets Mansukhlal back',
      'mandamus',
      (p) =>
        p.prompt_context.must_cite.push('Mansukhlal Vithaldas Chauhan - conditions for mandamus'),
    ],
    [
      'quo_warranto: bare "per <Name>" in system_role',
      'quo_warranto',
      (p) => {
        p.prompt_context.system_role += ' Held per Smith.';
      },
    ],
    [
      'certiorari: bare "Surya Dev Rai" (no v., no reporter) in system_role',
      'certiorari',
      (p) => {
        p.prompt_context.system_role += ' Surya Dev Rai allows this.';
      },
    ],
    [
      'quo_warranto: bare "Govinda Rao" in an instruction',
      'quo_warranto',
      (p) => p.prompt_context.promptInstructions.unshift('Test for office is that of Govinda Rao.'),
    ],
    [
      'cat_oa: bare "Tulsiram Patel" in an instruction',
      'cat_oa',
      (p) => p.prompt_context.promptInstructions.unshift('Natural justice, Tulsiram Patel.'),
    ],
    [
      'civil: bare "Om Kumar" in an instruction',
      'writ_petition_civil',
      (p) => p.prompt_context.promptInstructions.unshift('Proportionality as in Om Kumar'),
    ],
    [
      'cat_oa: prayerTemplate gets Wednesbury back',
      'cat_oa',
      (p) => {
        p.prayerTemplate = `${p.prayerTemplate ?? ''} quash as Wednesbury unreasonable`;
      },
    ],
  ];

  it.each(MUTATIONS)('%s: the scan reports a hit', (_name, id, mutate) => {
    const p = clone(id);
    mutate(p);
    expect(findJudgmentNames(p).length).toBeGreaterThan(0);
  });

  it('the bare "Surya Dev Rai" mutation is caught by the derived list alone (hand list and generic shapes miss it)', () => {
    const p = clone('certiorari');
    p.prompt_context.system_role += ' Surya Dev Rai allows this.';
    expect(DENYLIST.some((d) => d.test('Surya Dev Rai'))).toBe(false);
    expect(GENERIC.some(([, re]) => re.test(' Surya Dev Rai allows this.'))).toBe(false);
    expect(findJudgmentNames(p).some((h) => /Surya/.test(h))).toBe(true);
  });

  it('names in key_citations, key_precedents, _meta and _averments are not model-visible (R6, R7) and are not scanned', () => {
    const p = clone('writ_petition_civil');
    p.key_citations = [{ case: 'Maneka Gandhi v. Union of India (1978) 1 SCC 248' }];
    p.key_precedents = ['Whirlpool v. Registrar (1998) 8 SCC 1'];
    p._meta.review_notes = 'Wednesbury; Nilabati Behera';
    p.prompt_context._averments = { ban: ['Maneka Gandhi'] };
    expect(findJudgmentNames(p)).toEqual([]);
  });
});

// ── R6: _meta.change_protocol ───────────────────────────────────────────────

describe('T-448: _meta.change_protocol (R6)', () => {
  it.each(HAD_MANDATORY_PROTOCOL)('%s: change_protocol is exactly the signed sentence', (id) => {
    expect(load(id)._meta.change_protocol).toBe(CHANGE_PROTOCOL);
  });

  // The diff did not touch these: they never had a change_protocol, so nothing made a cite MANDATORY.
  it.each(HAD_NO_PROTOCOL)('%s: has no change_protocol, so none says a cite is mandatory', (id) => {
    expect(load(id)._meta.change_protocol).toBeUndefined();
  });

  it.each(PACKS)('%s: no _meta field says a citation is mandatory', (id) => {
    expect(JSON.stringify(load(id)._meta)).not.toMatch(/cites? mandatory/i);
  });

  it('mandamus _meta.review_notes still names Mansukhlal (R6 leaves _meta alone)', () => {
    expect(load('mandamus')._meta.review_notes).toContain('Mansukhlal');
  });

  it.each(PACKS)('%s: key_citations / key_precedents were left alone where present (R6)', (id) => {
    const p = load(id);
    if (['certiorari', 'quo_warranto'].includes(id)) {
      expect(p.key_precedents).toBeDefined();
    } else if (id !== 'mandamus') {
      expect(p.key_citations).toBeDefined();
    }
  });
});

// ── R6 / R7: the untouched fields are pinned by hash ────────────────────────
// sha256 of JSON.stringify(field) taken from the working-tree packs on 15 Oct 2026. A missing field
// hashes as `null` (74234e98...). None of the seven packs holds a pack-level _averments (the ban
// lists live outside the pack file), so that hash pins its continued absence.
const sha = (x: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(x === undefined ? null : x))
    .digest('hex');
const NULL = '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b';
const PINNED: Record<string, { kc: string; kp: string; av: string; rn?: string }> = {
  writ_petition_civil: {
    kc: 'f095f26dc96387fe0f1dd76c8dc2d62c4d514105b18e202e7c4bdabf6099646f',
    kp: NULL,
    av: NULL,
  },
  writ_petition_criminal: {
    kc: '2dc9c7be80abc4410f1088a9013239e0e061e8018c1f81966db9e639bd9bf6e7',
    kp: NULL,
    av: NULL,
  },
  pil: {
    kc: '70799a1859bc14b4b54fadbb6a0d0cd96eaaaec905816fbdb230db75654d4b92',
    kp: NULL,
    av: NULL,
  },
  certiorari: {
    kc: NULL,
    kp: '54512e55a86d065a60572c61c6cf241ae196ada93ed661f2b07aca3a4eab23a2',
    av: NULL,
  },
  mandamus: {
    kc: NULL,
    kp: NULL,
    av: NULL,
    rn: 'f219f9653f58a2b64fcec6c3c07ab2d9e1a755bf4034cf8f77447d89c5531972',
  },
  quo_warranto: {
    kc: NULL,
    kp: 'cd272d455552008a0095812c0e281845792617d85a6c10508f4369229b27d36f',
    av: NULL,
  },
  cat_oa: {
    kc: '4d0bad139bf6852a68eda258915998287ed1c16384d638445882db5232cf0120',
    kp: NULL,
    av: NULL,
  },
};

describe('T-448: key_citations, key_precedents, _averments (and mandamus review_notes) are byte-for-byte unchanged (R6, R7)', () => {
  it.each(PACKS)('%s: hashes match', (id) => {
    const p = load(id);
    const want = PINNED[id];
    expect(sha(p.key_citations)).toBe(want.kc);
    expect(sha(p.key_precedents)).toBe(want.kp);
    expect(sha(p._averments)).toBe(want.av);
    expect(sha(p.prompt_context._averments)).toBe(want.av);
    if (want.rn) expect(sha(p._meta.review_notes)).toBe(want.rn);
  });
});
