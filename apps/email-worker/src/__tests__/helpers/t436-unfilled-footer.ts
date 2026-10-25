/**
 * T-436: the real auth.verifyEmail footer is filled now (Ranchi, Jharkhand), so the placeholder
 * guard tests inject an unfilled footer instead. Use from a jest.mock factory:
 *
 *   let mockUnfilledFooter = true;
 *   jest.mock('../templates/auth/verifyEmail', () =>
 *     jest.requireActual('./helpers/t436-unfilled-footer').verifyEmailModule(() => mockUnfilledFooter));
 *
 * jest caches the factory's result, so the flag is read through a getter each time
 * '../placeholders' is freshly imported (jest.isolateModulesAsync). false = the real footer;
 * true = UNFILLED_FOOTER1; a string = that string as footer1.
 */
export const UNFILLED_FOOTER1 = 'Lawie (Sole Proprietorship), [registered address] [PIN]';

type Mode = boolean | string;

/**
 * `mode` is a getter, not a value: jest caches a mock factory's result across
 * jest.isolateModulesAsync registries, so VERIFY_EMAIL_STRINGS is a live getter that re-reads the
 * flag each time placeholders.ts is freshly imported.
 */
export function verifyEmailModule(mode: () => Mode): Record<string, unknown> {
  const actual = jest.requireActual('../../templates/auth/verifyEmail') as {
    VERIFY_EMAIL_STRINGS: Record<string, string>;
  };
  const patched: Record<string, unknown> = { ...actual };
  Object.defineProperty(patched, 'VERIFY_EMAIL_STRINGS', {
    enumerable: true,
    get() {
      const m = mode();
      if (m === false) return actual.VERIFY_EMAIL_STRINGS;
      return {
        ...actual.VERIFY_EMAIL_STRINGS,
        footer1: typeof m === 'string' ? m : UNFILLED_FOOTER1,
      };
    },
  });
  return patched;
}
