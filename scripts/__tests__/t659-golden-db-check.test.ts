import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  EXIT,
  SERVER_SELECTION_TIMEOUT_MS,
  checkReachable,
  errorClassName,
  main,
  type ConnectFn,
  type DbHandle,
} from '../ci/golden-db-reachable';

/**
 * T-659: the golden set checks its fixture DB before any model call. Unreachable DB on a push
 * run: green with a notice. On schedule / workflow_dispatch: red with an error annotation.
 * No real DB is contacted; the workflow's shell is run against a fake `yarn`.
 * Does not read handoff/. js-yaml is a transitive dependency (see t688-test-tiers).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require('js-yaml') as { load: (s: string) => any };

const ROOT = path.resolve(__dirname, '..', '..');
// Built at runtime: no secret-looking literal in the source (gitleaks).
const SECRET_URI = [
  'mongodb+srv',
  ':',
  '//',
  'sekret-user',
  ':',
  'hunter2' + 'pass',
  '@cluster0.secret-host.example.net/golden',
].join('');
const FAKE_PAT = 'gh' + 'p_' + 'x'.repeat(36);
const SECRET_HOST = 'cluster0.secret-host.example.net';

// ---------------------------------------------------------------- helper

function handle(over: Partial<DbHandle> = {}): { h: DbHandle; close: jest.Mock; ping: jest.Mock } {
  const close = jest.fn().mockResolvedValue(undefined);
  const ping = jest.fn().mockResolvedValue({ ok: 1 });
  return { h: { ping, close, ...over }, close, ping };
}

async function run(env: NodeJS.ProcessEnv, connect?: ConnectFn) {
  const lines: string[] = [];
  const code = await main(env, connect, (l) => lines.push(l));
  return { code, lines };
}

describe('T-659 golden-db-reachable helper', () => {
  it('reachable: exit 0 and exactly one fixed line', async () => {
    const { h, close } = handle();
    const connect = jest.fn().mockResolvedValue(h);
    const { code, lines } = await run({ GOLDEN_SET_MONGODB_URI: SECRET_URI }, connect);
    expect(code).toBe(0);
    expect(lines).toEqual(['golden-db: reachable']);
    expect(connect).toHaveBeenCalledWith(SECRET_URI, SERVER_SELECTION_TIMEOUT_MS);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('connect throws: exit 3, class name only, no message', async () => {
    class MongoServerSelectionError extends Error {}
    const connect = jest
      .fn()
      .mockRejectedValue(
        new MongoServerSelectionError(
          `getaddrinfo ${SECRET_HOST} ${SECRET_URI} ${'sk-' + 'ant-api03-LEAKME'}`,
        ),
      );
    const { code, lines } = await run({ GOLDEN_SET_MONGODB_URI: SECRET_URI }, connect);
    expect(code).toBe(3);
    expect(lines).toEqual(['golden-db: unreachable (MongoServerSelectionError)']);
  });

  it('ping throws: exit 3 and the handle is still closed', async () => {
    class MongoNetworkError extends Error {}
    const { h, close } = handle({ ping: jest.fn().mockRejectedValue(new MongoNetworkError('x')) });
    const { code, lines } = await run({ GOLDEN_SET_MONGODB_URI: SECRET_URI }, async () => h);
    expect(code).toBe(3);
    expect(lines).toEqual(['golden-db: unreachable (MongoNetworkError)']);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('a close() that rejects does not change the result', async () => {
    const { h } = handle({ close: jest.fn().mockRejectedValue(new Error('boom')) });
    await expect(checkReachable(SECRET_URI, async () => h)).resolves.toEqual({ reachable: true });
  });

  it.each([undefined, '', '   ', '\n\t'])(
    'missing/blank URI (%j): exit 2, connect never called',
    async (uri) => {
      const connect = jest.fn();
      const env: NodeJS.ProcessEnv = uri === undefined ? {} : { GOLDEN_SET_MONGODB_URI: uri };
      const { code, lines } = await run(env, connect);
      expect(code).toBe(2);
      expect(lines).toEqual(['golden-db: no URI']);
      expect(connect).not.toHaveBeenCalled();
    },
  );

  it('mongoose not loadable: exit 4 (error), not 3 (unreachable)', async () => {
    let result: { code: number; lines: string[] } | undefined;
    await jest.isolateModulesAsync(async () => {
      jest.doMock('path', () => {
        const real = jest.requireActual('path');
        return { ...real, join: () => '/nonexistent-t659/none' };
      });
      const mod = await import('../ci/golden-db-reachable');
      const lines: string[] = [];
      const code = await mod.main({ GOLDEN_SET_MONGODB_URI: SECRET_URI }, undefined, (l) =>
        lines.push(l),
      );
      result = { code, lines };
    });
    jest.dontMock('path');
    expect(result?.code).toBe(4);
    expect(result?.lines).toHaveLength(1);
    expect(result?.lines[0]).toMatch(/^golden-db: error \([A-Za-z_][A-Za-z0-9_]*\)$/);
    expect(result?.lines[0]).not.toContain('nonexistent');
  });

  it('exit codes are the documented ones', () => {
    expect(EXIT).toEqual({ reachable: 0, noUri: 2, unreachable: 3, error: 4 });
  });

  it('never prints the URI, host, message or an injected secret', async () => {
    const evil = new Error(`${SECRET_URI} ${SECRET_HOST} ${FAKE_PAT} password=hunter2pass`);
    evil.stack = `Error: ${SECRET_URI}\n    at /home/runner/secret/path.js:1:1`;
    const out: string[] = [];
    for (const connect of [
      jest.fn().mockRejectedValue(evil),
      jest.fn().mockResolvedValue(handle({ ping: jest.fn().mockRejectedValue(evil) }).h),
      jest.fn().mockResolvedValue(handle().h),
    ]) {
      out.push(...(await run({ GOLDEN_SET_MONGODB_URI: SECRET_URI }, connect)).lines);
    }
    const all = out.join('\n');
    for (const bad of [
      'sekret',
      'hunter2',
      SECRET_HOST,
      'ghp_',
      'mongodb',
      '/home/runner',
      'password',
    ]) {
      expect(all).not.toContain(bad);
    }
  });

  describe('errorClassName sanitizing', () => {
    it.each([
      ['newline / injection in name', Object.assign(new Error('m'), { name: 'X\n::error::pwn' })],
      ['spaces and URI in name', Object.assign(new Error('m'), { name: SECRET_URI })],
      ['empty name', Object.assign(new Error('m'), { name: '' })],
      ['very long name', Object.assign(new Error('m'), { name: 'A'.repeat(500) })],
      ['non-string name', Object.assign(new Error('m'), { name: 42 })],
    ])('%s', (_label, err) => {
      const name = errorClassName(err);
      expect(name).toMatch(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/);
      expect(name).not.toContain(SECRET_HOST);
    });

    it.each([
      ['a string', 'oops'],
      ['null', null],
      ['undefined', undefined],
      ['plain object', {}],
      ['number', 7],
    ])('non-error throwable (%s) -> UnknownError', (_l, v) => {
      expect(errorClassName(v)).toBe('UnknownError');
    });

    it('uses the constructor name for a real subclass', () => {
      class MongoParseError extends Error {}
      expect(errorClassName(new MongoParseError('x'))).toBe('MongoParseError');
    });
  });
});

// ---------------------------------------------------------------- workflow

const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'golden-set.yml');
const wf = yaml.load(fs.readFileSync(WORKFLOW, 'utf8'));
const steps: any[] = wf.jobs['golden-set'].steps;
const idx = (pred: (s: any) => boolean) => steps.findIndex(pred);
const dbIdx = idx((s) => s.id === 'dbcheck');
const dryIdx = idx((s) => typeof s.run === 'string' && s.run.includes('golden:set --dry-run'));
const realIdx = idx((s) => typeof s.run === 'string' && s.run.includes('golden:set --real'));
const uploadIdx = idx(
  (s) => typeof s.uses === 'string' && s.uses.startsWith('actions/upload-artifact'),
);

describe('T-659 golden-set.yml', () => {
  it('has the dbcheck step, after the dry run and before the real step', () => {
    expect(dbIdx).toBeGreaterThan(-1);
    expect(dryIdx).toBeGreaterThan(-1);
    expect(realIdx).toBeGreaterThan(-1);
    expect(dryIdx).toBeLessThan(dbIdx);
    expect(dbIdx).toBeLessThan(realIdx);
  });

  it('dbcheck runs only when the gate says run and secrets are set', () => {
    const cond: string = steps[dbIdx].if;
    expect(cond).toContain("steps.gate.outputs.run == 'true'");
    expect(cond).toContain("steps.gate.outputs.secrets == 'true'");
  });

  it('no model call (golden:set, anthropic) before the dbcheck step', () => {
    for (const s of steps.slice(0, dbIdx)) {
      expect(String(s.run ?? '')).not.toMatch(/--real|--calibrate/);
      // The gate step only tests whether the key is set (`!= ''`); it never passes the value on.
      for (const v of Object.values(s.env ?? {})) {
        expect(String(v)).not.toMatch(/secrets\.GOLDEN_SET_ANTHROPIC_API_KEY\s*\}\}/);
      }
    }
    expect(JSON.stringify(steps[dbIdx])).not.toMatch(/ANTHROPIC/i);
  });

  it('GOLDEN_SET_MONGODB_URI is in the env of the dbcheck and real steps only', () => {
    const withUri = steps
      .map((s, i) => [s, i] as const)
      .filter(([s]) => s.env && 'GOLDEN_SET_MONGODB_URI' in s.env)
      .map(([, i]) => i);
    expect(withUri.sort()).toEqual([dbIdx, realIdx].sort());
    expect(steps[dbIdx].env.GOLDEN_SET_MONGODB_URI).toBe('${{ secrets.GOLDEN_SET_MONGODB_URI }}');
    // Not at workflow or job level either.
    expect(JSON.stringify(wf.env ?? {})).not.toContain('GOLDEN_SET_');
    expect(JSON.stringify(wf.jobs['golden-set'].env ?? {})).not.toContain('GOLDEN_SET_');
    // Nor interpolated into any run script / with block.
    for (const [i, s] of steps.entries()) {
      if (i === dbIdx || i === realIdx) continue;
      expect(JSON.stringify([s.run, s.with])).not.toContain('secrets.GOLDEN_SET_MONGODB_URI');
    }
  });

  it('GOLDEN_SET_ANTHROPIC_API_KEY is in the real step env only', () => {
    const withKey = steps
      .map((s, i) => [s, i] as const)
      .filter(([s]) => s.env && 'GOLDEN_SET_ANTHROPIC_API_KEY' in s.env)
      .map(([, i]) => i);
    expect(withKey).toEqual([realIdx]);
  });

  it("the real step and the artifact upload require reachable == 'true'", () => {
    expect(steps[realIdx].if).toContain("steps.dbcheck.outputs.reachable == 'true'");
    expect(steps[realIdx].if).toContain("steps.gate.outputs.secrets == 'true'");
    expect(uploadIdx).toBeGreaterThan(-1);
    expect(steps[uploadIdx].if).toContain("steps.dbcheck.outputs.reachable == 'true'");
  });

  it('EVENT reaches the dbcheck step through env, not inline interpolation', () => {
    expect(steps[dbIdx].env.EVENT).toBe('${{ github.event_name }}');
    expect(steps[dbIdx].run).not.toContain('${{');
  });
});

// ---------------------------------------------------------------- both run types

const bashOk = spawnSync('bash', ['-c', 'true']).status === 0;
const describeBash = bashOk ? describe : describe.skip;

describeBash('T-659 dbcheck step shell, by run type', () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 't659-'));
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.writeFileSync(path.join(dir, 'step.sh'), steps[dbIdx].run);
    // Fake yarn: exits with FAKE_YARN_EXIT. The real helper is never started.
    fs.writeFileSync(
      path.join(dir, 'bin', 'yarn'),
      '#!/bin/sh\necho "fake-yarn $*" >&2\nexit "$FAKE_YARN_EXIT"\n',
      {
        mode: 0o755,
      },
    );
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  function exec(event: string, helperExit: number) {
    const out = path.join(dir, `out-${event}-${helperExit}`);
    fs.writeFileSync(out, '');
    const r = spawnSync('bash', ['-e', path.join(dir, 'step.sh')], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        PATH: `${path.join(dir, 'bin')}:/usr/bin:/bin`,
        EVENT: event,
        GITHUB_OUTPUT: out,
        FAKE_YARN_EXIT: String(helperExit),
      },
    });
    return { status: r.status, stdout: r.stdout, output: fs.readFileSync(out, 'utf8') };
  }

  const EVENTS = ['push', 'schedule', 'workflow_dispatch'];
  const strict = ['schedule', 'workflow_dispatch'];

  it.each(EVENTS)('%s + reachable (exit 0): green, reachable=true, no annotation', (ev) => {
    const r = exec(ev, 0);
    expect(r.status).toBe(0);
    expect(r.output).toBe('reachable=true\n');
    expect(r.stdout).not.toMatch(/::(error|notice)::/);
  });

  it('push + unreachable (exit 3): green with the skip notice, reachable=false', () => {
    const r = exec('push', 3);
    expect(r.status).toBe(0);
    expect(r.output).toBe('reachable=false\n');
    expect(r.stdout).toContain('::notice::golden set skipped: fixture DB unreachable');
    expect(r.stdout).not.toContain('::error::');
  });

  it.each(strict)('%s + unreachable (exit 3): job fails with an error annotation', (ev) => {
    const r = exec(ev, 3);
    expect(r.status).toBe(1);
    expect(r.output).toBe('reachable=false\n');
    expect(r.stdout).toContain(`::error::golden set failed: fixture DB unreachable (${ev})`);
    expect(r.stdout).not.toContain('skipped');
  });

  describe.each([2, 4, 1, 127])('helper exit %i (no URI / check broke / other)', (code) => {
    it.each(EVENTS)('%s: fails, never reachable=true, never the skip notice', (ev) => {
      const r = exec(ev, code);
      expect(r.status).toBe(1);
      expect(r.output).not.toContain('reachable=true');
      expect(r.stdout).toContain(`::error::golden set: the fixture DB check failed (exit ${code})`);
      expect(r.stdout).not.toContain('::notice::');
    });
  });
});
