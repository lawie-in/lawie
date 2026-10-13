# T-404 — Cause-title fields with no question in the form

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Ajay (what each title needs), Rajesh/Meera (questions), then a drafting lead |
| Mode   | Full chain |
| Status | Labels signed by Ajay (13 Oct 2026; keys applicant_name, respondent_name, respondent_address; habeas label same as PIL). Shashank after T-363 (he holds legal_notice_s138). s.138 cause title first |
| Source | T-395 developer report |

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
