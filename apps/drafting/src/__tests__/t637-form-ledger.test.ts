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
  it('is a no-op for now (T-629 fills it in)', () => {
    expect(formRequiredFieldBlock('bail_regular', { applicant_name: 'x' })).toBeNull();
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
