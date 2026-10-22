/**
 * T-527 AC5 (round 4 ruling, Arjun): startup guard for the Razorpay key mode.
 *  - rzp_live_ outside production: always refused.
 *  - rzp_live_ in production, or any key outside production: ok.
 *  - rzp_test_ / unprefixed key in production:
 *      RAZORPAY_ALLOW_TEST_KEYS === 'true' -> ok, one warn, no Sentry;
 *      else RAZORPAY_KEY_GUARD === 'strict' -> refused;
 *      else -> ok, one error log + one Sentry event, boot continues.
 * Messages name the rule and key kind, never the key value.
 *
 * Keys are built at runtime so gitleaks sees no secret-looking literals.
 */
import fs from 'fs';
import path from 'path';

import type * as EnvModule from '../config/env';

const LIVE = ['rzp', 'live', ''].join('_');
const TEST = ['rzp', 'test', ''].join('_');
const TAIL = 'AbCdEf123456';
const key = (kind: 'live' | 'test' | 'other') =>
  kind === 'live' ? LIVE + TAIL : kind === 'test' ? TEST + TAIL : 'plain_' + TAIL;

const NODE_ENVS = ['production', 'development', 'test', 'staging'] as const;
const KINDS = ['live', 'test', 'other'] as const;
const ALLOWS: Array<string | undefined> = [undefined, 'true', 'TRUE', '1', ''];
const GUARDS: Array<string | undefined> = [undefined, 'strict', 'STRICT', 'x'];

type Expected = 'ok' | 'warn' | 'error' | 'refuse';

/** The expected verdict, written out from the rule table (not from the code). */
function expected(
  nodeEnv: string,
  kind: string,
  allow: string | undefined,
  guard: string | undefined,
): Expected {
  // T-558 (Arjun): a value outside {unset,'','true'} / {unset,'','strict'} refuses in every NODE_ENV.
  if (allow !== undefined && allow !== '' && allow !== 'true') return 'refuse';
  if (guard !== undefined && guard !== '' && guard !== 'strict') return 'refuse';
  const prod = nodeEnv === 'production';
  if (kind === 'live') return prod ? 'ok' : 'refuse';
  if (!prod) return 'ok';
  if (allow === 'true') return 'warn';
  if (guard === 'strict') return 'refuse';
  return 'error';
}

const matrix = NODE_ENVS.flatMap((n) =>
  KINDS.flatMap((k) => ALLOWS.flatMap((a) => GUARDS.map((g) => [n, k, a, g] as const))),
);
const validEnumValues = (a: string | undefined, g: string | undefined) =>
  (a === undefined || a === '' || a === 'true') && (g === undefined || g === '' || g === 'strict');
const show = (v: string | undefined) => (v === undefined ? 'unset' : JSON.stringify(v));

describe('T-527 AC5: checkRazorpayKeyMode (pure)', () => {
  const { checkRazorpayKeyMode } = jest.requireActual<typeof EnvModule>('../config/env');

  it.each(
    matrix
      .filter(([, , a, g]) => validEnumValues(a, g))
      .map(([n, k, a, g]) => [n, k, show(a), show(g), a, g] as const),
  )('%s + %s key + ALLOW %s + GUARD %s', (nodeEnv, kind, _a, _g, allow, guard) => {
    const k = key(kind);
    const res = checkRazorpayKeyMode(nodeEnv, k, allow === 'true', guard === 'strict');
    const want = expected(nodeEnv, kind, allow, guard);

    if (want === 'ok') expect(res).toEqual({ ok: true });
    else if (want === 'refuse') expect(res).toEqual({ ok: false, reason: expect.any(String) });
    else expect(res).toEqual({ ok: true, level: want, message: expect.any(String) });

    // No compat alias and nothing carrying the key value.
    expect(res).not.toHaveProperty('warn');
    const printed = JSON.stringify(res);
    expect(printed).not.toContain(k);
    expect(printed).not.toContain(TAIL);
    const text = 'reason' in res ? res.reason : 'message' in res ? res.message : '';
    if (want !== 'ok') expect(text.length).toBeGreaterThan(0);
  });

  it('strictGuard defaults to false (production + test key boots with level error)', () => {
    expect(checkRazorpayKeyMode('production', key('test'), false)).toEqual({
      ok: true,
      level: 'error',
      message: expect.any(String),
    });
  });

  it('messages name the rule and the key kind', () => {
    const msg = (r: unknown) =>
      String(
        (r as { message?: string; reason?: string }).message ?? (r as { reason?: string }).reason,
      );
    expect(msg(checkRazorpayKeyMode('production', key('test'), true))).toContain('rzp_test_');
    expect(msg(checkRazorpayKeyMode('production', key('test'), true))).toContain(
      'RAZORPAY_ALLOW_TEST_KEYS',
    );
    expect(msg(checkRazorpayKeyMode('production', key('other'), false, true))).toContain(
      'RAZORPAY_KEY_GUARD',
    );
    expect(msg(checkRazorpayKeyMode('development', key('live'), true, false))).toContain(
      'rzp_live_',
    );
  });
});

describe('T-527 AC5: loadEnv (superRefine -> exit)', () => {
  const ENV_KEYS = [
    'NODE_ENV',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_ALLOW_TEST_KEYS',
    'RAZORPAY_KEY_GUARD',
  ];
  const saved: Record<string, string | undefined> = {};
  let exitSpy: jest.SpyInstance;
  let consoleErr: jest.SpyInstance;

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    consoleErr = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    jest.restoreAllMocks();
  });

  function load(
    nodeEnv: string,
    keyId: string,
    allow: string | undefined,
    guard: string | undefined,
  ) {
    process.env.NODE_ENV = nodeEnv;
    process.env.RAZORPAY_KEY_ID = keyId;
    if (allow === undefined) delete process.env.RAZORPAY_ALLOW_TEST_KEYS;
    else process.env.RAZORPAY_ALLOW_TEST_KEYS = allow;
    if (guard === undefined) delete process.env.RAZORPAY_KEY_GUARD;
    else process.env.RAZORPAY_KEY_GUARD = guard;
    let mod: typeof EnvModule | undefined;
    let threw: unknown;
    jest.isolateModules(() => {
      try {
        mod = jest.requireActual<typeof EnvModule>('../config/env');
      } catch (e) {
        threw = e;
      }
    });
    return { mod, threw };
  }

  it.each(matrix.map(([n, k, a, g]) => [n, k, show(a), show(g), a, g] as const))(
    '%s + %s key + ALLOW %s + GUARD %s',
    (nodeEnv, kind, _a, _g, allow, guard) => {
      const k = key(kind);
      const { mod, threw } = load(nodeEnv, k, allow, guard);
      const want = expected(nodeEnv, kind, allow, guard);

      if (want === 'refuse') {
        expect(exitSpy).toHaveBeenCalledTimes(1);
        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(String(threw)).toBe('Error: exit:1');
        const printed = JSON.stringify(consoleErr.mock.calls);
        // An out-of-enum value names its own variable; otherwise the key rule names RAZORPAY_KEY_ID.
        if (allow !== undefined && allow !== '' && allow !== 'true') {
          expect(printed).toContain('RAZORPAY_ALLOW_TEST_KEYS');
        }
        if (guard !== undefined && guard !== '' && guard !== 'strict') {
          expect(printed).toContain('RAZORPAY_KEY_GUARD');
        }
        if (validEnumValues(allow, guard)) expect(printed).toContain('RAZORPAY_KEY_ID');
        expect(printed).not.toContain(k);
        expect(printed).not.toContain(TAIL);
      } else {
        expect(threw).toBeUndefined();
        expect(exitSpy).not.toHaveBeenCalled();
        expect(mod!.env.NODE_ENV).toBe(nodeEnv);
        const notice = mod!.razorpayKeyModeNotice;
        if (want === 'ok') {
          expect(notice).toBeUndefined();
        } else {
          expect(notice).toEqual({ level: want, message: expect.any(String) });
          expect(notice!.message).not.toContain(k);
          expect(notice!.message).not.toContain(TAIL);
        }
        // T-558 (Arjun): the razorpayKeyModeWarning export is gone; razorpayKeyModeNotice is the one.
        expect(mod).not.toHaveProperty('razorpayKeyModeWarning');
      }
    },
  );

  it('T-558: only the exact strings are accepted: ALLOW unset/empty/"true", GUARD unset/empty/"strict"', () => {
    for (const nodeEnv of ['production', 'development', 'test']) {
      for (const ok of [undefined, '', 'true']) {
        expect(load(nodeEnv, key('other'), ok, undefined).threw).toBeUndefined();
      }
      for (const ok of [undefined, '', 'strict']) {
        expect(
          load(nodeEnv, key(nodeEnv === 'production' ? 'live' : 'other'), undefined, ok).threw,
        ).toBeUndefined();
      }
      for (const bad of ['TRUE', '1', 'false', 'yes', ' true']) {
        expect(load(nodeEnv, key('other'), bad, undefined).threw).toBeDefined();
      }
      for (const bad of ['STRICT', 'x', 'true', 'off']) {
        expect(load(nodeEnv, key('other'), undefined, bad).threw).toBeDefined();
      }
    }
  });

  it('T-558: a refused value prints the variable name, never the key', () => {
    const k = key('test');
    load('production', k, 'TRUE', undefined);
    load('development', k, undefined, 'x');
    const printed = JSON.stringify(consoleErr.mock.calls);
    expect(printed).toContain('RAZORPAY_ALLOW_TEST_KEYS');
    expect(printed).toContain('RAZORPAY_KEY_GUARD');
    expect(printed).not.toContain(TAIL);
  });

  it('T-558 AC8: ALLOW=true wins over a valid GUARD; empty ALLOW does not', () => {
    expect(load('production', key('test'), 'true', 'strict').threw).toBeUndefined();
    expect(load('production', key('test'), 'true', '').threw).toBeUndefined();
    expect(load('production', key('test'), '', 'strict').threw).toBeDefined();
  });
});

describe('T-527 AC5: the boot notice in config/razorpay.ts', () => {
  const ENV_KEYS = [
    'NODE_ENV',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_ALLOW_TEST_KEYS',
    'RAZORPAY_KEY_GUARD',
  ];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    jest.dontMock('../config/logger');
    jest.dontMock('@sentry/node');
    jest.restoreAllMocks();
  });

  function boot(
    nodeEnv: string,
    keyId: string,
    allow: string | undefined,
    guard: string | undefined,
  ) {
    process.env.NODE_ENV = nodeEnv;
    process.env.RAZORPAY_KEY_ID = keyId;
    if (allow === undefined) delete process.env.RAZORPAY_ALLOW_TEST_KEYS;
    else process.env.RAZORPAY_ALLOW_TEST_KEYS = allow;
    if (guard === undefined) delete process.env.RAZORPAY_KEY_GUARD;
    else process.env.RAZORPAY_KEY_GUARD = guard;
    const log = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
    const tags: Array<[string, unknown]> = [];
    const scope = { setTag: jest.fn((k: string, v: unknown) => tags.push([k, v])) };
    const sentry = {
      captureMessage: jest.fn(),
      captureException: jest.fn(),
      withScope: jest.fn((cb: (s: typeof scope) => void) => cb(scope)),
    };
    jest.isolateModules(() => {
      jest.doMock('../config/logger', () => ({ __esModule: true, default: log }));
      jest.doMock('@sentry/node', () => ({ __esModule: true, ...sentry }));
      jest.requireActual('../config/razorpay');
    });
    return { log, sentry, tags };
  }

  const MARKER = 'razorpay_test_keys_in_production';
  const anyCall = (...mocks: jest.Mock[]) => JSON.stringify(mocks.map((m) => m.mock.calls));

  it('error level (production, test key, default): one error log, one Sentry event, marker tag only', () => {
    const k = key('test');
    const { log, sentry, tags } = boot('production', k, undefined, undefined);

    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.warn).not.toHaveBeenCalled();
    expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      'billing.razorpay.test_keys_in_production',
      'error',
    );
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(tags).toEqual([['marker', MARKER]]);
    expect(
      anyCall(log.error, log.warn, log.info, sentry.captureMessage, sentry.withScope, scope(tags)),
    ).not.toContain(TAIL);
  });

  it('error level also for an unprefixed key and for an empty GUARD', () => {
    for (const [kind, guard] of [
      ['other', undefined],
      ['test', ''],
    ] as const) {
      const { log, sentry } = boot('production', key(kind), undefined, guard);
      expect(log.error).toHaveBeenCalledTimes(1);
      expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    }
  });

  it('warn level (ALLOW=true): one warn, no error log, no Sentry', () => {
    for (const guard of [undefined, 'strict']) {
      const k = key('test');
      const { log, sentry, tags } = boot('production', k, 'true', guard);
      expect(log.warn).toHaveBeenCalledTimes(1);
      expect(log.error).not.toHaveBeenCalled();
      expect(sentry.captureMessage).not.toHaveBeenCalled();
      expect(sentry.withScope).not.toHaveBeenCalled();
      expect(tags).toEqual([]);
      expect(anyCall(log.warn)).not.toContain(TAIL);
    }
  });

  it('ok rows: no log and no Sentry', () => {
    for (const [n, kind, a, g] of matrix) {
      if (expected(n, kind, a, g) !== 'ok') continue;
      const { log, sentry } = boot(n, key(kind), a, g);
      expect(log.warn).not.toHaveBeenCalled();
      expect(log.error).not.toHaveBeenCalled();
      expect(sentry.captureMessage).not.toHaveBeenCalled();
      expect(sentry.withScope).not.toHaveBeenCalled();
    }
  });

  it('canary: across the whole matrix the key value never reaches a log or Sentry call', () => {
    for (const [n, kind, a, g] of matrix) {
      if (expected(n, kind, a, g) === 'refuse') continue;
      const k = key(kind);
      const { log, sentry, tags } = boot(n, k, a, g);
      const all = anyCall(
        log.warn,
        log.error,
        log.info,
        log.debug,
        sentry.captureMessage,
        sentry.captureException,
        sentry.withScope,
      );
      expect(all).not.toContain(k);
      expect(all).not.toContain(TAIL);
      expect(JSON.stringify(tags)).not.toContain(TAIL);
    }
  });
});

function scope(tags: Array<[string, unknown]>): jest.Mock {
  return { mock: { calls: tags } } as unknown as jest.Mock;
}

describe('T-527 AC5: docker-compose.demo.yml', () => {
  const file = path.resolve(__dirname, '../../../../docker-compose.demo.yml');
  const text = fs.readFileSync(file, 'utf8');
  // Split the services section into blocks keyed by their 2-space-indented name.
  const blocks: Record<string, string> = {};
  let current: string | null = null;
  let inServices = false;
  for (const line of text.split('\n')) {
    if (/^services:/.test(line)) {
      inServices = true;
      continue;
    }
    if (/^\S/.test(line) && !/^services:/.test(line)) inServices = false;
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (inServices && m) {
      current = m[1];
      blocks[current] = '';
    } else if (inServices && current) {
      blocks[current] += line + '\n';
    }
  }

  it('billing sets RAZORPAY_ALLOW_TEST_KEYS "true"; no other service does', () => {
    expect(Object.keys(blocks)).toContain('billing');
    expect(blocks.billing).toMatch(/^\s+RAZORPAY_ALLOW_TEST_KEYS:\s*(["']?)true\1\s*$/m);
    for (const [name, body] of Object.entries(blocks)) {
      if (name !== 'billing') expect(body).not.toContain('RAZORPAY_ALLOW_TEST_KEYS');
    }
  });
});
