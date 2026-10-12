# T-329 — One court_levels list; price check in every generate handler

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Matter context |
| Owner  | Ajay (signs the court_levels names; packs are legal content). Lead (build) |
| Mode   | Full chain (drafting; legal content) |
| Status | To do. Unassigned. T-240 merged 6a6cd2a, so it can start |

## Acceptance criteria

1. (Was T-240 AC7.) One list of `court_levels` values. The packs use different names today (`magistrate` vs `magistrate_jmfc`, `sessions` vs `sessions_court`), more than 50 variants. Ajay signs the names, and every pack follows them.
2. (Was T-240 AC8.) Each generate handler in `documents.routes.ts` checks the price at its top, including the lines outside T-227's range, plus `enforceCredits.ts`. Raised by Shashank, 12 Oct 2026.
3. Tests for both.
