/**
 * T-379 (Arjun): tests never touch a hosted Redis. REDIS_URL alone is not honoured by the shared
 * picker: with only REDIS_URL set to a fake remote host, it spawns a local redis-server (loopback),
 * never that host. REDIS_TEST_URL, when set, must be loopback and usable, else the picker throws.
 */
import { spawnSync } from 'child_process';
import { acquireRedis } from './helpers/t220-redis';

const hasRedisServer = spawnSync('redis-server', ['--version'], { stdio: 'ignore' }).status === 0;
const FAKE = 'redis://default:pw@remote-hosted.invalid:14900';

describe('shared real-Redis picker ignores REDIS_URL', () => {
  const saved = process.env.REDIS_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = saved;
  });

  /**
   * Local dev has redis-server (picker spawns a loopback one); CI runners have none (picker must
   * throw "REDIS_TEST_URL is unset"). Either way the fake remote host is never used or returned.
   */
  async function expectLocalOrRefusal(env: { REDIS_TEST_URL?: string }): Promise<void> {
    if (hasRedisServer) {
      const r = await acquireRedis(env);
      try {
        expect(r.source).toBe('spawned redis-server');
        expect(new URL(r.url).hostname).toBe('127.0.0.1');
        expect(JSON.stringify(r)).not.toContain('remote-hosted');
      } finally {
        await r.stop();
      }
    } else {
      const err = await acquireRedis(env).then(
        () => undefined,
        (e: Error) => e,
      );
      expect(err).toBeInstanceOf(Error);
      expect(err?.message).toMatch(/REDIS_TEST_URL is unset/);
      expect(err?.message).not.toContain('remote-hosted');
    }
  }

  it('only REDIS_URL set (process.env): spawns local or refuses, never the remote host', async () => {
    process.env.REDIS_URL = FAKE;
    await expectLocalOrRefusal({});
  });

  it('REDIS_URL passed in the env object is ignored too', async () => {
    await expectLocalOrRefusal({ REDIS_URL: FAKE } as never);
  });

  it('a non-loopback REDIS_TEST_URL is refused (throws), not used', async () => {
    await expect(acquireRedis({ REDIS_TEST_URL: FAKE })).rejects.toThrow(/REDIS_TEST_URL/);
  });

  it('an unreachable loopback REDIS_TEST_URL throws instead of falling back', async () => {
    await expect(acquireRedis({ REDIS_TEST_URL: 'redis://127.0.0.1:1' })).rejects.toThrow(
      /REDIS_TEST_URL/,
    );
  });
});
