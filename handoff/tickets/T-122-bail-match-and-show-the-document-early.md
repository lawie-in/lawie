# T-122 — Match the right bail application, and show the matched document early

| Field      | Value                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase      | 1 — Describe-first intake                                                                                                                                  |
| Owner      | Vishal. Ajay writes the rule and signs. Rajesh confirms the follow-up screen change                                                                        |
| Mode       | Full chain                                                                                                                                                 |
| Status     | Step 2 is merged (PR #39, 6 Oct 2026, 09:58 IST). Still open: step 1 and the 20 runs against the model. Both need the founder's Mac. Step 3 moved to T-125 |
| Depends on | None. The gate in T-113 uses the test descriptions written here                                                                                            |
| Branch     | fix/t-122-bail-match                                                                                                                                       |
| Created    | 2026-10-05                                                                                                                                                 |

## Goal

A person who has been arrested is never taken to an anticipatory bail application, and the user sees which document was picked before answering questions.

## Context

- Finding 4, reported by the founder on 5 Oct 2026, `handoff/manual-checks/T-103-T-104-e2e-result.md`.
- Founder's text: "My brother was arrested by Sadar Thana Police on 25th August 2026 from lajpat market. This is a false accusation on him and I want to write bail application for him". The founder was taken to the Anticipatory Bail Application.
- The test agent ran the same text twice and got Regular Bail Application both times. The match is one model call on Haiku, so the answer can differ from run to run.
- Ajay: regular bail is for a person who has been arrested or is in custody. Anticipatory bail is for a person who expects arrest and has not been arrested. Mixing them up is a legal error.
- The follow-up screen does not name the matched document. The user answers up to 10 questions before the review screen shows it.
- Not known yet: whether the founder saw "Anticipatory Bail" as the review title, or as the first choice on "Which document do you need?".

## Acceptance criteria

**Step 1, find what happened**

- Find the founder's intake calls of 5 Oct 2026, about 02:20 to 02:30 IST, and write here what the match returned each time: template, confidence and alternatives. No description text is stored, so use the stored result fields only. If they are not enough to tell, say so.

**Step 2, the rule (server, after the match call)**

- Ajay supplies two cue lists in English, Hindi and Hinglish: "already arrested or in custody" (for example arrested, in custody, in jail, giraftar, hirasat) and "expects arrest" (for example apprehends arrest, may be arrested, has not been arrested).
- When the description has an "already arrested" cue, `bail_anticipatory` is never returned as the single match. The result is Regular Bail, or the choice screen with Regular Bail first.
- When the description has an "expects arrest" cue and no "already arrested" cue, `bail_regular` is never returned as the single match.
- When both kinds of cue are present, the user is asked to choose. The service never picks.
- The match prompt states the difference between the two in plain words. Ajay reads the final text.

**Step 3, show the document early**

- The follow-up screen names the matched document and has "Not this document?", the same as the review screen.

**Step 4, proof**

- The founder's sentence run 20 times in dev returns Regular Bail, or the choice screen with Regular Bail first, 20 times out of 20. Cost: about 20 Haiku calls.
- The T-113 test set gets at least 10 descriptions for each kind of bail, including the founder's sentence and Hindi and Hinglish ones. The gate fails on any swap between the two.
- Tests cover the three rule cases above without a model call.

## In scope

- `apps/drafting/src/services/intake.service.ts`
- `apps/drafting/src/services/intake.prompts.ts` (legal content)
- `apps/web/src/components/intake/FollowUpStep.tsx`
- The T-113 test set

## Out of scope

- Other pairs of documents that are easy to mix up. Ajay lists them for a later ticket once the T-113 set shows which ones matter.
- The guided draft (T-105)

## References

- Design: T-109 screen 03a (document name with "Not this document?"). Rajesh confirms it can be reused on the follow-up screen
- ADR: `docs/adr/ADR-019-intake-and-routing.md`, sections 3.4 and 4.2
- Legal sign-off: Needed from Ajay before merge. He writes the cue lists and reads the final prompt text

## Delivery report (Vishal, 6 Oct 2026)

Pull request: https://github.com/lawie-in/lawie/pull/39 (branch `fix/t-122-bail-match`, one commit, `727aa1c`).

| Step                                      | Result                                                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Find what the founder's run returned   | Not done. It needs the database                                                                                                                                  |
| 2. The rule, in code after the match call | Built, with Ajay's cue lists and prompt line from T-127                                                                                                          |
| 3. Show the document early                | Moved to T-125                                                                                                                                                   |
| 4. Proof                                  | Partly. Tests cover the three rule cases with no model call. 24 bail descriptions are written for the T-113 set. The 20 runs against the real model are not done |

**Different from the ticket**

- The guard always returns the choice screen. It never switches to Regular Bail by itself. A cue can belong to another person or another case, so Ajay ruled that code must not pick (T-127, section 5.1).
- The guard is its own file, `apps/drafting/src/services/bail-guard.ts`, so it can be tested with no database.

**Run**

- Type check, a full build and lint: clean.
- 65 new tests pass, including every description in the bail set with the match call answering wrongly.

**Not run**

- The two new tests through `POST /intake`, and the other suites that need an in-memory MongoDB. CI on PR #39 runs them.
- Any model call. The offline test shows what the user gets whichever document the model names. It does not show what the model answers.
