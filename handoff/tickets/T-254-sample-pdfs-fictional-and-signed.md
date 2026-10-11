# T-254 — Sample PDFs: pull them now, regenerate with fictional values, Ajay signs

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build). Ajay (signs each sample). Anushka (verdict) |
| Mode           | Part A: small fix (web copy only), now. Part B: after T-241, T-245a/b and T-251 |
| Status         | Part A queued for mahak with T-235 (same web area). Part B waits for the criminal packs. Raised by Ajay, 12 Oct 2026 (handoff/legal/marketing-package-signed.md §H, 0eedb37) |

## Problem

The home page (`apps/web` page.tsx, lines ~70–96) links four AI-generated sample PDFs stored in MongoDB:
- bail application;
- s.138 notice;
- rent agreement;
- consumer complaint.

Ajay can't sign them, for these reasons:
- **Real-looking values:** "Adv. Ravi Shankar Singh", enrolment J/845/2012, a Patna chamber address and FIR 42/2025 could match a real advocate.
- **Consumer sample:** it claims "within the limitation prescribed under Section 69", which is a banned assertion.
- **Age:** the stored text may predate T-136 and T-148 (case law, "first application").

## Acceptance criteria

**Part A (now):**
1. Remove the four sample links from the home page. Copy only; the routes stay.
2. Nothing else on public pages links `/api/samples/*`.

**Part B (after the criminal packs):**

3. Regenerate the samples with obviously fictional values (e.g. "Adv. A. Sample", "Enrolment XX/0000/0000", "Sample Police Station"). Every page carries a visible "Sample, fictional matter".
4. Run `seed:sample-pdfs` on a non-production database only. Give Ajay the four texts; he signs each one.
5. The rent and consumer samples can go before the criminal gates. The bail and s.138 samples wait for T-241, T-245a/b and T-251.
6. Restore the links only after Ajay signs. Marketing uses no sample until then.
