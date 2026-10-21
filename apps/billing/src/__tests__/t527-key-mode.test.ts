/**
 * T-527 AC5: startup guard for the Razorpay key mode (Arjun).
 *  - rzp_live_ outside production: refused.
 *  - rzp_test_ in production: refused unless RAZORPAY_ALLOW_TEST_KEYS is exactly
 *    "true" (demo only); then it boots with one warn.
 *  - a key with neither prefix: refused in production, allowed elsewhere.
 * Messages name the rule, never the key.
 *
 * Keys are built at runtime so gitleaks sees no secret-looking literals.
 */
import fs from 'fs';
import path from 'path';

import type * as EnvModule from '../config/env';

const LIVE = ['rzp', 'live', ''].join('_');
const TEST = ['rzp', 'test', ''].join('_');
const key = (kind: 'live' | 'test' | 'other', tail = 'AbCdEf123456') =>
  kind === 'live' ? LIVE + tail : kind === 'test' ? TEST + tail : 'plain_' + tail;

const NODE_ENVS = ['production', 'development', 'test', 'staging'] as const;
const KINDS = ['live', 'test', 'other'] as const;
const FLAGS: Array<string | undefined> = [undefined, 'true', 'TRUE', '1'];

/** The expected verdict, written out from the rule (not from the code). */
function expectedOk(nodeEnv: string, kind: string, flag: string | undefined): boolean {
  const prod = nodeEnv === 'production';
  if (kind === 'live') return prod;
  if (kind === 'test') return !prod || flag === 'true';
  return !prod;
}

describe('T-527 AC5: checkRazorpayKeyMode (pure)', () => {
  const { checkRazorpayKeyMode } = jest.requireActual<typeof EnvModule>('../config/env');

  const cases = NODE_ENVS.flatMap((n) =>
    KINDS.flatMap((k) => [true, false].map((allow) => [n, k, allow] as const)),
  );

  it.each(cases)('%s + %s key + allowTestKeys=%s', (nodeEnv, kind, allow) => {
    const k = key(kind);
    const res = checkRazorpayKeyMode(nodeEnv, k, allow);

    expect(res.ok).toBe(expectedOk(nodeEnv, kind, allow ? 'true' : undefined));
    // Nothing in the verdict carries the key.
    expect(JSON.stringify(res)).not.toContain(k);
    expect(JSON.stringify(res)).not.toContain('AbCdEf123456');
    if (!res.ok) expect(res.reason.length).toBeGreaterThan(0);
  });

  it('warns only for a test key in production allowed by the flag', () => {
    const warnCases = cases.filter(([n, k, a]) => {
      const r = checkRazorpayKeyMode(n, key(k), a);
      return r.ok && r.warn !== undefined;
    });
    expect(warnCases).toEqual([['production', 'test', true]]);
  });

  it('the flag never lets a live key into a non-production env', () => {
    for (const n of ['development', 'test', 'staging']) {
      expect(checkRazorpayKeyMode(n, key('live'), true).ok).toBe(false);
    }
  });

  it('the flag never lets an unprefixed key into production', () => {
    expect(checkRazorpayKeyMode('production', key('other'), true).ok).toBe(false);
  });
});

describe('T-527 AC5: loadEnv refuses a bad key mode (superRefine -> exit)', () => {
  const ENV_KEYS = ['NODE_ENV', 'RAZORPAY_KEY_ID', 'RAZORPAY_ALLOW_TEST_KEYS'];
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

  function load(nodeEnv: string, keyId: string, flag: string | undefined) {
    process.env.NODE_ENV = nodeEnv;
    process.env.RAZORPAY_KEY_ID = keyId;
    if (flag === undefined) delete process.env.RAZORPAY_ALLOW_TEST_KEYS;
    else process.env.RAZORPAY_ALLOW_TEST_KEYS = flag;
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

  const matrix = NODE_ENVS.flatMap((n) =>
    KINDS.flatMap((k) => FLAGS.map((f) => [n, k, f] as const)),
  );

  it.each(matrix)('%s + %s key + RAZORPAY_ALLOW_TEST_KEYS=%s', (nodeEnv, kind, flag) => {
    const k = key(kind);
    const { mod, threw } = load(nodeEnv, k, flag);

    if (expectedOk(nodeEnv, kind, flag)) {
      expect(threw).toBeUndefined();
      expect(exitSpy).not.toHaveBeenCalled();
      expect(mod!.env.NODE_ENV).toBe(nodeEnv);
    } else {
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(String(threw)).toBe('Error: exit:1');
      const printed = JSON.stringify(consoleErr.mock.calls);
      expect(printed).toContain('RAZORPAY_KEY_ID');
      // The printed message names the rule, never the key.
      expect(printed).not.toContain(k);
      expect(printed).not.toContain('AbCdEf123456');
    }
  });

  it('only the exact string "true" opts in: "TRUE" and "1" are refused', () => {
    expect(load('production', key('test'), 'true').threw).toBeUndefined();
    expect(load('production', key('test'), 'TRUE').threw).toBeDefined();
    expect(load('production', key('test'), '1').threw).toBeDefined();
    expect(load('production', key('test'), '').threw).toBeDefined();
  });

  it('exports a warning only for a test key in production allowed by the flag', () => {
    expect(load('production', key('test'), 'true').mod!.razorpayKeyModeWarning).toEqual(
      expect.any(String),
    );
    expect(load('production', key('live'), undefined).mod!.razorpayKeyModeWarning).toBeUndefined();
    expect(load('test', key('test'), 'true').mod!.razorpayKeyModeWarning).toBeUndefined();
    expect(load('development', key('test'), undefined).mod!.razorpayKeyModeWarning).toBeUndefined();
  });
});

describe('T-527 AC5: the boot warn in config/razorpay.ts', () => {
  const ENV_KEYS = ['NODE_ENV', 'RAZORPAY_KEY_ID', 'RAZORPAY_ALLOW_TEST_KEYS'];
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
    jest.restoreAllMocks();
  });

  function boot(nodeEnv: string, keyId: string, flag: string | undefined) {
    process.env.NODE_ENV = nodeEnv;
    process.env.RAZORPAY_KEY_ID = keyId;
    if (flag === undefined) delete process.env.RAZORPAY_ALLOW_TEST_KEYS;
    else process.env.RAZORPAY_ALLOW_TEST_KEYS = flag;
    const log = { warn: jest.fn(), info: jest.fn(), error: jest.fn() };
    jest.isolateModules(() => {
      jest.doMock('../config/logger', () => ({ __esModule: true, default: log }));
      jest.requireActual('../config/razorpay');
    });
    return log;
  }

  it('test key in production with the flag: exactly one warn, no key in it', () => {
    const k = key('test');
    const log = boot('production', k, 'true');

    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain(k);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain('AbCdEf123456');
  });

  it.each([
    ['production', 'live', undefined],
    ['development', 'test', undefined],
    ['test', 'test', 'true'],
    ['staging', 'other', undefined],
  ] as const)('no warn for %s + %s key + flag %s', (nodeEnv, kind, flag) => {
    const log = boot(nodeEnv, key(kind), flag);
    expect(log.warn).not.toHaveBeenCalled();
  });
});

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
    expect(blocks.billing).toMatch(/^\s+RAZORPAY_ALLOW_TEST_KEYS: "true"\s*$/m);
    for (const [name, body] of Object.entries(blocks)) {
      if (name !== 'billing') expect(body).not.toContain('RAZORPAY_ALLOW_TEST_KEYS');
    }
  });
});
