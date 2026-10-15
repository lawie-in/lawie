/**
 * T-450 (Ajay, T-441 / T-245 Addendum 8): the deeds and agreements packs name
 * no judgment in any text the model is given. LEGAL CONTENT.
 *
 * What these tests read: the 19 rule-pack JSON files exactly as shipped. The
 * model-visible text is every string in a pack except the sections that never
 * reach a prompt (see HIDDEN). The name list is the judgments the pre-T-450
 * packs quoted (from the T-450 diff and the T-441 sweep) plus every judgment in
 * any pack's key_citations / key_precedents.
 *
 * T-451 OWNS these lines (Kunal; renames, always V1). They still hold a name
 * on this branch and are excluded below, by path:
 *   - gpa mandatory_clauses "suraj_lamp_disclaimer" (id and name)
 *   - spa mandatory_clauses "suraj_lamp_disclaimer" (id and name)
 *   - service_agreement mandatory_clauses[5].content (printed clause)
 *   - form_schema option ids and validation_rules (gpa, spa, jda): hidden anyway
 * When T-451 merges, delete T451_OWNED and the id exclusions.
 *
 * Deliberately NOT asserted: key_citations, key_precedents, validation_rules,
 * filing_checklist, form_schema and _meta, except the pins below.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { buildDrafterUserPrompt, DrafterBrief } from '../services/brief-drafter';
import { loadRulePack, readDraftingInstructionList } from '../services/rule-pack.service';

const RULES_DIR = join(__dirname, '..', 'config', 'document-rules');

/** The 19 packs T-450 edits. */
const PACKS = [
  'lease_deed',
  'mortgage_deed',
  'mou',
  'release_deed',
  'will',
  'employment_agreement',
  'founders_agreement',
  'franchise_agreement',
  'service_agreement',
  'moa',
  'partition_deed',
  'gpa',
  'sale_deed',
  'gift_deed',
  'spa',
  'license_agreement',
  'shareholders_agreement',
  'aoa',
  'joint_development_agreement',
] as const;

/** R3: the one sentence every pack ends its instructions with. */
const S =
  'Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].';

type Json = Record<string, unknown>;

const readPack = (id: string): Json =>
  JSON.parse(readFileSync(join(RULES_DIR, `${id}.json`), 'utf8')) as Json;

/** Sections that never reach a prompt (or are left alone on purpose by T-450). */
const HIDDEN = new Set([
  '_meta',
  'key_citations',
  'key_precedents',
  'validation_rules',
  'filing_checklist',
  'filingChecklist',
  'form_schema', // T-451 owns the form labels and option ids
]);

/** T-451 owns these (see header). Dotted path from the pack root. */
const T451_OWNED: Record<string, string[]> = {
  gpa: ['mandatory_clauses.10.name'],
  spa: ['mandatory_clauses.9.name'],
  service_agreement: ['mandatory_clauses.5.content'],
};
/** Clause ids T-451 renames. */
const T451_IDS = new Set(['suraj_lamp_disclaimer']);

function strings(v: unknown, path: string, skip: Set<string>, out: string[] = []): string[] {
  if (typeof v === 'string') {
    if (!skip.has(path)) out.push(v);
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => strings(x, `${path}.${i}`, skip, out));
  } else if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Json))
      strings(x, path === '' ? k : `${path}.${k}`, skip, out);
  }
  return out;
}

/** Every string the model can be given from this pack, minus the T-451 lines. */
function visibleStrings(pack: Json, id?: string): string[] {
  const skip = new Set(id !== undefined ? (T451_OWNED[id] ?? []) : []);
  const out: string[] = [];
  for (const [k, v] of Object.entries(pack)) {
    if (!HIDDEN.has(k)) strings(v, k, skip, out);
  }
  return out;
}

// ── Detecting a judgment name ───────────────────────────────────────────────

const GENERIC_PARTY =
  /^(State\b|Union of India|Collector|Commissioner|District Magistrate|Delhi Administration|National Commission|Special Land|Managing Committee|Chief District|Postmaster|CBI$|NIA$|RBI$|PNB$|MCD$|CIT$|ACIT$|DTC$|UoI$)/;

const NOT_A_JUDGMENT = new Set(['Ashok Kumar', 'Raj Kumar', 'Ajay Kumar', 'Vinod Kumar']);

/** The judgments the pre-T-450 packs quoted (T-450 diff, T-441 sweep). */
const KNOWN_QUOTED = [
  'Suraj Lamp',
  'Vineeta Sharma',
  'Rakesh Sharma',
  'Phulavati',
  'Danamma',
  'Suman Surpur',
  'Arunachala Gounder',
  'Ponnusamy',
  'Rangaraj',
  'Gopalakrishnan',
  'Golikari',
  'Century Spinning',
  'Superintendence Co',
  'Krishan Murgai',
  'Dharangadhara',
  'Lakshmanaswami',
  'Associated Hotels',
  'Khalil Ahmed',
  'Tufelhussein',
  'Kollipara Sriramulu',
  'Trimex',
  'Suresh Kumar Wadhwa',
  'Chunchun Jha',
  'Ebadat Ali',
  'Kuppuswami',
  'Arumugam Chettiar',
  'Roshan Singh',
  'Zile Singh',
  'Deputy Director of Consolidation',
  'Anthony Lawrence',
  'Ittoop',
  'Pridhi',
  'Venkatachala',
  'Thimmajamma',
  'Guramma',
  'Stanley v. Wilde',
  'Pomal Kanji',
  'Manibhai',
  'Bhagwan Devi',
  'Saradambal',
  'Murarilal',
  'Veerappa Pillai',
  'Abdul Hafiz Beg',
  'Sahebbi',
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

const CITATION =
  /\b(?:SCC|SCR|ILR|MANU|DLT|SCALE|Supp)\b|\bAIR\s+(?:\d{4}|SC|[A-Z][a-z]{1,4}\b)|\bCrl\.?\s*(?:L\.?J|App)|\(\d{4}\)\s*\d+\s+[A-Z]{2,}|\b\d+\s+ITR\b|\bITR\s+\d+/;

const VERSUS = /\b[A-Z][\w.&'’()-]*(?:\s+[A-Z][\w.&'’()-]*)*\s+(?:v\.?|vs\.?)\s+[A-Z]/;

const ROLE_VS =
  /\b(?:Applicant|Petitioner|Plaintiff|Appellant|Complainant|Claimant|Informant|Landlord|Tenant|Husband|Wife|Insurer|Owner|Promoter|Allottee|Licensor|Licensee|Lessor|Lessee|Buyer|Seller|Vendor|Purchaser)s?\s+(?:v\.?|vs\.?)\s+(?:Non-applicant|Respondent|Defendant|Opposite|Accused|Insurer|Owner|Promoter|Allottee|Tenant|Landlord|Wife|Husband|Licensor|Licensee|Lessor|Lessee|Buyer|Seller|Vendor|Purchaser)/gi;

function judgmentHits(text: string, names: string[]): string[] {
  const hits: string[] = [];
  for (const n of names) {
    if (new RegExp(`(?<![\\w])${escapeRe(n)}(?![\\w])`).test(text)) hits.push(`name: ${n}`);
  }
  const cleaned = text
    .replace(ROLE_VS, ' ')
    // "ROFR vs ROFO", "LICENSE vs LEASE", "S.105 vs S.52 EA": an ALL-CAPS comparison of two
    // terms, not a case. Case names are mixed-case and are caught by the name list.
    .replace(/(?:\b[A-Z][A-Z0-9.-]*\s+)+vs\.?\s+[A-Z][A-Z0-9.-]*/g, ' ');
  const c = CITATION.exec(cleaned);
  if (c) hits.push(`citation: ${c[0]}`);
  const v = VERSUS.exec(cleaned);
  if (v) hits.push(`versus: ${v[0]}`);
  return hits;
}

/** A snake_case clause id reaches the model; read it as words against the names. */
function idHits(id: string, names: string[]): string[] {
  if (!/^[a-z0-9]+(_[a-z0-9]+)+$/.test(id)) return [];
  const spaced = id.replace(/_/g, ' ');
  return names
    .filter((n) => new RegExp(`(?<![\\w])${escapeRe(n)}(?![\\w])`, 'i').test(spaced))
    .map((n) => `id: ${n}`);
}

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

describe('T-450 (a): no judgment name in model-visible text', () => {
  const names = [...new Set([...derivedNames(), ...KNOWN_QUOTED])];

  it('the name list is real, not empty', () => {
    expect(derivedNames().length).toBeGreaterThan(300);
    for (const n of ['Suraj Lamp', 'Vineeta Sharma', 'Rangaraj', 'Mobilox Innovations Pvt Ltd']) {
      expect(names).toContain(n);
    }
  });

  it('the detector catches the pre-T-450 phrasings (not tautological)', () => {
    const planted = [
      'WARNING — Suraj Lamp v. State of Haryana (2012) 1 SCC 656: GPA does NOT transfer title',
      'Ensure SHA terms are mirrorable in AOA (V.B. Rangaraj).',
      'Reference Dharangadhara Chemical Works v. Workmen for control test',
      'void per S.27 - cite Niranjan Shankar Golikari and Superintendence Co. v. Krishan Murgai.',
      'Critical to preserve license vs lease distinction (Associated Hotels test)',
      'description Coparcener cannot gift — Guramma case',
      'Cite Kale v. Deputy Director of Consolidation (1976) 3 SCC 119',
      'Cite Roshan Singh v. Zile Singh (1988) Supp SCC 718.',
      'per Arunachala Gounder v. Ponnusamy (2022)',
      'CRITICAL CASE — H. Venkatachala Iyengar v. B.N. Thimmajamma AIR 1959 SC 443',
    ];
    for (const p of planted) expect(judgmentHits(p, names)).not.toEqual([]);
  });

  it('the detector leaves the legitimate deed wording alone', () => {
    const fine = [
      'Licensor v. Licensee',
      'ROFR vs ROFO - distinguish clearly.',
      'BINDING vs NON-BINDING — CRITICAL DRAFTING POINT:',
      'Critical to preserve license vs lease distinction (substance, not form: a lease passes an interest in the property, a licence does not)',
      'Section 105 vs Section 52 of the Easements Act',
      'Must be mirrored in AOA to bind company',
    ];
    for (const p of fine) expect(judgmentHits(p, names)).toEqual([]);
  });

  it('the id check catches a judgment-named snake_case id and leaves plain ids alone', () => {
    expect(idHits('suraj_lamp_disclaimer', names)).not.toEqual([]);
    expect(idHits('title_disclaimer', names)).toEqual([]);
    expect(idHits('prayer', names)).toEqual([]);
  });

  it.each(PACKS)('%s: no clause id names a judgment (T-451 ids excepted)', (id) => {
    const found = clauseIds(readPack(id))
      .filter((c) => !T451_IDS.has(c))
      .flatMap((c) => idHits(c, names).map((h) => `${h} <- ${c}`));
    expect(found).toEqual([]);
  });

  it.each(PACKS)('%s: names no judgment in any model-visible string', (id) => {
    const found: string[] = [];
    for (const s of visibleStrings(readPack(id), id)) {
      for (const h of judgmentHits(s, names)) found.push(`${h}  <-  ${s.slice(0, 120)}`);
    }
    expect(found).toEqual([]);
  });

  it('the T-451 exclusions are bounded: only named paths, only these packs', () => {
    expect(Object.keys(T451_OWNED).sort()).toEqual(['gpa', 'service_agreement', 'spa']);
    expect(Object.values(T451_OWNED).flat()).toHaveLength(3);
    expect([...T451_IDS]).toEqual(['suraj_lamp_disclaimer']);
  });

  it.each(PACKS)('%s: the section names that are skipped are only the hidden ones', (id) => {
    const skipped = Object.keys(readPack(id)).filter((k) => HIDDEN.has(k));
    for (const k of skipped) {
      expect([
        '_meta',
        'filing_checklist',
        'form_schema',
        'key_citations',
        'key_precedents',
        'validation_rules',
      ]).toContain(k);
    }
  });
});

// ── (b) S is the last promptInstructions entry, exactly once ────────────────

describe('T-450 (b): the no-judgment sentence S is last, once', () => {
  it.each(PACKS)('%s: S is the last prompt_context.promptInstructions entry, once', (id) => {
    const pack = readPack(id);
    const pc = pack.prompt_context as Json;
    const list = pc.promptInstructions as unknown[];
    expect(Array.isArray(list)).toBe(true);
    expect(list[list.length - 1]).toBe(S);
    expect(list.filter((x) => x === S)).toHaveLength(1);
    // Nowhere else in the pack's model-visible text, and no top-level list.
    expect(visibleStrings(pack).filter((s) => s.includes('Do not name any judgment'))).toEqual([S]);
    expect(pack).not.toHaveProperty('promptInstructions');
  });

  it.each([
    'employment_agreement',
    'founders_agreement',
    'franchise_agreement',
    'service_agreement',
    'moa',
    'shareholders_agreement',
    'aoa',
  ])(
    '%s: S is in the instruction list of the pack that gained one (last key of prompt_context where it was added)',
    (id) => {
      const pc = readPack(id).prompt_context as Json;
      expect(pc.promptInstructions).toBeDefined();
      expect((pc.promptInstructions as unknown[]).slice(-1)[0]).toBe(S);
    },
  );
});

// ── (c) Ajay's exact strings ────────────────────────────────────────────────

describe("T-450 (c): Ajay's exact strings (T-245 file, T-450 questions and byte check)", () => {
  const get = (id: string, path: string): unknown =>
    path.split('.').reduce<unknown>((o, k) => (o as Json | unknown[])[k as never], readPack(id));

  it.each<[string, string, string]>([
    [
      'gift_deed',
      'relevantActs.4.sections.0.description',
      'Coparcener cannot gift away coparcenary interest except for pious / charitable purposes',
    ],
    [
      'spa',
      'prompt_context.promptInstructions.15',
      'Para 7: TITLE DISCLAIMER (if SPA authorises sale) — same as GPA: SPA does not itself transfer title; only registered Sale Deed transfers title.',
    ],
    [
      'license_agreement',
      'mandatory_clauses.3.description',
      'Critical to preserve license vs lease distinction (substance, not form: a lease passes an interest in the property, a licence does not)',
    ],
    [
      'shareholders_agreement',
      'mandatory_clauses.5.note',
      'Must be mirrored in AOA to bind company',
    ],
    ['shareholders_agreement', 'mandatory_clauses.22.note', 'Critical'],
    [
      'shareholders_agreement',
      'prompt_context.system_role',
      'You are drafting a Shareholders Agreement for an Indian private limited company. Balance founder protection and investor rights. Ensure SHA terms are mirrorable in AOA. Comply with FEMA if foreign investor.',
    ],
    [
      'aoa',
      'prompt_context.drafting_rules.2',
      'Reserved matters / affirmative vote provisions are enforceable only if also reflected in AOA.',
    ],
    [
      'partition_deed',
      'prompt_context.promptInstructions.3',
      'Daughter is coparcener by birth, irrespective of whether father was alive on 09.09.2005; the amended S.6 HSA operates retroactively, not retrospectively.',
    ],
    [
      'gpa',
      'relevantActs.2.sections.0.description',
      'Documents of which registration is compulsory — a GPA for sale of immovable property may fall within it',
    ],
  ])('%s %s is exactly the signed text', (id, path, text) => {
    expect(get(id, path)).toBe(text);
  });

  it('shareholders_agreement system_role no longer names V.B. Rangaraj and ends "mirrorable in AOA."-sentence intact', () => {
    const role = get('shareholders_agreement', 'prompt_context.system_role') as string;
    expect(role).not.toMatch(/Rangaraj/);
    expect(role).toContain('mirrorable in AOA. Comply');
  });

  it('joint_development_agreement: "Suraj Lamp disclaimer" became "title disclaimer"; rest of the line stays', () => {
    const line = (readPack('joint_development_agreement').prompt_context as Json)
      .promptInstructions as string[];
    const hit = line.find((l) => l.startsWith('Para 12: POWER OF ATTORNEY'));
    expect(hit).toBeDefined();
    expect(hit).toContain('CRITICAL — must include title disclaimer in PoA;');
    expect(hit).not.toMatch(/Suraj|Lamp/);
    expect(hit).toContain("(c) Selling Developer's share of units to end-buyers");
  });
});

// ── (d) _meta.change_protocol unchanged (Ajay, T-450 questions 1 and 2) ─────

describe('T-450 (d): _meta.change_protocol is unchanged for partition_deed, gpa, sale_deed', () => {
  const protocol = (id: string): string =>
    String(((readPack(id)._meta as Json) ?? {}).change_protocol ?? '');

  it('partition_deed', () => {
    expect(protocol('partition_deed')).toBe(
      "All edits require CLO sign-off. Vineeta Sharma is non-negotiable — daughters' coparcenary rights post-2005 must be reflected. Stamp duty often higher than sale deed where shares reduced.",
    );
  });

  it('gpa', () => {
    expect(protocol('gpa')).toBe(
      'All edits require CLO sign-off. Suraj Lamp warning must appear prominently when GPA includes power to sell. Authentication / notarisation / registration requirements differ for property powers vs general powers.',
    );
  });

  it('sale_deed', () => {
    expect(protocol('sale_deed')).toBe(
      'All edits require CLO sign-off. Stamp duty schedules vary by state — list state-wise references but do NOT hardcode rates. Suraj Lamp disclaimer mandatory when user proposes GPA-cum-sale shortcut.',
    );
  });
});

// ── (e) the REAL reader and prompt assembly keep S last ─────────────────────

describe('T-450 (e): through the real reader, S is the last instruction the model is given', () => {
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
