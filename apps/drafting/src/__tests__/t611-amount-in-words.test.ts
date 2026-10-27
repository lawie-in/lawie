/**
 * T-611 P5 (Ajay, L10(a), signed) — amount_in_words is computed by code from the
 * held cheque_amount: `Rupees <Words> only`, or `Rupees <Words> and <Words> Paise only`;
 * Indian numbering; never guessed; only on a pack whose checklist has the field.
 */
import type { LedgerFact } from '@lawie/shared';

import { amountInWordsP5, withAmountInWordsFact } from '../services/fact-ledger.service';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';

function amount(value: number | string, key = 'cheque_amount', type = 'amount'): LedgerFact {
  return {
    id: `f_${key}`,
    key,
    label: 'Cheque Amount (Rs.)',
    type,
    value,
    display: `Rs ${value}`,
    raw_span: `Rs ${value}`,
    source: 'user',
    confidence: 0.99,
    required_in_draft: false,
  } as unknown as LedgerFact;
}

describe('amountInWordsP5 formatter', () => {
  it.each([
    [350000, 'Rupees Three Lakh Fifty Thousand only'],
    [12500000, 'Rupees One Crore Twenty Five Lakh only'],
    [240000, 'Rupees Two Lakh Forty Thousand only'],
    [100000, 'Rupees One Lakh only'],
    [15000, 'Rupees Fifteen Thousand only'],
    [999, 'Rupees Nine Hundred Ninety Nine only'],
    [20000000, 'Rupees Two Crore only'],
    [15000.5, 'Rupees Fifteen Thousand and Fifty Paise only'],
    [15000.05, 'Rupees Fifteen Thousand and Five Paise only'],
  ])('%s -> %s', (n, words) => {
    expect(amountInWordsP5(n)).toBe(words);
  });

  it('no "and" between groups; title case; Indian grouping, not millions', () => {
    const w = amountInWordsP5(1234567)!;
    expect(w).toBe('Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven only');
    expect(w).not.toMatch(/\band\b/);
    expect(w).not.toMatch(/Million/i);
  });

  it('is null below one rupee and for non-finite input (never guessed)', () => {
    expect(amountInWordsP5(0)).toBeNull();
    expect(amountInWordsP5(0.5)).toBeNull();
    expect(amountInWordsP5(Number.NaN)).toBeNull();
    expect(amountInWordsP5(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('withAmountInWordsFact', () => {
  const S138 = buildChecklist(loadRulePack('legal_notice_s138')!);
  const BAIL = buildChecklist(loadRulePack('bail_regular')!);
  const label = S138.find((i) => i.key === 'amount_in_words')!.label;

  it('adds one computed fact from exactly one held cheque_amount, with the pack label', () => {
    const out = withAmountInWordsFact([amount(350000)], S138);
    const f = out.find((x) => x.key === 'amount_in_words')!;
    expect(f).toBeDefined();
    expect(f.value).toBe('Rupees Three Lakh Fifty Thousand only');
    expect(f.display).toBe('Rupees Three Lakh Fifty Thousand only');
    expect(f.source).toBe('computed');
    expect(f.label).toBe(label);
    expect(out.filter((x) => x.key === 'amount_in_words')).toHaveLength(1);
    expect(out.find((x) => x.key === 'cheque_amount')).toBeDefined();
  });

  it('paise form is exact', () => {
    const out = withAmountInWordsFact([amount(15000.5)], S138);
    expect(out.find((x) => x.key === 'amount_in_words')!.display).toBe(
      'Rupees Fifteen Thousand and Fifty Paise only',
    );
  });

  it('is not added when cheque_amount is not held', () => {
    const out = withAmountInWordsFact([amount(5000, 'other_amount')], S138);
    expect(out.find((x) => x.key === 'amount_in_words')).toBeUndefined();
  });

  it('removes a stored amount_in_words when cheque_amount is not held (never guessed)', () => {
    const stored = amount('Rupees Ten only', 'amount_in_words', 'text');
    const out = withAmountInWordsFact([stored], S138);
    expect(out.find((x) => x.key === 'amount_in_words')).toBeUndefined();
  });

  it('a stored amount_in_words gives way to the computed one', () => {
    const stored = amount('Rupees Ten only', 'amount_in_words', 'text');
    const out = withAmountInWordsFact([amount(350000), stored], S138);
    const all = out.filter((x) => x.key === 'amount_in_words');
    expect(all).toHaveLength(1);
    expect(all[0].display).toBe('Rupees Three Lakh Fifty Thousand only');
  });

  it('is not added when cheque_amount is not numeric or is held twice', () => {
    expect(
      withAmountInWordsFact([amount('three lakh')], S138).find((x) => x.key === 'amount_in_words'),
    ).toBeUndefined();
    expect(
      withAmountInWordsFact([amount(350000), amount(100000)], S138).find(
        (x) => x.key === 'amount_in_words',
      ),
    ).toBeUndefined();
  });

  it('is not added on a pack whose checklist has no amount_in_words', () => {
    const facts = [amount(350000)];
    const out = withAmountInWordsFact(facts, BAIL);
    expect(out.find((x) => x.key === 'amount_in_words')).toBeUndefined();
    expect(out).toEqual(facts);
  });

  it('does not mutate its input', () => {
    const facts = [amount(350000)];
    withAmountInWordsFact(facts, S138);
    expect(facts).toHaveLength(1);
  });
});
