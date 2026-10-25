import { INTERNAL_HEADERS } from '../constants/headers';
import {
  CURRENT_PRIVACY_VERSION,
  PRIVACY_REACCEPT_REQUIRED,
  getPrivacyVersionSummary,
} from '../constants/privacy';

/**
 * T-343 (Arjun, 12 Oct 2026) — blocks an action until the user has accepted the current privacy
 * version. Reads the internal header the gateway sets from the verified `pv` JWT claim and
 * returns 403 { error: 'privacy_reaccept_required' } when it is missing or not equal to
 * CURRENT_PRIVACY_VERSION (string equality, never a date comparison). Fails closed: a token
 * issued before `pv` existed carries no header, which counts as not accepted.
 *
 * No signed summary, no block (Arjun, T-343 Addendum 2.1): when the current version has no
 * signed summary, no prompt can show (Ajay §3), so the action is let through.
 *
 * Mount only on the routes Ajay blocks (handoff/legal/T-343-privacy-reaccept-signed.md §2): new
 * drafts (every generate route) and user-started payments (subscribe, top-up order). Never on
 * view, download, export, delete, support, auth or the Razorpay webhook (auto-renewals are not
 * blocked). Mount it after the service's authenticate, which checks the gateway secret.
 *
 * Structural types only: @lawie/shared has no express dependency. Logs nothing.
 */
type RequireCurrentPrivacyRequest = {
  headers: Record<string, string | string[] | undefined>;
};
type RequireCurrentPrivacyResponse = {
  status(code: number): { json(body: unknown): unknown };
};
type RequireCurrentPrivacyNext = (err?: unknown) => void;

export function requireCurrentPrivacy(
  req: RequireCurrentPrivacyRequest,
  res: RequireCurrentPrivacyResponse,
  next: RequireCurrentPrivacyNext,
): void {
  if (getPrivacyVersionSummary(CURRENT_PRIVACY_VERSION) === undefined) {
    next();
    return;
  }
  const accepted = req.headers[INTERNAL_HEADERS.USER_PRIVACY_VERSION];
  if (typeof accepted !== 'string' || accepted !== CURRENT_PRIVACY_VERSION) {
    res.status(403).json({ error: PRIVACY_REACCEPT_REQUIRED });
    return;
  }
  next();
}
