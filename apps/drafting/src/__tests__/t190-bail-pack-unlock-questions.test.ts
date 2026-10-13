/**
 * T-190 + T-199 — the bail packs ask the facts that unlock their averments,
 * in Ajay's signed order (including sole_earning_member 10a and dependants 10b).
 *
 * Question text, labels and options are read from the signed ticket files at
 * test time (as t318 does); no legal wording is retyped here. The model is the
 * Anthropic SDK stub; every answer is a fixture.
 */
import './setupDb';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { loadAvermentLists, resolveAverments } from '../services/averments';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import {
  applyEdit,
  holdDescriptionNone,
  openVersion,
  readExtraction,
} from '../services/fact-ledger.service';
import {
  Brief,
  BriefQuestion,
  ChecklistItem,
  buildBrief,
  buildChecklist,
  buildQuestions,
  isNoFactAnswer,
} from '../services/intake-brief';
import { RulePack, loadRulePack } from '../services/rule-pack.service';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

jest.setTimeout(30_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const REPO = join(__dirname, '..', '..', '..', '..');
const RULES = join(REPO, 'apps', 'drafting', 'src', 'config', 'document-rules');
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// ── the signed text, read at test time ──────────────────────────────────────
interface Signed {
  num: string;
  key: string;
  label: string;
  question: string;
  form: string;
}
function signedRows(): Signed[] {
  const t190 = read(
    join(REPO, 'handoff', 'tickets', 'T-190-bail-pack-questions-for-averment-keys.md'),
  );
  const t199 = read(join(REPO, 'handoff', 'tickets', 'T-199-bail-sole-earning-member.md'));
  const from = t190.indexOf('### Questions, in order');
  if (from < 0) throw new Error('no questions table in T-190');
  const rows: Signed[] = [];
  for (const l of t190.slice(from).split('\n')) {
    const c = l.split('|').map((x) => x.trim());
    if (!l.startsWith('|') || !/^\d+[ab]?$/.test(c[1] ?? '')) continue;
    const key = c[2].replace(/`/g, '');
    if (c[1] === '10a') continue;
    rows.push({ num: c[1], key, label: c[3], question: c[4], form: c[5] });
  }
  const cell = (name: string) => {
    const row = t199.split('\n').find((l) => l.startsWith(`| ${name} |`));
    if (!row) throw new Error(`no ${name} row in T-199`);
    return row.split('|')[2].trim();
  };
  const tenA: Signed = {
    num: '10a',
    key: cell('Key').replace(/`/g, ''),
    label: cell('Label'),
    question: cell('Question (exact text)'),
    form: cell('Answer form'),
  };
  const m = t199.match(/label "([^"]+)", question: "([^"]+)"/);
  if (!m) throw new Error('no 10b text in T-199');
  const tenB: Signed = {
    num: '10b',
    key: 'dependants',
    label: m[1],
    question: m[2],
    form: 'Free text',
  };
  rows.splice(
    rows.findIndex((r) => r.num === '11'),
    0,
    tenA,
    tenB,
  );
  return rows;
}
const SIGNED = signedRows();
const ORDER = SIGNED.map((s) => s.key);
const NUMS = SIGNED.map((s) => s.num);
const signedOf = (key: string) => SIGNED.find((s) => s.key === key)!;
const optionsOf = (s: Signed): string[] | null =>
  s.form.startsWith('Choices: ') ? s.form.slice(9).split('. ')[0].split(' / ') : null;

// ── raw pack files ──────────────────────────────────────────────────────────
interface RawField {
  id: string;
  label: string;
  type: string;
  required: boolean;
  options: string[] | null;
  question?: string;
  ask_when_empty?: boolean;
  show_if?: string;
  step?: string;
  raw: Record<string, unknown>;
}
function rawFields(path: string): RawField[] {
  const d = JSON.parse(read(path)) as { form_schema: unknown };
  const fs = d.form_schema as unknown;
  const out: RawField[] = [];
  const add = (f: Record<string, unknown>, step?: string) => {
    const opts = Array.isArray(f.options)
      ? (f.options as Array<string | { label: string }>).map((o) =>
          typeof o === 'string' ? o : o.label,
        )
      : null;
    out.push({
      id: String(f.field_id ?? f.name),
      label: String(f.label),
      type: String(f.type),
      required: f.required === true,
      options: opts,
      question: f.question as string | undefined,
      ask_when_empty: f.ask_when_empty as boolean | undefined,
      show_if: (f.show_if ?? f.depends_on) as string | undefined,
      step,
      raw: f,
    });
  };
  if (Array.isArray(fs)) fs.forEach((f) => add(f as Record<string, unknown>));
  else
    for (const s of (fs as { steps: Array<{ title: string; fields: unknown[] }> }).steps)
      s.fields.forEach((f) => add(f as Record<string, unknown>, s.title));
  return out;
}

const PACKS = [
  'bail_regular',
  'interim_bail',
  'bail_before_magistrate',
  'bail_anticipatory',
] as const;
const ANTICIPATORY_OUT = ['arrest_date', 'recovery_status', 's35_notice_status'];
const expectedOrder = (pack: string) =>
  pack === 'bail_anticipatory' ? ORDER.filter((k) => !ANTICIPATORY_OUT.includes(k)) : ORDER;
const PROTECTED = 'earlier_bail_applications';

// ═════════════════════════════════════════════════════════════════════════════
// AC1, AC2, AC3: the packs, from the real files
// ═════════════════════════════════════════════════════════════════════════════
describe('T-190 signed text is read correctly', () => {
  it('reads 16 rows in Ajay order, with 10a and 10b from T-199', () => {
    expect(NUMS).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '10a',
      '10b',
      '11',
      '12',
      '13a',
      '13b',
    ]);
    expect(signedOf('sole_earning_member').question).toBe(
      'Is the applicant the only earning member of the family?',
    );
    expect(signedOf('dependants').label).toBe('Who depends on the applicant');
    expect(optionsOf(signedOf('s35_notice_status'))).toEqual(['Served', 'Not served', 'Not known']);
  });
});

describe.each(PACKS)('T-190 AC1-AC3 pack file %s', (packId) => {
  const files: Array<[string, string]> = [['document-rules', join(RULES, `${packId}.json`)]];
  if (packId === 'bail_regular' || packId === 'bail_anticipatory') {
    files.push(['docs/templates', join(REPO, 'docs', 'templates', `${packId}.json`)]);
  }
  const want = expectedOrder(packId);

  it.each(files)(
    '%s: the asked items are the signed ones, in order, with the exact text, all optional',
    (_n, path) => {
      const fields = rawFields(path);
      const asked = fields.filter((f) => f.ask_when_empty === true);
      expect(asked.map((f) => f.id)).toEqual(want);
      // consecutive in the file
      const at = fields.findIndex((f) => f.id === want[0]);
      expect(fields.slice(at, at + want.length).map((f) => f.id)).toEqual(want);
      for (const f of asked) {
        const s = signedOf(f.id);
        expect(f.label).toBe(s.label);
        expect(f.question).toBe(s.question);
        expect(f.required).toBe(false);
        expect(f.show_if).toBeUndefined(); // 13a and 13b are asked together
        const opts = optionsOf(s);
        if (opts) {
          expect(['select', 'dropdown']).toContain(f.type);
          expect(f.options).toEqual(opts);
        } else if (s.form.startsWith('Date')) expect(f.type).toBe('date');
        else expect(['text', 'textarea']).toContain(f.type);
      }
      expect(asked.find((f) => f.id === PROTECTED)!.type).toBe('textarea');
    },
  );

  it('the pack the service loads carries the same questions (source pack) and optional ask_when_empty items', () => {
    const cl = buildChecklist(loadRulePack(packId)!);
    const asked = cl.filter((i) => i.askWhenEmpty);
    expect(asked.map((i) => i.key)).toEqual(want);
    for (const i of asked) {
      expect(i.question).toBe(signedOf(i.key).question);
      expect(i.required).toBe(false);
      expect(i.label).toBe(signedOf(i.key).label);
    }
    if (packId === 'bail_anticipatory') {
      for (const k of ANTICIPATORY_OUT) expect(cl.find((i) => i.key === k)).toBeUndefined();
    }
  });
});

describe('T-190: placement and shared blocks', () => {
  it('advocate_enrollment stays last in Court & Parties (bail_regular, bail_anticipatory)', () => {
    for (const id of ['bail_regular', 'bail_anticipatory']) {
      const f = rawFields(join(RULES, `${id}.json`)).filter((x) => x.step === 'Court & Parties');
      expect(f[f.length - 1].id).toBe('advocate_enrollment');
    }
  });
  it('docs/templates carries the same item definitions as document-rules', () => {
    for (const id of ['bail_regular', 'bail_anticipatory']) {
      const pick = (p: string) =>
        rawFields(p)
          .filter((f) => f.ask_when_empty)
          .map((f) => f.raw);
      expect(pick(join(REPO, 'docs', 'templates', `${id}.json`))).toEqual(
        pick(join(RULES, `${id}.json`)),
      );
    }
  });
  it('bail_regular: the block follows custody_since; interim_bail follows next_hearing_date; magistrate follows jail', () => {
    const idx = (p: string, id: string) =>
      rawFields(join(RULES, `${p}.json`))
        .map((f) => f.id)
        .indexOf(id);
    expect(idx('bail_regular', PROTECTED)).toBe(idx('bail_regular', 'custody_since') + 1);
    expect(idx('interim_bail', PROTECTED)).toBe(idx('interim_bail', 'next_hearing_date') + 1);
    expect(idx('bail_before_magistrate', PROTECTED)).toBe(
      idx('bail_before_magistrate', 'jail') + 1,
    );
  });
  it('magistrate pack: the 4 moved items use the signed labels', () => {
    const f = rawFields(join(RULES, 'bail_before_magistrate.json'));
    for (const k of [
      'applicant_occupation',
      'arrest_date',
      'investigation_status',
      'antecedents',
    ]) {
      expect(f.find((x) => x.id === k)!.label).toBe(signedOf(k).label);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// buildQuestions
// ═════════════════════════════════════════════════════════════════════════════
const KIND = (id: string) => ({ id, name: id, court_document: true });
const isEmptyV = (v: unknown) => v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** What a typical description fills: identity, FIR, offence, custody. */
const TYPICAL: Record<string, string | string[]> = {
  applicant_name: 'Ram Kumar',
  father_name: 'Shri Hari Kumar',
  applicant_parentage: 'Shri Hari Kumar',
  applicant_age: '32',
  address: '123 Main St, Patna',
  applicant_address: '123 Main St, Patna',
  fir_number: '124/2026',
  fir_date: '2026-03-10',
  police_station: 'Kotwali',
  sections_charged: ['318'],
  offences_alleged: '318(4) BNS',
};
function typicalValues(cl: ChecklistItem[]) {
  const out: Array<{
    key: string;
    value: string | string[];
    quote: string;
    source: 'description';
  }> = [];
  for (const i of cl) {
    let v = TYPICAL[i.key];
    if (v === undefined && i.key === 'currently_in_custody') v = i.options[0];
    if (v !== undefined) out.push({ key: i.key, value: v, quote: '', source: 'description' });
  }
  return out;
}
function briefFor(
  packId: string,
  typical: boolean,
  extra: Array<{ key: string; value: string | string[] }> = [],
) {
  const cl = buildChecklist(loadRulePack(packId)!);
  const values = [
    ...(typical ? typicalValues(cl) : []),
    ...extra.map((e) => ({ ...e, quote: '', source: 'user' as const })),
  ];
  return { cl, brief: buildBrief({ kind: KIND(packId), checklist: cl, values }) as Brief };
}
const keysOf = (q: BriefQuestion[]) => q.map((x) => x.key);

describe.each(PACKS)('T-190 buildQuestions on %s', (packId) => {
  it('Arjun (a): the protected slot sits right after the party names and displaces only the lowest-ranked item', () => {
    const { cl, brief } = briefFor(packId, false);
    const base = keysOf(buildQuestions(brief, new Map()));
    const withPack = buildQuestions(brief, new Map(), new Set(), new Set(), { checklist: cl });
    const parties = brief.items
      .filter((i) => i.party_name && i.required && isEmptyV(i.value))
      .map((i) => i.key);
    expect(parties.length).toBeGreaterThan(0);
    const rest = base.filter((k) => !parties.includes(k));
    expect(keysOf(withPack)).toEqual([
      ...parties,
      PROTECTED,
      ...rest.slice(0, 10 - parties.length - 1),
    ]);
    expect(withPack).toHaveLength(10);
    for (const p of parties) expect(keysOf(withPack)).toContain(p);
  });

  it('Arjun (b): with a typical description, required-empty + protected <= 10 and no required item is pushed past the cap', () => {
    const { cl, brief } = briefFor(packId, true);
    const reqEmpty = brief.items.filter((i) => i.required && isEmptyV(i.value)).map((i) => i.key);
    expect(reqEmpty.length + 1).toBeLessThanOrEqual(10);
    const q = buildQuestions(brief, new Map(), new Set(), new Set(), { checklist: cl });
    for (const k of reqEmpty) expect(keysOf(q)).toContain(k);
    expect(keysOf(q)).toContain(PROTECTED);
    expect(q.length).toBeLessThanOrEqual(10);
  });

  it('ask_when_empty items come after every required item, in pack order; the protected one is ahead of them', () => {
    const { cl, brief } = briefFor(packId, true);
    const q = buildQuestions(brief, new Map(), new Set(), new Set(), { checklist: cl });
    const keys = keysOf(q);
    const optional = keys.filter(
      (k) => cl.find((i) => i.key === k)!.askWhenEmpty && k !== PROTECTED,
    );
    const firstOpt = Math.min(...optional.map((k) => keys.indexOf(k)));
    for (const k of keys.slice(0, firstOpt)) {
      expect(optional).not.toContain(k);
    }
    for (const k of keys.slice(firstOpt)) expect(cl.find((i) => i.key === k)!.required).toBe(false);
    const inPack = optional.map((k) => cl.findIndex((i) => i.key === k));
    expect([...inPack].sort((a, b) => a - b)).toEqual(inPack);
    expect(keys.indexOf(PROTECTED)).toBeLessThan(firstOpt);
    // signed order among the asked optional ones
    const want = expectedOrder(packId).filter((k) => optional.includes(k));
    expect(optional).toEqual(want);
    // not-asked optional items stay out
    for (const k of ['custody_since', 'additional_context', 'next_hearing_date']) {
      expect(keys).not.toContain(k);
    }
    // advocate_enrollment is optional (not asked) in bail_regular and bail_anticipatory; interim_bail
    // and bail_before_magistrate mark it required, so it is asked there (T-382 key-only rename).
    const enr = cl.find((i) => i.key === 'advocate_enrollment')!;
    if (enr.required) expect(keys).toContain('advocate_enrollment');
    else expect(keys).not.toContain('advocate_enrollment');
    for (const k of keys) {
      const own = signedRows().find((s) => s.key === k);
      const item = q.find((x) => x.key === k)!;
      if (own) {
        expect(item.question).toBe(own.question);
        expect(item.source).toBe('pack');
      }
    }
  });

  it('the cap is 10 and past-cap optional items are not asked', () => {
    const { cl, brief } = briefFor(packId, true);
    const q = buildQuestions(brief, new Map(), new Set(), new Set(), { checklist: cl });
    expect(q.length).toBeLessThanOrEqual(10);
    expect(q.map((x) => x.round)).toEqual(q.map((_x, i) => (i < 5 ? 1 : 2)));
  });
});

describe('T-190 buildQuestions: exact lists, alwaysAsk, 240-character rule, confirm', () => {
  it('bail_regular, typical description: parties, protected, required, then optional in signed order', () => {
    const { cl, brief } = briefFor('bail_regular', true);
    const q = keysOf(buildQuestions(brief, new Map(), new Set(), new Set(), { checklist: cl }));
    expect(q).toEqual([
      'earlier_bail_applications',
      'facts_narrative',
      'grounds_for_bail',
      'antecedents',
      'arrest_date',
      'investigation_status',
      'applicant_sex',
      'medical_condition',
      'named_in_fir',
      'recovery_status',
    ]);
  });

  it('bail_anticipatory never asks arrest_date, recovery_status or s35_notice_status', () => {
    const { cl, brief } = briefFor('bail_anticipatory', true);
    const q = keysOf(buildQuestions(brief, new Map(), new Set(), new Set(), { checklist: cl }));
    for (const k of ANTICIPATORY_OUT) expect(q).not.toContain(k);
    expect(q.slice(0, 3)).toEqual([
      'earlier_bail_applications',
      'facts_narrative',
      'grounds_for_bail',
    ]);
    expect(q.slice(3)).toEqual(
      [
        'antecedents',
        'investigation_status',
        'applicant_sex',
        'medical_condition',
        'named_in_fir',
        'cooperated_with_investigation',
        'applicant_occupation',
      ].slice(0, q.length - 3),
    );
  });

  it('Addendum 2 rule 2(a), no overflow: party names + alwaysAsk do not fill the cap, so every alwaysAsk key stays and a non-alwaysAsk item is displaced', () => {
    const { cl, brief } = briefFor('bail_regular', false);
    const reqKeys = brief.items.filter((i) => i.required && !i.party_name).map((i) => i.key);
    const always = new Set(reqKeys.slice(0, 3));
    const q = keysOf(buildQuestions(brief, new Map(), new Set(), always, { checklist: cl }));
    expect(q).toHaveLength(10);
    expect(q.slice(0, 2)).toEqual(['applicant_name', PROTECTED]);
    for (const k of always) expect(q).toContain(k);
    expect(q.slice(2, 5)).toEqual([...always]);
  });

  it('Addendum 2 rule 2(a), the overflow case: party names + alwaysAsk fill the cap, so earlier_bail_applications is still asked, the lowest-ranked alwaysAsk key goes past the cap, and no party name is displaced', () => {
    const { cl, brief } = briefFor('bail_regular', false);
    const parties = brief.items
      .filter((i) => i.party_name && i.required && isEmptyV(i.value))
      .map((i) => i.key);
    const reqKeys = brief.items.filter((i) => i.required && !i.party_name).map((i) => i.key);
    // party names + alwaysAsk alone are exactly the cap
    const alwaysKeys = reqKeys.slice(0, 10 - parties.length);
    expect(parties.length + alwaysKeys.length).toBe(10);
    const q = keysOf(
      buildQuestions(brief, new Map(), new Set(), new Set(alwaysKeys), { checklist: cl }),
    );
    expect(q).toHaveLength(10); // the cap is never an 11th
    expect(q).toEqual([...parties, PROTECTED, ...alwaysKeys.slice(0, alwaysKeys.length - 1)]);
    expect(q).not.toContain(alwaysKeys[alwaysKeys.length - 1]); // the lowest-ranked alwaysAsk key is displaced
    for (const p of parties) expect(q).toContain(p);
    // more alwaysAsk than the cap: the same, the extra ones past the cap
    const all = new Set(
      [...reqKeys, ...cl.filter((i) => i.askWhenEmpty).map((i) => i.key)].filter(
        (k) => k !== PROTECTED,
      ),
    );
    const q2 = keysOf(buildQuestions(brief, new Map(), new Set(), all, { checklist: cl }));
    expect(q2).toHaveLength(10);
    expect(q2.slice(0, parties.length + 1)).toEqual([...parties, PROTECTED]);
    for (const k of q2.slice(parties.length + 1)) expect(all.has(k)).toBe(true);
  });

  it('the protected key is also kept when it is itself an alwaysAsk key', () => {
    const { cl, brief } = briefFor('bail_regular', false);
    const q = keysOf(
      buildQuestions(brief, new Map(), new Set(), new Set([PROTECTED, 'fir_date']), {
        checklist: cl,
      }),
    );
    expect(q.slice(0, 2)).toEqual(['applicant_name', PROTECTED]);
    expect(q.filter((k) => k === PROTECTED)).toHaveLength(1);
  });

  it('Arjun cond 1: a pack question skips the 240-character limit; model text keeps it', () => {
    const { cl, brief } = briefFor('bail_regular', false);
    const signed = signedOf(PROTECTED).question;
    expect(signed.length).toBeGreaterThan(240);
    const longModel = 'x'.repeat(400);
    const worded = new Map([
      [PROTECTED, longModel],
      ['fir_number', longModel],
      ['fir_date', 'On what date was the FIR registered?'],
    ]);
    const q = buildQuestions(brief, worded, new Set(), new Set(), { checklist: cl });
    const prot = q.find((x) => x.key === PROTECTED)!;
    expect(prot.question).toBe(signed);
    expect(prot.source).toBe('pack');
    const fir = q.find((x) => x.key === 'fir_number')!;
    expect(fir.question).not.toBe(longModel);
    expect(fir.question.length).toBeLessThanOrEqual(240);
    expect(fir.source).toBeUndefined();
    expect(q.find((x) => x.key === 'fir_date')!.question).toBe(
      'On what date was the FIR registered?',
    );
  });

  it('a question whose source is not pack is not put on the checklist', () => {
    const pack = JSON.parse(JSON.stringify(loadRulePack('bail_regular'))) as RulePack;
    const f = pack.facts.find((x) => x.key === 'antecedents')!;
    f.question = { text: 'model words', source: 'model' as never };
    expect(buildChecklist(pack).find((i) => i.key === 'antecedents')!.question).toBeUndefined();
  });

  it('Reception wording never replaces the signed text for keys 1, 2 and 12', () => {
    const { cl, brief } = briefFor('bail_regular', true);
    const worded = new Map([
      ['antecedents', 'Any cases?'],
      ['s35_notice_status', 'Notice?'],
      [PROTECTED, 'Earlier?'],
    ]);
    const q = buildQuestions(brief, worded, new Set(), new Set(['s35_notice_status']), {
      checklist: cl,
    });
    for (const k of ['antecedents', PROTECTED, 's35_notice_status']) {
      expect(q.find((x) => x.key === k)!.question).toBe(signedOf(k).question);
    }
  });

  it('without the pack argument nothing changes (no optional questions, no source)', () => {
    const { brief } = briefFor('bail_regular', true);
    for (const x of buildQuestions(brief, new Map())) {
      expect(x.source).toBeUndefined();
      expect(x.confirm).toBeUndefined();
    }
  });

  it('AC8 confirm: a value the brief shows is asked once more, in the protected slot, with confirm true', () => {
    const { cl, brief } = briefFor('bail_regular', true, [{ key: PROTECTED, value: 'None' }]);
    const without = keysOf(
      buildQuestions(brief, new Map(), new Set(), new Set(), { checklist: cl }),
    );
    expect(without).not.toContain(PROTECTED);
    const q = buildQuestions(brief, new Map(), new Set(), new Set(), {
      checklist: cl,
      confirm: new Set([PROTECTED]),
    });
    expect(q[0]).toMatchObject({
      key: PROTECTED,
      confirm: true,
      source: 'pack',
      question: signedOf(PROTECTED).question,
    });
    expect(q.filter((x) => x.confirm)).toHaveLength(1);
  });

  it('Arjun cond 3: "Not known" marks the item asked_empty and it is not asked again; confirm re-asks it', () => {
    const { cl, brief: before } = briefFor('bail_regular', true);
    expect(
      keysOf(buildQuestions(before, new Map(), new Set(), new Set(), { checklist: cl })),
    ).toContain('investigation_status');
    const { brief } = briefFor('bail_regular', true, [
      { key: 'investigation_status', value: 'Not known' },
      { key: 'applicant_occupation', value: ' not GIVEN ' },
    ]);
    const item = brief.items.find((i) => i.key === 'investigation_status')!;
    expect(item.asked_empty).toBe(true);
    expect(item.value).toBeNull();
    expect(brief.items.find((i) => i.key === 'applicant_occupation')!.asked_empty).toBe(true);
    const again = buildQuestions(brief, new Map(), new Set(), new Set(), { checklist: cl });
    expect(keysOf(again)).not.toContain('investigation_status');
    const re = buildQuestions(brief, new Map(), new Set(), new Set(), {
      checklist: cl,
      confirm: new Set(['investigation_status']),
    });
    expect(re.find((x) => x.key === 'investigation_status')).toMatchObject({ confirm: true });
  });

  it('a whole-answer "Not known" is empty; "Not known to have any antecedents" is a real answer', () => {
    const { brief } = briefFor('bail_regular', true, [
      { key: 'antecedents', value: 'Not known to have any antecedents' },
    ]);
    const a = brief.items.find((i) => i.key === 'antecedents')!;
    expect(a.value).toBe('Not known to have any antecedents');
    expect(a.asked_empty).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Ledger: answers, unlocks, conditions
// ═════════════════════════════════════════════════════════════════════════════
const CL = buildChecklist(loadRulePack('bail_regular')!);
const item = (k: string) => CL.find((i) => i.key === k)!;
const EMPTY = { facts: [], unresolved: [] } as never;
const answer = (key: string, text: string, cl = CL) =>
  applyEdit(
    EMPTY,
    cl.find((i) => i.key === key),
    { key, text, fromQuestion: true },
    2026,
  );
const LISTS = loadAvermentLists('bail_regular');
const idFact = (key: string, display: string) =>
  ({
    id: `f_${key}`,
    key,
    label: key,
    type: 'text',
    value: display,
    display,
    raw_span: display,
    source: 'user',
    confidence: 1,
    required_in_draft: false,
  }) as never;
const ADDRESS = idFact('address', '123 Main St, Patna');

// key, answer, ids that must be allowed, a banned id of the key that must lift (or null)
const UNLOCKS: Array<[string, string, string[], string | null]> = [
  [
    PROTECTED,
    'Rejected by Sessions Court, Patna on 12.01.2026',
    ['earlier_bail_applications'],
    null,
  ],
  ['antecedents', 'None', ['no_criminal_antecedents'], 'no_criminal_antecedents'],
  ['arrest_date', '15/03/2026', ['arrested_on'], 'arrested_on'],
  [
    'investigation_status',
    'Charge sheet filed',
    ['chargesheet_filed', 'no_custodial_interrogation_needed'],
    'chargesheet_filed',
  ],
  ['applicant_sex', 'Female', ['woman_proviso'], 'woman_proviso'],
  [
    'medical_condition',
    'Type 2 diabetes',
    ['medical_condition', 'medical_grounds'],
    'medical_grounds',
  ],
  ['named_in_fir', 'No', ['not_named_in_fir'], 'not_named_in_fir'],
  ['recovery_status', 'None', ['no_recovery'], 'no_recovery'],
  [
    'cooperated_with_investigation',
    'Yes',
    ['cooperated_with_investigation'],
    'cooperated_with_investigation',
  ],
  ['applicant_occupation', 'Daily-wage labourer', ['gainfully_employed'], 'gainfully_employed'],
  ['sole_earning_member', 'Yes', ['sole_breadwinner'], 'sole_breadwinner'],
  [
    'dependants',
    'Aged mother and two minor children',
    ['family_dependent_on_applicant'],
    'family_dependent_on_applicant',
  ],
  ['local_ties', 'Lives with parents and wife', ['deep_roots_in_society'], 'deep_roots_in_society'],
  ['s35_notice_status', 'Not served', ['s35_notice_illegal_arrest'], 's35_notice_illegal_arrest'],
];

describe('T-190 AC4 and AC5: an answer is an asked fact with a raw_span, and unlocks its averment with the display value', () => {
  it.each(UNLOCKS)('%s', (key, text, allowedIds, banned) => {
    const r = answer(key, text);
    const f = r.next!.facts[0];
    expect(f).toMatchObject({ key, source: 'asked', raw_span: text });
    const facts = [...r.next!.facts, ADDRESS];
    const out = resolveAverments(LISTS, facts);
    for (const id of allowedIds) expect(out.allowed.map((a) => a.id)).toContain(id);
    if (banned) expect(out.banned.map((b) => b.id)).not.toContain(banned);
    const texts = out.allowed.filter((a) => allowedIds.includes(a.id)).map((a) => a.text);
    if (
      ![
        'investigation_status',
        'applicant_sex',
        'named_in_fir',
        'cooperated_with_investigation',
        'sole_earning_member',
        's35_notice_status',
        'antecedents',
        'recovery_status',
      ].includes(key)
    ) {
      expect(texts.some((t) => t.includes(f.display))).toBe(true);
    }
  });

  it('co-accused court and date together unlock parity_co_accused, using both displays', () => {
    const c = answer('co_accused_bail_court', 'Sessions Court, Patna').next!.facts[0];
    const d = answer('co_accused_bail_date', '10/02/2026').next!.facts[0];
    expect(d).toMatchObject({ source: 'asked', raw_span: '10/02/2026' });
    const out = resolveAverments(LISTS, [c, d]);
    const a = out.allowed.find((x) => x.id === 'parity_co_accused')!;
    expect(a.text).toContain(c.display);
    expect(a.text).toContain(d.display);
    // one of the two is not enough
    expect(resolveAverments(LISTS, [c]).allowed.map((x) => x.id)).not.toContain(
      'parity_co_accused',
    );
  });

  it('every one of the 16 keys has a ledger item the answer can be written to', () => {
    for (const k of ORDER) expect(item(k)).toBeDefined();
  });
});

describe('T-190 AC6: a key unanswered leaves its averment banned, with every phrase', () => {
  const base = resolveAverments(LISTS, [ADDRESS]);
  it.each(UNLOCKS.filter((u) => u[3]))('%s', (key, _t, allowedIds, bannedId) => {
    const b = base.banned.find((x) => x.id === bannedId)!;
    expect(b).toBeDefined();
    expect(b.phrases.length).toBeGreaterThan(0);
    for (const id of allowedIds.filter((i) => LISTS.banned.some((x) => x.id === i))) {
      expect(base.allowed.map((a) => a.id)).not.toContain(id);
    }
    expect(base.allowed.map((a) => a.id)).not.toContain(bannedId);
    const all = base.allowed.map((a) => a.text.toLowerCase()).join('\n');
    for (const p of b.phrases) expect(all).not.toContain(p.toLowerCase());
  });
  it('no earlier_bail_applications fact: first_bail_application stays banned', () => {
    expect(base.banned.map((b) => b.id)).toContain('first_bail_application');
    expect(base.allowed.map((a) => a.id)).not.toContain('first_bail_application');
  });
  it('the anticipatory checklist cannot hold the 3, 8 or 12 facts, so the inherited entries cannot unlock', () => {
    const cl = buildChecklist(loadRulePack('bail_anticipatory')!);
    const text = 'Arrested on 15/03/2026. Nothing recovered. No notice served.';
    const r = readExtraction(
      cl,
      text,
      {
        facts: [
          { key: 'arrest_date', span: '15/03/2026', confidence: 0.99 },
          { key: 'recovery_status', span: 'Nothing recovered', confidence: 0.99 },
          {
            key: 's35_notice_status',
            span: 'No notice served',
            option: 'Not served',
            confidence: 0.99,
          },
        ],
      },
      2026,
    );
    expect(r.facts).toEqual([]);
    expect(r.dropped.map((d) => d.reason)).toEqual(['not_on_list', 'not_on_list', 'not_on_list']);
    const lists = loadAvermentLists('bail_anticipatory');
    const out = resolveAverments(lists, []);
    for (const id of ['arrested_on', 'no_recovery', 's35_notice_illegal_arrest']) {
      expect(out.allowed.map((a) => a.id)).not.toContain(id);
    }
  });
});

describe('T-190 condition 5: a "none" answer on a present-key writes no fact', () => {
  const NONES = [
    'none',
    'None',
    'NIL.',
    'no',
    'Not applicable',
    'N/A',
    'n/a',
    'Nahi',
    'koi nahi',
    'Kuch Nahi!',
    '  none  ',
  ];
  const KEYS = [
    'medical_condition',
    'local_ties',
    'co_accused_bail_court',
    'co_accused_bail_date',
    'dependants',
  ];
  for (const key of KEYS) {
    it.each(NONES)(`${key}: %j gives no fact (answer, and brief value)`, (word) => {
      const r = answer(key, word);
      expect(r.next).toBeNull();
      expect(r.result).toMatchObject({ status: 'saved', display: null });
      expect(isNoFactAnswer(item(key), word)).toBe(true);
      const { brief } = briefFor('bail_regular', true, [{ key, value: word }]);
      const it_ = brief.items.find((i) => i.key === key)!;
      expect(it_.value).toBeNull();
      expect(it_.asked_empty).toBe(true);
    });
  }
  it('a none answer clears an earlier fact on the key', () => {
    const f = answer('medical_condition', 'Asthma').next!;
    const r = applyEdit(
      f,
      item('medical_condition'),
      { key: 'medical_condition', text: 'None' },
      2026,
    );
    expect(r.next!.facts).toEqual([]);
  });
  it('a real answer that merely contains a none word is a fact', () => {
    for (const [k, t] of [
      ['medical_condition', 'No known allergies, asthma'],
      ['local_ties', 'None of the relatives live here but he owns the house'],
      ['dependants', 'Nil income wife'],
    ]) {
      expect(answer(k, t).next!.facts[0]).toMatchObject({ key: k, source: 'asked', raw_span: t });
    }
  });
  it('read from the description: a none word on medical_condition, local_ties and dependants gives no fact (no_fact_answer)', () => {
    for (const key of ['medical_condition', 'local_ties', 'dependants']) {
      const r = readExtraction(
        CL,
        'Medical: nahi.',
        { facts: [{ key, span: 'nahi', confidence: 0.99 }] },
        2026,
      );
      expect(r.facts).toEqual([]);
      expect(r.dropped).toEqual([{ reason: 'no_fact_answer' }]);
    }
  });
  it('co_accused_bail_court and co_accused_bail_date are never read from a description', () => {
    expect(item('co_accused_bail_court').modelReadable).toBeFalsy();
    expect(item('co_accused_bail_date').modelReadable).toBeFalsy();
  });
  it('antecedents is not a condition-5 key: "nil" and "none" ARE facts (and unlock)', () => {
    for (const w of ['nil', 'none']) {
      const f = answer('antecedents', w).next!.facts[0];
      expect(f).toMatchObject({ source: 'asked', raw_span: w });
      expect(resolveAverments(LISTS, [f]).allowed.map((a) => a.id)).toContain(
        'no_criminal_antecedents',
      );
      const r = readExtraction(
        CL,
        `Antecedents: ${w}.`,
        { facts: [{ key: 'antecedents', span: w, confidence: 0.99 }] },
        2026,
      );
      expect(r.facts).toHaveLength(1);
    }
  });
});

describe('T-190 "Not known" / "Not given": no fact, only as the whole answer', () => {
  it.each([
    ['investigation_status', 'Not known'],
    ['named_in_fir', 'Not known'],
    ['sole_earning_member', 'Not known'],
    ['s35_notice_status', 'Not known'],
    ['applicant_sex', 'Not given'],
    ['antecedents', 'not known'],
    ['applicant_occupation', 'Not Given '],
    ['recovery_status', ' NOT KNOWN '],
    [PROTECTED, 'not known'],
  ])('%s %j gives no fact', (key, text) => {
    const r = answer(key, text);
    expect(r.next).toBeNull();
    expect(r.result).toMatchObject({ status: 'saved', display: null });
    const rd = readExtraction(
      CL,
      `Said: ${text.trim()}.`,
      {
        facts: [
          {
            key,
            span: text.trim(),
            option: item(key).kind === 'choice' ? text.trim() : undefined,
            confidence: 0.99,
          },
        ],
      },
      2026,
    );
    expect(rd.facts).toEqual([]);
    expect(rd.dropped).toEqual([{ reason: 'no_fact_answer' }]);
  });
  it('"Not known to have any antecedents" IS a fact', () => {
    const t = 'Not known to have any antecedents';
    expect(answer('antecedents', t).next!.facts[0]).toMatchObject({ source: 'asked', raw_span: t });
    expect(isNoFactAnswer(item('antecedents'), t)).toBe(false);
    expect(isNoFactAnswer(item('applicant_occupation'), 'Not given any work')).toBe(false);
  });
  it('"Not known" on a choice from the model is kept out too, and unlocks nothing', () => {
    const r = readExtraction(
      CL,
      'Cooperation is not known.',
      {
        facts: [
          {
            key: 'cooperated_with_investigation',
            span: 'not known',
            option: 'Not known',
            confidence: 0.99,
          },
        ],
      },
      2026,
    );
    expect(r.facts).toEqual([]);
  });
  it('an item the pack does not ask when empty keeps "Not known" as a value', () => {
    expect(isNoFactAnswer({ key: 'police_station', askWhenEmpty: undefined }, 'Not known')).toBe(
      false,
    );
  });
});

describe('T-190 AC8 (ledger): earlier_bail_applications read as "none" from the description is held', () => {
  const nones = (
    LISTS.allowed.find((a) => a.id === 'first_bail_application')!.requires as { equals: string[] }
  ).equals;
  const fact = (value: string, source: string) =>
    ({ ...(idFact(PROTECTED, value) as object), source }) as never;
  it.each(nones)('description-read %j is held, answer is kept', (w) => {
    const held = holdDescriptionNone(
      { facts: [fact(w, 'user')], unresolved: [] },
      PROTECTED,
      nones,
    );
    expect(held.held).toBe(true);
    expect(held.state.facts).toEqual([]);
    expect(
      holdDescriptionNone({ facts: [fact(w, 'asked')], unresolved: [] }, PROTECTED, nones).held,
    ).toBe(false);
  });
  it('a real earlier application read from the description keeps its fact', () => {
    const s = {
      facts: [fact('rejected by the JMFC, Dhanbad on 22.09.2026', 'user')],
      unresolved: [],
    };
    const out = holdDescriptionNone(s as never, PROTECTED, nones);
    expect(out.held).toBe(false);
    expect(out.state.facts).toHaveLength(1);
  });
  it('other keys are never held', () => {
    expect(
      holdDescriptionNone(
        {
          facts: [{ ...(idFact('antecedents', 'none') as object), source: 'user' }] as never,
          unresolved: [],
        },
        PROTECTED,
        nones,
      ).held,
    ).toBe(false);
  });
  it('answering "None" gives an asked fact and first_bail_application is allowed', () => {
    const f = answer(PROTECTED, 'None').next!.facts[0];
    expect(f).toMatchObject({ source: 'asked', raw_span: 'None' });
    const out = resolveAverments(LISTS, [f]);
    expect(out.allowed.map((a) => a.id)).toContain('first_bail_application');
    expect(out.banned.map((b) => b.id)).not.toContain('first_bail_application');
  });
});

describe('T-190 pack text and averment files are unchanged where they must be', () => {
  const sha = (s: Buffer | string) => createHash('sha256').update(s).digest('hex');
  const PINNED: Record<string, string> = {
    // bail_regular and bail_anticipatory re-pinned for T-334 (Ajay, T-334 Addendum 1, signed 9b484ee).
    bail_regular: '14bc53c396b5241ea09c874a5c0a09ccf12c68ed29adabb725dc055db1590b04',
    interim_bail: '8951ebda37020b9527672013595fabc1c1a7c80470d8ceade8f33c4883d3bf66',
    bail_before_magistrate: '6519fdc6a96efbe03d98f71f6f67ab55633e9634e28b6dbffe321e72c50efa56',
    bail_anticipatory: '270a841d242ef26fc74859cfa94b4bf6feb414bbf0a01ffb32f1a7ae8caa83de',
  };
  it.each(Object.keys(PINNED))(
    'T-199 AC5: _averments/%s.json hash is the one Ajay signed (origin/develop_staging)',
    (id) => {
      const path = join(RULES, '_averments', `${id}.json`);
      expect(sha(readFileSync(path))).toBe(PINNED[id]);
      let upstream: Buffer | null = null;
      try {
        upstream = execFileSync(
          'git',
          [
            'show',
            `origin/develop_staging:apps/drafting/src/config/document-rules/_averments/${id}.json`,
          ],
          { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] },
        );
      } catch {
        upstream = null; // no such ref here (shallow clone): the pinned hash stands
      }
      if (upstream) expect(sha(upstream)).toBe(PINNED[id]);
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// Through the routes: AC8, T-199, past-cap, "Not known" loop
// ═════════════════════════════════════════════════════════════════════════════
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994391b1';
const INTAKE_MODEL = 'claude-haiku-4-5-20251001';
const DRAFT_MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'district_sessions_patna';
const headers = () => ({
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test Advocate',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});
const MATCH_BAIL = JSON.stringify({
  template_id: 'bail_regular',
  confidence: 'high',
  alternatives: [],
  is_legal_drafting: true,
  is_court_document: true,
  label: 'legal document',
  category: 'other',
});
const reception = (items: Array<[string, string, string]>) =>
  JSON.stringify({
    outcome: 'read',
    read: items.map(([id, value, quote]) => ({ id, value, quote })),
    conflicts: [],
    questions: [],
  });
const extraction = (...facts: Array<Record<string, unknown>>) => JSON.stringify({ facts });
function mockModel(...contents: string[]) {
  mockMessagesStream.mockReset();
  for (const c of contents) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(c, 900, 120));
}
const describe_ = (description: string, body: Record<string, unknown> = {}) =>
  request(app)
    .post('/intake/brief')
    .set(headers())
    .send({ description, ...body });
const update = (body: Record<string, unknown>) =>
  request(app)
    .post('/intake/brief/update')
    .set(headers())
    .send({ kind: 'bail_regular', ...body });
const ledgerFacts = async (id: string) => {
  const doc = (await FactLedgerModel.findById(id).lean())!;
  return openVersion(doc.versions[doc.currentVersion - 1]).facts;
};
type Q = { key: string; question: string; confirm?: boolean; source?: string };

const DESC =
  'My client Ram Kumar, aged 32, FIR No. 124/2026 at Kotwali police station. Earlier bail applications: None. ' +
  'He is ghar ka akela kamane wala.';
const READ = reception([
  ['applicant_name', 'Ram Kumar', 'My client Ram Kumar'],
  ['earlier_bail_applications', 'None', 'Earlier bail applications: None'],
]);
const F_NAME = { key: 'applicant_name', span: 'Ram Kumar', confidence: 0.99 };
const F_NONE = { key: PROTECTED, span: 'None', confidence: 0.99 };
const F_SOLE = {
  key: 'sole_earning_member',
  span: 'ghar ka akela kamane wala',
  option: 'Yes',
  confidence: 0.95,
};

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await redis.flushall();
  await AppSetting.create({ key: 'ai.intake_model', value: INTAKE_MODEL });
  await AppSetting.create({ key: 'ai.drafting_model', value: DRAFT_MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
  for (const m of [INTAKE_MODEL, DRAFT_MODEL]) {
    await AppSetting.create({
      key: `ai.rates.${m}`,
      value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
    });
  }
  await Court.create({
    courtId: COURT_ID,
    name: 'District & Sessions Court, Patna',
    designation: 'DISTRICT & SESSIONS JUDGE, PATNA',
    courtType: 'sessions',
    state: 'Bihar',
    stateId: 'bihar',
    city: 'Patna',
    formattingRulesRef: 'bihar_district',
  });
  await User.create({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
});
afterEach(() => jest.restoreAllMocks());

const CLAUSE_IDS = loadRulePack('bail_regular')!.mandatoryClauses.map((c) => c.id);
function generate(ledgerId: string) {
  const body = `1. That the applicant Ram Kumar seeks bail.\n\n${CLAUSES_MARKER}\n${CLAUSE_IDS.map((i) => `${i}: 1`).join('\n')}`;
  mockModel(body);
  return request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({
      kind: 'bail_regular',
      court: { state: 'bihar', court_type: 'sessions', court: COURT_ID },
      ledger_id: ledgerId,
      values: [
        { key: 'applicant_name', value: 'Ram Kumar' },
        { key: 'fir_number', value: '124/2026' },
      ],
    });
}
const promptOf = () => {
  const p = mockMessagesStream.mock.calls[0][0] as SdkStreamParams;
  return { system: p.system, user: p.messages[0].content as string };
};
const section = (prompt: string, from: string, to: string) =>
  prompt.slice(prompt.indexOf(from), prompt.indexOf(to));

describe('T-190 AC8 through the routes', () => {
  it('a description-read "none": no fact, the question comes back with confirm, first in the list, signed text', async () => {
    mockModel(MATCH_BAIL, READ, extraction(F_NAME, F_NONE));
    const res = await describe_(DESC);
    expect(res.status).toBe(200);
    expect(res.body.brief.items.find((i: { key: string }) => i.key === PROTECTED).value).toBe(
      'None',
    );
    expect(res.body.ledger.facts.map((f: { key: string }) => f.key)).not.toContain(PROTECTED);
    const q = res.body.questions as Q[];
    expect(q[0]).toMatchObject({
      key: PROTECTED,
      confirm: true,
      source: 'pack',
      question: signedOf(PROTECTED).question,
    });
    expect(q).toHaveLength(Math.min(q.length, 10));
  });

  it('answering "None" gives an asked fact and first_bail_application is allowed in the Drafter prompt', async () => {
    mockModel(MATCH_BAIL, READ, extraction(F_NAME, F_NONE));
    const id = (await describe_(DESC)).body.ledger.ledger_id as string;
    const up = await update({
      ledger_id: id,
      ledger_edits: [{ key: PROTECTED, text: 'None', from_question: true }],
    });
    expect(up.status).toBe(200);
    const f = (await ledgerFacts(id)).find((x) => x.key === PROTECTED)!;
    expect(f).toMatchObject({ source: 'asked', raw_span: 'None' });
    expect((await generate(id)).status).toBe(200);
    const { user } = promptOf();
    expect(section(user, 'AVERMENTS ALLOWED', 'BANNED ASSERTIONS')).toMatch(
      /^- first_bail_application \|/m,
    );
    expect(section(user, 'BANNED ASSERTIONS', '\n\nTARGET:')).not.toMatch(
      /^- first_bail_application \|/m,
    );
  });

  it('skipping leaves no fact: first_bail_application stays banned and the B4 blank instruction is in the prompt', async () => {
    mockModel(MATCH_BAIL, READ, extraction(F_NAME, F_NONE));
    const id = (await describe_(DESC)).body.ledger.ledger_id as string;
    expect((await ledgerFacts(id)).map((x) => x.key)).not.toContain(PROTECTED);
    expect((await generate(id)).status).toBe(200);
    const { system, user } = promptOf();
    expect(section(user, 'AVERMENTS ALLOWED', 'BANNED ASSERTIONS')).not.toMatch(
      /first_bail_application/,
    );
    const banned = section(user, 'BANNED ASSERTIONS', '\n\nTARGET:');
    expect(banned).toMatch(/^- first_bail_application \|/m);
    const blank = (
      JSON.parse(read(join(RULES, 'bail_regular.json'))).promptInstructions as string[]
    )
      .join('\n')
      .match(/\[To be confirmed: whether any earlier bail application[^\]]*\]/)![0];
    expect(system + user).toContain(blank);
    expect(user).not.toMatch(/"key":"earlier_bail_applications"/);
  });

  it('a real earlier application read from the description keeps its fact and is not asked again', async () => {
    const d =
      'My client Ram Kumar. His earlier bail application was rejected by the JMFC, Dhanbad on 22.09.2026.';
    const span = 'rejected by the JMFC, Dhanbad on 22.09.2026';
    mockModel(
      MATCH_BAIL,
      reception([
        ['applicant_name', 'Ram Kumar', 'My client Ram Kumar'],
        [PROTECTED, span, span],
      ]),
      extraction(F_NAME, { key: PROTECTED, span, confidence: 0.99 }),
    );
    const res = await describe_(d);
    expect(res.body.ledger.facts.find((f: { key: string }) => f.key === PROTECTED)).toMatchObject({
      source: 'user',
      raw_span: span,
    });
    const q = res.body.questions as Q[];
    expect(q.map((x) => x.key)).not.toContain(PROTECTED);
    expect(q.some((x) => x.confirm)).toBe(false);
  });
});

describe('T-199 through the routes', () => {
  it('"ghar ka akela kamane wala": a fact that folds to yes, verbatim raw_span, sole_breadwinner allowed', async () => {
    mockModel(
      MATCH_BAIL,
      reception([
        ['applicant_name', 'Ram Kumar', 'My client Ram Kumar'],
        ['sole_earning_member', 'Yes', 'ghar ka akela kamane wala'],
      ]),
      extraction(F_NAME, F_SOLE),
    );
    const res = await describe_(DESC);
    const f = res.body.ledger.facts.find((x: { key: string }) => x.key === 'sole_earning_member');
    expect(f.raw_span).toBe('ghar ka akela kamane wala');
    expect(DESC).toContain(f.raw_span);
    expect(f.source).toBe('user');
    const facts = await ledgerFacts(res.body.ledger.ledger_id);
    const out = resolveAverments(LISTS, facts);
    expect(out.allowed.map((a) => a.id)).toContain('sole_breadwinner');
    expect(out.banned.map((b) => b.id)).not.toContain('sole_breadwinner');
    expect((await generate(res.body.ledger.ledger_id)).status).toBe(200);
    expect(section(promptOf().user, 'AVERMENTS ALLOWED', 'BANNED ASSERTIONS')).toMatch(
      /^- sole_breadwinner \|/m,
    );
  });

  it('not given: banned, and no phrase of it is allowed; the question is asked', async () => {
    mockModel(MATCH_BAIL, READ, extraction(F_NAME));
    const res = await describe_(DESC.replace('ghar ka akela kamane wala', 'a labourer'));
    const id = res.body.ledger.ledger_id as string;
    expect((await ledgerFacts(id)).map((x) => x.key)).not.toContain('sole_earning_member');
    expect((await generate(id)).status).toBe(200);
    const { user } = promptOf();
    expect(section(user, 'AVERMENTS ALLOWED', 'BANNED ASSERTIONS')).not.toMatch(/sole_breadwinner/);
    expect(section(user, 'BANNED ASSERTIONS', '\n\nTARGET:')).toMatch(/^- sole_breadwinner \|/m);
  });

  it.each(['No', 'Not known'])('"%s" means no phrase', (opt) => {
    const r = readExtraction(CL, DESC, { facts: [{ ...F_SOLE, option: opt }] }, 2026);
    const out = resolveAverments(LISTS, r.facts);
    expect(out.allowed.map((a) => a.id)).not.toContain('sole_breadwinner');
    expect(out.banned.map((b) => b.id)).toContain('sole_breadwinner');
    if (opt === 'Not known') expect(r.facts).toEqual([]);
  });

  it('a model that stores the words themselves (not an option) writes no fact: banned', () => {
    const r = readExtraction(
      CL,
      DESC,
      { facts: [{ ...F_SOLE, option: 'akela kamane wala' }] },
      2026,
    );
    expect(r.facts).toEqual([]);
    expect(resolveAverments(LISTS, r.facts).banned.map((b) => b.id)).toContain('sole_breadwinner');
  });

  it('dependants 10b: the answer unlocks family_dependent_on_applicant', () => {
    const f = answer('dependants', 'Aged mother and two minor children').next!.facts[0];
    expect(
      resolveAverments(LISTS, [f]).allowed.find((a) => a.id === 'family_dependent_on_applicant')!
        .text,
    ).toContain(f.display);
  });
});

describe('T-190 past-cap items and "Not known" through the routes', () => {
  it('Arjun (c) and (4): past-cap items are not asked, write no fact, and stay in the brief as blanks', async () => {
    mockModel(MATCH_BAIL, reception([]), extraction());
    const res = await describe_('Please prepare a bail application.');
    const q = res.body.questions as Q[];
    expect(q).toHaveLength(10);
    const asked = new Set(q.map((x) => x.key));
    const past = ORDER.filter((k) => !asked.has(k));
    expect(past.length).toBeGreaterThan(5);
    expect(res.body.ledger.facts).toEqual([]);
    for (const k of past) {
      const it_ = res.body.brief.items.find((i: { key: string }) => i.key === k);
      expect(it_).toBeDefined();
      expect(it_.value).toBeNull();
      expect(it_.placeholder).toBeTruthy();
      expect(it_.asked_empty).toBeUndefined();
    }
    expect((await ledgerFacts(res.body.ledger.ledger_id)).length).toBe(0);
    expect(q[0].key).toBe('applicant_name');
    expect(q[1].key).toBe(PROTECTED);
  });

  it('Arjun cond 3: "Not known" on an update comes back asked_empty (no value, no loop) and writes no fact', async () => {
    mockModel(MATCH_BAIL, reception([]), extraction());
    const id = (await describe_('Please prepare a bail application.')).body.ledger
      .ledger_id as string;
    const up = await update({
      ledger_id: id,
      ledger_edits: [{ key: 'investigation_status', text: 'Not known', from_question: true }],
      values: [{ key: 'investigation_status', value: 'Not known', source: 'user' }],
    });
    expect(up.status).toBe(200);
    const it_ = up.body.brief.items.find((i: { key: string }) => i.key === 'investigation_status');
    expect(it_).toMatchObject({ value: null, asked_empty: true });
    expect((await ledgerFacts(id)).map((x) => x.key)).not.toContain('investigation_status');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Round 2
// ═════════════════════════════════════════════════════════════════════════════
describe('T-190 round 2 (Ajay): a displaced REQUIRED alwaysAsk key reaches the Drafter prompt as {{MISSING: label}}', () => {
  it('overflow through the routes: 9 required keys unresolved fill the cap with the party name; the lowest is not asked and is a {{MISSING: label}} in FACTS', async () => {
    const d =
      'Ram Kumar son of Hari Kumar, aged 32, of 123 Main St, Patna. FIR 124/2026 dated 10.03.2026 at Kotwali police station. ' +
      'He was picked up from his shop. He is in custody. He seeks bail on the ground of delay.';
    const custody = item('currently_in_custody').options[0];
    const low = 0.1; // below the confidence floor: the fact goes to unresolved, not to the ledger
    const e = (key: string, span: string, option?: string) => ({
      key,
      span,
      confidence: low,
      ...(option ? { option } : {}),
    });
    mockModel(
      MATCH_BAIL,
      reception([]),
      extraction(
        e('fir_number', '124/2026'),
        e('fir_date', '10.03.2026'),
        e('police_station', 'Kotwali'),
        e('currently_in_custody', 'in custody', custody),
        e('father_name', 'Hari Kumar'),
        e('applicant_age', '32'),
        e('address', '123 Main St, Patna'),
        e('facts_narrative', 'He was picked up from his shop'),
        e('sections_charged', 'FIR 124/2026'),
        e('grounds_for_bail', 'delay', item('grounds_for_bail').options[0]),
      ),
    );
    const res = await describe_(d);
    expect(res.status).toBe(200);
    const id = res.body.ledger.ledger_id as string;
    const unresolved = (res.body.ledger.unresolved as Array<{ key: string }>).map((u) => u.key);
    expect(res.body.ledger.facts).toEqual([]);
    const required = CL.filter((i) => i.required && !i.partyName).map((i) => i.key);
    // the always set is the required non-party keys that came back unresolved, in brief order
    const always = required.filter((k) => unresolved.includes(k));
    expect(always.length).toBeGreaterThanOrEqual(9); // party name (1) + alwaysAsk (>= 9) fill the cap

    const q = (res.body.questions as Q[]).map((x) => x.key);
    expect(q).toHaveLength(10);
    expect(q.slice(0, 2)).toEqual(['applicant_name', PROTECTED]); // the party name is kept, the protected key is asked
    expect(q.slice(2)).toEqual(always.slice(0, 8)); // the rest are alwaysAsk, in rank order
    const displaced = always.slice(8);
    expect(displaced.length).toBeGreaterThanOrEqual(1);
    for (const k of displaced) expect(q).not.toContain(k);

    expect((await generate(id)).status).toBe(200);
    const { user } = promptOf();
    const facts = JSON.parse(user.slice(user.indexOf('FACTS:\n') + 7).split('\n\n')[0]) as {
      facts: unknown[];
      missing: Array<{ key: string; label: string; write: string }>;
    };
    for (const k of displaced) {
      const m = facts.missing.find((x) => x.key === k);
      expect(m).toBeDefined();
      expect(m!.write).toBe(`{{MISSING: ${item(k).label}}}`);
      expect(user).toContain(`{{MISSING: ${item(k).label}}}`);
    }
    // nothing the advocate was not asked is turned into a fact
    expect(facts.facts).toEqual([]);
  });
});

describe('T-190 round 2 reviewer fix 1: only source "user" marks asked_empty', () => {
  const build = (pack: string, key: string, value: string, source: 'description' | 'user') => {
    const cl = buildChecklist(loadRulePack(pack)!);
    const brief = buildBrief({
      kind: KIND(pack),
      checklist: cl,
      values: [...typicalValues(cl), { key, value, quote: '', source }],
    }) as Brief;
    return {
      cl,
      brief,
      it_: brief.items.find((i) => i.key === key)!,
      asked: keysOf(buildQuestions(brief, new Map(), new Set(), new Set(), { checklist: cl })),
    };
  };

  it.each([['Not known'], ['not given'], [' NOT KNOWN ']])(
    'description-read %j on earlier_bail_applications: no fact, not asked_empty, still asked first after the party names',
    (w) => {
      const { it_, asked, brief, cl } = build('bail_regular', PROTECTED, w, 'description');
      expect(it_.value).toBeNull();
      expect(it_.asked_empty).toBeUndefined();
      expect(asked).toContain(PROTECTED);
      const q = buildQuestions(brief, new Map(), new Set(), new Set(), { checklist: cl });
      expect(q.map((x) => x.key).indexOf(PROTECTED)).toBe(
        brief.items.filter((i) => i.party_name && isEmptyV(i.value) && i.required).length,
      );
      expect(q.find((x) => x.key === PROTECTED)!.confirm).toBeUndefined();
    },
  );

  it.each([
    ['investigation_status', 'Not known'],
    ['applicant_sex', 'Not given'],
    ['antecedents', 'not known'],
    ['named_in_fir', 'Not known'],
  ])(
    'description-read %s %j (another ask_when_empty item): no fact, not asked_empty, still asked',
    (key, w) => {
      const { it_, asked } = build('bail_regular', key, w, 'description');
      expect(it_.value).toBeNull();
      expect(it_.asked_empty).toBeUndefined();
      expect(asked).toContain(key);
    },
  );

  it.each([
    ['medical_condition', 'none'],
    ['local_ties', 'Nil'],
    ['dependants', 'N/A'],
  ])('description-read none on %s: no value, not asked_empty', (key, w) => {
    const { it_ } = build('bail_regular', key, w, 'description');
    expect(it_.value).toBeNull();
    expect(it_.asked_empty).toBeUndefined();
  });

  it('a description "Not known" does not undo an answer the advocate already gave on the same key', () => {
    const cl = buildChecklist(loadRulePack('bail_regular')!);
    const brief = buildBrief({
      kind: KIND('bail_regular'),
      checklist: cl,
      values: [
        { key: 'investigation_status', value: 'Charge sheet filed', quote: '', source: 'user' },
        { key: 'investigation_status', value: 'Not known', quote: '', source: 'description' },
      ],
    }) as Brief;
    const i = brief.items.find((x) => x.key === 'investigation_status')!;
    expect(i.value).toBe('Charge sheet filed');
    expect(i.asked_empty).toBeUndefined();
  });

  it.each([
    [PROTECTED, 'Not known'],
    ['investigation_status', 'Not known'],
    ['applicant_sex', 'Not given'],
    ['medical_condition', 'None'],
  ])("the advocate's own %s %j (source user): no fact, asked_empty, not asked again", (key, w) => {
    const { it_, asked, brief, cl } = build('bail_regular', key, w, 'user');
    expect(it_.value).toBeNull();
    expect(it_.asked_empty).toBe(true);
    expect(asked).not.toContain(key);
    // confirm is the only way back (Arjun cond 3)
    const re = buildQuestions(brief, new Map(), new Set(), new Set(), {
      checklist: cl,
      confirm: new Set([key]),
    });
    expect(re.find((x) => x.key === key)).toMatchObject({ confirm: true });
  });

  it('the advocate answering "Not known" after the description said "Not known": the second marks asked_empty', () => {
    const cl = buildChecklist(loadRulePack('bail_regular')!);
    const brief = buildBrief({
      kind: KIND('bail_regular'),
      checklist: cl,
      values: [
        { key: PROTECTED, value: 'Not known', quote: '', source: 'description' },
        { key: PROTECTED, value: 'Not known', quote: '', source: 'user' },
      ],
    }) as Brief;
    expect(brief.items.find((x) => x.key === PROTECTED)!.asked_empty).toBe(true);
  });

  it('through the route: the description says "Not known"; the question is still asked and the item is not asked_empty', async () => {
    mockModel(
      MATCH_BAIL,
      reception([
        ['applicant_name', 'Ram Kumar', 'My client Ram Kumar'],
        [PROTECTED, 'Not known', 'Earlier bail applications: Not known'],
      ]),
      extraction(F_NAME),
    );
    const res = await describe_(
      'My client Ram Kumar, FIR No. 124/2026. Earlier bail applications: Not known.',
    );
    expect(res.status).toBe(200);
    const bi = res.body.brief.items.find((i: { key: string }) => i.key === PROTECTED);
    expect(bi.value).toBeNull();
    expect(bi.asked_empty).toBeUndefined();
    expect((res.body.questions as Q[]).map((x) => x.key)).toContain(PROTECTED);
  });
});

describe('T-190 round 2 reviewer fix 2: isNoFactAnswer needs askWhenEmpty', () => {
  const noAsk = (key: string): ChecklistItem => ({ ...item(key), askWhenEmpty: undefined });

  it.each(['dependants', 'medical_condition', 'local_ties', 'co_accused_bail_court'])(
    '%s without askWhenEmpty keeps "none" and "Not known" as values; with askWhenEmpty they are no fact',
    (key) => {
      for (const w of ['none', 'Nil', 'N/A', 'Not known']) {
        expect(isNoFactAnswer(noAsk(key), w)).toBe(false);
        expect(isNoFactAnswer({ key, askWhenEmpty: false } as never, w)).toBe(false);
        expect(isNoFactAnswer(item(key), w)).toBe(true);
      }
    },
  );

  it('buildBrief: a checklist item named dependants / medical_condition without askWhenEmpty keeps "none" as its value', () => {
    const cl = buildChecklist(loadRulePack('bail_regular')!).map((i) =>
      i.key === 'dependants' || i.key === 'medical_condition'
        ? { ...i, askWhenEmpty: undefined }
        : i,
    );
    const brief = buildBrief({
      kind: KIND('bail_regular'),
      checklist: cl,
      values: [
        { key: 'dependants', value: 'none', quote: '', source: 'user' },
        { key: 'medical_condition', value: 'None', quote: '', source: 'user' },
      ],
    }) as Brief;
    for (const k of ['dependants', 'medical_condition']) {
      const i = brief.items.find((x) => x.key === k)!;
      expect(i.value).toBe(k === 'dependants' ? 'none' : 'None');
      expect(i.asked_empty).toBeUndefined();
    }
  });

  it('the same two items with askWhenEmpty (the bail pack): "none" is no value and asked_empty', () => {
    const brief = buildBrief({
      kind: KIND('bail_regular'),
      checklist: CL,
      values: [
        { key: 'dependants', value: 'none', quote: '', source: 'user' },
        { key: 'medical_condition', value: 'None', quote: '', source: 'user' },
      ],
    }) as Brief;
    for (const k of ['dependants', 'medical_condition']) {
      const i = brief.items.find((x) => x.key === k)!;
      expect(i.value).toBeNull();
      expect(i.asked_empty).toBe(true);
    }
  });

  it('a pack that does not ask the key when empty: a "none" answer written to the ledger is a fact', () => {
    const cl = CL.map((i) =>
      i.key === 'medical_condition' ? { ...i, askWhenEmpty: undefined } : i,
    );
    const r = applyEdit(
      EMPTY,
      cl.find((i) => i.key === 'medical_condition'),
      { key: 'medical_condition', text: 'None', fromQuestion: true },
      2026,
    );
    expect(r.next!.facts[0]).toMatchObject({ key: 'medical_condition', raw_span: 'None' });
  });
});
