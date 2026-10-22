/**
 * T-358 (Arjun rulings 2-3, Ajay 8a2b639 / 9e42eea) — the email worker's calls for the
 * unverified-account clock and deletion notice. Never called by a browser: INTERNAL_SECRET
 * with a constant-time compare, and the gateway refuses every path containing /internal/.
 *
 * POST /internal/unverified-notice/prepare { userId }
 *  200 { notice, variant, email, name, link?, deletionDate }
 *        notice   'first' (starts the clock) | 'warning' (7 days before deletion)
 *        variant  'A' (active: link present, lasts 7 days; older links stop working)
 *                 | 'B' (deactivated: no link)
 *        deletionDate  "21 October 2026" (IST)
 *  409 { error: 'not_eligible' }  verified, Google, being erased, Admin, or no notice due now
 *  404 { error: 'not_found' }
 *
 * POST /internal/unverified-notice/outcome { userId, mail, outcome }
 *  The ONE report path for every email that carries a verify link (the T-223 verify email and
 *  resends, and the notice). mail: 'verify' | 'notice_first' | 'notice_warning'; outcome:
 *  'sent' | 'bounced' (a recipient hard bounce counts as sent). Report only a confirmed send.
 *  200 { firstStamped, warningStamped }  what this call stamped (false when already stamped or
 *                                        the account is no longer unverified)
 *  404 { error: 'not_found' }
 *
 * Both: 400 bad body, 401 bad secret. The prepare response holds PII and a live credential: it
 * is never logged (no request logger is mounted in auth) and is marked no-store.
 */
import { INTERNAL_HEADERS } from '@lawie/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';

import { isTestAccountUser } from '../services/test-signup-bypass.service';
import {
  MAIL_OUTCOMES,
  prepareUnverifiedNotice,
  recordVerifyMailOutcome,
  VERIFY_MAILS,
  type MailOutcome,
  type VerifyMail,
} from '../services/unverified-sweep.service';

import { internalSecretMatches } from './internal-verify.routes';

const router = Router();

router.post(
  '/internal/unverified-notice/prepare',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    res.set('Cache-Control', 'no-store');
    if (!internalSecretMatches(req.headers[INTERNAL_HEADERS.SECRET])) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const userId = (req.body as { userId?: unknown } | undefined)?.userId;
    if (typeof userId !== 'string' || userId.length === 0) {
      res.status(400).json({ error: 'userId required' });
      return;
    }
    try {
      // T-563 (Arjun default 6): a test account is never mailed.
      if (await isTestAccountUser(userId)) {
        res.status(409).json({ error: 'not_eligible' });
        return;
      }
      const result = await prepareUnverifiedNotice(userId);
      if (result.kind === 'not_eligible') {
        res.status(409).json({ error: 'not_eligible' });
        return;
      }
      if (result.kind === 'not_found') {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json({
        notice: result.notice,
        variant: result.variant,
        email: result.email,
        name: result.name,
        ...(result.link ? { link: result.link } : {}),
        deletionDate: result.deletionDate,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/internal/unverified-notice/outcome',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    res.set('Cache-Control', 'no-store');
    if (!internalSecretMatches(req.headers[INTERNAL_HEADERS.SECRET])) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const body = req.body as { userId?: unknown; mail?: unknown; outcome?: unknown } | undefined;
    const userId = body?.userId;
    const mail = body?.mail;
    const outcome = body?.outcome;
    if (typeof userId !== 'string' || userId.length === 0) {
      res.status(400).json({ error: 'userId required' });
      return;
    }
    if (typeof mail !== 'string' || !VERIFY_MAILS.includes(mail as VerifyMail)) {
      res.status(400).json({ error: 'mail must be verify, notice_first or notice_warning' });
      return;
    }
    if (typeof outcome !== 'string' || !MAIL_OUTCOMES.includes(outcome as MailOutcome)) {
      res.status(400).json({ error: 'outcome must be sent or bounced' });
      return;
    }
    try {
      const result = await recordVerifyMailOutcome(
        userId,
        mail as VerifyMail,
        outcome as MailOutcome,
      );
      if (result.kind === 'not_found') {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res
        .status(200)
        .json({ firstStamped: result.firstStamped, warningStamped: result.warningStamped });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
