# End-to-end check result: describe-first (T-103, T-104)

| Field  | Value                                                                                                                                         |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Run    | 5 Oct 2026, 01:20 to 01:40 IST, by the browser test agent in Chrome                                                                           |
| Build  | `develop` at `a48f5f9` (PRs #35, #36, #37 merged), running on `localhost:3000` and `localhost:4000`                                           |
| Plan   | `handoff/manual-checks/T-103-T-104-e2e-plan.md`                                                                                               |
| User   | One Google account. Step 1 ran before the flag was set for it, steps 2 to 11 after                                                            |
| Result | 8 steps pass, 2 steps pass with a finding that must be fixed, 1 step blocked. Two more findings came from the founder after the run (3 and 4) |

## Results

| #   | Step                              | Result        | Note                                                                                                                                                                     |
| --- | --------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Flag off                          | Pass          | Gallery shows, no describe box. `GET /documents/intake/enabled` returned `false`                                                                                         |
| 2   | Describe screen                   | Pass          | Heading, one text box, Continue, Browse templates, FIR link (`target="_blank"`). No mode, route or confidence on screen                                                  |
| 3   | Keyboard only                     | Pass          | Visible focus ring on every control, order is text box, FIR link, Continue. Enter and Space both submit. See observation A                                               |
| 4   | Matched, with follow-up questions | Pass          | "Reading your description…", then questions inline in 2 rounds of 5, with "Fill in the details myself" and Continue                                                      |
| 5   | Review screen                     | **Finding 1** | Title, "Not this document?", names, age, FIR number, missing-field highlight, disabled Generate and editing all correct. The FIR Date is wrong                           |
| 6   | Not this document?                | Pass          | Opens the gallery. Picking regular bail again brings back every value, including one edited by hand                                                                      |
| 7   | Generate                          | **Blocked**   | State, Court Type and Court Name cannot be chosen. See blocker                                                                                                           |
| 8   | Which document?                   | **Finding 2** | Two choices plus "None of these". "None of these" leads to the no-match screen. The chosen template opens a review screen with no fields                                 |
| 9   | No match                          | Pass          | "We could not find a ready document for this", with Browse templates. No "no match" or "guided" wording                                                                  |
| 10  | Edit the description              | Pass          | Back on the describe screen with the text kept                                                                                                                           |
| 11  | Errors                            | Pass          | Under 20 characters: "A little more, please: at least 20 characters." and Continue is disabled. The 11th describe in 10 minutes is refused (HTTP 429). See observation B |

## Blocker for step 7

- `GET /api/courts/states` returns `{"states":[]}`. The courts collection is empty in the database the local stack uses.
- So State has "No results", Court Type has no options, and Generate document stays disabled. No draft was generated and no Ink was spent.
- Fix: seed the courts data (`yarn workspace @lawie/drafting seed:courts`), then re-run step 7 only.

## Finding 1: the arrest date is filled in as the FIR Date (step 5)

- Text entered: "…was arrested on 15/03/2026 in FIR No. 124/2026 at Kotwali police station…".
- Review screen: FIR Date = 15/03/2026, marked ready. "In custody since" = 15/03/2026, which is right.
- The description gives no FIR date. Rule 4.1.1 of ADR-019 says a value is filled only when the description states it.
- The date does appear in the quote, so the server check passes. The check cannot tell which date field the date belongs to.
- For Ajay and Vishal. A wrong FIR date in a bail application is a filing error the advocate may not notice, because the field looks complete.

## Finding 2: most templates open a review screen with nothing in it (step 8)

- Text entered: "Need a notice for my client about money he is owed by a company." Chosen: Legal Notice — Breach of Contract.
- Review screen: "0 needs input, 0 to confirm, 0 ready", one empty group, and **Generate document is enabled**. Generate was not clicked.
- Cause: the review screen reads `form_schema.steps[].fields`. Only 6 of the 92 template configs have that shape with fields: `bail_anticipatory`, `bail_regular`, `consumer_complaint`, `legal_notice_s138`, `legal_notice_s80`, `rent_agreement`. 76 use a grouped shape (for example `sender`, `recipient`, `contract`) and 10 use a list.
- Effect: for 86 templates the intake can match, but nothing is filled or asked, and the user can generate a draft with no details.
- For Arjun and Priya: either the catalogue for describe-first is limited to the 6 templates until the others are converted, or Generate is refused when a template has no fields.

## Found by the founder after the run (5 Oct 2026, 02:26 IST)

### Finding 3: answers are lost when the user goes back to the description

- On the follow-up screen the user types answers, clicks Edit to change the description, presses Continue, and the answers are gone. The same happens to values typed on the review screen after "Edit my description".
- Cause, read from the code: `FollowUpStep` keeps the answers in its own state (`useState({})`), so they are dropped when the screen closes. `backToDescribe` in `apps/web/src/app/dashboard/new/page.tsx` does not save them. Review values are saved only on "Not this document?" (`carryOverRef`), not on "Edit my description".
- Each trip back also makes a new describe call, which counts against the limit of 10 in 10 minutes.
- The test plan missed this. Step 10 checks only that the description text is kept, and that part passes.

### Finding 4: a bail request for an arrested person was taken to anticipatory bail

- Founder's text: "My brother was arrested by Sadar Thana Police on 25th August 2026 from lajpat market. This is a false accusation on him and I want to write bail application for him". The founder was taken to the Anticipatory Bail Application.
- Not reproduced by the test agent: the same text matched Regular Bail Application in 2 runs out of 2. The match is a model call, so the answer can differ from run to run.
- "Was arrested" means regular bail. Anticipatory bail is for a person who has not been arrested. A wrong match here is a legal error, not a wording one.
- Related gap seen in the run: the follow-up screen does not name the matched document. The user answers up to 10 questions before the review screen shows which document was picked.
- In both runs the arrest date (25/08/2026) was again filled in as the FIR Date (finding 1).

## Observations (not failures)

- **A. Hidden controls take keyboard focus.** From a fresh page the first six Tab presses land on the Section finder's lookup buttons while that panel is closed. This is in the Section finder, not in T-103.
- **B. The limit message differs from the plan.** The 11th describe shows "You have described several matters in a short time. Please wait a few minutes. Browse templates still works." The plan expects the daily-quota text. The burst limit and the daily cap have different messages, which seems right; the plan should be corrected.
- **C. Choosing a document costs a describe.** Picking a choice on "Which document do you need?" makes a second intake call and counts against the 10-in-10-minutes limit.
- **D. Father's name keeps the honorific.** "Shri Hari Kumar" is filled, as written by the user.
- **E. Escape does not close the State dropdown** on the follow-up screen. "No results" stays open over the next label.
- **F. The admin page cannot add a new setting.** `/admin/ai-config` only edits keys that already exist. `ai.intake_model` and `feature.describe_first` were set through the same admin API the page uses.
- **G. "None of these" says "Tell us more instead"** but leads to the no-match screen. Fine until the guided draft (T-105) exists.
- **H. A description typed in the first seconds after the page loads was lost once.** Not reproduced.

## Not run

- Step 7 (blocked).
- A true 360 px width. Chrome would not make its window narrower than 606 px. Steps 1, 2 and 11 were checked at 606 px with no sideways scroll. The follow-up and review screens were checked at 1280 px only.
- The two database checks in the plan (`Generation` row has `intakeId` and `runType`; `LlmAuxCall` rows hold numbers only).

## Cost

10 intake calls on Haiku and 1 refused call. No draft, no Ink.

## Setup done for this run (still in place)

- Google OAuth client: `http://localhost:4000/api/auth/google/callback` added as a redirect address (founder).
- `.env.development`: `GOOGLE_CALLBACK_URL`, `FRONTEND_URL` and `ALLOWED_ORIGINS` point at localhost. Old values are in comments above each line.
- Repo working copy moved from the web-only branch to `develop`.
- Settings written: `ai.intake_model = claude-haiku-4-5-20251001`, `feature.describe_first = <the test user's id>`.
- The test user was given the Admin role in the database (founder).

## Screenshots

Saved by Chrome on the laptop under `/tmp/claude-chrome-screenshots-nlEoal/`, files `screenshot-1791143345490-0.jpg` to `screenshot-1791144308756-26.jpg`.
