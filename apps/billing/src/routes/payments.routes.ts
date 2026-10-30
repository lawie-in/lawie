/**
 * T-646: payment history and payment concerns.
 *
 * GET /payments  (gateway: /api/billing/payments; own user only)
 *   200 { payments: [{ id, createdAt, kind: 'plan'|'topup', amountPaise,
 *         status: 'paid'|'failed'|'processing'|'refunded'|'partly_refunded',
 *         checking, refundedPaise, inkDelta, referenceTail, invoiceId,
 *         concern: { id, status, reference } | null }] }  newest first
 *   500 read failed
 *
 * POST /payments/:id/concerns  { reason, note }
 *   201 { concern: { id, status, reference }, ackEmailQueued: boolean }
 *       ackEmailQueued (AJ-646-M11 (1)): true only when the acknowledgement email's enqueue
 *       resolved; false when it failed, timed out or no queue is configured. A queue
 *       failure never fails the concern.
 *   400 bad body; 404 unknown, malformed or another user's payment;
 *   409 an open concern exists; 429 rate limited (+ Retry-After);
 *   503 the rate-limit store is down (fail closed, nothing stored); 500 otherwise
 *   The note is never logged or echoed (Arjun ruling 5).
 *
 * GET /internal/payment-concerns/:id/email-view  (email-worker only, INTERNAL_SECRET)
 *   200 ConcernEmailView (ids, reference, reason code, addresses, links; never the note)
 *   400 bad id, 401 bad secret, 404 no such concern, 410 user erased, 500 read failed
 */
import { INTERNAL_HEADERS } from '@lawie/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';

import { env } from '../config/env';
import logger from '../config/logger';
import { authenticate } from '../middleware/authenticate';
import {
  clientIpForRateLimit,
  ConcernRateLimitUnavailableError,
  consumeConcernIpQuota,
} from '../services/concern-rate-limit';
import {
  concernEmailView,
  createPaymentConcern,
  parseConcernBody,
} from '../services/payment-concern.service';
import { listPaymentsForUser } from '../services/payment-record.service';
import { internalSecretMatches } from '../utils/internal-secret';

const router = Router();

function errName(err: unknown): string {
  return err instanceof Error ? err.name : 'unknown';
}

router.get('/payments', authenticate, async (req: Request, res: Response) => {
  const userId = req.jwtPayload!.sub;
  res.set('Cache-Control', 'private, no-store');
  try {
    const payments = await listPaymentsForUser(userId);
    res.json({ payments });
  } catch (err) {
    logger.error({ userId, errName: errName(err) }, 'Failed to list payments');
    res.status(500).json({ error: 'Failed to list payments' });
  }
});

router.post('/payments/:id/concerns', authenticate, async (req: Request, res: Response) => {
  const userId = req.jwtPayload!.sub;
  const paymentId = req.params.id;
  res.set('Cache-Control', 'no-store');
  if (!mongoose.Types.ObjectId.isValid(paymentId) || !/^[a-f0-9]{24}$/i.test(paymentId)) {
    res.status(404).json({ error: 'Payment not found' });
    return;
  }
  const body = parseConcernBody(req.body);
  if (!body) {
    res.status(400).json({ error: 'invalid_concern' });
    return;
  }
  try {
    const ipQuota = await consumeConcernIpQuota(clientIpForRateLimit(req));
    if (!ipQuota.allowed) {
      res.set('Retry-After', String(ipQuota.retryAfterSeconds));
      res.status(429).json({ error: 'rate_limited', retryAfter: ipQuota.retryAfterSeconds });
      return;
    }
    const result = await createPaymentConcern({ userId, paymentId, body });
    switch (result.status) {
      case 'not_found':
        res.status(404).json({ error: 'Payment not found' });
        return;
      case 'conflict':
        res.status(409).json({ error: 'concern_open' });
        return;
      case 'rate_limited':
        res.set('Retry-After', String(result.retryAfterSeconds));
        res.status(429).json({ error: 'rate_limited', retryAfter: result.retryAfterSeconds });
        return;
      case 'created':
        // AJ-646-M11 (1): the web shows the long toast only when this is true.
        res.status(201).json({ concern: result.concern, ackEmailQueued: result.ackEmailQueued });
        return;
    }
  } catch (err) {
    if (err instanceof ConcernRateLimitUnavailableError) {
      res.status(503).json({ error: 'service_unavailable' });
      return;
    }
    // Error class only: a driver message could echo a value.
    logger.error({ userId, paymentId, errName: errName(err) }, 'Failed to create payment concern');
    res.status(500).json({ error: 'Failed to create concern' });
  }
});

function requireInternalSecret(req: Request, res: Response, next: NextFunction): void {
  res.set('Cache-Control', 'no-store');
  if (!internalSecretMatches(req.headers[INTERNAL_HEADERS.SECRET], env.INTERNAL_SECRET)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

router.get(
  '/internal/payment-concerns/:id/email-view',
  requireInternalSecret,
  async (req: Request, res: Response) => {
    const concernId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(concernId) || !/^[a-f0-9]{24}$/i.test(concernId)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    try {
      const result = await concernEmailView(concernId);
      if (result.status === 'erased') {
        res.status(410).json({ error: 'erased' });
        return;
      }
      if (result.status === 'not_found') {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.json(result.view);
    } catch (err) {
      logger.error({ concernId, errName: errName(err) }, 'Failed to read concern email view');
      res.status(500).json({ error: 'read failed' });
    }
  },
);

export default router;
