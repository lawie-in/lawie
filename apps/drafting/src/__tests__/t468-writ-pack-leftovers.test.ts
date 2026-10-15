/**
 * T-468: three leftover wording fixes in the writ packs after T-448 (Ajay, 15 Oct 2026,
 * T-245 file 65a9fe1a). Expected strings are typed by hand here, not read from any pack.
 * Mutation checks run on in-memory clones; the pack JSON is never written.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const RULES_DIR = join(__dirname, '..', 'config', 'document-rules');
type Pack = Record<string, any>;
const raw = (id: string) => readFileSync(join(RULES_DIR, `${id}.json`), 'utf8');
const load = (id: string): Pack => JSON.parse(raw(id));
const clone = (p: Pack): Pack => JSON.parse(JSON.stringify(p));
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

const HABEAS_DESC =
  'Arrest by police — when permissible; conditions for arrest without warrant in offences punishable up to 7 years: S.35(1)(b) BNSS [S.41(1)(b) CrPC]';
const MANDAMUS_RULE =
  'Grounds must show a public legal duty, a clear legal right of the petitioner, demand and refusal, and no equally efficacious alternative remedy';
const CERT_OPENING =
  'Certiorari issues to quash an order of an inferior tribunal or quasi-judicial authority on these grounds only:';
const ART_227 =
  'Certiorari lies over tribunals and quasi-judicial authorities; against judicial orders of civil courts the route is Article 227, not Article 226 certiorari.';
const S =
  'Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].';
const NAMES = [/Mansukhlal/i, /Chauhan/i, /Arnesh/i];

// ── (a) habeas corpus ───────────────────────────────────────────────────────

const habeasS35 = (p: Pack) => {
  const acts = p.relevantActs.filter((a: any) => /BNSS/.test(a.act));
  return acts.flatMap((a: any) => a.sections.filter((s: any) => s.number === 'S.35'));
};
const habeasCheck = (p: Pack) => {
  const e = habeasS35(p);
  expect(e).toHaveLength(1);
  expect(e[0].description).toBe(HABEAS_DESC);
  const s = JSON.stringify(p);
  expect(s).not.toContain('S.35(7)');
  expect(s).not.toContain('Arnesh');
};

describe('T-468 (1): habeas_corpus BNSS S.35 description', () => {
  it('is the signed wording, once, in the BNSS S.35 entry', () =>
    habeasCheck(load('habeas_corpus')));

  it('S.35(7) and Arnesh appear nowhere in the file text', () => {
    const t = raw('habeas_corpus');
    expect(t).not.toContain('S.35(7)');
    expect(t).not.toContain('Arnesh');
    expect(count(t, HABEAS_DESC)).toBe(1);
  });

  it('model-visible habeas text carries no Arnesh / Mansukhlal / Chauhan', () => {
    const p = load('habeas_corpus');
    const t = JSON.stringify([p.prompt_context, p.mandatory_clauses, p.relevantActs]);
    for (const n of NAMES) expect(t).not.toMatch(n);
  });
});

// ── (b) mandamus ────────────────────────────────────────────────────────────

const MUST_RULES = [
  { rule: 'MUST cite Article 226 or 32', severity: 'blocker' },
  { rule: 'MUST identify specific statutory provision imposing duty', severity: 'blocker' },
  { rule: 'MUST plead demand and refusal/inaction', severity: 'blocker' },
  { rule: 'MUST address alternative remedy', severity: 'high' },
];
const mandamusCheck = (p: Pack) => {
  const rules: Array<{ rule: string; severity: string }> = p.validation_rules;
  const hits = rules.filter((r) => r.rule === MANDAMUS_RULE);
  expect(hits).toEqual([{ rule: MANDAMUS_RULE, severity: 'medium' }]);
  for (const r of rules) {
    expect(r.rule).not.toContain('MUST cite Mansukhlal');
    for (const n of NAMES) expect(r.rule).not.toMatch(n);
  }
};

describe('T-468 (2): mandamus validation rule', () => {
  it('has the four-conditions rule exactly once, severity medium; no rule names a judgment', () =>
    mandamusCheck(load('mandamus')));

  it('the four other "MUST ..." rules are unchanged', () => {
    const rules: Array<{ rule: string; severity: string }> = load('mandamus').validation_rules;
    const musts = rules.filter((r) => /^MUST /.test(r.rule));
    expect(musts).toEqual(MUST_RULES);
  });

  it('the rule says nothing starting with "MUST cite" other than Article 226 or 32', () => {
    const cites = load('mandamus').validation_rules.filter((r: any) => /MUST cite/.test(r.rule));
    expect(cites.map((r: any) => r.rule)).toEqual(['MUST cite Article 226 or 32']);
  });
});

// ── (c) certiorari ──────────────────────────────────────────────────────────

const certCheck = (p: Pack) => {
  const sr: string = p.prompt_context.system_role;
  expect(count(sr, CERT_OPENING)).toBe(1);
  expect(sr).not.toContain('tribunal/court');
  expect(sr).toContain(ART_227);
};

describe('T-468 (3): certiorari system_role opening', () => {
  it('has the signed opening once, no "tribunal/court", and keeps the Article 227 sentence', () =>
    certCheck(load('certiorari')));

  it('the Article 227 sentence is present once', () => {
    expect(count(load('certiorari').prompt_context.system_role, ART_227)).toBe(1);
  });
});

// ── (d) T-448 invariants still hold for the changed packs ───────────────────

describe('T-468: T-448 invariants hold for the changed packs', () => {
  it.each(['mandamus', 'certiorari'])(
    '%s: S once in the file, last promptInstructions entry, no top-level promptInstructions',
    (id) => {
      const p = load(id);
      expect(count(JSON.stringify(p), S)).toBe(1);
      const ins: string[] = p.prompt_context.promptInstructions;
      expect(ins[ins.length - 1]).toBe(S);
      expect(p.promptInstructions).toBeUndefined();
    },
  );

  it.each(['mandamus', 'certiorari'])('%s: model-visible text has no denylisted name', (id) => {
    const p = load(id);
    const t = JSON.stringify([
      p.prompt_context,
      p.mandatory_clauses,
      p.mandatoryClauses,
      p.relevantActs,
      p.prayerTemplate,
      p.verificationTemplate,
    ]);
    for (const n of [...NAMES, /Wednesbury/i, /Maneka/i, /\(\d{4}\)/, /\b(AIR|SCC|SCR)\b/])
      expect(t).not.toMatch(n);
  });
});

// ── Mutation checks: reverting each line makes its assertion fail ───────────

describe('T-468: mutation checks (in-memory clones)', () => {
  it('baselines pass on clones', () => {
    habeasCheck(clone(load('habeas_corpus')));
    mandamusCheck(clone(load('mandamus')));
    certCheck(clone(load('certiorari')));
  });

  it('habeas: reverting to the S.35(7) Arnesh Kumar wording fails', () => {
    const p = clone(load('habeas_corpus'));
    habeasS35(p)[0].description =
      'Arrest by police — when permissible; S.35(7) Arnesh Kumar safeguard';
    expect(() => habeasCheck(p)).toThrow();
  });

  it('mandamus: reverting to "MUST cite Mansukhlal Vithaldas Chauhan or equivalent" fails', () => {
    const p = clone(load('mandamus'));
    const r = p.validation_rules.find((x: any) => x.rule === MANDAMUS_RULE);
    r.rule = 'MUST cite Mansukhlal Vithaldas Chauhan or equivalent';
    expect(() => mandamusCheck(p)).toThrow();
  });

  it('mandamus: changing severity fails', () => {
    const p = clone(load('mandamus'));
    p.validation_rules.find((x: any) => x.rule === MANDAMUS_RULE).severity = 'high';
    expect(() => mandamusCheck(p)).toThrow();
  });

  it('certiorari: reverting to "tribunal/court/quasi-judicial" fails', () => {
    const p = clone(load('certiorari'));
    p.prompt_context.system_role = p.prompt_context.system_role.replace(
      'inferior tribunal or quasi-judicial authority',
      'inferior tribunal/court/quasi-judicial authority',
    );
    expect(() => certCheck(p)).toThrow();
  });
});
