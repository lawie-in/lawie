/**
 * T-637 (Arjun option B): the in-memory ledger the form route and the no-ledger brief route
 * build for the T-611 gate, and the form route's `[To be confirmed: X]` rule (Ajay 06d18fed).
 */
import type { LedgerFact } from '@lawie/shared';

import { heldLabelBlanksAsMissing } from '../services/ai.service';
import {
  briefLedgerValues,
  buildInMemoryLedger,
  formLedgerValues,
  formRequiredFieldBlock,
  isNoFactNonAnswer,
  NEVER_FILLED_ANSWERS,
  NO_FACT_ANSWERS,
  withoutNeverFilledFacts,
} from '../services/form-ledger';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';

const PACK = loadRulePack('bail_regular')!;
const CHECKLIST = buildChecklist(PACK);
const label = (key: string) => CHECKLIST.find((i) => i.key === key)!.label;
const factsFor = (state: ReturnType<typeof buildInMemoryLedger>, key: string) =>
  state.facts.filter((f) => f.key === key);

describe('buildInMemoryLedger', () => {
  it('a choice sent as its option id becomes the option label', () => {
    const s = buildInMemoryLedger(PACK, [
      { key: 'currently_in_custody', value: 'yes_judicial', source: 'asked' },
    ]);
    const f = factsFor(s, 'currently_in_custody');
    expect(f).toHaveLength(1);
    expect(f[0].display).toBe('Yes — Judicial custody');
    expect(f[0].source).toBe('asked');
  });

  it('a boolean becomes the Yes / No choice', () => {
    const s = buildInMemoryLedger(PACK, [
      { key: 'named_in_fir', value: true, source: 'asked' },
      { key: 'cooperated_with_investigation', value: false, source: 'asked' },
    ]);
    expect(factsFor(s, 'named_in_fir')[0].display).toBe('Yes');
    expect(factsFor(s, 'cooperated_with_investigation')[0].display).toBe('No');
  });

  it('a checkbox array on a several-choice fact gives one fact per option, by label', () => {
    const s = buildInMemoryLedger(PACK, [
      { key: 'grounds_for_bail', value: ['false_implication', 'no_flight_risk'], source: 'asked' },
    ]);
    expect(factsFor(s, 'grounds_for_bail').map((f) => f.display)).toEqual([
      'Falsely implicated due to enmity / mistaken identity',
      'Not a flight risk — deep roots in society',
    ]);
  });

  it('a value that cannot be read as text goes to unresolved, never into the facts', () => {
    const s = buildInMemoryLedger(PACK, [
      { key: 'applicant_name', value: { nested: 'x' }, source: 'asked' },
    ]);
    expect(factsFor(s, 'applicant_name')).toEqual([]);
    expect(s.unresolved).toHaveLength(1);
    expect(s.unresolved[0]).toMatchObject({ key: 'applicant_name', reason: 'not_a_string' });
    expect(JSON.stringify(s.unresolved)).not.toContain('nested');
  });

  it('an empty value, a placeholder blank and a key the checklist does not hold give no fact', () => {
    const s = buildInMemoryLedger(PACK, [
      { key: 'applicant_name', value: '   ', source: 'asked' },
      { key: 'father_name', value: '[To be confirmed: Father]', source: 'asked' },
      { key: 'address', value: '_____', source: 'asked' },
      { key: 'police_station', value: undefined, source: 'asked' },
      { key: 'no_such_key', value: 'x', source: 'asked' },
    ]);
    expect(s).toEqual({ facts: [], unresolved: [] });
  });

  it('"Not known" from the brief gives no fact (asked_empty is skipped before the ledger)', () => {
    const values = briefLedgerValues({
      items: [
        {
          key: 'address',
          value: 'Not known',
          source: 'user',
          asked_empty: true,
        },
      ],
    } as never);
    expect(values).toEqual([]);
    expect(buildInMemoryLedger(PACK, values)).toEqual({ facts: [], unresolved: [] });
  });

  it('a user source is kept as `user`; the later value for a key replaces the earlier one', () => {
    const s = buildInMemoryLedger(PACK, [
      { key: 'police_station', value: 'Sadar', source: 'asked' },
      { key: 'police_station', value: 'Kotwali', source: 'user' },
    ]);
    const f = factsFor(s, 'police_station');
    expect(f).toHaveLength(1);
    expect(f[0].display).toBe('Kotwali');
    expect(f[0].source).toBe('user');
  });
});

describe('formLedgerValues', () => {
  it('gives every form answer the source `asked`, keyed by field id', () => {
    const v = formLedgerValues({ applicant_name: 'Ramesh', sections_charged: ['318'], flag: true });
    expect(v).toEqual([
      { key: 'applicant_name', value: 'Ramesh', source: 'asked' },
      { key: 'sections_charged', value: ['318'], source: 'asked' },
      { key: 'flag', value: true, source: 'asked' },
    ]);
    expect(v.every((x) => x.source === 'asked')).toBe(true);
  });

  it('every fact built from a form is `asked`', () => {
    const s = buildInMemoryLedger(
      PACK,
      formLedgerValues({ applicant_name: 'Ramesh Kumar Yadav', police_station: 'Kotwali' }),
    );
    expect(s.facts.length).toBe(2);
    expect(s.facts.every((f) => f.source === 'asked')).toBe(true);
  });
});

describe('briefLedgerValues', () => {
  const item = (over: Record<string, unknown>) => ({
    key: 'k',
    value: 'v',
    source: 'user',
    ...over,
  });
  it('a description item is `user`, a typed item is `asked`; asked_empty, unconfirmed and empty items are left out', () => {
    const out = briefLedgerValues({
      items: [
        item({ key: 'a', source: 'description' }),
        item({ key: 'b', source: 'user' }),
        item({ key: 'c', asked_empty: true }),
        item({ key: 'd', unconfirmed: true }),
        item({ key: 'e', value: null }),
        item({ key: 'f', source: null }),
      ],
    } as never);
    expect(out).toEqual([
      { key: 'a', value: 'v', source: 'user' },
      { key: 'b', value: 'v', source: 'asked' },
    ]);
  });
});

describe('formRequiredFieldBlock', () => {
  it('still returns null for another template, even with empty fields (T-629 blocks only temporary_injunction_o39)', () => {
    expect(formRequiredFieldBlock('bail_regular', { applicant_name: 'x' })).toBeNull();
    expect(
      formRequiredFieldBlock('bail_regular', { main_suit_relief: '', restraint_sought: '' }),
    ).toBeNull();
  });
});

describe('heldLabelBlanksAsMissing (Ajay 06d18fed)', () => {
  const state = buildInMemoryLedger(
    PACK,
    formLedgerValues({ address: '123 Main St, Patna', police_station: 'Kotwali' }),
  );
  const facts: LedgerFact[] = state.facts;

  it('a held label becomes {{MISSING: label}}', () => {
    const L = label('address');
    expect(heldLabelBlanksAsMissing(`resident of [To be confirmed: ${L}] here`, facts)).toBe(
      `resident of {{MISSING: ${L}}} here`,
    );
  });

  it('an unheld label, an empty label and a nested-brace label are left alone', () => {
    const text =
      'a [To be confirmed: Applicant occupation] b [To be confirmed: ] c [To be confirmed: {x}] d _____';
    expect(heldLabelBlanksAsMissing(text, facts)).toBe(text);
  });

  it('a mix: only the held label changes; _____ and plain text are untouched', () => {
    const L = label('police_station');
    const out = heldLabelBlanksAsMissing(
      `PS [To be confirmed: ${L}] and [To be confirmed: Occupation] and _____`,
      facts,
    );
    expect(out).toBe(`PS {{MISSING: ${L}}} and [To be confirmed: Occupation] and _____`);
  });

  it('with no held facts nothing changes', () => {
    const text = `[To be confirmed: ${label('address')}]`;
    expect(heldLabelBlanksAsMissing(text, [])).toBe(text);
  });
});

describe('Ajay FR-9 (4813ba79): non-answers give no fact', () => {
  it("the constants are exactly Ajay's lists", () => {
    expect([...NO_FACT_ANSWERS]).toEqual([
      'not known',
      'unknown',
      'नहीं पता',
      'पता नहीं',
      '?',
      '-',
    ]);
    expect([...NEVER_FILLED_ANSWERS]).toEqual(['none', 'nil', 'NA', 'N/A', 'no']);
  });

  it('isNoFactNonAnswer matches each entry, in any case, trimmed', () => {
    for (const a of NO_FACT_ANSWERS) {
      expect(isNoFactNonAnswer(a)).toBe(true);
      expect(isNoFactNonAnswer(`  ${a.toUpperCase()}  `)).toBe(true);
    }
    expect(isNoFactNonAnswer('Not Known')).toBe(true);
    expect(isNoFactNonAnswer('UNKNOWN')).toBe(true);
    expect(isNoFactNonAnswer('not   known')).toBe(true);
  });

  it('isNoFactNonAnswer ignores the nukta and accepts the not_known option id', () => {
    expect(isNoFactNonAnswer('नहीं पता')).toBe(true);
    // Nukta (U+093C) added after a consonant, precomposed and decomposed forms.
    expect(isNoFactNonAnswer('नहीं प\u093Cता')).toBe(true);
    expect(isNoFactNonAnswer('प\u093Cता नहीं')).toBe(true);
    expect(isNoFactNonAnswer('न\u093Cहीं पता'.normalize('NFC'))).toBe(true);
    expect(isNoFactNonAnswer('पता न\u093Cहीं'.normalize('NFD'))).toBe(true);
    expect(isNoFactNonAnswer('not_known')).toBe(true);
    expect(isNoFactNonAnswer(' NOT_KNOWN ')).toBe(true);
  });

  it('isNoFactNonAnswer is whole-answer only', () => {
    for (const t of ['not known yet', 'unknown to me', 'Kotwali', '', '   ', '- 5', 'none', 'no']) {
      expect(isNoFactNonAnswer(t)).toBe(false);
    }
  });

  it('a typed "Not known" in a free-text field gives no fact', () => {
    const s = buildInMemoryLedger(PACK, [{ key: 'address', value: 'Not known', source: 'asked' }]);
    expect(s).toEqual({ facts: [], unresolved: [] });
  });

  it('the not_known option id gives no fact; a real option still does', () => {
    const none = buildInMemoryLedger(PACK, [
      { key: 'investigation_status', value: 'not_known', source: 'asked' },
    ]);
    expect(none).toEqual({ facts: [], unresolved: [] });
    const real = buildInMemoryLedger(PACK, [
      { key: 'investigation_status', value: 'under_investigation', source: 'asked' },
    ]);
    expect(factsFor(real, 'investigation_status')).toHaveLength(1);
  });

  it('a list made only of non-answers gives no fact', () => {
    const s = buildInMemoryLedger(PACK, [
      { key: 'sections_charged', value: ['unknown', '-', '?'], source: 'asked' },
    ]);
    expect(s).toEqual({ facts: [], unresolved: [] });
  });

  it('none / nil / NA / N/A / no typed in a free-text field stay facts', () => {
    for (const t of ['none', 'NIL', 'NA', 'N/A', 'No']) {
      const s = buildInMemoryLedger(PACK, [{ key: 'address', value: t, source: 'asked' }]);
      expect(factsFor(s, 'address')).toHaveLength(1);
    }
  });

  it('withoutNeverFilledFacts drops none / nil / NA / N/A / no in any case and keeps the rest', () => {
    const mk = (display: string, i: number) =>
      ({ id: `f${i}`, key: `k${i}`, display, value: display }) as unknown as LedgerFact;
    const drop = ['none', 'None', 'NIL', 'nil', 'NA', 'na', 'N/A', 'n/a', 'No', ' no '].map(mk);
    const keep = ['Kotwali', 'Yes', 'Not known', 'Nobody', 'Nilesh'].map((d, i) => mk(d, 100 + i));
    const out = withoutNeverFilledFacts([...drop, ...keep]);
    expect(out.map((f) => f.display)).toEqual(['Kotwali', 'Yes', 'Not known', 'Nobody', 'Nilesh']);
  });
});
