# T-631: Dashboard box shows the 4,000-character limit; server message wording

| Field  | Value |
| ------ | ----- |
| Phase  | 5 — Polish |
| Owner  | a lead (web) |
| Mode   | Small fix; Rajesh gate (visible); Ajay for copy |
| Status | To do. Raised 26 Oct 2026 from Mahak's T-608 review. Priya |

## Acceptance criteria
1. The shell CommandBar input gets maxLength 4000, or a counter per Rajesh's design.
2. The server message "under 4000 characters" is corrected (exactly 4,000 is allowed); Ajay signs.
3. Optional: cap before Array.from in the draftPrefill writer.
