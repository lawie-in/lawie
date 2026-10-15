/**
 * T-147e — cost guard. The worst case for one fixture, from the token caps the
 * pipeline already uses (INTAKE_LIMITS and the Drafter's 8192), priced at the
 * rates seeded in AppSetting (`ai.rates.<model>`). Pure.
 */

/** Calls one fixture can make, with their caps. Inputs are generous estimates of prompt size. */
export const WORST_CASE_CALLS = [
  { purpose: 'intake_reception', model: 'intake', input: 4_000, output: 3_000 },
  { purpose: 'intake_extract', model: 'intake', input: 3_000, output: 1_500 },
  { purpose: 'drafter_body', model: 'drafting', input: 9_000, output: 8_192 },
  { purpose: 'drafter_repair', model: 'drafting', input: 15_000, output: 8_192 },
  { purpose: 'fact_repair', model: 'drafting', input: 6_000, output: 8_192 },
] as const;

export interface Rate {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

/** Used when a rate is not seeded: priced as a large model, so the estimate errs high. */
export const FALLBACK_RATE: Rate = { inputUsdPerMTok: 15, outputUsdPerMTok: 75 };

export interface CostEstimate {
  fixtures: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxUsd: number;
  /** A typical run: the body call plus intake, no repair passes. */
  typicalUsd: number;
  ratesAssumed: boolean;
}

export function estimateCost(
  fixtures: number,
  rates: { intake: Rate | null; drafting: Rate | null },
): CostEstimate {
  let inTok = 0;
  let outTok = 0;
  let usd = 0;
  let typical = 0;
  for (const c of WORST_CASE_CALLS) {
    const r = rates[c.model] ?? FALLBACK_RATE;
    const cost = (c.input / 1e6) * r.inputUsdPerMTok + (c.output / 1e6) * r.outputUsdPerMTok;
    inTok += c.input;
    outTok += c.output;
    usd += cost;
    if (c.purpose === 'intake_reception' || c.purpose === 'intake_extract') typical += cost;
    if (c.purpose === 'drafter_body') {
      // A typical body is about a third of its cap.
      typical += (c.input / 1e6) * r.inputUsdPerMTok + (c.output / 3 / 1e6) * r.outputUsdPerMTok;
    }
  }
  return {
    fixtures,
    maxInputTokens: inTok * fixtures,
    maxOutputTokens: outTok * fixtures,
    maxUsd: usd * fixtures,
    typicalUsd: typical * fixtures,
    ratesAssumed: rates.intake === null || rates.drafting === null,
  };
}

export function renderEstimate(e: CostEstimate): string[] {
  return [
    `Cost estimate for ${e.fixtures} fixtures: typical ~$${e.typicalUsd.toFixed(2)}, worst case $${e.maxUsd.toFixed(2)}`,
    `  (worst case ${e.maxInputTokens} input + ${e.maxOutputTokens} output tokens)${e.ratesAssumed ? ' — a rate is not seeded, priced at the fallback rate' : ''}`,
  ];
}

/** Caps per run. The runner refuses more fixtures and stops once the token cap is passed. */
export const RUN_LIMITS = {
  maxFixturesDefault: 30,
  maxFixturesHard: 40,
  maxTokensDefault: 600_000,
} as const;
