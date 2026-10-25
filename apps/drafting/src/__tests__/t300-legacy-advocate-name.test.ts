/**
 * T-300 - resolveLegacyAdvocateName: the advocate-name rule of the old POST /documents/generate.
 * Arjun: the body's advocateName is used only if, trimmed, it is 1 to 100 characters with no
 * `{`, `}`, CR, LF or U+2028/2029; otherwise the profile name. Never a refusal.
 * T-443: the route itself is retired (410, see t443-legacy-generate-410.test.ts), so the
 * route-level cases were removed; this pure helper stays in template-engine.service.
 */
import { resolveLegacyAdvocateName } from '../services/template-engine.service';

const PROFILE = 'Adv. Profile Name';

describe('resolveLegacyAdvocateName', () => {
  it('a valid name is used, trimmed', () => {
    expect(resolveLegacyAdvocateName('Adv. Ravi Shankar', { name: PROFILE })).toBe(
      'Adv. Ravi Shankar',
    );
    expect(resolveLegacyAdvocateName('  Adv. Ravi Shankar  ', { name: PROFILE })).toBe(
      'Adv. Ravi Shankar',
    );
  });

  it('100 characters is accepted', () => {
    const name = 'A'.repeat(100);
    expect(resolveLegacyAdvocateName(name, { name: PROFILE })).toBe(name);
  });

  it.each([
    ['a placeholder token', 'Adv. {current_date}'],
    ['a closing brace', 'Adv. X}'],
    ['a line feed', 'Adv. X\nSecond line'],
    ['a carriage return', 'Adv. X\rSecond line'],
    ['U+2028', 'Adv. X Y'],
    ['U+2029', 'Adv. X Y'],
    ['0 characters', ''],
    ['only spaces', '    '],
    ['101 characters', 'A'.repeat(101)],
    ['missing', undefined],
  ])('%s: falls back to the profile name', (_l, v) => {
    expect(resolveLegacyAdvocateName(v, { name: PROFILE })).toBe(PROFILE);
  });

  it('a bad value and no profile name: undefined, no throw', () => {
    expect(resolveLegacyAdvocateName('{x}', {})).toBeUndefined();
    expect(resolveLegacyAdvocateName('{x}', { name: '   ' })).toBeUndefined();
    expect(resolveLegacyAdvocateName(undefined, { name: null })).toBeUndefined();
  });
});
