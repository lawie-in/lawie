/**
 * T-522 (Arjun ruling 3, 22 Oct 2026): the one password rule. The auth validator (sign-up,
 * reset, change) and the web checklist read it from here, so they cannot drift. Rule only: no
 * user-facing sentence lives here until Ajay signs one (Vishal, 22 Oct 2026).
 * The rule itself is unchanged (8+ characters, an upper-case letter, a lower-case letter and a
 * digit); moving to a length-over-composition rule is a separate ticket after v1.
 */
export const PASSWORD_MIN_LENGTH = 8;

/** The rule ids, in display order. The web maps each id to its own checklist line. */
export const PASSWORD_RULE_IDS = ['min_length', 'uppercase', 'lowercase', 'number'] as const;
export type PasswordRuleId = (typeof PASSWORD_RULE_IDS)[number];

/** One regex per composition rule (min_length is a length check, not a regex). */
export const PASSWORD_UPPERCASE_RE = /[A-Z]/;
export const PASSWORD_LOWERCASE_RE = /[a-z]/;
export const PASSWORD_DIGIT_RE = /\d/;

/** Which rules a password fails, in PASSWORD_RULE_IDS order. Empty means it passes. */
export function failedPasswordRules(password: string): PasswordRuleId[] {
  const failed: PasswordRuleId[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) failed.push('min_length');
  if (!PASSWORD_UPPERCASE_RE.test(password)) failed.push('uppercase');
  if (!PASSWORD_LOWERCASE_RE.test(password)) failed.push('lowercase');
  if (!PASSWORD_DIGIT_RE.test(password)) failed.push('number');
  return failed;
}

/** True when the password meets every rule. */
export function meetsPasswordRule(password: string): boolean {
  return failedPasswordRules(password).length === 0;
}
