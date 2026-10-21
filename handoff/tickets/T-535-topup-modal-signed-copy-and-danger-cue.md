# T-535: Top-up modal to signed copy, remove Popular/Best value chips, danger cue

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release |
| Owner  | Ajay (AJ-525-M4), Rajesh (danger cue), Tanvi (build) |
| Mode   | Small fix (web); MUST land before main |
| Status | In build: Tanvi (21 Oct 2026). MUST land before main. Priya |
| Source | Ajay on T-525 (78e67a74); Rajesh's T-525 review |

## Acceptance criteria
1. The top-up modal follows signed copy §4.6: "Top up Ink" title, "Buy" button, a skeleton with no copy while loading, and the GST + no-expiry note.
2. Remove the "Popular" and "Best value" chips. They break the signed t252 M1 rule ("Popular" is unsupported) and are already live on develop_staging. Check the paywall's "Best value" the same way and remove it if it is a claim.
3. Danger cue (Rajesh): "Ghost, danger" button: Rust text and Rust border (`--err`), hover background Rust Soft, no lift. Used for Close account and for Cancel plan in Settings. The filled Oxblood destructive button stays inside confirm dialogs only.
4. Existing tests updated; new tests for the signed strings and absence of the chips; Ajay byte-checks the strings.

## Files
apps/web: components/credits/**, components/billing/** (cancel plan), the Settings close-account control, the paywall component, tests. Shared button variant only if the danger variant needs it (ask Priya).
