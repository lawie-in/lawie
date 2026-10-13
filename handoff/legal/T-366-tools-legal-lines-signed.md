# T-366: free-tool legal lines (signed)

Signed: Ajay (CLO), 13 Oct 2026 IST.

| AC | Exact text |
|---|---|
| 2, Tools card | `S.115(2) BNS → Bailable · S.478 BNSS`. Bail in a bailable offence is under BNSS 478 (CrPC 436). BNSS 480 (CrPC 437) is for non-bailable offences. |
| 3, 377 IPC note | `Read down in Navtej Singh Johar v. Union of India (2018): it no longer applies to consensual acts between adults. No direct equivalent in BNS.` |

AC1 lines: as already signed (site-copy-t252). No new sign-off is needed.

## Addendum 1 (13 Oct 2026 IST): FAQ free-tier line after T-351

Yes, the line must change: since T-351, email sign-ups get the 5 Ink only after verifying, so the old line overstates it. This replaces the AC1 FAQ line (exact):

`5 Ink on sign-up, once your email is verified (lifetime). All document types, PDF and DOCX export. Criminal drafts use BNS, BNSS and BSA section numbers.`

Google sign-ups count as verified, so the line is true for them too. Any other place that says "5 Ink on sign-up" (pricing, home, settings) gets the same "once your email is verified".

## Addendum 2 (T-366 build questions), 13 Oct 2026

1. **377 Navtej line.** Put it nowhere. The signed T-371 table (deleted from the Bill, "Repealed — no equivalent") is right as it is. Anushka re-tests on develop after deploy, and the T-371 JSON is not re-signed.
2. **FAQ free-tier line.** While civil plaints are off for v1, "All document types" overstates what is available. Replace the T-366 line with exactly: `5 Ink on sign-up, once your email is verified (lifetime). Every document type on Lawie, PDF and DOCX export. Criminal drafts use BNS, BNSS and BSA section numbers.` This holds only if Free is not gated by type (Tanvi checks); if it is gated, drop the middle sentence. The "more than 90" count in marketing-package-signed.md (row 9) must be re-counted against what is switched on before it is used again.
3. **Lines outside the ACs (Tanvi folds them in):**
   - FAQ `:48` becomes exactly: `Lawie has a free tier that includes 5 Ink (lifetime). Paid plans add Ink every month; see the pricing page for current plans.` Pro stays out of copy (T-252 F1).
   - `(marketing)/layout.tsx` meta description becomes exactly: `Legal drafting for Indian advocates. Criminal drafts use BNS, BNSS and BSA section numbers.` (the T-317 line).
   - The Pro plan on the pricing page is a product decision, not a line swap, so it is a separate ticket (Priya/Meera). Until then it must not show a price that T-227 has not made live.

**FAQ :48, revised 13 Oct 2026** (replaces the Addendum 2 text): `Lawie has a free tier that includes 5 Ink (lifetime), once your email is verified. Paid plans add more Ink; see the pricing page for current plans.` "Every month" comes out until T-399 settles yearly plans.
