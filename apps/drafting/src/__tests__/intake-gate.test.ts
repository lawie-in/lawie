/**
 * T-113 — scoring rules of the intake gate script (no model, no network).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  checkComposition,
  GateItem,
  judge,
  summarise,
  unquotedValues,
} from '../services/intake-gate-scoring';

const DESC = 'My client Ram Kumar, aged 32, was arrested in FIR No. 124/2026.';
const item = (expected: string, extra: Partial<GateItem> = {}): GateItem => ({
  id: 'x',
  description: DESC,
  expected,
  ...extra,
});

describe('judge', () => {
  it('matched the right template → pass; a wrong one → confident_wrong', () => {
    expect(
      judge(item('bail_regular'), 200, { outcome: 'matched', template_id: 'bail_regular' }).verdict,
    ).toBe('pass');
    expect(
      judge(item('bail_regular'), 200, { outcome: 'matched', template_id: 'bail_anticipatory' })
        .verdict,
    ).toBe('confident_wrong');
    expect(
      judge(item('bail_regular', { also_ok: ['bail_anticipatory'] }), 200, {
        outcome: 'matched',
        template_id: 'bail_anticipatory',
      }).verdict,
    ).toBe('pass');
  });

  it('a choice that includes the right template is not counted as confident and wrong', () => {
    const r = judge(item('bail_regular'), 200, {
      outcome: 'needs_choice',
      choices: [{ template_id: 'bail_regular' }],
    });
    expect(r.verdict).toBe('asked_choice');
  });

  it('guided and no_match are judged against the expected outcome', () => {
    expect(judge(item('guided_strict'), 200, { outcome: 'guided' }).verdict).toBe('pass');
    expect(judge(item('no_match'), 200, { outcome: 'guided' }).verdict).toBe('wrong_outcome');
    expect(
      judge(item('guided_light'), 200, { outcome: 'matched', template_id: 'bail_regular' }).verdict,
    ).toBe('confident_wrong');
    expect(judge(item('no_match'), 429, {}).verdict).toBe('error');
  });

  it('gate 3: flags a description-sourced value whose quote is not in the description', () => {
    const r = judge(item('bail_regular'), 200, {
      outcome: 'matched',
      template_id: 'bail_regular',
      fields: {
        applicant_name: { value: 'Ram Kumar', source: 'description', quote: 'My client Ram Kumar' },
        applicant_age: { value: '33', source: 'description', quote: 'aged 33' },
        language: { value: 'en', source: 'user' },
      },
    });
    expect(r.unquotedValues).toEqual(['applicant_age']);
    expect(unquotedValues(DESC, { a: { source: 'description' } })).toEqual(['a']);
  });
});

describe('summarise', () => {
  it('gate 1 fails above 2 percent confident-and-wrong; gates 2 and 4 are reported as not measurable', () => {
    const passes = Array.from({ length: 98 }, (_, i) =>
      judge({ ...item('no_match'), id: `p${i}` }, 200, { outcome: 'no_match' }),
    );
    const wrong = [1, 2, 3].map((i) =>
      judge({ ...item('bail_regular'), id: `w${i}` }, 200, {
        outcome: 'matched',
        template_id: 'x',
      }),
    );
    const s = summarise([...passes, ...wrong.slice(0, 2)]); // 2 of 100
    expect(s.gates.gate1_confident_wrong_at_most_2pct).toBe('pass');
    const s2 = summarise([...passes, ...wrong]); // 3 of 101
    expect(s2.gates.gate1_confident_wrong_at_most_2pct).toBe('fail');
    expect(s2.verdict).toBe('gate not passed');
    expect(s.gates.gate2_no_court_request_in_light_mode).toMatch(/not measurable/);
    expect(s.gates.gate4_no_invented_facts_in_guided_drafts).toMatch(/not measurable/);
  });

  it('an unavailable item makes the run invalid even if the rates look fine', () => {
    const s = summarise([judge(item('no_match'), 200, { outcome: 'unavailable' })]);
    expect(s.verdict).toBe('gate not passed');
  });
});

describe('checkComposition', () => {
  it('the example set is valid in shape but far below the T-113 rules', () => {
    const set = JSON.parse(
      readFileSync(
        join(__dirname, '..', '..', 'scripts', 'intake-gate', 'example-set.json'),
        'utf-8',
      ),
    ) as GateItem[];
    const problems = checkComposition(set, [
      'bail_regular',
      'bail_anticipatory',
      'writ_petition_civil',
    ]);
    expect(problems.some((p) => /need at least 150/.test(p))).toBe(true);
    expect(problems.some((p) => /templates have no description: bail_anticipatory/.test(p))).toBe(
      true,
    );
    expect(problems.some((p) => /not a template id/.test(p))).toBe(false);
    expect(problems.some((p) => /Hindi/.test(p))).toBe(false);
  });

  it('rejects unknown expected values and duplicate ids', () => {
    const problems = checkComposition([item('nonsense'), item('no_match')], ['bail_regular']);
    expect(problems).toEqual(
      expect.arrayContaining([expect.stringMatching(/not a template id/), 'duplicate id x']),
    );
  });
});
