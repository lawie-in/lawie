/**
 * SSE keep-alive heartbeat (T-285).
 *
 * Long brief runs (clause repair, fact repair, the ledger path) can go quiet
 * for a minute or more while the model works, and an idle proxy may drop the
 * stream before `done`. While the response is open this writes an SSE comment
 * line (`: keep-alive`) every 15 s. A comment is not an event: SSE parsers
 * ignore it, so it never reaches the draft text, the stored draft or the
 * export.
 *
 * Transport only. It does not touch any hold, credit or Generation state, so a
 * heartbeat never extends a T-226 hold.
 *
 * Call it right after the SSE headers are set and call the returned `stop()`
 * in a `finally`. It also stops itself on the response's `close` event and on
 * any tick where the response has ended or been destroyed. `stop()` is
 * idempotent. Works with plain test fakes that have no `.on`, `writableEnded`
 * or `destroyed` (those are treated as open).
 */
import type { Response } from 'express';

const KEEP_ALIVE_LINE = ': keep-alive\n\n';

export function startSseKeepAlive(res: Response, intervalMs = 15000): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    if (typeof res.off === 'function') {
      res.off('close', stop);
    } else if (typeof res.removeListener === 'function') {
      res.removeListener('close', stop);
    }
  };

  timer = setInterval(() => {
    if (stopped) return;
    if (res.writableEnded || res.destroyed) {
      stop();
      return;
    }
    try {
      res.write(KEEP_ALIVE_LINE);
    } catch {
      stop();
    }
  }, intervalMs);
  timer.unref?.();

  if (typeof res.on === 'function') res.on('close', stop);

  return stop;
}
