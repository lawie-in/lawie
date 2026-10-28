/**
 * T-649: deploy-local.sh installs puppeteer's Chrome and runs a PDF smoke in the health gate.
 *
 * Everything is mocked: the script is copied into a temp repo and run with stubbed
 * id/curl/git/yarn/pm2/npx/node first on PATH. No real deploy, no real Chrome, no network.
 * The smoke JS is also extracted and run with real node against a fake puppeteer module.
 * CI picks this file up through `yarn test:scripts` (jest over scripts/__tests__), the
 * command .github/workflows/scripts-tests.yml runs.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REPO = path.resolve(__dirname, '../..');
const SCRIPT = path.join(REPO, 'scripts', 'deploy-local.sh');
const text = fs.readFileSync(SCRIPT, 'utf8');
const PROD = text.match(/^PROD_INSTANCE_ID="(i-[0-9a-f]+)"$/m)?.[1] ?? 'missing-prod';
const HTML_TEXT = 'Lawie PDF smoke test';
const PDF_MARKER = 'T649PDFBYTESMARKER';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 't649-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const stub = (dir: string, name: string, body: string) => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, `#!/bin/bash\n${body}\n`);
  fs.chmodSync(f, 0o755);
};

type Run = {
  r: ReturnType<typeof spawnSync>;
  out: string;
  err: string;
  calls: string[];
  smokeDir: string;
  smokeTmpdirEnv: string;
  smokeDirExistedDuringRun: string;
};

let n = 0;
const runDeploy = (o: { npxExit?: number; npxAbsent?: boolean; smokeExit?: number }): Run => {
  const base = path.join(root, `c${n++}`);
  const bin = path.join(base, 'bin');
  const repo = path.join(base, 'repo');
  const tmp = path.join(base, 't');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(tmp, { recursive: true });
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'apps/web/public'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'apps/web/.next/standalone/apps/web/public'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'apps/web/.next/static'), { recursive: true });
  const log = path.join(base, 'calls.log');
  const smokeRec = path.join(base, 'smoke.rec');
  fs.writeFileSync(log, '');
  fs.copyFileSync(SCRIPT, path.join(repo, 'scripts', 'deploy-local.sh'));
  const envFile = path.join(base, 'fake.env');
  fs.writeFileSync(envFile, 'T649_FAKE=1\n');
  fs.writeFileSync(path.join(repo, 'ecosystem.config.js'), `const ENV_FILE = '${envFile}';\n`);

  stub(bin, 'id', 'echo 1000');
  stub(
    bin,
    'curl',
    [
      'case "$*" in',
      '  *"-X PUT"*) printf faketoken ;;',
      `  *instance-id*) printf ${PROD} ;;`,
      '  *) printf 200 ;;',
      'esac',
    ].join('\n'),
  );
  stub(
    bin,
    'git',
    [
      'echo "git $*" >> "$STUB_LOG"',
      'case "$1" in rev-parse) echo 0123456789abcdef0123456789abcdef01234567 ;; esac',
    ].join('\n'),
  );
  for (const t of ['yarn', 'pm2']) stub(bin, t, `echo "${t} $*" >> "$STUB_LOG"`);
  stub(bin, 'sleep', 'exit 0');
  stub(
    bin,
    'npx',
    o.npxAbsent
      ? // Local puppeteer missing: with --no-install npx refuses instead of fetching.
        [
          'echo "npx $*" >> "$STUB_LOG"',
          'case "$*" in *--no-install*) echo "npm error npx canceled: puppeteer not installed" >&2; exit 1 ;; esac',
          'echo FETCHED >> "$STUB_LOG"',
          'exit 0',
        ].join('\n')
      : `echo "npx $*" >> "$STUB_LOG"\necho /fake/chrome/path/T649NPXSTDOUT\nexit ${o.npxExit ?? 0}`,
  );
  stub(
    bin,
    'node',
    [
      'case "$*" in *--env-file*) echo "node env-loader" >> "$STUB_LOG"; exit 0 ;; esac',
      'echo "node smoke" >> "$STUB_LOG"',
      'echo "$3" > "$SMOKE_REC"',
      'echo "$TMPDIR" >> "$SMOKE_REC"',
      'if [ -d "$3" ]; then echo yes >> "$SMOKE_REC"; else echo no >> "$SMOKE_REC"; fi',
      `exit ${o.smokeExit ?? 0}`,
    ].join('\n'),
  );

  const r = spawnSync('/bin/bash', [path.join(repo, 'scripts', 'deploy-local.sh'), 'main'], {
    env: { PATH: `${bin}:/usr/bin:/bin`, STUB_LOG: log, SMOKE_REC: smokeRec, TMPDIR: tmp },
    encoding: 'utf8',
    timeout: 30000,
  });
  const rec = fs.existsSync(smokeRec) ? fs.readFileSync(smokeRec, 'utf8').split('\n') : [];
  return {
    r,
    out: String(r.stdout),
    err: String(r.stderr),
    calls: fs.readFileSync(log, 'utf8').split('\n').filter(Boolean),
    smokeDir: rec[0] ?? '',
    smokeTmpdirEnv: rec[1] ?? '',
    smokeDirExistedDuringRun: rec[2] ?? '',
  };
};

describe('T-649 AC1: chrome install step', () => {
  it('runs `npx --no-install puppeteer browsers install chrome` after yarn install, before the builds', () => {
    const { r, calls } = runDeploy({});
    expect(r.status).toBe(0);
    const iInstall = calls.findIndex((c) => c.startsWith('yarn install'));
    const iChrome = calls.indexOf('npx --no-install puppeteer browsers install chrome');
    const iBuild = calls.indexOf('yarn workspace @lawie/shared build');
    expect(iInstall).toBeGreaterThanOrEqual(0);
    expect(iChrome).toBeGreaterThan(iInstall);
    expect(iBuild).toBeGreaterThan(iChrome);
    expect(calls.filter((c) => c.startsWith('npx '))).toHaveLength(1);
  });

  it('does not print the install path (stdout dropped)', () => {
    const { out, err } = runDeploy({});
    expect(out + err).not.toContain('T649NPXSTDOUT');
  });

  it('a failing install fails the deploy with exit 1 and stops before build, reload and smoke', () => {
    const { r, err, calls } = runDeploy({ npxExit: 1 });
    expect(r.status).toBe(1);
    expect(err).toContain('npx --no-install puppeteer browsers install chrome failed');
    expect(calls.some((c) => c.startsWith('yarn workspace'))).toBe(false);
    expect(calls.some((c) => c.startsWith('pm2'))).toBe(false);
    expect(calls).not.toContain('node smoke');
  });

  it('local puppeteer absent: npx --no-install fails, deploy exits 1 before the builds, nothing fetched', () => {
    const { r, err, calls } = runDeploy({ npxAbsent: true });
    expect(r.status).toBe(1);
    expect(err).toContain('npx --no-install puppeteer browsers install chrome failed');
    expect(calls).toContain('npx --no-install puppeteer browsers install chrome');
    expect(calls).not.toContain('FETCHED');
    expect(calls.some((c) => c.startsWith('yarn workspace'))).toBe(false);
    expect(calls.some((c) => c.startsWith('pm2'))).toBe(false);
    expect(calls).not.toContain('node smoke');
  });

  it('source: the npx call carries --no-install, no bare npx puppeteer call, no /home/ubuntu literal', () => {
    const callLines = text.split('\n').filter((l) => /^\s*if ! npx /.test(l));
    expect(callLines).toHaveLength(1);
    expect(callLines[0]).toContain('npx --no-install puppeteer browsers install chrome >');
    // Every executable npx use (not comments, not echoed messages) has --no-install.
    const npxCalls = text
      .split('\n')
      .filter((l) => /\bnpx\b/.test(l) && !/^\s*#/.test(l) && !/^\s*echo /.test(l));
    expect(npxCalls).toHaveLength(1);
    expect(text).not.toMatch(/npx (?!--no-install)\S*puppeteer/);
    expect(text).not.toMatch(/\/home\/ubuntu/);
    expect(text.indexOf('yarn install')).toBeLessThan(text.indexOf('npx --no-install puppeteer'));
  });
});

describe('T-649 AC2/AC3: PDF smoke in the health gate (mocked node)', () => {
  it('exit 0 -> deploy passes, smoke runs after the health gate and before "deploy complete"', () => {
    const { r, out } = runDeploy({ smokeExit: 0 });
    expect(r.status).toBe(0);
    expect(out).toContain('ok   pdf smoke -> %PDF');
    const iHealthy = out.indexOf('all six services healthy.');
    const iSmoke = out.indexOf('ok   pdf smoke');
    const iDone = out.indexOf('deploy complete');
    expect(iHealthy).toBeGreaterThan(0);
    expect(iSmoke).toBeGreaterThan(iHealthy);
    expect(iDone).toBeGreaterThan(iSmoke);
  });

  it.each([
    ['not a PDF / error (exit 1)', 1],
    ['timeout (exit 2)', 2],
  ])('%s -> deploy fails with exit 1 and no "deploy complete"', (_l, code) => {
    const { r, out, err } = runDeploy({ smokeExit: code });
    expect(r.status).toBe(1);
    expect(err).toContain('PDF smoke failed');
    expect(out).not.toContain('deploy complete');
    expect(out).not.toContain('ok   pdf smoke');
  });

  it.each([
    ['pass', 0],
    ['fail', 1],
    ['timeout', 2],
  ])(
    'temp dir is a real dir during the run, set as TMPDIR, and removed afterwards (%s)',
    (_l, code) => {
      const { smokeDir, smokeTmpdirEnv, smokeDirExistedDuringRun } = runDeploy({ smokeExit: code });
      expect(smokeDir).toMatch(/\S/);
      expect(smokeDir.startsWith(root)).toBe(true); // inside the temp base, nowhere else
      expect(smokeTmpdirEnv).toBe(smokeDir);
      expect(smokeDirExistedDuringRun).toBe('yes');
      expect(fs.existsSync(smokeDir)).toBe(false);
    },
  );

  it('smoke stdout/stderr contain no HTML text', () => {
    const { out, err } = runDeploy({ smokeExit: 1 });
    expect(out + err).not.toContain(HTML_TEXT);
  });
});

describe('T-649 AC2/AC3: extracted smoke JS against a fake puppeteer', () => {
  const js = /^PDF_SMOKE_JS='\n([\s\S]*?)\n'$/m.exec(text)?.[1] ?? '';

  const runSmoke = (mode: 'pdf' | 'other' | 'throw') => {
    const base = path.join(root, `s${n++}`);
    const ws = path.join(base, 'ws');
    const dir = path.join(base, 'd');
    const pkg = path.join(ws, 'node_modules', 'puppeteer');
    fs.mkdirSync(pkg, { recursive: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(pkg, 'package.json'), '{"name":"puppeteer","main":"index.js"}');
    const rec = path.join(base, 'rec.json');
    fs.writeFileSync(
      path.join(pkg, 'index.js'),
      `
const fs = require("fs");
const rec = ${JSON.stringify(rec)};
const mode = ${JSON.stringify(mode)};
exports.launch = async (opts) => {
  fs.writeFileSync(rec, JSON.stringify({ opts, html: null }));
  if (mode === "throw") throw new Error("Failed to launch " + "x".repeat(500) + "\\nsecond line");
  return {
    newPage: async () => ({
      setContent: async (html) => {
        fs.writeFileSync(rec, JSON.stringify({ opts, html }));
      },
      pdf: async (o) => {
        if (o && o.path) throw new Error("pdf must not be given a path");
        return Buffer.from(mode === "pdf" ? "%PDF-1.4 ${PDF_MARKER}" : "NOTAPDF ${PDF_MARKER}");
      },
    }),
    close: async () => {},
  };
};
`,
    );
    const r = spawnSync('node', ['-e', js, dir, ws], {
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
      encoding: 'utf8',
      timeout: 30000,
    });
    const recorded = fs.existsSync(rec) ? JSON.parse(fs.readFileSync(rec, 'utf8')) : null;
    return { r, recorded, dir };
  };

  it('extraction found the script', () => {
    expect(js).toContain('puppeteer');
    expect(js).not.toContain("'");
  });

  it('%PDF bytes -> exit 0; page rendered fictional inline HTML, launch flags and profile dir as expected', () => {
    const { r, recorded, dir } = runSmoke('pdf');
    expect(r.status).toBe(0);
    expect(recorded.html).toContain(HTML_TEXT);
    expect(recorded.opts.headless).toBe(true);
    expect(recorded.opts.args).toEqual(
      expect.arrayContaining([
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ]),
    );
    expect(recorded.opts.userDataDir.startsWith(dir)).toBe(true);
  });

  it('other bytes -> exit 1', () => {
    const { r, recorded } = runSmoke('other');
    expect(r.status).toBe(1);
    expect(recorded.html).toContain(HTML_TEXT);
  });

  it('launch throws -> exit 1, one short stderr line', () => {
    const { r } = runSmoke('throw');
    expect(r.status).toBe(1);
    const lines = String(r.stderr).split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0].length).toBeLessThanOrEqual(220);
    expect(lines[0]).not.toContain('second line');
  });

  it.each(['pdf', 'other', 'throw'] as const)(
    'never prints the HTML text or the PDF bytes (%s)',
    (mode) => {
      const { r } = runSmoke(mode);
      const all = String(r.stdout) + String(r.stderr);
      expect(all).not.toContain(HTML_TEXT);
      expect(all).not.toContain(PDF_MARKER);
      expect(all).not.toContain('NOTAPDF');
    },
  );
});
