/**
 * T-220 test helpers: capture pino output and load email-worker modules under a
 * chosen env, fresh each time (env.ts parses process.env once at load).
 */
export const LEAK_ADDRESS = 'leak@example.com';
export const LEAK_NAME = 'Zainab Quasimodo';

type Sink = { lines: string[] };
const g = globalThis as unknown as { __t220Sink?: Sink };

export function sink(): Sink {
  if (!g.__t220Sink) g.__t220Sink = { lines: [] };
  return g.__t220Sink;
}

/** Factory for jest.mock('../config/logger'): the real pino, writing into the sink. */
export function makeCapturingLogger() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pino = require('pino');
  return {
    logger: pino({ level: 'debug' }, { write: (s: string) => void sink().lines.push(s) }),
  };
}

export function parsedLogs(): Array<Record<string, unknown>> {
  return sink().lines.map((l) => JSON.parse(l) as Record<string, unknown>);
}

export function resetSink(): void {
  sink().lines.length = 0;
}

export function allLogText(): string {
  return sink().lines.join('\n');
}

/** Serialise anything (Error objects included: name, message, stack, own props). */
export function dump(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val instanceof Error
      ? { name: val.name, message: val.message, stack: val.stack, ...(val as object) }
      : val,
  );
}

const BASE_ENV = {
  EMAIL_PROVIDER: 'dry-run',
  EMAIL_DRY_RUN: 'true',
} as const;

/** Run `fn` with env overrides applied (undefined deletes), then restore. */
export async function withEnv<T>(
  over: Record<string, string | undefined>,
  fn: () => Promise<T> | T,
): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  const merged = { ...BASE_ENV, ...over };
  for (const [k, v] of Object.entries(merged)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

export const SES_ENV = {
  EMAIL_PROVIDER: 'ses',
  EMAIL_DRY_RUN: 'false',
  AWS_SES_ACCESS_KEY_ID: 'AKIADUMMYDUMMYDUMMY',
  AWS_SES_SECRET_ACCESS_KEY: 'dummy-secret-dummy-secret-dummy',
};

export const SMTP_ENV = {
  EMAIL_PROVIDER: 'smtp',
  EMAIL_DRY_RUN: 'false',
  SMTP_HOST: 'smtp.invalid',
  SMTP_USER: 'dummy-user',
  SMTP_PASS: 'dummy-pass',
};
