# Gaps before go-to-market

| Field   | Value                                                                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Written | 5 Oct 2026, by Priya, from this week's war-room sessions, the tickets, and the end-to-end check                                                           |
| Status  | List only. No priorities are decided. The founder decides what blocks launch                                                                              |
| Marks   | **Checked** = seen in the code or the running app on 4 or 5 Oct 2026. **Noted earlier** = recorded in a ticket or ADR on 3 or 4 Oct and not checked again |

Count: 27 gaps. 12 in group A, 9 in group B, 6 in group C.

## A. A user would hit it, or it is a legal or data risk

| #   | Gap                                                                                                                                                                                                                                                     | Ticket         | Basis                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------- |
| A1  | **Only 6 of 92 templates have a working input form.** The other 86 open with no fields. In describe-first the review screen is empty and Generate is enabled. The gallery reads the same config, so it is probably empty there too; that is not checked | T-120, on hold | Checked                                  |
| A2  | **A date lands in the wrong field.** The arrest date is filled in as the FIR Date and shown as ready                                                                                                                                                    | T-119          | Checked, 3 runs                          |
| A3  | **The wrong document can be picked.** An arrested person's bail request was taken to anticipatory bail (founder). The match differs from run to run                                                                                                     | T-122          | Founder saw it. Not reproduced in 2 runs |
| A4  | **Answers are lost on going back** to edit the description, from the follow-up screen and from the review screen                                                                                                                                        | T-121          | Checked in the code                      |
| A5  | **The user is not told which document was picked** until the review screen, after up to 10 questions                                                                                                                                                    | T-122          | Checked                                  |
| A6  | **Generating a draft is untested on the new build.** Step 7 of the end-to-end check was blocked. No draft has been generated through describe-first                                                                                                     | None           | Checked                                  |
| A7  | **"No template fits" is a dead end.** The decided guided draft (Reception, brief, Drafter) is not built. No code for it exists                                                                                                                          | T-105, T-106   | Checked                                  |
| A8  | **The database has no backup, and data has already been lost once.** Courts, sections, users and settings went missing during the pause. Courts, sections and templates can be reseeded from the repo. Settings and accounts cannot                     | None           | Checked                                  |
| A9  | **Draft text still goes through Helicone**, to an account nobody on the team can see. The key is still set in the development and production env files. The privacy policy does not list Helicone                                                       | T-118          | Checked (env files). Server not checked  |
| A10 | **Case details are saved unencrypted** while the privacy policy says they are encrypted. Deleted documents are only flagged, never removed                                                                                                              | T-115          | Noted earlier                            |
| A11 | **The shared internal secret was in git.** The script is fixed. Whether production has a new secret is not confirmed                                                                                                                                    | T-117          | Script checked. Production not checked   |
| A12 | **The production "coming soon" page is not in the repo.** `main` and `develop` do not contain it, so the next deploy removes it. `main` is 38 commits behind `develop` (last updated 16 June 2026)                                                      | None           | Checked                                  |

## B. Money, settings and operations

| #   | Gap                                                                                                                                                                                                                                                  | Ticket         | Basis         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------- |
| B1  | **Pricing is not checked against real cost.** 0 drafts collected. The drops formula rests on estimates                                                                                                                                               | T-004          | Checked       |
| B2  | **Drops are not built.** Ledger, per-paragraph charge, estimate screen, pricing copy and terms                                                                                                                                                       | T-201 to T-204 | Checked       |
| B3  | **Bonus Ink goes to a bucket that is never spent**, while the low-balance dialog promises it                                                                                                                                                         | In ADR-020     | Noted earlier |
| B4  | **The daily spend cap only writes a log line.** It never stops a draft                                                                                                                                                                               | None           | Checked       |
| B5  | **Model settings are test values.** Drafting model is Haiku, the decision is Sonnet. The Haiku rate is marked placeholder. `finance.usd_inr` is 87, the decision is 96.5. `ai.preflight_model` is not set, so the preflight check runs on rules only | T-004          | Checked       |
| B6  | **Settings cannot be created from the admin page**, and no seed sets them. A new or restored database starts without `ai.intake_model` and `feature.describe_first`                                                                                  | None           | Checked       |
| B7  | **Local development runs with production values.** `.env.development` held the production callback and front-end address, and shares the production internal secret. Local sign-in landed on lawie.in until 5 Oct                                    | Part of T-117  | Checked       |
| B8  | **The web app has no tests and is not in CI.** Every web change is checked by hand                                                                                                                                                                   | None           | Noted earlier |
| B9  | **Deploys are manual**, by a script that copies the env file from a laptop                                                                                                                                                                           | None           | Noted earlier |

## C. Smaller, or waiting on someone

| #   | Gap                                                                                                                                                    | Ticket             | Basis                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------------------- |
| C1  | Policy and terms wording must be read by a practising lawyer before it is published                                                                    | T-302, T-204       | Noted earlier           |
| C2  | "Review by agent" must say it is an AI agent                                                                                                           | T-109, condition 1 | Open                    |
| C3  | The dev lead's gate refuses the T-109 design because it is not a Figma link                                                                            | T-109, condition 2 | Open, needs the founder |
| C4  | Narrow screens: a true 360 px width has not been tested. The follow-up and review screens were checked at desktop width only                           | None               | Checked                 |
| C5  | Keyboard: six hidden Section finder buttons take focus first. Escape does not close the State dropdown                                                 | None               | Checked                 |
| C6  | The stored demand label can contain a person's name. Court signals in the match prompt are English only. The list of legal-content files is incomplete | T-105 notes, T-116 | Noted earlier           |

## Not defects: decided for v1 and not built yet

- Image and PDF upload as matter context (T-301, T-304), and the Hindi and handwritten FIR spike (T-303).
- Paid review by agent and paid revision (T-111, T-205), and their prices (T-108).
- Intake test set of 150 descriptions and the switch-on gate (T-113).
- Advocate test round and the v1 release (T-402, T-403).

## Decision that changes this list

ADR-021 was approved by the founder on 5 Oct 2026: keep the legal rules of each document, drop the per-document input forms, one flow for every document. What it does to group A:

| Gap                                  | Now handled by                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| A1, no working form on 86 documents  | Goes away when the forms are removed (T-125). Until then describe-first stays off |
| A2, date in the wrong field          | T-105: a date is kept only with what it is the date of                            |
| A3, wrong kind of bail               | T-122: the bail guard. Still needed                                               |
| A4, answers lost on going back       | T-105 and T-125: one brief holds everything typed                                 |
| A5, document not named until late    | T-125: the kind of document is at the top of the brief                            |
| A6, generating untested              | The new end-to-end check in T-125                                                 |
| A7, "no template fits" is a dead end | T-105 and T-106: the same flow, delivered as a starting draft                     |

A8 to A12 and groups B and C are not changed by this decision.
