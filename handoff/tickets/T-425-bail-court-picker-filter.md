# T-425: court picker offers only courts where the bail pack lies

| Field  | Value                                                                  |
| ------ | ---------------------------------------------------------------------- |
| Status | Todo. Tanvi, after T-411 (holds CourtPicker.tsx, courts.routes.ts). Priya, 14 Oct 2026 |
| Owner  | Tanvi (build), Ajay (rule, 477fcaa)                                    |
| Mode   | Small fix (web + courts route) unless Explore finds more than one service |

## Acceptance criteria (Ajay, 477fcaa)

1. For bail_anticipatory, the court picker offers no CJM/JMFC (Magistrate) court; only Sessions courts and the High Court (s.482 BNSS, old s.438 CrPC).
2. For every bail pack, the picker offers no Consumer Commission.
3. A draft that already has a disallowed court is not silently changed; the picker shows the allowed list on the next edit.
4. Tests pin both rules.
