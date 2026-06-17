/**
 * Referral code routes — SCRUM-71
 *
 * Admin (founder) routes — gated on role === 'Admin':
 *   POST   /admin/referral-codes          — generate a new code
 *   GET    /admin/referral-codes          — list all codes with stats
 *   PATCH  /admin/referral-codes/:code/disable — disable a code
 *
 * Public route:
 *   GET    /validate-code/:code           — check if a code is valid (no auth required)
 */
import { Router, Request, Response } from 'express';

import { authenticate } from '../middleware/authenticate';
import {
  generateReferralCode,
  listReferralCodes,
  disableReferralCode,
  validateReferralCode,
} from '../services/referral.service';

const router = Router();

// ── Founder auth guard ─────────────────────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: () => void): void {
  // Founder maps to 'Admin' role in the User model enum
  if (req.jwtPayload?.role !== 'Admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// ── POST /admin/referral-codes ────────────────────────────────────────────────

router.post(
  '/admin/referral-codes',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { label, maxUses, bonusInk, expiresAt } = req.body as {
      label?: string;
      maxUses?: number | null;
      bonusInk?: number;
      expiresAt?: string | null;
    };
    const founderId = req.jwtPayload!.sub;

    try {
      const rc = await generateReferralCode(founderId, {
        label,
        maxUses,
        bonusInk,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });
      res.status(201).json({
        code: rc.code,
        label: rc.label,
        isActive: rc.isActive,
        maxUses: rc.maxUses,
        uses: rc.uses,
        bonusInk: rc.bonusInk,
        expiresAt: rc.expiresAt ?? null,
        createdAt: rc.createdAt,
      });
    } catch (err) {
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : 'Failed to generate code' });
    }
  },
);

// ── GET /admin/referral-codes ─────────────────────────────────────────────────

router.get(
  '/admin/referral-codes',
  authenticate,
  requireAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const codes = await listReferralCodes();
    res.json({
      codes: codes.map((rc) => ({
        code: rc.code,
        label: rc.label,
        isActive: rc.isActive,
        maxUses: rc.maxUses,
        uses: rc.uses,
        bonusInk: rc.bonusInk ?? 5,
        expiresAt: rc.expiresAt ?? null,
        createdAt: rc.createdAt,
      })),
    });
  },
);

// ── PATCH /admin/referral-codes/:code/disable ─────────────────────────────────

router.patch(
  '/admin/referral-codes/:code/disable',
  authenticate,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const rc = await disableReferralCode(req.params.code);
    if (!rc) {
      res.status(404).json({ error: 'Referral code not found' });
      return;
    }
    res.json({ code: rc.code, isActive: rc.isActive });
  },
);

// ── GET /validate-code/:code — public ─────────────────────────────────────────

router.get(
  '/validate-code/:code',
  (req: Request, _res: Response, next: () => void) => {
    // Strip conditional request headers so Express never short-circuits to 304.
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
    next();
  },
  async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    const rc = await validateReferralCode(req.params.code);
    if (!rc) {
      res.json({ valid: false });
      return;
    }
    res.json({
      valid: true,
      label: rc.label,
      bonusInk: rc.bonusInk ?? 5,
    });
  },
);

export default router;
