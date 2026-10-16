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
 * G  the computed paragraph and the flags (option d: the model text is never edited)
 * H  mutation checks
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import type { LedgerFact } from '@lawie/shared';

import {
  LIMITATION_RULES,
  computeLimitation,
  LIMITATION_FLAG_TEXT,
  LIMITATION_PROMPT_LINE,
  LIMITATION_SECTION_ID,
  LIMITATION_UNKNOWN_CHECKLIST_ITEM,
  findLimitationClaims,
  limitationAnswerOf,
  limitationDateOf,
  limitationInputFromLedger,
  limitationInputFromValues,
  limitationRuleFor,
  limitationFlagMessage,
  limitationParagraph,
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
    // AJ-472-M1: the unknown blank carries the "check limitation" checklist line
    expect(r.checklistItems).toEqual([
      'Check limitation from the dates; if the petition is late, file an application under Section 5 of the Limitation Act, 1963.',
    ]);
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

describe('T-472 G: the computed paragraph, the flags (option d: the model text is never edited)', () => {
  // Typed by hand. The model's own statement that this petition is in time: flagged.
  const FLAGGED = [
    'The petition is filed within the period of limitation, no condonation is needed.',
    'The petition is within limitation.',
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
    'This revision against the order taking cognizance is within limitation.',
    'The petition is well within time, the cognizance order being dated 5 January 2026.',
    "The petitioner has approached this Hon'ble Court within the period of limitation.",
    "The petition is filed before this Hon'ble Court within limitation.",
  ];

  // Grounds of revision and neutral sentences: never flagged.
  const NOT_FLAGGED = [
    'There is a delay of 12 days in filing.',
    'Limitation is not an issue here.',
    'Section 473 CrPC does not save the prosecution.',
    'The cognizance taken is barred by limitation under Section 468 CrPC.',
    'The complaint was filed beyond the period of limitation.',
    'Cognizance was taken beyond the period of limitation.',
    'In this revision, the complaint was filed beyond time.',
    'The Trial Court delayed the proceedings, which is a ground for this revision.',
    'The revision is also against the unexplained delay of the trial court in framing charges.',
    'The present petition is filed against the order taking cognizance beyond the period of limitation under Section 468 CrPC.',
    'The present revision is preferred against the summoning order on a complaint filed beyond the period of limitation.',
    'The petitioner has filed the complaint within time.',
    'The cognizance is barred under Section 514 BNSS.',
  ];

  it('the paragraph prints as "<n>. <text>" for each of the three results', () => {
    expect(
      limitationParagraph(computeLimitation(rule, input({ filingDate: ok('2026-04-01') })), 4),
    ).toBe(`4. ${WITHIN}`);
    expect(limitationParagraph(computeLimitation(rule, input()), 7)).toBe(`7. ${BEYOND_41}`);
    expect(limitationParagraph(computeLimitation(rule, input({ filingDate: none })), 1)).toBe(
      `1. ${UNKNOWN}`,
    );
  });

  it('the section id and the warning text are the signed ones', () => {
    expect(LIMITATION_SECTION_ID).toBe('limitation_paragraph');
    expect(LIMITATION_FLAG_TEXT).toBe(
      'Check this sentence: it states a limitation position. The limitation paragraph (para {n}) is computed from your dates.',
    );
    expect(limitationFlagMessage(4)).toBe(
      'Check this sentence: it states a limitation position. The limitation paragraph (para 4) is computed from your dates.',
    );
    expect(limitationFlagMessage(12)).toContain('(para 12)');
    expect(limitationFlagMessage(12)).not.toContain('{n}');
  });

  it('the Drafter prompt line is the signed one, verbatim', () => {
    expect(LIMITATION_PROMPT_LINE).toBe(
      'Do not state whether the present petition is within or beyond limitation, or whether condonation of delay is needed; that paragraph is supplied. Grounds about limitation in other proceedings stay as the advocate gave them.',
    );
  });

  it('the AJ-472-M1 checklist line is verbatim', () => {
    expect(LIMITATION_UNKNOWN_CHECKLIST_ITEM).toBe(
      'Check limitation from the dates; if the petition is late, file an application under Section 5 of the Limitation Act, 1963.',
    );
  });

  it('checklist: unknown gives the AJ-472-M1 line only, within gives none, late gives the s.5 line only', () => {
    const unknownLine =
      'Check limitation from the dates; if the petition is late, file an application under Section 5 of the Limitation Act, 1963.';
    expect(computeLimitation(rule, input({ filingDate: none })).checklistItems).toEqual([
      unknownLine,
    ]);
    expect(computeLimitation(rule, input({ copyAppliedFor: none })).checklistItems).toEqual([
      unknownLine,
    ]);
    expect(computeLimitation(rule, input({ filingDate: ok('2026-03-15') })).checklistItems).toEqual(
      [],
    );
    expect(computeLimitation(rule, input()).checklistItems).toEqual([S5_ITEM]);
  });

  it.each(FLAGGED)('flagged, returned exactly as written: "%s"', (sentence) => {
    const body = `1. That the order is illegal.\n\n2. ${sentence}\n\n3. Prayer follows.`;
    expect(findLimitationClaims([body])).toEqual([sentence]);
  });

  it.each(NOT_FLAGGED)('not flagged: "%s"', (sentence) => {
    const body = `1. That the order is illegal.\n\n2. ${sentence}\n\n3. Prayer follows.`;
    expect(findLimitationClaims([body])).toEqual([]);
  });

  it('a ground and a claim in one paragraph: only the claim is returned, the ground is not', () => {
    const ground = 'The cognizance taken is barred by limitation under Section 468 CrPC.';
    expect(findLimitationClaims([`3. ${ground} The petition is within limitation.`])).toEqual([
      'The petition is within limitation.',
    ]);
    expect(findLimitationClaims([`3. The petition is within limitation. ${ground}`])).toEqual([
      'The petition is within limitation.',
    ]);
  });

  it('several claims are returned in order; bodies are read in order (the form path has one per AI section)', () => {
    expect(
      findLimitationClaims([
        '1. Intro.\n\n2. The petition is within limitation.\n\n3. Grounds.',
        '4. No condonation is needed. Prayer follows.',
      ]),
    ).toEqual(['The petition is within limitation.', 'No condonation is needed.']);
  });

  it('the paragraph number is not part of the sentence returned', () => {
    expect(findLimitationClaims(['12. The application is within time.'])).toEqual([
      'The application is within time.',
    ]);
  });

  it('read-only: the bodies are not changed and the same sentences come back on a second call', () => {
    const bodies = ['1. A.\n\n2. The petition is within limitation.'];
    const copy = [...bodies];
    const first = findLimitationClaims(bodies);
    expect(bodies).toEqual(copy);
    expect(findLimitationClaims(bodies)).toEqual(first);
  });

  it.each([
    ['within', WITHIN],
    ['beyond', BEYOND_41],
  ])(
    'the model copying the computed %s text is flagged like any other limitation sentence',
    (_n, text) => {
      const found = findLimitationClaims([`1. A.\n\n2. ${text}\n\n3. B.`]);
      expect(found.length).toBeGreaterThan(0);
      expect(found.join(' ')).toContain(text.split('. ')[0]);
    },
  );

  it('empty or heading-only input gives nothing', () => {
    expect(findLimitationClaims([])).toEqual([]);
    expect(findLimitationClaims([''])).toEqual([]);
    expect(
      findLimitationClaims(['PRAYER', '', 'It is prayed that the order be set aside.']),
    ).toEqual([]);
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

  it('a mutant that guessed on an unknown date would print a number: the real one prints the blank', () => {
    const r = computeLimitation(rule, input({ filingDate: none }));
    expect(r.text).toBe(UNKNOWN);
    expect(r.text).not.toMatch(/\d+ days?/);
  });

  it('a mutant that flagged every sentence with "limitation" would flag real grounds: the real finder does not', () => {
    const grounds = [
      'The cognizance taken is barred by limitation under Section 468 CrPC.',
      'The complaint was filed beyond the period of limitation.',
      'Limitation is not an issue here.',
    ];
    const mutantFlags = grounds.filter((s) => /limitation/i.test(s));
    expect(mutantFlags).toHaveLength(3);
    expect(findLimitationClaims([grounds.map((g, i) => `${i + 1}. ${g}`).join('\n\n')])).toEqual(
      [],
    );
  });

  it('a mutant that edited the flagged sentence would change the text: the finder returns it as written', () => {
    const s = 'The petition is filed within the period of limitation, no condonation is needed.';
    expect(findLimitationClaims([`1. ${s}`])[0]).toBe(s);
  });

  it('a copy of the computed text is flagged, not skipped', () => {
    expect(findLimitationClaims([`1. ${WITHIN}`])).toEqual([WITHIN]);
  });
});
