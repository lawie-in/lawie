# Drafter A/B: Opus 5.5 vs Sonnet 5.5 (T-691)

A blind test of the drafting model. Ten matters are drafted twice on the v2 pipeline, once by `claude-sonnet-5-5` and once by `claude-opus-5-5`, both at effort high. Anushka scores the drafts without knowing which model wrote which.

No model run has happened yet. Arjun reviews the harness and says go first.

## Decision rule (Arjun)

Switch a pack to Opus only if Anushka's blind score improves by one severity class or more on at least 60% of that pack's matters, AND Vikram's p95 cost stays under the cap. Otherwise stay on Sonnet and let v3 land.

Anushka's rubric: blockers, majors, minors and "would I file it". Ajay confirmed it. Blockers also include a wrong or invented citation, a repealed code cited alone, an invented fact, changed signed text, and a wrong court or cause title.

## Matters

Ten matters, two drafts each, 20 drafts in all.

| Ids    | Matter                                                                 | Source                                    |
| ------ | ---------------------------------------------------------------------- | ----------------------------------------- |
| 23, 24 | Regular bail (Patna) and anticipatory bail (Gaya), grounds argued      | `scripts/golden-set/fixtures` (read-only) |
| 39     | O.39 R.1 & 2 temporary injunction                                      | `scripts/ab/fixtures`                     |
| 40     | Quashing under s.528 BNSS                                              | `scripts/ab/fixtures`                     |
| 41-46  | Anushka's run 5: declaration, partition x2, written statement, bail x2 | `scripts/ab/fixtures`                     |

All facts are fictional. Ajay signed fixtures 39-46 (commit `ab15d5e8`). His conditions:

- Facts use placeholders (`Sample Person 1/2`, `Plot 000, Sample Nagar`). No real client data.
- For 41, 43 and 44 the court line is left out of scoring: the pipeline cannot get it right yet (T-674).
- 45 and 46 have a known pipeline gap until T-683c. Read their scores with that in mind.
- The legal reviewer is "n/a" in v2: there is no legal-reviewer call to record.

Same facts, ledger, prompts and gates for both models. Only the drafter model differs. A draft the gates withhold counts as withheld and is never re-run.

## How it runs

- The database is always an in-memory Mongo started by the script. It never reads `MONGO_URI` or `GOLDEN_SET_MONGODB_URI` and refuses any other URI.
- Intake runs once per matter. Both arms draft from the same ledger.
- The arm order is random per matter.
- Before each arm the script sets the drafter model and effort in the in-memory DB, then checks them afterwards from the `llm_call` records. A mismatch stops the run.

## How to run

Run from `apps/drafting`. Build `@lawie/shared` first.

```sh
yarn workspace @lawie/shared build
cd apps/drafting

# 1. Dry run first. Free: recorded or stub replies, no network.
yarn ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' \
  ../../scripts/ab/run-ab.ts --dry

# 2. Real run. Costs money. Only after Arjun's go.
yarn ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' \
  ../../scripts/ab/run-ab.ts --real
```

Other options: `--matters <id,...>`, `--out <dir>`, `--max-tokens <n>`, `--verbose`, and `--seed <n>` (dry only).

In a dry run only matters 23 and 24 have recorded replies. Matters 39-46 show as NOT PRODUCED. That is expected.

`--real` is refused unless all three of these are set in the environment (set them yourself; never paste values into chat, docs or the command line):

- `AB_ARJUN_GO=1`: Arjun's go.
- `GOLDEN_SET_ANTHROPIC_API_KEY`: the model key.
- `AB_KEY_PASSPHRASE`: Arjun's passphrase for the key, at least 12 characters.

`--seed` is refused with `--real`: a real run draws its order from crypto.

### Cost guards

Cap: ₹600 at ₹88 per dollar (Vikram).

- Up front (`--real` only): the run is refused if the typical estimate is over the cap.
- Up front (`--real` only): the run is refused if one matter's worst case alone is over the cap.
- Before a matter (`--real` only): stop if spend so far plus that matter's worst case (computed by `estimateAb` in `run-ab.ts`) would pass the cap.
- After a matter: stop once the running total has passed the cap. The code does not check the mode here, so it applies to a dry run too (a dry run's stub token counts are not billed, and the console says the cap is not applied to a dry run).

Exit codes: 0 done; 1 a cap stopped the run, or an arm's model, effort or ledger was not as forced; 2 refused; 3 fixture isolation breached; 4 harness error.

## Output

`scripts/ab/out/<stamp>/` (git-ignored; nothing in `out/` is ever committed):

| Path                         | What                                                                                                                                                                               | Who sees it                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `scoring/D01.md` .. `D20.md` | The blind drafts in random order: the facts given and the delivered text (or "WITHHELD" and the reason code). No model, tokens, cost or timing.                                    | Anushka, Ajay (forwarded by the runner) |
| `vikram/metrics.json`        | Per draft, under M-ids unrelated to the D-ids: tokens, cost, spend, fact-checker findings (`factDiffs`).                                                                           | Vikram                                  |
| `vikram/intake-spend.json`   | Intake spend per matter, shuffled, with no ids.                                                                                                                                    | Vikram                                  |
| `KEY.sealed.json`            | Maps D-id to model, fixture and run; the M-id map; placeholders; withheld flags; intake; the two shuffle seeds. AES-256-GCM under Arjun's passphrase.                              | Arjun                                   |
| console output               | Ids, counts, amounts and paths only: the estimate, per-matter totals, the running total, token totals, warnings and output paths. Never per-arm amounts, model names or blind ids. | Vikram (the cost lines only)            |

At the end of a run the harness prints the SHA-256 of KEY.sealed.json to the console; Arjun compares it to the file he receives to confirm it was not altered.

A `--dry` run without `AB_KEY_PASSPHRASE` seals its key under a random throwaway passphrase that cannot be recovered. Dry keys are for checking the layout only.

The console and logs carry ids and amounts only, never document content, the arm, the run order or the passphrase.

## Operator

The runner is Shashank. He runs `--real` once with AB_ARJUN_GO=1, never opens scoring/, vikram/ or the key file, and forwards: scoring/ (drafts only, model hidden, random order) to Anushka and Ajay; vikram/ + the console cost lines to Vikram; the key file to Arjun. The holding rule (nobody holds any two of scoring, costs, key) binds the recipients until Arjun opens the key after Anushka's and Ajay's scores are in. If Shashank must open any artefact to debug a failed run, he says so in the ticket and the run is void.

This is Arjun's two-strike ruling, recorded in the T-691 ticket.

## HAND-OFF RULES (mandatory)

1. ONLY `out/<stamp>/scoring/` goes to Anushka for blind scoring, and to Ajay for his citation check. The runner forwards it (see Operator).
2. The runner forwards and never opens anything. `scoring/` goes to Anushka and Ajay; `vikram/` and the console cost lines go to Vikram; the key file goes to Arjun.
3. The holding rule: nobody holds any two of scoring, costs, key. It binds the recipients until Arjun opens the key after Anushka's and Ajay's scores are in.
   - Someone with both `scoring/` and `vikram/` can match metrics rows to drafts by output length.
   - The console's per-matter totals together with `vikram/` can group metrics rows into matters by their sum.
4. Nobody who holds `vikram/` or the console output scores drafts or checks citations.
5. Order: Anushka scores, and Ajay sends his citation findings, BEFORE Arjun opens the key (Ajay's condition).
6. A withheld draft counts as withheld and is never re-run.
7. No document content in logs beyond ids. Nothing in `out/` is ever committed.

## Opening the key (Arjun)

`unseal(path, passphrase)` in `scripts/ab/blind-writer.ts` decrypts `KEY.sealed.json` and returns the full map. It throws on a wrong passphrase or a changed file. The passphrase comes from the environment (`AB_KEY_PASSPHRASE`), never from a command-line argument. There is no unseal command yet; call the function from a small script. Do it only after Anushka's scores and Ajay's citation findings are in.

## For Vikram

`vikram/metrics.json` has, per draft, tokens (input, output, cache read, cache creation) and two costs in dollars:

- `raw`: body calls at the model's own rates, with cache classes at their own rates.
- `uncachedEquivalent`: the same tokens with every cached token priced as plain input.

It also has the draft's spend in $ and ₹ and its `factDiffs`. Rates are Vikram's 29 Oct figures. Intake runs once per matter at the intake model's rates and is in `intake-spend.json`, not in either draft's cost. The arms are interleaved and their order is random, as Arjun ruled.

## Prod

The A/B never touches the prod DB, by design (Arjun, 30 Oct 2026). The database is an ephemeral in-memory Mongo and the fixtures are self-contained. Moving the nightly golden set off prod is a separate job (T-691b).
