/**
 * T-522 (Arjun ruling 4, 22 Oct 2026) — a constant minimum latency for the neutral answers
 * (POST /register, POST /verify-email/resend-by-email), so timing does not tell a new address
 * from an existing one. A code constant, not an env var. A request that already took longer
 * than the floor is not padded: it logs `signup_pad_overrun` (ids only, never an address), and
 * the floor is raised if that shows up.
 */
import logger from '../config/logger';

/** The floor, measured from the start of the request. */
export const SIGNUP_RESPONSE_FLOOR_MS = 500;

export const SIGNUP_PAD_OVERRUN = 'signup_pad_overrun';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Waits until `floorMs` has passed since `startedAt` (a Date.now() value). `route` names the
 * endpoint in the overrun warning; `userId` is added when known. Never logs an address.
 */
export async function padToFloor(
  startedAt: number,
  route: string,
  opts: { floorMs?: number; userId?: string } = {},
): Promise<void> {
  const floorMs = opts.floorMs ?? SIGNUP_RESPONSE_FLOOR_MS;
  const elapsed = Date.now() - startedAt;
  if (elapsed < floorMs) {
    await sleep(floorMs - elapsed);
    return;
  }
  logger.warn(
    {
      metric: SIGNUP_PAD_OVERRUN,
      route,
      elapsedMs: elapsed,
      floorMs,
      ...(opts.userId ? { userId: opts.userId } : {}),
    },
    SIGNUP_PAD_OVERRUN,
  );
}
