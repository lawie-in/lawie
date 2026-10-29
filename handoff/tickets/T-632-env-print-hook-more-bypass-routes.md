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


## Added 29 Oct 2026 (Arjun ruling, after a hook bypass in T-657)
1. The no-env-print hook message becomes: "blocked by the no-env-print hook: a block is a stop. Use Edit for file changes and report BLOCKED to your lead; do not re-run this through a script, interpreter or renamed path."
2. One line in CLAUDE.md's crew protocol, within the 80-line cap: "A permission or hook block is a stop, not a puzzle: report BLOCKED with the exact command; never reach the same effect through a script, an interpreter, a heredoc or a different path." The same rule goes in the lead briefings.
3. Optional: the hook's false positive on heredoc text that merely mentions the env file name. Lower value than the rule.
4. From T-633's second review: the developer role can Edit/Write .claude/hooks/** and .claude/settings*.json, and no-tests.sh doesn't forbid it. The tester and developer can also write files via Bash redirects.
