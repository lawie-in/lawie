/**
 * T-563 AC1 - shared helpers (shared has no test runner, so they are tested here), the boot
 * refusal matrix (pure function and loadEnv), the secret format rule and the constant-time
 * compare helper. All secrets are fake and built at runtime.
 */
import './setupEnv';

import {
  TEST_CONSENT_VERSION,
  excludeTestConsentFilter,
  isProductionBox,
  isReservedTestEmail,
  isTestAccountName,
} from '@lawie/shared';
import crypto from 'crypto';

import { testSignupBypassBootRefusal } from '../config/env';
import { testBypassSecretMatches } from '../services/test-signup-bypass.service';

const SECRET = 'lts_' + 'a'.repeat(40);
const MARKERS = ['RAZORPAY_KEY_GUARD', 'SECRETS_ENV', 'RAZORPAY_KEY_ID'] as const;

describe('isProductionBox', () => {
  it.each([
    [{ RAZORPAY_KEY_GUARD: 'strict' }, true],
    [{ RAZORPAY_KEY_GUARD: ' STRICT ' }, true],
    [{ SECRETS_ENV: 'prod' }, true],
    [{ SECRETS_ENV: 'Prod' }, true],
    [{ SECRETS_ENV: 'production' }, true],
    [{ SECRETS_ENV: ' Production ' }, true],
    [{ RAZORPAY_KEY_ID: 'rzp_live_abc' }, true],
    [{ RAZORPAY_KEY_ID: 'RZP_LIVE_abc' }, true],
    [{}, false],
    [
      { RAZORPAY_KEY_GUARD: 'warn', SECRETS_ENV: 'develop', RAZORPAY_KEY_ID: 'rzp_test_abc' },
      false,
    ],
    [{ RAZORPAY_KEY_GUARD: '', SECRETS_ENV: '', RAZORPAY_KEY_ID: '' }, false],
  ])('%j -> %s', (markers, expected) => {
    expect(isProductionBox(markers)).toBe(expected);
  });
});

describe('isReservedTestEmail', () => {
  it.each(['a@example.com', 'a@example.org', 'A@EXAMPLE.COM', 'TEST_x@lawie.test', 'a@b.c.test'])(
    '%s is reserved',
    (e) => expect(isReservedTestEmail(e)).toBe(true),
  );
  it.each([
    'a@test.lawie.in',
    'a@gmail.com',
    'a@lawie.in',
    'a@notexample.com',
    'a@sub.example.com',
    'a@example.net',
    'a@.test',
    'a@test',
    'a@evil.test.com',
    'no-at-sign',
    '@example.com',
    'a@b@example.com',
  ])('%s is not reserved', (e) => expect(isReservedTestEmail(e)).toBe(false));
});

describe('isTestAccountName', () => {
  it('starts with TEST (case-sensitive, after trim)', () => {
    expect(isTestAccountName('TEST_anushka_1')).toBe(true);
    expect(isTestAccountName('  TEST x')).toBe(true);
    expect(isTestAccountName('test_x')).toBe(false);
    expect(isTestAccountName('A TEST')).toBe(false);
    expect(isTestAccountName('')).toBe(false);
  });
});

describe('excludeTestConsentFilter', () => {
  it('leaves out test consent records and test accounts', () => {
    expect(TEST_CONSENT_VERSION).toBe('test-bypass');
    expect(excludeTestConsentFilter()).toEqual({
      termsVersion: { $ne: 'test-bypass' },
      acceptedVia: { $ne: 'test' },
      isTestAccount: { $ne: true },
    });
  });
});

describe('testSignupBypassBootRefusal (pure)', () => {
  const prodMarkers: Array<[string, Record<string, string>]> = [
    ['RAZORPAY_KEY_GUARD=strict', { RAZORPAY_KEY_GUARD: 'strict' }],
    ['SECRETS_ENV=prod', { SECRETS_ENV: 'prod' }],
    ['SECRETS_ENV=production', { SECRETS_ENV: 'production' }],
    ['SECRETS_ENV= Production ', { SECRETS_ENV: ' Production ' }],
    ['an rzp_live_ key', { RAZORPAY_KEY_ID: 'rzp_live_' + 'x'.repeat(10) }],
  ];

  it.each(prodMarkers)('the flag with %s refuses, naming the variable only', (_n, marker) => {
    const bad = testSignupBypassBootRefusal({ ...marker, TEST_SIGNUP_BYPASS: 'true' });
    expect(bad).toEqual(['TEST_SIGNUP_BYPASS']);
  });

  it.each(prodMarkers)('the secret with %s refuses', (_n, marker) => {
    const bad = testSignupBypassBootRefusal({ ...marker, TEST_SIGNUP_BYPASS_SECRET: SECRET });
    expect(bad).toEqual(['TEST_SIGNUP_BYPASS_SECRET']);
    expect(JSON.stringify(bad)).not.toContain(SECRET);
  });

  it('both set on a production box refuses on both', () => {
    expect(
      testSignupBypassBootRefusal({
        SECRETS_ENV: 'prod',
        TEST_SIGNUP_BYPASS: 'true',
        TEST_SIGNUP_BYPASS_SECRET: SECRET,
      }),
    ).toEqual(['TEST_SIGNUP_BYPASS', 'TEST_SIGNUP_BYPASS_SECRET']);
  });

  it('no production marker boots with both set', () => {
    expect(
      testSignupBypassBootRefusal({
        TEST_SIGNUP_BYPASS: 'true',
        TEST_SIGNUP_BYPASS_SECRET: SECRET,
        RAZORPAY_KEY_ID: 'rzp_test_abc',
      }),
    ).toEqual([]);
  });

  it('empty values count as absent, even on a production box', () => {
    expect(
      testSignupBypassBootRefusal({
        RAZORPAY_KEY_GUARD: 'strict',
        TEST_SIGNUP_BYPASS: '',
        TEST_SIGNUP_BYPASS_SECRET: '  ',
      }),
    ).toEqual([]);
  });
});

describe('loadEnv (the real boot path)', () => {
  const SAVED = { ...process.env };
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k];
    Object.assign(process.env, SAVED);
    jest.restoreAllMocks();
  });

  /** Load config/env in isolation with the given overrides; report exit and error text. */
  function boot(vars: Record<string, string>) {
    for (const k of ['TEST_SIGNUP_BYPASS', 'TEST_SIGNUP_BYPASS_SECRET', ...MARKERS]) {
      delete process.env[k];
    }
    Object.assign(process.env, vars);
    let errText = '';
    jest.spyOn(console, 'error').mockImplementation((...a) => void (errText += a.join(' ')));
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    let loaded = null as { env: Record<string, unknown> } | null;
    try {
      jest.isolateModules(() => {
        loaded = require('../config/env');
      });
    } catch {
      /* exit mocked to throw */
    }
    return { exited: exit.mock.calls.length > 0, errText, loaded };
  }

  it.each([
    ['RAZORPAY_KEY_GUARD', 'strict'],
    ['SECRETS_ENV', 'prod'],
    ['RAZORPAY_KEY_ID', 'rzp_live_' + 'x'.repeat(10)],
  ])('refuses to boot with the flag and %s', (name, value) => {
    const r = boot({ TEST_SIGNUP_BYPASS: 'true', [name]: value });
    expect(r.exited).toBe(true);
    expect(r.errText).toContain('TEST_SIGNUP_BYPASS');
    if (value.startsWith('rzp_')) expect(r.errText).not.toContain(value);
  });

  it('refuses to boot with the secret on a production box, without echoing it', () => {
    const r = boot({ TEST_SIGNUP_BYPASS_SECRET: SECRET, SECRETS_ENV: 'prod' });
    expect(r.exited).toBe(true);
    expect(r.errText).toContain('TEST_SIGNUP_BYPASS_SECRET');
    expect(r.errText).not.toContain(SECRET);
  });

  it('boots with no marker and both set; the flag is true and the secret is read', () => {
    const r = boot({ TEST_SIGNUP_BYPASS: 'true', TEST_SIGNUP_BYPASS_SECRET: SECRET });
    expect(r.exited).toBe(false);
    expect(r.loaded!.env.TEST_SIGNUP_BYPASS).toBe(true);
    expect(r.loaded!.env.TEST_SIGNUP_BYPASS_SECRET).toBe(SECRET);
  });

  it('boots on a production box with both absent or empty', () => {
    const absent = boot({ RAZORPAY_KEY_GUARD: 'strict' });
    expect(absent.exited).toBe(false);
    expect(absent.loaded!.env.TEST_SIGNUP_BYPASS).toBe(false);
    const empty = boot({
      RAZORPAY_KEY_GUARD: 'strict',
      TEST_SIGNUP_BYPASS: '',
      TEST_SIGNUP_BYPASS_SECRET: '',
    });
    expect(empty.exited).toBe(false);
    expect(empty.loaded!.env.TEST_SIGNUP_BYPASS_SECRET).toBeUndefined();
  });

  it('the flag is on only for the exact string true', () => {
    expect(boot({ TEST_SIGNUP_BYPASS: 'TRUE' }).loaded!.env.TEST_SIGNUP_BYPASS).toBe(false);
    expect(boot({ TEST_SIGNUP_BYPASS: '1' }).loaded!.env.TEST_SIGNUP_BYPASS).toBe(false);
  });

  describe('secret format: at least 32 characters and the lts_ prefix', () => {
    it('accepts exactly 32 characters with the prefix', () => {
      const s = 'lts_' + 'b'.repeat(28);
      expect(s).toHaveLength(32);
      const r = boot({ TEST_SIGNUP_BYPASS_SECRET: s });
      expect(r.exited).toBe(false);
      expect(r.loaded!.env.TEST_SIGNUP_BYPASS_SECRET).toBe(s);
    });
    it('rejects 31 characters', () => {
      const r = boot({ TEST_SIGNUP_BYPASS_SECRET: 'lts_' + 'b'.repeat(27) });
      expect(r.exited).toBe(true);
      expect(r.errText).toContain('TEST_SIGNUP_BYPASS_SECRET');
    });
    it('rejects 32+ characters without the lts_ prefix', () => {
      const wrong = 'xxx_' + 'b'.repeat(40);
      const r = boot({ TEST_SIGNUP_BYPASS_SECRET: wrong });
      expect(r.exited).toBe(true);
      expect(r.errText).not.toContain(wrong);
    });
  });
});

describe('testBypassSecretMatches (constant-time helper)', () => {
  it('matches only the same secret', () => {
    expect(testBypassSecretMatches(SECRET, SECRET)).toBe(true);
    expect(testBypassSecretMatches('lts_' + 'a'.repeat(39) + 'b', SECRET)).toBe(false);
    expect(testBypassSecretMatches('short', SECRET)).toBe(false);
  });
  it('is false for missing, empty, non-string or unconfigured values', () => {
    expect(testBypassSecretMatches(undefined, SECRET)).toBe(false);
    expect(testBypassSecretMatches('', SECRET)).toBe(false);
    expect(testBypassSecretMatches(123, SECRET)).toBe(false);
    expect(testBypassSecretMatches(SECRET, undefined)).toBe(false);
    expect(testBypassSecretMatches(SECRET, '')).toBe(false);
  });
  it('compares with crypto.timingSafeEqual on equal-length SHA-256 digests', () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    testBypassSecretMatches('x', SECRET);
    expect(spy).toHaveBeenCalledTimes(1);
    const [a, b] = spy.mock.calls[0] as [Buffer, Buffer];
    expect(a.length).toBe(32);
    expect(b.length).toBe(32);
    spy.mockRestore();
  });
});
