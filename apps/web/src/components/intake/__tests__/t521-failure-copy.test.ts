// T-521 (Arjun ruling 4): what a failed generation may say about Ink, and the sessionStorage prefill reader.
// Pure units. The OneFlow-level paths are in OneFlow.t521.failure.test.tsx.
import {
  CHECK_DOCUMENTS_LIST,
  CONNECTION_LOST,
  DRAFT_DID_NOT_FINISH,
  generationFailureCopy,
  NO_INK_USED,
} from '../generationFailure';
import {
  DRAFT_PREFILL_KEY,
  INITIAL_PREFILL_MAX,
  initialPrefillFrom,
  takeDraftPrefill,
} from '../initialQuery';

import { DESCRIPTION_MAX } from '@/lib/draftPrefill';

// A realistic matter text of exactly `n` characters that ends mid-sentence, so a cut is visible.
const matterText = (n: number): string => {
  const base =
    'The client is a sole earner and was arrested after the chargesheet was filed, the sureties are ready and the magistrate refused bail. ';
  const tail = ' he is the';
  return base.repeat(Math.ceil(n / base.length)).slice(0, n - tail.length) + tail;
};

describe('generationFailureCopy (T-521, T-567 item 41)', () => {
  it('signed strings are exactly the ruled ones', () => {
    expect(DRAFT_DID_NOT_FINISH).toBe('The draft did not finish.');
    expect(NO_INK_USED).toBe('No Ink was used.');
    expect(CHECK_DOCUMENTS_LIST).toBe('Check your documents list to see where this draft stands.');
    expect(CONNECTION_LOST).toBe('Connection lost. Check your documents.');
  });

  it('error event, inkReleased true: headline, `No Ink was used.`, the reason, a claim', () => {
    expect(
      generationFailureCopy({
        reason: 'Reason from server',
        retryable: true,
        source: 'error_event',
        code: 'drafter_failed',
        inkReleased: true,
      }),
    ).toEqual({
      headline: DRAFT_DID_NOT_FINISH,
      statusLine: NO_INK_USED,
      detail: 'Reason from server',
      noInkClaim: true,
    });
  });

  it.each([
    ['false', { inkReleased: false }],
    ['absent', {}],
  ])('error event, inkReleased %s: the documents-list line, no Ink claim', (_n, extra) => {
    const c = generationFailureCopy({
      reason: 'Reason from server',
      retryable: true,
      source: 'error_event',
      code: 'drafter_failed',
      ...extra,
    });
    expect(c).toEqual({
      headline: DRAFT_DID_NOT_FINISH,
      statusLine: CHECK_DOCUMENTS_LIST,
      detail: 'Reason from server',
      noInkClaim: false,
    });
    expect(JSON.stringify(c)).not.toContain('No Ink was used');
  });

  it('error event with no code at all still counts as a server error event', () => {
    const c = generationFailureCopy({ reason: 'x', retryable: true, source: 'error_event' });
    expect(c.headline).toBe(DRAFT_DID_NOT_FINISH);
    expect(c.statusLine).toBe(CHECK_DOCUMENTS_LIST);
    expect(c.noInkClaim).toBe(false);
  });

  it('an empty reason is hidden (detail null), for both status lines', () => {
    for (const inkReleased of [true, false, undefined]) {
      const c = generationFailureCopy({
        reason: '',
        retryable: true,
        source: 'error_event',
        inkReleased,
      });
      expect(c.detail).toBeNull();
      expect(c.headline).toBe(DRAFT_DID_NOT_FINISH);
    }
  });

  it('inkReleased is ignored for insufficient_ink, a drop and a start failure', () => {
    for (const source of ['dropped', 'start'] as const) {
      const c = generationFailureCopy({ reason: 'r', retryable: true, source, inkReleased: true });
      expect(c.noInkClaim).toBe(false);
      expect(c.statusLine).toBeNull();
    }
  });

  it('error event insufficient_ink: the reason only, no status line, no claim (unchanged)', () => {
    const c = generationFailureCopy({
      reason: 'You need more Ink for this draft.',
      retryable: false,
      source: 'error_event',
      code: 'insufficient_ink',
      inkReleased: true,
    });
    expect(c).toEqual({
      headline: 'You need more Ink for this draft.',
      statusLine: null,
      detail: null,
      noInkClaim: false,
    });
    expect(JSON.stringify(c)).not.toContain('No Ink was used');
  });

  it('dropped stream or thrown fetch: Connection lost, the client reason under it, no claim', () => {
    const c = generationFailureCopy({
      reason: 'The connection was lost before the draft was finished.',
      retryable: true,
      source: 'dropped',
    });
    expect(c.headline).toBe(CONNECTION_LOST);
    expect(c.detail).toBe('The connection was lost before the draft was finished.');
    expect(c.noInkClaim).toBe(false);
    expect(JSON.stringify(c)).not.toContain('No Ink was used');
  });

  it('a dropped run never claims, even if a code is present', () => {
    const c = generationFailureCopy({
      reason: 'r',
      retryable: true,
      source: 'dropped',
      code: 'drafter_failed',
    });
    expect(c.noInkClaim).toBe(false);
    expect(c.headline).not.toBe(DRAFT_DID_NOT_FINISH);
  });

  it.each([
    [
      'start source',
      { reason: 'The draft could not be started. Please try again.', source: 'start' as const },
    ],
    ['no source', { reason: 'The drafting service sent nothing back.' }],
  ])('start failure (%s): the reason only, no claim', (_n, e) => {
    const c = generationFailureCopy({ retryable: true, ...e });
    expect(c).toEqual({
      headline: e.reason,
      statusLine: null,
      detail: null,
      noInkClaim: false,
    });
  });
});

describe('initialPrefillFrom (T-521 round 3)', () => {
  it('trims', () =>
    expect(initialPrefillFrom('  bail for my client  ')).toBe('bail for my client'));
  it('keeps inner whitespace and newlines', () =>
    expect(initialPrefillFrom('a  b\nc')).toBe('a  b\nc'));
  it('caps at the shared DESCRIPTION_MAX, with the MAX/MAX+1 boundary (T-608, was 500)', () => {
    const M = INITIAL_PREFILL_MAX;
    expect(M).toBe(DESCRIPTION_MAX);
    expect(initialPrefillFrom('x'.repeat(M + 900))).toHaveLength(M);
    expect(initialPrefillFrom('y'.repeat(M))).toBe('y'.repeat(M));
    expect(initialPrefillFrom('y'.repeat(M + 1))).toBe('y'.repeat(M));
    expect(initialPrefillFrom('y'.repeat(M - 1))).toBe('y'.repeat(M - 1));
  });
  it('a 500- or 501-character value is no longer cut (T-608)', () => {
    expect(initialPrefillFrom('q'.repeat(500))).toHaveLength(500);
    expect(initialPrefillFrom('q'.repeat(501))).toHaveLength(501);
  });
  it('trims before capping', () => {
    const M = INITIAL_PREFILL_MAX;
    expect(initialPrefillFrom(`   ${'z'.repeat(M + 100)}`)).toBe('z'.repeat(M));
    expect(initialPrefillFrom(`   ${'z'.repeat(M)}   `)).toBe('z'.repeat(M));
  });
  // T-608: this test's meaning changed. It used to pin the removed trailing trim (a cut ending on
  // a space lost it, so 500 became 499). Now whitespace at the cut is kept and the result is
  // exactly MAX long.
  it('keeps whitespace at the cut: no second trim, so the result is exactly MAX long', () => {
    const M = INITIAL_PREFILL_MAX;
    const got = initialPrefillFrom(`${'a'.repeat(M - 1)} ${'b'.repeat(10)}`);
    expect(got).toBe(`${'a'.repeat(M - 1)} `);
    expect(got).toHaveLength(M);
  });
  it('surrogate pairs are counted in UTF-16 units and never split', () => {
    const M = INITIAL_PREFILL_MAX;
    // pair would straddle unit M: dropped
    expect(initialPrefillFrom(`${'a'.repeat(M - 1)}😀tail`)).toBe('a'.repeat(M - 1));
    // pair ends exactly at unit M: kept
    expect(initialPrefillFrom(`${'a'.repeat(M - 2)}😀tail`)).toBe(`${'a'.repeat(M - 2)}😀`);
  });
  it('a 657-character description comes back whole (T-608 AC3)', () => {
    const text = matterText(657);
    expect(initialPrefillFrom(text)).toBe(text);
    expect(initialPrefillFrom(`  ${text}\n`)).toBe(text);
  });
  it.each([[''], ['   '], ['\n\t ']])('empty or whitespace %j is undefined', (raw) =>
    expect(initialPrefillFrom(raw)).toBeUndefined(),
  );
  it('null, undefined and non-strings are undefined', () => {
    expect(initialPrefillFrom(null)).toBeUndefined();
    expect(initialPrefillFrom(undefined)).toBeUndefined();
    expect(initialPrefillFrom(42 as unknown as string)).toBeUndefined();
    expect(initialPrefillFrom({} as unknown as string)).toBeUndefined();
  });
});

describe('takeDraftPrefill (T-521 round 3)', () => {
  const fake = (value: string | null) => {
    const order: string[] = [];
    return {
      order,
      getItem: jest.fn((k: string) => {
        order.push(`get:${k}`);
        return value;
      }),
      removeItem: jest.fn((k: string) => {
        order.push(`remove:${k}`);
      }),
    };
  };

  it('uses the lawie:draft-prefill key', () =>
    expect(DRAFT_PREFILL_KEY).toBe('lawie:draft-prefill'));

  it('returns the cleaned text and removes the key right after reading', () => {
    const s = fake('  Sentinel words  ');
    expect(takeDraftPrefill(s)).toBe('Sentinel words');
    expect(s.order).toEqual([`get:${DRAFT_PREFILL_KEY}`, `remove:${DRAFT_PREFILL_KEY}`]);
  });

  it('caps the text it returns at DESCRIPTION_MAX', () => {
    expect(takeDraftPrefill(fake('k'.repeat(DESCRIPTION_MAX + 900)))).toHaveLength(DESCRIPTION_MAX);
    expect(takeDraftPrefill(fake('k'.repeat(DESCRIPTION_MAX + 1)))).toHaveLength(DESCRIPTION_MAX);
    expect(takeDraftPrefill(fake('k'.repeat(DESCRIPTION_MAX)))).toHaveLength(DESCRIPTION_MAX);
  });

  it('a 657-character stored description is returned whole, and the key is removed (T-608 AC3)', () => {
    const text = matterText(657);
    const s = fake(text);
    const got = takeDraftPrefill(s);
    expect(got).toHaveLength(657);
    expect(got).toBe(text);
    expect(s.removeItem).toHaveBeenCalledWith(DRAFT_PREFILL_KEY);
  });

  it('no key: undefined and nothing removed', () => {
    const s = fake(null);
    expect(takeDraftPrefill(s)).toBeUndefined();
    expect(s.removeItem).not.toHaveBeenCalled();
  });

  it('an empty value is ignored, but the key is still removed', () => {
    for (const v of ['', '   ']) {
      const s = fake(v);
      expect(takeDraftPrefill(s)).toBeUndefined();
      expect(s.removeItem).toHaveBeenCalledWith(DRAFT_PREFILL_KEY);
    }
  });

  it('getItem throwing: undefined, no throw', () => {
    const s = {
      getItem: () => {
        throw new Error('blocked');
      },
      removeItem: jest.fn(),
    };
    expect(takeDraftPrefill(s)).toBeUndefined();
  });

  it('removeItem throwing: no throw', () => {
    const s = {
      getItem: () => 'Sentinel words',
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => takeDraftPrefill(s)).not.toThrow();
  });

  it('storage access throwing (default storage): no throw, undefined', () => {
    const desc = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('denied');
      },
    });
    try {
      expect(takeDraftPrefill()).toBeUndefined();
    } finally {
      if (desc) Object.defineProperty(window, 'sessionStorage', desc);
    }
  });

  it('reads window.sessionStorage by default, once', () => {
    window.sessionStorage.setItem(DRAFT_PREFILL_KEY, 'Sentinel words');
    expect(takeDraftPrefill()).toBe('Sentinel words');
    expect(window.sessionStorage.getItem(DRAFT_PREFILL_KEY)).toBeNull();
    expect(takeDraftPrefill()).toBeUndefined();
  });
});
