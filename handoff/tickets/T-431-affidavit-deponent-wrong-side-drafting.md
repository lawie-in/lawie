# T-431: counter and rejoinder affidavit drafts may name the wrong deponent

| Field  | Value                                                              |
| ------ | ------------------------------------------------------------------ |
| Status | Assigned to Mahak, Explore 15 Oct 2026 (files to Priya). Priya     |
| Owner  | Mahak (build), Ajay (side rule, T-381 Addendum 5 04c1630)          |
| Mode   | Small fix unless Explore finds more (legal content: party mapping) |

## Problem

Found by Mahak during T-424 (14 Oct 2026); to confirm in Explore. On the drafting path, apps/drafting/src/services/template-engine.service.ts ~:1843 fills {deponent_name} from applicant_name for counter_affidavit and rejoinder_affidavit drafts, so the deponent can be the wrong side, the same issue T-424 fixes for the annexures Memo.

## Acceptance criteria

1. Confirm whether the drafting path names the wrong deponent on these two packs.
2. If it does: the deponent comes from the same resolver as T-424 (brief-party-fields.ts: client_role, then the signed row, then refuse), never from applicant_name first.
3. Tests for both packs, both sides. Ajay signs.

## Arjun (15 Oct 2026, 02:45 UTC) — scope ruling after Mahak's Explore

**Option (b), V1 must-fix, narrowed.** An affidavit sworn by the wrong side is a defective filing, and Anushka (a lawyer) will swear one in her run. Closing AC2 as "not applicable" would leave the drafting path with no deponent rule at all while the annexures path has one; that is the same bug T-424 fixed, in the place a user actually reaches it.

What (b) means here, and no more:

1. In `ai.service.ts`, on both drafting paths (template form ~727, brief ~1294-1309), for `SIDED_PACKS` only: run the T-424 resolver (`brief-party-fields.ts`: `client_role`, then the signed row, then refuse) before the prompt is assembled, and pass its result into the facts the model sees as `deponent_name` / `client_side`. A raw client-sent `deponent_name` or `client_side` is stripped on the template-form path first, as T-424 does for annexures.
2. The refuse rule is the same refuse as T-424 (no guessing a side; the draft stops with the T-424 message). No new wording.
3. `template-engine.service.ts` ~1950/1988: leave the `applicant_name` read in place only where the pack is not sided; for `SIDED_PACKS` read the resolved value. If Explore is right that these lines do not reach the two packs' output today, change them anyway so a future verification template cannot regress, and say so in the report.
4. The model-written verification for `counter_affidavit` and `rejoinder_affidavit` is pinned by a system-prompt line stating the deponent by name and side, taken from the resolver output. That line is legal content; Ajay signs it with the rest (T-381 Addendum 5 is the side rule; this needs one addendum naming the two packs and the line).
5. Out of scope: a verification template for the two packs (park, V1.1), any change to non-sided packs, and T-441's prompt work (Vishal). `ai.service.ts` is free since T-245a merged; Priya, claim it for Mahak with `brief-party-fields.ts` (read-only use; if a change there is needed, say so and I will look), `template-engine.service.ts` at the two line ranges, and the tests.

Mode: full chain (legal content, two services' worth of paths in one file). Tests per AC3: both packs, both sides, plus "raw deponent_name from the client is ignored" and "no side → refuse" on each drafting path.

Priya: Mahak takes this now rather than the next ticket; it is smaller than it reads because the resolver exists. If the refuse rule stops a draft Anushka would otherwise get, that is correct behaviour, and the message tells her what to fill.

## Arjun (15 Oct 2026, 03:30 UTC) — entity deponent gap: option (a)

Mahak found that `parties.deponent_designation` reaches the context only as a dotted key and the two packs' prompt_context has no placeholder for it, so a typed officer designation is not passed to the model and the draft leaves a blank. Ruling: accept for V1. A visible, accurate blank under Ajay's deponent line is correct; nothing is invented. Parked (V1.1, with the verification template): "entity-aware deponent and verification" — pass the typed designation through a prompt placeholder, Ajay signs the addendum. No form change needed; the value is already collected. Not blocking; chain continues to tester.
