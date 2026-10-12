# T-286 — Judgments P0: summary of a judgment the advocate gives us

| Field          | Value |
| -------------- | ----- |
| Phase          | After v1 |
| Owner          | Arjun (ADR, then scope). Ajay (rule and labels). Lead (build) |
| Mode           | Full chain |
| Status         | Backlog. Not startable: needs Ajay's rule and Arjun's ADR. Scope call by Priya, 12 Oct 2026 |

Source: `handoff/legal/judgments-scope.md` (Ajay, 12 Oct 2026).

## Scope call (Priya, 12 Oct 2026)

- Build order is Ajay's: summary first (this ticket), then citation check (P1), then search (P2). Drafts citing judgments (P3) stays out until the founder decides and Ajay writes a new T-148 rule.
- This ticket is feature 1 only: the advocate pastes or uploads a judgment, Lawie returns issues, holding, relief and key paragraphs with paragraph numbers quoted from the text. No corpus, no case named that the advocate did not give. T-148 stays as it is.
- Not before the v1 blockers. Nothing is assigned yet.
- Paid sources (SCC Online, Manupatra): treated as out, since their licences bar indexing and AI use. A partnership is the founder's business call, not a build question.
- Source licences for P1 are Ajay's to confirm (his offer of a day of reading is accepted when P1 is next).

## Acceptance criteria (draft, to be firmed up with Arjun's ADR)

1. The summary uses only the text the advocate gave, with quoted paragraph numbers.
2. The label "summary of the text you gave" and the disclaimer `Legal information, not legal advice. Check the judgment before you rely on it.` appear on every result (Ajay's wording).
3. Rate and cost guards before any Anthropic call. No judgment text or party names in third-party logs.
4. Separate from the Lawie Assistant (T-253), which keeps refusing case law.

## Gates

- Design: Rajesh, needed (new screen)
- ADR: Arjun, needed
- Legal sign-off: Ajay, needed
