# T-428: lower-court bail case lines (Ajay's T-426)

| Field  | Value                                                                    |
| ------ | ------------------------------------------------------------------------ |
| Status | Merged into develop_staging 3649e73b (Shashank, 14 Oct 2026). Priya     |
| Owner  | Shashank (build), Ajay (signed 2fcf6c4)                                  |
| Mode   | Small fix (legal content: court-rules data; Ajay's text only)            |

## Acceptance criteria

1. In the 35 lower-court files under apps/drafting/src/config/court-rules/ (33 *_district files incl. district_court_generic, plus sessions_generic, cjm_generic, jmfc_generic), case_nomenclature.regular_bail, .anticipatory_bail and .default_bail are set to Ajay's signed lines (T-426, 2fcf6c4), byte for byte. Nothing else in those files changes.
2. High Court and Supreme Court files are untouched (T-427).
3. Golden/court-rules snapshot moves are only these lines; Ajay signs them.
4. Before Tanvi's T-425 (picker filter) touches the same files; T-425 merges these in.

5. Also (Ajay T-427, 03b3e6e): Jharkhand HC anticipatory "A.B.A. No.", regular generic; Allahabad anticipatory "Criminal Misc. Anticipatory Bail Application U/S 482 BNSS No."; high_court_generic the case-type blank. Patna unchanged.
