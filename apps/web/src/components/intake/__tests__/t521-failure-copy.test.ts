// T-521 (Arjun ruling 4): what a failed generation may say about Ink, and the sessionStorage prefill reader.
// Pure units. The OneFlow-level paths are in OneFlow.t521.failure.test.tsx.
import { CONNECTION_LOST, DRAFT_DID_NOT_FINISH, generationFailureCopy } from '../generationFailure';
import {
  DRAFT_PREFILL_KEY,
  INITIAL_PREFILL_MAX,
  initialPrefillFrom,
  takeDraftPrefill,
} from '../initialQuery';

describe('generationFailureCopy (T-521)', () => {
  it('signed strings are exactly the ruled ones', () => {
    expect(DRAFT_DID_NOT_FINISH).toBe('The draft did not finish. No Ink was used.');
    expect(CONNECTION_LOST).toBe('Connection lost. Check your documents.');
  });

  it('error event with an unknown code: the signed line, with the server reason under it', () => {
    expect(
      generationFailureCopy({
        reason: 'Reason from server',
        retryable: true,
        source: 'error_event',
        code: 'drafter_failed',
      }),
    ).toEqual({
      headline: DRAFT_DID_NOT_FINISH,
      detail: 'Reason from server',
      noInkClaim: true,
    });
  });

  it('error event with no code at all still counts as a server error event', () => {
    const c = generationFailureCopy({ reason: 'x', retryable: true, source: 'error_event' });
    expect(c.headline).toBe(DRAFT_DID_NOT_FINISH);
    expect(c.noInkClaim).toBe(true);
  });

  it('error event insufficient_ink: the reason only, no signed line, no claim', () => {
    const c = generationFailureCopy({
      reason: 'You need more Ink for this draft.',
      retryable: false,
      source: 'error_event',
      code: 'insufficient_ink',
    });
    expect(c).toEqual({
      headline: 'You need more Ink for this draft.',
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
    expect(c).toEqual({ headline: e.reason, detail: null, noInkClaim: false });
  });
});

describe('initialPrefillFrom (T-521 round 3)', () => {
  it('trims', () =>
    expect(initialPrefillFrom('  bail for my client  ')).toBe('bail for my client'));
  it('keeps inner whitespace and newlines', () =>
    expect(initialPrefillFrom('a  b\nc')).toBe('a  b\nc'));
  it('caps at 500, with the 500/501 boundary', () => {
    expect(INITIAL_PREFILL_MAX).toBe(500);
    expect(initialPrefillFrom('x'.repeat(900))).toHaveLength(500);
    expect(initialPrefillFrom('y'.repeat(500))).toHaveLength(500);
    expect(initialPrefillFrom('y'.repeat(501))).toHaveLength(500);
  });
  it('trims before capping', () =>
    expect(initialPrefillFrom(`   ${'z'.repeat(600)}`)).toBe('z'.repeat(500)));
  it('does not end on whitespace after the cut', () =>
    expect(initialPrefillFrom(`${'a'.repeat(499)} ${'b'.repeat(10)}`)).toBe('a'.repeat(499)));
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

  it('caps the text it returns', () => {
    expect(takeDraftPrefill(fake('k'.repeat(900)))).toHaveLength(500);
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
