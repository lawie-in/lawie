/**
 * T-379 (Arjun): tests never touch a hosted Redis. REDIS_URL alone is not honoured by the auth
 * real-Redis picker: with only REDIS_URL set to a fake remote host it spawns a local
 * redis-server on loopback, never that host. A non-loopback REDIS_TEST_URL throws.
 * Importing t223-real-redis-env runs the picker once for this file (a private redis-server when
 * REDIS_TEST_URL is unset); afterAll stops it.
 */
import { pickRedis, REAL_REDIS_URL, stopPrivateRedis } from './t223-real-redis-env';

const FAKE = 'redis://default:pw@remote-hosted.invalid:14900';

describe('auth real-Redis picker ignores REDIS_URL', () => {
  afterAll(() => stopPrivateRedis());

  it('only REDIS_URL set: spawns local, never the remote host', () => {
    const saved = process.env.REDIS_URL;
    process.env.REDIS_URL = FAKE;
    let child;
    try {
      const r = pickRedis({});
      child = r.child;
      expect(r.source).toBe('spawned redis-server');
      expect(new URL(r.url).hostname).toBe('127.0.0.1');
      expect(r.url).not.toContain('remote-hosted');
    } finally {
      child?.kill('SIGTERM');
      process.env.REDIS_URL = saved;
    }
  });

  it('REDIS_URL inside the env object is ignored too', () => {
    const r = pickRedis({ REDIS_URL: FAKE } as never);
    try {
      expect(r.source).toBe('spawned redis-server');
      expect(r.url).not.toContain('remote-hosted');
    } finally {
      r.child?.kill('SIGTERM');
    }
  });

  it('a non-loopback REDIS_TEST_URL throws', () => {
    expect(() => pickRedis({ REDIS_TEST_URL: FAKE })).toThrow(/REDIS_TEST_URL/);
  });

  it('the module-level choice (what the real-Redis test uses) is loopback, not the hosted URL', () => {
    expect(new URL(REAL_REDIS_URL).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  });
});
