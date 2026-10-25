/**
 * A short-lived cache for intake model calls (T-105).
 *
 * Sending the same description again must make no new model call, and nothing
 * the user wrote may be stored in a form anyone can read before a draft is
 * generated (ADR-021, section 3.2). Both hold here:
 *
 * - The Redis key is a keyed hash of the request. It reveals nothing.
 * - The value is the model's answer, encrypted with a key that is derived from
 *   the request text itself as well as the server secret. Nobody can read a
 *   stored value without already holding the same description.
 * - Entries expire after 30 minutes.
 *
 * The cache is best effort. Any failure reads as a miss and is never an error.
 */
import crypto from 'crypto';

import { env } from '../config/env';
import redis from '../config/redis';

export const INTAKE_CACHE_TTL_SECONDS = 30 * 60;

interface CacheKeys {
  redisKey: string;
  encryptionKey: Buffer;
}

function deriveKeys(parts: string[]): CacheKeys {
  const secret = Buffer.from(env.ENCRYPTION_KEY, 'hex');
  const material = parts.map((p) => `${p.length}:${p}`).join('|');
  const id = crypto
    .createHmac('sha256', secret)
    .update(`intake-cache-id|${material}`)
    .digest('hex');
  const encryptionKey = crypto
    .createHmac('sha256', secret)
    .update(`intake-cache-key|${material}`)
    .digest();
  return { redisKey: `intake:cache:${id}`, encryptionKey };
}

/** The earlier answer for exactly this request, or null. */
export async function readIntakeCache(parts: string[]): Promise<string | null> {
  try {
    const { redisKey, encryptionKey } = deriveKeys(parts);
    const stored = await redis.get(redisKey);
    if (!stored) return null;
    const [iv, tag, data] = stored.split('.').map((s) => Buffer.from(s, 'base64'));
    if (!iv || !tag || !data) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf-8');
  } catch {
    return null;
  }
}

export async function writeIntakeCache(parts: string[], answer: string): Promise<void> {
  try {
    const { redisKey, encryptionKey } = deriveKeys(parts);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
    const data = Buffer.concat([cipher.update(answer, 'utf-8'), cipher.final()]);
    const stored = [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
    await redis.set(redisKey, stored, 'EX', INTAKE_CACHE_TTL_SECONDS);
  } catch {
    // Best effort: a failed write only means the next identical request calls the model again.
  }
}
