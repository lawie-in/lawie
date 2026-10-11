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
 *
 * T-227 (Vikram 12 Oct 2026): an id with no price in the one price list
 * (credits.service) is refused with 400 before any balance read, spend or LLM
 * call, and reported to Sentry. It is never charged a default.
 */
import * as Sentry from '@sentry/node';
import { Request, Response, NextFunction } from 'express';

import { costForTemplate, getCreditBalance } from '../services/credits.service';
import { isFixtureUser } from '../services/run-origin';

// Belt-and-braces ceiling for free-plan accounts. Once we trust the credit
// system end-to-end this can be lifted; for now it's a "won't accidentally
// give away the farm" guard.
export const FREE_TIER_SAFETY_MAX_MONTHLY = 25;

/** The only values the Sentry `templateId` tag can take when an id is refused. */
const REFUSAL_TAGS = ['(missing)', '(malformed)', '(unlisted)', '(conflict)'] as const;

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
  const body = (req.body ?? {}) as { template_id?: unknown; docType?: unknown };
  const rawId = body.template_id ?? body.docType;
  const templateId = typeof rawId === 'string' ? rawId : undefined;

  // T-227: a body carrying both ids must agree. The legacy route drafts
  // `docType` while the gate would price `template_id`, so a mismatch could
  // buy a long draft at a short draft's price.
  const hasTemplateId = body.template_id !== undefined && body.template_id !== null;
  const hasDocType = body.docType !== undefined && body.docType !== null;
  const conflict = hasTemplateId && hasDocType && body.template_id !== body.docType;

  let refusal: (typeof REFUSAL_TAGS)[number] | undefined;
  let cost: number | undefined;
  if (conflict) {
    refusal = '(conflict)';
  } else if (templateId === undefined) {
    refusal = '(missing)';
  } else if (!/^[a-z0-9_]{1,100}$/.test(templateId)) {
    refusal = '(malformed)';
  } else {
    cost = costForTemplate(templateId);
    if (cost === undefined) refusal = '(unlisted)';
  }

  if (refusal !== undefined || cost === undefined) {
    // The tag is one of a fixed set; the submitted id itself never goes to
    // Sentry (it is user-controlled text).
    Sentry.captureMessage('enforceCredits: document id has no price', {
      level: 'warning',
      tags: { feature: 'pricing', templateId: refusal ?? '(unlisted)' },
    });
    res.status(400).json({ error: 'Unknown document type' });
    return;
  }

  // T-147e: the golden-set user has no balance and is never charged
  // (spendInk skips it too). No balance is read for it.
  if (isFixtureUser(payload.sub)) {
    (req as Request & { creditCost?: number }).creditCost = cost;
    next();
    return;
  }

  const balance = await getCreditBalance(payload.sub);

  if (balance.totalInk >= cost) {
    // Stash the cost so the route handler can pass it to spendInk without
    // recomputing — and so the SSE done event can echo it.
    (req as Request & { creditCost?: number }).creditCost = cost;
    next();
    return;
  }

  // Out of Ink. Tell the frontend whether to suggest top-up or upgrade.
  const upgradeUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/pricing`;
  res.status(402).json({
    error: 'Insufficient Ink',
    message: `This draft costs ${cost} Ink — you have ${balance.totalInk}.`,
    cost,
    balance,
    needsTopUp: true,
    needsUpgrade: balance.planTier === 'free',
    upgradeUrl,
  });
}

/**
 * The Ink price enforceCredits stashed on the request, for the charge after a
 * successful draft. T-227: there is no fallback price. If it is missing, a
 * route was wired without enforceCredits; this throws instead of charging a
 * default.
 */
export function chargedCost(req: Request): number {
  const cost = (req as Request & { creditCost?: unknown }).creditCost;
  if (typeof cost !== 'number') {
    throw new Error('chargedCost: no price on the request (enforceCredits did not run)');
  }
  return cost;
}
