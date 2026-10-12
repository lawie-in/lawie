/**
 * T-310 — POST /consent (public, no auth): the server-side record of an anonymous visitor's
 * analytics choice (Ajay's ruling, Arjun's spec in handoff/tickets/T-310-analytics-consent-before-ga.md).
 *
 * Body, exactly: { id: <uuid v4>, choice: 'granted' | 'denied', version: <int 1..1000> }.
 *   - Anything else (extra keys, wrong types, bad id, body over 1 KB, unparseable JSON):
 *     400 { error: 'invalid_input' } (413 for an over-size body), never echoing the input.
 *   - Success: 204, no body. The same id again moves the time forward; a changed choice or
 *     version also moves the old values into `previous` (last 5 kept).
 *
 * Privacy rules for this route:
 *   - It never reads req.ip, request headers, cookies, the user agent or Authorization.
 *   - It logs nothing about the request: not the body, not the id, not the headers.
 *   - It is mounted in app.ts BEFORE the global express.json({ limit: '10mb' }) and parses its
 *     own body with a 1 KB limit. Its own error middleware answers parse and size errors, so they
 *     never reach the global errorHandler (which logs req.ip).
 */
import express, { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';

import {
  CONSENT_HISTORY_LIMIT,
  CONSENT_PURPOSE,
  ConsentChoice,
  ConsentRecord,
  consentExpiry,
} from '../models/Consent.model';

const router = Router();

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const consentBodySchema = z
  .object({
    id: z.string().regex(UUID_V4),
    choice: z.enum(['granted', 'denied']),
    version: z.number().int().min(1).max(1000),
  })
  .strict();

function invalidInput(res: Response, status: 400 | 413 = 400): void {
  res.status(status).json({ error: 'invalid_input' });
}

/**
 * Upserts the record. One atomic update: when the record exists and the choice or the version
 * changed, the old {choice, textVersion, decidedAt} is appended to `previous` (last 5 kept);
 * decidedAt and expiresAt always move forward. Values go in through $literal so nothing in them
 * is read as a field path or operator.
 */
async function recordDecision(
  consentId: string,
  choice: ConsentChoice,
  textVersion: number,
  decidedAt: Date,
): Promise<void> {
  const oldEntryChanged = {
    $and: [
      { $ne: [{ $type: '$choice' }, 'missing'] },
      {
        $or: [
          { $ne: ['$choice', { $literal: choice }] },
          { $ne: ['$textVersion', { $literal: textVersion }] },
        ],
      },
    ],
  };

  await ConsentRecord.updateOne(
    { consentId },
    [
      {
        $set: {
          previous: {
            $cond: [
              oldEntryChanged,
              {
                $slice: [
                  {
                    $concatArrays: [
                      { $ifNull: ['$previous', []] },
                      [
                        {
                          choice: '$choice',
                          textVersion: '$textVersion',
                          decidedAt: '$decidedAt',
                        },
                      ],
                    ],
                  },
                  -CONSENT_HISTORY_LIMIT,
                ],
              },
              { $ifNull: ['$previous', []] },
            ],
          },
        },
      },
      {
        $set: {
          consentId: { $literal: consentId },
          purpose: { $literal: CONSENT_PURPOSE },
          choice: { $literal: choice },
          textVersion: { $literal: textVersion },
          decidedAt: { $literal: decidedAt },
          expiresAt: { $literal: consentExpiry(decidedAt) },
        },
      },
    ],
    { upsert: true },
  );
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}

router.post(
  '/consent',
  express.json({ limit: '1kb', strict: true }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const parsed = consentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      invalidInput(res);
      return;
    }
    const { id, choice, version } = parsed.data;
    // Stored lower-case so the unique index treats one uuid as one record.
    const consentId = id.toLowerCase();

    try {
      try {
        await recordDecision(consentId, choice, version, new Date());
      } catch (err) {
        // Two first decisions for the same new id at once: one upsert inserts, the other hits
        // the unique index. Retrying once applies it as an update.
        if (!isDuplicateKey(err)) throw err;
        await recordDecision(consentId, choice, version, new Date());
      }
      res.status(204).end();
    } catch {
      // Not passed to next(err): the global errorHandler logs req.ip. Nothing is logged here.
      next(new ConsentStoreError());
    }
  },
);

class ConsentStoreError extends Error {
  constructor() {
    super('consent_store_failed');
  }
}

// Route-scoped error middleware. Body-parser errors (bad JSON, over 1 KB, wrong charset or
// encoding) and store failures end here and never reach the global errorHandler.
router.use('/consent', (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (res.headersSent) return;
  if (err instanceof ConsentStoreError) {
    res.status(500).json({ error: 'server_error' });
    return;
  }
  const type = typeof err === 'object' && err !== null ? (err as { type?: unknown }).type : '';
  invalidInput(res, type === 'entity.too.large' ? 413 : 400);
});

export default router;
