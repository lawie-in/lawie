/**
 * Internal routes — service-to-service only (T-115c). Called by auth, never
 * by a browser: guarded by INTERNAL_SECRET with a constant-time compare, and
 * the gateway refuses every path containing /internal/.
 *
 * POST /internal/erase-user { userId, dryRun? }
 *   Erases what billing holds for the user (services/account-erase.service.ts).
 *   Idempotent; dryRun counts and changes nothing.
 *     200 { ok: true, dryRun, counts }
 *     400 bad body, 401 bad secret
 *     500 { ok: false, error: 'erase_failed', failedAt, counts }: auth retries
 *
 * GET /internal/subscription-status/:userId
 *   For auth's close-account gate (Arjun, T-115c ruling 4).
 *     200 { active: boolean, status: string }  (status 'none' when no subscription)
 *     400 bad userId, 401 bad secret, 500 read failed
 *
 * GET /internal/invoices/:id/email-view
 *   For the email-worker at send time (T-436 c, Arjun #1): the job carries only
 *   userId + invoiceId, so the number, total, name and address come from here.
 *   No case content, no tax breakdown, no seller details.
 *     200 { invoiceId, userId, kind, number, issuedAt, total (paise),
 *           customer: { name, email }, originalInvoiceNumber (credit notes, else null),
 *           downloadUrl }
 *     400 bad id, 401 bad secret, 404 no such row, 409 not issued, 500 read failed
 *     410 { error: 'erased' }: the user is erased or being erased (isErasedUser;
 *         Ajay Addendum 8 #2, e591d0d). No customer fields. The worker drops the
 *         job and does not retry.
 */
import crypto from 'crypto';

import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';

import { env } from '../config/env';
import logger from '../config/logger';
import { Invoice } from '../models/Invoice.model';
import { eraseBillingAccount, subscriptionStatusFor } from '../services/account-erase.service';
import { isErasedUser } from '../services/invoice-email.service';

/** Where the invoices list (and PDF download) lives in the web app. */
export const INVOICE_DOWNLOAD_PATH = '/dashboard/settings';

/** FRONTEND_URL + the invoices page; just the path if FRONTEND_URL is empty. */
export function invoiceDownloadUrl(frontendUrl: string = env.FRONTEND_URL): string {
  const base = frontendUrl.trim().replace(/\/+$/, '');
  return base ? `${base}${INVOICE_DOWNLOAD_PATH}` : INVOICE_DOWNLOAD_PATH;
}

const router = Router();

/** Constant-time: both sides hashed to 32 bytes first, so length does not leak either. */
export function internalSecretMatches(provided: unknown): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const b = crypto.createHash('sha256').update(env.INTERNAL_SECRET, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

function requireInternalSecret(req: Request, res: Response, next: () => void): void {
  res.set('Cache-Control', 'no-store');
  if (!internalSecretMatches(req.headers['x-internal-secret'])) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

router.post(
  '/internal/erase-user',
  requireInternalSecret,
  async (req: Request, res: Response): Promise<void> => {
    const { userId, dryRun } = (req.body ?? {}) as { userId?: unknown; dryRun?: unknown };
    if (typeof userId !== 'string' || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'valid userId is required' });
      return;
    }
    // A string "true" must never be read as false and erase for real.
    if (dryRun !== undefined && typeof dryRun !== 'boolean') {
      res.status(400).json({ error: 'dryRun must be a boolean' });
      return;
    }

    const result = await eraseBillingAccount({ userId, dryRun: dryRun === true });
    if (!result.ok) {
      res.status(500).json({
        ok: false,
        error: 'erase_failed',
        failedAt: result.failedAt,
        counts: result.counts,
      });
      return;
    }
    res.status(200).json({ ok: true, dryRun: result.dryRun, counts: result.counts });
  },
);

router.get(
  '/internal/subscription-status/:userId',
  requireInternalSecret,
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    if (typeof userId !== 'string' || !mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'valid userId is required' });
      return;
    }
    try {
      res.status(200).json(await subscriptionStatusFor(userId));
    } catch (err) {
      logger.warn(
        { userId, errName: err instanceof Error ? err.name : 'UnknownError' },
        'subscription-status read failed',
      );
      res.status(500).json({ error: 'status_unavailable' });
    }
  },
);

router.get(
  '/internal/invoices/:id/email-view',
  requireInternalSecret,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    if (typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'valid invoice id is required' });
      return;
    }
    try {
      const row = await Invoice.findById(id)
        .select(
          'kind state userId number issuedAt total customer.name customer.email originalInvoiceNumber',
        )
        .lean();
      if (!row) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      if (row.state !== 'issued') {
        res.status(409).json({ error: 'not_issued' });
        return;
      }
      // A lookup error throws into the catch below: 500, like any read error.
      if (await isErasedUser(row.userId)) {
        logger.info(
          { invoiceId: String(row._id), userId: String(row.userId) },
          'invoice email-view: user erased; 410',
        );
        res.status(410).json({ error: 'erased' });
        return;
      }
      res.status(200).json({
        invoiceId: String(row._id),
        userId: String(row.userId),
        kind: row.kind,
        number: row.number ?? null,
        issuedAt: row.issuedAt ?? null,
        total: row.total ?? null,
        customer: { name: row.customer?.name ?? '', email: row.customer?.email ?? '' },
        originalInvoiceNumber:
          row.kind === 'credit_note' ? (row.originalInvoiceNumber ?? null) : null,
        downloadUrl: invoiceDownloadUrl(),
      });
    } catch (err) {
      logger.warn(
        { invoiceId: id, errName: err instanceof Error ? err.name : 'UnknownError' },
        'invoice email-view read failed',
      );
      res.status(500).json({ error: 'view_unavailable' });
    }
  },
);

export default router;
