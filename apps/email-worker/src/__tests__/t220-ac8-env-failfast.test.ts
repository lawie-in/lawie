/**
 * T-220 AC8: under EMAIL_PROVIDER=ses (and smtp) the worker fails fast with ONE
 * clear line naming the missing/invalid settings, never a value.
 */
import { spawnSync } from 'child_process';
import path from 'path';

import { REQUIRED_BY_PROVIDER, validateEnv } from '../config/env';

const GOOD_SECRET = 'a-secret-that-is-long-enough-123';
const SES_OK = {
  REDIS_URL: 'redis://localhost:6379',
  INTERNAL_SECRET: GOOD_SECRET,
  EMAIL_PROVIDER: 'ses',
  AWS_SES_ACCESS_KEY_ID: 'AKIAEXAMPLEKEYID',
  AWS_SES_SECRET_ACCESS_KEY: 'example-secret-access-key-value',
};

function fail(src: Record<string, string>): string {
  const r = validateEnv(src as NodeJS.ProcessEnv);
  if (r.ok) throw new Error('expected validation to fail');
  expect(r.message.split('\n')).toHaveLength(1);
  expect(r.message).toMatch(/^\[email-worker\] FATAL: cannot start/);
  return r.message;
}

describe('T-220 AC8 validateEnv', () => {
  it('ses with nothing set: names every required setting, one line', () => {
    const m = fail({ EMAIL_PROVIDER: 'ses' });
    for (const n of [
      'REDIS_URL',
      'INTERNAL_SECRET',
      'AWS_SES_ACCESS_KEY_ID',
      'AWS_SES_SECRET_ACCESS_KEY',
    ]) {
      expect(m).toContain(n);
    }
    expect(m).toContain('EMAIL_PROVIDER=ses');
  });

  it('ses with the default provider (EMAIL_PROVIDER unset) is treated as ses', () => {
    const m = fail({ REDIS_URL: 'redis://x:1', INTERNAL_SECRET: GOOD_SECRET });
    expect(m).toContain('AWS_SES_ACCESS_KEY_ID');
  });

  it('ses missing only AWS_SES_SECRET_ACCESS_KEY names only that one', () => {
    const rest: Record<string, string> = { ...SES_OK };
    delete rest.AWS_SES_SECRET_ACCESS_KEY;
    const m = fail(rest);
    expect(m).toContain('AWS_SES_SECRET_ACCESS_KEY');
    expect(m).not.toContain('AWS_SES_ACCESS_KEY_ID');
    expect(m).not.toContain('INTERNAL_SECRET');
    expect(m).not.toContain(rest.AWS_SES_ACCESS_KEY_ID);
    expect(m).not.toContain(GOOD_SECRET);
  });

  it('blank (empty and whitespace) values count as missing', () => {
    const m = fail({
      ...SES_OK,
      AWS_SES_ACCESS_KEY_ID: '',
      AWS_SES_SECRET_ACCESS_KEY: '   ',
      INTERNAL_SECRET: '',
    });
    expect(m).toMatch(/missing required setting\(s\):.*AWS_SES_ACCESS_KEY_ID/);
    expect(m).toContain('AWS_SES_SECRET_ACCESS_KEY');
    expect(m).toContain('INTERNAL_SECRET');
  });

  it('short INTERNAL_SECRET is invalid, named, and its value is not echoed', () => {
    const m = fail({ ...SES_OK, INTERNAL_SECRET: 'shortsecret' });
    expect(m).toContain('INTERNAL_SECRET');
    expect(m).toContain('at least 16');
    expect(m).not.toContain('shortsecret');
  });

  it('bad provider is named but the bad value is not echoed', () => {
    const m = fail({ ...SES_OK, EMAIL_PROVIDER: 'sendgrid-secret-xyz' });
    expect(m).toContain('EMAIL_PROVIDER');
    expect(m).not.toContain('sendgrid-secret-xyz');
  });

  it('smtp missing user and pass names both (and host when absent)', () => {
    const m = fail({
      REDIS_URL: 'redis://x:1',
      INTERNAL_SECRET: GOOD_SECRET,
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'smtp.example.com',
    });
    expect(m).toContain('SMTP_USER');
    expect(m).toContain('SMTP_PASS');
    expect(m).not.toContain('SMTP_HOST');
    expect(m).not.toContain('smtp.example.com');
  });

  it('never echoes any secret value across a mixed failure', () => {
    const m = fail({
      ...SES_OK,
      INTERNAL_SECRET: 'tiny',
      AWS_SES_SECRET_ACCESS_KEY: '',
      REDIS_URL: '',
    });
    for (const v of [SES_OK.AWS_SES_ACCESS_KEY_ID, 'tiny']) expect(m).not.toContain(v);
  });

  it('dry-run provider needs only REDIS_URL and INTERNAL_SECRET', () => {
    const r = validateEnv({
      REDIS_URL: 'redis://x:1',
      INTERNAL_SECRET: GOOD_SECRET,
      EMAIL_PROVIDER: 'dry-run',
    } as NodeJS.ProcessEnv);
    expect(r.ok).toBe(true);
  });

  it('ses + EMAIL_DRY_RUN=true is OK without AWS keys', () => {
    const r = validateEnv({
      REDIS_URL: 'redis://x:1',
      INTERNAL_SECRET: GOOD_SECRET,
      EMAIL_PROVIDER: 'ses',
      EMAIL_DRY_RUN: 'true',
    } as NodeJS.ProcessEnv);
    expect(r.ok).toBe(true);
  });

  it('dry-run still requires INTERNAL_SECRET', () => {
    const m = fail({ REDIS_URL: 'redis://x:1', EMAIL_PROVIDER: 'ses', EMAIL_DRY_RUN: 'true' });
    expect(m).toContain('INTERNAL_SECRET');
    expect(m).toContain('EMAIL_DRY_RUN=true');
  });

  it('fully configured ses is OK', () => {
    expect(validateEnv(SES_OK as NodeJS.ProcessEnv).ok).toBe(true);
  });

  it('REQUIRED_BY_PROVIDER lists exactly the documented keys', () => {
    expect([...REQUIRED_BY_PROVIDER.ses].sort()).toEqual([
      'AWS_SES_ACCESS_KEY_ID',
      'AWS_SES_SECRET_ACCESS_KEY',
    ]);
    expect([...REQUIRED_BY_PROVIDER.smtp].sort()).toEqual(['SMTP_HOST', 'SMTP_PASS', 'SMTP_USER']);
    expect(REQUIRED_BY_PROVIDER['dry-run']).toEqual([]);
  });
});

describe('T-220 AC8 module load', () => {
  const root = path.resolve(__dirname, '..', '..');
  const run = (env: Record<string, string>) =>
    spawnSync(
      process.execPath,
      [
        '-e',
        "require('ts-node').register({ transpileOnly: true }); require('./src/config/env'); console.log('LOADED');",
      ],
      {
        cwd: root,
        env: { PATH: process.env.PATH ?? '', ...env },
        encoding: 'utf8',
        timeout: 60_000,
      },
    );

  it('ses with nothing set: exit 1, exactly one stderr line, nothing on stdout, no values', () => {
    const r = run({ EMAIL_PROVIDER: 'ses', AWS_SES_ACCESS_KEY_ID: 'AKIA-LEAKCHECK-ID' });
    expect(r.status).toBe(1);
    const lines = r.stderr.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('FATAL');
    expect(lines[0]).toContain('AWS_SES_SECRET_ACCESS_KEY');
    expect(lines[0]).toContain('INTERNAL_SECRET');
    expect(lines[0]).not.toContain('AKIA-LEAKCHECK-ID');
    expect(r.stdout).not.toContain('LOADED');
  });

  it('valid dry-run env loads and exits 0', () => {
    const r = run({
      EMAIL_PROVIDER: 'dry-run',
      REDIS_URL: 'redis://localhost:6379',
      INTERNAL_SECRET: GOOD_SECRET,
    });
    expect(r.stderr).toBe('');
    expect(r.stdout).toContain('LOADED');
    expect(r.status).toBe(0);
  });
});
