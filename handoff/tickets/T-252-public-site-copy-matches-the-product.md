# T-252 — Public site copy says only what the product does

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Meera (copy, signs). Ajay (every claim). Lead (build). Anushka (verdict) |
| Mode           | Small fixes, web. Copy is signed first |
| Status         | To do. Unassigned. Raised by Meera, 12 Oct 2026. Blocks paid marketing at go-live |
| Depends on     | T-238 (pricing page) |

## Problem

Meera's copy review found claims beyond T-238:
- the FAQ's Pro price, plus "court formatting" and "BNS validation";
- the FAQ line "rolling out template by template", which implies Hindi is partly live;
- the about page's court-formatting, section-mapping and "in minutes" lines (check against T-141a's table);
- the footer disclaimer, which isn't Ajay's line;
- `components/landing/PainSolution.tsx` ("in 5 minutes"), which is unused and should be deleted;
- rows 7–14 of `handoff/marketing/copy/pricing.md` and its grep list.

## Acceptance criteria

1. Each line is replaced with Meera's signed text after Ajay's ok, word for word.
2. The footer carries Ajay's disclaimer line.
3. `PainSolution.tsx` is deleted, and nothing imports it.
4. A grep for "court-ready", "validated", "in minutes", "guaranteed" and "AI lawyer" on public pages finds nothing.

## Added: watermark claims are false (Priya, 12 Oct 2026, code check)

No export carries a watermark on any plan (policy test `document-export.test.ts:145-149`), but the copy says otherwise:
- `dashboard/documents/[id]/page.tsx:407-411` shows "Free tier exports include a watermark."
- `(marketing)/pricing/page.tsx:130` says "Lawie watermark on exports"; `:157` and `:184` say "No watermark on exports" (a paid-plan "benefit" that every plan has).
- `(marketing)/faq/page.tsx:53` says "Free exports carry a Lawie watermark."

Remove them all. Copy from Meera, ok from Ajay. The pricing-page lines go in with T-238 if it is still open.

Also dead code: `login/page.tsx:162` writes `lawie_referral_code` to sessionStorage and nothing reads it. Remove it with T-234.

## Ajay's rulings (c9ab6f8)

Blockers on the about page:
- "court" claims;
- "maps IPC/CrPC/IEA to BNS/BNSS/BSA" (we never convert);
- "in minutes".

Also:
- remove the in-app POPULAR badge and "Priority support";
- delete PainSolution.tsx.

No "secure" or "encrypted" claim anywhere, since form answers are not encrypted (T-235).

## Added (shashank, 12 Oct 2026)

The section-converter page says "500+ section mappings validated by a practising advocate" (`page.tsx:130` and the meta in `layout.tsx`). Until Ajay has signed the IPC→BNS recheck (T-267), that claim holds only for the CrPC and IEA tables, because the seed sets `validatedBy`/`validatedAt` for those two and leaves the IPC table null (Ajay's ruling). Ajay gives the replacement words. Change both places.

**URGENT part, moved out and done first (Ajay, 12 Oct 2026):** the converter claim is T-252a. Remove it now, not at T-403: exact strings in `handoff/legal/section-converter-copy-signed.md`. It also drops "auto-conversion" (Lawie never converts) and "Instantly". Mahak does it on her T-235 + T-254A branch (files: `tools/section-converter/page.tsx` and `layout.tsx`). A validation claim may come back only as "Mappings checked against the Gazette text of the Acts", after T-267, and never as "validated by a practising advocate" unless one actually has.
