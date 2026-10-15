/**
 * T-438 (b): internalSecretMatches compares sha256 digests with
 * crypto.timingSafeEqual and fails closed.
 * Spying on crypto works here because ts-jest compiles to CJS and the module
 * reads crypto.timingSafeEqual at call time; under native ESM it would not.
 */
import crypto from 'crypto';

import { internalSecretMatches } from '../utils/internal-secret';

const SECRET = 'test-internal-secret-at-least-16';

afterEach(() => jest.restoreAllMocks());

describe('internalSecretMatches', () => {
  it('accepts the right secret', () => {
    expect(internalSecretMatches(SECRET, SECRET)).toBe(true);
  });

  it.each([
    ['wrong value, same length', 'x'.repeat(SECRET.length)],
    ['one char off', SECRET.slice(0, -1) + 'X'],
    ['shorter', SECRET.slice(0, 5)],
    ['a prefix of the right one', SECRET.slice(0, -1)],
    ['longer (right one plus a suffix)', SECRET + 'x'],
    ['wrong case', SECRET.toUpperCase()],
    ['with whitespace', ' ' + SECRET],
    ['empty string', ''],
    ['array holding the right value', [SECRET]],
    ['array of two (repeated header)', [SECRET, SECRET]],
    ['undefined', undefined],
    ['null', null],
    ['number', 123],
    ['object', { a: 1 }],
    ['boolean', true],
  ] as Array<[string, unknown]>)('refuses %s', (_n, provided) => {
    expect(() => internalSecretMatches(provided, SECRET)).not.toThrow();
    expect(internalSecretMatches(provided, SECRET)).toBe(false);
  });

  it.each([
    ['undefined', undefined],
    ['empty string', ''],
  ])(
    'fails closed when the configured secret is %s, even if the caller sends the same',
    (_n, expected) => {
      expect(internalSecretMatches('', expected)).toBe(false);
      expect(internalSecretMatches('anything', expected)).toBe(false);
      expect(internalSecretMatches(expected, expected)).toBe(false);
    },
  );

  it('does not throw for unequal lengths (timingSafeEqual would)', () => {
    expect(() => crypto.timingSafeEqual(Buffer.from('a'), Buffer.from('ab'))).toThrow();
    expect(() => internalSecretMatches('a', SECRET)).not.toThrow();
    expect(() => internalSecretMatches('a'.repeat(1000), SECRET)).not.toThrow();
  });

  it('compares via crypto.timingSafeEqual on two 32-byte sha256 digests', () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    expect(internalSecretMatches('short', SECRET)).toBe(false);
    expect(internalSecretMatches(SECRET, SECRET)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
    const sha = (s: string) => crypto.createHash('sha256').update(s).digest();
    expect(spy.mock.calls[0][0]).toEqual(sha('short'));
    expect(spy.mock.calls[0][1]).toEqual(sha(SECRET));
    expect(spy.mock.calls[1][0]).toHaveLength(32);
    expect(spy.mock.calls[1][1]).toHaveLength(32);
  });

  it('does not reach timingSafeEqual for non-string or missing input (fails closed first)', () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    internalSecretMatches([SECRET], SECRET);
    internalSecretMatches(SECRET, undefined);
    expect(spy).not.toHaveBeenCalled();
  });

  it('result follows timingSafeEqual (stubbed true makes a wrong secret pass, so it is the deciding call)', () => {
    jest.spyOn(crypto, 'timingSafeEqual').mockReturnValue(true);
    expect(internalSecretMatches('wrong-but-nonempty', SECRET)).toBe(true);
  });
});
