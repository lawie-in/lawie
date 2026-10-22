/**
 * T-522 (Arjun ruling 3 and 6) - unit tests for the two new pure exports of @lawie/shared: the
 * password rule constant and isVerified. @lawie/shared has no test runner of its own
 * ("No tests for shared package"), so they run here, against the built package, the same way
 * auth consumes it. Also checks that the auth validator is driven by the constant.
 */
import './setupEnv';

import {
  EMAIL_VERIFICATION_REQUIRED,
  PASSWORD_DIGIT_RE,
  PASSWORD_LOWERCASE_RE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULE_IDS,
  PASSWORD_UPPERCASE_RE,
  failedPasswordRules,
  isStrongPassword,
  isVerified,
  meetsPasswordRule,
} from '@lawie/shared';

import {
  PASSWORD_WEAK_MESSAGE,
  checkChangePassword,
  checkResetPassword,
  passwordSchema,
  validateRegister,
} from '../validators/auth.validator';

// AJ-522-S7, byte for byte from handoff/legal/T-511-copy-rulings-ajay.md (row AJ-522-S7).
const S7 = 'Use at least 8 characters, with an upper-case letter, a lower-case letter and a digit.';

describe('T-522 shared password constant', () => {
  it('the validator constant is exactly the signed S7 line', () => {
    expect(PASSWORD_WEAK_MESSAGE).toBe(S7);
  });

  it('keeps the rule unchanged: 8+ characters, an upper-case letter, a lower-case letter, a digit', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_UPPERCASE_RE.test('A')).toBe(true);
    expect(PASSWORD_UPPERCASE_RE.test('a1')).toBe(false);
    expect(PASSWORD_LOWERCASE_RE.test('a')).toBe(true);
    expect(PASSWORD_LOWERCASE_RE.test('A1')).toBe(false);
    expect(PASSWORD_DIGIT_RE.test('7')).toBe(true);
    expect(PASSWORD_DIGIT_RE.test('Aa')).toBe(false);
    expect([...PASSWORD_RULE_IDS]).toEqual(['min_length', 'uppercase', 'lowercase', 'number']);
  });

  const CASES: Array<[string, string[]]> = [
    ['Passw0rdOk', []],
    ['Abcdefg1', []],
    ['Abcdef1', ['min_length']],
    ['', ['min_length', 'uppercase', 'lowercase', 'number']],
    ['abcdefgh', ['uppercase', 'number']],
    ['ABCDEFGH', ['lowercase', 'number']],
    ['abcdefg1', ['uppercase']],
    ['ABCDEFG1', ['lowercase']],
    ['Abcdefgh', ['number']],
    ['a1', ['min_length', 'uppercase']],
    ['12345678', ['uppercase', 'lowercase']],
  ];

  it.each(CASES)('failedPasswordRules(%j) -> %j, in display order', (pw, expected) => {
    expect(failedPasswordRules(pw)).toEqual(expected);
    expect(meetsPasswordRule(pw)).toBe(expected.length === 0);
    expect(isStrongPassword(pw)).toBe(expected.length === 0);
  });

  it('the auth validator accepts exactly what the shared rule accepts', () => {
    for (const [pw, expected] of CASES) {
      expect(passwordSchema.safeParse(pw).success).toBe(expected.length === 0);
    }
  });

  it('the validator reports the same rule codes as the shared constant (reset and change)', () => {
    for (const [pw, expected] of CASES) {
      if (expected.length === 0) continue;
      const reset = checkResetPassword({ password: pw });
      expect(reset.ok).toBe(false);
      if (!reset.ok) {
        expect(reset.unmet).toEqual(expected);
        expect(reset.message).toBe(S7);
      }
    }
    const change = checkChangePassword({ currentPassword: 'Passw0rdOk', newPassword: 'abc' });
    expect(change.ok).toBe(false);
  });

  it('a password at exactly the shared minimum length passes, one shorter fails', () => {
    const ok = `Aa1${'x'.repeat(PASSWORD_MIN_LENGTH - 3)}`;
    expect(ok).toHaveLength(PASSWORD_MIN_LENGTH);
    expect(passwordSchema.safeParse(ok).success).toBe(true);
    expect(passwordSchema.safeParse(ok.slice(1)).success).toBe(false);
  });

  it('sign-up validation uses the one signed S7 line for every weak password', () => {
    for (const pw of ['short', 'alllowercase1', 'ALLUPPERCASE1', 'NoDigitsHere']) {
      expect(() => validateRegister({ email: 'a@example.com', password: pw, name: 'A' })).toThrow(
        S7,
      );
    }
  });
});

describe('T-522 shared isVerified', () => {
  it('is true for a verified email', () => {
    expect(isVerified({ emailVerified: true })).toBe(true);
  });

  it('is true for a Google account, whatever emailVerified says', () => {
    expect(isVerified({ authProvider: 'google', emailVerified: false })).toBe(true);
    expect(isVerified({ authProvider: 'google' })).toBe(true);
  });

  it('is true for a linked googleId (an old password account linked to Google)', () => {
    expect(isVerified({ googleId: 'g-123', emailVerified: false, authProvider: 'local' })).toBe(
      true,
    );
  });

  it('is false for an unverified password account', () => {
    expect(isVerified({ emailVerified: false })).toBe(false);
    expect(isVerified({ emailVerified: false, authProvider: 'local' })).toBe(false);
    expect(isVerified({})).toBe(false);
  });

  it('is false for an empty, null or missing googleId', () => {
    expect(isVerified({ googleId: '' })).toBe(false);
    expect(isVerified({ googleId: null })).toBe(false);
    expect(isVerified({ googleId: undefined, emailVerified: null })).toBe(false);
  });

  it('is false for a missing user (fails closed)', () => {
    expect(isVerified(null)).toBe(false);
    expect(isVerified(undefined)).toBe(false);
  });

  it('only a strict true counts as emailVerified', () => {
    expect(isVerified({ emailVerified: 'true' as unknown as boolean })).toBe(false);
    expect(isVerified({ emailVerified: 1 as unknown as boolean })).toBe(false);
  });

  it('exports the 403 error code the billing fence already uses', () => {
    expect(EMAIL_VERIFICATION_REQUIRED).toBe('email_verification_required');
  });
});
