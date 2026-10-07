# T-133 — Nothing on screen is tied to one state

| Field      | Value                                            |
| ---------- | ------------------------------------------------ |
| Phase      | 1 — Describe and draft                           |
| Owner      | Priya (scope), Vishal (build), Anushka (verdict) |
| Mode       | Small fix, then the quality gate                 |
| Status     | Ready. Not started                               |
| Depends on | T-132 for the verdict                            |
| Branch     | fix/t-133-no-state-specific-ui                   |
| Created    | 2026-10-06                                       |

## Goal

A user from any state sees nothing that assumes Bihar, or any one state, court or police portal.

## Context

- Founder, 6 Oct 2026, 16:58, on the link "Find your FIR on the Bihar police portal" on the describe screen: "Why this line is written at all? Have we made the app just for bihar? I just gave an example that it will be better if we can fetch the FIR data from government portal, but you then hardcoded that."
- Where it is: `apps/web/src/components/intake/DescribeStep.tsx`. It came from T-305 (option B, a help link) through T-103.
- The founder's idea was fetching FIR data from a government portal, for any state. T-305 found no portal that allows it. That finding stands; the link was the wrong answer to it.

## Confirmed by Anushka, run 1 (6 Oct 2026)

- **Major.** The link showed on the first screen for every matter she tried: Dhanbad, Lucknow, a Delhi cheque notice, a Pune rent agreement.
- New from her: the example text in the box is a Patna matter, and the help line "Names, dates, FIR number and court help" shows on non-criminal matters too.

## Founder decision

- No state-specific wording, link or default in the product. A generic answer or none.

## Acceptance criteria

- The Bihar link is gone from the describe screen.
- A search of the web app finds no other text, link, placeholder or default that names one state, court or portal where the user has not chosen it. Anything found is listed in this ticket and removed or made to follow the user's own choice.
- The landing page's sample court heading ("District & Sessions Court, Patna") is looked at under the same rule and the decision is written here.
- Anushka's verdict is PASS.

## Out of scope

- Fetching FIR data from any portal (T-305).

## Built (Vishal, 6 Oct 2026, 23:1x) — PR #49, waiting for Anushka

- Removed: the Bihar police portal link on the describe screen.
- Made generic: the example in the description box (no place name), the hint ("Names, dates, amounts and the court, if there is one, all help."), the login referral example ("LAWIE2026"), the Bar Council placeholder in Settings, and the landing sample heading (decision: "Your district, your court", so no one state is implied).
- Found and left, with the reason:
  - Landing and FAQ, "District and High Courts across Bihar, Jharkhand, UP, and Delhi": a coverage claim. T-141 and T-140.
  - Contact, "Patna, Bihar — [PIN]", and Terms, "courts at Patna, Bihar": company facts and legal terms. Ajay, under T-141.
  - Admin pages ("Jharkhand panel", "Patna bar review"): only the founder sees them.
  - Four rule packs (affidavit_identity, vakalatnama, memo_of_parties, habeas_corpus): help text listing several states as examples. Legal content: Ajay, under T-128.
- Checked: typecheck, lint and format clean; landing and login pages opened in a headless browser.
- Not checked: the describe screen itself (needs sign-in). No web tests exist. Copy not read by Madhuri or Meera.
- The Mac's working copy was switched to `fix/t-133-no-state-specific-ui` for the test. `git checkout develop` goes back.
