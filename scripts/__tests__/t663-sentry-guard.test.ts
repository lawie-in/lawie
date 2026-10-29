import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * T-663: every service's Jest setup file fails fast when SENTRY_DSN is set in the shell, with the
 * ticket's message; the web setup also fails on NEXT_PUBLIC_SENTRY_DSN. Each setup file is loaded in
 * a child node process (ts-node, transpile only) with a FAKE fixture DSN in its env.
 *
 * Nothing here prints or logs an environment. The only DSN-shaped string is the fixture below, and a
 * failed assertion shows only booleans / the child's output with that fixture checked absent.
 */
const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE_DSN = 'https://fixture-key-t663@example.invalid/1';
const FIXTURE_MARK = 'fixture-key-t663';

// The message is read from the ticket (it holds an em dash), not retyped.
const TICKET = readFileSync(
  path.join(ROOT, 'handoff', 'tickets', 'T-663-sentry-test-never-prints-dsn.md'),
  'utf8',
);
const MESSAGE = /"(SENTRY_DSN set [^"]+)"/.exec(TICKET)?.[1] ?? '';

const SETUP_FILES: Array<[string, string]> = [
  ['drafting', 'apps/drafting/src/__tests__/setupEnv.ts'],
  ['auth', 'apps/auth/src/__tests__/setupEnv.ts'],
  ['gateway', 'apps/gateway/src/__tests__/setupEnv.ts'],
  ['billing', 'apps/billing/src/__tests__/setupEnv.ts'],
  ['email-worker', 'apps/email-worker/src/__tests__/setupEnv.ts'],
  ['web', 'apps/web/jest.setup-env.ts'],
];

// Some setup files call `jest.mock(...)`, which exists only inside Jest; a stub stands in for it here.
const STUB_AND_REQUIRE =
  'globalThis.jest = new Proxy({}, { get: () => () => ({}) }); require(process.argv[1]);';

/** The shell's environment minus both DSN variables. Built here, never logged. */
function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.SENTRY_DSN;
  delete env.NEXT_PUBLIC_SENTRY_DSN;
  return env;
}

/** Load one setup file in a child process with `extra` added to the clean environment. */
function load(file: string, extra: Record<string, string>) {
  const r = spawnSync(
    process.execPath,
    ['-r', 'ts-node/register/transpile-only', '-e', STUB_AND_REQUIRE, path.join(ROOT, file)],
    {
      cwd: ROOT,
      env: { ...cleanEnv(), TS_NODE_COMPILER_OPTIONS: '{"module":"commonjs"}', ...extra },
      encoding: 'utf8',
      timeout: 120_000,
    },
  );
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

describe('T-663 sanity', () => {
  it('the message was read from the ticket and has the em dash (U+2014)', () => {
    expect(MESSAGE.startsWith('SENTRY_DSN set')).toBe(true);
    expect(MESSAGE.includes('—')).toBe(true);
    expect(MESSAGE.endsWith('see CLAUDE.md')).toBe(true);
  });

  it('the fixture is not in the shell the test runs in (so a pass is the guard, not the shell)', () => {
    expect(process.env.SENTRY_DSN === FIXTURE_DSN).toBe(false);
  });
});

describe.each(SETUP_FILES)('T-663 %s setup file', (name, file) => {
  it('fails with the exact message when SENTRY_DSN is set, and never prints the DSN', () => {
    const r = load(file, { SENTRY_DSN: FIXTURE_DSN });
    expect(r.code).not.toBe(0);
    expect(r.out.includes(MESSAGE)).toBe(true);
    expect(r.out.includes(FIXTURE_MARK)).toBe(false);
    expect(name.length).toBeGreaterThan(0);
  });

  it('an empty-string SENTRY_DSN counts as set', () => {
    const r = load(file, { SENTRY_DSN: '' });
    expect(r.code).not.toBe(0);
    expect(r.out.includes(MESSAGE)).toBe(true);
  });

  it('loads without throwing when neither variable is set', () => {
    const r = load(file, {});
    expect(r.code).toBe(0);
    expect(r.out.includes(MESSAGE)).toBe(false);
  });
});

describe('T-663 web: NEXT_PUBLIC_SENTRY_DSN', () => {
  const WEB = 'apps/web/jest.setup-env.ts';

  it('fails on NEXT_PUBLIC_SENTRY_DSN alone, with the message and without the DSN', () => {
    const r = load(WEB, { NEXT_PUBLIC_SENTRY_DSN: FIXTURE_DSN });
    expect(r.code).not.toBe(0);
    expect(r.out.includes(MESSAGE)).toBe(true);
    expect(r.out.includes(FIXTURE_MARK)).toBe(false);
  });

  it('an empty NEXT_PUBLIC_SENTRY_DSN counts as set', () => {
    const r = load(WEB, { NEXT_PUBLIC_SENTRY_DSN: '' });
    expect(r.code).not.toBe(0);
    expect(r.out.includes(MESSAGE)).toBe(true);
  });

  it('the server-side services do not look at NEXT_PUBLIC_SENTRY_DSN', () => {
    const r = load('apps/drafting/src/__tests__/setupEnv.ts', {
      NEXT_PUBLIC_SENTRY_DSN: FIXTURE_DSN,
    });
    expect(r.code).toBe(0);
  });
});

describe('T-663 static: the Sentry tests never read the real DSN with a value matcher', () => {
  it.each(['drafting', 'gateway'])(
    '%s sentry.test.ts has a boolean check, not a value matcher',
    (svc) => {
      const src = readFileSync(
        path.join(ROOT, 'apps', svc, 'src', '__tests__', 'sentry.test.ts'),
        'utf8',
      );
      // `expect(process.env.SENTRY_DSN).toBeUndefined()` (or any matcher on the bare value) would print it
      expect(/expect\(\s*process\.env\.SENTRY_DSN\s*\)/.test(src)).toBe(false);
      expect(src.includes('process.env.SENTRY_DSN === undefined')).toBe(true);
    },
  );

  it.each(['drafting', 'gateway'])('%s sentry.test.ts sets a fixture DSN itself', (svc) => {
    const src = readFileSync(
      path.join(ROOT, 'apps', svc, 'src', '__tests__', 'sentry.test.ts'),
      'utf8',
    );
    expect(src.includes(FIXTURE_DSN)).toBe(true);
  });
});
