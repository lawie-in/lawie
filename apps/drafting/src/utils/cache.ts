import redis from '../config/redis';

const DEFAULT_TTL = 3600; // 1 hour

// ── Simple key-value ─────────────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (raw === null) return null;
  return JSON.parse(raw) as T;
}

export async function cacheSet<T>(key: string, value: T, ttl = DEFAULT_TTL): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', ttl);
}

// ── Hash (field-level) ───────────────────────────────────────────────────────

export async function cacheHGet<T>(hash: string, field: string): Promise<T | null> {
  const raw = await redis.hget(hash, field);
  if (raw === null) return null;
  return JSON.parse(raw) as T;
}

export async function cacheHSet<T>(hash: string, field: string, value: T): Promise<void> {
  await redis.hset(hash, field, JSON.stringify(value));
}

export async function cacheHGetAll<T>(hash: string): Promise<Record<string, T>> {
  const raw = await redis.hgetall(hash);
  const result: Record<string, T> = {};
  for (const [key, val] of Object.entries(raw)) {
    result[key] = JSON.parse(val) as T;
  }
  return result;
}

/**
 * Atomic bulk write: deletes the hash, writes all entries, sets TTL — in a
 * single pipeline so readers never see a partial state.
 */
export async function cacheHSetBulk<T>(
  hash: string,
  entries: Map<string, T> | Record<string, T>,
  ttl = DEFAULT_TTL,
): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.del(hash);

  const iterable = entries instanceof Map ? entries.entries() : Object.entries(entries);

  for (const [field, value] of iterable) {
    pipeline.hset(hash, field, JSON.stringify(value));
  }

  pipeline.expire(hash, ttl);
  await pipeline.exec();
}

// ── Utilities ────────────────────────────────────────────────────────────────

export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length > 0) await redis.del(...keys);
}

export async function cacheExists(key: string): Promise<boolean> {
  const result = await redis.exists(key);
  return result === 1;
}
