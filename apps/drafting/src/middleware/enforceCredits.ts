/**
 * enforceCredits — credit-aware tier gate (SCRUM-73 / SCRUM-59).
 *
 * Replaces the binary free-tier check that enforceFreeLimit used to do.
 * The free-tier-monthly-N counter is still here as a SAFETY NET (only for
 * accounts on planTier='free' AND with zero credit balance — prevents a user
 * with all 0 buckets from somehow drafting endlessly if the deduct call is
 * skipped). The live gate checks Ink units: the route debits through
 * credits.service `holdInk` / `settleInk` (`releaseInk` on failure).
 * `spendCredits` is a legacy credits path with no callers.
 *
 * This middleware does NOT deduct — it is a quick early 402 that stops
 * obvious "out of Ink" cases without burning Anthropic spend. It is not
 * trusted for correctness (T-226): two requests can both pass it. The route
 * then HOLDS the cost atomically (credits.service `holdInk`, via
 * `withInkHold` in documents.routes) before any model call, and refuses with
 * the same 402 body (`insufficientInkBody`) if the hold fails. After the run
 * the hold is settled (kept) when the draft reached the user, and released
 * (refunded) on every other ending, so a failed AI stream takes no Ink.
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

import {
  CreditBalance,
  DraftQuote,
  costForTemplate,
  getCreditBalance,
  paragraphFactsFor,
  quoteDraft,
} from '../services/credits.service';
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
  return gate(req, res, next, false);
}

/**
 * T-577: enforceCredits for generate-from-brief. The price comes from
 * quoteDraft (the one quote function) with the body's `paragraphs` and the
 * brief values as facts. The early balance check stays at the pack's class
 * price (its lowest band, today's enforceCredits figure; Arjun's amended
 * ruling 4); the exact check is the hold of the route's quote, whose 402 has
 * the same body. This gate's 402 carries the quoted figure (cost, message).
 * For a pack that does not ask the quote is costForTemplate, so this behaves
 * exactly as enforceCredits. The route re-quotes after the ledger load; that
 * quote is what is held.
 * The form path (generate-from-template) keeps enforceCredits.
 */
export async function enforceCreditsForBrief(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  return gate(req, res, next, true);
}

async function gate(
  req: Request,
  res: Response,
  next: NextFunction,
  quoteParagraphs: boolean,
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

  // T-577: on the brief route the price is quoteDraft's. For a pack that
  // does not ask it equals `cost` above (costForTemplate), so nothing changes.
  // The pre-check stays at the class price (`needed`); the hold does the exact check.
  const needed = cost;
  if (quoteParagraphs && templateId !== undefined) {
    const b = req.body as { paragraphs?: unknown; values?: unknown };
    const paragraphs =
      typeof b.paragraphs === 'number' && Number.isInteger(b.paragraphs) ? b.paragraphs : undefined;
    let quote: DraftQuote | undefined;
    try {
      quote = await quoteDraft(templateId, { paragraphs, facts: paragraphFactsFor(b.values) });
    } catch (err) {
      // quoteDraft reads settings defensively; a throw here is a bug. Today's price stands.
      console.error(
        '[drafting] enforceCredits: quote failed; class price used:',
        err instanceof Error ? err.name : 'unknown',
      );
    }
    if (quote) cost = quote.ink;
  }

  // T-147e: the golden-set user has no balance and is never charged
  // (spendInk skips it too). No balance is read for it.
  if (isFixtureUser(payload.sub)) {
    (req as Request & { creditCost?: number }).creditCost = cost;
    next();
    return;
  }

  const balance = await getCreditBalance(payload.sub);

  if (balance.totalInk >= needed) {
    // Stash the cost so the route handler can hold it (withInkHold → holdInk)
    // without recomputing — and so the SSE done event can echo it.
    (req as Request & { creditCost?: number }).creditCost = cost;
    next();
    return;
  }

  res.status(402).json(insufficientInkBody(cost, balance));
}

/**
 * The 402 body for "not enough Ink". T-226: the one body for both refusals —
 * this middleware's early check and the route's failed hold — so the web sees
 * the same message either way. Pass a fresh `getCreditBalance` read. Tells
 * the frontend whether to suggest top-up or upgrade.
 */
export function insufficientInkBody(
  cost: number,
  balance: CreditBalance,
): {
  error: 'Insufficient Ink';
  message: string;
  cost: number;
  balance: CreditBalance;
  needsTopUp: true;
  needsUpgrade: boolean;
  upgradeUrl: string;
} {
  const upgradeUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/pricing`;
  return {
    error: 'Insufficient Ink',
    message: `This draft costs ${cost} Ink — you have ${balance.totalInk}.`,
    cost,
    balance,
    needsTopUp: true,
    needsUpgrade: balance.planTier === 'free',
    upgradeUrl,
  };
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
