/**
 * T-449 (Ajay, T-441): the civil and family packs name no judgment in any text
 * the model is given. LEGAL CONTENT.
 *
 * What these tests read: the 27 rule-pack JSON files exactly as shipped. The
 * model-visible text is every string in a pack except the sections that never
 * reach a prompt (see HIDDEN). The name list is derived from the key_citations
 * and key_precedents of ALL packs, so a judgment added to any pack's own list
 * is caught if it is then quoted in a prompt.
 *
 * Deliberately NOT asserted: key_citations, key_precedents, validation_rules,
 * filing_checklist, form_schema (T-451 labels) and _meta, except the pins below.
 */
import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { buildDrafterUserPrompt, DrafterBrief } from '../services/brief-drafter';
import { loadRulePack, readDraftingInstructionList } from '../services/rule-pack.service';

const RULES_DIR = join(__dirname, '..', 'config', 'document-rules');

/** The 27 packs T-449 edits. */
const PACKS = [
  'affidavit_in_support',
  'amendment_of_pleadings',
  'condonation_of_delay',
  'divorce_hma',
  'divorce_mutual_consent',
  'dv_act_complaint',
  'guardianship_petition',
  'ibc_application',
  'interim_application',
  'itat_appeal',
  'legal_notice_copyright_infringement',
  'mact_claim',
  'maintenance_bnss_144',
  'plaint_declaration',
  'plaint_eviction',
  'plaint_partition',
  'plaint_recovery',
  'plaint_specific_performance',
  'posh_complaint',
  'production_of_documents',
  'rcr_petition',
  'receiver_appointment',
  'rejoinder_affidavit',
  'replication',
  'rera_complaint',
  'restoration_application',
  'written_statement',
] as const;

/** R3: the one sentence every pack ends its instructions with. */
const S =
  'Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].';

type Json = Record<string, unknown>;

const readPack = (id: string): Json =>
  JSON.parse(readFileSync(join(RULES_DIR, `${id}.json`), 'utf8')) as Json;

/** Sections that never reach a prompt (or are left alone on purpose by T-449). */
const HIDDEN = new Set([
  '_meta',
  'key_citations',
  'key_precedents',
  'validation_rules',
  'filing_checklist',
  'filingChecklist',
  'form_schema', // T-451 owns the form labels
]);

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v !== null && typeof v === 'object') {
    Object.values(v as Json).forEach((x) => strings(x, out));
  }
  return out;
}

/** Every string the model can be given from this pack. */
function visibleStrings(pack: Json): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(pack)) {
    if (!HIDDEN.has(k)) strings(v, out);
  }
  return out;
}

// ── Detecting a judgment name ───────────────────────────────────────────────

/** Parties too generic to be a judgment name on their own. */
const GENERIC_PARTY =
  /^(State\b|Union of India|Collector|Commissioner|District Magistrate|Delhi Administration|National Commission|Special Land|Managing Committee|Chief District|Postmaster|CBI$|NIA$|RBI$|PNB$|MCD$|CIT$|ACIT$|DTC$|UoI$)/;

/** A person's name that is also a placeholder in the pack text; not a judgment. */
const NOT_A_JUDGMENT = new Set(['Ashok Kumar', 'Raj Kumar', 'Ajay Kumar', 'Vinod Kumar']);

/**
 * Judgments the pre-T-449 packs quoted, including shorthand that the
 * key_citations lists do not spell out (taken from the T-449 diff). They keep
 * the detector honest where a list entry is a longer form of the name.
 */
const KNOWN_QUOTED = [
  'Vishaka',
  'Newtech',
  'Eastern Book',
  'Gita Hariharan',
  'Githa Hariharan',
  'Rajnesh',
  'Aftab Singh',
  'Chand Rani',
  'Saradamani',
  'Manmohan Singh',
  'Anant Construction',
  'SCG Contracts',
  'Badat',
  'Kalra',
  'Pundlik',
  'Rafiq',
  'Lipok',
  'Katiji',
  'Pioneer Urban',
  'Mobilox',
  'Innoventive',
  'Swiss Ribbons',
  'Sarla Verma',
  'Pranay Sethi',
  'Dalpat Kumar',
  'Harsora',
  'Satish Chander Ahuja',
  'Vineeta Sharma',
  'Patil Automation',
  'Anathula',
  'Beemaiah',
  'Amardeep Singh',
  'Saroj Rani',
  'Swaran Singh',
  'Gaurav Nagpal',
  'Ruchi Majoo',
  'Pepsi Foods',
  'GKN Driveshafts',
  'Mst. Katiji',
  'Naveen Kohli',
  'Samar Ghosh',
];

function partyNames(entry: string): string[] {
  const head = entry
    .replace(/\s+—.*$/, '')
    .replace(/\s*\(.*$/, '')
    .replace(/\s+(AIR|SCC|SCR)\b.*$/, '');
  return head.split(/\s+v\.?s?\.?\s+/).map((s) => s.trim());
}

function variants(name: string): string[] {
  const out = [name];
  const words = name.split(/\s+/);
  // "Hiral P. Harsora" is also quoted as "Hiral Harsora" or "Harsora".
  const noInitials = words.filter((w) => !/^[A-Z]\.?$/.test(w) && !/^[A-Z](\.[A-Z])+\.?$/.test(w));
  if (noInitials.length >= 2) out.push(noInitials.join(' '));
  return out;
}

/** Every judgment name in any pack's key_citations or key_precedents. */
function derivedNames(): string[] {
  const names = new Set<string>();
  for (const f of readdirSync(RULES_DIR).filter((x) => x.endsWith('.json'))) {
    const pack = JSON.parse(readFileSync(join(RULES_DIR, f), 'utf8')) as Json;
    const entries: string[] = [];
    for (const c of (pack.key_citations as unknown[]) ?? []) entries.push(String(c));
    for (const p of (pack.key_precedents as { case?: unknown }[]) ?? []) {
      entries.push(String(p.case ?? ''));
    }
    for (const e of entries) {
      for (const party of partyNames(e)) {
        if (party === '' || GENERIC_PARTY.test(party) || NOT_A_JUDGMENT.has(party)) continue;
        // One short word is a first name or a surname: too ambiguous to search for.
        if (!/\s/.test(party) && party.length < 8) continue;
        for (const v of variants(party)) {
          if (v.length >= 7 && !NOT_A_JUDGMENT.has(v)) names.add(v);
        }
      }
    }
  }
  return [...names];
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Reporter citations: SCC, AIR, SCR, Crl, ILR, MANU, ITR, DLT, "(2019) 5 SCC ...". */
const CITATION =
  /\b(?:SCC|SCR|ILR|MANU|DLT|SCALE|Supp)\b|\bAIR\s+(?:\d{4}|SC|[A-Z][a-z]{1,4}\b)|\bCrl\.?\s*(?:L\.?J|App)|\(\d{4}\)\s*\d+\s+[A-Z]{2,}|\b\d+\s+ITR\b|\bITR\s+\d+/;

/** "X v. Y" / "X vs Y" between capitalised words. */
const VERSUS = /\b[A-Z][\w.&'’()-]*(?:\s+[A-Z][\w.&'’()-]*)*\s+(?:v\.?|vs\.?)\s+[A-Z]/;

/** Role words, not names: "Applicant v. Non-applicant" and the like are not judgments. */
const ROLE_VS =
  /\b(?:Applicant|Petitioner|Plaintiff|Appellant|Complainant|Claimant|Informant|Landlord|Tenant|Husband|Wife|Insurer|Owner|Promoter|Allottee)s?\s+(?:v\.?|vs\.?)\s+(?:Non-applicant|Respondent|Defendant|Opposite|Accused|Insurer|Owner|Promoter|Allottee|Tenant|Landlord|Wife|Husband)/gi;

function judgmentHits(text: string, names: string[]): string[] {
  const hits: string[] = [];
  for (const n of names) {
    if (new RegExp(`(?<![\\w])${escapeRe(n)}(?![\\w])`).test(text)) hits.push(`name: ${n}`);
  }
  // Role pairs and two-letter abbreviations ("FC vs OC") are not judgments.
  const cleaned = text
    .replace(ROLE_VS, ' ')
    // "Promised vs Actual Possession" is a heading about possession, not a case.
    .replace(/\bPromised vs Actual\b/g, ' ')
    .replace(/\b[A-Z]{1,3}\s+vs\.?\s+[A-Z]{1,3}\b/g, ' ');
  const c = CITATION.exec(cleaned);
  if (c) hits.push(`citation: ${c[0]}`);
  const v = VERSUS.exec(cleaned);
  if (v) hits.push(`versus: ${v[0]}`);
  return hits;
}

/**
 * A snake_case clause id reaches the model (clauseLines prints it first). Read
 * "vineeta_sharma_paragraph" as "vineeta sharma paragraph" against the names.
 */
function idHits(id: string, names: string[]): string[] {
  if (!/^[a-z0-9]+(_[a-z0-9]+)+$/.test(id)) return [];
  const spaced = id.replace(/_/g, ' ');
  return names
    .filter((n) => new RegExp(`(?<![\\w])${escapeRe(n)}(?![\\w])`, 'i').test(spaced))
    .map((n) => `id: ${n}`);
}

/** Every clause id the pack hands the model. */
function clauseIds(pack: Json): string[] {
  const out: string[] = [];
  for (const k of ['mandatory_clauses', 'mandatoryClauses']) {
    const list = pack[k];
    if (!Array.isArray(list)) continue;
    for (const c of list) {
      if (c !== null && typeof c === 'object') {
        for (const key of ['id', 'clause_id']) {
          const v = (c as Json)[key];
          if (typeof v === 'string') out.push(v);
        }
      }
    }
  }
  return out;
}

// ── (a) no judgment name in model-visible text ──────────────────────────────

describe('T-449 (a): no judgment name in model-visible text', () => {
  const names = [...new Set([...derivedNames(), ...KNOWN_QUOTED])];

  it('the name list is real, not empty (derived from every pack)', () => {
    expect(derivedNames().length).toBeGreaterThan(300);
    for (const n of ['Mobilox Innovations Pvt Ltd', 'Sarla Verma', 'Vineeta Sharma']) {
      expect(names).toContain(n);
    }
  });

  it('the detector catches the pre-T-449 phrasings (not tautological)', () => {
    const planted = [
      'Cite Innoventive Industries Ltd v. ICICI Bank (2018) 1 SCC 407 — IBC overrides',
      'apply MULTIPLIER METHOD per Sarla Verma v. DTC (2009) 6 SCC 121',
      'Satish Chander Ahuja v. Sneha Ahuja applies',
      'Cite: Beemaiah v. Govindappa',
      'the SC held in Rafiq v. Munshilal AIR 1981 SC 1400',
      'Cite Pepsi Foods Ltd v. ACIT',
      'ruling of Hiral Harsora',
      'Lineage to Vishaka',
      'Cite Mannalal Khetan v. Kedar Nath Khetan',
    ];
    for (const p of planted) expect(judgmentHits(p, names)).not.toEqual([]);
  });

  it('the id check catches a judgment-named snake_case id and leaves plain ids alone', () => {
    expect(idHits('vineeta_sharma_paragraph', names)).not.toEqual([]);
    expect(idHits('mobilox_pre_existing_dispute', names)).not.toEqual([]);
    expect(idHits('daughter_coparcener_paragraph', names)).toEqual([]);
    expect(idHits('prayer', names)).toEqual([]);
  });

  it.each(PACKS)('%s: no clause id names a judgment', (id) => {
    const found = clauseIds(readPack(id)).flatMap((c) =>
      idHits(c, names).map((h) => `${h} <- ${c}`),
    );
    expect(found).toEqual([]);
  });

  it('plaint_partition clause id is daughter_coparcener_paragraph and the old id is gone', () => {
    const ids = clauseIds(readPack('plaint_partition'));
    expect(ids).toContain('daughter_coparcener_paragraph');
    expect(ids).not.toContain('vineeta_sharma_paragraph');
  });

  it('the detector leaves the legitimate wording alone', () => {
    const fine = [
      'Applicant v. Non-applicant',
      'Petitioner vs. Respondent',
      'Proviso constitutional; due diligence test affirmed.',
      'Do NOT mix sources within a paragraph.',
      'Order VIII R.1 — file WS within 30 days; Section 16 of the Act.',
    ];
    for (const p of fine) expect(judgmentHits(p, names)).toEqual([]);
  });

  it.each(PACKS)('%s: names no judgment in any model-visible string', (id) => {
    const found: string[] = [];
    for (const s of visibleStrings(readPack(id))) {
      for (const h of judgmentHits(s, names)) found.push(`${h}  <-  ${s.slice(0, 120)}`);
    }
    expect(found).toEqual([]);
  });

  it('only the sections listed as hidden are skipped', () => {
    const skipped = new Set<string>();
    for (const id of PACKS) {
      for (const k of Object.keys(readPack(id))) if (HIDDEN.has(k)) skipped.add(k);
    }
    expect([...skipped].sort()).toEqual(
      [
        '_meta',
        'filingChecklist',
        'filing_checklist',
        'form_schema',
        'key_citations',
        'key_precedents',
        'validation_rules',
      ].sort(),
    );
  });
});

// ── (b) S is the last promptInstructions entry, exactly once ────────────────

/** The instruction list a pack carries: top-level, or inside prompt_context. */
const THREE_NO_TOP_LEVEL = [
  'rejoinder_affidavit',
  'restoration_application',
  'interim_application',
];

function instructionList(pack: Json, id: string): unknown[] {
  if (THREE_NO_TOP_LEVEL.includes(id)) {
    return (pack.prompt_context as Json).promptInstructions as unknown[];
  }
  if (Array.isArray(pack.promptInstructions)) return pack.promptInstructions;
  return (pack.prompt_context as Json).promptInstructions as unknown[];
}

describe('T-449 (b): the no-judgment sentence S is last, once', () => {
  it.each(PACKS)('%s: S is the last promptInstructions entry and appears once', (id) => {
    const pack = readPack(id);
    const list = instructionList(pack, id);
    expect(Array.isArray(list)).toBe(true);
    expect(list[list.length - 1]).toBe(S);
    expect(list.filter((x) => x === S)).toHaveLength(1);
    // And nowhere else in the model-visible text.
    const all = visibleStrings(pack).filter((s) => s.includes('Do not name any judgment'));
    expect(all).toEqual([S]);
  });

  it.each(THREE_NO_TOP_LEVEL)(
    '%s: S is prompt_context.promptInstructions = [S], the last key, and no top-level array was added',
    (id) => {
      const pack = readPack(id);
      const pc = pack.prompt_context as Json;
      expect(pc.promptInstructions).toEqual([S]);
      const keys = Object.keys(pc);
      expect(keys[keys.length - 1]).toBe('promptInstructions');
      expect(pack).not.toHaveProperty('promptInstructions');
    },
  );
});

// ── (c) change_protocol (R6) ────────────────────────────────────────────────

const R6 = 'Do not name judgments in model-visible text (Ajay, T-441).';

function protocol(id: string): string {
  const meta = readPack(id)._meta as Json | undefined;
  return String(meta?.change_protocol ?? '');
}

describe('T-449 (c): change_protocol no longer makes a citation mandatory', () => {
  it.each(['posh_complaint', 'ibc_application', 'rera_complaint', 'mact_claim'])(
    '%s: change_protocol is the CLO sign-off sentence, then the exact R6 sentence',
    (id) => {
      expect(protocol(id)).toBe(`All edits require CLO sign-off. ${R6}`);
    },
  );

  it('no pack of the 27 has a change_protocol that makes a citation mandatory', () => {
    const offenders = PACKS.filter((id) => {
      const p = protocol(id);
      return /mandatory/i.test(p) && /\bcit(e|es|ation|ations)\b/i.test(p);
    });
    expect(offenders).toEqual([]);
  });

  it('plaint_declaration and plaint_partition keep their original change_protocol (pending Ajay)', () => {
    expect(protocol('plaint_declaration')).toBe(
      'All edits require CLO sign-off. Consequential relief paragraph is non-negotiable per Anathula Sudhakar.',
    );
    expect(protocol('plaint_partition')).toBe(
      'All edits require CLO sign-off. Vineeta Sharma (2020) coparcenary equality and HSA 2005 framework are non-negotiable.',
    );
  });
});

// ── (d) key_citations / key_precedents untouched (R6) ───────────────────────

const sha = (s: string | Buffer): string =>
  createHash('sha256').update(s).digest('hex').slice(0, 16);

/** [key, entry count, sha256/16 of JSON.stringify(list)] taken from origin/develop_staging. */
const LISTS_AT_BASE: Record<string, [string, number, string]> = {
  amendment_of_pleadings: ['key_citations', 7, '6779f78553a12607'],
  condonation_of_delay: ['key_citations', 7, '2a058210781dcbe1'],
  divorce_hma: ['key_citations', 4, '754dd5de00ddf165'],
  divorce_mutual_consent: ['key_citations', 4, '7c587809afa9a577'],
  dv_act_complaint: ['key_citations', 8, 'e6a2c1070bee225f'],
  guardianship_petition: ['key_citations', 7, '82287e981a411247'],
  ibc_application: ['key_citations', 9, 'c9527d983ed6960a'],
  interim_application: ['key_precedents', 4, '9f3405b9d60f3bec'],
  itat_appeal: ['key_citations', 7, '1856d8253da9e9ac'],
  mact_claim: ['key_citations', 11, 'ada89a35f3f185c9'],
  maintenance_bnss_144: ['key_citations', 5, '5456e0afd396f0f7'],
  plaint_declaration: ['key_citations', 5, '4acea2a3c456403f'],
  plaint_eviction: ['key_citations', 7, '0199034bd322a3f6'],
  plaint_partition: ['key_citations', 7, 'f8a53737c639c4b3'],
  plaint_recovery: ['key_citations', 6, '6b7747e8d2c2ddda'],
  plaint_specific_performance: ['key_citations', 8, 'd62a4616bbee4a86'],
  posh_complaint: ['key_citations', 6, '966cd77cb157c885'],
  production_of_documents: ['key_citations', 6, '6f0921d93aa10764'],
  rcr_petition: ['key_citations', 3, '7f9c2b5ad6d055cf'],
  receiver_appointment: ['key_citations', 5, '95492afcf890219c'],
  replication: ['key_citations', 5, '80175e6a9267237b'],
  rera_complaint: ['key_citations', 7, '624b7c9c28aa029e'],
  written_statement: ['key_citations', 7, '83dc004d4fd9a412'],
};

describe('T-449 (d): key_citations and key_precedents are unchanged', () => {
  it.each(Object.keys(LISTS_AT_BASE))('%s: list is the one on origin/develop_staging', (id) => {
    const [key, count, hash] = LISTS_AT_BASE[id];
    const list = readPack(id)[key] as unknown[];
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(count);
    expect(sha(JSON.stringify(list))).toBe(hash);
  });

  it.each([
    'affidavit_in_support',
    'legal_notice_copyright_infringement',
    'rejoinder_affidavit',
    'restoration_application',
  ])('%s: had no citation list at base and has none now', (id) => {
    const pack = readPack(id);
    expect(pack).not.toHaveProperty('key_citations');
    expect(pack).not.toHaveProperty('key_precedents');
  });
});

// ── (e) _averments untouched (R7) ───────────────────────────────────────────

describe('T-449 (e): document-rules/_averments is unchanged', () => {
  /** sha256/16 of each file's bytes on origin/develop_staging. A signed edit to _averments updates this. */
  const AVERMENTS_AT_BASE: Record<string, string> = {
    'README.md': '0d907ff3f7c397a6',
    '_default.json': '3a2b31cc00742cb2',
    'bail_anticipatory.json': '4173d669e03be93e',
    'bail_before_magistrate.json': '6519fdc6a96efbe0',
    'bail_regular.json': '8ee0a7569fe463b9',
    'default_bail.json': '2e882516bf7c5ad8',
    'interim_bail.json': '8951ebda37020b95',
    'legal_notice_s138.json': 'f85eb9a1a1703826',
    'maintenance_bnss_144.json': 'ad1c2c4ac18b2935',
  };

  it('every file is byte-identical to the base', () => {
    const dir = join(RULES_DIR, '_averments');
    const now: Record<string, string> = {};
    for (const f of readdirSync(dir).sort()) now[f] = sha(readFileSync(join(dir, f)));
    expect(now).toEqual(AVERMENTS_AT_BASE);
  });
});

// ── (f) the propositions survive ────────────────────────────────────────────

describe('T-449 (f): every edited pack parses and the propositions are kept word for word', () => {
  it.each(PACKS)('%s: parses and still has its prompt text', (id) => {
    const pack = readPack(id);
    expect(visibleStrings(pack).join(' ').length).toBeGreaterThan(500);
  });

  const KEPT: [string, string][] = [
    ['mact_claim', 'Para 13: Computation — apply MULTIPLIER METHOD:'],
    ['condonation_of_delay', 'Rejection of mechanical approach to condonation.'],
    [
      'dv_act_complaint',
      'Monetary relief under S.20 — adequate, fair, reasonable, consistent with standard of living to which aggrieved person is accustomed. Include heads: maintenance, medical, loss of earnings, mortgage/rent. Where maintenance or other monetary relief is sought, file an affidavit of assets and liabilities of both parties.',
    ],
    [
      'mact_claim',
      'Multiplier method, with future prospects, personal expenses deduction and conventional heads',
    ],
    [
      'mact_claim',
      '   - Future prospects addition: permanent job — 50% if deceased below 40, 30% if 40-50, 15% if 50-60; self-employed or fixed salary — 40% / 25% / 10% for the same age bands.',
    ],
    [
      'guardianship_petition',
      "Details of father and mother — death/unfitness/incapacity/absence; for Hindu minors per S.6 HMGA father is natural guardian and after him mother, with 'after' read as 'in the absence of'; subject to S.4",
    ],
    [
      'mact_claim',
      '   - Personal expenses deduction: 1/3 (married + dependants), 1/2 (bachelor), graduated by family size.',
    ],
    [
      'mact_claim',
      'Para 15: Pay & Recover — where insurer can plead defence (no license / breach of policy), Tribunal may direct insurer to pay and recover from owner.',
    ],
    [
      'plaint_partition',
      'Daughter is coparcener by birth, irrespective of whether father was alive on 09.09.2005.',
    ],
    [
      'plaint_partition',
      "Para 7: For pre-2005 demises or earlier partitions, plead carefully — the daughter's right under amended S.6 HSA arises by birth and operates retroactively, not retrospectively; a partition by registered deed or court decree before 20.12.2004 is not reopened.",
    ],
    [
      'condonation_of_delay',
      'Length of delay is no matter; acceptability of explanation is sole criterion.',
    ],
    [
      'ibc_application',
      'Para 12: NCLT may exercise discretion at admission stage of S.7 application; not mechanical admission.',
    ],
    ['amendment_of_pleadings', 'Withdrawal of admissions ordinarily not permitted.'],
    [
      'dv_act_complaint',
      'Shared household — right to reside is not limited to households owned/rented by husband.',
    ],
    ['plaint_specific_performance', 'Readiness and willingness must be continuous throughout.'],
    ['rera_complaint', 'Para 12: Where wrongful termination — S.19(6) read with agreement.'],
    [
      'guardianship_petition',
      'Jurisdiction under S.9 GWA — application must be made to District Court (or Family Court) of the place where minor ORDINARILY RESIDES. Not casual residence.',
    ],
  ];

  it.each(KEPT)('%s keeps: %s', (id, text) => {
    expect(visibleStrings(readPack(id))).toContain(text);
  });
});

// ── (g) the REAL reader and prompt assembly keep S last (Ajay, T-449 Q1) ────

describe('T-449 (g): through the real reader, S is the last instruction the model is given', () => {
  it.each(PACKS)('%s: readDraftingInstructionList ends with S, once', (id) => {
    const list = readDraftingInstructionList(readPack(id));
    expect(list[list.length - 1]).toBe(S);
    expect(list.filter((x) => x === S)).toHaveLength(1);
  });

  it.each(PACKS)('%s: the assembled drafter prompt lists S as its last INSTRUCTIONS line', (id) => {
    const pack = loadRulePack(id);
    expect(pack).not.toBeNull();
    if (pack === null) return;
    const prompt = buildDrafterUserPrompt({
      pack,
      brief: { described: null } as unknown as DrafterBrief,
      systemParts: [],
      courtRules: [],
      target: 10,
      language: 'en',
    });
    const m = /\nINSTRUCTIONS:\n([\s\S]*?)\n\n?ACTS:/.exec(prompt);
    expect(m).not.toBeNull();
    const lines = (m?.[1] ?? '').split('\n').filter((l) => l.startsWith('- '));
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[lines.length - 1]).toBe(`- ${S}`);
    expect(lines.filter((l) => l === `- ${S}`)).toHaveLength(1);
  });
});

describe('T-449 round 2: exact strings', () => {
  it('condonation_of_delay no longer carries "Fifteen principles" in model-visible text', () => {
    expect(visibleStrings(readPack('condonation_of_delay')).join('\n')).not.toMatch(
      /Fifteen principles/,
    );
  });

  it('ibc_application clause name is "No Pre-existing Dispute (S.9)"', () => {
    const clauses = readPack('ibc_application').mandatory_clauses as { name?: string }[];
    expect(clauses.map((c) => c.name)).toContain('No Pre-existing Dispute (S.9)');
    expect(JSON.stringify(visibleStrings(readPack('ibc_application')))).not.toMatch(/Mobilox/);
  });

  it('plaint_recovery validation_rules[11] (user-facing, not model-visible) keeps its citation', () => {
    const rules = readPack('plaint_recovery').validation_rules as unknown[];
    expect(rules[11]).toBe(
      'pre_institution_mediation must be true for a commercial suit, unless urgent interim relief is sought (S.12A Commercial Courts Act, 2015; Patil Automation)',
    );
  });
});
