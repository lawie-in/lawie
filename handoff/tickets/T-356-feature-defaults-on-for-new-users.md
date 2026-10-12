# T-356 — New users get describe-first (and the fact ledger) by default

| Field  | Value |
| ------ | ----- |
| Phase  | 1 — Describe and draft |
| Owner  | Founder (decided, 12 Oct 2026). Arjun (how). Lead (drafting) |
| Mode   | Small fix |
| Status | RELEASE GATE. Part 1 (describe-first default on): building, shashank (12 Oct 2026). Part 2 after T-187 + T-188 (Ajay signed both rules, 33af21e; vishal builds) |

Founder, 12 Oct 2026: "by default these should happen for new users." Today both switches are off unless the admin setting lists a user id or says `on`. The env fallback (`FEATURE_DEFAULT_*`, T-283) defaults to `off` and is ignored once an admin setting exists.

## Acceptance criteria

1. Part 1: `feature.describe_first` is on for every user, new and existing, in code. Default on, with no per-environment step needed. An explicit admin `off` still turns it off (kill switch).
2. Part 2: `feature.fact_ledger` gets the same default once T-187 (retention and deletion, DPDP) and T-188 (unresolved items past the question cap) are merged. Those two tickets are the only gates left; T-190, T-194, T-336, T-338 and T-341 are merged.
3. An admin setting holding a list of user ids no longer silently switches everyone else off. Arjun picks the rule (for example, the list means "also these", or the list form is retired).
4. Tests: a new user with no admin setting gets the switch on; an explicit `off` wins; part 2's ledger default stays off until its gate.

## Arjun (12 Oct 2026): AC3, the user-id list form is retired

**Rule:** a switch's admin setting is `on` or `off`, nothing else. Missing doc → the code default (env `FEATURE_DEFAULT_*`, T-283). Any other value (a legacy user-id list, a typo) is treated as missing, so it falls to the code default, and logs one warning line naming the setting (never the value: it holds user ids). Reason: "also these" keeps a per-user mechanism nobody needs once the default is on, and a list that silently turns everyone else off is the bug.
- **Part 1:** `FEATURE_DEFAULT_DESCRIBE_FIRST` default becomes `on` in `env.ts`. **Part 2:** `FEATURE_DEFAULT_FACT_LEDGER` stays `off` until T-187 and T-188 are merged, then a one-line change to `on` in its own commit, after I confirm in both files.
- Unchanged: explicit `off` wins (kill switch); a read error other than "missing" (Mongo down) stays off; the fixture user is always on.
- Tests: no doc → describe-first on, ledger off; `off` → off; a list value → code default + warning without the value; `on` → on.
- Founder/Priya: if develop or prod has a list stored in `feature.describe_first`, it now means "default"; delete it or set `on`.
