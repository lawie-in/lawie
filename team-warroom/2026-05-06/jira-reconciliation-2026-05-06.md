# Jira Reconciliation — 2026-05-06

Owner: Priya (PM). Cloud: abhinava32.atlassian.net. Project: SCRUM.

## Counts

- NONE (already in sync): 47
- Transitioned to Done: 1 (SCRUM-50)
- Transitioned to other: 0
- Comments only (closure confirmation on already-Done): 7 (SCRUM-27, 43, 46, 52, 53, 54, 55, 56 — but 43+27+46 are confirmations; 52-56 are the batch comment)
- Created: 0
- Escalated: 0
- Tool failures: 0 (one transient JQL response-size issue, worked around by reading saved file)

## Reconciliation Table

| SCRUM-N | Title | Repo says (inputToDev/diary) | Jira says today | Action taken |
|---|---|---|---|---|
| SCRUM-1..6 | Bootstrap / monorepo | (no entries — pre-intake) | Done | NONE |
| SCRUM-7 | GitHub Actions CI/CD | Done (rewired 2026-04-23 per Arjun) | Done | NONE |
| SCRUM-8 | Dev/staging/prod environments | Done (covered by 14/39) | Done | NONE |
| SCRUM-9 | Auth — register/login/JWT | Done (superseded by 17) | Done | NONE |
| SCRUM-10 | Free vs Paid access control | Done 2026-04-25 | Done | NONE |
| SCRUM-11 | MongoDB Atlas schema | Done 2026-04-19 | Done | NONE |
| SCRUM-12 | Next.js + Tailwind frontend (Vercel) | Not in inputToDev (covered by 28/37) | To Do | NONE — orphan in Jira (umbrella), leave open |
| SCRUM-13 | Express.js microservices | Done 2026-04-19 | Done | NONE |
| SCRUM-14 | Secrets management | Done 2026-04-20 | Done | NONE |
| SCRUM-15 | Logging + Sentry | Done 2026-04-25 | Done | NONE |
| SCRUM-16 | Auth + Billing Foundation (umbrella) | Not in inputToDev (covered by 17/18/19) | To Do | NONE — umbrella epic, leave |
| SCRUM-17 | Google OAuth + sessions | Done 2026-04-24 | Done | NONE |
| SCRUM-18 | Razorpay + webhook + free tier | Done 2026-04-24 | Done | NONE |
| SCRUM-19 | Dashboard states + settings | Done 2026-04-24 | Done | NONE |
| SCRUM-20 | AI Document Drafter (epic) | Not in inputToDev | To Do | NONE — umbrella epic, leave |
| SCRUM-21 | Template Library 15+ | Not in inputToDev (12 templates production-ready via 43/50/52-56) | To Do | NONE — orphan in Jira (epic), leave |
| SCRUM-22 | Section Finder | Covered by 27 + 46 | To Do | NONE — umbrella, leave |
| SCRUM-23 | Guided form + AI generation | Done 2026-04-24 | Done | NONE |
| SCRUM-24 | Court formatting + PDF/DOCX export | Covered by 50 (rules) + 57 (CLI PDF) + 44 (full editor) | To Do | NONE — umbrella, leave |
| SCRUM-25 | Compliance layer | Not in inputToDev | To Do | NONE — orphan (future) |
| SCRUM-26 | Advocate dashboard / vault | Not in inputToDev (covered partially by 19) | To Do | NONE — umbrella, leave |
| SCRUM-27 | BNS/BNSS/BSA mapping | Done 2026-04-28 (Ajay validated) | Done | COMMENT (confirmation) |
| SCRUM-28 | Landing page | Done (pre 2026-04-19) | Done | NONE |
| SCRUM-29..32 | Landing copy/HTML/email/HTTPS | Subtasks of 28 | To Do | NONE — orphans (rolled into 28) |
| SCRUM-33 | Dockerize 4 services | Done (covered by 13/34) | Done | NONE |
| SCRUM-34 | EC2 + Docker Compose | Done 2026-04-23 (founder + Vishal) | Done | NONE |
| SCRUM-35 | Redis Cloud setup | Covered by 41 (Redis sessions Done) | To Do | NONE — leave (founder reviews) |
| SCRUM-36 | AI provider decision | Done (Claude Sonnet 4 chosen, integrated via 23) | Done | NONE |
| SCRUM-37 | Next.js 14→15 + React 18→19 | Done 2026-04-24 | Done | NONE |
| SCRUM-38 | Test automation standard | Done 2026-04-24 | Done | NONE |
| SCRUM-39 | Env strategy + Secrets Manager | Done 2026-04-24 | Done | NONE |
| SCRUM-40 | Mongoose models (7) | Done 2026-04-25 | Done | NONE |
| SCRUM-41 | Redis sessions | Done 2026-04-25 | Done | NONE |
| SCRUM-42 | Gateway rate-limit + JWT | Done 2026-04-25 | Done | NONE |
| SCRUM-43 | Three-layer drafting engine | Done 2026-05-06 (Round 4 CLO sign-off) | Done | COMMENT (Round 4 12/12) |
| SCRUM-44 | Rich editor + PDF/DOCX + checklist | Pending (filed 2026-05-06, deadline 2026-05-13) | To Do | NONE (verified — already To Do, not Picked Up) |
| SCRUM-45 | Free Legal Tools epic | Covered by 46/47/48 | To Do | NONE — umbrella, leave |
| SCRUM-46 | Section converter free tool | Done 2026-05-06 | Done | COMMENT (closure confirmation) |
| SCRUM-47 | Bail eligibility checker | CTO-APPROVED, not started | To Do | NONE (per founder instruction) |
| SCRUM-48 | BNSS timeline tracker | CTO-APPROVED, not started | To Do | NONE (per founder instruction) |
| SCRUM-49 | Dev environment AWS t2.micro | Done 2026-04-27 | Done | NONE |
| SCRUM-50 | Indian courts DB + court rules | Done 2026-05-06 (Round 4 CLO sign-off, 12/12) | To Do | TRANSITION TO DONE + closure comment |
| SCRUM-51 | Multilingual Hindi/bilingual | CTO-APPROVED, not started | To Do | NONE |
| SCRUM-52 | Filing-killer hallucinations | Done (Round 4) | Done | COMMENT (batch) |
| SCRUM-53 | Wire court rules into engine | Done (Round 4) | Done | COMMENT (batch) |
| SCRUM-54 | Drafting engine bug fixes B1-B8 | Done (Round 4) | Done | COMMENT (batch) |
| SCRUM-55 | Strip invented contractual terms | Done (Round 4) | Done | COMMENT (batch) |
| SCRUM-56 | 120s latency + regression tests | Done (Round 4) | Done | COMMENT (batch) |
| SCRUM-57 | CLI export script | Pending (filed 2026-05-06) | To Do | NONE |
| SCRUM-58 | Helicone proxy integration | Pending (filed 2026-05-06) | To Do | NONE |
| SCRUM-59 | Trial cap 10 (5+5 gated) | Pending (filed 2026-05-06) | To Do | NONE |

## Special-case verification

- SCRUM-44: Repo Status said "Picked Up" historically (2026-04-28) but the latest 2026-05-06 filing supersedes with a fresh PRD scoping the full editor. Jira is To Do — correct end state. Confirmed.
- SCRUM-50: Latest CLAUDE.md diary entry confirms "all 11 items audited; items 1-9 already implemented; item 10 tests landed; 357/357 drafting tests pass" PLUS the Round 4 review explicitly says "12/12 production-ready, CLO Verdict: APPROVED". Closed.
- SCRUM-46: Closed (already Done in Jira; comment added).
- SCRUM-43: Closed (already Done; Round 4 confirmation comment added).
- SCRUM-27: Closed (already Done; Ajay validation comment added).
- SCRUM-52..56: Already Done in Jira; batch closure comment added per founder instruction.
- SCRUM-57, 58, 59: To Do in Jira — left as-is.
- SCRUM-47, 48: To Do in Jira — left as-is (CTO-APPROVED ≠ shipped).

## Orphans

### Orphan in Jira (no inputToDev entry — umbrella/epic tickets, intentionally not actioned)
- SCRUM-12 (Next.js + Tailwind frontend) — covered by 28/37
- SCRUM-16 (Auth + Billing Foundation) — covered by 17/18/19
- SCRUM-20 (AI Document Drafter) — epic, child tickets done
- SCRUM-21 (Template Library 15+) — 12 templates already production-ready via 43/50/52-56; should likely be re-scoped or split
- SCRUM-22 (Section Finder) — covered by 27/46
- SCRUM-24 (Court formatting + PDF/DOCX) — covered by 50/57/44
- SCRUM-25 (Compliance layer) — future
- SCRUM-26 (Advocate dashboard/vault) — partial via 19
- SCRUM-29, 30, 31, 32 (landing-page subtasks) — rolled into 28
- SCRUM-35 (Redis Cloud) — Redis already in production via 41

Recommendation to founder: cleanup pass on these epics — either close as superseded or break into concrete tickets. Not done in this pass to avoid silent epic-closures without CTO review.

### Orphan in repo (no Jira ticket)
- All four 2026-05-06 PRDs that founder asked to be filed today already have Jira tickets attached:
  - cli-export-advocate-pack → SCRUM-57
  - helicone-integration → SCRUM-58
  - scrum-44-editor-export-activation → SCRUM-44 (refile of existing ticket)
  - trial-cap-10-gated → SCRUM-59

No missing-Jira-ticket orphans. None created.

## Tool failures

- `searchJiraIssuesUsingJql` returned 235k+ characters twice (default ADF descriptions are large), exceeding inline budget. Worked around by reading the saved tool-result file from disk and parsing with `jq`. No -32601 errors. All transitions and comments executed cleanly.

## Actions executed (audit trail)

| Action | Issue | Result |
|---|---|---|
| transitionJiraIssue → Done (id 41) | SCRUM-50 | OK (status now Done) |
| addCommentToJiraIssue | SCRUM-50 | OK (comment 10479) |
| addCommentToJiraIssue | SCRUM-43 | OK (comment 10480) |
| addCommentToJiraIssue | SCRUM-46 | OK (comment 10481) |
| addCommentToJiraIssue | SCRUM-27 | OK (comment 10482) |
| addCommentToJiraIssue | SCRUM-52 | OK (comment 10483) |
| addCommentToJiraIssue | SCRUM-53 | OK (comment 10484) |
| addCommentToJiraIssue | SCRUM-54 | OK (comment 10485) |
| addCommentToJiraIssue | SCRUM-55 | OK (comment 10486) |
| addCommentToJiraIssue | SCRUM-56 | OK (comment 10487) |

End of report.
