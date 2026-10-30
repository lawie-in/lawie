# T-691b: Move the golden-set DB off production onto a fixtures cluster

Status: ASSIGNED kunal, starts next session (full chain). Spec: handoff/design/T-691b-fixture-tagging.md (Arjun, 3bf775bd). (a) run id fx-<date>-<hex> carried through run-context and stamped on every fixture write, with an invariant test; (b) a model registry so no collection can miss the plugin; (c) scripts/golden-set/cleanup.ts (dry run by default, 7-day keep, run as a Nikhil document action); (d) the nightly live golden set runs on the develop box via a Nikhil document action, never from GitHub against prod; GOLDEN_SET_MONGODB_URI is deleted once the box job is green. Founder, 30 Oct 2026: no separate cluster, tag test runs instead. Was: RESCOPED by the founder 30 Oct 2026: no separate fixtures cluster. Instead, golden-set and other test runs tag everything they write with a distinct, recognisable runId (e.g. a test prefix), so test data can be told apart from customer data and cleaned up. Arjun designs it. Was: waiting on the founder (cluster creation). Raised 30 Oct 2026 by Arjun. This settles the Atlas question from T-659.

## Why
GOLDEN_SET_MONGODB_URI points at PRODUCTION. The nightly golden set writes runType=fixture rows to prod. We will not open the prod cluster to 0.0.0.0/0 for a test job.

## Steps
1. Founder: create a free-tier fixtures cluster (e.g. "lawie-fixtures", M0) with a readWrite user on that DB only. That cluster (not prod) may allow 0.0.0.0/0.
2. Founder: point the GOLDEN_SET_MONGODB_URI secret at the new cluster. He sets the secret value himself; never in chat or docs.
3. Lead: seed what the harness needs (courts, packs) on the fixtures cluster. Confirm a nightly run is green and writes nothing to prod.
4. Until this is done, prod fixture rows are excluded from every count. That is tolerated for days, not weeks.

T-691 (A/B) does not wait for this: it runs against an ephemeral Mongo (mongodb-memory-server or a docker mongo) and never touches prod.
