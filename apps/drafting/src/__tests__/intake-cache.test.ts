/**
 * T-105 — the short-lived cache for intake model calls. Runs on the Redis
 * mock; no database and no model.
 */
import redis from '../config/redis';
import {
  INTAKE_CACHE_TTL_SECONDS,
  readIntakeCache,
  writeIntakeCache,
} from '../services/intake-cache';

const PARTS = [
  'user-1',
  'intake_match',
  'model-x',
  'system prompt',
  'My client Ram Kumar was arrested.',
];
const ANSWER = '{"template_id":"bail_regular","label":"Ram Kumar bail"}';

async function onlyKey(): Promise<string> {
  const keys = await redis.keys('intake:cache:*');
  expect(keys).toHaveLength(1);
  return keys[0];
}

beforeEach(async () => {
  await redis.flushall();
});

describe('intake cache', () => {
  it('returns the earlier answer for exactly the same request', async () => {
    expect(await readIntakeCache(PARTS)).toBeNull();
    await writeIntakeCache(PARTS, ANSWER);
    expect(await readIntakeCache(PARTS)).toBe(ANSWER);
  });

  it.each([
    ['another user', ['user-2', ...PARTS.slice(1)]],
    ['another purpose', [PARTS[0], 'intake_reception', ...PARTS.slice(2)]],
    ['another description', [...PARTS.slice(0, 4), 'My client Ram Kumar was arrested!']],
    ['the same text split differently', ['user-1intake_match', ...PARTS.slice(2)]],
  ])('is a miss for %s', async (_name, parts) => {
    await writeIntakeCache(PARTS, ANSWER);
    expect(await readIntakeCache(parts)).toBeNull();
  });

  it('stores nothing anyone can read: not the description, not the answer', async () => {
    await writeIntakeCache(PARTS, ANSWER);
    const key = await onlyKey();
    const stored = (await redis.get(key)) as string;
    for (const text of [
      key,
      stored,
      Buffer.from(stored.split('.')[2], 'base64').toString('latin1'),
    ]) {
      expect(text).not.toContain('Ram Kumar');
      expect(text).not.toContain('bail_regular');
      expect(text).not.toContain('user-1');
    }
  });

  it('expires after 30 minutes', async () => {
    await writeIntakeCache(PARTS, ANSWER);
    const ttl = await redis.ttl(await onlyKey());
    expect(ttl).toBeGreaterThan(INTAKE_CACHE_TTL_SECONDS - 5);
    expect(ttl).toBeLessThanOrEqual(INTAKE_CACHE_TTL_SECONDS);
  });

  it('a damaged or foreign entry reads as a miss, never as an error', async () => {
    await writeIntakeCache(PARTS, ANSWER);
    const key = await onlyKey();
    const [iv, tag, data] = ((await redis.get(key)) as string).split('.');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 0xff;
    await redis.set(key, [iv, tag, flipped.toString('base64')].join('.'));
    expect(await readIntakeCache(PARTS)).toBeNull();
    await redis.set(key, 'not an entry');
    expect(await readIntakeCache(PARTS)).toBeNull();
  });

  it('two writes of the same answer are stored differently', async () => {
    await writeIntakeCache(PARTS, ANSWER);
    const first = await redis.get(await onlyKey());
    await writeIntakeCache(PARTS, ANSWER);
    expect(await redis.get(await onlyKey())).not.toBe(first);
    expect(await readIntakeCache(PARTS)).toBe(ANSWER);
  });
});
