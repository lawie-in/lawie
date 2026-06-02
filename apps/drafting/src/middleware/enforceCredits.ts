/**
 * enforceCredits — credit-aware tier gate (SCRUM-73 / SCRUM-59).
 *
 * Replaces the binary free-tier check that enforceFreeLimit used to do.
 * The free-tier-monthly-N counter is still here as a SAFETY NET (only for
 * accounts on planTier='free' AND with zero credit balance — prevents a user
 * with all 0 buckets from somehow drafting endlessly if the deduct call is
 * skipped). The primary tier gate is `spendCredits` called from the route
 * handler itself.
 *
 * This middleware does NOT deduct — it just blocks before the AI streams if
 * the user can't afford the cost. The actual spend happens in the route AFTER
 * a successful generation. Why this order?
 *   • Pre-check stops obvious "I'm broke" cases without burning Anthropic spend
 *   • Post-deduct means a failed AI stream doesn't take credits (consistent
 *     with refund-on-failure intent — costlier streams are the AI's problem,
 *     not the user's)
 *
 * Returns 402 Payment Required with { needsTopUp, needsUpgrade, balance, cost }
 * so the frontend can decide whether to show the paywall modal or the upgrade
 * card.
 */
import { Request, Response, NextFunction } from 'express';

import { costForTemplate, getCreditBalance } from '../services/credits.service';

// Belt-and-braces ceiling for free-plan accounts. Once we trust the credit
// system end-to-end this can be lifted; for now it's a "won't accidentally
// give away the farm" guard.
export const FREE_TIER_SAFETY_MAX_MONTHLY = 25;

export async function enforceCredits(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const payload = req.jwtPayload;
  if (!payload) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  // Resolve template id + cost from the request body (every drafting route
  // either passes template_id or implicitly uses a fixed legacy template).
  const body = req.body as { template_id?: string; docType?: string };
  const templateId = body.template_id ?? body.docType ?? 'unknown';
  const cost = costForTemplate(templateId);

  const balance = await getCreditBalance(payload.sub);

  if (balance.total >= cost) {
    // Stash the cost so the route handler can pass it to spendCredits without
    // recomputing — and so the SSE done event can echo it.
    (req as Request & { creditCost?: number }).creditCost = cost;
    next();
    return;
  }

  // Out of credits. Tell the frontend whether to suggest top-up or upgrade.
  const upgradeUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/pricing`;
  res.status(402).json({
    error: 'Insufficient credits',
    message: `This draft costs ${cost} credit${cost > 1 ? 's' : ''} — you have ${balance.total}.`,
    cost,
    balance,
    needsTopUp: true,
    needsUpgrade: balance.planTier === 'free',
    upgradeUrl,
  });
}
