import { amountInWords, sameAmountWords } from '../services/intake-text';
import { amountInWordsP5 } from '../services/fact-ledger.service';

describe('T-624: amount in words with paise (Ajay P-R3, ceee45cb)', () => {
  describe('amountInWords', () => {
    it.each([
      ['15,000', 'Rupees Fifteen Thousand only'],
      ['15,000.00', 'Rupees Fifteen Thousand only'],
      ['15000.0', 'Rupees Fifteen Thousand only'],
      ['12.01', 'Rupees Twelve and One Paise only'],
      ['12.05', 'Rupees Twelve and Five Paise only'],
      ['15,000.50', 'Rupees Fifteen Thousand and Fifty Paise only'],
      ['15,000.5', 'Rupees Fifteen Thousand and Fifty Paise only'],
      ['1,00,000.99', 'Rupees One Lakh and Ninety Nine Paise only'],
      [
        '99,999.99',
        'Rupees Ninety Nine Thousand Nine Hundred Ninety Nine and Ninety Nine Paise only',
      ],
      ['1,00,000.01', 'Rupees One Lakh and One Paise only'],
      [
        '99,99,999.50',
        'Rupees Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine and Fifty Paise only',
      ],
      ['1,00,00,000.05', 'Rupees One Crore and Five Paise only'],
      ['10,00,00,000.50', 'Rupees Ten Crore and Fifty Paise only'],
      ['1.19', 'Rupees One and Nineteen Paise only'],
    ])('amountInWords(%s)', (figures, words) => {
      expect(amountInWords(figures)).toBe(words);
    });

    it('has no paise words when paise is 0', () => {
      expect(amountInWords('15,000')).not.toMatch(/paise/i);
      expect(amountInWords('15,000.00')).not.toMatch(/paise/i);
    });

    it('pins the signed shape when paise > 0', () => {
      for (const f of [
        '1.01',
        '12.05',
        '15,000.50',
        '99,999.99',
        '1,00,000.01',
        '1,00,00,000.05',
      ]) {
        expect(amountInWords(f)).toMatch(/^Rupees .+ and .+ Paise only$/);
        expect(amountInWords(f)).not.toMatch(/and Paise/);
      }
    });

    it('stays null below one rupee', () => {
      expect(amountInWords('0.50')).toBeNull();
    });
  });

  describe('parity with amountInWordsP5', () => {
    it.each([
      ['1', 1],
      ['15,000', 15000],
      ['15,000.50', 15000.5],
      ['12.01', 12.01],
      ['12.05', 12.05],
      ['99,999.99', 99999.99],
      ['1,00,000.01', 100000.01],
      ['99,99,999.50', 9999999.5],
      ['1,00,00,000.05', 10000000.05],
      ['2,40,000', 240000],
    ])('%s', (figures, n) => {
      expect(amountInWords(figures)).toBe(amountInWordsP5(n));
    });
  });

  describe('sameAmountWords', () => {
    const derived = amountInWords('15,000.50') as string;

    it('matches the new order, the old order and a loose form', () => {
      expect(sameAmountWords('Rupees Fifteen Thousand and Fifty Paise only', derived)).toBe(true);
      expect(sameAmountWords('Rupees Fifteen Thousand and Paise Fifty only', derived)).toBe(true);
      expect(sameAmountWords('fifteen thousand paise fifty', derived)).toBe(true);
    });

    it('matches 99.99 in both orders', () => {
      const d = amountInWords('99.99') as string;
      expect(sameAmountWords('Ninety Nine and Paise Ninety-Nine', d)).toBe(true);
      expect(sameAmountWords('Rupees Ninety Nine and Ninety Nine Paise only', d)).toBe(true);
    });

    it('keeps 120.05 and 100.25 apart, both ways', () => {
      const a = amountInWords('120.05') as string;
      const b = amountInWords('100.25') as string;
      expect(a).toBe('Rupees One Hundred Twenty and Five Paise only');
      expect(b).toBe('Rupees One Hundred and Twenty Five Paise only');
      expect(sameAmountWords(a, b)).toBe(false);
      expect(sameAmountWords(b, a)).toBe(false);
    });

    it('does not match different paise', () => {
      expect(sameAmountWords('Rupees Fifteen Thousand and Fifty Five Paise only', derived)).toBe(
        false,
      );
      expect(sameAmountWords('Rupees Fifteen Thousand and Paise Fifty Five only', derived)).toBe(
        false,
      );
    });

    it('does not match when paise is missing on either side', () => {
      expect(sameAmountWords('Rupees Fifteen Thousand only', derived)).toBe(false);
      expect(sameAmountWords('Rupees Fifteen Thousand Fifty only', derived)).toBe(false);
      expect(sameAmountWords(derived, amountInWords('15,000') as string)).toBe(false);
    });

    it('still loosens whole-rupee words', () => {
      expect(
        sameAmountWords('Rs. Two Lakhs Forty Thousand Only', amountInWords('2,40,000') as string),
      ).toBe(true);
    });
  });
});
