# T-134 — Ask the user which document, do not guess

| Field      | Value                                                                                   |
| ---------- | --------------------------------------------------------------------------------------- |
| Phase      | 1 — Describe and draft                                                                  |
| Owner      | Priya (scope), Arjun (ADR-021 note), Ajay (the rule), Vishal (build), Anushka (verdict) |
| Mode       | Full chain, then the quality gate                                                       |
| Status     | Needs scoping. Not started                                                              |
| Depends on | T-132 for the verdict                                                                   |
| Branch     | feature/t-134-ask-which-document                                                        |
| Created    | 2026-10-06                                                                              |

## Goal

When a description could mean more than one document, the user is asked. The product never settles it silently.

## Context

- Founder, 6 Oct 2026, 16:58: he asked for a bail application and the flow went to anticipatory bail, "which is drastically wrong". On the fix the team had built: "my team built a custom hardcoded db solution for it. This is how you think we will scale? We have to think about generic solutions. We could have simply asked the user if they want bail application to be written instead of guessing what they need."
- What exists today: the bail guard (T-122), `apps/drafting/src/services/bail-guard.ts`, with lists of cue words in `apps/drafting/src/config/intake/bail-cues.json` in English, Hindi and Hinglish. It covers one pair of documents only, and every new pair would need its own lists.
- Not known: the exact description the founder typed, and why the guard let a single match through. Not looked into yet.

## Confirmed by Anushka, run 1 (6 Oct 2026)

- "Need a bail application for my client Ramesh Oraon." was asked "Which document do you need?", with Regular Bail already selected. "bail application chahiye client Sunita Kumari ke liye, Muzaffarpur" came with Anticipatory Bail already selected. So it asks, but one option is always chosen for the user first.
- A Regular Bail brief accepted the answer "No — anticipating arrest" with no warning.
- "Something else / Not in this list" then asked "When was Sunita Kumari arrested?" though she never said she was.
- Changing a Dhanbad regular bail brief to "Anticipatory Bail Application" gave "We could not find a ready document for this. That happens with less common requests." She had picked it from the product's own list.
- "Need stay from court urgently" for a wall on a client's plot was taken to be a Temporary Injunction Application without asking, then asked for a parent suit number.

## Founder decisions

- Generic, not per-document lists. The answer to "which document?" comes from the user.
- The product exists to make a lawyer's life easy. A short question is better than a wrong guess.

## To scope (Priya, Arjun, Ajay). Anushka is not part of this.

- When is the user asked: always shown the document before any question with a one-tap change, or only when more than one document fits.
- What happens to the bail cue lists and to the conditions Ajay signed on them (T-127, section 5).
- A note on ADR-021, section 3.3, rule 5.

## Acceptance criteria (draft, Priya to confirm)

- "I need a bail application" with nothing else never lands on anticipatory bail, or on regular bail, without the user choosing.
- The same holds for any other pair of documents a description can mean. No per-pair word list is needed to make it hold.
- The user can change the document at any step before the draft without losing what they typed.
- Anushka's verdict is PASS.
