/**
 * T-473 round 4: Ajay's signed option labels (ref f1a18422,
 * handoff/legal/T-473-option-labels-signed.md). LEGAL CONTENT: the wording is signed
 * text, byte for byte. The overrides map is checked against the signed file itself,
 * so a typo, a dropped row or an extra row fails.
 *
 * Not tested here, on purpose: "Court types" (courts.routes, t473-brief-compat) and the
 * "Not verified" list (Ajay has not signed those references).
 */
import './setupEnv';
import fs from 'fs';
import path from 'path';

import { OPTION_LABEL_OVERRIDES } from '../config/option-label-overrides';
import { packOptionIds } from '../services/draft-renderer';
import { buildChecklist, checkUserValue } from '../services/intake-brief';
import { normalise } from '../services/intake-text';
import { loadAllRulePacks, loadRulePack } from '../services/rule-pack.service';
import {
  applyTitleCaseRule,
  humaniseOptionLabel,
  isSnakeCaseName,
  loadAllDocRules,
  normaliseOption,
  signedOptionLabel,
} from '../services/template-promoter';
import type { FormField } from '../services/template-engine.service';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const SIGNED_MD = path.join(REPO, 'handoff', 'legal', 'T-473-option-labels-signed.md');
const RULES_DIR = path.join(__dirname, '..', 'config', 'document-rules');

const fold = (v: string): string =>
  normalise(v)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

// ── The signed tables, parsed from the signed file ───────────────────────────────

const SIGNED_SECTIONS = ['A.1', 'A.3', 'A.4', 'A.5', 'Other wording'];

function parseSigned(): Map<string, string> {
  const out = new Map<string, string>();
  const text = fs.readFileSync(SIGNED_MD, 'utf-8');
  const parts = text.split(/^## /m).slice(1);
  const seenSections: string[] = [];
  for (const part of parts) {
    const heading = part.split('\n', 1)[0];
    const section = SIGNED_SECTIONS.find((s) => heading.startsWith(s));
    if (!section) continue;
    seenSections.push(section);
    for (const line of part.split('\n')) {
      if (!line.startsWith('|')) continue;
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.length < 2) continue;
      const label = cells[cells.length - 1];
      const ids = cells.slice(0, -1).flatMap((c) => [...c.matchAll(/`([^`]+)`/g)].map((m) => m[1]));
      for (const id of ids) {
        if (out.has(id.toLowerCase())) throw new Error(`signed file lists ${id} twice`);
        out.set(id.toLowerCase(), label);
      }
    }
  }
  expect(seenSections).toEqual(SIGNED_SECTIONS);
  return out;
}

const signed = parseSigned();
const overrideEntries = Object.entries(OPTION_LABEL_OVERRIDES);

// ── Real data ────────────────────────────────────────────────────────────────────

const registry = loadAllDocRules();
const formFields = (): { pack: string; f: FormField }[] =>
  [...registry.configs.values()].flatMap((c) =>
    c.form_schema.steps.flatMap((s) => s.fields.map((f) => ({ pack: c.template_id, f }))),
  );
const briefPacks = loadAllRulePacks().packs;

/** Raw option texts in the source packs (strings under options / enum / values). */
function rawOptionTexts(): { pack: string; text: string }[] {
  const out: { pack: string; text: string }[] = [];
  const walk = (pack: string, v: unknown, key = ''): void => {
    if (Array.isArray(v)) {
      for (const e of v) {
        if (typeof e === 'string' && ['options', 'enum', 'values'].includes(key)) {
          out.push({ pack, text: e });
        } else walk(pack, e, key);
      }
    } else if (typeof v === 'object' && v !== null) {
      for (const [k, e] of Object.entries(v)) walk(pack, e, k);
    }
  };
  for (const file of fs.readdirSync(RULES_DIR).filter((f) => f.endsWith('.json'))) {
    const src = JSON.parse(fs.readFileSync(path.join(RULES_DIR, file), 'utf-8')) as Record<
      string,
      unknown
    >;
    walk(file.replace(/\.json$/, ''), src.form_schema);
  }
  return out;
}

describe('T-473 signed labels: the overrides equal the signed file', () => {
  it('the signed file gives 79 ids', () => {
    expect(signed.size).toBe(79);
  });

  it('same ids, same count, same label byte for byte', () => {
    expect(overrideEntries.length).toBe(signed.size);
    const diffs: string[] = [];
    for (const [id, label] of signed) {
      const got = (OPTION_LABEL_OVERRIDES as Record<string, string>)[id];
      if (got !== label)
        diffs.push(`${id}: signed ${JSON.stringify(label)} got ${JSON.stringify(got)}`);
    }
    for (const [id] of overrideEntries)
      if (!signed.has(id)) diffs.push(`${id}: not in the signed file`);
    expect(diffs).toEqual([]);
  });

  it('every override key is lower-case', () => {
    expect(overrideEntries.filter(([k]) => k !== k.toLowerCase())).toEqual([]);
  });
});

describe('T-473 signed labels: shown in the form and in the brief', () => {
  it('every override key is an option id in at least one pack', () => {
    const present = new Set(
      formFields().flatMap(({ f }) =>
        (f.options ?? []).map((o) => (typeof o === 'string' ? o : o.id).toLowerCase()),
      ),
    );
    expect(overrideEntries.map(([k]) => k).filter((k) => !present.has(k))).toEqual([]);
  });

  it('the form schema shows exactly the signed label for every such option', () => {
    const wrong: string[] = [];
    const seen = new Set<string>();
    for (const { pack, f } of formFields()) {
      for (const o of f.options ?? []) {
        if (typeof o === 'string') continue;
        const want = signedOptionLabel(o.id);
        if (want === undefined) continue;
        seen.add(o.id.toLowerCase());
        if (o.label !== want) wrong.push(`${pack}#${f.field_id} ${o.id}: ${o.label}`);
      }
    }
    expect(wrong).toEqual([]);
    expect(seen.size).toBe(overrideEntries.length);
  });

  it('the brief (optionLabels) shows exactly the signed label for every such option', () => {
    const wrong: string[] = [];
    const seen = new Set<string>();
    for (const p of briefPacks) {
      for (const f of p.facts) {
        (f.option_ids ?? []).forEach((id, i) => {
          const want = signedOptionLabel(id);
          if (want === undefined) return;
          seen.add(id.toLowerCase());
          if (f.options[i] !== want) wrong.push(`${p.id}#${f.key} ${id}: ${f.options[i]}`);
        });
      }
    }
    expect(wrong).toEqual([]);
    expect(seen.size).toBe(overrideEntries.length);
  });

  it('the form and the brief agree on every option label of every pack', () => {
    const wrong: string[] = [];
    for (const p of briefPacks) {
      const cfg = registry.configs.get(p.id);
      if (!cfg) continue;
      const byField = new Map(
        cfg.form_schema.steps.flatMap((s) => s.fields).map((f) => [f.field_id, f]),
      );
      for (const fact of p.facts) {
        const ff = byField.get(fact.name) ?? byField.get(fact.key);
        if (!ff?.options || !fact.option_ids || fact.option_ids.length !== fact.options.length)
          continue;
        const formLabels = new Map(
          ff.options.map((o) => (typeof o === 'string' ? [o, o] : [o.id, o.label])),
        );
        fact.option_ids.forEach((id, i) => {
          const fl = formLabels.get(id);
          if (fl !== undefined && fl !== fact.options[i]) wrong.push(`${p.id}#${fact.key} ${id}`);
        });
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('T-473 signed labels: capital-letter ids resolve through the lower-case key', () => {
  const caps = [
    ...new Set(
      rawOptionTexts()
        .map((r) => r.text)
        .filter((t) => /[A-Z]/.test(t) && signedOptionLabel(t) !== undefined),
    ),
  ].sort();

  it('there are 12 such raw ids', () => {
    expect(caps).toHaveLength(12);
    expect(caps).toEqual(
      expect.arrayContaining(['wife_rape_sodomy_27_1A_i', 'simple_mortgage_S58_b', 'yes_194_I']),
    );
  });

  it.each(caps)('%s shows the signed label and keeps its lower-case id', (raw) => {
    const label = (OPTION_LABEL_OVERRIDES as Record<string, string>)[raw.toLowerCase()];
    expect(signedOptionLabel(raw)).toBe(label);
    expect(humaniseOptionLabel(raw)).toBe(label);
    expect(normaliseOption(raw, 0)).toEqual({ id: raw.toLowerCase().slice(0, 60), label });
  });

  it('an object option takes the signed label by id or by text, and an authored label otherwise', () => {
    expect(normaliseOption({ id: 'yes_flag_title_warning' }, 0)).toEqual({
      id: 'yes_flag_title_warning',
      label: 'Yes (check title before any sale)',
    });
    expect(normaliseOption({ id: 'x', label: 'Yes_194_I' }, 0)).toEqual({
      id: 'x',
      label: 'Yes (payer: company or business)',
    });
    expect(normaliseOption({ id: 'yes_flag_title_warning', label: 'Held as written' }, 0)).toEqual({
      id: 'yes_flag_title_warning',
      label: 'Yes (check title before any sale)',
    });
    expect(normaliseOption({ id: 'zzz', label: 'Held as written' }, 0)).toEqual({
      id: 'zzz',
      label: 'Held as written',
    });
  });
});

describe('T-473 signed labels: ids unchanged, old answers and new labels both work', () => {
  it('option ids in the form are exactly the slug of the source text', () => {
    const slug = (s: string): string =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60);
    const ids = new Set(
      formFields().flatMap(({ f }) =>
        (f.options ?? []).map((o) => (typeof o === 'string' ? o : o.id)),
      ),
    );
    for (const { text } of rawOptionTexts()) {
      if (signedOptionLabel(text) !== undefined) expect(ids.has(slug(text))).toBe(true);
    }
    expect(ids.has('yes_flag_title_warning')).toBe(true);
    expect(ids.has('wife_rape_sodomy_27_1a_i')).toBe(true);
  });

  const cases: [string, string, string, string][] = [
    [
      'gpa',
      'includes_power_to_sell',
      'yes_flag_title_warning',
      'Yes (check title before any sale)',
    ],
    [
      'divorce_sma',
      'grounds_selected',
      'wife_rape_sodomy_27_1A_i',
      'Wife: husband guilty of rape, sodomy or bestiality (Section 27(1A)(i))',
    ],
    ['mortgage_deed', 'mortgage_type', 'simple_mortgage_S58_b', 'Simple mortgage (Section 58(b))'],
  ];

  it.each(cases)(
    '%s#%s: old raw answer %s and the new signed label both match',
    (packId, key, raw, label) => {
      const pack = loadRulePack(packId)!;
      const item = buildChecklist(pack).find((i) => i.key === key)!;
      expect(item.options).toContain(label);
      const wrap = (v: string): string | string[] => (item.kind === 'choices' ? [v] : v);
      expect(checkUserValue(item, wrap(raw))).toBeNull();
      expect(checkUserValue(item, wrap(label))).toBeNull();
      expect(checkUserValue(item, wrap('some other text'))).toBe('Choose from the list.');
      const map = packOptionIds(pack.facts)[key];
      const id = raw.toLowerCase().slice(0, 60);
      expect(map[fold(raw)]).toBe(id);
      expect(map[fold(label)]).toBe(id);
    },
  );
});

describe('T-473 R1: state and court names in title case', () => {
  it('fixes state and court names, whole words, any case', () => {
    expect(applyTitleCaseRule('Uttar pradesh')).toBe('Uttar Pradesh');
    expect(applyTitleCaseRule('uttar  pradesh')).toBe('Uttar Pradesh');
    expect(applyTitleCaseRule('High court')).toBe('High Court');
    expect(applyTitleCaseRule('supreme court')).toBe('Supreme Court');
    expect(applyTitleCaseRule('bihar')).toBe('Bihar');
    expect(applyTitleCaseRule('High court from sessions acquittal appeal')).toBe(
      'High Court from sessions acquittal appeal',
    );
  });

  it('an all-capitals court name is title-cased as a whole, small words in lower case', () => {
    expect(applyTitleCaseRule('SUPREME COURT')).toBe('Supreme Court');
    expect(applyTitleCaseRule('HIGH COURT OF DELHI')).toBe('High Court of Delhi');
    expect(applyTitleCaseRule('HIGH COURT OF PATNA')).toBe('High Court of Patna');
    expect(applyTitleCaseRule('DISTRICT COURT AT THE CITY FOR THE STATE IN GOA')).toBe(
      'District Court at the City for the State in Goa',
    );
  });

  it('the all-capitals rule applies only to a label that starts with a listed court name', () => {
    expect(applyTitleCaseRule('NCLT COURT')).toBe('NCLT COURT');
    expect(applyTitleCaseRule('HIGH COURT OF RERA')).toBe('High Court of RERA');
    expect(applyTitleCaseRule('SUPREME COURT')).toBe('Supreme Court');
    for (const city of ['DELHI', 'PATNA', 'JHARKHAND', 'ALLAHABAD']) {
      const want = `High Court of ${city.charAt(0)}${city.slice(1).toLowerCase()}`;
      expect(applyTitleCaseRule(`HIGH COURT OF ${city}`)).toBe(want);
    }
  });

  it('leaves everything else alone', () => {
    for (const t of [
      'Held by the bench',
      'NDPS',
      'ALL CAPITALS NO FORUM',
      'Goal',
      'Biharis',
      'Delhiwalas',
      'Courtesy',
      'Mixed Case Court of Appeal',
      '',
    ]) {
      expect(applyTitleCaseRule(t)).toBe(t);
    }
  });

  it('is idempotent', () => {
    for (const t of ['HIGH COURT OF DELHI', 'Uttar pradesh', 'High court']) {
      expect(applyTitleCaseRule(applyTitleCaseRule(t))).toBe(applyTitleCaseRule(t));
    }
  });

  it('signed labels are never altered by R1', () => {
    for (const [id, label] of overrideEntries) {
      expect(humaniseOptionLabel(id)).toBe(label);
      expect(normaliseOption({ id, label: 'whatever' }, 0)?.label).toBe(label);
    }
  });

  it('mandamus court options read in title case', () => {
    const f = formFields().filter(({ pack }) => pack === 'mandamus');
    const labels = f
      .flatMap(({ f: x }) => (x.options ?? []).map((o) => (typeof o === 'string' ? o : o.label)))
      .filter((l) => /court/i.test(l));
    expect(labels).toEqual(
      expect.arrayContaining(['High Court of Delhi', 'High Court of Patna', 'Supreme Court']),
    );
    expect(labels.filter((l) => l === l.toUpperCase())).toEqual([]);
    expect(
      labels.filter((l) => /^high court of/i.test(l) && !/^High Court of [A-Z]/.test(l)),
    ).toEqual([]);
  });

  it('vakalatnama court options read "High Court" and "Supreme Court"', () => {
    const labels = formFields()
      .filter(({ pack }) => pack === 'vakalatnama')
      .flatMap(({ f }) => (f.options ?? []).map((o) => (typeof o === 'string' ? o : o.label)))
      .filter((l) => /court/i.test(l));
    expect(labels).toEqual(expect.arrayContaining(['High Court', 'Supreme Court']));
    expect(labels).not.toContain('High court');
    expect(labels).not.toContain('Supreme court');
  });

  it('no option in any pack shows a state or court name in the wrong case', () => {
    const wrong: string[] = [];
    for (const { pack, f } of formFields()) {
      for (const o of f.options ?? []) {
        const label = typeof o === 'string' ? o : o.label;
        if (applyTitleCaseRule(label) !== label) wrong.push(`${pack}#${f.field_id}: ${label}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('T-473 R4: no reference Ajay removed is back in a label', () => {
  const plain: [string, RegExp][] = [
    ['art_22_account_stated', /22|article|art\./i],
    ['art_23_money_received', /23|article|art\./i],
    ['art_34_promissory_note', /34|article|art\./i],
    ['art_35_dishonoured_cheque', /35|article|art\./i],
    ['sessions_court_from_magistrate_s418', /418|BNSS|section/i],
    ['sessions_court_from_judicial_magistrate_s419', /419|BNSS|section/i],
    ['hc_criminal_s413_bnss', /413|BNSS|section/i],
    ['principal_commissioner_or_commissioner_revision_u_s_263_264', /263|264|section|u\/s/i],
    ['principal_commissioner_or_commissioner_u_s_271', /271|section|u\/s/i],
    ['yes_194_i_company_paying', /194|section/i],
    ['yes_194_i', /194|section/i],
    ['yes_194_ib_individual_paying', /194|section/i],
    ['yes_194_ib', /194|section/i],
    ['physical_abuse_3_a', /3\(|section|\b3\b/i],
    ['sexual_abuse_3_b', /3\(|section|\b3\b/i],
    ['verbal_emotional_abuse_3_c', /3\(|section|\b3\b/i],
    ['economic_abuse_3_d', /3\(|section|\b3\b/i],
  ];

  it.each(plain)('%s has a plain label', (id, banned) => {
    const label = (OPTION_LABEL_OVERRIDES as Record<string, string>)[id];
    expect(label).toBeDefined();
    expect(label).not.toMatch(banned);
  });

  it('the only signed Article / Section 419 reference is the one Ajay left on the complainant row', () => {
    const with419 = overrideEntries.filter(([, l]) => /\b419\b/.test(l)).map(([k]) => k);
    expect(with419).toEqual(['complainant_against_acquittal_s419']);
  });

  it('every other signed label that cites a section, article or BNSS number is a counted, signed row', () => {
    const cites = overrideEntries
      .filter(([, l]) => /\b(Section|Article)\s+\d/.test(l))
      .map(([k]) => k);
    expect(cites).toHaveLength(42); // the signed rows that cite a Section or Article today
  });
});

describe('T-473 across all packs after signing', () => {
  it('no label, help, placeholder or option label is snake_case', () => {
    const wrong: string[] = [];
    for (const { pack, f } of formFields()) {
      const texts = [
        f.label,
        f.help,
        f.placeholder,
        ...(f.options ?? []).map((o) => (typeof o === 'string' ? o : o.label)),
      ];
      for (const t of texts)
        if (t !== undefined && (isSnakeCaseName(t) || /[A-Za-z0-9]+(_[A-Za-z0-9]+)+/.test(t)))
          wrong.push(`${pack}#${f.field_id}: ${t}`);
    }
    expect(wrong).toEqual([]);
  });

  it('no field offers two options with the same label (form and brief)', () => {
    const wrong: string[] = [];
    for (const { pack, f } of formFields()) {
      const labels = (f.options ?? []).map((o) => fold(typeof o === 'string' ? o : o.label));
      if (new Set(labels).size !== labels.length) wrong.push(`form ${pack}#${f.field_id}`);
    }
    for (const p of briefPacks) {
      for (const f of p.facts) {
        const labels = f.options.map(fold);
        if (new Set(labels).size !== labels.length) wrong.push(`brief ${p.id}#${f.key}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
