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

## Arjun (12 Oct 2026)

ADR-024 is written: `handoff/tickets/ADR-T-286-judgment-summary.md`. Short version: a module in drafting; pasted text only (150,000 characters); nothing stored; the code, not the model, enforces "quote, do not paraphrase" by checking every quote against its numbered paragraph and dropping what fails; no status words; T-148 check on all prose; fail-closed cost guards with zero defaults until Vikram sets them. Upload waits for T-304 (no PDF extractor exists in the repo). Split: T-286a backend, T-286c gateway, T-286b web, T-286d upload later.

**Open before 286a:** Ajay's rule and final labels; Ajay's 10 sample judgments; Rajesh's design (286b); Vikram's choice (included with caps, or Ink through T-226) and numbers; T-285's keep-alive merged.
**Founder:** create `ANTHROPIC_JUDGMENTS_API_KEY` with a console limit, and seed `ai.judgments_model`, its rate row and `judgments.enabled=false` at launch. Nothing earlier.

## ADR (Arjun, 12 Oct 2026)

`handoff/tickets/ADR-T-286-judgment-summary.md` (ADR-024). Split: 286a backend, 286c gateway, 286b web, 286d upload (later). Pasted text only, nothing stored. Open before 286a: Ajay's labels and 10 sample judgments, Rajesh's design, Vikram's call (caps, or Ink via T-226). T-285 keep-alive merges first.
