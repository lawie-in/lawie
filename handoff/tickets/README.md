# Lawie tickets: build to v1

Local ticket files, one per ticket. Founder decision on 3 Oct 2026: no Jira or Notion tickets until v1 is released.

## Ticket board

- A live board of every ticket is at https://claude.ai/artifact/REAV9qDo6bzJitD1TfxDXD (private to the founder). It shows the road to v1 by phase and what is waiting on what.
- The founder changes a status or a note there, from the phone or the Mac. Priya reads the board at the start of a session and brings these files in line with it.
- These files still hold the full detail of each ticket.
- Founder rule, 8 Oct 2026: Priya owns the Status line in every `T-*.md`. Each time a ticket's state changes (building, PR open, merged, done), Priya updates that line, and only that line, in the branch the ticket lives on. The dev lead commits and pushes.

## How to use

- One ticket at a time goes to the dev lead.
- The ticket file is the source of truth. Change its Status line as work moves.
- Do not rename a ticket file once work has started.
- Design, legal and research tickets do not go through the dev lead. Their owner writes the result into the file.

## Decisions these tickets build on

- Describe-first intake: the user describes the matter, templates stay behind the scenes, only missing must-have details are asked.
- Images can be attached as matter context. The user confirms what was read before drafting. Up to 5 images per draft.
- Pricing is per paragraph: 50 drops + 2 drops per paragraph. 1 Ink = 100 drops.
- The user sees an estimate before drafting and is never charged more than it.
- A regeneration costs 50 percent of the draft's charge.
- Court-critical documents have a minimum paragraph count.

Logged in Notion Decisions Log: "Drafting UX v2" and "Build plan to v1", both dated 3 Oct 2026.

## What the code showed on 3 Oct 2026

Checked on `develop` after PR #29 and PR #30.

1. **No router or open-draft code exists.** Nothing for DraftingModeRouter, open-draft mode or demand capture is in the repo. Phase 1 builds it from scratch.
2. **Token usage is not recorded.** Each generation writes a `Generation` row with `tokensUsed: 0` and `costUsd` 0. `UsageLog` is never written. The pricing margins are estimates until T-003 and T-004 are done.
3. **The daily spend cap cannot fire.** It sums `Generation.costUsd`, which is always 0, and it only logs.
4. **Generation makes one model call per AI section**, resending the system prompt each time, with no prompt caching.
5. **The template cards still show internal text.** T-002 fixed `GET /templates`, which the web app does not call. T-007 fixes the endpoint the cards use.
6. **Cost is per template today** (bail and consumer complaint cost 2). Bonuses go into the older `earnedCredits` bucket, which the live spend path does not draw from.
7. **The 2-per-Ink conversion is repeated in four apps:** auth, billing, drafting and web.
8. **No regenerate endpoint or button exists.**
9. **Requests are capped at 10 MB** by production nginx and by the drafting service.
10. **`apps/web` has no tests and is not in CI.** UI tickets carry a manual-check rule.
11. **`origin/main` is 21 commits behind `develop`** (last updated 16 June 2026). Deploy is manual through `deploy.sh`.
12. **Templates have a median of 16 required fields** (largest 38).

## Tickets

| ID    | Title                                                                 | Phase | Owner                                         | Status                                                                                                                                   |
| ----- | --------------------------------------------------------------------- | ----- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| T-001 | Dev lead accepts local ticket files                                   | 0     | Vishal (agent files), Arjun reviews           | Done                                                                                                                                     |
| T-002 | Hide internal text on template cards                                  | 0     | Vishal                                        | Done                                                                                                                                     |
| T-003 | Record real token usage for every generation                          | 0     | Vishal                                        | Done                                                                                                                                     |
| T-004 | Check the drops formula against real cost                             | 0     | Vikram (analysis), Vishal (query)             | Ready after T-117 and T-118 step 1. Runs against the production database and Redis (founder, 4 Oct). Query script ready                  |
| T-005 | Design the describe-first drafting flow                               | 0     | Rajesh, Meera approves                        | Done                                                                                                                                     |
| T-006 | ADR for intake and routing                                            | 0     | Arjun                                         | Done. ADR-019 approved by the founder on 4 Oct 2026 with two changes                                                                     |
| T-007 | Hide internal text on the endpoint the cards really use               | 0     | Vishal                                        | Done                                                                                                                                     |
| T-101 | Intake API: description to filled template                            | 1     | Vishal                                        | Merged to `develop` (PR #35), with Ajay's one change                                                                                     |
| T-102 | Ask only for the missing details                                      | 1     | Vishal                                        | Merged to `develop` (PR #35). Replaced under ADR-021: questions come from the rule pack (T-105). Web part removed in T-125               |
| T-103 | Web: describe-first New document page                                 | 1     | Vishal                                        | Merged to `develop` (PR #36), switched off. The describe screen and the document choice are kept under ADR-021                           |
| T-104 | Web: review details before drafting                                   | 1     | Vishal                                        | Merged to `develop` (PR #36), switched off. Replaced by the brief under ADR-021. Removed in T-125                                        |
| T-105 | Questions and the brief, for every document                           | 1     | Vishal                                        | Done. PR #40 merged 6 Oct 2026. Not switched on                                                                                          |
| T-106 | The Drafter writes under the document's rules                         | 1     | Vishal                                        | Done. PR #41 and PR #44 merged 6 Oct 2026. Not switched on                                                                               |
| T-107 | Rules and prompts for guided drafts                                   | 1     | Ajay                                          | Delivered and signed by Ajay on 4 Oct 2026, on conditions                                                                                |
| T-108 | Cost and price for guided drafts and page reading                     | 2     | Vikram (analysis), Vishal (query)             | Blocked: T-106, T-111 and T-205 running in dev, for measured numbers                                                                     |
| T-109 | Design additions: guided draft, document type and page charges        | 0     | Rajesh, Meera approves                        | Done. Approved by Meera on 4 Oct 2026 and by the founder on 6 Oct 2026. Design is a claude.ai artifact, not Figma                        |
| T-110 | Store runType on every generation                                     | 0     | Vishal                                        | Built, tests green, not committed                                                                                                        |
| T-111 | Review by agent, as a paid option                                     | 2     | Vishal                                        | Blocked: T-106 and T-109. Go-live waits for T-108                                                                                        |
| T-112 | ADR-020 for the move from Ink units to drops                          | 2     | Arjun, with Vikram                            | Done. ADR-020 approved by the founder on 4 Oct 2026, simplified: no maintenance window                                                   |
| T-113 | Intake test set and the gate before switching on                      | 1     | Priya and Ajay (the set), Vishal (the script) | Script built. Set and gate extended for ADR-021 on 5 Oct 2026. The set is not written yet. The gate runs after T-105 and T-106           |
| T-114 | List Helicone in the privacy policy                                   | 0     | Madhuri (text), Ajay signs, Vishal (page)     | Closed 4 Oct 2026, not built. Helicone is being removed (T-118)                                                                          |
| T-115 | Permanent delete, and encrypt saved case details                      | 4     | Vishal, Arjun on the design                   | Needs a short design from Arjun first                                                                                                    |
| T-116 | Complete the legal-content list                                       | 0     | Vishal (agent files), Ajay confirms the list  | Ready                                                                                                                                    |
| T-117 | Rotate INTERNAL_SECRET and remove it from the test script             | 0     | Vishal, founder's go-ahead for the deploy     | Closed 10 Oct 2026. Script fix merged (PR #37). Rotation replaced by the fresh production environment at launch (T-403) |
| T-118 | Call Anthropic directly and remove Helicone                           | 0     | Vishal, Arjun reviews                         | Ready. Step 1 before the T-004 batch, step 2 after the backend pull request                                                              |
| T-119 | A date is filled only into the field it belongs to                    | 1     | Vishal, Ajay signs                            | Closed 5 Oct 2026, not built. Its work is in T-105                                                                                       |
| T-120 | Describe-first only offers templates it can fill                      | 1     | Vishal, Arjun reviews                         | Closed 5 Oct 2026, not built. No per-document forms under ADR-021                                                                        |
| T-121 | Keep the user's answers when they go back to the description          | 1     | Vishal                                        | Closed 5 Oct 2026, not built. Its work is in T-105 and T-125                                                                             |
| T-122 | Match the right bail application, and show the matched document early | 1     | Vishal, Ajay signs, Rajesh confirms           | Step 2 merged (PR #39). Step 1 and the 20 model runs need the founder's Mac. Showing the document early moves to the brief (T-125)       |
| T-123 | ADR-021: one drafting flow, rules kept, forms removed                 | 1     | Arjun, with Ajay                              | Done. ADR-021 approved by the founder on 5 Oct 2026, D1 to D6 as recommended. Section 5 signed by Ajay                                   |
| T-124 | One loader for the rule packs, and a report on their gaps             | 1     | Vishal, Arjun reviews                         | Done. PR #38 merged on 6 Oct 2026. Report: `handoff/data/rule-pack-report.md`                                                            |
| T-125 | Web: one flow from describe to draft                                  | 1     | Vishal, Rajesh reviews                        | In review. PR #45, 6 Oct 2026. Checked against a stubbed API only; the end-to-end plan is not run                                        |
| T-126 | Design: the brief, for every document                                 | 1     | Rajesh, Meera approves                        | Done. Founder approved 6 Oct 2026                                                                                                        |
| T-127 | Rules, prompts and cue lists for the one flow                         | 1     | Ajay                                          | Delivered and signed on 6 Oct 2026, with 5 conditions                                                                                    |
| T-129 | Prayer and verification text for packs that have none                 | 1     | Ajay. Vishal applies                          | Ready. Found by T-124 and T-127                                                                                                          |
| T-130 | CI is red on `develop` for billing and auth                           | 0     | Vishal                                        | Done. PR #43 merged 6 Oct 2026. `develop` is green on all four services                                                                  |
| T-128 | Fill the gaps in the rule packs                                       | 1     | Ajay, with Priya. Vishal applies              | Ready. The report is written (`handoff/data/rule-pack-report.md`). PR #38 is merged, so Vishal can apply the edits once Ajay writes them |
| T-135 | The draft cites the right provision for the court | 1 | Ajay (the law), then Vishal (apply), Anushka (verdict) | Needs scoping. Not started. Cause not traced yet |
| T-136 | The draft is one document and keeps the facts as given (`T-136-draft-faithfulness.md`) | 1 | Vishal (build), Ajay (signed the rules), Anushka (tests on develop before GTM) | In progress. Part built on the branch, not wired in and not tested |
| T-136 | The draft is one document and keeps the facts as given (`T-136-draft-is-one-document-and-keeps-the-facts.md`) | 1 | Vishal (cause and fix), Ajay (the rule on facts), Anushka (verdict) | Needs scoping. Not started. Cause not traced yet |
| T-137 | Ink: the cost before I spend, and one true balance | 2 | Vikram (what is true), Priya (scope), Vishal (build), Anushka (verdict) | Needs scoping. Not started. Cause not traced yet |
| T-138 | I can read my draft on a phone | 1 | Vishal (build), Anushka (tests on develop before GTM) | Ready for Vishal |
| T-139 | Do not ask again for what I already gave | 1 | Priya (scope), Ajay (the questions + sign-off), Vishal (build), Anushka (tests develop after the batch) | Merged to develop (PR #66), 8 Oct. Anushka tests on develop. |
| T-140 | I can choose my court, and only courts that can hear the matter | 1 | Priya (scope), Ajay (which courts for which document), Vishal (build), Anushka (verdict) | Needs scoping. Not started. Cause not traced yet |
| T-141 | The product says only what is true about itself | 0 | Meera and Madhuri (words), Ajay (claims), Vikram (plans), Anushka (verdict) | Needs scoping. Not started. Cause not traced yet |
| T-141a | Public pages say only what is true (wording only) | 0 | Madhuri (words), Ajay (claims), Vishal (apply), Anushka (tests on develop before GTM) | Ready for Vishal once Madhuri's table is signed by Ajay |
| T-142 | Small faults from Anushka's first run | 4 | Priya (sort), Vishal (build), Anushka (verdict) | Needs scoping. Not started. Cause not traced yet |
| T-146 | Magistrate bail comes out with its court and its applicant | 1 | Vishal (build), Anushka (tests on develop before GTM) | Ready for Vishal |
| T-148 | No case law is added to a draft on its own | 1 | Ajay (signs the text edits), Vishal (build), Anushka (tests on develop before GTM) | Ready for Vishal, once Ajay signs criteria 1 and 2 |
| T-149 | Party labels in the cause title fit the document, not the court | 1 | Vishal (build), Ajay (confirms labels), Anushka (tests on develop before GTM) | Ready for Vishal, once Ajay signs the label table below |
| T-150 | The brief does not keep an answer that contradicts the description | 1 | Vishal (build), Ajay (rule), Anushka (tests on develop before GTM) | Ready for Vishal (build starts only with Ajay's signed reference, see below) |
| T-151 | The saved document page is usable from 768 to about 1024 px | 1 | Vishal (build), Anushka (tests on develop before GTM) | Ready for Vishal |
| T-152 | Two small faults from run 1: "5free" and the version that rises on open | 4 | Vishal (build), Anushka (tests on develop before GTM) | Ready for Vishal |
| T-153 | Magistrate bail records custody and the jail | 1 | Vishal (build), Ajay (sign-off), Anushka (tests develop after the batch) | Merged to develop (PR #63), 8 Oct. Anushka tests on develop. |
| T-156 | One court, one designation across the document | 1 | Vishal (build), Anushka (tests develop after the batch) | Merged to develop (PR #65), 8 Oct. Anushka tests on develop. |
| T-157 | No "/" either-or lines in court and state names | 1 | Vishal (build), Ajay (wording + sign-off), Anushka (tests develop after the batch) | Merged to develop (PR #64), 8 Oct. Anushka tests on develop. |
| T-158 | No " / " in party labels: labour court, tribunal, DRT, NCLT, IBC application | 1 | Vishal (build), Ajay (signs any string not given below, and the golden diff), Anushka (tests develop after merge) | Merged to develop (PR #72), 8 Oct. Anushka tests on develop. |
| T-160 | Addressing clause names the city once | 1 | Vishal (build), Anushka (tests develop after the batch) | Merged to develop (PR #62), 8 Oct. Anushka tests on develop. |
| T-164 | Affidavit place is never "Ranchi" by default | 1 | Vishal (build), Anushka (tests develop after the batch) | Merged to develop (PR #67), 8 Oct. Anushka tests on develop. |
| T-171 | High Court drafts use the High Court's own rule, never Patna's by default | 1 | Vishal (build), Ajay (signs strings and golden diff), Anushka (tests develop after merge) | Merged to develop (PR #70), 8 Oct. Anushka tests on develop. |
| T-172 | Affidavit prints the advocate's text literally, even with "$" | 1 | Vishal (build), Anushka (tests develop after merge) | Merged to develop (PR #69), 8 Oct. Anushka tests on develop. |
| T-174 | A family court draft uses the family court rule, not the district court rule | 1 | Vishal | Merged to develop (PR #73), 8 Oct. Anushka tests on develop. |
| T-175 | A Lucknow Bench court picked from the list prints its own heading | 1 | Vishal (build), Ajay (heading lines), Anushka (tests develop after the batch) | Merged to develop (PR #71), 8 Oct. Anushka tests on develop. |
| T-176 | Family court heading names its seat on both paths; "[To be confirmed: place]" if unknown; list path keeps "AT TIS HAZARI" (Ajay's T-174 ruling, before v1 GTM) | 1 | Vishal (build), Ajay (sign-off), Anushka (tests) | Merged to develop (PR #76), 8 Oct. Anushka tests on develop. |
| T-177 | Family court case numbering per state (BR, JH, UP, DL), checked against eCourts CIS case types; "[To be confirmed: case type] No." until then (Ajay's T-174 ruling, before v1 GTM) | 1 | Ajay (numbering), Vishal (build) | Merged to develop (PR #79), 9 Oct. Anushka tests on develop. DB reseed needed (Arjun). |
| T-178 | family_court.json: Order VI Rule 17 CPC to Rule 16 for scandalous pleadings, and fix the courtType label (not "tribunal") (Ajay's T-174 ruling, before v1 GTM) | 1 | Ajay (wording), Vishal (build) | Merged to develop (PR #77), 9 Oct. Anushka tests on develop. |
| T-179 | Delhi family court heading names its complex; "Family Court, Delhi" / "New Delhi" alone prints "[To be confirmed: district/complex]"; "... Courts" complex names count as the seat (Ajay's T-176 ruling, FU-T176-1, before Delhi go-live) | 1 | Vishal (build), Ajay (strings and complex list) | Merged to develop (PR #78), 9 Oct. Anushka tests on develop. |
| T-180 | Typed-court path: the prompt gives the AI the family case-number placeholder, so the typed path prints "[To be confirmed: case type] No. _____ of <year>" (T-177 follow-up, AC 7 deferred) | 1 | Vishal (build), Ajay (sign-off), Anushka (verdict) | To scope |
| T-181 | `Court.model.ts` default `caseNomenclature` "Case No. _____ of [YEAR]": `[YEAR]` is never replaced | 1 | Vishal (build), Anushka (verdict) | To scope |
| T-182 | Prompt builder crashed on `mandatory_clauses` (snake_case) rule files. Logged for the 7 family files; the fix is wider: all 70 snake_case rule files now work on the legacy /generate path | 1 | Vishal (build), Anushka (verdict) | Merged to develop (PR #80), 9 Oct. Anushka tests on develop. |
| T-183 | A family template drafted in a non-family court prints that court's list string ("Civil Suit No.") | 1 | Ajay (ruling), Vishal (build), Anushka (verdict) | To scope. Ajay to rule |
| T-184 | `indian-courts.json`: the 22 family entries have `courtType` "tribunal" | 1 | Arjun (decision: DB seed and courts filter), Vishal (build), Ajay (sign-off) | To scope. Needs Arjun |
| T-185 | FU-T177-1: check the eCourts CIS case types for the BR, JH, UP and DL family courts, then Ajay rules each cell | 1 | A person (the check), Ajay (rules each cell) | To scope |
| T-186 | Legacy /generate path: 54 doc types leave template blanks such as `{petitioner_name}` unfilled; the post-processor fills only about 9 placeholder names (found in T-182) | 1 | Vishal | To scope |
| T-187 | Retention and deletion rule for the Fact Ledger and `intake_extract` rows, before `feature.fact_ledger` is on for real users (Ajay's DPDP condition) | 1 | Arjun (mechanism), Ajay (rule, DPDP sign-off), Vishal (build) | To do. Gates `feature.fact_ledger` for real users |
| T-201 | Ledger moves from Ink units to drops                                  | 2     | Vishal                                        | Ready. ADR-020 approved on 4 Oct 2026                                                                                                    |
| T-202 | Charge by paragraphs: 50 drops + 2 per paragraph                      | 2     | Vishal                                        | Blocked: T-201 and T-003 done. Go-live waits for T-004                                                                                   |
| T-203 | Web: length picker, estimate and drops balance                        | 2     | Vishal                                        | Blocked: T-202 and T-109                                                                                                                 |
| T-204 | Pricing copy and terms for drops                                      | 2     | Madhuri (copy), Ajay (terms), Meera approves  | Blocked: T-004 and T-108 sign-off                                                                                                        |
| T-205 | Revise a draft: paid, same run                                        | 2     | Vishal                                        | Blocked: T-110, T-202 and T-109. Go-live waits for T-108                                                                                 |
| T-206 | Default and minimum paragraphs for each document type                 | 2     | Ajay, with Priya                              | Delivered by Ajay on 4 Oct 2026. Limits for 86 templates wait for a check against T-004 data                                             |
| T-301 | Attach images as matter context                                       | 3     | Vishal                                        | Blocked: the brief screen (T-125)                                                                                                        |
| T-302 | Consent line and retention rule for uploads                           | 3     | Ajay                                          | Delivered by Ajay on 4 Oct 2026. Policy wording to be read by a practising lawyer before it is published                                 |
| T-303 | Spike: can we read Hindi and handwritten FIRs?                        | 3     | Vishal, Ajay reviews the result               | Ready. T-302 is delivered                                                                                                                |
| T-304 | Attach PDFs as matter context                                         | 3     | Vishal                                        | Blocked: T-301                                                                                                                           |
| T-305 | Spike: can we fetch an FIR by its number?                             | 3     | Arjun, with Ajay on legality                  | Done. No-go for an automatic fetch in v1. Upload covers the need                                                                         |
| T-401 | One consistent flow, end to end                                       | 4     | Vishal, Rajesh reviews                        | Blocked: T-106, T-125, T-203 and T-301                                                                                                   |
| T-402 | Test the flow with 3 to 5 advocates                                   | 4     | Priya, with Meera for recruiting              | Blocked: T-401                                                                                                                           |
| T-403 | Release v1 to production from main                                    | 4     | Vishal, Arjun signs off                       | Blocked: T-402 must-fix items                                                                                                            |

## Can start now

T-122 step 1, T-121, T-120, T-119 and T-122 (the four describe-first faults, see "Where we are"). Then: T-117 first, then Vishal's order in "Where we are" below. Not in that order yet: T-116 and T-303 (Vishal). In parallel, not through Vishal: the T-113 test set (Ajay and Priya).

## Where we are (Priya, 6 Oct 2026, 18:1x)

- **Anushka's first run: FAIL.** A baseline of the whole product on `develop`, in the founder's Chrome, 17:29 to 17:57. 13 scenarios of her own, 2 drafts generated. 4 blockers, 9 majors. Her answer to "would I use this on a real matter today?": no. Report, word for word: `handoff/quality/2026-10-06-baseline-run-FAIL.md` and Notion, Quality Log, "Run 1".
- **The four blockers:** wrong provisions in the Sessions bail draft (T-135); facts changed, added and dropped in the draft (T-136); no cost before spending and a balance that went 5, 3, 2, 5 (T-137); the draft cannot be read at phone width (T-138).
- **New tickets from her findings:** T-135 to T-142. All "Needs scoping". Causes are not traced. T-133 and T-134 carry her confirmation of the founder's two faults.
- **Proposed order (Priya), waiting for the founder:** T-135, T-136, T-134, T-139, T-137, T-138, T-140, T-133, T-141, T-142. Reason: a wrong or unfaithful draft is the product failing at its one job; everything else is around it.
- **What this says about the last two days:** the flow from T-105, T-106 and T-125 was passed on tests with a stubbed model. Her run was the first time a draft was made with the real model and read by someone who did not build it.
- **Left in the founder's account by the run:** two test documents (a bail application and a cheque notice), and the balance now shows 5 Ink again.
- **Not tested by her:** export (a download needs the founder's go-ahead), payment, sign-in, a real phone, Hindi drafting, and five of the seven documents she took as far as the brief.

## Where we were (Priya, 6 Oct 2026, 17:1x)

- **Where Anushka's verdicts are kept (17:2x):** the Notion page "Quality Log — Anushka (CQO)" at the top of Lawie HQ, kept by Kavya, plus the same report on each pull request. She is invoked from the war-room chat, not by the founder in a browser panel: a separate browser session has no link to the team's records. Proposed and waiting for the founder: go-live needs one full run by her on the release build (`develop` into `main`), the advocate round (T-402) and the founder's go. Everything merged before 17:11 today was never tested by her.
- **Founder (16:58): not happy with the quality.** Two faults he found himself: the Bihar police portal link shown to every user, and a bail request taken to be anticipatory bail without asking.
- **Founder order: a Chief Quality Officer, Anushka.** A lawyer on the board, reports to the founder, tests in a browser, no code, no part in solution building. Every pull request passes through her before it is merged. T-132. PR #48 was merged at 17:11 and the plugin is installed; `develop` is at `7a083e7`. The Mac's copy is still at `87fab4b` and needs a pull, then a restart of Vishal's session.
- **Founder decisions:** nothing in the product is tied to one state (T-133). When a description could mean more than one document, ask the user; no per-document word lists (T-134).
- **The switch:** the founder is now seeing the one flow, so `feature.describe_first` is set. The value was not checked from the chat.
- **Anushka cannot test yet:** the Claude browser pane on the Mac shows the sign-in page. She does not sign in. Every UI pull request waits on that.
- **Order of work, proposed:** T-133 (small), then T-134 (needs scoping first). Both end with her verdict.

## Where we were (Priya, 6 Oct 2026, 16:1x)

- **Founder (16:18): one New document screen for every user, no per-user split.** The switch and the old list were the team's caution (ADR-019 §3.11, ADR-021 steps 6 and 7, and Vishal's choice in T-125 to keep the old form). Proposed order, waiting on the founder: set `feature.describe_first` to `on` now, make one real draft end to end, then remove the switch, the old list and the old long form in one pull request. ADR-021 needs a note when this is settled (Arjun).
- **Merged:** PR #46 (T-131, landing page), by the founder at 16:07. `develop` is at `751f7aa`. PR #47 (hero side padding, same ticket) was merged at 16:12; `develop` is now at `87fab4b`. T-131 is Done.
- **What the founder meant by "one window" (16:11):** on New document he sees the old list of 92 templates, not the one flow. Cause: `feature.describe_first` has never been set, so the switch is off for every account. It is a row in app settings in the database, read with a 60-second in-memory cache. It is not in Redis; refreshing Redis does not change it.
- **To turn it on for the founder only:** `yarn workspace @lawie/drafting seed:setting feature.describe_first <founder's user id>`. The value `on` turns it on for every account on that database, and dev uses the production database. ADR-021 keeps "on for everyone" behind the T-113 gate.
- **Also needed before a draft can be made:** `ai.intake_model` set to a full dated model id, and the courts list seeded (`seed:all`). Neither is confirmed.
- **Founder asked (16:08):** "refresh the redis, lets have a ready refresh curl." No such endpoint exists. Redis holds sign-in sessions, rate limits, intake state and the section-mapping cache (rebuilt when missing, kept one hour). Not built yet; offered as an admin endpoint that rebuilds the section cache and never touches sessions.
- **End-to-end check: still not started.** The backend is now up (the founder is signed in in Chrome). The chat cannot reach that Chrome: the Claude extension is not connected. The Claude browser pane has no sign-in.

## Where we were (Priya, 6 Oct 2026, 15:5x)

- **Merged:** PR #45 (T-125, the web flow), by the founder at 15:28. `develop` is at `3a38fd9`. The switch is still off.
- **Founder request (15:35):** "home page needs fix, it is very cluttery. Also do an end to end testing here on the browser."
- **Home page:** read as the public landing page, because that is the page open in the founder's browser pane. New ticket T-131. PR #46 into `develop` is waiting for the founder. Nine sections became six.
- **Found while doing it, fixed in PR #46:** the phone menu, the FAQ rows and the floating button lost their styles when opened, on every marketing page. Cause: the Tailwind Prettier plugin trims spaces inside a template literal in `className`, and the commit hook runs it. Rule for the web from now on: write class names as whole strings, or with a space before `${`.
- **End-to-end check: not started.** Two things only the founder can do: run `yarn dev:backend` on the Mac (only the web app on 3000 is up), and sign in in the browser pane. Then: is the courts list seeded, and is the switch on for the founder's account.
- **For Vikram, Meera and the founder to decide:** /pricing, /faq and the editor say free exports carry a watermark, and paid plans are sold on "no watermark". The export code adds no watermark for anyone. Either build it or drop the claim. PR #46 only takes it off the landing page.
- **For Ajay:** the landing page still says "court-ready" and "under 5 minutes". No draft has been made with the real model, so neither is measured. The FAQ still says every cited section is validated before it appears.
- **Not known:** whether the four sample PDFs exist in the database. Their links were not followed to a file.

## Where we were (Priya, 6 Oct 2026, 15:2x)

- **Merged today, six pull requests:** #38 (T-124), #39 (T-122 step 2), #40 (T-105), #41 and #44 (T-106), #43 (T-130). `develop` is green on all four services.
- **Founder decision (14:28):** the T-126 design is approved, and Vishal builds the web part from that page. This also settles the point left open since 4 Oct: a design page stands in for Figma.
- **Waiting for the founder to merge:** PR #45 (T-125, the web flow). It was checked in a local browser against a stubbed API only. Merging is safe with the switch off: a user without the switch sees the old list and form.
- **Every build step of the one flow is now written:** describe, brief, draft, and the screens. None of it has made a draft with the real model.
- **What is left before the switch (ADR-021, steps 6 and 7):** the test set and the gate (T-113), then the end-to-end check `handoff/manual-checks/T-125-e2e-plan.md`. Both need the founder's Mac.
- **Needs the founder's Mac, in this order:** `seed:all` (no court document can be drafted without the courts list), then the end-to-end plan, then T-122 step 1 and the 20 model runs.
- **Not done in T-125, on purpose:** the old long form is not deleted. It is the only way to make a document while the switch is off. Priya and Arjun: confirm it goes after the gate.
- **In parallel, not started:** Ajay on T-128 and T-129. Priya and Ajay on the T-113 set: 24 of about 150 descriptions are written.
- **For Ajay from T-106:** with a rule pack the label goes on for any finding; `bail_regular` changes its heading when the person is not in custody; the verification does not name paragraph numbers. With no rule pack: the sections given are read by code; the saved title is the document's name and is not encrypted; the court-signal list catches plain letters that say "stay" or "appeal"; forms a law prescribes are not refused yet.
- **For Arjun:** the public coupon check trusts a `userId` in the address; the admin subscription search only looks inside one page; a draft that is written but fails to save is still charged.
- **Open conditions before real users (Ajay):** a practising advocate reads the Hindi and Hinglish lists and checks the judgments named in the packs.

## Where we were (Priya, 6 Oct 2026, 10:4x)

- **Merged today:** PR #38 (T-124, rule-pack loader) and PR #39 (T-122 step 2, the bail guard).
- **Waiting for the founder to merge:** PR #40 (T-105, questions and the brief). CI passed.
- **Done by Ajay:** T-127, signed with 5 conditions. `handoff/design/T-127-one-flow-rules-and-prompts.md`.
- **T-109 is Done** (founder, 6 Oct 2026).
- **Next for Vishal from the chat:** T-106 (the Drafter). It needs PR #40 merged first.
- **Needs the founder's Mac:** T-122 step 1, the 20 runs of the founder's sentence against the real model, the seed, and the end-to-end check.
- **In parallel, not started:** Rajesh on T-126 (design of the brief). Ajay on T-128 (6 legal notices list their facts by name only). Priya and Ajay on the T-113 set: 24 bail descriptions are written, about 126 to go.
- **New tickets from today's findings:** T-129 (prayer and verification text for packs that have none) and T-130 (CI is red on `develop` for billing and auth).
- **Open conditions before real users (Ajay):** a practising advocate reads the Hindi and Hinglish lists and checks the judgments named in the packs.

## Where we were (Priya, 6 Oct 2026, 09:2x)

- **Vishal now works from the war-room chat too** (founder, 6 Oct 2026). That session has its own copy of the repo. It can write code, run the tests that need no database, push a branch and open a pull request. The founder merges.
- **It cannot reach the database, Redis or the model.** T-122 step 1, the seed, the browser check and deploys still need the founder's Mac.
- **T-124 is built**: PR #38 into `develop`, CI passed. All 92 rule packs load. The report for Ajay is `handoff/data/rule-pack-report.md`.
- **What the report found:** no group is empty. 6 legal notices list their facts by name only. 20 packs have no cause title, 37 no prayer, 43 no verification. 6 have no validation rules.
- **Next for Vishal after PR #38 is merged:** T-122 steps 2 to 4 need Ajay's cue lists (T-127). T-105 needs T-127 as well. So Ajay's T-127 is the next thing that unblocks Vishal.
- **Still open with the founder:** merge PR #38, open a pull request for `fix/seed-sections-repealed-type`, commit the production "coming soon" change, confirm the T-117 rotation.
- Tickets and ADRs are not in git (`handoff/*` and `docs/` are ignored). The chat session holds a copy taken on 6 Oct 2026.

## Where we were (Priya, 5 Oct 2026, 11:3x)

- **ADR-021 is approved** (founder, 5 Oct 2026, D1 to D6 as recommended; section 5 signed by Ajay). Every document goes through one flow: describe, a few questions, a brief the user confirms, the draft, the checks. Each document keeps its legal rules. The per-document forms are retired.
- **Describe-first stays off** for everyone except the founder's test account until the new flow passes the gate in T-113 and a new end-to-end check, including generating a draft.
- **Production shows "coming soon" after login** (founder, 5 Oct 2026). That change is not in the repo yet; the next deploy removes it unless it is committed.
- **Tickets changed by ADR-021:** T-105 and T-106 are rewritten as the main flow. T-119, T-120 and T-121 are closed into them. T-102 and T-104 are replaced. New: T-124 (rule-pack loader), T-125 (web flow), T-126 (design), T-127 (Ajay's prompts and cue lists), T-128 (gaps in the rule packs).
- **Order for Vishal, one at a time:** T-122 step 1, T-124, T-122, T-105, T-106, T-125, then the gate in T-113 and the new end-to-end check.
- **In parallel, not through Vishal:** Ajay on T-127, then T-128 once T-124 reports. Rajesh on T-126. Priya and Ajay on the T-113 test set.
- **Rough size (Arjun):** three to four weeks for one developer. Earlier estimates on this project ran low.
- The list of gaps before go-to-market is `handoff/gaps-before-gtm.md`.

## Where we were (Priya, 4 Oct 2026, 14:1x)

Built by Vishal, but all of it sits uncommitted in one working tree on `develop`. None of it has been through review or a pull request. T-103 and T-104 were checked against a mocked API only.

To land it, two pull requests, not six:

1. **Backend**: T-110, T-101, T-102 and the T-113 script. Ajay approved the prompts on 4 Oct 2026. One change in `intake.service.ts` goes in first (see T-101).
2. **Web**: T-103 and T-104, with `feature.describe_first` off. Meera approved T-109 on 4 Oct 2026. Waits for one live end-to-end check against the real API.

Order for Vishal, one at a time:

1. **T-117**: rotate `INTERNAL_SECRET`. First, by the founder's instruction.
2. **Backend pull request** above.
3. **T-118**: switch to direct Anthropic calls, then remove the Helicone code.
4. **T-004 batch**, on the direct path, against the production database.
5. **Web pull request** above.
6. **T-201**, then **T-105** and **T-106**.

Waiting on people:

- **Ajay**: the 150-description test set with Priya.
- **Madhuri**: the "AI agent" wording for the review card (T-109, condition 1).
- **Founder**: go-ahead for one line in the dev lead's gate so it accepts the T-109 artifact as the design (T-109, condition 2). Find and close the Helicone account that owns the key (T-118, step 3). Say so if `claude-sonnet-5-5` is not the Sonnet you want.
- **Vishal**: T-117.

## Suggested order (Priya, 4 Oct 2026). Replaced by "Order for Vishal" above

For Vishal, one at a time:

1. **T-110**: store `runType`. Small, and it keeps the data right from now on.
2. **T-004 batch**: switch dev drafting to Sonnet, seed real rates, generate 30+ drafts, run the two queries. Vikram analyses while the next ticket is built.
3. **T-101**: the intake API. The largest ticket and the core of describe-first.
4. **T-102**, then **T-113** (the gate script), then **T-103** and **T-104**.

In parallel, not through Vishal:

- **Ajay**: T-107, T-302 and T-206 are delivered (4 Oct 2026). Next: the T-113 test set with Priya.
- **Rajesh**: T-109 delivered (4 Oct 2026). Meera's approval unblocks T-103, T-104, T-105, T-106, T-111, T-203, T-205, T-301.
- **Arjun**: T-112 (ADR-020, approved 4 Oct 2026) and T-305 are done. Next: the short design for T-115.

The three chains to v1:

- Template route: T-101, T-102, T-113, T-103, T-104.
- Pricing: T-004 and T-112, then T-201, T-202, T-203, T-204.
- Guided draft: T-107 and T-109, then T-105, T-106, T-111, T-205, T-108.

## Review, 3 Oct 2026

Every ticket has a Review section with each reviewer's verdict.

- Closed: T-001.
- Goal not met: T-002. Follow-up is T-007.
- Approved, can start: T-003, T-005, T-006, T-007, T-206, T-302, T-305.
- Approved, waiting on other tickets: T-004, T-101, T-102, T-103, T-104, T-202, T-203, T-204, T-301, T-303, T-304, T-401, T-402, T-403.
- Approved, waiting on a founder decision: T-201 (bonuses), T-205 (in v1 or after).
- Tickets changed in review: T-003, T-101, T-201, T-202, T-301, T-403, and the web tickets.
- New tickets from review: T-007, T-205, T-206.

## Open questions for the founder

1. ~~ADR-020, D1 to D4.~~ Answered on 4 Oct 2026: "just move it". No maintenance window.
2. T-108: the price of a review, a revision and a page, once measured.
3. ~~Which Sonnet version is set in `ai.drafting_model`?~~ Proposed by Arjun on 4 Oct 2026: `claude-sonnet-5-5`. The dated-id rule went with Helicone. The founder can name another.
4. T-305: should Ajay write to the Bihar State Crime Records Bureau for permission to look up FIRs?
5. ~~What value goes in `finance.usd_inr`?~~ Set by Vikram on 4 Oct 2026: 96.5.
6. ~~T-004 needs a dev database and Redis.~~ Answered by the founder on 4 Oct 2026: use the production database and Redis. No budget for a second set.
