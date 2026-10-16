/**
 * T-472: limitation, computed by code (limitation.service.ts). Pure unit tests.
 *
 * Every expected string and number here is typed by hand: the three printed
 * texts from Ajay's signed file (handoff/legal/T-245-old-new-law-switch-signed.md,
 * "Anushka run 4", item T-472), the day counts worked out on a calendar.
 * Nothing is read from the service to build an expectation.
 *
 * Calendar used throughout: order 2026-01-01.
 *   day 90 = 2026-04-01 (Jan 31 + Feb 28 + Mar 31 = 90), day 91 = 2026-04-02,
 *   2026-05-12 = day 131 (Apr 30 more = 120, May 12 = 131).
 *
 * A  the day count        B  s.12(2) and the copy question   C  unknown cases
 * D  the signed strings   E  readers        F  the computed fact
 * G  enforceLimitationText(In) and numbering   H  mutation checks
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import type { LedgerFact } from '@lawie/shared';

import {
  LIMITATION_RULES,
  computeLimitation,
  enforceLimitationText,
  enforceLimitationTextDetailed,
  enforceLimitationTextIn,
  limitationAnswerOf,
  limitationDateOf,
  limitationInputFromLedger,
  limitationInputFromValues,
  limitationRuleFor,
  renumberParagraphs,
  withLimitationFact,
  type LimitationInput,
  type LimitationRule,
} from '../services/limitation.service';

// ── Ajay's signed text, typed literally ─────────────────────────────────────
const PROVISION = 'Article 131 of the Schedule to the Limitation Act, 1963';
const WITHIN = `The present petition is filed within the period of limitation prescribed under ${PROVISION}.`;
const BEYOND_41 = `The present petition is filed after the period of limitation prescribed under ${PROVISION}, with a delay of 41 days. The petitioner has filed a separate application under Section 5 of the Limitation Act, 1963 for condonation of the delay, which may be read as part of this petition.`;
const BEYOND_1 = `The present petition is filed after the period of limitation prescribed under ${PROVISION}, with a delay of 1 day. The petitioner has filed a separate application under Section 5 of the Limitation Act, 1963 for condonation of the delay, which may be read as part of this petition.`;
const UNKNOWN = '[To be confirmed: whether the petition is within limitation]';
const S5_ITEM =
  'Application under Section 5 of the Limitation Act, 1963 for condonation of delay, supported by an affidavit stating the cause of the delay.';

const rule = LIMITATION_RULES.criminal_revision as LimitationRule;
const ok = (iso: string) => ({ state: 'ok', iso }) as const;
const none = { state: 'none' } as const;
const bad = { state: 'unusable' } as const;
const yes = { state: 'ok', value: true } as const;
const no = { state: 'ok', value: false } as const;

function input(over: Partial<LimitationInput> = {}): LimitationInput {
  return {
    orderDate: ok('2026-01-01'),
    filingDate: ok('2026-05-12'),
    copyAppliedFor: no,
    copyApplied: none,
    copyReady: none,
    ...over,
  };
}

describe('T-472 D: the printed texts are the signed ones', () => {
  const SIGNED = readFileSync(
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'handoff',
      'legal',
      'T-245-old-new-law-switch-signed.md',
    ),
    'utf8',
  );
  it('the within, beyond and unknown texts (with the slot or blank) are in the signed file', () => {
    expect(SIGNED).toContain(
      'The present petition is filed within the period of limitation prescribed under {article/section}.',
    );
    expect(SIGNED).toContain(
      'The present petition is filed after the period of limitation prescribed under {article/section}, with a delay of [To be confirmed: number of days of delay]. The petitioner has filed a separate application under Section 5 of the Limitation Act, 1963 for condonation of the delay, which may be read as part of this petition.',
    );
    expect(SIGNED).toContain(UNKNOWN);
  });

  // These two come from Ajay's follow-up section (441ef1e8). If this fails with the
  // three above passing, the branch does not yet hold the signed file's follow-up section
  // (merge origin/develop_staging); it is not a source defect.
  it('the provision wording and the s.5 checklist line (follow-up) are in the signed file', () => {
    expect(SIGNED).toContain('Article 131 of the Schedule to the Limitation Act, 1963');
    expect(SIGNED).toContain(
      'Application under Section 5 of the Limitation Act, 1963 for condonation of delay, supported by an affidavit stating the cause of the delay.',
    );
  });

  it('the service prints exactly the five signed strings (typed by hand here)', () => {
    expect(rule.provision).toBe('Article 131 of the Schedule to the Limitation Act, 1963');
    expect(computeLimitation(rule, input({ filingDate: ok('2026-04-01') })).text).toBe(
      'The present petition is filed within the period of limitation prescribed under Article 131 of the Schedule to the Limitation Act, 1963.',
    );
    const late = computeLimitation(rule, input());
    expect(late.text).toBe(
      'The present petition is filed after the period of limitation prescribed under Article 131 of the Schedule to the Limitation Act, 1963, with a delay of 41 days. The petitioner has filed a separate application under Section 5 of the Limitation Act, 1963 for condonation of the delay, which may be read as part of this petition.',
    );
    expect(late.checklistItems).toEqual([
      'Application under Section 5 of the Limitation Act, 1963 for condonation of delay, supported by an affidavit stating the cause of the delay.',
    ]);
    expect(computeLimitation(rule, input({ filingDate: none })).text).toBe(
      '[To be confirmed: whether the petition is within limitation]',
    );
  });

  it('the old provision wording is gone', () => {
    expect(computeLimitation(rule, input()).text).not.toContain(
      'Article 131 of the Limitation Act',
    );
  });
});

describe('T-472 A: the day count (order 2026-01-01)', () => {
  it('filing 2026-05-12 is 131 days counted, 41 days of delay, beyond', () => {
    const r = computeLimitation(rule, input());
    expect(r.status).toBe('beyond');
    expect(r.daysCounted).toBe(131);
    expect(r.daysExcluded).toBe(0);
    expect(r.daysOfDelay).toBe(41);
    expect(r.text).toBe(BEYOND_41);
    expect(r.checklistItems).toEqual([S5_ITEM]);
  });

  it('the rule is 90 days under Article 131 of the Schedule to the Limitation Act, 1963', () => {
    expect(rule.periodDays).toBe(90);
    expect(rule.provision).toBe(PROVISION);
  });

  it('filing on day 90 (2026-04-01) is within', () => {
    const r = computeLimitation(rule, input({ filingDate: ok('2026-04-01') }));
    expect(r.status).toBe('within');
    expect(r.daysCounted).toBe(90);
    expect(r.daysOfDelay).toBeNull();
    expect(r.text).toBe(WITHIN);
    expect(r.checklistItems).toEqual([]);
  });

  it('filing on day 91 (2026-04-02) is beyond, 1 day of delay, singular', () => {
    const r = computeLimitation(rule, input({ filingDate: ok('2026-04-02') }));
    expect(r.status).toBe('beyond');
    expect(r.daysCounted).toBe(91);
    expect(r.daysOfDelay).toBe(1);
    expect(r.text).toBe(BEYOND_1);
  });

  it('the day of the order is excluded and the filing day is included', () => {
    const same = computeLimitation(rule, input({ filingDate: ok('2026-01-01') }));
    expect(same.status).toBe('within');
    expect(same.daysCounted).toBe(0);
    const next = computeLimitation(rule, input({ filingDate: ok('2026-01-02') }));
    expect(next.daysCounted).toBe(1);
  });

  it('a leap year is counted: order 2024-01-01, filing 2024-03-31 is day 90 (31+29+30), within', () => {
    const r = computeLimitation(
      rule,
      input({ orderDate: ok('2024-01-01'), filingDate: ok('2024-03-30') }),
    );
    expect(r.daysCounted).toBe(89);
    const edge = computeLimitation(
      rule,
      input({ orderDate: ok('2024-01-01'), filingDate: ok('2024-03-31') }),
    );
    expect(edge.daysCounted).toBe(90);
    expect(edge.status).toBe('within');
    expect(
      computeLimitation(rule, input({ orderDate: ok('2024-01-01'), filingDate: ok('2024-04-01') }))
        .status,
    ).toBe('beyond');
  });

  it('only criminal_revision has a rule', () => {
    expect(Object.keys(LIMITATION_RULES)).toEqual(['criminal_revision']);
    expect(limitationRuleFor('criminal_revision')).toBe(rule);
    expect(limitationRuleFor('bail_regular')).toBeNull();
    expect(limitationRuleFor('constructor')).toBeNull();
    expect(limitationRuleFor('__proto__')).toBeNull();
  });
});

describe('T-472 B: s.12(2) and the copy question', () => {
  const yesWith = (applied: string, ready: string, over: Partial<LimitationInput> = {}) =>
    input({
      copyAppliedFor: yes,
      copyApplied: ok(applied),
      copyReady: ok(ready),
      ...over,
    });

  it('"No": nothing is excluded, the count proceeds (131 days, 41 late)', () => {
    const r = computeLimitation(rule, input({ copyAppliedFor: no }));
    expect(r.status).toBe('beyond');
    expect(r.daysExcluded).toBe(0);
    expect(r.daysCounted).toBe(131);
    expect(r.daysOfDelay).toBe(41);
    expect(r.text).toBe(BEYOND_41);
  });

  it('"No": copy dates that are also given are ignored (even unreadable ones)', () => {
    const r = computeLimitation(
      rule,
      input({ copyAppliedFor: no, copyApplied: ok('2026-01-02'), copyReady: ok('2026-02-15') }),
    );
    expect(r.daysExcluded).toBe(0);
    expect(r.daysCounted).toBe(131);
    expect(r.status).toBe('beyond');
    const junk = computeLimitation(
      rule,
      input({ copyAppliedFor: no, copyApplied: bad, copyReady: bad }),
    );
    expect(junk.status).toBe('beyond');
    expect(junk.daysCounted).toBe(131);
  });

  it('"Yes", applied 01-05, ready 02-20: 47 days excluded (27 + 20, both ends included), 84 counted, within', () => {
    const r = computeLimitation(rule, yesWith('2026-01-05', '2026-02-20'));
    expect(r.daysExcluded).toBe(47);
    expect(r.daysCounted).toBe(84);
    expect(r.status).toBe('within');
    expect(r.daysOfDelay).toBeNull();
    expect(r.text).toBe(WITHIN);
    expect(r.checklistItems).toEqual([]);
  });

  it('the same filing without the exclusion ("No") is late: the exclusion is what flips it to within', () => {
    expect(computeLimitation(rule, input({ copyAppliedFor: no })).status).toBe('beyond');
    expect(computeLimitation(rule, yesWith('2026-01-05', '2026-02-20')).status).toBe('within');
  });

  it('applied 01-05, ready 02-04 (31 days both included): 100 counted, beyond by 10', () => {
    const r = computeLimitation(rule, yesWith('2026-01-05', '2026-02-04'));
    expect(r.daysExcluded).toBe(31);
    expect(r.daysCounted).toBe(100);
    expect(r.status).toBe('beyond');
    expect(r.daysOfDelay).toBe(10);
    expect(r.text).toContain('with a delay of 10 days.');
    expect(r.checklistItems).toEqual([S5_ITEM]);
  });

  it('an exclusion that is enough flips a late filing to within (45 days excluded, 86 counted)', () => {
    const r = computeLimitation(rule, yesWith('2026-01-02', '2026-02-15'));
    expect(r.daysExcluded).toBe(45);
    expect(r.daysCounted).toBe(86);
    expect(r.status).toBe('within');
    expect(r.text).toBe(WITHIN);
    expect(r.checklistItems).toEqual([]);
  });

  it('"Yes" with no ready date is the blank, even if a received date is passed (no fallback to received)', () => {
    const withReceived = {
      ...input({ copyAppliedFor: yes, copyApplied: ok('2026-01-02') }),
      copyReceived: ok('2026-02-15'),
    } as unknown as LimitationInput;
    const r = computeLimitation(rule, withReceived);
    expect(r.status).toBe('unknown');
    expect(r.text).toBe(UNKNOWN);
    expect(r.daysCounted).toBeNull();
    expect(r.daysExcluded).toBeNull();
  });

  it('ready is the end of the exclusion, a received date passed alongside changes nothing (ready 01-12: 11 excluded, 120 counted)', () => {
    const withReceived = {
      ...yesWith('2026-01-02', '2026-01-12'),
      copyReceived: ok('2026-02-20'),
    } as unknown as LimitationInput;
    const r = computeLimitation(rule, withReceived);
    expect(r.daysExcluded).toBe(11);
    expect(r.daysCounted).toBe(120);
    expect(r.daysOfDelay).toBe(30);
  });

  it('copy applied on day 90 (2026-04-01) still excludes: ready 04-11 is 11 days, 120 counted', () => {
    const r = computeLimitation(rule, yesWith('2026-04-01', '2026-04-11'));
    expect(r.daysExcluded).toBe(11);
    expect(r.daysCounted).toBe(120);
    expect(r.daysOfDelay).toBe(30);
  });

  it('nothing is excluded when the copy was applied for after day 90 (2026-04-02 or later)', () => {
    for (const applied of ['2026-04-02', '2026-04-05']) {
      const r = computeLimitation(rule, yesWith(applied, '2026-04-25'));
      expect(r.daysExcluded).toBe(0);
      expect(r.daysCounted).toBe(131);
      expect(r.status).toBe('beyond');
      expect(r.daysOfDelay).toBe(41);
    }
  });

  it('only the part inside the span to the filing counts: filing 03-20 (78 days), copy 03-10 to 04-30 excludes 11', () => {
    const r = computeLimitation(
      rule,
      yesWith('2026-03-10', '2026-04-30', { filingDate: ok('2026-03-20') }),
    );
    expect(r.daysExcluded).toBe(11);
    expect(r.daysCounted).toBe(67);
    expect(r.status).toBe('within');
  });

  it('a copy applied on the order day itself starts the exclusion the day after (order day is not counted)', () => {
    const r = computeLimitation(rule, yesWith('2026-01-01', '2026-01-10'));
    // Days 2026-01-02 to 2026-01-10 are in the span: 9 excluded.
    expect(r.daysExcluded).toBe(9);
    expect(r.daysCounted).toBe(122);
  });

  it('a ready date after the filing excludes up to the filing day only', () => {
    const r = computeLimitation(
      rule,
      yesWith('2026-02-01', '2026-03-01', { filingDate: ok('2026-02-10') }),
    );
    // 2026-02-01 to 2026-02-10 = 10 days excluded; 40 days after the order, minus 10.
    expect(r.daysExcluded).toBe(10);
    expect(r.daysCounted).toBe(30);
  });
});

describe('T-472 C: unknown gives the blank, no number, no checklist item', () => {
  const yesDates = (
    applied: LimitationInput['copyApplied'],
    ready: LimitationInput['copyReady'],
  ) => ({
    copyAppliedFor: yes,
    copyApplied: applied,
    copyReady: ready,
  });
  const cases: Array<[string, Partial<LimitationInput>]> = [
    ['missing order date', { orderDate: none }],
    ['missing filing date', { filingDate: none }],
    ['unreadable order date', { orderDate: bad }],
    ['unreadable filing date', { filingDate: bad }],
    ['copy question not answered', { copyAppliedFor: none }],
    [
      'copy question not answered, dates given',
      { copyAppliedFor: none, copyApplied: ok('2026-01-02'), copyReady: ok('2026-02-15') },
    ],
    ['copy answer unreadable ("Not known")', { copyAppliedFor: bad }],
    ['"Yes" with neither copy date', { copyAppliedFor: yes }],
    ['"Yes", applied without ready', yesDates(ok('2026-01-05'), none)],
    ['"Yes", ready without applied', yesDates(none, ok('2026-02-04'))],
    ['filing before the order', { filingDate: ok('2025-12-31') }],
    ['applied before the order', yesDates(ok('2025-12-30'), ok('2026-01-10'))],
    ['ready before applied', yesDates(ok('2026-02-10'), ok('2026-02-09'))],
    ['"Yes" with an unreadable applied date', yesDates(bad, ok('2026-02-04'))],
    ['"Yes" with an unreadable ready date', yesDates(ok('2026-01-05'), bad)],
  ];

  it.each(cases)('%s', (_name, over) => {
    const r = computeLimitation(rule, input(over));
    expect(r.status).toBe('unknown');
    expect(r.text).toBe(UNKNOWN);
    expect(r.daysCounted).toBeNull();
    expect(r.daysExcluded).toBeNull();
    expect(r.daysOfDelay).toBeNull();
    expect(r.checklistItems).toEqual([]);
    expect(withLimitationFact([], r)).toEqual([]);
  });

  it('a copy dated on the same day it was applied for is fine (ready equal to applied)', () => {
    const r = computeLimitation(
      rule,
      input({ copyAppliedFor: yes, copyApplied: ok('2026-01-05'), copyReady: ok('2026-01-05') }),
    );
    expect(r.status).toBe('beyond');
    expect(r.daysExcluded).toBe(1);
    expect(r.daysCounted).toBe(130);
  });

  it('a received date alone (the removed input) decides nothing: "Yes", applied and received only, is the blank', () => {
    const legacy = {
      ...input({ copyAppliedFor: yes, copyApplied: ok('2026-01-02') }),
      copyReceived: ok('2026-02-15'),
    } as unknown as LimitationInput;
    expect(computeLimitation(rule, legacy).status).toBe('unknown');
  });

  it('filing on the order day is not "before" it', () => {
    expect(computeLimitation(rule, input({ filingDate: ok('2026-01-01') })).status).toBe('within');
  });
});

describe('T-472 E: reading the case', () => {
  it('limitationDateOf: none, ok, unusable', () => {
    expect(limitationDateOf(undefined)).toEqual({ state: 'none' });
    expect(limitationDateOf(null)).toEqual({ state: 'none' });
    expect(limitationDateOf('')).toEqual({ state: 'none' });
    expect(limitationDateOf('   ')).toEqual({ state: 'none' });
    expect(limitationDateOf('2026-05-12')).toEqual({ state: 'ok', iso: '2026-05-12' });
    expect(limitationDateOf('12/05/2026')).toEqual({ state: 'ok', iso: '2026-05-12' });
    expect(limitationDateOf('12.05.2026')).toEqual({ state: 'ok', iso: '2026-05-12' });
    expect(limitationDateOf('12 May 2026')).toEqual({ state: 'unusable' });
    expect(limitationDateOf('2026-02-30')).toEqual({ state: 'unusable' });
    expect(limitationDateOf('[To be confirmed: date]')).toEqual({ state: 'unusable' });
    expect(limitationDateOf(42)).toEqual({ state: 'unusable' });
  });

  it('from form values: day-first and ISO dates give the same 131', () => {
    for (const [o, f] of [
      ['2026-01-01', '2026-05-12'],
      ['01/01/2026', '12/05/2026'],
    ]) {
      const r = computeLimitation(
        rule,
        limitationInputFromValues(rule, {
          impugned_order_date: o,
          filing_date: f,
          certified_copy_applied_for: 'No',
        }),
      );
      expect(r.daysCounted).toBe(131);
    }
  });

  it('limitationAnswerOf: booleans and yes/no in any case; empty is none; anything else is unusable', () => {
    expect(limitationAnswerOf(true)).toEqual({ state: 'ok', value: true });
    expect(limitationAnswerOf(false)).toEqual({ state: 'ok', value: false });
    expect(limitationAnswerOf('Yes')).toEqual({ state: 'ok', value: true });
    expect(limitationAnswerOf(' yes ')).toEqual({ state: 'ok', value: true });
    expect(limitationAnswerOf('TRUE')).toEqual({ state: 'ok', value: true });
    expect(limitationAnswerOf('No')).toEqual({ state: 'ok', value: false });
    expect(limitationAnswerOf('false')).toEqual({ state: 'ok', value: false });
    expect(limitationAnswerOf(undefined)).toEqual({ state: 'none' });
    expect(limitationAnswerOf(null)).toEqual({ state: 'none' });
    expect(limitationAnswerOf('  ')).toEqual({ state: 'none' });
    expect(limitationAnswerOf('Not known')).toEqual({ state: 'unusable' });
    expect(limitationAnswerOf('maybe')).toEqual({ state: 'unusable' });
    expect(limitationAnswerOf(1)).toEqual({ state: 'unusable' });
  });

  it('from form values: the keys are impugned_order_date, filing_date, certified_copy_applied_for/applied/ready', () => {
    const r = computeLimitation(
      rule,
      limitationInputFromValues(rule, {
        impugned_order_date: '2026-01-01',
        filing_date: '2026-05-12',
        certified_copy_applied_for: true,
        certified_copy_applied: '2026-01-02',
        certified_copy_ready: '2026-02-15',
      }),
    );
    expect(r.status).toBe('within');
    expect(r.daysExcluded).toBe(45);
    // A received date is not read: without a ready date the answer "Yes" is the blank.
    const received = computeLimitation(
      rule,
      limitationInputFromValues(rule, {
        impugned_order_date: '2026-01-01',
        filing_date: '2026-05-12',
        certified_copy_applied_for: 'Yes',
        certified_copy_applied: '2026-01-02',
        certified_copy_received: '2026-02-15',
      }),
    );
    expect(received.status).toBe('unknown');
    // The other packs' key names are not read.
    const other = computeLimitation(
      rule,
      limitationInputFromValues(rule, {
        impugned_order_date: '2026-01-01',
        filing_date: '2026-05-12',
        certified_copy_applied_for: 'No',
        certified_copy_applied_date: '2026-01-02',
        certified_copy_received_date: '2026-02-15',
      }),
    );
    expect(other.status).toBe('beyond');
    expect(other.daysExcluded).toBe(0);
  });

  it('from form values: the copy question not answered, or "Not known", is unknown even with both dates', () => {
    const dates = {
      impugned_order_date: '2026-01-01',
      filing_date: '2026-05-12',
      certified_copy_applied: '2026-01-02',
      certified_copy_ready: '2026-02-15',
    };
    expect(computeLimitation(rule, limitationInputFromValues(rule, dates)).status).toBe('unknown');
    expect(
      computeLimitation(
        rule,
        limitationInputFromValues(rule, { ...dates, certified_copy_applied_for: 'Not known' }),
      ).status,
    ).toBe('unknown');
    expect(
      computeLimitation(
        rule,
        limitationInputFromValues(rule, { ...dates, certified_copy_applied_for: '' }),
      ).status,
    ).toBe('unknown');
  });

  it('from form values: "Yes" with the applied date but no ready date is unknown', () => {
    const r = computeLimitation(
      rule,
      limitationInputFromValues(rule, {
        impugned_order_date: '2026-01-01',
        filing_date: '2026-05-12',
        certified_copy_applied_for: 'Yes',
        certified_copy_applied: '2026-01-02',
      }),
    );
    expect(r.status).toBe('unknown');
    expect(r.text).toBe(UNKNOWN);
  });

  it('a missing key from the form is unknown, not a guess', () => {
    const r = computeLimitation(
      rule,
      limitationInputFromValues(rule, { impugned_order_date: '2026-01-01' }),
    );
    expect(r.status).toBe('unknown');
  });

  const fact = (key: string, value: string, over: Partial<LedgerFact> = {}): LedgerFact =>
    ({
      id: `f_${key}`,
      key,
      label: key,
      type: 'date',
      value,
      display: value,
      raw_span: value,
      source: 'user',
      confidence: 0.99,
      required_in_draft: true,
      ...over,
    }) as LedgerFact;

  const answer = (value: string, over: Partial<LedgerFact> = {}) =>
    ({ ...fact('certified_copy_applied_for', value), id: `f_ans_${value}`, ...over }) as LedgerFact;

  const base = (): LedgerFact[] => [
    fact('impugned_order_date', '2026-01-01'),
    fact('filing_date', '2026-05-12'),
    answer('No'),
  ];

  it('from the ledger: dates of source user or asked give 131 days', () => {
    const r = computeLimitation(rule, limitationInputFromLedger(rule, base()));
    expect(r.daysCounted).toBe(131);
    const asked = computeLimitation(
      rule,
      limitationInputFromLedger(rule, [
        fact('impugned_order_date', '2026-01-01', { source: 'asked' }),
        fact('filing_date', '2026-05-12', { source: 'asked' }),
        answer('No', { source: 'asked' }),
      ]),
    );
    expect(asked.daysCounted).toBe(131);
  });

  it('from the ledger: a group-prefixed key is matched on its last segment', () => {
    const r = computeLimitation(
      rule,
      limitationInputFromLedger(rule, [
        fact('case.impugned_order_date', '2026-01-01'),
        fact('case.filing_date', '2026-05-12'),
        answer('No', { key: 'case.certified_copy_applied_for' }),
      ]),
    );
    expect(r.daysCounted).toBe(131);
  });

  it('from the ledger: an unresolved date is unknown, even if the brief holds a value', () => {
    const r = computeLimitation(
      rule,
      limitationInputFromLedger(
        rule,
        [fact('impugned_order_date', '2026-01-01')],
        ['filing_date'],
        {
          filing_date: '2026-05-12',
        },
      ),
    );
    expect(r.status).toBe('unknown');
    expect(r.text).toBe(UNKNOWN);
  });

  it('from the ledger: an unresolved key with a group prefix is unknown too', () => {
    const r = computeLimitation(
      rule,
      limitationInputFromLedger(rule, base(), ['case.filing_date']),
    );
    expect(r.status).toBe('unknown');
  });

  it('from the ledger: two different values for one date are unknown', () => {
    const r = computeLimitation(
      rule,
      limitationInputFromLedger(rule, [...base(), fact('filing_date', '2026-03-01', { id: 'f2' })]),
    );
    expect(r.status).toBe('unknown');
  });

  it('from the ledger: two facts with the same date are fine', () => {
    const r = computeLimitation(
      rule,
      limitationInputFromLedger(rule, [...base(), fact('filing_date', '12/05/2026', { id: 'f2' })]),
    );
    expect(r.daysCounted).toBe(131);
  });

  it('from the ledger: a fact that is not a date type, or not a readable date, is unknown', () => {
    expect(
      computeLimitation(
        rule,
        limitationInputFromLedger(rule, [
          fact('impugned_order_date', '2026-01-01'),
          fact('filing_date', '2026-05-12', { type: 'text' }),
          answer('No'),
        ]),
      ).status,
    ).toBe('unknown');
    expect(
      computeLimitation(
        rule,
        limitationInputFromLedger(rule, [
          fact('impugned_order_date', '2026-01-01'),
          fact('filing_date', 'last May'),
          answer('No'),
        ]),
      ).status,
    ).toBe('unknown');
  });

  it('from the ledger: a computed fact is never an input', () => {
    const r = computeLimitation(
      rule,
      limitationInputFromLedger(rule, [
        fact('impugned_order_date', '2026-01-01'),
        fact('filing_date', '2026-04-01', { source: 'computed' }),
        answer('No'),
      ]),
    );
    expect(r.status).toBe('unknown');
  });

  it('from the ledger: with no fact for a key, the brief value is the fallback', () => {
    const r = computeLimitation(
      rule,
      limitationInputFromLedger(rule, [fact('impugned_order_date', '2026-01-01')], [], {
        filing_date: '2026-05-12',
        certified_copy_applied_for: 'No',
      }),
    );
    expect(r.daysCounted).toBe(131);
  });

  it('from the ledger: the copy question with no fact and no fallback is unknown', () => {
    const r = computeLimitation(
      rule,
      limitationInputFromLedger(rule, [
        fact('impugned_order_date', '2026-01-01'),
        fact('filing_date', '2026-05-12'),
      ]),
    );
    expect(r.status).toBe('unknown');
  });

  it('from the ledger: "Not known", an unresolved answer, or Yes and No together is unknown', () => {
    const withAnswers = (...a: LedgerFact[]) => [
      fact('impugned_order_date', '2026-01-01'),
      fact('filing_date', '2026-05-12'),
      ...a,
    ];
    expect(
      computeLimitation(rule, limitationInputFromLedger(rule, withAnswers(answer('Not known'))))
        .status,
    ).toBe('unknown');
    expect(
      computeLimitation(
        rule,
        limitationInputFromLedger(rule, withAnswers(answer('No')), ['certified_copy_applied_for']),
      ).status,
    ).toBe('unknown');
    expect(
      computeLimitation(
        rule,
        limitationInputFromLedger(rule, withAnswers(answer('No'), answer('Yes'))),
      ).status,
    ).toBe('unknown');
  });

  it('from the ledger: "Yes" with the applied and ready dates is read (45 days excluded, within)', () => {
    const r = computeLimitation(
      rule,
      limitationInputFromLedger(rule, [
        fact('impugned_order_date', '2026-01-01'),
        fact('filing_date', '2026-05-12'),
        answer('Yes'),
        fact('certified_copy_applied', '2026-01-02'),
        fact('certified_copy_ready', '2026-02-15'),
      ]),
    );
    expect(r.status).toBe('within');
    expect(r.daysExcluded).toBe(45);
  });

  it('from the ledger: "Yes" with a received date instead of a ready date is unknown', () => {
    const r = computeLimitation(
      rule,
      limitationInputFromLedger(rule, [
        fact('impugned_order_date', '2026-01-01'),
        fact('filing_date', '2026-05-12'),
        answer('Yes'),
        fact('certified_copy_applied', '2026-01-02'),
        fact('certified_copy_received', '2026-02-15'),
      ]),
    );
    expect(r.status).toBe('unknown');
  });
});

describe('T-472 F: the one computed fact', () => {
  const stored = (key: string): LedgerFact =>
    ({
      id: `s_${key}`,
      key,
      label: key,
      type: 'text',
      value: 'stored: within limitation',
      display: 'stored: within limitation',
      raw_span: '',
      source: 'user',
      confidence: 1,
      required_in_draft: true,
    }) as LedgerFact;

  it('beyond: one fact, key limitation, source computed, not required, value beyond:131, display the signed text', () => {
    const facts = withLimitationFact([], computeLimitation(rule, input()));
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      key: 'limitation',
      source: 'computed',
      required_in_draft: false,
      value: 'beyond:131',
      display: BEYOND_41,
    });
  });

  it('within: value within:90, display the within text', () => {
    const facts = withLimitationFact(
      [],
      computeLimitation(rule, input({ filingDate: ok('2026-04-01') })),
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ key: 'limitation', value: 'within:90', display: WITHIN });
  });

  it('a stored fact under limitation (also group-prefixed) is dropped; other facts are kept in order', () => {
    const other = stored('grounds');
    const facts = withLimitationFact(
      [stored('limitation'), other, stored('case.limitation')],
      computeLimitation(rule, input()),
    );
    expect(facts.map((f) => f.key)).toEqual(['grounds', 'limitation']);
    expect(facts[1].source).toBe('computed');
  });

  it('unknown: a stored fact under the key is dropped and nothing is added', () => {
    const r = computeLimitation(rule, input({ filingDate: none }));
    expect(
      withLimitationFact([stored('limitation'), stored('grounds')], r).map((f) => f.key),
    ).toEqual(['grounds']);
  });

  it('does not change its input array', () => {
    const before = [stored('limitation')];
    withLimitationFact(before, computeLimitation(rule, input()));
    expect(before).toHaveLength(1);
    expect(before[0].source).toBe('user');
  });
});

describe('T-472 G: enforceLimitationText', () => {
  const BODY_CLAIM = [
    'PETITION',
    '',
    '1. That the petitioner is a resident of Patna.',
    '',
    '2. That the impugned order was passed on 01.01.2026. The petition is filed within the period of limitation, no condonation is needed.',
    '',
    '3. That the order is illegal.',
  ].join('\n');

  const count = (hay: string, needle: string) => hay.split(needle).length - 1;

  it('the model claim is replaced by the computed sentence, exactly once, neighbours untouched', () => {
    const out = enforceLimitationText(BODY_CLAIM, BEYOND_41);
    expect(out).toBe(
      [
        'PETITION',
        '',
        '1. That the petitioner is a resident of Patna.',
        '',
        `2. That the impugned order was passed on 01.01.2026. ${BEYOND_41}`,
        '',
        '3. That the order is illegal.',
      ].join('\n'),
    );
    expect(count(out, BEYOND_41)).toBe(1);
    expect(out).not.toMatch(/no condonation is needed/i);
    expect(out).not.toMatch(/within the period of limitation,/i);
  });

  it('the same for the within text', () => {
    const out = enforceLimitationText(
      '1. The petition is filed within limitation.\n\n2. That the order is illegal.',
      WITHIN,
    );
    expect(out).toBe(`1. ${WITHIN}\n\n2. That the order is illegal.`);
  });

  it.each([
    'The petition is within limitation.',
    'The petition is barred by time.',
    'The petition is not time-barred.',
    'The petitioner prays for condonation of delay, if any.',
    'The petition has been filed within time.',
    'The petition is filed without delay.',
    'The petition is filed in time.',
    'The petition is filed within 90 days of the order.',
    'No condonation is required.',
    'The same is filed within the period of limitation.',
    'The revision petition is filed within 3 months of the order.',
    'The petitioner has filed this revision within ninety (90) days.',
    'The revision is within 90 days.',
    'There is no delay in approaching this Court.',
    'There is no delay on the part of the petitioner.',
    'The petition is within the prescribed period.',
    'The revision petition arising from the FIR is filed within limitation.',
    'The present revision against the order taking cognizance is filed within the period of limitation.',
    'Within limitation.',
    'The application is within time.',
    'This petition is filed within limitation, and cognizance was barred under Section 468 CrPC.',
    'The petition is within limitation as Section 473 CrPC does not apply.',
  ])('model sentence "%s" is replaced', (sentence) => {
    const out = enforceLimitationText(`1. That the order is illegal.\n\n2. ${sentence}`, BEYOND_41);
    expect(out).toBe(`1. That the order is illegal.\n\n2. ${BEYOND_41}`);
  });

  it.each([
    'There is a delay of 12 days in filing.',
    'Limitation is not an issue here.',
    'Section 473 CrPC does not save the prosecution.',
    'The cognizance taken is barred by limitation under Section 468 CrPC.',
    'The complaint was filed beyond the period of limitation.',
    'Cognizance was taken beyond the period of limitation.',
    'In this revision, the complaint was filed beyond time.',
    'The Trial Court delayed the proceedings, which is a ground for this revision.',
    'The revision is also against the unexplained delay of the trial court in framing charges.',
  ])(
    'sentence "%s" is not the petition\'s own claim, so it survives byte for byte and the text is appended',
    (sentence) => {
      const body = `1. That the order is illegal.\n\n2. ${sentence}`;
      expect(enforceLimitationText(body, BEYOND_41)).toBe(`${body}\n\n3. ${BEYOND_41}`);
    },
  );

  it('a draft with no limitation sentence gets the computed text as a new last numbered paragraph', () => {
    const body =
      '1. That the petitioner is a resident of Patna.\n\n2. That the order is illegal.\n';
    const out = enforceLimitationText(body, BEYOND_41);
    expect(out).toBe(
      `1. That the petitioner is a resident of Patna.\n\n2. That the order is illegal.\n\n3. ${BEYOND_41}`,
    );
  });

  it('with no numbered paragraphs, the text is added as a plain last paragraph', () => {
    const out = enforceLimitationText('The order is illegal.', WITHIN);
    expect(out).toBe(`The order is illegal.\n\n${WITHIN}`);
  });

  it('an appended paragraph takes the next number after the renumbered ones (no gap: 1, 5 becomes 1, 2, then 3)', () => {
    const out = enforceLimitationText('1. One.\n\n5. Five.', WITHIN);
    expect(out).toBe(`1. One.\n\n2. Five.\n\n3. ${WITHIN}`);
  });

  it("numbering starts from the body's first number, not from 1", () => {
    expect(enforceLimitationText('4. Four.\n\n9. Nine.', WITHIN)).toBe(
      `4. Four.\n\n5. Nine.\n\n6. ${WITHIN}`,
    );
  });

  it('headings (even "Limitation" and "LIMITATION:") are untouched and the claim under them is replaced', () => {
    const body = [
      'LIMITATION',
      '',
      '4. The petition is within limitation.',
      '',
      'Condonation:',
      '',
    ].join('\n');
    const out = enforceLimitationText(body, WITHIN);
    expect(out).toBe(['LIMITATION', '', `4. ${WITHIN}`, '', 'Condonation:', ''].join('\n'));
  });

  it('unrelated paragraphs are untouched, byte for byte', () => {
    const body =
      '1. That Mr. Sharma, S/o Late Ram, resides at 12 Art. Road.\n\n2. That the order dated 01.01.2026 is illegal. It is perverse.';
    const out = enforceLimitationText(body, WITHIN);
    expect(out.startsWith(body)).toBe(true);
    expect(out).toBe(`${body}\n\n3. ${WITHIN}`);
  });

  it('an exact copy of the computed text is kept once and nothing is added', () => {
    const body = `1. That the order is illegal.\n\n2. ${BEYOND_41}\n\n3. That the court may grant relief.`;
    expect(enforceLimitationText(body, BEYOND_41)).toBe(body);
  });

  it('an exact copy plus a model claim elsewhere: the copy stays once, the claim goes', () => {
    const body = `1. ${WITHIN}\n\n2. That the order is illegal. The petition is not barred by limitation.\n\n3. Prayer.`;
    const out = enforceLimitationText(body, WITHIN);
    expect(count(out, WITHIN)).toBe(1);
    expect(out).toBe(`1. ${WITHIN}\n\n2. That the order is illegal.\n\n3. Prayer.`);
  });

  it('two model claims: the first is replaced, the second removed', () => {
    const body =
      '1. The petition is within limitation.\n\n2. That the order is illegal. No condonation is required.';
    const out = enforceLimitationText(body, WITHIN);
    expect(out).toBe(`1. ${WITHIN}\n\n2. That the order is illegal.`);
    expect(count(out, WITHIN)).toBe(1);
  });

  it('an emptied numbered paragraph is dropped; the numbers after it close up (no gap)', () => {
    const body = [
      '1. The petition is within limitation.',
      '',
      '2. No condonation is required.',
      '',
      '3. That the order is illegal.',
    ].join('\n');
    const out = enforceLimitationText(body, WITHIN);
    // Paragraph 2 is dropped, paragraph 3 becomes 2.
    expect(out).toBe(`1. ${WITHIN}\n\n2. That the order is illegal.`);
  });

  it('numbering: no gaps or repeats after a replacement that drops a paragraph in the middle of a longer draft', () => {
    const body = [
      '1. A.',
      '2. The petition is within limitation.',
      '3. No condonation is required.',
      '4. B.',
      '5. C.',
    ].join('\n\n');
    expect(enforceLimitationText(body, WITHIN)).toBe(
      ['1. A.', `2. ${WITHIN}`, '3. B.', '4. C.'].join('\n\n'),
    );
  });

  it('numbering: a repeated number in the model draft is made consecutive', () => {
    expect(enforceLimitationText('1. One.\n\n1. Again.\n\n3. Three.', WITHIN)).toBe(
      `1. One.\n\n2. Again.\n\n3. Three.\n\n4. ${WITHIN}`,
    );
  });

  it('numbering: headings and un-numbered lines are untouched', () => {
    const body = [
      'GROUNDS',
      '',
      '1. A.',
      '',
      '2. The petition is within limitation.',
      '',
      'See the annexures filed with this petition.',
      '',
      '3. No condonation is required.',
      '',
      '4. B.',
      '',
      'PRAYER',
    ].join('\n');
    expect(enforceLimitationText(body, WITHIN)).toBe(
      [
        'GROUNDS',
        '',
        '1. A.',
        '',
        `2. ${WITHIN}`,
        '',
        'See the annexures filed with this petition.',
        '',
        '3. B.',
        '',
        'PRAYER',
      ].join('\n'),
    );
  });

  it('numbering: enforceLimitationTextDetailed gives the old-to-new map (dropping old 3 maps 4 to 3 and 5 to 4)', () => {
    const body = [
      '1. A.',
      '2. The petition is within limitation.',
      '3. No condonation is required.',
      '4. B.',
      '5. C.',
    ].join('\n\n');
    const d = enforceLimitationTextDetailed([body], WITHIN);
    // before renumbering: the old numbers, with the gap
    expect(d.edited[0]).toBe(['1. A.', `2. ${WITHIN}`, '4. B.', '5. C.'].join('\n\n'));
    expect(d.bodies[0]).toBe(['1. A.', `2. ${WITHIN}`, '3. B.', '4. C.'].join('\n\n'));
    expect(d.renumber[0].get(1)).toBe(1);
    expect(d.renumber[0].get(2)).toBe(2);
    expect(d.renumber[0].get(3)).toBeUndefined();
    expect(d.renumber[0].get(4)).toBe(3);
    expect(d.renumber[0].get(5)).toBe(4);
  });

  it('renumberParagraphs: consecutive from the first number; headings and prose lines untouched', () => {
    const r = renumberParagraphs('HEADING\n\n3. X.\n\n7. Y.\n\nPlain line.\n\n7. Z.');
    expect(r.text).toBe('HEADING\n\n3. X.\n\n4. Y.\n\nPlain line.\n\n5. Z.');
    expect(r.map.get(3)).toBe(3);
    expect(r.map.get(7)).toBe(4);
    expect(renumberParagraphs('No numbers here.').text).toBe('No numbers here.');
  });

  it('the unknown blank replaces a model claim too', () => {
    const out = enforceLimitationText('1. The petition is filed within limitation.', UNKNOWN);
    expect(out).toBe(`1. ${UNKNOWN}`);
  });

  it.each([
    ['within', WITHIN, BODY_CLAIM],
    ['beyond', BEYOND_41, BODY_CLAIM],
    ['unknown', UNKNOWN, BODY_CLAIM],
    ['within, no claim', WITHIN, '1. One.\n\n2. Two.'],
    [
      'beyond, two claims',
      BEYOND_41,
      '1. Within limitation.\n\n2. No condonation is required.\n\n3. Three.',
    ],
  ])('idempotent: %s', (_n, text, body) => {
    const once = enforceLimitationText(body, text);
    expect(enforceLimitationText(once, text)).toBe(once);
  });

  it('an empty text or an empty body changes nothing', () => {
    expect(enforceLimitationText('1. Within limitation.', '')).toBe('1. Within limitation.');
    expect(enforceLimitationText('', WITHIN)).toBe('');
    expect(enforceLimitationText('  \n ', WITHIN)).toBe('  \n ');
  });

  it('the bodies form (one per AI section): the first claim in document order is replaced, later ones go, the rest untouched', () => {
    const out = enforceLimitationTextIn(
      [
        '1. Intro.',
        '2. Within limitation.\n\n3. Grounds.',
        '4. No condonation is needed. Prayer follows.',
      ],
      WITHIN,
    );
    expect(out).toEqual(['1. Intro.', `2. ${WITHIN}\n\n3. Grounds.`, '4. Prayer follows.']);
  });

  it('the bodies form: each AI section is renumbered on its own (a dropped paragraph closes up inside its section only)', () => {
    const out = enforceLimitationTextIn(
      [
        '1. A.\n\n2. B.',
        '3. Within limitation.\n\n4. No condonation is required.\n\n5. E.',
        '6. F.',
      ],
      WITHIN,
    );
    expect(out).toEqual(['1. A.\n\n2. B.', `3. ${WITHIN}\n\n4. E.`, '6. F.']);
  });

  it('the bodies form: the Detailed form gives one map per body', () => {
    const d = enforceLimitationTextDetailed(
      ['1. A.\n\n2. B.', '3. Within limitation.\n\n4. No condonation is required.\n\n5. E.'],
      WITHIN,
    );
    expect(d.renumber).toHaveLength(2);
    expect(d.renumber[1].get(5)).toBe(4);
    expect(d.renumber[0].get(2)).toBe(2);
  });

  it('the bodies form: no claim anywhere adds the text to the last non-empty body only', () => {
    const out = enforceLimitationTextIn(['1. One.', '2. Two.', ''], WITHIN);
    expect(out).toEqual(['1. One.', `2. Two.\n\n3. ${WITHIN}`, '']);
  });

  it('the bodies form: an exact copy in one body means no claim elsewhere is replaced by a second copy', () => {
    const out = enforceLimitationTextIn(
      [`1. ${WITHIN}`, '2. No condonation is needed. Fine.'],
      WITHIN,
    );
    expect(out).toEqual([`1. ${WITHIN}`, '2. Fine.']);
    expect(out.join('\n').split(WITHIN).length - 1).toBe(1);
  });
});

describe('T-472 H: mutation checks (the tests above must catch these)', () => {
  const day = (rule2: LimitationRule, filing: string) =>
    computeLimitation(rule2, input({ filingDate: ok(filing) })).status;

  it('a 91-day period would call day 91 within: the real rule does not', () => {
    const mutant: LimitationRule = { ...rule, periodDays: 91 };
    expect(day(mutant, '2026-04-02')).toBe('within');
    expect(day(rule, '2026-04-02')).toBe('beyond');
  });

  it('a 89-day period would call day 90 beyond: the real rule does not', () => {
    const mutant: LimitationRule = { ...rule, periodDays: 89 };
    expect(day(mutant, '2026-04-01')).toBe('beyond');
    expect(day(rule, '2026-04-01')).toBe('within');
  });

  it('an inclusive order day would add one to every count: the real counts are the ones typed above', () => {
    expect(computeLimitation(rule, input()).daysCounted).not.toBe(132);
    expect(computeLimitation(rule, input()).daysCounted).not.toBe(130);
  });

  it('a mutant that ignored the s.12(2) copy dates would leave the late filing late: the real one flips it', () => {
    const withCopy = input({
      copyAppliedFor: yes,
      copyApplied: ok('2026-01-02'),
      copyReady: ok('2026-02-15'),
    });
    const ignoring = { ...withCopy, copyAppliedFor: no, copyApplied: none, copyReady: none };
    expect(computeLimitation(rule, ignoring).status).toBe('beyond');
    expect(computeLimitation(rule, withCopy).status).toBe('within');
  });

  it('a mutant that fell back to the received date would exclude days: the real one prints the blank', () => {
    const noReady = {
      ...input({ copyAppliedFor: yes, copyApplied: ok('2026-01-02') }),
      copyReceived: ok('2026-02-15'),
    } as unknown as LimitationInput;
    // the mutant's answer: applied..received = 45 days excluded, within
    expect(computeLimitation(rule, noReady).status).not.toBe('within');
    expect(computeLimitation(rule, noReady).status).toBe('unknown');
  });

  it('a mutant that treated an unanswered copy question as "No" would print 41 days: the real one prints the blank', () => {
    const r = computeLimitation(rule, input({ copyAppliedFor: none }));
    expect(r.text).toBe(UNKNOWN);
    expect(r.text).not.toContain('41 days');
  });

  it('a mutant that left a gap after a dropped paragraph would print 1, 2, 4: the real one prints 1, 2, 3', () => {
    const out = enforceLimitationText(
      '1. A.\n\n2. Within limitation.\n\n3. No condonation is required.\n\n4. B.',
      WITHIN,
    );
    expect(out).not.toContain('\n\n4. B.');
    expect(out).toContain('\n\n3. B.');
  });

  it('a mutant that guessed on an unknown date would print a number: the real one prints the blank', () => {
    const r = computeLimitation(rule, input({ filingDate: none }));
    expect(r.text).toBe(UNKNOWN);
    expect(r.text).not.toMatch(/\d+ days?/);
  });

  it('a mutant enforce that appends without removing the claim would keep it: the real one removes it', () => {
    const body =
      '1. The petition is filed within the period of limitation, no condonation is needed.';
    const mutant = `${body}\n\n2. ${BEYOND_41}`;
    expect(mutant).toMatch(/no condonation is needed/);
    expect(enforceLimitationText(body, BEYOND_41)).not.toMatch(/no condonation is needed/);
  });

  it('a mutant enforce that replaced every claim with the text would print it twice: the real one prints it once', () => {
    const body = '1. Within limitation.\n\n2. No condonation is required.';
    const mutant = body
      .split('\n\n')
      .map((p) => p.replace(/^(\d+\. ).*$/, `$1${WITHIN}`))
      .join('\n\n');
    expect(mutant.split(WITHIN).length - 1).toBe(2);
    expect(enforceLimitationText(body, WITHIN).split(WITHIN).length - 1).toBe(1);
  });
});
