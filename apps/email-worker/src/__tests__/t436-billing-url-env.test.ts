/**
 * T-436 (b/c) slice 4: BILLING_SERVICE_URL in the email-worker env schema. Optional (a worker
 * without it still boots and sends every other email; invoice jobs retry with NO_BILLING_URL),
 * blank means unset, a set-but-invalid value fails at boot with one line naming it and not its value.
 */
import { spawnSync } from 'child_process';
import path from 'path';

import { REQUIRED_BY_PROVIDER, validateEnv } from '../config/env';

const GOOD_SECRET = 'a-secret-that-is-long-enough-123'; // gitleaks:allow
const BASE = {
  REDIS_URL: 'redis://localhost:6379',
  INTERNAL_SECRET: GOOD_SECRET,
  AUTH_SERVICE_URL: 'http://localhost:4001',
  EMAIL_PROVIDER: 'dry-run',
};

describe('validateEnv: BILLING_SERVICE_URL', () => {
  it('absent is fine and parses to undefined', () => {
    const r = validateEnv(BASE as NodeJS.ProcessEnv);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.env.BILLING_SERVICE_URL).toBeUndefined();
  });

  it.each(['', '   ', '\t'])('blank (%j) means unset, not an error and not "missing"', (blank) => {
    const r = validateEnv({ ...BASE, BILLING_SERVICE_URL: blank } as NodeJS.ProcessEnv);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.env.BILLING_SERVICE_URL).toBeUndefined();
  });

  it.each(['http://localhost:4003', 'https://billing.internal.lawie.in/', 'http://10.0.0.5:4003'])(
    'a URL (%s) is accepted as given',
    (url) => {
      const r = validateEnv({ ...BASE, BILLING_SERVICE_URL: url } as NodeJS.ProcessEnv);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.env.BILLING_SERVICE_URL).toBe(url);
    },
  );

  it.each(['not a url secret-ish', 'billing', '/internal'])(
    'an invalid value (%s) fails, is named as invalid (not missing), and is not echoed',
    (bad) => {
      const r = validateEnv({ ...BASE, BILLING_SERVICE_URL: bad } as NodeJS.ProcessEnv);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.message.split('\n')).toHaveLength(1);
      expect(r.message).toMatch(/invalid setting\(s\):.*BILLING_SERVICE_URL/);
      expect(r.message).not.toMatch(/missing required setting\(s\):[^;]*BILLING_SERVICE_URL/);
      expect(r.message).not.toContain(bad);
    },
  );

  it('is not required in any provider mode', () => {
    for (const keys of Object.values(REQUIRED_BY_PROVIDER)) {
      expect(keys).not.toContain('BILLING_SERVICE_URL');
    }
    for (const mode of [
      { EMAIL_PROVIDER: 'ses', EMAIL_DRY_RUN: 'true' },
      {
        EMAIL_PROVIDER: 'ses',
        AWS_SES_ACCESS_KEY_ID: 'AKIAEXAMPLEKEYID',
        AWS_SES_SECRET_ACCESS_KEY: 'example-secret-access-key-value',
      },
      { EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'h.invalid', SMTP_USER: 'u', SMTP_PASS: 'p' },
    ]) {
      expect(validateEnv({ ...BASE, ...mode } as NodeJS.ProcessEnv).ok).toBe(true);
    }
  });
});

describe('module load: BILLING_SERVICE_URL', () => {
  const root = path.resolve(__dirname, '..', '..');
  const load = (env: Record<string, string>) =>
    spawnSync(
      process.execPath,
      [
        '-e',
        "require('ts-node').register({ transpileOnly: true }); const { env } = require('./src/config/env'); console.log('LOADED ' + String(env.BILLING_SERVICE_URL));",
      ],
      {
        cwd: root,
        env: { PATH: process.env.PATH ?? '', ...env },
        encoding: 'utf8',
        timeout: 60_000,
      },
    );

  it('unset boots', () => {
    const r = load(BASE);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('LOADED undefined');
  });

  it('blank boots as unset', () => {
    const r = load({ ...BASE, BILLING_SERVICE_URL: '' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('LOADED undefined');
  });

  it('a valid URL boots', () => {
    const r = load({ ...BASE, BILLING_SERVICE_URL: 'http://localhost:4003' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('LOADED http://localhost:4003');
  });

  it('an invalid value exits 1 at boot with one stderr line naming it, not its value', () => {
    const r = load({ ...BASE, BILLING_SERVICE_URL: 'nope-secret-value' });
    expect(r.status).toBe(1);
    const lines = r.stderr.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('BILLING_SERVICE_URL');
    expect(lines[0]).not.toContain('nope-secret-value');
    expect(r.stdout).not.toContain('LOADED');
  });
});
