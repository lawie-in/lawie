import pino from 'pino';

import { env } from './env';

/**
 * PII safety net for auth logs (T-210, DPDP Act 2023).
 *
 * Call sites should log `userId` only and never an email, name or phone.
 * The options below catch what slips through:
 *  - `redact` censors email/password/phone keys at the top level and one level down.
 *  - the `err` / `error` serializer strips values Mongo/Mongoose copy onto errors
 *    (E11000 `keyValue`, `errorResponse.keyValue`, ValidationError `errors.*.value`)
 *    and masks email-looking strings in message, stack and any other string field.
 */

export const REDACT_CENSOR = '[Redacted]';
export const EMAIL_MASK = '[email]';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const DROPPED_ERR_KEYS = new Set(['keyValue']);
const MAX_DEPTH = 6;

export function maskEmails(value: string): string {
  return value.replace(EMAIL_RE, EMAIL_MASK);
}

function scrub(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return maskEmails(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value) || depth > MAX_DEPTH) return '[Truncated]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (DROPPED_ERR_KEYS.has(key)) continue;
    if (key === 'errors' && v && typeof v === 'object' && !Array.isArray(v)) {
      // Mongoose ValidationError: keep which path failed and how, never the value.
      const errors: Record<string, unknown> = {};
      for (const [path, e] of Object.entries(v as Record<string, unknown>)) {
        const ve = (e ?? {}) as Record<string, unknown>;
        errors[path] = {
          path: ve['path'],
          kind: ve['kind'],
          message: typeof ve['message'] === 'string' ? maskEmails(ve['message']) : undefined,
        };
      }
      out[key] = errors;
      continue;
    }
    out[key] = scrub(v, depth + 1, seen);
  }
  return out;
}

export function serializeErr(err: unknown): unknown {
  const base =
    err instanceof Error ? pino.stdSerializers.err(err) : (err as Record<string, unknown>);
  return scrub(base, 0, new WeakSet());
}

export const loggerOptions: pino.LoggerOptions = {
  level: env.LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['email', 'password', 'phone', '*.email', '*.password', '*.phone'],
    censor: REDACT_CENSOR,
  },
  serializers: {
    err: serializeErr,
    error: serializeErr,
  },
};

const logger = pino({
  ...loggerOptions,
  ...(env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
});

export default logger;
