# T-632: More env-print hook bypass routes (pre-existing)

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (dev tooling security, HIGH) |
| Owner  | mahak (root config), after T-633 |
| Mode   | Full chain |
| Status | To do. Raised 26 Oct 2026 from Mahak's T-593 reviewer. Priya |

## Routes to close (fail closed), each with a scripts test
- awk system() and getline pipes
- python/perl env via aliasing
- /proc paths built with an empty ${x}
- ${!name} loops
- `git -c alias.x=!...`
- `script -qc`
- jq clones (jaq, fq, python yq); jq auto-loading ~/.jq
- Look-alike (Cyrillic/Greek) letters inside secret-shape-scan labels
