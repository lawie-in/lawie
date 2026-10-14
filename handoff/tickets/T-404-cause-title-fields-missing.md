# T-404 — Cause-title fields with no question in the form

| Field  | Value                                                                        |
| ------ | ---------------------------------------------------------------------------- |
| Phase  | 4 — Polish and release                                                       |
| Owner  | Ajay (what each title needs), Rajesh/Meera (questions), then a drafting lead |
| Mode   | Full chain                                                                   |
| Status | Part 1 merged 680b41c; part 2 merged 1e58ce0. Waiting for Anushka on develop. Shashank, 14 Oct 2026 |
| Source | T-395 developer report                                                       |

## Problem

Some cause-title tokens have no source in the form at all, so they always print a blank:

- the `legal_notice_*` cause titles: applicant, respondent and addresses. Most aren't covered by t146;
- slp `hc_case_no` and `hc_name`;
- `respondents_list` in pil, habeas and rera;
- vakalatnama `opposingParty`.

## Acceptance criteria

1. Ajay says, per pack, whether each field is asked for, taken from an existing answer, or left as a signed "[To be confirmed: …]".
2. Rajesh/Meera word any new question; a lead builds it.
3. The legal_notice_s138 cause title is done first, coordinated with Shashank's T-363, which holds that pack now.

## Build notes (Rajesh and Meera, 13 Oct 2026; wording in handoff/marketing/copy/cause-title-questions-t404.md)

- QuestionsStep shows a help-text line under each label (13px, muted, aria-describedby) and passes the placeholder through.
- An "Optional" tag on the vakalatnama opposite-party field only.
- "Required" means always asked and never guessed. "Not known" is allowed and prints Ajay's signed blank. It doesn't block Continue (Priya; Ajay can overrule).
- respondents_list is sent as a list. Order: client, addressee, address; respondents; opposite party last (after case_title for vakalatnama).
- Not v1: the eviction, defamation and RERA questions.

## Plan (Priya, 13 Oct 2026)

- Part 1: the s.138 slice and Ajay's signed advocate and court blanks. template-engine.service.ts waits for Kunal's T-395 to merge.
- Part 2: the other packs, the web question screen, and T-400's party-name aliases (folded in). briefTypes.ts goes after Vishal's T-373, and ValueInput.tsx before Kunal's T-384.
- Mahak's T-385 allowlist (publicTemplateConfig) must keep `help` and `placeholder` on form fields.
- Shashank sends his open questions straight to Ajay.

## For part 2 (T-404 part 1 reviewer, 13 Oct)

With no court, the ledger path hands the Drafter "[To be confirmed: court]" instead of its own "{{MISSING: court}}". The fix is in apps/drafting/src/services/ai.service.ts :1081/:1114. That's legal content, so Ajay signs it. ai.service.ts goes Vishal (T-373), then Tanvi (T-410), then whoever takes this. Priya sequences it.

## For part 2 (Ajay, 13 Oct)

An optional "Place of execution" question, with the help text "City or town where the document will be signed.", on 11 deeds: affidavit_identity, gift_deed, joint_development_agreement, lease_deed, license_agreement, mortgage_deed, mou, partition_deed, release_deed, sale_deed and will.

## Part 1 after merging in T-406 (Shashank, 13 Oct)

Not-court packs get no case-line blank, since T-406 wins. Deeds never take a court city as their place (49b5fd2; Ajay signed the golden batch ff33740, 36 verification_text lines). s.138 fixtures 19–21 are folded in. A fresh tester and reviewer are running.
