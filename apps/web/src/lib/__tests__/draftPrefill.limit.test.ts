// T-608: the one shared description limit and the helper that cuts to it.
import { DRAFT_PREFILL_MAX, draftPrefill } from '@/components/dashboard/DashboardCommandBar';
import { DESCRIPTION_MAX as DESCRIBE_STEP_MAX } from '@/components/intake/DescribeStep';
import { INITIAL_PREFILL_MAX, initialPrefillFrom } from '@/components/intake/initialQuery';
import { DESCRIPTION_MAX, capToLimit } from '@/lib/draftPrefill';

const EMOJI = '😀'; // one code point, two UTF-16 units

// A realistic matter text of exactly `n` characters that ends mid-sentence, so a cut is visible.
const matterText = (n: number): string => {
  const base =
    'The client is a sole earner and was arrested after the chargesheet was filed, the sureties are ready and the magistrate refused bail. ';
  const tail = ' he is the';
  return base.repeat(Math.ceil(n / base.length)).slice(0, n - tail.length) + tail;
};

describe('the shared description limit (T-608, AC2)', () => {
  it('is 4000 (pinned: a silent change of the constant must fail here)', () => {
    expect(DESCRIPTION_MAX).toBe(4000);
  });

  it('the New document page, the dashboard box and the prefill reader all use the same constant', () => {
    expect(DESCRIBE_STEP_MAX).toBe(DESCRIPTION_MAX);
    expect(DRAFT_PREFILL_MAX).toBe(DESCRIPTION_MAX);
    expect(INITIAL_PREFILL_MAX).toBe(DESCRIPTION_MAX);
  });

  it('the old 500 / 499 cut is gone on both sides', () => {
    const t = matterText(657);
    expect(draftPrefill(t)).toHaveLength(657);
    expect(initialPrefillFrom(t)).toHaveLength(657);
  });
});

describe('capToLimit', () => {
  it('empty stays empty', () => expect(capToLimit('')).toBe(''));

  it('shorter than max is returned whole', () => {
    expect(capToLimit('abc', 10)).toBe('abc');
    expect(capToLimit('a'.repeat(DESCRIPTION_MAX - 1))).toBe('a'.repeat(DESCRIPTION_MAX - 1));
  });

  it('exactly max is returned whole', () => {
    expect(capToLimit('abcde', 5)).toBe('abcde');
    expect(capToLimit('a'.repeat(DESCRIPTION_MAX))).toBe('a'.repeat(DESCRIPTION_MAX));
  });

  it('one over max is cut to max; the default max is DESCRIPTION_MAX', () => {
    expect(capToLimit('abcdef', 5)).toBe('abcde');
    expect(capToLimit('a'.repeat(DESCRIPTION_MAX + 1))).toHaveLength(DESCRIPTION_MAX);
  });

  it('BMP-only text is cut exactly like slice(0, max)', () => {
    const t = 'जमानत आवेदन — ₹5,000 “quoted” '.repeat(300);
    for (const max of [1, 7, 100, 999, DESCRIPTION_MAX]) {
      expect(capToLimit(t, max)).toBe(t.slice(0, max));
    }
  });

  it('whitespace at the cut is kept (no trimming)', () => {
    expect(capToLimit('ab  cd', 3)).toBe('ab ');
  });

  it('a surrogate pair that would straddle the limit is dropped, never split', () => {
    const got = capToLimit(`${'a'.repeat(4)}${EMOJI}tail`, 5);
    expect(got).toBe('aaaa');
    expect(got).toHaveLength(4);
  });

  it('a surrogate pair that fits exactly is kept', () => {
    const got = capToLimit(`${'a'.repeat(3)}${EMOJI}tail`, 5);
    expect(got).toBe(`aaa${EMOJI}`);
    expect(got).toHaveLength(5);
  });

  it('counts units, not code points', () => {
    const got = capToLimit(EMOJI.repeat(10), 7);
    expect(got).toBe(EMOJI.repeat(3));
    expect(got).toHaveLength(6);
  });

  it('max 0 gives an empty string, even for an astral first character', () => {
    expect(capToLimit('abc', 0)).toBe('');
    expect(capToLimit(`${EMOJI}x`, 0)).toBe('');
  });

  it('max 1 drops a leading pair', () => expect(capToLimit(`${EMOJI}x`, 1)).toBe(''));

  it('a custom max overrides the default', () => {
    expect(capToLimit('abcdefghij', 3)).toBe('abc');
    expect(capToLimit('abcdefghij', 100)).toBe('abcdefghij');
  });

  it('a lone surrogate counts as one unit and is passed through', () => {
    expect(capToLimit('a\ud800bc', 3)).toBe('a\ud800b');
  });
});

describe('the 657-character carry, helper level (T-608, AC3)', () => {
  it('matterText is 657 characters and ends mid-sentence', () => {
    const t = matterText(657);
    expect(t).toHaveLength(657);
    expect(t.endsWith(' he is the')).toBe(true);
  });

  it('capToLimit keeps all 657', () => {
    const t = matterText(657);
    expect(capToLimit(t)).toBe(t);
  });
});
