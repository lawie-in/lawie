/**
 * T-315 (from T-307) — a body that body-parser (json, raw, urlencoded or text) rejects gets a plain JSON
 * reply that repeats nothing the client sent. body-parser puts a slice of the
 * body in err.message (and the whole body in err.body), so neither is sent back
 * or passed to the logger. Mount it after the routes and before Sentry's
 * handler; it does not call next() for these errors, so they never reach Sentry
 * or Express's default handler (which prints err.message to stderr). Any other
 * error is passed on with next(err).
 *
 * Structural types only: @lawie/shared has no express dependency. The handler
 * has four parameters, so Express treats it as error middleware.
 */

type JsonBodyErrorRequest = { method?: string; path?: string };
type JsonBodyErrorResponse = { status(code: number): { json(body: unknown): unknown } };
type JsonBodyErrorNext = (err?: unknown) => void;

export interface JsonBodyRejectedInfo {
  method?: string;
  path?: string;
  type: string;
  status: number;
}

/** Any pino-style logger (default or named export). */
export interface JsonBodyErrorLogger {
  debug(obj: object, msg: string): void;
}

export interface JsonBodyErrorHandlerOptions {
  /** Logs { method, path, type } at debug, 'Request body rejected' — the T-307 log line. */
  logger?: JsonBodyErrorLogger;
  /** Called once per rejected body. Receives only these fields — never err.message or err.body. */
  onRejected?: (info: JsonBodyRejectedInfo) => void;
}

export type JsonBodyErrorMiddleware = (
  err: unknown,
  req: JsonBodyErrorRequest,
  res: JsonBodyErrorResponse,
  next: JsonBodyErrorNext,
) => void;

// T-320: frozen (outer map and each entry) so no importer can add, remove or edit a mapping at runtime.
export const BODY_PARSER_ERRORS: Readonly<Record<string, { status: number; error: string }>> =
  Object.freeze({
    'entity.parse.failed': Object.freeze({ status: 400, error: 'Bad Request' }),
    'entity.too.large': Object.freeze({ status: 413, error: 'Payload Too Large' }),
    'encoding.unsupported': Object.freeze({ status: 415, error: 'Unsupported Media Type' }),
    'charset.unsupported': Object.freeze({ status: 415, error: 'Unsupported Media Type' }),
    // urlencoded parser (T-315 round 1b, Arjun)
    'parameters.too.many': Object.freeze({ status: 413, error: 'Payload Too Large' }),
    'querystring.parse.rangeError': Object.freeze({ status: 400, error: 'Bad Request' }),
  });

/**
 * Documented form: `app.use(createJsonBodyErrorHandler({ logger }))`, which logs
 * { method, path, type } at debug with each service's own logger.
 * `jsonBodyErrorHandler` is its no-logger shorthand.
 */
export function createJsonBodyErrorHandler(
  options: JsonBodyErrorHandlerOptions = {},
): JsonBodyErrorMiddleware {
  const { logger, onRejected } = options;
  return (err, req, res, next) => {
    const rawType = (err as { type?: unknown } | null | undefined)?.type;
    if (typeof rawType !== 'string') return next(err);
    const type: string = rawType;
    // Own keys only, so a type such as 'constructor' cannot match Object.prototype.
    const known = Object.prototype.hasOwnProperty.call(BODY_PARSER_ERRORS, type)
      ? BODY_PARSER_ERRORS[type]
      : undefined;
    if (!known) return next(err);
    logger?.debug({ method: req.method, path: req.path, type }, 'Request body rejected');
    onRejected?.({ method: req.method, path: req.path, type, status: known.status });
    res.status(known.status).json({ error: known.error });
  };
}

/** No-logger shorthand for `createJsonBodyErrorHandler()`. To log, use `createJsonBodyErrorHandler({ logger })`. */
export const jsonBodyErrorHandler: JsonBodyErrorMiddleware = createJsonBodyErrorHandler();
