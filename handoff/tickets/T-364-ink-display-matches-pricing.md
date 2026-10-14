# T-364 — Ink cost and plan shown in the app match the pricing page

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web + billing read) |
| Mode   | Small fix |
| Status | Narrowed by Arjun 14 Oct: AC1, AC2, AC4 done (T-372, T-388, T-370). Left: AC3, one plan price source in packages/shared. Full chain. Next free lead AFTER Kunal's T-436 part (a) merges and releases packages/shared. Priya |
| Source | Anushka run 3 FAIL, 13 Oct 2026 (handoff/quality/2026-10-13-run-3-develop-FAIL.md). Failed entries: T-227, T-238 |

## Acceptance criteria

1. The Ink cost of the draft shows before "Confirm brief and continue".
2. Dashboard and settings show the Ink balance, not "8 of 5 documents used — 0 remaining".
3. Settings offers the plans exactly as the pricing page shows them (Pro ₹1,999 for 150 Ink, …). No "₹799 Unlimited". One source of plan data for both pages.
4. Tests for 2 and 3.

Anushka's reproduce steps are in the run 3 report; use them as the test cases. Anushka re-tests on develop after merge.

## ADR-025

**Arjun, ADR-025 (13 Oct):** the display half (counter, Confirm cost, balance) moves to T-372; the settings plan fix moves to T-370. Hold the rest until T-371/T-372 land (ADR-025 D3 later).

## Arjun (14 Oct, 23:00 UTC) — what T-364 still needs

Checked on origin/develop_staging. AC1 (cost before Confirm) → T-372 AC2 + T-388, merged. AC2 (balance, not "8 of 5") → T-372 AC1/AC3, merged. AC4 → tests in both. **AC3 is only half done:** settings reads billing `GET /plans` (T-370, merged), but the marketing pricing page (`app/(marketing)/pricing/page.tsx` l.49–54), the landing page (`app/(marketing)/page.tsx` l.81–82), `PaywallModal.tsx` l.123 and the pricing `layout.tsx` meta still hard-code ₹799 / ₹1,999 / ₹7,990 / ₹19,990 and "50 Ink". "One source of plan data for both pages" is not met.

**Ruling — T-364 stays open, narrowed to AC3-remainder, not closed:** move the plan price table (`priceInr`, cycle, Ink) from `apps/billing/src/config/credit-skus.ts` into `packages/shared` next to `INK_PER_CYCLE` (one object, `PLANS`); billing's SKUs import it; the web marketing pages, `PaywallModal` and the pricing meta import it at build time (marketing pages stay static for SEO — no runtime fetch there); settings keeps `GET /plans`, which billing serves from the same object. Test: the pricing page renders exactly the numbers `GET /plans` returns, for all four SKUs. Full chain (packages/shared + billing + web). Claim: `packages/shared/src/constants/ink.ts` (or a new `plans.ts`), `credit-skus.ts`, the four web files.

Release note: Anushka's FAIL was on `develop`; T-370/T-372 are on `develop_staging` only, so her re-test needs the founder's next `develop_staging → develop` merge first.
