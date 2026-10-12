/**
 * T-220 AC6 — what the email path may put in logs and Sentry: the template
 * id, a user id, and safe counts or flags. Never an address, a name, the
 * subject (it can carry the recipient's name) or any part of the body.
 *
 * Provider errors are the other leak: SES and SMTP servers echo the rejected
 * address in their error message / response text. Adapters therefore wrap
 * every provider failure in an EmailSendError that carries only the error
 * name, a code and the HTTP / SMTP status, and never links the original
 * error as `cause` (Sentry would serialise it).
 */

/** Non-PII context the caller passes down so adapters can log it. */
export interface EmailSendMeta {
  /** Template id, e.g. `auth.welcome`. */
  template?: string;
  /** Lawie user id (Mongo ObjectId string), never an email address. */
  userId?: string;
  /** BullMQ job id, when the send comes from the queue. */
  jobId?: string;
}

/** Only short identifier-like tokens survive; anything else is replaced. */
const SAFE_TOKEN = /^[A-Za-z0-9_.:-]{1,64}$/;

function safeToken(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return undefined;
  return SAFE_TOKEN.test(v) && !v.includes('@') ? v : 'redacted';
}

function safeStatus(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) ? v : undefined;
}

/** Ids are logged only if they look like ids (no `@`, no spaces). */
function safeId(v: unknown): string | undefined {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const s = String(v);
  return SAFE_TOKEN.test(s) && !s.includes('@') ? s : 'redacted';
}

export function safeMeta(meta: EmailSendMeta | undefined): Record<string, string | undefined> {
  return {
    template: safeId(meta?.template),
    userId: safeId(meta?.userId),
    jobId: safeId(meta?.jobId),
  };
}

/** Pull a user id out of the template data, if the producer put one there. */
export function userIdFromData(data: Record<string, unknown> | undefined): string | undefined {
  const v = data?.userId;
  return typeof v === 'string' && v.length > 0 && !v.includes('@') ? v : undefined;
}

export type EmailProviderName = 'ses' | 'smtp';

/**
 * Sanitised provider failure. Message is built only from the error name,
 * code and status, so BullMQ's stored `failedReason`, pino and Sentry never
 * see the provider's text.
 */
export class EmailSendError extends Error {
  readonly provider: EmailProviderName;
  readonly errorName: string | undefined;
  readonly code: string | undefined;
  readonly statusCode: number | undefined;
  /** 'client' | 'server' for SES (AWS SDK `$fault`); undefined otherwise. */
  readonly fault: string | undefined;

  constructor(
    provider: EmailProviderName,
    info: { errorName?: string; code?: string; statusCode?: number; fault?: string },
  ) {
    const bits = [info.errorName, info.code, info.statusCode].filter((b) => b !== undefined);
    super(`${provider} send failed${bits.length > 0 ? `: ${bits.join(' ')}` : ''}`);
    this.name = 'EmailSendError';
    this.provider = provider;
    this.errorName = info.errorName;
    this.code = info.code;
    this.statusCode = info.statusCode;
    this.fault = info.fault;
  }
}

/** Wrap an AWS SDK v3 SES error. Reads name, Code/code, $metadata and $fault only. */
export function fromSesError(err: unknown): EmailSendError {
  const e = (err ?? {}) as Record<string, unknown>;
  const metadata = (e.$metadata ?? {}) as Record<string, unknown>;
  return new EmailSendError('ses', {
    errorName: safeToken(e.name),
    code: safeToken(e.Code ?? e.code),
    statusCode: safeStatus(metadata.httpStatusCode),
    fault: safeToken(e.$fault),
  });
}

/** Wrap a nodemailer error. Reads name, code and responseCode only (never `response`). */
export function fromSmtpError(err: unknown): EmailSendError {
  const e = (err ?? {}) as Record<string, unknown>;
  return new EmailSendError('smtp', {
    errorName: safeToken(e.name),
    code: safeToken(e.code),
    statusCode: safeStatus(e.responseCode),
  });
}

/** Fields safe to log for any error: name, code, status. Never the message. */
export function safeErrorFields(err: unknown): Record<string, string | number | undefined> {
  if (err instanceof EmailSendError) {
    return {
      name: err.name,
      provider: err.provider,
      errorName: err.errorName,
      code: err.code,
      statusCode: err.statusCode,
      fault: err.fault,
    };
  }
  const e = (err ?? {}) as Record<string, unknown>;
  return { name: safeToken(e.name) ?? 'Error', code: safeToken(e.code) };
}

/**
 * Error to hand to Sentry. EmailSendError is already safe. Anything else is
 * replaced by a new Error with the same name and the original stack frames
 * (file/function/line only), but without the original message, which may
 * echo template data.
 */
export function toSentrySafeError(err: unknown): Error {
  if (err instanceof EmailSendError) return err;
  const { name, code } = safeErrorFields(err);
  const safe = new Error(`${String(name)}${code ? ` (${String(code)})` : ''} in email send`);
  safe.name = String(name);
  const stack = (err as { stack?: unknown } | null)?.stack;
  if (typeof stack === 'string') {
    const frames = stack.split('\n').filter((l) => /^\s+at\s/.test(l));
    if (frames.length > 0) safe.stack = [`${safe.name}: ${safe.message}`, ...frames].join('\n');
  }
  return safe;
}

/** Dry-run / send log fields: counts and flags only. */
export function safeSendFields(
  rendered: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    replyTo?: string;
    from?: string;
    html: string;
    text: string;
  },
  redirected: boolean,
): Record<string, number | boolean> {
  return {
    toCount: rendered.to.length,
    ccCount: rendered.cc?.length ?? 0,
    bccCount: rendered.bcc?.length ?? 0,
    customReplyTo: rendered.replyTo !== undefined,
    customFrom: rendered.from !== undefined,
    redirected,
    htmlBytes: Buffer.byteLength(rendered.html, 'utf8'),
    textBytes: Buffer.byteLength(rendered.text, 'utf8'),
  };
}
