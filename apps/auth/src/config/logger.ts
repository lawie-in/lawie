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

// The lookbehind anchors a match at the start of a local-part run, so a long run of
// local-part chars (e.g. attacker-controlled req.url) is not retried from every offset.
const EMAIL_RE = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const DROPPED_ERR_KEYS = new Set(['keyValue']);
const MAX_DEPTH = 6;

export function maskEmails(value: string): string {
  if (!value.includes('@')) return value;
  return value.replace(EMAIL_RE, EMAIL_MASK);
}

function scrub(value: unknown, depth: number, ancestors: Set<object>): unknown {
  if (typeof value === 'string') return maskEmails(value);
  if (value === null || typeof value !== 'object') return value;
  // Truncate only true cycles (object is its own ancestor) and very deep trees. Objects
  // shared by two branches (E11000 keyPattern and errorResponse.keyPattern) are kept in both.
  if (ancestors.has(value) || depth > MAX_DEPTH) return '[Truncated]';
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1, ancestors));

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
      out[key] = scrub(v, depth + 1, ancestors);
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Deep PII scrub shared by the Pino serializer and the Sentry beforeSend: masks
 * email-shaped strings, drops `keyValue`, reduces Mongoose `errors.*` to {path, kind, message}.
 */
export function scrubPii(value: unknown): unknown {
  return scrub(value, 0, new Set());
}

export function serializeErr(err: unknown): unknown {
  // Error-like check (as pino-std-serializers does), so cross-realm errors keep message/stack.
  const e = err as { message?: unknown; name?: unknown } | null | undefined;
  if (!e || typeof e !== 'object' || typeof e.message !== 'string') return scrubPii(err);
  // `name` (e.g. MongoServerError) is a prototype getter the std serializer does not copy.
  const base = {
    ...(typeof e.name === 'string' && { name: e.name }),
    ...pino.stdSerializers.err(err as Error),
  };
  return scrubPii(base);
}

/**
 * Masks emails in string args (the msg and printf params) before pino formats them.
 * pino also copies the RAW `err.message` into the top-level `msg` when no message
 * string is passed, bypassing serializers — so in that case we supply a masked one.
 */
function maskLogArgs(this: pino.Logger, args: unknown[], method: pino.LogFn): void {
  const masked = args.map((a) => (typeof a === 'string' ? maskEmails(a) : a));
  const [first] = masked;
  if (masked.length === 1 && first !== null && typeof first === 'object') {
    const obj = first as Record<string, unknown>;
    const err = first instanceof Error ? first : obj['err'];
    if (obj['msg'] === undefined && err && typeof err === 'object') {
      const message = (err as { message?: unknown }).message;
      if (message !== undefined) masked.push(maskEmails(String(message)));
    }
  }
  (method as (...a: unknown[]) => void).apply(this, masked);
}

export const loggerOptions: pino.LoggerOptions = {
  level: env.LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  hooks: { logMethod: maskLogArgs },
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
