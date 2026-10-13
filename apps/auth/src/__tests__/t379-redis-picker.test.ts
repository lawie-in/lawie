/**
 * T-379 (Arjun): tests never touch a hosted Redis. REDIS_URL alone is not honoured by the auth
 * real-Redis picker: with only REDIS_URL set to a fake remote host it spawns a local
 * redis-server on loopback, never that host. A non-loopback REDIS_TEST_URL throws.
 * Importing t223-real-redis-env runs the picker once for this file (a private redis-server when
 * REDIS_TEST_URL is unset); afterAll stops it.
 */
import { hasRedisServer, pickRedis, REAL_REDIS_URL, stopPrivateRedis } from './t223-real-redis-env';

const FAKE = 'redis://default:pw@remote-hosted.invalid:14900';

describe('auth real-Redis picker ignores REDIS_URL', () => {
  afterAll(() => stopPrivateRedis());

  /**
   * Local dev has redis-server (picker spawns on loopback); CI runners have none (picker must throw
   * "REDIS_TEST_URL is unset"). Either way the fake remote host is never used or returned.
   */
  function expectLocalOrRefusal(env: { REDIS_TEST_URL?: string }): void {
    if (hasRedisServer()) {
      const r = pickRedis(env);
      try {
        expect(r.source).toBe('spawned redis-server');
        expect(new URL(r.url).hostname).toBe('127.0.0.1');
        expect(r.url).not.toContain('remote-hosted');
      } finally {
        r.child?.kill('SIGTERM');
      }
    } else {
      let message = '';
      try {
        pickRedis(env);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toMatch(/REDIS_TEST_URL is unset/);
      expect(message).not.toContain('remote-hosted');
    }
  }

  it('only REDIS_URL set: spawns local or refuses, never the remote host', () => {
    const saved = process.env.REDIS_URL;
    process.env.REDIS_URL = FAKE;
    try {
      expectLocalOrRefusal({});
    } finally {
      if (saved === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = saved;
    }
  });

  it('REDIS_URL inside the env object is ignored too', () => {
    expectLocalOrRefusal({ REDIS_URL: FAKE } as never);
  });

  it('a non-loopback REDIS_TEST_URL throws', () => {
    expect(() => pickRedis({ REDIS_TEST_URL: FAKE })).toThrow(/REDIS_TEST_URL/);
  });

  it('the module-level choice (what the real-Redis test uses) is loopback, not the hosted URL', () => {
    expect(new URL(REAL_REDIS_URL).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  });
});
