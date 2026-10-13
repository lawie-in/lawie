/**
 * T-379 (Arjun): tests never touch a hosted Redis. REDIS_URL alone is not honoured by the shared
 * picker: with only REDIS_URL set to a fake remote host, it spawns a local redis-server (loopback),
 * never that host. REDIS_TEST_URL, when set, must be loopback and usable, else the picker throws.
 */
import { acquireRedis } from './helpers/t220-redis';

const FAKE = 'redis://default:pw@remote-hosted.invalid:14900';

describe('shared real-Redis picker ignores REDIS_URL', () => {
  const saved = process.env.REDIS_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = saved;
  });

  it('only REDIS_URL set (process.env): spawns local, never the remote host', async () => {
    process.env.REDIS_URL = FAKE;
    const r = await acquireRedis({});
    try {
      expect(r.source).toBe('spawned redis-server');
      expect(new URL(r.url).hostname).toBe('127.0.0.1');
      expect(r.url).not.toContain('remote-hosted');
    } finally {
      await r.stop();
    }
  });

  it('REDIS_URL passed in the env object is ignored too', async () => {
    const r = await acquireRedis({ REDIS_URL: FAKE } as never);
    try {
      expect(r.source).toBe('spawned redis-server');
      expect(r.url).not.toContain('remote-hosted');
    } finally {
      await r.stop();
    }
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
